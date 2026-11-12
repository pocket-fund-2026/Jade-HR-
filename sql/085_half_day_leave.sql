-- Half Day leave: single-date request, paid 0.5 day (other half is without pay).
-- Approved by the reporting manager chain and HR like any other leave.
alter table hr_leave_requests drop constraint if exists hr_leave_requests_leave_type_check;
alter table hr_leave_requests add constraint hr_leave_requests_leave_type_check
    check (leave_type in ('paid', 'casual', 'sick', 'earned', 'unpaid', 'other', 'paternity', 'maternity', 'compassionate', 'comp_off', 'half_day'));
alter table hr_leave_requests add column if not exists half_day_session text
    check (half_day_session is null or half_day_session in ('first', 'second'));
