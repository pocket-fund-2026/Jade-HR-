from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

import email_service
from auth import get_current_user, require_permission, user_can
from database import maybe_single_data, supabase
from models import CompOffGrant, LeaveRequestCreate, LeaveResolve
from payroll import apply_late_coming_policy, compute_daily_attendance, pay_period_bounds

router = APIRouter(prefix="/api", tags=["leave"])

# Jul 2026 policy: Casual/Sick/Earned are discontinued as separate leave
# types, replaced company-wide (corporate and factory/retail alike) by one
# unified Paid Leave pool — 24/yr, accrued 2/mo same as the old 'earned'
# formula (_pl_accrued_to_date), gated for the first 3 months of employment.
# Unused balance carries into the next calendar year up to a location cap;
# anything beyond the cap expires (see _carry_forward_cap/get_carried_forward
# below). 'casual'/'sick'/'earned' remain valid historical leave_type values
# (old requests still display correctly) but are no longer offered for new
# requests — DEPRECATED_LEAVE_TYPES / MERGED_PAID_LEAVE_TYPES below exist so
# a transition-year employee's usage already booked under an old type label
# still draws down the same unified pool, rather than getting a second,
# double-counted allocation under 'paid'.
PAID_LEAVE_ANNUAL_CAP = 24
PAID_LEAVE_POLICY_START_YEAR = 2026  # first leave_year the carry-forward pool exists; no prior pool to carry in
CARRY_FORWARD_CAP_HQ = 15
CARRY_FORWARD_CAP_RETAIL = 7
HQ_LOCATION = "Madhu Estate, Mumbai"  # exact-match convention already used for holidays (payroll.py's _holiday_applies)
PATERNITY_ALLOCATION = 3
DEPRECATED_LEAVE_TYPES = ("casual", "sick", "earned")
MERGED_PAID_LEAVE_TYPES = ("paid",) + DEPRECATED_LEAVE_TYPES
CORPORATE_ONLY_TYPES = {"paternity", "maternity", "compassionate", "comp_off"}
PL_PROBATION_DAYS = 91  # ~3 months
# Late-coming policy (revised Jul 2026): a Red Card month (5+ late marks)
# blocks new PL/Comp-Off requests entirely, not just the leave-day-becomes-
# LOP consequence in payroll.py's apply_late_coming_policy. Management's
# documented-exception override is the employee_id-on-behalf-of path below.
RED_CARD_BLOCKED_TYPES = {"paid", "comp_off"}
COMP_OFF_MAX_DAYS_PER_REQUEST = 2
COMP_OFF_VALIDITY_DAYS = 90  # a comp-off must be used within 90 days of the earned date


def _carry_forward_cap(location: str | None) -> float:
    return CARRY_FORWARD_CAP_HQ if location == HQ_LOCATION else CARRY_FORWARD_CAP_RETAIL


def _compute_carry_forward(prior_carried_forward: float, prior_accrued: float, prior_used: float, cap: float) -> float:
    """Pure math for how much of a prior leave-year's unused Paid Leave
    carries into the next year: whatever's left (never negative), capped by
    location. Split out from get_carried_forward's DB read/write so this —
    the actual money-relevant formula — is unit-testable without a live
    Supabase connection, matching this codebase's existing test style."""
    prior_remaining = max(0.0, prior_carried_forward + prior_accrued - prior_used)
    return round(min(prior_remaining, cap), 2)


def _paid_leave_used(employee_id: str, year: int, as_of: date | None = None) -> float:
    """Approved-leave days this calendar year across every merged paid-leave
    type label (see MERGED_PAID_LEAVE_TYPES) — not just 'paid' — so a
    transition-year employee's casual/sick/earned usage still draws down the
    same unified pool instead of getting counted twice."""
    resp = (
        supabase.table("hr_leave_requests")
        .select("start_date,end_date")
        .eq("employee_id", employee_id)
        .in_("leave_type", list(MERGED_PAID_LEAVE_TYPES))
        .eq("status", "approved")
        .gte("start_date", f"{year}-01-01")
        .lte("start_date", (as_of or date(year, 12, 31)).isoformat())
        .execute()
    )
    return sum(_days_in_range(r["start_date"], r["end_date"]) for r in resp.data)


