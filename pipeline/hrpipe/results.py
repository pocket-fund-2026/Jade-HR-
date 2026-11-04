"""Result passing: turn a job's printed summary into structured facts the next job (and the status view) can use.
Pure functions, no I/O. A job declares `parse=[regex, ...]` with named groups; the LAST match of each regex in the output wins
(summary lines are printed at the end), numbers become ints, true/false become bools."""
import re


def _conv(v):
    if v is None:
        return None
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    return {"True": True, "False": False, "true": True, "false": False}.get(v, v)


def parse(job, text):
    out = {}
    for rx in job.get("parse") or []:
        last = None
        for m in re.finditer(rx, text or ""):
            last = m
        if last:
            out.update({k: _conv(v) for k, v in last.groupdict().items()})
    return out
