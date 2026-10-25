"""Round-trip savers for the bulk reads behind payroll and the reports.

Measured against the real data, the database spends milliseconds per query;
what costs seconds is the NUMBER of sequential round trips, because every call
pays network latency. Two fixes live here:

* fetch_all_paged — a response is capped at 1000 rows, so a month of punches
  (~6k rows) used to take 7-8 calls back to back. The first call now also
  returns the exact row count, and every remaining page is fetched at once:
  two round trips however long the table grows. It also gives the pages a
  fixed ORDER, which offset paging needs: without one, Postgres may return rows
  in a different order on each call and a page can repeat or skip rows.
* ContextThreadPoolExecutor — worker threads don't inherit the request's
  context, so under HA routing (ha.py) each thread lost the request's database
  pin and did its own routing lookup against the cloud database. This pool
  hands every task a copy of the submitting thread's context.
"""

import contextvars
from concurrent.futures import ThreadPoolExecutor

from postgrest.exceptions import APIError

from database import supabase

PAGE_SIZE = 1000  # the most rows PostgREST returns in one response
MAX_PAGE_WORKERS = 6  # callers already run inside pools; httpx allows 100 connections


class ContextThreadPoolExecutor(ThreadPoolExecutor):
    """ThreadPoolExecutor whose tasks run in a copy of the submitter's context
    (each task gets its own copy: one Context can't be entered by two threads)."""

    def submit(self, fn, /, *args, **kwargs):
        return super().submit(contextvars.copy_context().run, fn, *args, **kwargs)


def _page(build, offset: int, size: int) -> list[dict]:
    try:
        return build().range(offset, offset + size - 1).execute().data or []
    except APIError as exc:
        # 416 / PGRST103: the table shrank between the count and this page.
        if getattr(exc, "code", None) == "PGRST103":
            return []
        raise


def fetch_all_paged(table: str, columns: str, order: tuple[str, ...], apply=lambda q: q,
                    page_size: int = PAGE_SIZE, max_workers: int = MAX_PAGE_WORKERS) -> list[dict]:
    """Every row of `table` matching `apply(query)`, as one list.

    `order` must be a total order (end it with a unique column or a unique
    combination) so that offset pages never overlap or leave gaps. `apply`
    adds the caller's filters to the query builder."""

    def build():
        q = apply(supabase.table(table).select(columns, count="exact"))
        for column in order:
            q = q.order(column)
        return q

    first = build().range(0, page_size - 1).execute()
    rows = list(first.data or [])
    total = first.count
    # The server may cap a response below page_size (PostgREST's max-rows is a
    # server setting). The exact count, when present, is the authority on whether
    # more rows exist, and the rows actually returned are the real page size.
    if total is not None:
        if total <= len(rows) or not rows:
            return rows
        page_size = len(rows)
    elif len(rows) < page_size:
        return rows
    if total is None:  # count unavailable: fall back to one page at a time
        offset = len(rows)
        while True:
            batch = _page(build, offset, page_size)
            rows.extend(batch)
            if len(batch) < page_size:
                return rows
            offset += page_size
    offsets = list(range(page_size, total, page_size))
    with ContextThreadPoolExecutor(max_workers=min(max_workers, len(offsets))) as pool:
        for batch in pool.map(lambda o: _page(build, o, page_size), offsets):
            rows.extend(batch)
    return rows
