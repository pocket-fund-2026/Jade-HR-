-- Letters redesign (2026-10-01): every template rebuilt on the shared lt-*
-- letter system (frontend/src/index.css, mirrored in backend/letter_email.py)
-- so all eight letters read as one family — dateline, addressee block,
-- subject bar, details table, signature block, and (for offers) a proper
-- tear-off acceptance slip that the old "sign on the following page" text
-- referred to but never had.
--
-- Token names are unchanged on purpose: the generator's auto-fill
-- (Letters.jsx autofillFromEmployee/defaultsFor) and the Quarter Red Card
-- runner (routers/late_policy.py, final_warning) fill these exact keys.
-- Legal/policy clauses in the offer letter are kept word-for-word; only
-- layout, headings and obvious inconsistencies were changed.

update hr_letter_templates set updated_at = now(), body = $body$
<p class="lt-dateline"><span>Mumbai</span><span><strong>{{letter_date}}</strong></span></p>
<div class="lt-to"><span class="lt-label">To</span><strong>{{employee_name}}</strong><br>Employee Code: {{employee_code}}<br>{{email}}</div>
<p class="lt-subject">Confirmation of Employment</p>
<p>Dear {{employee_name}},</p>
<p>We are pleased to inform you that you have successfully completed your probation period. On the basis of your performance during this period, your employment with {{company_name}} is hereby confirmed in the following capacity:</p>
<table class="lt-details">
<tr><td>Designation</td><td>{{designation}}</td></tr>
<tr><td>Department</td><td>{{department}}</td></tr>
<tr><td>Date of joining</td><td>{{date_of_joining}}</td></tr>
</table>
<p>All other terms and conditions of your employment, as set out in your offer letter dated {{offer_letter_date}}, remain unchanged.</p>
<p>We are confident that you will continue to fulfil your responsibilities with diligence, commitment and determination, and we look forward to a long and rewarding association with you.</p>
<p>Congratulations, and best wishes for the road ahead.</p>
<div class="lt-sign"><p>Yours sincerely,<br>For <strong>{{company_name}}</strong></p><div class="lt-sign-space"></div><p><span class="lt-sign-name"><strong>{{signatory_name}}</strong></span><br><span class="lt-sign-meta">{{signatory_title}}</span></p></div>
$body$ where letter_type = 'confirmation';

update hr_letter_templates set updated_at = now(), body = $body$
<p class="lt-dateline"><span class="lt-confidential">Private &amp; Confidential</span><span>Mumbai, <strong>{{letter_date}}</strong></span></p>
<div class="lt-to"><span class="lt-label">To</span><strong>{{employee_name}}</strong><br>{{designation}}, {{department}}<br>Employee Code: {{employee_code}}</div>
<p class="lt-subject">Final Warning: Persistent Late Arrival ({{quarter_label}})</p>
<p>Dear {{employee_name}},</p>
<p>As per the Company's late-arrival policy effective 22 September 2026, reporting for work beyond 10:20 am is recorded as a late marking. The first three late markings in a month are issued as a Yellow Card, and being late on more than three occasions in a month results in a Red Card for that month.</p>
<p>Our attendance records show that you have received a Red Card in each month of {{quarter_label}}:</p>
{{late_mark_summary}}
<div class="lt-callout"><p>This constitutes a <strong>Quarter Red Card</strong>. Accordingly, this letter serves as a <strong>Final Warning</strong>, and <strong>{{pl_forfeited}} days</strong> of your Paid Leave entitlement stand forfeited with effect from {{action_date}}.</p></div>
<p>You are advised to report for work within your prescribed shift timing without exception. Any further recurrence will invite disciplinary action, which may include termination of your employment.</p>
<p class="lt-note">If you believe any of the attendance records above are incorrect, please raise an attendance dispute through the HR Console within seven days of the date of this letter.</p>
<div class="lt-sign"><p>Yours faithfully,<br>For <strong>{{company_name}}</strong></p><div class="lt-sign-space"></div><p><span class="lt-sign-name"><strong>{{signatory_name}}</strong></span><br><span class="lt-sign-meta">{{signatory_title}}</span></p></div>
$body$ where letter_type = 'final_warning';

