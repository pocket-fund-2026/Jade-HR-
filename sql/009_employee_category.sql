-- Leave & Attendance Policy v1.1 applies only to the corporate roster (per
-- the user: "this policy is only for [the corporate org-chart departments]"),
-- not the factory/warehouse/retail staff tracked via biometric punches.
-- Flags exactly the ~104-person corporate roster already identified by the
-- earlier org-chart import (matched on department name, not a fresh PII query).

alter table hr_employees
    add column if not exists employee_category text not null default 'factory_retail'
    check (employee_category in ('corporate', 'factory_retail'));

update hr_employees set employee_category = 'corporate'
where is_active and department in (
    'Accounts', 'Alterations', 'Audit', 'Billing', 'CAD', 'Client Servicing', 'Client Team',
    'Content & Marketing', 'Costing', 'FG', 'Home/Artwork/Textile', 'Hospitality', 'HR and Admin',
    'Menswear', 'Order Management', 'Production', 'Purchase', 'QC', 'RM', 'Sampling', 'Special Project'
);

insert into hr_permissions (permission_key, label, hr_can_access) values
    ('policy.manage', 'Manage the leave & attendance policy — holiday calendar, comp-off grants, per-employee working-days overrides', false)
on conflict (permission_key) do nothing;
