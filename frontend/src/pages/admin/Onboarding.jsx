import { ArrowLeft, Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";

import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function DocLink({ label, url }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-xs text-jade-600 underline block">
      {label}
    </a>
  );
}

function DetailField({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-ink/50">{label}</p>
      <p className="text-sm text-ink">{value || "—"}</p>
    </div>
  );
}

function DetailGroup({ title, children }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-2">{title}</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">{children}</div>
    </div>
  );
}

function SubmissionDetail({ id, onBack, onResolved, canViewSalary }) {
  const [submission, setSubmission] = useState(null);
  const [employeeCode, setEmployeeCode] = useState("");
  const [password, setPassword] = useState("");
  const [employeeCategory, setEmployeeCategory] = useState("factory_retail");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/api/onboarding/submissions/${id}`).then(({ data }) => setSubmission(data));
  }, [id]);

  const resolve = async (action) => {
    setError("");
    if (action === "approve" && (!employeeCode || !password)) {
      setError("Employee Code and Password are required to approve");
      return;
    }
    setBusy(true);
    try {
      await api.put(`/api/onboarding/submissions/${id}`, {
        action, admin_note: note, employee_code: employeeCode, password, employee_category: employeeCategory,
      });
      onResolved();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to resolve");
    } finally {
      setBusy(false);
    }
  };

  if (!submission) return <p className="text-ink/70 text-sm">Loading…</p>;

  const address = [submission.address_line1, submission.address_line2, submission.address_line3, submission.address_line4]
    .filter(Boolean).join("\n");

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-ink/70 hover:text-ink mb-4">
        <ArrowLeft size={15} /> Back to list
      </button>

      <div className="bg-paper rounded-sm shadow-card p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-xl text-ink">{submission.full_name}</h3>
            <p className="text-xs text-ink/70 font-nums">Submitted {new Date(submission.submitted_at).toLocaleString()}</p>
          </div>
          <StampBadge status={submission.status}>{submission.status}</StampBadge>
        </div>

        <DetailGroup title="Personal">
          <DetailField label="Date of Birth" value={submission.date_of_birth} />
          <DetailField label="Mobile" value={submission.mobile} />
          <DetailField label="Emergency Contact" value={submission.emergency_contact_no} />
          <DetailField label="Email" value={submission.email} />
          <DetailField label="Fresher" value={submission.is_fresher ? "Yes" : "No"} />
        </DetailGroup>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-2">Permanent Address</h4>
          <p className="text-sm text-ink whitespace-pre-line">{address || "—"}</p>
        </div>

        <div>
          <DetailGroup title="Employment">
            <DetailField label="Designation" value={submission.designation} />
            <DetailField label="Department" value={submission.department} />
            <DetailField label="Place of Work" value={submission.place_of_work} />
            <DetailField label="Date of Joining" value={submission.date_of_joining} />
            <DetailField label="Timings + Days" value={submission.timings_and_days} />
            <DetailField label="Date of Offer Letter" value={submission.date_of_offer_letter} />
          </DetailGroup>
          {submission.kra && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wider text-ink/50">KRA</p>
              <p className="text-sm text-ink whitespace-pre-line">{submission.kra}</p>
            </div>
          )}
          {(submission.requires_personal_email || submission.requires_oms_login) && (
            <div className="flex gap-4 mt-3">
              {submission.requires_personal_email && <p className="text-xs text-ochre-700">⚑ Needs a personal/company email set up</p>}
              {submission.requires_oms_login && <p className="text-xs text-ochre-700">⚑ Needs an independent OMS login</p>}
            </div>
          )}
        </div>

        {canViewSalary && (
          <DetailGroup title="Bank">
            <DetailField label="Bank Name and Branch" value={submission.bank_name} />
            <DetailField label="Account No" value={submission.bank_account_no} />
            <DetailField label="IFSC" value={submission.bank_ifsc} />
          </DetailGroup>
        )}

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-2">Documents</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-2">
            <DetailField label="Aadhar No" value={submission.aadhar_no} />
            <DetailField label="PAN No" value={submission.pan_no} />
          </div>
          <div className="space-y-1">
            <DocLink label="Aadhar Card — Front" url={submission.aadhar_front_url} />
            <DocLink label="Aadhar Card — Back" url={submission.aadhar_back_url} />
            <DocLink label="PAN Card" url={submission.pan_card_url} />
            {canViewSalary && (submission.salary_slip_urls || []).map((u, i) => (
              <DocLink key={i} label={`Salary Slip ${i + 1}`} url={u} />
            ))}
          </div>
        </div>

        {canViewSalary && (
          <DetailGroup title="Compensation (self-reported)">
            <DetailField label="Basic" value={submission.basic} />
            <DetailField label="HRA" value={submission.hra} />
            <DetailField label="Conveyance" value={submission.conveyance} />
            <DetailField label="Other Allowance" value={submission.other_allowance} />
            <DetailField label="Monthly CTC" value={submission.monthly_ctc} />
          </DetailGroup>
        )}

        <DetailGroup title="Authorization">
          <DetailField label="Signatory" value={submission.signatory_name} />
          <DetailField label="Signatory Designation" value={submission.signatory_designation} />
          <DetailField label="Signatory Email" value={submission.signatory_email} />
          <DetailField label="Approver" value={submission.approver_name} />
          <DetailField label="Approver Email" value={submission.approver_email} />
          <DetailField label="Confirmed by submitter" value={submission.signature_confirmed ? "Yes" : "No"} />
        </DetailGroup>

        {submission.status === "pending" ? (
          <div className="border-t border-ink/10 pt-5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1">Resolve</h4>
            <p className="text-xs text-ink/50 mb-3">
              Approving creates the real employee record — Employee Code must match whatever's assigned on the biometric device.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Employee Code</label>
                <input
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  placeholder="Must match biometric device"
                  className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Initial Password</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Employee Category</label>
                <select
                  value={employeeCategory}
                  onChange={(e) => setEmployeeCategory(e.target.value)}
                  className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                >
                  <option value="factory_retail">Factory / Retail</option>
                  <option value="corporate">Corporate</option>
                </select>
              </div>
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 mb-3"
            />
            {error && <p className="text-sm text-rust-500 mb-3">{error}</p>}
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={() => resolve("approve")}
                className="flex items-center gap-1.5 bg-jade-600 text-white px-4 py-2 rounded-sm text-sm font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors"
              >
                <Check size={14} /> Approve &amp; Create Employee
              </button>
              <button
                disabled={busy}
                onClick={() => resolve("reject")}
                className="flex items-center gap-1.5 bg-paper border border-rust-500 text-rust-500 px-4 py-2 rounded-sm text-sm font-semibold hover:bg-rust-50 disabled:opacity-50 transition-colors"
              >
                <X size={14} /> Reject
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-ink/10 pt-4">
            {submission.admin_note && <p className="text-sm text-ink/70">Note: {submission.admin_note}</p>}
            {submission.created_employee_id && (
              <a href={`/admin/employees/${submission.created_employee_id}`} className="text-xs text-jade-600 underline">
                View created employee record →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Onboarding() {
  const { can } = useAuth();
  // Compensation figures + bank details are as sensitive here as anywhere
  // else in the app — gated by the same salary.view permission (see
  // backend/routers/onboarding.py's SENSITIVE_SUBMISSION_FIELDS).
  const canViewSalary = can("salary.view");
  const { pendingOnboarding: layoutPending, pendingLoaded } = useOutletContext() || {};
  const hasLayoutData = pendingLoaded && layoutPending !== undefined;
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState(() => (hasLayoutData ? layoutPending : []));
  const [loading, setLoading] = useState(!hasLayoutData);
  const [selectedId, setSelectedId] = useState(null);
  const skipNextLoad = useRef(hasLayoutData);

  const load = () => {
    setLoading(true);
    api.get("/api/onboarding/submissions", { params: { status: tab } }).then(({ data }) => setRows(data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (skipNextLoad.current) {
      skipNextLoad.current = false;
      return;
    }
    load();
  }, [tab]);

  if (selectedId) {
    return (
      <SubmissionDetail
        id={selectedId}
        onBack={() => setSelectedId(null)}
        onResolved={() => { setSelectedId(null); load(); }}
        canViewSalary={canViewSalary}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl text-ink">New Joinee Onboarding</h2>
          <p className="text-xs text-ink/70 font-nums mt-0.5">Submissions from the public joining-formalities form</p>
        </div>
        <a href="/onboarding/new" target="_blank" rel="noreferrer" className="text-xs text-jade-600 underline">
          Open public form ↗
        </a>
      </div>

      <div className="flex gap-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${
              tab === t.key ? "bg-ledger-800 text-manila" : "bg-paper text-ink/70 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Name</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Designation</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Place of Work</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Date of Joining</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Submitted</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={6}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={6}>No {tab} submissions.</td></tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-ink/[0.06] last:border-0 cursor-pointer hover:bg-manila/30"
                  onClick={() => setSelectedId(r.id)}
                >
                  <td className="px-5 py-3.5 text-ink font-medium">{r.full_name}</td>
                  <td className="px-5 py-3.5 text-ink/70">{r.designation || "—"}</td>
                  <td className="px-5 py-3.5 text-ink/70">{r.place_of_work || "—"}</td>
                  <td className="px-5 py-3.5 text-ink/70 font-nums">{r.date_of_joining || "—"}</td>
                  <td className="px-5 py-3.5 text-ink/70 font-nums">{new Date(r.submitted_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3.5 text-jade-600 text-xs font-semibold">View →</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