update hr_letter_templates set updated_at = now(), body = $body$
<p class="lt-dateline"><span class="lt-confidential">Private &amp; Confidential</span><span>Mumbai, <strong>{{letter_date}}</strong></span></p>
<div class="lt-to"><span class="lt-label">To</span><strong>{{employee_name}}</strong><br>{{address}}<br>{{email}}</div>
<p class="lt-subject">Offer of Employment</p>
<p>Dear {{employee_name}},</p>
<p>Based on your interview and the ensuing discussions between us, we are delighted to offer you employment with us on the terms and conditions contained herein. Please read through this letter carefully and indicate your acceptance of the offer by signing and returning a copy of this letter within {{acceptance_days}} days, after which this offer expires.</p>
<p class="lt-heading">1. Your Job Profile</p>
<table class="lt-details">
<tr><td>Designation</td><td>{{designation}}</td></tr>
<tr><td>Department</td><td>{{department}}</td></tr>
<tr><td>Joining date</td><td>{{joining_date}}</td></tr>
</table>
<p class="lt-heading">2. Location</p>
<p>Your place of work is mentioned below. You may be required to work at other locations depending on work exigencies.</p>
<p><strong>{{work_location}}</strong></p>
<p class="lt-heading">3. Hours of Work</p>
<p><strong>{{work_hours}}</strong></p>
<p>As a full-time employee, you are required to devote your full time, attention, and ability during ordinary business hours exclusively to the performance of your duties under this Agreement.</p>
<p>You shall not, during the term of your employment, whether directly or indirectly, undertake, engage, participate, or be involved in any other business, trade, profession, consultancy, freelancing, or form of employment, whether for remuneration or otherwise, without the prior written consent of the Company.</p>
<p>Any contravention of this clause shall constitute a material breach of this Agreement and will be treated as gross misconduct. In such an event, the Company reserves the right to take immediate disciplinary action, which may include termination of employment without notice or compensation in lieu thereof, in addition to pursuing any other legal remedies available for recovery of damages or losses suffered as a consequence of such breach.</p>
<p class="lt-heading">4. Key Responsibility Areas (KRAs)</p>
{{kras}}
<p>The Key Responsibility Areas (KRAs) mentioned above are not exhaustive and can be modified as needed.</p>
<p class="lt-heading">5. Probationary Period</p>
<p>You will be under probation for {{probation_days}} days (working days; all leaves taken during the probation period are excluded). The probationary period is designed to give us time to assess whether you are able to fulfil your role as required. During the probationary period, your employment may be terminated by either you or the company upon providing 1 week's written notice (or payment in lieu of that notice).</p>
<p>In case of absence from work for 5 days and above your employment will automatically be considered as terminated (except where you have sought approval for taking leave in writing via email and the same has been granted in writing by email by the person you are reporting to).</p>
<p>Your confirmation is contingent on you completing the probationary period satisfactorily. In case your performance falls below expectations, you will be informed of the same, resulting in immediate termination of your employment. You may request an extension of the probation period for another {{probation_days}} days, which the management may agree to at their discretion.</p>
<p class="lt-heading">6. Remuneration and Benefits</p>
<p>(a) Your remuneration (CTC) will be:</p>
<table class="lt-money">
<tr><th style="width:12%">Sr. No.</th><th>Particulars</th><th>Per Month (₹)</th></tr>
<tr class="lt-group"><td>A</td><td>Monthly Earnings</td><td></td></tr>
<tr><td>1</td><td>Basic Salary</td><td>{{basic_salary}}</td></tr>
<tr><td>2</td><td>House Rent Allowance (HRA)</td><td>{{hra}}</td></tr>
<tr><td>3</td><td>Conveyance</td><td>{{conveyance}}</td></tr>
<tr><td>4</td><td>Other Allowance</td><td>{{other_allowance}}</td></tr>
<tr class="lt-total"><td>A</td><td>Total (A)</td><td>{{total_ctc}}</td></tr>
</table>
<p>(b) The remuneration will be deposited monthly into your nominated account.</p>
<p>(c) TDS is deductible on salary; the calculation of this is based on the Income Tax Act of India, and the amount varies depending on the personal tax planning of the individual.</p>
<p>(d) The above-mentioned remuneration is the total cost to the company and includes all payments made and benefits (including all allowances, statutory benefits) provided by the company directly or indirectly to you or on your behalf, whether as salary or otherwise. The breakup will be provided on your salary slip at the end of each month.</p>
<p>(e) You will be entitled to all the statutory benefits applicable to you.</p>
<p class="lt-heading">7. Deductions</p>
<p>The remuneration is subject to income tax and other statutory deductions based on applicable laws in force from time to time.</p>
<p class="lt-heading">8. Leave</p>
<p>Based on the leave policy of the company, a total of {{leave_days}} days of paid leave are provided annually.</p>
<p class="lt-heading">9. Company Policies</p>
<p>You agree that the company policies, as amended or replaced from time to time, shall be binding upon you. All policies are made available on the HRMS software for easy reference. Any queries regarding the same can be emailed to team.hr@jadecouture.com.</p>
<p class="lt-heading">10. Confidentiality and Intellectual Property</p>
<p>(a) You agree that you will not divulge any of the confidential information or trade secrets of the company to any person, whether during or after the termination of your employment.</p>
<p>(b) You agree that you will not use, attempt to use, or assist another person in using any confidential information you may acquire in the course of your employment in a manner which may cause loss to the company.</p>
<p>(c) You may be required to sign a Non-Disclosure Agreement at any point in time during the course of your employment.</p>
<p class="lt-heading">11. Termination</p>
<p>(a) During your employment, either party may terminate this agreement by providing written notice of 1 month (or payment in lieu of notice) to the other party.</p>
<p>(b) Notwithstanding sub-clause (a) above, the Employer may terminate this agreement by notice effective immediately without payment (except salary accrued to the date of termination) where you have committed an act of willful or serious misconduct, are significantly neglectful of your duties, or you are in breach of this agreement.</p>
<p class="lt-heading">12. Retirement</p>
<p>The retirement age for all employees is 60 years. An employee can be retired at any age before attaining the age of sixty years during their tenure at the Company if they are unable to continue in service satisfactorily due to any form of physical or mental infirmity or not able to perform given work.</p>
<p class="lt-heading">13. Documents to be Submitted</p>
<p>Before joining, please email (if not submitted already) the following information and documents to team.hr@jadecouture.com:</p>
<ol>
<li>Proof of identity and address: GOI-issued Aadhar Card or Passport</li>
<li>PAN card</li>
<li>Scanned copy of the last salary slip drawn</li>
<li>Bank details and account number in which you would like your salary to be deposited</li>
</ol>
<p>This Letter of Offer contains the proposed Terms and Conditions of your employment and is subject to confirmation after successful completion of the probation period.</p>
<p>We look forward to welcoming you to {{company_name}}.</p>
<div class="lt-sign"><p>Yours sincerely,<br>For <strong>{{company_name}}</strong></p><div class="lt-sign-space"></div><p><span class="lt-sign-name"><strong>{{signatory_name}}</strong></span><br><span class="lt-sign-meta">{{signatory_title}}</span></p></div>
<div class="lt-accept"><span class="lt-label">Acceptance</span><p>I, <strong>{{employee_name}}</strong>, have read and understood the terms and conditions of this offer of employment and accept them.</p><table><tr><td><span>Signature</span></td><td><span>Date</span></td><td><span>Place</span></td></tr></table></div>
$body$ where letter_type = 'offer_employment';

