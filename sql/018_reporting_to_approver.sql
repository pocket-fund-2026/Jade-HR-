-- JADE HR — make "Reporting To" a real employee reference that also grants
-- leave-approval rights, instead of a dead free-text field.

alter table hr_employee_profile add column if not exists reporting_to_id uuid references hr_employees(id);
