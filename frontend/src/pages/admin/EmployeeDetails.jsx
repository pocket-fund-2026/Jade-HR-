import { ArrowLeft, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import { formatINR } from "../../lib/format.js";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ROLE_LABELS = { employee: "Employee", hr: "HR", accounts: "Accounts" };

// Fields tagged core:true live on hr_employees; everything else lives on
// hr_employee_profile. The renderer doesn't care — it just reads/writes
// form[key] — but save() uses this flag to split the payload in two.
const SECTIONS = [
  {
    key: "personal",
    label: "Personal",
    groups: [
      {
        fields: [
          { k: "gender", l: "Gender", t: "select", options: ["Male", "Female", "Other"] },
          { k: "father_name", l: "Father Name", t: "text" },
          { k: "mother_name", l: "Mother Name", t: "text" },
          { k: "spouse_name", l: "Spouse Name", t: "text" },
          { k: "blood_group", l: "Blood Group", t: "select", options: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] },
          { k: "old_employee_code", l: "OLD Employee Code", t: "text" },
          { k: "highest_qualification", l: "Highest Qualification", t: "text" },
          { k: "employee_type", l: "Employee Type", t: "select", options: ["Permanent", "Contract", "Probation", "Intern", "Consultant"] },
          { k: "aadhar_no", l: "Aadhar No", t: "text" },
          { k: "nationality", l: "Nationality", t: "text" },
          { k: "pan_no", l: "PAN No", t: "text" },
          { k: "marital_status", l: "Marital Status", t: "select", options: ["Single", "Married", "Divorced", "Widowed"] },
        ],
      },
    ],
  },
  {
    key: "official",
    label: "Official",
    groups: [
      {
        fields: [
          { k: "company", l: "Company", t: "text" },
          { k: "location", l: "Location", t: "text", core: true },
          { k: "department", l: "Department", t: "text", core: true },
          { k: "sub_department", l: "Sub Department", t: "text" },
          { k: "designation", l: "Designation", t: "text", core: true },
          { k: "grade", l: "Grade", t: "text" },
          { k: "category", l: "Category", t: "text" },
          { k: "level", l: "Level", t: "text" },
          { k: "cost_center", l: "Cost Center", t: "text" },
          { k: "unit", l: "Unit", t: "text" },
          { k: "shift_roster", l: "Shift Roster", t: "text" },
          { k: "shift_category", l: "Shift Category", t: "text" },
          { k: "holiday_group", l: "Holiday Group", t: "text" },
          { k: "shift_group", l: "Shift Group", t: "text" },
          { k: "weekly_off_day", l: "Weekly Off", t: "weekday", core: true },
          { k: "_attendance_cycle", l: "Attendance Cycle", t: "static", staticValue: "23rd (previous month) – 22nd (current month)" },
          { k: "ess_role", l: "ESS Role", t: "text" },
          { k: "head_of_department", l: "Head of Department", t: "boolean" },
          { k: "reporting_to", l: "Reporting To", t: "text" },
          { k: "leave_approver_id", l: "Leave Approver", t: "approver", core: true },
          { k: "employee_category", l: "Employee Category", t: "select", options: ["corporate", "factory_retail"], core: true, hint: "Corporate roster staff are covered by the Leave & Attendance Policy v1.1 (Red Card/LOP, holiday calendar, PL/Paternity/Maternity/Compassionate/Comp-Off leave)" },
          { k: "standard_working_days_per_month", l: "Standard Working Days / Month", t: "number", core: true, hint: "Overrides the pay-period length used to compute per-day salary — leave blank to use the default (~30–31 days)" },
          { k: "role", l: "Console Role", t: "role", core: true },
        ],
      },
    ],
  },
  {
    key: "dates",
    label: "Dates",
    groups: [
      {
        fields: [
          { k: "date_of_birth", l: "Date of Birth", t: "date" },
          { k: "date_of_joining", l: "Date of Joining", t: "date", core: true },
          { k: "probation_completion_date", l: "Probation Completion Date", t: "date" },
          { k: "confirmation_date", l: "Confirmation Date", t: "date" },
          { k: "last_promotion_date", l: "Last Promotion Date", t: "date" },
          { k: "next_promotion_date", l: "Next Promotion Date", t: "date" },
          { k: "gratuity_date", l: "Gratuity Date", t: "date" },
          { k: "transfer_date", l: "Transfer Date", t: "date" },
          { k: "marriage_date", l: "Marriage Date", t: "date" },
          { k: "retirement_date", l: "Retirement Date", t: "date" },
          { k: "contract_start_date", l: "Contract Start Date", t: "date" },
          { k: "contract_end_date", l: "Contract End Date", t: "date" },
          { k: "last_reappointment_date", l: "Last Reappointment Date", t: "date" },
          { k: "last_exit_date_rejoinee", l: "Last Exit Date (ReJoinee)", t: "date" },
          { k: "scheduled_exit_date", l: "Scheduled Exit Date", t: "date" },
          { k: "exit_date", l: "Exit Date", t: "date" },
          { k: "settlement_date", l: "Settlement Date", t: "date" },
          { k: "reason_of_leaving", l: "Reason Of Leaving", t: "select", options: ["Resign", "Termination", "Retirement", "Contract End", "Absconding", "Other"] },
          { k: "employee_status", l: "Employee Status", t: "select", options: ["Active", "Inactive", "On Notice", "Exited"] },
        ],
      },
    ],
  },
  {
    key: "communication",
    label: "Communication",
    groups: [
      {
        fields: [
          { k: "phone", l: "Mobile No", t: "text", core: true },
          { k: "emergency_contact_no", l: "Emergency Contact No", t: "text" },
          { k: "email", l: "Official Email Id", t: "text", core: true },
          { k: "personal_email_id", l: "Personal Email Id", t: "text" },
          { k: "current_address", l: "Current Address", t: "textarea" },
          { k: "permanent_address", l: "Permanent Address", t: "textarea" },
          { k: "additional_contact_1_name", l: "Additional Contact 1 — Name", t: "text" },
          { k: "additional_contact_1_phone", l: "Additional Contact 1 — Phone", t: "text" },
          { k: "additional_contact_2_name", l: "Additional Contact 2 — Name", t: "text" },
          { k: "additional_contact_2_phone", l: "Additional Contact 2 — Phone", t: "text" },
          { k: "freeze_salary", l: "Freeze Salary", t: "boolean" },
          { k: "freeze_reason", l: "Freeze Reason", t: "text" },
        ],
      },
      {
        title: "Mobile Attendance Settings",
        fields: [
          { k: "mobile_punch", l: "Mobile Punch", t: "boolean" },
          { k: "mobile_punch_remarks", l: "Remarks", t: "text" },
          { k: "is_remarks_mandatory", l: "Is Remarks Mandatory", t: "boolean" },
          { k: "requires_selfie_checkin", l: "Selfie while Punch", t: "boolean", core: true },
          { k: "geo_location_selection", l: "GEO Location Selection", t: "boolean" },
          { k: "geo_fencing", l: "GEO fencing", t: "boolean" },
          { k: "system_punch", l: "System Punch", t: "boolean" },
          { k: "sequential_punch_only", l: "Enable only the Out Punch Button after the In Punch & vice versa", t: "boolean", wide: true },
        ],
      },
    ],
  },
  {
    key: "job_profile",
    label: "Job Profile",
    groups: [
      {
        fields: [
          { k: "job_profile", l: "Job Profile", t: "textarea", wide: true },
          { k: "job_description", l: "Job Description", t: "textarea", wide: true },
        ],
      },
    ],
  },
  {
    key: "compliances",
    label: "Compliances",
    groups: [
      {
        title: "PF Details",
        fields: [
          { k: "pf_registration", l: "PF Registration", t: "text" },
          { k: "pf_applicable", l: "PF Applicable", t: "boolean" },
          { k: "pf_no", l: "PF No", t: "text" },
          { k: "eps_applicable", l: "EPS Applicable", t: "boolean" },
          { k: "uan_no", l: "UAN No", t: "text" },
          { k: "epf_join_date", l: "EPF Join Date", t: "date" },
          { k: "eps_join_date", l: "EPS Join Date", t: "date" },
          { k: "pf_gross_limit", l: "PF Gross Limit (0 = full salary)", t: "number" },
          { k: "eps_exit_date", l: "EPS Exit Date", t: "date" },
          { k: "vpf_amount", l: "VPF (<100 = %, else Amount)", t: "number" },
        ],
      },
      {
        title: "ESIC Details",
        fields: [
          { k: "esic_registration", l: "ESIC Registration", t: "text" },
          { k: "esic_applicable", l: "ESIC Applicable", t: "boolean" },
          { k: "esic_no", l: "ESIC No", t: "text" },
          { k: "dispensary_name", l: "Dispensary Name", t: "text" },
        ],
      },
      {
        title: "PT Details",
        fields: [
          { k: "pt_registration", l: "Profession Tax Registration", t: "text" },
          { k: "pt_applicable", l: "PT Applicable", t: "boolean" },
        ],
      },
      {
        title: "Labour Welfare Fund Details",
        fields: [
          { k: "lwf_registration", l: "Labour Welfare Registration", t: "text" },
          { k: "lwf_applicable", l: "LWF Applicable", t: "boolean" },
        ],
      },
    ],
  },
  {
    key: "other",
    label: "Other Details",
    groups: [
      {
        fields: [
          { k: "identification_mark", l: "Identification Mark", t: "text" },
          { k: "is_senior_citizen", l: "Is Senior Citizen", t: "boolean", hint: "Age ≥ 60 and < 80" },
          { k: "is_super_senior_citizen", l: "Is Super Senior Citizen", t: "boolean", hint: "Age ≥ 80" },
          { k: "severe_disability", l: "Severe Disability", t: "boolean" },
          { k: "severe_disability_details", l: "Severe Disability Details", t: "text" },
          { k: "additional_info", l: "Additional Information", t: "textarea", wide: true },
        ],
        note: "If Severe Disability is ticked, ₹1,600 or ₹3,200 per month exemption is allowed for handicap, and conveyance should be paid in the payslip. Profession tax is not applicable.",
      },
    ],
  },
];

