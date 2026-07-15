from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel


class LoginRequest(BaseModel):
    employee_code: str
    password: str


class BootstrapAdminRequest(BaseModel):
    employee_code: str
    first_name: str
    last_name: str = ""
    password: str


class EmployeeCreate(BaseModel):
    employee_code: str
    first_name: str
    last_name: str = ""
    designation: str = ""
    department: str = ""
    location: str = "Madhu Estate, Mumbai"
    date_of_joining: Optional[date] = None
    basic: float = 0
    hra: float = 0
    conveyance: float = 0
    other_allowance: float = 0
    monthly_bonus: float = 0
    retention: float = 0
    incentive: float = 0
    standard_hours_per_day: float = 8
    weekly_off_day: int = 6  # 0=Mon .. 6=Sun
    phone: str = ""
    email: str = ""
    role: str = "employee"
    requires_selfie_checkin: bool = False
    leave_approver_id: Optional[str] = None
    employee_category: str = "factory_retail"
    standard_working_days_per_month: Optional[float] = None
    is_intern: bool = False
    ot_applicable: bool = True
    standing_loan_emi: float = 0
    password: str


class EmployeeUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    date_of_joining: Optional[date] = None
    basic: Optional[float] = None
    hra: Optional[float] = None
    conveyance: Optional[float] = None
    other_allowance: Optional[float] = None
    monthly_bonus: Optional[float] = None
    retention: Optional[float] = None
    incentive: Optional[float] = None
    standard_hours_per_day: Optional[float] = None
    weekly_off_day: Optional[int] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    requires_selfie_checkin: Optional[bool] = None
    leave_approver_id: Optional[str] = None
    employee_category: Optional[str] = None
    standard_working_days_per_month: Optional[float] = None
    is_intern: Optional[bool] = None
    ot_applicable: Optional[bool] = None
    standing_loan_emi: Optional[float] = None
    password: Optional[str] = None
    # Bookkeeping written only by employee_roster_sync.py — see routers/employees.py.
    roster_last_seen_at: Optional[datetime] = None
    roster_unmatched_streak: Optional[int] = None


class BiometricPunch(BaseModel):
    EmployeeCode: str
    LogDate: str  # "yyyy-MM-dd HH:MM:SS"
    SerialNumber: str = ""
    PunchDirection: str = ""


class DisputeCreate(BaseModel):
    date: date
    issue_type: str  # missed_clock_in | missed_clock_out | both | other
    claimed_in: Optional[time] = None
    claimed_out: Optional[time] = None
    reason: str


class DisputeResolve(BaseModel):
    action: str  # approve | reject
    admin_note: str = ""
    # Admin can adjust the claimed times before approving.
    first_in: Optional[time] = None
    last_out: Optional[time] = None
    status_override: str = "present"  # present | absent | half_day


class SalaryImportRow(BaseModel):
    employee_code: str
    basic: float = 0
    hra: float = 0
    conveyance: float = 0
    other_allowance: float = 0
    incentive: float = 0


class SalaryImportRequest(BaseModel):
    rows: list[SalaryImportRow]


class LeaveRequestCreate(BaseModel):
    leave_type: str  # casual | sick | earned | unpaid
    start_date: date
    end_date: date
    reason: str


class LeaveResolve(BaseModel):
    action: str  # approve | reject
    admin_note: str = ""


class PayslipApprovalCreate(BaseModel):
    period_year: int
    period_month: int  # 1-12


class PayslipApprovalResolve(BaseModel):
    action: str  # approve | reject
    admin_note: str = ""


class SelfieCheckinRequest(BaseModel):
    photo_base64: str  # may be a data: URL or raw base64


class PermissionUpdate(BaseModel):
    hr_can_access: bool


class BulkOverrideRequest(BaseModel):
    employee_ids: list[str]
    permission_key: str
    granted: bool


class HolidayCreate(BaseModel):
    holiday_date: date
    description: str
    day_type: str = "closed"  # closed | day_off | open_statutory | open_till_4pm | open_normal | anniversary
    remarks: str = ""
    location: Optional[str] = None  # None = all locations; a city name; or "HQ" (Madhu Estate, Mumbai only)
    close_time: Optional[time] = None


class PasswordReset(BaseModel):
    password: str


class CompOffGrant(BaseModel):
    employee_id: str
    earned_date: date
    units: float  # 0.5 or 1.0


class LeaveLedgerEntryCreate(BaseModel):
    employee_id: str
    leave_type: str
    transaction_type: str  # credit | debit | adjustment | auto_credit
    amount: float  # signed — positive credits, negative debits
    remarks: str = ""
    entry_date: date


class UDFEntry(BaseModel):
    udf_name: str = ""
    udf_value: str = ""


