"""
JADE HR employee master export — full record (core + profile + UDFs) for
every employee, one row per employee, as CSV.

Reads directly from Supabase via the service-role key (same credentials the
backend uses — see backend/.env.example). Writes locally; does not push
anywhere. Whoever runs this owns getting the file wherever it needs to go
(e.g. a network share) — that's a deliberate boundary, not an oversight.

Usage:
  python export_employee_master.py [output_path.csv]
"""

import csv
import os
import sys

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

CORE_FIELDS = [
    "employee_code", "first_name", "last_name", "designation", "department", "location",
    "date_of_joining", "basic", "hra", "conveyance", "other_allowance", "standard_hours_per_day",
    "weekly_off_day", "phone", "email", "role", "is_active", "requires_selfie_checkin",
]

PROFILE_FIELDS = [
    "gender", "father_name", "mother_name", "spouse_name", "blood_group", "old_employee_code",
    "highest_qualification", "employee_type", "aadhar_no", "nationality", "pan_no", "marital_status",
    "company", "sub_department", "grade", "category", "level", "cost_center", "unit",
    "shift_roster", "shift_category", "holiday_group", "shift_group", "ess_role", "head_of_department",
    "date_of_birth", "probation_completion_date", "confirmation_date", "last_promotion_date",
    "next_promotion_date", "gratuity_date", "transfer_date", "marriage_date", "retirement_date",
    "contract_start_date", "contract_end_date", "last_reappointment_date", "last_exit_date_rejoinee",
    "scheduled_exit_date", "exit_date", "settlement_date", "reason_of_leaving", "employee_status",
    "emergency_contact_no", "personal_email_id", "current_address", "permanent_address",
    "freeze_salary", "freeze_reason", "mobile_punch", "mobile_punch_remarks", "is_remarks_mandatory",
    "geo_location_selection", "geo_fencing", "system_punch", "sequential_punch_only",
    "job_profile", "job_description",
    "pf_registration", "pf_applicable", "pf_no", "eps_applicable", "uan_no", "epf_join_date",
    "eps_join_date", "pf_gross_limit", "eps_exit_date", "vpf_amount",
    "esic_registration", "esic_applicable", "esic_no", "dispensary_name",
    "pt_registration", "pt_applicable", "lwf_registration", "lwf_applicable",
    "identification_mark", "is_senior_citizen", "is_super_senior_citizen", "severe_disability",
    "severe_disability_details",
]


def fetch_all(table: str, select: str = "*") -> list[dict]:
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    rows, start, page_size = [], 0, 1000
    while True:
        resp = client.table(table).select(select).range(start, start + page_size - 1).execute()
        rows.extend(resp.data)
        if len(resp.data) < page_size:
            break
        start += page_size
    return rows


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "jade_hr_employee_master.csv"

    employees = fetch_all("hr_employees")
    profiles = {p["employee_id"]: p for p in fetch_all("hr_employee_profile")}
    udfs_by_employee: dict[str, list[dict]] = {}
    for u in fetch_all("hr_employee_udf", "employee_id,udf_name,udf_value,position"):
        udfs_by_employee.setdefault(u["employee_id"], []).append(u)

    header = CORE_FIELDS + PROFILE_FIELDS + ["user_defined_fields"]

    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        for e in sorted(employees, key=lambda x: (x.get("first_name") or "")):
            profile = profiles.get(e["id"], {})
            udfs = sorted(udfs_by_employee.get(e["id"], []), key=lambda u: u.get("position", 0))
            udf_str = "; ".join(f"{u['udf_name']}: {u['udf_value']}" for u in udfs if u["udf_name"] or u["udf_value"])
            row = [e.get(k, "") for k in CORE_FIELDS] + [profile.get(k, "") for k in PROFILE_FIELDS] + [udf_str]
            writer.writerow(row)

    print(f"Wrote {len(employees)} employees -> {out_path}")


if __name__ == "__main__":
    main()
