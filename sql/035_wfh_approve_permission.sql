-- Policy v3 doc §24 requires WFH approval specifically from Senior
-- Management and/or the Head of HR — not any HR staffer with the general
-- 'leave.manage' permission (which routers/wfh.py's resolve endpoint used
-- until now). jade-hr has no distinct "Senior Management/HR Head" role, so
-- this is modelled as its own permission key instead: defaults to false for
-- everyone (unlike most hr_permissions rows, which default true), so Accounts
-- must explicitly grant it via hr_permission_overrides to the specific
-- people who hold that authority. Viewing the WFH queue stays available to
-- anyone with 'leave.manage' OR this key; only the actual approve/reject
-- action requires 'wfh.approve' itself.
insert into hr_permissions (permission_key, label, hr_can_access) values
    ('wfh.approve', 'Approve/reject Work From Home requests (Senior Management / HR Head only)', false)
on conflict (permission_key) do nothing;