const CORE_KEYS = new Set(
  SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields)).filter((f) => f.core).map((f) => f.k),
);
const DATE_KEYS = new Set(
  SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields)).filter((f) => f.t === "date").map((f) => f.k),
);
const PROFILE_KEYS = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields))
  .filter((f) => !f.core && f.t !== "static")
  .map((f) => f.k);

const EMPTY_CORE = {
  employee_code: "", first_name: "", last_name: "", designation: "", department: "",
  location: "Madhu Estate, Mumbai", date_of_joining: "", basic: 0, hra: 0, conveyance: 0,
  other_allowance: 0, standard_hours_per_day: 8, weekly_off_day: 6, phone: "", email: "",
  role: "employee", password: "", requires_selfie_checkin: false, is_active: true,
  leave_approver_id: "", employee_category: "factory_retail", standard_working_days_per_month: "",
};
const EMPTY_PROFILE = Object.fromEntries(
  SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields))
    .filter((f) => !f.core && f.t !== "static")
    .map((f) => [f.k, f.t === "boolean" ? false : f.t === "number" ? (f.k === "pf_gross_limit" ? 15000 : 0) : ""]),
);
const EMPTY_FORM = { ...EMPTY_CORE, ...EMPTY_PROFILE, udfs: [] };