class EmployeeProfileUpdate(BaseModel):
    # Personal
    gender: Optional[str] = None
    father_name: Optional[str] = None
    mother_name: Optional[str] = None
    spouse_name: Optional[str] = None
    blood_group: Optional[str] = None
    old_employee_code: Optional[str] = None
    highest_qualification: Optional[str] = None
    employee_type: Optional[str] = None
    aadhar_no: Optional[str] = None
    nationality: Optional[str] = None
    pan_no: Optional[str] = None
    marital_status: Optional[str] = None

    # Official
    company: Optional[str] = None
    sub_department: Optional[str] = None
    grade: Optional[str] = None
    category: Optional[str] = None
    level: Optional[str] = None
    cost_center: Optional[str] = None
    unit: Optional[str] = None
    shift_roster: Optional[str] = None
    shift_category: Optional[str] = None
    holiday_group: Optional[str] = None
    shift_group: Optional[str] = None
    time_slot: Optional[str] = None
    saturday_extended_hours: Optional[bool] = None
    ess_role: Optional[str] = None
    head_of_department: Optional[bool] = None
    reporting_to: Optional[str] = None
    reporting_to_id: Optional[str] = None  # actual employee reference — also grants leave-approval rights

    # Dates
    date_of_birth: Optional[date] = None
    probation_completion_date: Optional[date] = None
    confirmation_date: Optional[date] = None
    last_promotion_date: Optional[date] = None
    next_promotion_date: Optional[date] = None
    gratuity_date: Optional[date] = None
    transfer_date: Optional[date] = None
    marriage_date: Optional[date] = None
    retirement_date: Optional[date] = None
    contract_start_date: Optional[date] = None
    contract_end_date: Optional[date] = None
    last_reappointment_date: Optional[date] = None
    last_exit_date_rejoinee: Optional[date] = None
    scheduled_exit_date: Optional[date] = None
    exit_date: Optional[date] = None
    settlement_date: Optional[date] = None
    reason_of_leaving: Optional[str] = None
    employee_status: Optional[str] = None

    # Communication
    emergency_contact_no: Optional[str] = None
    personal_email_id: Optional[str] = None
    current_address: Optional[str] = None
    permanent_address: Optional[str] = None
    additional_contact_1_name: Optional[str] = None
    additional_contact_1_phone: Optional[str] = None
    additional_contact_2_name: Optional[str] = None
    additional_contact_2_phone: Optional[str] = None
    freeze_salary: Optional[bool] = None
    freeze_reason: Optional[str] = None
    mobile_punch: Optional[bool] = None
    mobile_punch_remarks: Optional[str] = None
    is_remarks_mandatory: Optional[bool] = None
    geo_location_selection: Optional[bool] = None
    geo_fencing: Optional[bool] = None
    system_punch: Optional[bool] = None
    sequential_punch_only: Optional[bool] = None

    # Job Profile
    job_profile: Optional[str] = None
    job_description: Optional[str] = None

    # Compliances
    pf_registration: Optional[str] = None
    pf_applicable: Optional[bool] = None
    pf_no: Optional[str] = None
    eps_applicable: Optional[bool] = None
    uan_no: Optional[str] = None
    epf_join_date: Optional[date] = None
    eps_join_date: Optional[date] = None
    pf_gross_limit: Optional[float] = None
    eps_exit_date: Optional[date] = None
    vpf_amount: Optional[float] = None
    esic_registration: Optional[str] = None
    esic_applicable: Optional[bool] = None
    esic_no: Optional[str] = None
    dispensary_name: Optional[str] = None
    pt_registration: Optional[str] = None
    pt_applicable: Optional[bool] = None
    lwf_registration: Optional[str] = None
    lwf_applicable: Optional[bool] = None
    payment_mode: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None

    # Other Details
    identification_mark: Optional[str] = None
    is_senior_citizen: Optional[bool] = None
    is_super_senior_citizen: Optional[bool] = None
    severe_disability: Optional[bool] = None
    severe_disability_details: Optional[str] = None
    additional_info: Optional[str] = None

    # User Defined Fields — full list, replaces existing rows on save
    udfs: Optional[list[UDFEntry]] = None