update hr_letter_templates set updated_at = now(), body = $body$
<p class="lt-dateline"><span>Mumbai</span><span><strong>{{letter_date}}</strong></span></p>
<div class="lt-to"><span class="lt-label">To</span><strong>{{employee_name}}</strong><br>{{address}}<br>{{email}}</div>
<p class="lt-subject">Offer of Internship</p>
<p>Dear {{employee_name}},</p>
<p>Following your application and subsequent interview, we are pleased to offer you an internship with {{company_name}}. During the internship, you will undertake the roles and responsibilities delegated to you by your department head.</p>
<p>The details of your internship are as follows:</p>
<table class="lt-details">
<tr><td>Internship role</td><td>{{internship_role}}</td></tr>
<tr><td>Department</td><td>{{department}}</td></tr>
<tr><td>Stipend</td><td>{{stipend}}</td></tr>
<tr><td>Date of commencement</td><td>{{commencement_date}}</td></tr>
<tr><td>Duration</td><td>{{duration}}</td></tr>
<tr><td>Hours and days of work</td><td>{{work_hours}}</td></tr>
<tr><td>Location</td><td>{{work_location}}</td></tr>
</table>
<p>On satisfactory completion of the internship, you will be issued a letter of completion.</p>
<p>To confirm this offer, please sign the acceptance below and return a copy to team.hr@jadecouture.com. We look forward to working with you.</p>
<div class="lt-sign"><p>Yours sincerely,<br>For <strong>{{company_name}}</strong></p><div class="lt-sign-space"></div><p><span class="lt-sign-name"><strong>{{signatory_name}}</strong></span><br><span class="lt-sign-meta">{{signatory_title}}</span></p></div>
<div class="lt-accept"><span class="lt-label">Acceptance</span><p>I, <strong>{{employee_name}}</strong>, accept the offer of internship on the terms set out above.</p><table><tr><td><span>Signature</span></td><td><span>Date</span></td><td><span>Place</span></td></tr></table></div>
$body$ where letter_type = 'offer_internship';