// Salary Structure — versioned by effective date, a separate resource from
// the fields above (see backend/routers/salary_structure.py).
const SS_MANUAL_FIELDS = [
  { k: "me_basic", l: "Basic" },
  { k: "me_hra", l: "HRA" },
  { k: "me_conv", l: "Conv" },
  { k: "me_other_allow", l: "Other Allow" },
  { k: "me_monthly_bonus", l: "Monthly Bonus" },
  { k: "me_retention", l: "Retention" },
  { k: "me_incentive", l: "Incentive" },
];
const SS_EARNING_FIELDS = [
  { k: "earn_basic", l: "Basic" },
  { k: "earn_hra", l: "HRA" },
  { k: "earn_conv", l: "Conv" },
  { k: "earn_other_allow", l: "Other Allow" },
  { k: "earn_ot_amt", l: "OTAmt" },
  { k: "earn_arrear", l: "Arrear" },
  { k: "earn_bonus", l: "Bonus" },
  { k: "earn_leave_encash", l: "Leave Encash" },
  { k: "earn_monthly_bonus", l: "Monthly Bonus" },
  { k: "earn_performance_linked_pay", l: "Performance Linked Pay (variable)" },
  { k: "earn_retention", l: "Retention" },
  { k: "earn_incentive", l: "Incentive" },
  { k: "earn_ctc", l: "CTC" },
  { k: "earn_total_arr", l: "TotalArr" },
];
const SS_DEDUCTIONS_FIELDS = [
  { k: "ded_pf", l: "PF" },
  { k: "ded_pt", l: "PT" },
  { k: "ded_vpf", l: "VPF" },
  { k: "ded_esic", l: "ESIC" },
  { k: "ded_tds", l: "TDS" },
  { k: "ded_loan", l: "Loan" },
  { k: "ded_advance", l: "Advance" },
  { k: "ded_loan_int", l: "Loan_Int" },
  { k: "ded_lwf", l: "LWF" },
  { k: "ded_other_ded", l: "OtherDed" },
  { k: "ded_salary_advance", l: "Salary Advance" },
  { k: "ded_pf_arrear", l: "PF_Arrear" },
];
const SS_OTHERS_FIELDS = [
  { k: "oth_pt_wages", l: "PT Wages" },
  { k: "oth_lwf_wages", l: "LWF Wages" },
  { k: "oth_eps_wages", l: "EPS Wages" },
  { k: "oth_eps", l: "EPS" },
  { k: "oth_epf", l: "EPF" },
  { k: "oth_edli_charges", l: "EDLI Charges" },
  { k: "oth_pf_admin_charges", l: "PF Admin Charges" },
  { k: "oth_edli_admin_charges", l: "EDLI Admin Charges" },
  { k: "oth_esic_wages", l: "ESIC Wages" },
  { k: "oth_esic_employer", l: "ESIC Employer" },
  { k: "oth_pf_wages", l: "PF Wages" },
  { k: "oth_edli_wages", l: "EDLI Wages" },
];
const SS_TABS = [
  { key: "manual", label: "Manual Entry (Prorata)", fields: SS_MANUAL_FIELDS },
  { key: "earning", label: "Earning (Calculated)", fields: SS_EARNING_FIELDS },
  { key: "deductions", label: "Deductions (Calculated)", fields: SS_DEDUCTIONS_FIELDS },
  { key: "others", label: "Others (Calculated)", fields: SS_OTHERS_FIELDS },
];
const EMPTY_SALARY_STRUCTURE = {
  effective_date: new Date().toISOString().slice(0, 10),
  ...Object.fromEntries(
    [...SS_MANUAL_FIELDS, ...SS_EARNING_FIELDS, ...SS_DEDUCTIONS_FIELDS, ...SS_OTHERS_FIELDS].map((f) => [f.k, 0]),
  ),
  salary_remarks: "",
};

