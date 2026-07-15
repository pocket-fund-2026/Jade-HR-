-- JADE HR — HR-generated letters (offer/confirmation/termination/relieving/
-- warning/review) with editable templates.

insert into hr_permissions (permission_key, label, hr_can_access) values
    ('letters.generate', 'Generate offer/confirmation/warning/relieving letters', true),
    ('letters.manage',   'Edit letter templates',                                  false)
on conflict (permission_key) do nothing;

-- One row per letter type. `body` is an HTML fragment containing {{token}}
-- placeholders, substituted at generation time — see backend/routers/letters.py.
create table if not exists hr_letter_templates (
    letter_type   text primary key,
    title         text not null,
    body          text not null,
    updated_by    uuid references hr_employees(id),
    updated_at    timestamptz not null default now()
);

alter table hr_letter_templates enable row level security;

-- Audit trail of every letter actually generated — employee_id is nullable
-- since offer letters are often for someone not yet an hr_employees row.
create table if not exists hr_generated_letters (
    id             uuid primary key default gen_random_uuid(),
    letter_type    text not null,
    employee_id    uuid references hr_employees(id),
    rendered_body  text not null,
    field_values   jsonb not null default '{}',
    generated_by   uuid not null references hr_employees(id),
    created_at     timestamptz not null default now()
);

create index if not exists idx_hr_generated_letters_employee on hr_generated_letters (employee_id);
alter table hr_generated_letters enable row level security;

insert into hr_letter_templates (letter_type, title, body) values

('offer_internship', 'Offer of Internship', $body$
<p>To,</p>
<p><strong>{{employee_name}}</strong><br>
{{address}}</p>
<p>Email - {{email}}</p>
<p><strong>Re: Offer of Internship</strong></p>
<p>Dear <strong>{{employee_name}}</strong>,</p>
<p>Following your application and subsequent interview, we are pleased to inform you that you have been considered for an internship in our company. During the training period, you will undertake the roles and responsibilities delegated to you by your department head.</p>
<p>The details of your internship are as follows:</p>
<ol>
<li>Internship role: {{internship_role}}</li>
<li>Department: {{department}}</li>
<li>Internship stipend: {{stipend}}</li>
<li>Date of Commencement: {{commencement_date}}</li>
<li>Duration of internship: {{duration}}</li>
<li>Hours and days of work: {{work_hours}}</li>
<li>Location: {{work_location}}</li>
</ol>
<p>At the end of successfully completing the internship satisfactorily, you will be given a letter of completion. Please sign on the following page to send in your acceptance to confirm this offer.</p>
<p>We look forward to working with you.</p>
<p>Yours Faithfully,</p>
<p><strong>{{signatory_name}} – {{signatory_title}}</strong><br>
<strong>{{company_name}}</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Mumbai, {{letter_date}}</p>
$body$),

('confirmation', 'Confirmation Letter', $body$
<p>To,</p>
<p><strong>{{employee_name}}</strong>,<br>
Employee Code - {{employee_code}}<br>
Date of Joining - {{date_of_joining}}</p>
<p>Email - {{email}}</p>
<p>Subject: Confirmation Letter.</p>
<p>Dear <strong>{{employee_name}}</strong>,</p>
<p>You have successfully completed your probation period and I am delighted to confirm your employment in the capacity mentioned below:</p>
<p>Designation: <strong>{{designation}}</strong><br>
Department: <strong>{{department}}</strong></p>
<p>All terms and conditions of employment mentioned in the offer letter dated {{offer_letter_date}} remain the same.</p>
<p>I am confident you will further your career and fulfil your responsibilities with a high level of diligence, commitment and determination.</p>
<p>I wish you continued success and look forward to your association with us.</p>
<p>Yours faithfully,</p>
<p><strong>{{signatory_name}} - {{signatory_title}}</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Mumbai, {{letter_date}}<br>
<strong>{{company_name}}</strong></p>
$body$),