def get_carried_forward(employee: dict, year: int) -> float:
    """Locked opening carry-forward for one employee's leave_year, persisted
    in hr_leave_balances the first time this year is ever read (so it can't
    silently drift later if an old year's requests are edited). Recurses one
    year at a time back to PAID_LEAVE_POLICY_START_YEAR, the base case with
    no prior pool to carry from."""
    if year <= PAID_LEAVE_POLICY_START_YEAR:
        return 0.0

    existing = (
        supabase.table("hr_leave_balances")
        .select("carried_forward")
        .eq("employee_id", employee["id"])
        .eq("leave_year", year)
        .maybe_single()
        .execute()
    )
    row = maybe_single_data(existing)
    if row is not None:
        return float(row["carried_forward"])

    prior_carried_forward = get_carried_forward(employee, year - 1)
    prior_accrued = _pl_accrued_to_date(employee.get("date_of_joining"), date(year - 1, 12, 31), year - 1)
    prior_used = _paid_leave_used(employee["id"], year - 1)
    carried_forward = _compute_carry_forward(
        prior_carried_forward, prior_accrued, prior_used, _carry_forward_cap(employee.get("location")),
    )

    # Don't lock this in until the prior leave-year has actually finished —
    # e.g. a Full & Final settlement for someone with a 2027 scheduled exit
    # date, computed today in mid-2026, must not freeze a carry-forward
    # derived from an incomplete 2026 (still-accruing, still-usable) balance.
    # Keep recomputing live on every call until the year is genuinely over,
    # then lock it exactly once.
    if date.today() <= date(year - 1, 12, 31):
        return carried_forward

    inserted = (
        supabase.table("hr_leave_balances")
        .upsert(
            {"employee_id": employee["id"], "leave_year": year, "carried_forward": carried_forward},
            on_conflict="employee_id,leave_year",
        )
        .execute()
    )
    return float(inserted.data[0]["carried_forward"]) if inserted.data else carried_forward


def paid_leave_allocated_to_date(employee: dict, as_of: date) -> float:
    """This leave-year's running Paid Leave entitlement as of a date: last
    year's locked carry-forward, plus this year's accrual to date (2/mo,
    capped 24/yr — same formula the old corporate-only 'earned' policy used,
    now applied company-wide)."""
    return get_carried_forward(employee, as_of.year) + _pl_accrued_to_date(employee.get("date_of_joining"), as_of, as_of.year)


def paid_leave_balance_as_of(employee: dict, as_of: date) -> float:
    """Unused Paid Leave balance as of a specific date — used for Full &
    Final leave encashment and the Leave Ledger Report's opening balance.
    Replaces the old earned-only calculation now that Casual/Sick/Earned
    are merged into this one pool."""
    allocated = paid_leave_allocated_to_date(employee, as_of)
    used = _paid_leave_used(employee["id"], as_of.year, as_of)
    return max(0.0, round(allocated - used, 2))


def _days_in_range(start: str, end: str) -> int:
    return (date.fromisoformat(end) - date.fromisoformat(start)).days + 1


def _pl_accrued_to_date(date_of_joining: str | None, today: date, year: int) -> int:
    """2 days/month, capped at 24/yr, pro-rated from date of joining (or Jan 1
    if joined in an earlier year). Fully accrued once the year is in the past."""
    accrual_start = date(year, 1, 1)
    if date_of_joining:
        doj = date.fromisoformat(date_of_joining)
        if doj.year == year:
            accrual_start = doj
        elif doj.year > year:
            return 0
    reference = date(year, 12, 31) if year < today.year else min(today, date(year, 12, 31))
    if reference < accrual_start:
        return 0
    months_elapsed = (reference.year - accrual_start.year) * 12 + reference.month - accrual_start.month + 1
    return min(24, max(0, months_elapsed) * 2)


def _comp_off_available(employee_id: str) -> float:
    today_iso = datetime.now(timezone.utc).date().isoformat()
    resp = (
        supabase.table("hr_comp_off_ledger")
        .select("units")
        .eq("employee_id", employee_id)
        .eq("status", "available")
        .gte("expiry_date", today_iso)
        .execute()
    )
    return sum(float(r["units"]) for r in resp.data)


