from datetime import date, time
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
    standard_hours_per_day: float = 8
    weekly_off_day: int = 6  # 0=Mon .. 6=Sun
    phone: str = ""
    email: str = ""
    role: str = "employee"
    requires_selfie_checkin: bool = False
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
    standard_hours_per_day: Optional[float] = None
    weekly_off_day: Optional[int] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    requires_selfie_checkin: Optional[bool] = None
    password: Optional[str] = None


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


class SelfieCheckinRequest(BaseModel):
    photo_base64: str  # may be a data: URL or raw base64


class PermissionUpdate(BaseModel):
    hr_can_access: bool


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
    ess_role: Optional[str] = None
    head_of_department: Optional[bool] = None

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

    # Other Details
    identification_mark: Optional[str] = None
    is_senior_citizen: Optional[bool] = None
    is_super_senior_citizen: Optional[bool] = None
    severe_disability: Optional[bool] = None
    severe_disability_details: Optional[str] = None

    # User Defined Fields — full list, replaces existing rows on save
    udfs: Optional[list[UDFEntry]] = None