('termination', 'Termination of Employment', $body$
<p>Date: {{letter_date}}</p>
<p>To,<br>
{{employee_name}}<br>
Employee Code: {{employee_code}}<br>
Designation: {{designation}}<br>
Department: {{department}}</p>
<p>Subject: Termination of Employment</p>
<p>We hope you are doing well.</p>
<p>After careful consideration, we regret to inform you that your employment with {{company_name}} will be ending, effective immediately.</p>
<p>This decision follows a thorough review of your performance and conduct. Several factors have contributed to this outcome, including:</p>
{{termination_reasons}}
<p>Despite previous discussions and opportunities to improve, the necessary changes have not been made. This decision is in accordance with the terms and conditions outlined in your employment contract.</p>
<p>Kindly ensure that you complete a thorough handover of your responsibilities to your manager before your departure. Your final settlement will be processed as per company policy. Should you have any questions or require further clarification, please feel free to reach out to the HR department.</p>
<p>We wish you the best in your future endeavors.</p>
<p>Sincerely,</p>
<p><strong>{{signatory_name}}</strong><br>
{{signatory_title}}<br>
{{company_name}}</p>
$body$),

('offer_employment', 'Offer of Employment', $body$
<p>To,</p>
<p><strong>{{employee_name}}</strong>,<br>
{{address}}</p>
<p>{{email}}</p>
<p><strong>Re: Offer of Employment</strong></p>
<p>Dear <strong>{{employee_name}}</strong>,</p>
<p>Based on your interview and the ensuing discussions between us, we are delighted to offer you employment with us on the terms and conditions contained herein. Please read through this letter carefully and indicate your acceptance of the offer by signing and returning a copy of this letter within {{acceptance_days}} days, after which this offer expires.</p>
<p><strong>1. Your Job Profile:</strong></p>
<p>Designation: <strong>{{designation}}</strong><br>
Department: <strong>{{department}}</strong><br>
Joining Date: <strong>{{joining_date}}</strong></p>
<p><strong>2. Location</strong></p>
<p>Your place of work is mentioned below. You may be required to work at other locations depending on work exigencies.</p>
<p><strong>{{work_location}}</strong></p>
<p><strong>3. Hours of Work</strong></p>
<p><strong>{{work_hours}}</strong></p>
<p>As a full-time employee, you are required to devote your full time, attention, and ability during ordinary business hours exclusively to the performance of your duties under this Agreement.</p>
<p>You shall not, during the term of your employment, whether directly or indirectly, undertake, engage, participate, or be involved in any other business, trade, profession, consultancy, freelancing, or form of employment—whether for remuneration or otherwise—without the prior written consent of the Company.</p>
<p>Any contravention of this clause shall constitute a material breach of this Agreement and will be treated as gross misconduct. In such an event, the Company reserves the right to take immediate disciplinary action, which may include termination of employment without notice or compensation in lieu thereof, in addition to pursuing any other legal remedies available for recovery of damages or losses suffered as a consequence of such breach.</p>
<p><strong>4. Key Responsibility Areas (KRAs)</strong></p>
{{kras}}
<p>The Key Result Areas (KRAs) mentioned above are not exhaustive and can be modified as needed.</p>
<p><strong>5. Probationary Period</strong></p>
<p>You will be under probation for {{probation_days}} days (working days, all leaves taken during the probation period are excluded). The probationary period is designed to give us time to assess whether you are able to fulfil your role as required. During the probationary period, your employment may be terminated by either you or the company upon providing 1 week's written notice (or payment in lieu of that notice).</p>
<p>In case of absence from work for 5 days and above your employment will automatically be considered as terminated (except where you have sought approval for taking leave in writing via email and the same has been granted in writing by email by the person you are reporting to).</p>
<p>Your confirmation is contingent to you completing the probationary period satisfactorily. In case your performance falls below expectations, you will be informed of the same, resulting in immediate termination of your employment. You may request an extension of the probation period for another {{probation_days}} days which the management may agree to at their discretion.</p>
<p><strong>6. Remuneration and Benefits</strong></p>
<p>(a). Your remuneration CTC, will be:</p>
<table style="width:100%; border-collapse: collapse;" border="1" cellpadding="6">
<tr><th>Sr. No.</th><th>Particulars</th><th>Per Month (₹)</th></tr>
<tr><td>A</td><td><strong>Monthly Earnings:</strong></td><td></td></tr>
<tr><td>1</td><td>Basic Salary</td><td>{{basic_salary}}</td></tr>
<tr><td>2</td><td>House Rent Allowance (HRA)</td><td>{{hra}}</td></tr>
<tr><td>3</td><td>Conveyance</td><td>{{conveyance}}</td></tr>
<tr><td>4</td><td>Other Allowance</td><td>{{other_allowance}}</td></tr>
<tr><td><strong>A</strong></td><td><strong>Total A</strong></td><td><strong>{{total_ctc}}</strong></td></tr>
</table>
<p>(b). The remuneration will be deposited monthly into your nominated account.</p>
<p>(c). TDS is deductible on salary; the calculation of this is based on the Income Tax Act of India, and the amount varies depending on the personal tax planning of the individual.</p>
<p>(d). The above-mentioned remuneration is the total cost to the company and includes all payments made and benefits (including all allowances, statutory benefits) provided by the company directly or indirectly to you or on your behalf, whether as salary or otherwise. The breakup will be provided on your salary slip at the end of each month.</p>
<p>(e). You will be entitled to all the statutory benefits applicable to you.</p>
<p><strong>7. Deductions:</strong> The remuneration is subject to income tax and other statutory deductions based on applicable laws in force from time to time.</p>
<p><strong>8. Leave:</strong> Based on the leave policy of the company a total of {{leave_days}} days of paid leave are provided annually.</p>
<p><strong>9. Company Policies:</strong> You agree that the company policies, as amended or replaced from time to time, shall be binding upon you. All policies are made available on the HRMS software for easy reference. Any queries regarding the same can be emailed to team.hr@jadecouture.com.</p>
<p><strong>10. Confidentiality and Intellectual Property</strong></p>
<p>(a) You agree that you will not divulge any of the confidential information or trade secrets of the company to any person, whether during or after the termination of your employment.</p>
<p>(b) You agree that you will not use, attempt to use, or assist another person in using any confidential information you may acquire in the course of your employment in a manner which may cause loss to the company.</p>
<p>(c) You may be required to sign a Non-Disclosure Agreement at any point in time during the course of your employment.</p>
<p><strong>11. Termination</strong></p>
<p>(a) During your employment, either party may terminate this agreement by providing written notice of 1 month (or payment in lieu of notice) to the other party.</p>
<p>(b) Notwithstanding sub-clause (a) above, the Employer may terminate this agreement by notice effective immediately without payment (except salary accrued to the date of termination) where you have committed an act of willful or serious misconduct, are significantly neglectful of your duties, or you are in breach of this agreement.</p>
<p><strong>12. Retirement</strong></p>
<p>The retirement age for all employees is 60 years. An employee can be retired at any age before attaining the age of sixty years during their tenure at the Company if they are unable to continue in service satisfactorily due to any form of physical or mental infirmity or not able to perform given work.</p>
<p><strong>13. List of Documents to be submitted</strong></p>
<p>Before joining please email (if not submitted already) the following information and list of documents to team.hr@jadecouture.com:</p>
<ol>
<li>Proof of Identity and address - GOI issued Aadhar Card or Passport</li>
<li>PAN card</li>
<li>Scanned copy of the last salary slip drawn</li>
<li>Bank details and account number in which you would like your salary to be deposited</li>
</ol>
<p>This Letter of Offer contains the proposed Terms and Conditions of your employment and is subject to confirmation after successful completion of the probation period.</p>
<p>Yours sincerely,</p>
<p><strong>{{signatory_name}}</strong><br>
<strong>{{signatory_title}}</strong><br>
<strong>{{company_name}}</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Mumbai, {{letter_date}}</p>
$body$),