def _consume_comp_off(employee_id: str, days_needed: float, leave_request_id: str) -> bool:
    """FIFO by expiry date. Returns False (consuming nothing) if the balance
    isn't actually there any more — caller must not approve in that case."""
    today_iso = datetime.now(timezone.utc).date().isoformat()
    resp = (
        supabase.table("hr_comp_off_ledger")
        .select("id,units")
        .eq("employee_id", employee_id)
        .eq("status", "available")
        .gte("expiry_date", today_iso)
        .order("expiry_date")
        .execute()
    )
    if sum(float(r["units"]) for r in resp.data) < days_needed - 1e-9:
        return False
    remaining = days_needed
    consumed_ids = []
    for entry in resp.data:
        if remaining <= 1e-9:
            break
        consumed_ids.append(entry["id"])
        remaining -= float(entry["units"])
    # Every consumed row gets the identical update — one batched call
    # instead of one round-trip per ledger entry.
    if consumed_ids:
        supabase.table("hr_comp_off_ledger").update({
            "status": "used", "used_in_leave_request_id": leave_request_id,
        }).in_("id", consumed_ids).execute()
    return True


def _current_pay_period(today: date) -> tuple[int, int]:
    """Which (year, month) pay-period label today's date falls in — periods
    run 23rd(prev month) to 22nd(this month). Kept local (rather than shared
    with routers/reports.py's identical _pay_period_for_date) to avoid a
    circular import — routers/payroll.py already imports from this module."""
    if today.day <= 22:
        return today.year, today.month
    month, year = today.month + 1, today.year
    if month > 12:
        month, year = 1, year + 1
    return year, month


def _is_red_carded_current_cycle(employee: dict) -> bool:
    """Whether `employee` has already hit 5+ late marks in the pay period
    currently in progress — re-runs the same late-coming-policy computation
    payroll.py uses for a real payslip, just for the partial period to date
    (days after today compute as status "future" and never count as late)."""
    if employee.get("employee_category") != "corporate":
        return False
    year, month = _current_pay_period(date.today())
    period_start, period_end = pay_period_bounds(year, month)
    punches_resp = (
        supabase.table("hr_biometric_punches")
        .select("punch_time")
        .eq("employee_code", employee["employee_code"])
        .gte("punch_time", f"{period_start.isoformat()}T00:00:00+00:00")
        .lte("punch_time", f"{period_end.isoformat()}T23:59:59+00:00")
        .execute()
    )
    punches = [datetime.fromisoformat(r["punch_time"]) for r in punches_resp.data]
    profile_resp = (
        supabase.table("hr_employee_profile").select("time_slot").eq("employee_id", employee["id"]).maybe_single().execute()
    )
    time_slot = (maybe_single_data(profile_resp) or {}).get("time_slot")
    standard_hours = float(employee.get("standard_hours_per_day") or 8)
    weekly_off_day = int(employee.get("weekly_off_day") if employee.get("weekly_off_day") is not None else 6)
    leaves = fetch_approved_leaves(employee["id"], year, month)
    daily = compute_daily_attendance(
        year, month, punches, standard_hours, leaves=leaves, weekly_off_day=weekly_off_day,
        is_corporate=True, time_slot=time_slot,
    )
    _, red_card = apply_late_coming_policy(daily, standard_hours, time_slot)
    return red_card


