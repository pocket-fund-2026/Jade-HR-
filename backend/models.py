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
    phone: str = ""
    email: str = ""
    role: str = "employee"
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
    phone: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
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