class SalaryStructureSave(BaseModel):
    effective_date: date

    # Manual Entry (Prorata)
    me_basic: float = 0
    me_hra: float = 0
    me_conv: float = 0
    me_other_allow: float = 0
    me_monthly_bonus: float = 0
    me_retention: float = 0
    me_incentive: float = 0

    # Earning (Calculated)
    earn_basic: float = 0
    earn_hra: float = 0
    earn_conv: float = 0
    earn_other_allow: float = 0
    earn_ot_amt: float = 0
    earn_arrear: float = 0
    earn_bonus: float = 0
    earn_leave_encash: float = 0
    earn_monthly_bonus: float = 0
    earn_performance_linked_pay: float = 0
    earn_retention: float = 0
    earn_incentive: float = 0
    earn_ctc: float = 0
    earn_total_arr: float = 0

    # Deductions (Calculated)
    ded_pf: float = 0
    ded_pt: float = 0
    ded_vpf: float = 0
    ded_esic: float = 0
    ded_tds: float = 0
    ded_loan: float = 0
    ded_advance: float = 0
    ded_loan_int: float = 0
    ded_lwf: float = 0
    ded_other_ded: float = 0
    ded_salary_advance: float = 0
    ded_pf_arrear: float = 0

    # Others (Calculated)
    oth_pt_wages: float = 0
    oth_lwf_wages: float = 0
    oth_eps_wages: float = 0
    oth_eps: float = 0
    oth_epf: float = 0
    oth_edli_charges: float = 0
    oth_pf_admin_charges: float = 0
    oth_edli_admin_charges: float = 0
    oth_esic_wages: float = 0
    oth_esic_employer: float = 0
    oth_pf_wages: float = 0
    oth_edli_wages: float = 0

    salary_remarks: str = ""


class TaxDeclarationSave(BaseModel):
    financial_year: str  # e.g. '2026-27'
    regime: str = "new"  # old | new — new is the statutory default (Sec 115BAC)
    rent_paid_annual: float = 0
    landlord_pan: str = ""
    section_80c: float = 0
    section_80d: float = 0
    home_loan_interest: float = 0
    other_deductions: float = 0


class LetterTemplateUpdate(BaseModel):
    title: str
    body: str


class LetterTemplateCreate(BaseModel):
    title: str
    body: str
    letter_type: Optional[str] = None  # slug — derived from title if omitted


class LetterGenerateRequest(BaseModel):
    letter_type: str
    employee_id: Optional[str] = None
    field_values: dict[str, str] = {}


class OnboardingUpload(BaseModel):
    filename: str
    content_base64: str  # may be a data: URL or raw base64
    content_type: str = "application/octet-stream"


class OnboardingSubmissionCreate(BaseModel):
    # Personal
    full_name: str
    date_of_birth: Optional[date] = None
    mobile: str = ""
    emergency_contact_no: str = ""
    email: str = ""

    # Permanent address, as 4 lines (flat/house, road/street, landmark/area,
    # city-pin-country) matching the source form.
    address_line1: str = ""
    address_line2: str = ""
    address_line3: str = ""
    address_line4: str = ""

    # Employment
    date_of_joining: Optional[date] = None
    is_fresher: bool = False
    designation: str = ""
    department: str = ""
    kra: str = ""
    requires_personal_email: bool = False
    requires_oms_login: bool = False
    place_of_work: str = ""
    timings_and_days: str = ""

    # Bank
    bank_name: str = ""
    bank_account_no: str = ""
    bank_ifsc: str = ""

    # Documents — *_path fields are storage paths returned by
    # POST /api/onboarding/upload, not raw file data.
    aadhar_no: str = ""
    aadhar_front_path: str = ""
    aadhar_back_path: str = ""
    pan_no: str = ""
    pan_card_path: str = ""
    salary_slip_paths: list[str] = []
    date_of_offer_letter: Optional[date] = None

    # Compensation
    basic: float = 0
    hra: float = 0
    conveyance: float = 0
    other_allowance: float = 0
    monthly_ctc: float = 0

    # Authorization
    signatory_name: str = ""
    signatory_designation: str = ""
    signatory_email: str = ""
    approver_name: str = ""
    approver_email: str = ""
    signature_confirmed: bool = False


class OnboardingResolve(BaseModel):
    action: str  # approve | reject
    admin_note: str = ""
    # Required for action == "approve" — employee_code must match the
    # biometric device code assigned to this joinee (an external, physical
    # process this form doesn't drive), password is their initial login.
    employee_code: Optional[str] = None
    password: Optional[str] = None
    employee_category: str = "factory_retail"  # corporate | factory_retail


class LumpsumSave(BaseModel):
    """The Lumpsum Report's editable one-off line items for a specific pay
    period — a subset of SalaryStructureSave. TDS isn't included: it's
    computed from the employee's Tax Declaration (see tds.py), not a manual
    salary-structure entry, so it's read-only in that report."""

    period_year: int
    period_month: int
    earn_arrear: float = 0
    earn_bonus: float = 0
    earn_leave_encash: float = 0
    earn_performance_linked_pay: float = 0
    ded_loan_int: float = 0
    ded_other_ded: float = 0
    ded_salary_advance: float = 0
    ded_pf_arrear: float = 0