@router.post("/me/leave-requests")
def create_leave_request(body: LeaveRequestCreate, user: dict = Depends(get_current_user)):
    if body.end_date < body.start_date:
        raise HTTPException(status_code=400, detail="End date must be on or after start date")

    filed_by_hr = body.employee_id is not None and body.employee_id != user["id"]
    if filed_by_hr:
        if not user_can(user, "leave.manage"):
            raise HTTPException(status_code=403, detail="Not authorized to file a leave request for another employee")
        target_resp = supabase.table("hr_employees").select("*").eq("id", body.employee_id).maybe_single().execute()
        target = maybe_single_data(target_resp)
        if not target or not target["is_active"]:
            raise HTTPException(status_code=404, detail="Employee not found")
    else:
        target = user

    is_corporate = target.get("employee_category") == "corporate"
    requested_days = _days_in_range(body.start_date.isoformat(), body.end_date.isoformat())

    if body.leave_type in DEPRECATED_LEAVE_TYPES:
        raise HTTPException(status_code=400, detail="This leave type is no longer offered — use Paid Leave instead")

    if body.leave_type in CORPORATE_ONLY_TYPES and not is_corporate:
        raise HTTPException(status_code=403, detail="This leave type is only available to corporate staff")

    # Red Card block only applies to the employee's own self-service
    # submission — HR filing on their behalf (filed_by_hr) IS the documented
    # management exception the policy allows for, so it bypasses this check.
    if not filed_by_hr and body.leave_type in RED_CARD_BLOCKED_TYPES and _is_red_carded_current_cycle(target):
        raise HTTPException(
            status_code=400,
            detail=(
                "You've had 5 or more late arrivals this pay cycle (Red Card) — Paid Leave and Comp-Off "
                "requests are blocked until the cycle resets on the 23rd. For a documented medical emergency "
                "or an approved management exception, contact HR."
            ),
        )

    if body.leave_type == "paid":
        doj = target.get("date_of_joining")
        if doj and (date.today() - date.fromisoformat(doj)).days < PL_PROBATION_DAYS:
            raise HTTPException(
                status_code=400,
                detail="Paid Leave is available after 3 months from date of joining",
            )
        remaining = paid_leave_balance_as_of(target, date.today())
        if requested_days > remaining:
            raise HTTPException(status_code=400, detail=f"Not enough Paid Leave balance — {remaining} day(s) remaining")

    if body.leave_type == "comp_off":
        if requested_days > COMP_OFF_MAX_DAYS_PER_REQUEST:
            raise HTTPException(status_code=400, detail=f"Comp-Off requests can cover at most {COMP_OFF_MAX_DAYS_PER_REQUEST} days")
        if _comp_off_available(target["id"]) < requested_days:
            raise HTTPException(status_code=400, detail="Not enough available Comp-Off balance")

    reason = body.reason
    if filed_by_hr:
        filer_name = f"{user['first_name']} {user.get('last_name', '')}".strip()
        reason = f"[Filed by {filer_name} (HR) — Red Card exception] {reason}"

    row = {
        "employee_id": target["id"],
        "leave_type": body.leave_type,
        "start_date": body.start_date.isoformat(),
        "end_date": body.end_date.isoformat(),
        "reason": reason,
    }
    inserted = supabase.table("hr_leave_requests").insert(row).execute()

    approver_ids = set()
    if target.get("leave_approver_id"):
        approver_ids.add(target["leave_approver_id"])
    profile_resp = supabase.table("hr_employee_profile").select("reporting_to_id").eq("employee_id", target["id"]).maybe_single().execute()
    profile = maybe_single_data(profile_resp)
    if profile and profile.get("reporting_to_id"):
        approver_ids.add(profile["reporting_to_id"])
    approver_emails = set()
    if approver_ids:
        approvers_resp = supabase.table("hr_employees").select("email").in_("id", list(approver_ids)).execute()
        approver_emails = {a["email"] for a in approvers_resp.data if a.get("email")}
    employee_name = f"{target['first_name']} {target.get('last_name', '')}".strip()
    email_service.notify_leave_submitted(
        employee_name, body.leave_type, body.start_date.isoformat(), body.end_date.isoformat(), reason,
        approver_emails, email_service.HR_NOTIFY_EMAIL,
    )

    return inserted.data[0]