('relieving', 'Relieving Letter', $body$
<p>To,</p>
<p><strong>{{employee_name}}</strong>,<br>
Employee code - {{employee_code}}<br>
Designation - {{designation}}<br>
Department - {{department}}</p>
<p>Subject: Relieving Letter</p>
<p>To Whom It May Concern,</p>
<p>This is to certify that {{employee_name}} was working with us from {{start_date}} to {{end_date}}. {{conduct_remark}}</p>
<p>We wish {{employee_name}} all the best for future endeavors.</p>
<p>Yours sincerely,</p>
<p><strong>{{signatory_name}} – {{signatory_title}}</strong></p>
<p><strong>{{company_name}}</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Mumbai, {{letter_date}}</p>
$body$),

('warning', 'Formal Warning Letter', $body$
<p>Date: {{letter_date}}</p>
<p>To {{employee_name}},<br>
Employee Code: {{employee_code}}<br>
Designation: {{designation}}<br>
Department: {{department}}</p>
<p>Subject: {{warning_subject}}</p>
<p>I am writing to formally address several concerns regarding your performance and conduct in the workplace. As an employee of {{company_name}}, it is imperative that you adhere to company policies and demonstrate professionalism at all times.</p>
{{warning_body}}
<p>Please be advised that these behaviors are in violation of company policies and expectations. Continued disregard for these standards may result in further disciplinary action, up to and including termination of employment.</p>
<p>We trust that you will take this warning seriously and make the necessary adjustments to your behavior and performance.</p>
<p>Sincerely,</p>
<p><strong>{{signatory_name}}</strong><br>
{{signatory_title}}<br>
{{company_name}}</p>
$body$),

