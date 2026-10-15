-- Revised Comp-Off SOP effective 1 November 2025.
-- Reconcile stored 90-day expiry dates with the 120-day validity window.
-- Keep consumed credits consumed; restore only unused credits still in validity.
begin;
update hr_comp_off_ledger
set expiry_date = earned_date + 120,
    status = case
      when status = 'used' or used_in_leave_request_id is not null then 'used'
      when earned_date + 120 < (now() at time zone 'Asia/Kolkata')::date then 'expired'
      else 'available'
    end
where earned_date >= date '2025-11-01'
  and expiry_date <> earned_date + 120;
commit;