@router.get("/me/leave-requests")
def my_leave_requests(user: dict = Depends(get_current_user)):
    resp = (
        supabase.table("hr_leave_requests")
        .select("*")
        .eq("employee_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    # Mark resolved requests as seen the moment the employee views this list.
    unseen_resolved = [r["id"] for r in resp.data if r["status"] != "pending" and not r["seen_by_employee"]]
    if unseen_resolved:
        supabase.table("hr_leave_requests").update({"seen_by_employee": True}).in_("id", unseen_resolved).execute()
    return resp.data


def _pl_ledger_from_rows(employee: dict, year: int, month: int, leave_rows: list[dict]) -> dict:
    """Pure computation half of the Paid Leave ledger, given this employee's
    already-fetched approved leave rows (start_date/end_date, any merged
    type — see MERGED_PAID_LEAVE_TYPES) covering at least day-before-period-
    start through period-end. Split out so the bulk path
    (pl_ledger_for_period_bulk) can fetch once for every employee instead of
    once per employee."""
    doj = employee.get("date_of_joining")
    location = employee.get("location")
    period_start, period_end = pay_period_bounds(year, month)
    day_before_start = period_start - timedelta(days=1)

    accrued_at_start = _pl_accrued_to_date(doj, day_before_start, day_before_start.year)
    accrued_at_end = _pl_accrued_to_date(doj, period_end, period_end.year)
    carry_at_start = get_carried_forward(employee, day_before_start.year) if day_before_start.year > PAID_LEAVE_POLICY_START_YEAR else 0.0
    carry_at_end = get_carried_forward(employee, period_end.year) if period_end.year > PAID_LEAVE_POLICY_START_YEAR else 0.0
    credit = max(0, (accrued_at_end + carry_at_end) - (accrued_at_start + carry_at_start))

    used_before = used_within = 0
    for r in leave_rows:
        days = _days_in_range(r["start_date"], r["end_date"])
        if r["start_date"] < period_start.isoformat():
            used_before += days
        else:
            used_within += days

    opening = accrued_at_start + carry_at_start - used_before
    debit = used_within
    closing = opening + credit - debit
    return {"opening": opening, "debit": debit, "credit": credit, "closing": closing}


def pl_ledger_for_period(employee: dict, year: int, month: int) -> dict:
    """Opening/Debit/Credit/Closing for Paid Leave over one pay period — the
    leave-ledger row on the printed payslip. Company-wide since the Jul 2026
    merge (previously corporate-roster only).

    Known limitation: like my_leave_balance, this doesn't perfectly reconcile
    across the Dec23-Jan22 pay period specifically (the one period that
    straddles Jan 1 — both the accrual-year AND the leave-year carry-forward
    roll over mid-period) — an employee's ledger is fully accurate every
    month except that one, same caveat as before the merge.

    Single-employee path — does its own query. For a list of employees, use
    pl_ledger_for_period_bulk instead (one query for everyone, not N)."""
    period_start, period_end = pay_period_bounds(year, month)
    day_before_start = period_start - timedelta(days=1)
    resp = (
        supabase.table("hr_leave_requests")
        .select("start_date,end_date")
        .eq("employee_id", employee["id"])
        .in_("leave_type", list(MERGED_PAID_LEAVE_TYPES))
        .eq("status", "approved")
        .gte("start_date", f"{day_before_start.year}-01-01")
        .lte("start_date", period_end.isoformat())
        .execute()
    )
    return _pl_ledger_from_rows(employee, year, month, resp.data)


def pl_ledger_for_period_bulk(employees: list[dict], year: int, month: int) -> dict[str, dict]:
    """Same as pl_ledger_for_period, for every employee in one request — one
    bulk query instead of one-per-employee (this is what /api/payroll, which
    already bulk-fetches punches/overrides/leaves the same way, must use;
    N sequential per-employee queries here was the dominant cost of that
    endpoint for a 200+ employee roster)."""
    if not employees:
        return {}

    period_start, period_end = pay_period_bounds(year, month)
    day_before_start = period_start - timedelta(days=1)
    employee_ids = [e["id"] for e in employees]
    resp = (
        supabase.table("hr_leave_requests")
        .select("employee_id,start_date,end_date")
        .in_("employee_id", employee_ids)
        .in_("leave_type", list(MERGED_PAID_LEAVE_TYPES))
        .eq("status", "approved")
        .gte("start_date", f"{day_before_start.year}-01-01")
        .lte("start_date", period_end.isoformat())
        .execute()
    )
    rows_by_employee: dict[str, list[dict]] = defaultdict(list)
    for r in resp.data:
        rows_by_employee[r["employee_id"]].append(r)

    return {e["id"]: _pl_ledger_from_rows(e, year, month, rows_by_employee.get(e["id"], [])) for e in employees}


@router.get("/me/leave-balance")
def my_leave_balance(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date()
    year = today.year
    is_corporate = user.get("employee_category") == "corporate"

    allocated = paid_leave_allocated_to_date(user, today)
    carried_forward = get_carried_forward(user, year)
    used_paid = _paid_leave_used(user["id"], year, today)

    balances = [{
        "leave_type": "paid",
        "allocated": round(allocated, 2),
        "carried_forward": round(carried_forward, 2),
        "used": used_paid,
        "remaining": round(max(0.0, allocated - used_paid), 2),
    }]

    resp = (
        supabase.table("hr_leave_requests")
        .select("leave_type,start_date,end_date")
        .eq("employee_id", user["id"])
        .eq("status", "approved")
        .gte("start_date", f"{year}-01-01")
        .lte("start_date", f"{year}-12-31")
        .execute()
    )
    used = defaultdict(int)
    for r in resp.data:
        used[r["leave_type"]] += _days_in_range(r["start_date"], r["end_date"])

    if is_corporate:
        pat_used = used.get("paternity", 0)
        balances.append({
            "leave_type": "paternity", "allocated": PATERNITY_ALLOCATION,
            "used": pat_used, "remaining": PATERNITY_ALLOCATION - pat_used,
        })

    uncapped = ["unpaid", "other"] + (["maternity", "compassionate"] if is_corporate else [])
    balances += [{"leave_type": t, "allocated": None, "used": used.get(t, 0), "remaining": None} for t in uncapped]

    if is_corporate:
        available = _comp_off_available(user["id"])
        balances.append({
            "leave_type": "comp_off",
            "allocated": round(available + used.get("comp_off", 0), 1),
            "used": used.get("comp_off", 0),
            "remaining": round(available, 1),
        })

    return balances


@router.get("/leave-requests")
def list_leave_requests(status: str | None = Query(None), admin: dict = Depends(require_permission("leave.manage"))):
    query = supabase.table("hr_leave_requests").select(
        "*, hr_employees!hr_leave_requests_employee_id_fkey(first_name,last_name,employee_code,location)"
    )
    if status:
        query = query.eq("status", status)
    resp = query.order("created_at", desc=True).execute()
    return resp.data


@router.get("/me/team-leave-requests")
def my_team_leave_requests(status: str | None = Query(None), user: dict = Depends(get_current_user)):
    """Leave requests from anyone who lists this user as their leave
    approver OR their reporting manager — a scoped view, not a role. Any
    employee can hit this; it's naturally empty for someone nobody reports to."""
    direct_resp = supabase.table("hr_employees").select("id").eq("leave_approver_id", user["id"]).execute()
    reporting_resp = supabase.table("hr_employee_profile").select("employee_id").eq("reporting_to_id", user["id"]).execute()
    report_ids = list({r["id"] for r in direct_resp.data} | {r["employee_id"] for r in reporting_resp.data})
    if not report_ids:
        return []

    query = (
        supabase.table("hr_leave_requests")
        .select("*, hr_employees!hr_leave_requests_employee_id_fkey(first_name,last_name,employee_code,location)")
        .in_("employee_id", report_ids)
    )
    if status:
        query = query.eq("status", status)
    resp = query.order("created_at", desc=True).execute()
    return resp.data


def _is_leave_approver(user: dict, leave_request: dict) -> bool:
    if user_can(user, "leave.manage"):
        return True
    employee_resp = (
        supabase.table("hr_employees").select("leave_approver_id").eq("id", leave_request["employee_id"]).maybe_single().execute()
    )
    employee = maybe_single_data(employee_resp)
    if employee and employee.get("leave_approver_id") == user["id"]:
        return True
    profile_resp = (
        supabase.table("hr_employee_profile")
        .select("reporting_to_id")
        .eq("employee_id", leave_request["employee_id"])
        .maybe_single()
        .execute()
    )
    profile = maybe_single_data(profile_resp)
    return bool(profile and profile.get("reporting_to_id") == user["id"])


@router.put("/leave-requests/{request_id}")
def resolve_leave_request(request_id: str, body: LeaveResolve, user: dict = Depends(get_current_user)):
    existing = supabase.table("hr_leave_requests").select("*").eq("id", request_id).maybe_single().execute()
    leave_request = maybe_single_data(existing)
    if not leave_request:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if not _is_leave_approver(user, leave_request):
        raise HTTPException(status_code=403, detail="Not authorized to resolve this leave request")
    if leave_request["status"] != "pending":
        raise HTTPException(status_code=409, detail="Leave request already resolved")
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

    if body.action == "approve" and leave_request["leave_type"] == "comp_off":
        days_needed = _days_in_range(leave_request["start_date"], leave_request["end_date"])
        if not _consume_comp_off(leave_request["employee_id"], days_needed, request_id):
            raise HTTPException(status_code=409, detail="Comp-Off balance no longer covers this request")

    supabase.table("hr_leave_requests").update({
        "status": "approved" if body.action == "approve" else "rejected",
        "admin_note": body.admin_note,
        "resolved_by": user["id"],
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", request_id).execute()

    if body.action == "approve":
        employee_resp = (
            supabase.table("hr_employees").select("email,first_name,last_name").eq("id", leave_request["employee_id"]).maybe_single().execute()
        )
        employee = maybe_single_data(employee_resp) or {}
        employee_name = f"{employee.get('first_name', '')} {employee.get('last_name', '')}".strip()
        email_service.notify_leave_approved(
            employee.get("email", ""), employee_name, leave_request["leave_type"],
            leave_request["start_date"], leave_request["end_date"],
        )

    return {"ok": True}


@router.get("/comp-off/{employee_id}")
def list_comp_off_ledger(employee_id: str, user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    resp = (
        supabase.table("hr_comp_off_ledger")
        .select("*")
        .eq("employee_id", employee_id)
        .order("earned_date", desc=True)
        .execute()
    )
    return resp.data


@router.post("/comp-off/grant")
def grant_comp_off(body: CompOffGrant, user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    """Manual grant only — the Comp-Off SOP requires HR to validate eligibility
    (biometric/manual log/Zoho/HOD confirmation) before issuing one, not an
    automatic issuance off the punch data."""
    if body.units not in (0.5, 1.0):
        raise HTTPException(status_code=400, detail="units must be 0.5 or 1.0")
    row = {
        "employee_id": body.employee_id,
        "earned_date": body.earned_date.isoformat(),
        "units": body.units,
        "expiry_date": (body.earned_date + timedelta(days=COMP_OFF_VALIDITY_DAYS)).isoformat(),
        "granted_by": user["id"],
    }
    existing = (
        supabase.table("hr_comp_off_ledger")
        .select("id")
        .eq("employee_id", body.employee_id)
        .eq("earned_date", row["earned_date"])
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="A Comp-Off has already been granted for that date")
    inserted = supabase.table("hr_comp_off_ledger").insert(row).execute()
    return inserted.data[0]


def fetch_approved_leaves(employee_id: str, year: int, month: int) -> dict[date, str]:
    """Used by the payroll engine — maps each day in an approved leave range to its leave_type."""
    from_d, to_d = pay_period_bounds(year, month)

    resp = (
        supabase.table("hr_leave_requests")
        .select("leave_type,start_date,end_date")
        .eq("employee_id", employee_id)
        .eq("status", "approved")
        .lte("start_date", to_d.isoformat())
        .gte("end_date", from_d.isoformat())
        .execute()
    )
    by_day = {}
    for r in resp.data:
        d = max(date.fromisoformat(r["start_date"]), from_d)
        end = min(date.fromisoformat(r["end_date"]), to_d)
        while d <= end:
            by_day[d] = r["leave_type"]
            d = date.fromordinal(d.toordinal() + 1)
    return by_day


def fetch_all_approved_leaves_by_employee(year: int, month: int) -> dict[str, dict[date, str]]:
    """One query for the whole month instead of one per employee (mirrors payroll.py's punch fetcher)."""
    from_d, to_d = pay_period_bounds(year, month)

    resp = (
        supabase.table("hr_leave_requests")
        .select("employee_id,leave_type,start_date,end_date")
        .eq("status", "approved")
        .lte("start_date", to_d.isoformat())
        .gte("end_date", from_d.isoformat())
        .execute()
    )
    by_employee: dict[str, dict[date, str]] = defaultdict(dict)
    for r in resp.data:
        d = max(date.fromisoformat(r["start_date"]), from_d)
        end = min(date.fromisoformat(r["end_date"]), to_d)
        while d <= end:
            by_employee[r["employee_id"]][d] = r["leave_type"]
            d = date.fromordinal(d.toordinal() + 1)
    return by_employee