update hr_letter_templates set updated_at = now(), body = $body$
<p class="lt-dateline"><span>Mumbai</span><span><strong>{{letter_date}}</strong></span></p>
<div class="lt-to"><span class="lt-label">To</span><strong>{{employee_name}}</strong><br>Employee Code: {{employee_code}}</div>
<p class="lt-subject">Relieving and Experience Letter</p>
<p>Dear {{employee_name}},</p>
<p>This is to certify that <strong>{{employee_name}}</strong> was employed with {{company_name}} from <strong>{{start_date}}</strong> to <strong>{{end_date}}</strong> in the following capacity:</p>
<table class="lt-details">
<tr><td>Designation</td><td>{{designation}}</td></tr>
<tr><td>Department</td><td>{{department}}</td></tr>
<tr><td>Last working day</td><td>{{end_date}}</td></tr>
</table>
<p>You stand relieved of your duties with effect from the close of business on {{end_date}}. {{conduct_remark}}</p>
<p>We thank you for your contribution to {{company_name}} and wish you every success in your future endeavours.</p>
<div class="lt-sign"><p>Yours sincerely,<br>For <strong>{{company_name}}</strong></p><div class="lt-sign-space"></div><p><span class="lt-sign-name"><strong>{{signatory_name}}</strong></span><br><span class="lt-sign-meta">{{signatory_title}}</span></p></div>
$body$ where letter_type = 'relieving';

update hr_letter_templates set updated_at = now(), body = $body$
<p class="lt-title">Employee Confirmation Review</p>
<table class="lt-details">
<tr><td>Employee name</td><td>{{employee_name}}</td></tr>
<tr><td>Department</td><td>{{department}}</td></tr>
<tr><td>Period of review</td><td>{{review_period}}</td></tr>
<tr><td>Reviewer</td><td>{{reviewer_title}}</td></tr>
<tr><td>Date</td><td>{{letter_date}}</td></tr>
</table>
<p class="lt-heading">Performance Evaluation</p>
<table class="lt-rating">
<tr><th>Parameter</th><th>Excellent</th><th>Good</th><th>Fair</th><th>Poor</th><th>Comments</th></tr>
<tr><td>Work quality</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Productivity</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Technical skills</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Right / positive attitude</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Attendance / punctuality</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Communication skills</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Teamwork</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Leadership quality</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Works well under pressure</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Meets deadlines</td><td></td><td></td><td></td><td></td><td></td></tr>
</table>
<p class="lt-heading">HOD Feedback</p>
<table class="lt-rating">
<tr><th>Parameter</th><th>Excellent</th><th>Good</th><th>Fair</th><th>Poor</th><th>Comments</th></tr>
<tr><td>Willing to take more responsibility</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Open to feedback</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Ability to work independently</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Initiative</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Effective problem-solving</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td><strong>Overall rating</strong></td><td></td><td></td><td></td><td></td><td></td></tr>
</table>
<p class="lt-heading">Opportunities for Development</p>
<div class="lt-lines"></div>
<p class="lt-heading">Reviewer Comments</p>
<div class="lt-lines"></div>
<p class="lt-note">By signing this form, you confirm that you have discussed this review in detail with your reviewer. Signing this form does not necessarily indicate that you agree with this performance evaluation.</p>
<div class="lt-accept"><span class="lt-label">Sign-off</span><table><tr><td><span>Employee signature</span></td><td><span>Reviewer signature</span></td><td><span>Date</span></td></tr></table></div>
$body$ where letter_type = 'review_form';