// Mirrors backend/routers/salary_structure.py's _compute_summary — client
// side is just a live preview, the server recomputes authoritatively on save.
function computeSalarySummary(f) {
  const num = (k) => Number(f[k]) || 0;
  const totalEarnings = [
    "earn_basic", "earn_hra", "earn_conv", "earn_other_allow", "earn_ot_amt", "earn_arrear",
    "earn_bonus", "earn_leave_encash", "earn_monthly_bonus", "earn_performance_linked_pay",
    "earn_retention", "earn_incentive",
  ].reduce((s, k) => s + num(k), 0);
  const totalDeductions = [
    "ded_pf", "ded_pt", "ded_vpf", "ded_esic", "ded_tds", "ded_loan", "ded_advance",
    "ded_loan_int", "ded_lwf", "ded_other_ded", "ded_salary_advance", "ded_pf_arrear",
  ].reduce((s, k) => s + num(k), 0);
  const employerSide = ["oth_eps", "oth_epf", "oth_edli_charges", "oth_pf_admin_charges", "oth_edli_admin_charges", "oth_esic_employer"]
    .reduce((s, k) => s + num(k), 0);
  const ctcMonthly = totalEarnings + employerSide;
  return {
    totalEarnings,
    totalDeductions,
    netSalary: totalEarnings - totalDeductions,
    ctcMonthly,
    ctcYearly: ctcMonthly * 12,
  };
}

function formatFullDate(value) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

