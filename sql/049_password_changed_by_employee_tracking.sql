-- Tracks whether the current password_hash was set by the employee
-- themselves (via self-service /api/auth/change-password) or by someone
-- else (onboarding approval, admin reset via PUT /employees/{id}/password).
-- Lets future password-reset campaigns target only employees still sitting
-- on a password someone else chose for them.
alter table hr_employees
    add column if not exists password_changed_by_employee boolean not null default false;