update hr_letter_templates set updated_at = now(), body = $body$
<p class="lt-dateline"><span class="lt-confidential">Private &amp; Confidential</span><span>Mumbai, <strong>{{letter_date}}</strong></span></p>
<div class="lt-to"><span class="lt-label">To</span><strong>{{employee_name}}</strong><br>{{designation}}, {{department}}<br>Employee Code: {{employee_code}}</div>
<p class="lt-subject">Termination of Employment</p>
<p>Dear {{employee_name}},</p>
<p>After careful consideration, we regret to inform you that your employment with {{company_name}} is terminated, effective immediately.</p>
<p>This decision follows a thorough review of your performance and conduct. The factors that have contributed to this outcome include:</p>
{{termination_reasons}}
<p>Despite previous discussions and opportunities to improve, the necessary changes have not been made. This decision is in accordance with the terms and conditions outlined in your employment contract.</p>
<p>Kindly ensure that you complete a thorough handover of your responsibilities, and return all company property in your possession, to your manager before your departure. Your final settlement will be processed as per company policy. Should you have any questions or require further clarification, please reach out to the HR department at team.hr@jadecouture.com.</p>
<p>We wish you the best in your future endeavours.</p>
<div class="lt-sign"><p>Yours sincerely,<br>For <strong>{{company_name}}</strong></p><div class="lt-sign-space"></div><p><span class="lt-sign-name"><strong>{{signatory_name}}</strong></span><br><span class="lt-sign-meta">{{signatory_title}}</span></p></div>
$body$ where letter_type = 'termination';

update hr_letter_templates set updated_at = now(), body = $body$
<p class="lt-dateline"><span class="lt-confidential">Private &amp; Confidential</span><span>Mumbai, <strong>{{letter_date}}</strong></span></p>
<div class="lt-to"><span class="lt-label">To</span><strong>{{employee_name}}</strong><br>{{designation}}, {{department}}<br>Employee Code: {{employee_code}}</div>
<p class="lt-subject">{{warning_subject}}</p>
<p>Dear {{employee_name}},</p>
<p>This letter is to formally address concerns regarding your performance and conduct in the workplace. As an employee of {{company_name}}, you are expected to adhere to company policies and to demonstrate professionalism at all times.</p>
<div class="lt-callout">{{warning_body}}</div>
<p>Please be advised that the above is in violation of company policies and expectations. Continued disregard for these standards may result in further disciplinary action, up to and including termination of employment.</p>
<p>We trust that you will take this warning seriously and make the necessary improvements. If you would like to discuss this letter, please speak to the HR department.</p>
<div class="lt-sign"><p>Yours sincerely,<br>For <strong>{{company_name}}</strong></p><div class="lt-sign-space"></div><p><span class="lt-sign-name"><strong>{{signatory_name}}</strong></span><br><span class="lt-sign-meta">{{signatory_title}}</span></p></div>
<div class="lt-accept"><span class="lt-label">Acknowledgement of receipt</span><p>I, <strong>{{employee_name}}</strong>, acknowledge that I have received this letter.</p><table><tr><td><span>Signature</span></td><td><span>Date</span></td><td></td></tr></table></div>
$body$ where letter_type = 'warning';