function Field({ field, value, editing, onChange, extra }) {
  const { l: label, t: type, options, hint, wide } = field;
  const span = wide || type === "textarea" ? "col-span-2" : "";

  if (type === "static") {
    return (
      <div className={span}>
        <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">{label}</label>
        <p className="text-sm text-ink/70 italic">{field.staticValue}</p>
      </div>
    );
  }

  if (!editing) {
    let display = value;
    if (type === "boolean") display = value ? "Yes" : "No";
    else if (type === "date") display = formatFullDate(value);
    else if (type === "number" && field.k === "pf_gross_limit") display = formatINR(value || 0);
    else if (value === "" || value == null) display = "—";
    return (
      <div className={span}>
        <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">{label}</label>
        <p className="text-sm text-ink font-medium">{display}</p>
        {hint && <p className="text-[11px] text-ink/65 mt-1">{hint}</p>}
      </div>
    );
  }

  const baseClass = "w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500 disabled:opacity-50 disabled:bg-ink/5";

  const inputId = `field-${field.k}`;

  if (type === "boolean") {
    return (
      <div className={`flex items-center gap-2 pt-6 ${span}`}>
        <input
          id={inputId}
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 accent-jade-600"
          {...extra}
        />
        <label htmlFor={inputId} className="text-sm text-ink">{label}</label>
        {hint && <span className="text-[11px] text-ink/65">({hint})</span>}
      </div>
    );
  }

  if (type === "select") {
    return (
      <div className={span}>
        <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">{label}</label>
        <select id={inputId} className={baseClass} value={value || ""} onChange={(e) => onChange(e.target.value)} {...extra}>
          <option value="">—</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  if (type === "textarea") {
    return (
      <div className={span}>
        <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">{label}</label>
        <textarea id={inputId} className={baseClass} rows={3} value={value || ""} onChange={(e) => onChange(e.target.value)} {...extra} />
      </div>
    );
  }

  return (
    <div className={span}>
      <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">{label}</label>
      <input
        id={inputId}
        type={type === "number" ? "number" : type === "date" ? "date" : "text"}
        className={`${baseClass} font-nums`}
        value={value ?? ""}
        onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
        {...extra}
      />
    </div>
  );
}

function Group({ group, form, editing, onFieldChange }) {
  return (
    <div className={group.title ? "border-t border-ink/10 pt-6 mt-6 first:border-0 first:pt-0 first:mt-0" : ""}>
      {group.title && <p className="text-xs font-semibold uppercase tracking-wider text-ochre-700 mb-4">{group.title}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
        {group.fields.map((field) => (
          <Field
            key={field.k}
            field={field}
            value={form[field.k]}
            editing={editing}
            onChange={(v) => onFieldChange(field.k, v)}
          />
        ))}
      </div>
      {group.note && <p className="text-[11px] text-ink/65 mt-4 leading-relaxed">{group.note}</p>}
    </div>
  );
}

function UDFSection({ udfs, editing, onChange }) {
  const list = udfs || [];
  const update = (i, key, val) => onChange(list.map((u, idx) => (idx === i ? { ...u, [key]: val } : u)));
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  const add = () => onChange([...list, { udf_name: "", udf_value: "" }]);

  if (!editing) {
    return list.length === 0 ? (
      <p className="text-sm text-ink/70">No user defined fields.</p>
    ) : (
      <div className="bg-manila/30 rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left">
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink/70">UDF Name</th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink/70">UDF Value</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u, i) => (
              <tr key={i} className="border-b border-ink/[0.06] last:border-0">
                <td className="px-3 py-2 text-ink">{u.udf_name || "—"}</td>
                <td className="px-3 py-2 text-ink/70">{u.udf_value || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {list.map((u, i) => (
        <div key={i} className="flex items-center gap-3">
          <input
            className="flex-1 rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
            placeholder="UDF Name"
            value={u.udf_name}
            onChange={(e) => update(i, "udf_name", e.target.value)}
          />
          <input
            className="flex-1 rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
            placeholder="UDF Value"
            value={u.udf_value}
            onChange={(e) => update(i, "udf_value", e.target.value)}
          />
          <button type="button" onClick={() => remove(i)} aria-label="Remove field" className="text-ink/70 hover:text-rust-500 p-1">
            <X size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-xs font-medium text-jade-600 hover:text-jade-700"
      >
        <Plus size={14} /> Add field
      </button>
    </div>
  );
}

function LineItemTable({ fields, form, editing, onChange }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-ink/10 text-left">
          <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-ink/70">Description</th>
          <th className="py-2 text-xs font-semibold uppercase tracking-wider text-ink/70">Value</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((f) => (
          <tr key={f.k} className="border-b border-ink/[0.06] last:border-0">
            <td className="py-2 pr-4 text-ink/80">{f.l}</td>
            <td className="py-2">
              {editing ? (
                <input
                  type="number"
                  className="w-full max-w-[160px] rounded-sm border border-ink/15 bg-manila/40 px-2.5 py-1.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                  value={form[f.k] ?? 0}
                  onChange={(e) => onChange(f.k, Number(e.target.value))}
                />
              ) : (
                <span className="font-nums text-ink">{formatINR(form[f.k] || 0)}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SalaryStructureSection({ employeeId, dateOfJoining, canView, canEdit }) {
  const [list, setList] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [mode, setMode] = useState("list");
  const [record, setRecord] = useState(EMPTY_SALARY_STRUCTURE);
  const [recordId, setRecordId] = useState(null);
  const [subTab, setSubTab] = useState("manual");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadList = () => {
    setLoadingList(true);
    api.get(`/api/employees/${employeeId}/salary-structures`)
      .then(({ data }) => setList(data))
      .finally(() => setLoadingList(false));
  };

  useEffect(() => {
    if (canView) loadList();
  }, [employeeId, canView]);

  const openNew = () => {
    setRecord(EMPTY_SALARY_STRUCTURE);
    setRecordId(null);
    setSubTab("manual");
    setError("");
    setMode("edit");
  };

  const openExisting = (row) => {
    setRecord({ ...EMPTY_SALARY_STRUCTURE, ...row });
    setRecordId(row.id);
    setSubTab("manual");
    setError("");
    setMode("edit");
  };

  const setField = (k, v) => setRecord((r) => ({ ...r, [k]: v }));

  const save = async () => {
    setError("");
    if (dateOfJoining && record.effective_date < dateOfJoining) {
      setError("Effective Date must be on or after the Date of Joining.");
      return;
    }
    setSaving(true);
    try {
      if (recordId) {
        await api.put(`/api/employees/${employeeId}/salary-structures/${recordId}`, record);
      } else {
        await api.post(`/api/employees/${employeeId}/salary-structures`, record);
      }
      setMode("list");
      loadList();
    } catch (err) {
      setError(err.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!canView) {
    return <p className="text-sm text-ink/70">Salary structure is managed by Accounts.</p>;
  }

  if (mode === "list") {
    return (
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <p className="text-xs text-ink/70">Versioned by effective date — each row is the CTC breakdown in effect from that date forward.</p>
          {canEdit && (
            <button
              type="button"
              onClick={openNew}
              className="flex items-center gap-1.5 bg-ledger-800 text-manila px-3 py-2 rounded-sm text-xs font-semibold hover:bg-ledger-700 transition-colors flex-shrink-0"
            >
              <Plus size={14} /> Add Salary Structure
            </button>
          )}
        </div>
        {loadingList ? (
          <p className="text-sm text-ink/70">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-ink/70">No salary structure recorded yet.</p>
        ) : (
          <div className="bg-manila/30 rounded-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left">
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink/70">Effective Date</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink/70">Total Earnings</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink/70">Net Salary</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink/70">CTC Monthly</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr key={row.id} className="border-b border-ink/[0.06] last:border-0">
                    <td className="px-3 py-2.5 font-nums text-ink">{formatFullDate(row.effective_date)}</td>
                    <td className="px-3 py-2.5 font-nums text-ink/80">{formatINR(row.total_earnings)}</td>
                    <td className="px-3 py-2.5 font-nums text-ink/80">{formatINR(row.net_salary)}</td>
                    <td className="px-3 py-2.5 font-nums text-ink/80">{formatINR(row.ctc_monthly)}</td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => openExisting(row)}
                        className="text-jade-600 hover:text-jade-700 hover:underline text-xs font-medium"
                      >
                        {canEdit ? "Edit" : "View"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const summary = computeSalarySummary(record);

  return (
    <div>
      <button
        type="button"
        onClick={() => setMode("list")}
        className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink mb-4"
      >
        <ArrowLeft size={13} /> Back to Salary Structure list
      </button>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div>
          <label htmlFor="ss_effective_date" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Effective Date</label>
          <input
            id="ss_effective_date"
            type="date"
            disabled={!canEdit}
            className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 disabled:opacity-50"
            value={record.effective_date}
            onChange={(e) => setField("effective_date", e.target.value)}
          />
          <p className="text-[11px] text-ink/65 mt-1">
            Should be on or after Joining Date{dateOfJoining ? ` (${formatFullDate(dateOfJoining)})` : ""}.
          </p>
        </div>
      </div>

      <div className="flex overflow-x-auto border-b border-ink/10 mb-5">
        {SS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSubTab(t.key)}
            className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap border-b-2 transition-colors ${
              subTab === t.key ? "border-jade-500 text-ink" : "border-transparent text-ink/40 hover:text-ink/70"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {SS_TABS.filter((t) => t.key === subTab).map((t) => (
        <LineItemTable key={t.key} fields={t.fields} form={record} editing={canEdit} onChange={setField} />
      ))}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 p-4 bg-manila/30 rounded-sm">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink/70">Total Earnings</p>
          <p className="font-nums text-ink font-semibold">{formatINR(summary.totalEarnings)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink/70">Total Deductions</p>
          <p className="font-nums text-ink font-semibold">{formatINR(summary.totalDeductions)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink/70">Net Salary</p>
          <p className="font-nums text-ink font-semibold">{formatINR(summary.netSalary)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink/70">CTC Monthly</p>
          <p className="font-nums text-ink font-semibold">{formatINR(summary.ctcMonthly)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink/70">CTC Yearly</p>
          <p className="font-nums text-ink font-semibold">{formatINR(summary.ctcYearly)}</p>
        </div>
      </div>

      <div className="mt-5">
        <label htmlFor="salary_remarks" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Salary Remarks</label>
        <textarea
          id="salary_remarks"
          disabled={!canEdit}
          className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 disabled:opacity-50 min-h-[70px]"
          value={record.salary_remarks}
          onChange={(e) => setField("salary_remarks", e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5 mt-4">{error}</p>}

      {canEdit && (
        <div className="flex justify-end gap-3 mt-5">
          <button type="button" onClick={() => setMode("list")} className="text-sm text-ink/70 hover:text-ink px-4 py-2.5">Cancel</button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function EmployeeDetails() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const canManage = can("employees.manage");
  const canViewSalary = can("salary.view", "salary.edit");
  const canEditSalary = can("salary.edit");
  const canAssignRole = user?.role === "accounts";

  const [form, setForm] = useState(EMPTY_FORM);
  const [mode, setMode] = useState(isNew ? "edit" : "view");
  const [activeTab, setActiveTab] = useState("personal");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [employeesList, setEmployeesList] = useState([]);

  useEffect(() => {
    api.get("/api/employees").then(({ data }) => {
      setEmployeesList(
        data
          .filter((e) => e.is_active)
          .map((e) => ({ id: e.id, employee_code: e.employee_code, name: `${e.first_name} ${e.last_name || ""}`.trim() }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    });
  }, [canManage]);

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([
      api.get(`/api/employees/${id}`),
      api.get(`/api/employees/${id}/profile`),
    ])
      .then(([coreRes, profileRes]) => {
        const { udfs, employee_id, ...profileFields } = profileRes.data;
        setForm({
          ...EMPTY_FORM,
          ...coreRes.data,
          ...profileFields,
          date_of_joining: coreRes.data.date_of_joining || "",
          password: "",
          udfs: udfs || [],
        });
      })
      .catch((err) => setError(err.response?.data?.detail || "Could not load employee"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isNew) {
      setForm(EMPTY_FORM);
      setMode("edit");
      setActiveTab("personal");
    } else {
      setMode("view");
      load();
    }
  }, [id]);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (andThen) => {
    setError("");
    if (isNew && (!form.employee_code.trim() || !form.first_name.trim() || !form.password)) {
      setError("Employee Code, First Name, and Password are required.");
      return;
    }
    if (!form.first_name.trim()) {
      setError("First Name is required.");
      return;
    }
    setSaving(true);
    try {
      const corePayload = Object.fromEntries(
        Object.keys(EMPTY_CORE).map((k) => [k, form[k]]),
      );
      if (!corePayload.password) delete corePayload.password;
      if (corePayload.date_of_joining === "") corePayload.date_of_joining = null;
      if (corePayload.standard_working_days_per_month === "") corePayload.standard_working_days_per_month = null;
      delete corePayload.is_active;

      let employeeId = id;
      if (isNew) {
        const { data } = await api.post("/api/employees", corePayload);
        employeeId = data.id;
      } else {
        const { employee_code, ...updates } = corePayload;
        await api.put(`/api/employees/${employeeId}`, updates);
      }

      const profilePayload = Object.fromEntries(PROFILE_KEYS.map((k) => [k, form[k]]));
      for (const dateKey of DATE_KEYS) {
        if (dateKey in profilePayload && !profilePayload[dateKey]) profilePayload[dateKey] = null;
      }
      profilePayload.udfs = (form.udfs || []).filter((u) => u.udf_name || u.udf_value);
      await api.put(`/api/employees/${employeeId}/profile`, profilePayload);

      if (andThen === "list") {
        navigate("/admin/employees");
      } else if (andThen === "new") {
        navigate("/admin/employees/new");
      } else {
        navigate(`/admin/employees/${employeeId}`, { replace: true });
        if (employeeId === id) {
          setMode("view");
          load();
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (isNew) {
      navigate("/admin/employees");
    } else {
      setMode("view");
      load();
    }
  };

  const deleteEmployee = async () => {
    if (!confirm("Deactivate this employee? Their attendance/payroll history is kept — this does not erase their record.")) return;
    await api.delete(`/api/employees/${id}`);
    navigate("/admin/employees");
  };

  const editing = mode === "edit" || mode === "create" || isNew;

  const tabs = [
    ...SECTIONS.map((s) => ({ key: s.key, label: s.label })),
    { key: "udf", label: "User Defined Fields" },
    { key: "salary", label: "Salary" },
    ...(isNew ? [] : [{ key: "salary_structure", label: "Salary Structure" }]),
  ];

  if (loading) {
    return <p className="text-ink/70">Loading ledger…</p>;
  }

  if (error && !isNew && !form.employee_code) {
    return (
      <div>
        <Link to="/admin/employees" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink mb-3 transition-colors">
          <ArrowLeft size={13} /> Back to Employees
        </Link>
        <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <Link to="/admin/employees" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink mb-3 transition-colors">
        <ArrowLeft size={13} /> Back to Employees
      </Link>

      <div className="bg-paper rounded-sm shadow-card border-t-4 border-jade-500 overflow-hidden">
        {/* Header: identity + account fields, always visible regardless of active tab */}
        <div className="p-7 border-b border-ink/10">
          {editing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="employee_code" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Employee Code (biometric ID)</label>
                <input
                  id="employee_code"
                  className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 disabled:opacity-50 disabled:bg-ink/5"
                  value={form.employee_code}
                  disabled={!isNew}
                  required={isNew}
                  onChange={(e) => setField("employee_code", e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">
                  {isNew ? "Password" : "Reset Password (leave blank to keep)"}
                </label>
                <input
                  id="password"
                  type="password"
                  className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                  value={form.password}
                  required={isNew}
                  onChange={(e) => setField("password", e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="first_name" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">First Name</label>
                <input
                  id="first_name"
                  className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                  value={form.first_name}
                  required
                  onChange={(e) => setField("first_name", e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="last_name" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Last Name</label>
                <input
                  id="last_name"
                  className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                  value={form.last_name}
                  onChange={(e) => setField("last_name", e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl text-ink">{form.first_name} {form.last_name}</h2>
                <p className="text-xs text-ink/70 font-nums mt-0.5">{form.employee_code}</p>
              </div>
              <StampBadge status={form.is_active ? "active" : "inactive"}>
                {form.is_active ? "Working" : "Inactive"}
              </StampBadge>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-ink/10 bg-manila/20">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-jade-500 text-ink"
                  : "border-transparent text-ink/70 hover:text-ink/70"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-7">
          {SECTIONS.filter((s) => s.key === activeTab).map((section) => (
            <div key={section.key}>
              {section.groups.map((group, i) => {
                if (group.fields.some((f) => f.t === "role")) {
                  return (
                    <div key={i}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
                        {group.fields.map((field) => {
                          if (field.t === "role") {
                            return (
                              <div key={field.k}>
                                <label htmlFor={field.k} className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">{field.l}</label>
                                {editing && canAssignRole ? (
                                  <select
                                    id={field.k}
                                    className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                                    value={form.role}
                                    onChange={(e) => setField("role", e.target.value)}
                                  >
                                    {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                  </select>
                                ) : (
                                  <p className="text-sm text-ink font-medium">{ROLE_LABELS[form.role] || form.role}</p>
                                )}
                                {editing && !canAssignRole && (
                                  <p className="text-[11px] text-ink/65 mt-1">Only Accounts can change this.</p>
                                )}
                              </div>
                            );
                          }
                          if (field.t === "weekday") {
                            return (
                              <div key={field.k}>
                                <label htmlFor={field.k} className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">{field.l}</label>
                                {editing ? (
                                  <select
                                    id={field.k}
                                    className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                                    value={form.weekly_off_day}
                                    onChange={(e) => setField("weekly_off_day", Number(e.target.value))}
                                  >
                                    {DAY_NAMES.map((name, idx) => <option key={idx} value={idx}>{name}</option>)}
                                  </select>
                                ) : (
                                  <p className="text-sm text-ink font-medium">{DAY_NAMES[form.weekly_off_day]}</p>
                                )}
                              </div>
                            );
                          }
                          if (field.t === "approver") {
                            const current = employeesList.find((e) => e.id === form.leave_approver_id);
                            return (
                              <div key={field.k}>
                                <label htmlFor={field.k} className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">{field.l}</label>
                                {editing ? (
                                  <select
                                    id={field.k}
                                    className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                                    value={form.leave_approver_id || ""}
                                    onChange={(e) => setField("leave_approver_id", e.target.value)}
                                  >
                                    <option value="">— None —</option>
                                    {employeesList.map((e) => (
                                      <option key={e.id} value={e.id}>{e.name} ({e.employee_code})</option>
                                    ))}
                                  </select>
                                ) : (
                                  <p className="text-sm text-ink font-medium">{current ? `${current.name} (${current.employee_code})` : "—"}</p>
                                )}
                              </div>
                            );
                          }
                          return (
                            <Field key={field.k} field={field} value={form[field.k]} editing={editing} onChange={(v) => setField(field.k, v)} />
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                return <Group key={i} group={group} form={form} editing={editing} onFieldChange={setField} />;
              })}
            </div>
          ))}

          {activeTab === "udf" && (
            <UDFSection udfs={form.udfs} editing={editing} onChange={(udfs) => setField("udfs", udfs)} />
          )}

          {activeTab === "salary" && (
            canViewSalary ? (
              <div>
                <p className="text-xs text-ink/70 mb-5">Used for OT calc: Total Salary = Basic + HRA + Conveyance, divided across days/hours in the month.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field field={{ k: "basic", l: "Basic", t: "number" }} value={form.basic} editing={editing && canEditSalary} onChange={(v) => setField("basic", v)} />
                  <Field field={{ k: "hra", l: "HRA", t: "number" }} value={form.hra} editing={editing && canEditSalary} onChange={(v) => setField("hra", v)} />
                  <Field field={{ k: "conveyance", l: "Conveyance", t: "number" }} value={form.conveyance} editing={editing && canEditSalary} onChange={(v) => setField("conveyance", v)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
                  <Field field={{ k: "other_allowance", l: "Other Allowance", t: "number" }} value={form.other_allowance} editing={editing && canEditSalary} onChange={(v) => setField("other_allowance", v)} />
                  <Field field={{ k: "standard_hours_per_day", l: "Standard Hours / Day", t: "number" }} value={form.standard_hours_per_day} editing={editing && canEditSalary} onChange={(v) => setField("standard_hours_per_day", v)} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink/70">Salary structure is managed by Accounts.</p>
            )
          )}

          {activeTab === "salary_structure" && !isNew && (
            <SalaryStructureSection
              employeeId={id}
              dateOfJoining={form.date_of_joining}
              canView={canViewSalary}
              canEdit={canEditSalary}
            />
          )}
        </div>

        {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5 mx-7 mb-4">{error}</p>}

        {/* Action bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 sm:px-7 py-5 border-t border-ink/10 bg-manila/20">
          <div>
            {!editing && canManage && (
              <button type="button" onClick={deleteEmployee} className="flex items-center gap-1.5 text-sm text-rust-500 hover:text-rust-600 hover:underline">
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!editing ? (
              <>
                <Link to="/admin/employees" className="text-sm text-ink/70 hover:text-ink px-4 py-2.5">Back</Link>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setMode("edit")}
                    className="flex items-center gap-2 bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors"
                  >
                    <Pencil size={14} /> Edit
                  </button>
                )}
              </>
            ) : (
              <>
                <button type="button" onClick={cancel} className="text-sm text-ink/70 hover:text-ink px-4 py-2.5">Cancel</button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save("stay")}
                  className="bg-paper border border-ink/15 text-ink px-5 py-2.5 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save("list")}
                  className="bg-paper border border-ink/15 text-ink px-5 py-2.5 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-50 transition-colors"
                >
                  Save &amp; List
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save("new")}
                  className="flex items-center gap-2 bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
                >
                  Save &amp; New
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