('review_form', 'Employee Confirmation Review Form', $body$
<p><strong>EMPLOYEE CONFIRMATION REVIEW FORM</strong></p>
<p><strong>Employee Name:</strong> {{employee_name}} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Date:</strong> {{letter_date}}</p>
<p><strong>Department:</strong> {{department}} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Period of Review:</strong> {{review_period}}</p>
<p><strong>Reviewer Title:</strong> {{reviewer_title}}</p>
<table border="1" cellpadding="6" style="width:100%; border-collapse: collapse;">
<tr><th>Performance Evaluation</th><th>Excellent</th><th>Good</th><th>Fair</th><th>Poor</th><th>Comments</th></tr>
<tr><td>Work Quality</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Productivity</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Technical Skills</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Right / Positive Attitude</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Attendance / Punctuality</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Communication Skills</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Team Work</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Leadership Quality</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Work Under Pressure</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Work On Deadline</td><td></td><td></td><td></td><td></td><td></td></tr>
</table>
<p><strong>HOD Feedback:</strong></p>
<table border="1" cellpadding="6" style="width:100%; border-collapse: collapse;">
<tr><th></th><th>Excellent</th><th>Good</th><th>Fair</th><th>Poor</th><th>Comments</th></tr>
<tr><td>Willing to take more responsibility</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Open for feedback</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Ability to work independently</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Initiative</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Effective problem-solving skills</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Overall ratings</td><td></td><td></td><td></td><td></td><td></td></tr>
</table>
<p><strong>Opportunities for Development:</strong></p>
<p>&nbsp;</p>
<p><strong>Reviewer Comments:</strong></p>
<p>&nbsp;</p>
<p>By signing this form, you confirm that you have discussed this review in detail with your reviewer. Signing this form does not necessarily indicate that you agree with this performance evaluation.</p>
<p>Employee Signature: ___________________ &nbsp;&nbsp;&nbsp;&nbsp; Reviewer Signature: ___________________</p>
$body$)

on conflict (letter_type) do nothing;
