import { ChevronLeft, ChevronRight, FileSpreadsheet, Plus, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import ReportingManagerImportModal from "../../components/ReportingManagerImportModal.jsx";
import SalaryImportModal from "../../components/SalaryImportModal.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import { formatINR } from "../../lib/format.js";

const PAGE_SIZE = 20;

// Full employee master — every field available at the caller's permission
// level (the API already strips salary columns server-side when the caller
// lacks salary.view, so there's nothing extra to gate here).
async function exportMasterExcel(rows, canViewSalary) {
  const XLSX = await import("xlsx");
  const data = rows.map((e) => {
    const base = {
      "Employee Code": e.employee_code,
      "First Name": e.first_name,
      "Last Name": e.last_name,
      "Location": e.location,
      "Department": e.department,
      "Designation": e.designation,
      "Category": e.employee_category,
      "Status": e.is_active ? "Working" : "Inactive",
      "Intern": e.is_intern ? "Yes" : "No",
      "Role": e.role,
    };
    if (canViewSalary) {
      base["Basic"] = e.basic;
      base["HRA"] = e.hra;
      base["Conveyance"] = e.conveyance;
      base["Other Allowance"] = e.other_allowance;
      base["Gross (B+H+C)"] = Number(e.basic || 0) + Number(e.hra || 0) + Number(e.conveyance || 0);
    }
    return base;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employee Master");
  XLSX.writeFile(wb, `jade-hr-employee-master-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// Every field on hr_employees + hr_employee_profile (everything under the
// Employee Details tabs), one row per employee — labels mirror
// EmployeeDetails.jsx's SECTIONS so this reads the same way that screen does.
// Deliberately excludes the Salary Structure fields (me_*/earn_*/ded_*/oth_*)
// — those are a separate, date-versioned resource (see salary_structure.py),
// not a flat per-employee column.
const EXPORT_FULL_FIELDS = [
  ["employee_code", "Employee Code"], ["first_name", "First Name"], ["last_name", "Last Name"],
  ["is_active", "Status"], ["is_intern", "Intern"], ["ot_applicable", "OT Applicable"], ["role", "Console Role"],
  // Personal
  ["gender", "Gender"], ["father_name", "Father Name"], ["mother_name", "Mother Name"],
  ["spouse_name", "Spouse Name"], ["blood_group", "Blood Group"], ["insurance", "Insurance"],
  ["old_employee_code", "OLD Employee Code"], ["highest_qualification", "Highest Qualification"],
  ["employee_type", "Employee Type"], ["aadhar_no", "Aadhar No"], ["nationality", "Nationality"],
  ["pan_no", "PAN No"], ["marital_status", "Marital Status"],
  // Official
  ["company", "Company"], ["location", "Location"], ["department", "Department"],
  ["sub_department", "Sub Department"], ["designation", "Designation"], ["grade", "Grade"],
  ["category", "Category"], ["level", "Level"], ["cost_center", "Cost Center"], ["unit", "Unit"],
  ["shift_roster", "Shift Roster"], ["shift_category", "Shift Category"], ["holiday_group", "Holiday Group"],
  ["shift_group", "Shift Group"], ["time_slot", "Time Slot"], ["saturday_extended_hours", "Saturday Extended Hours"],
  ["weekly_off_day", "Weekly Off"], ["ess_role", "ESS Role"], ["head_of_department", "Head of Department"],
  ["reporting_to_id", "Reporting To"], ["reporting_to", "Reporting Manager Name (if no login)"],
  ["reporting_to_email", "Reporting Manager Email (if no login)"], ["leave_approver_id", "Leave Approver"],
  ["employee_category", "Employee Category"], ["standard_working_days_per_month", "Standard Working Days / Month"],
  ["payment_mode", "Payment Mode"],
  // Dates
  ["date_of_birth", "Date of Birth"], ["date_of_joining", "Date of Joining"],
  ["probation_completion_date", "Probation Completion Date"], ["confirmation_date", "Confirmation Date"],
  ["last_promotion_date", "Last Promotion Date"], ["next_promotion_date", "Next Promotion Date"],
  ["gratuity_date", "Gratuity Date"], ["transfer_date", "Transfer Date"], ["marriage_date", "Marriage Date"],
  ["retirement_date", "Retirement Date"], ["contract_start_date", "Contract Start Date"],
  ["contract_end_date", "Contract End Date"], ["last_reappointment_date", "Last Reappointment Date"],
  ["last_exit_date_rejoinee", "Last Exit Date (ReJoinee)"], ["scheduled_exit_date", "Scheduled Exit Date"],
  ["exit_date", "Exit Date"], ["settlement_date", "Settlement Date"], ["reason_of_leaving", "Reason Of Leaving"],
  ["employee_status", "Employee Status"],
  // Communication
  ["phone", "Mobile No"], ["emergency_contact_no", "Emergency Contact No"], ["email", "Official Email Id"],
  ["personal_email_id", "Personal Email Id"], ["current_address", "Current Address"],
  ["permanent_address", "Permanent Address"],
  ["additional_contact_1_name", "Additional Contact 1 — Name"], ["additional_contact_1_phone", "Additional Contact 1 — Phone"],
  ["additional_contact_2_name", "Additional Contact 2 — Name"], ["additional_contact_2_phone", "Additional Contact 2 — Phone"],
  ["freeze_salary", "Freeze Salary"], ["freeze_reason", "Freeze Reason"],
  ["mobile_punch", "Mobile Punch"], ["mobile_punch_remarks", "Remarks"], ["is_remarks_mandatory", "Is Remarks Mandatory"],
  ["requires_selfie_checkin", "Selfie while Punch"],
  ["market_visit_checkin_enabled", "Market Visit Check-in (geotagged)"],
  ["market_visit_checkout_enabled", "Market Visit Check-out (geotagged)"],
  ["geo_location_selection", "GEO Location Selection"], ["geo_fencing", "GEO fencing"],
  ["system_punch", "System Punch"], ["sequential_punch_only", "Sequential Punch Only"],
  ["job_profile", "Job Profile"], ["job_description", "Job Description"],
  // Salary (core)
  ["basic", "Basic"], ["hra", "HRA"], ["conveyance", "Conveyance"], ["other_allowance", "Other Allowance"],
  ["standard_hours_per_day", "Standard Hours / Day"], ["monthly_bonus", "Monthly Bonus"],
  ["retention", "Retention"], ["incentive", "Incentive"], ["standing_loan_emi", "Standing Loan EMI"],
  // Statutory
  ["pf_registration", "PF Registration"], ["pf_applicable", "PF Applicable"], ["pf_no", "PF No"],
  ["eps_applicable", "EPS Applicable"], ["uan_no", "UAN No"], ["epf_join_date", "EPF Join Date"],
  ["eps_join_date", "EPS Join Date"], ["pf_gross_limit", "PF Gross Limit (0 = full salary)"],
  ["eps_exit_date", "EPS Exit Date"], ["vpf_amount", "VPF (<100 = %, else Amount)"],
  ["esic_registration", "ESIC Registration"], ["esic_applicable", "ESIC Applicable"], ["esic_no", "ESIC No"],
  ["dispensary_name", "Dispensary Name"], ["pt_registration", "Profession Tax Registration"],
  ["pt_applicable", "PT Applicable"], ["lwf_registration", "Labour Welfare Registration"],
  ["lwf_applicable", "LWF Applicable"],
  // Other
  ["identification_mark", "Identification Mark"], ["is_senior_citizen", "Is Senior Citizen"],
  ["is_super_senior_citizen", "Is Super Senior Citizen"], ["severe_disability", "Severe Disability"],
  ["severe_disability_details", "Severe Disability Details"], ["additional_info", "Additional Information"],
  ["signatory_name", "Authorized Signatory — Name"], ["signatory_designation", "Authorized Signatory — Designation"],
  ["signatory_email", "Authorized Signatory — Email"], ["approver_name", "Approver — Name"],
  ["approver_email", "Approver — Email"],
];

async function exportCompleteDetailsExcel() {
  const { data: rows } = await api.get("/api/employees/export-full");
  const idToName = Object.fromEntries(
    rows.map((e) => [e.id, `${e.first_name} ${e.last_name || ""}`.trim()]),
  );
  const XLSX = await import("xlsx");
  const data = rows.map((e) => {
    const out = {};
    for (const [key, label] of EXPORT_FULL_FIELDS) {
      let v = e[key];
      if (key === "reporting_to_id" || key === "leave_approver_id") v = v ? idToName[v] || v : "";
      else if (typeof v === "boolean") v = v ? "Yes" : "No";
      else if (key === "is_active") v = v === false ? "Inactive" : "Working";
      else if (v == null) v = "";
      out[label] = v;
    }
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  // Excel dropdown filter on every header cell, spanning the whole sheet —
  // "filters on each label", per the ask.
  ws["!autofilter"] = { ref: ws["!ref"] };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employee Details");
  XLSX.writeFile(wb, `jade-hr-employee-complete-details-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function Employees() {
  const { can } = useAuth();
  // salary.edit deliberately does NOT imply salary.view — HR can be granted
  // the ability to set salary figures without being able to see anyone's
  // existing pay (see backend/routers/employees.py's _sanitize).
  const canViewSalary = can("salary.view");
  const canEditSalary = can("salary.edit");
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("all");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const canManage = can("employees.manage");
  const [showManagerImport, setShowManagerImport] = useState(false);
  const [exportingFull, setExportingFull] = useState(false);

  const downloadCompleteDetails = async () => {
    setExportingFull(true);
    try {
      await exportCompleteDetailsExcel();
    } finally {
      setExportingFull(false);
    }
  };

  const load = () => {
    setLoading(true);
    // This table only ever renders name/code/location/designation/status
    // (+ gross, when salary.view is granted) — lite=true skips ~30
    // salary/bank/compliance columns per row when we don't need them.
    api
      .get("/api/employees", { params: canViewSalary ? undefined : { lite: true } })
      .then(({ data }) => setEmployees(data))
      .finally(() => setLoading(false));
  };

  useEffect(load, [canViewSalary]);
  useEffect(() => setPage(1), [query, location, category]);

  const locations = useMemo(
    () => [...new Set(employees.map((e) => e.location).filter(Boolean))].sort(),
    [employees],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((e) => {
      if (location !== "all" && e.location !== location) return false;
      if (category !== "all" && e.employee_category !== category) return false;
      if (!q) return true;
      return (
        `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
        e.employee_code.toLowerCase().includes(q)
      );
    });
  }, [employees, query, location, category]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE),
    [filtered, pageSafe],
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">Employees</h2>
          <p className="text-xs text-ink/70 font-nums mt-0.5">{employees.length} on the ledger</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => exportMasterExcel(filtered, canViewSalary)}
            disabled={!filtered.length}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-4 py-2.5 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
          >
            <FileSpreadsheet size={16} />
            Export Master
          </button>
          {canManage && (
            <button
              onClick={downloadCompleteDetails}
              disabled={exportingFull}
              className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-4 py-2.5 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
            >
              <FileSpreadsheet size={16} />
              {exportingFull ? "Preparing…" : "Complete Details (Excel)"}
            </button>
          )}
          {canEditSalary && (
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-4 py-2.5 rounded-sm text-sm font-semibold hover:border-jade-500 transition-colors"
            >
              <Upload size={16} />
              Import Salaries
            </button>
          )}
          {canManage && (
            <button
              onClick={() => setShowManagerImport(true)}
              className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-4 py-2.5 rounded-sm text-sm font-semibold hover:border-jade-500 transition-colors"
            >
              <Upload size={16} />
              Import Reporting Managers
            </button>
          )}
          <Link
            to="/admin/employees/new"
            className="flex items-center gap-2 bg-ledger-800 text-manila px-4 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors"
          >
            <Plus size={16} />
            Add Employee
          </Link>
        </div>
      </div>

      {showImport && (
        <SalaryImportModal
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); load(); }}
        />
      )}

      {showManagerImport && (
        <ReportingManagerImportModal
          onClose={() => setShowManagerImport(false)}
          onImported={() => { setShowManagerImport(false); load(); }}
        />
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative sm:max-w-xs flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/65" />
          <input
            aria-label="Search employees by name or code"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or code"
            className="w-full rounded-sm border border-ink/15 bg-paper pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500"
          />
        </div>
        <select
          aria-label="Filter by location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
        >
          <option value="all">All locations</option>
          {locations.map((loc) => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
        >
          <option value="all">All categories</option>
          <option value="corporate">Corporate</option>
          <option value="factory_retail">Retail</option>
        </select>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Name</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Code</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Location</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Designation</th>
              {canViewSalary && (
                <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Gross (B+H+C)</th>
              )}
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={7}>Loading ledger…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={7}>No employees match.</td></tr>
            ) : (
              pageItems.map((e) => (
                <tr key={e.id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <Link to={`/admin/employees/${e.id}`} className="text-ink hover:text-jade-600 font-medium transition-colors">
                      {e.first_name} {e.last_name}
                    </Link>
                    {e.is_intern && (
                      <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-ochre-700 bg-ochre-500/15 rounded-full px-2 py-0.5 align-middle">
                        Intern
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-ink/70 font-nums">{e.employee_code}</td>
                  <td className="px-5 py-3.5 text-ink/70">{e.location || "—"}</td>
                  <td className="px-5 py-3.5 text-ink/70">
                    {e.designation || "—"}
                    {e.department && <div className="text-xs text-ink/70 mt-0.5">{e.department}</div>}
                  </td>
                  {canViewSalary && (
                    <td className="px-5 py-3.5 font-nums">{formatINR(Number(e.basic) + Number(e.hra) + Number(e.conveyance))}</td>
                  )}
                  <td className="px-5 py-3.5">
                    <StampBadge status={e.is_active ? "active" : "inactive"}>
                      {e.is_active ? "Working" : "Inactive"}
                    </StampBadge>
                  </td>
                  <td className="px-5 py-3.5">
                    <Link
                      to={`/admin/employees/${e.id}`}
                      className="flex items-center gap-1.5 text-jade-600 hover:text-jade-700 hover:underline text-xs font-medium"
                    >
                      Details <ChevronRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <p className="text-xs text-ink/70 font-nums">
            Showing {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pageSafe <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-sm border border-ink/15 bg-paper text-sm text-ink disabled:opacity-40 hover:border-jade-500 transition-colors"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span className="text-xs text-ink/70 font-nums px-2">Page {pageSafe} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={pageSafe >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-sm border border-ink/15 bg-paper text-sm text-ink disabled:opacity-40 hover:border-jade-500 transition-colors"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
