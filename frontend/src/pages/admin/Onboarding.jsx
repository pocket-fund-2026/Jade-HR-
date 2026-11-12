import { ArrowLeft, Check, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";

import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import SlidingTabs from "../../components/SlidingTabs.jsx";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "form", label: "Form builder" },
];

const FIELD_TYPES = [
  ["text", "Short text"], ["textarea", "Long text"], ["number", "Number"], ["date", "Date"],
  ["select", "Dropdown"], ["checkbox", "Tick box"], ["file", "File upload"],
];
const inputCls = "w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jade-500";

// HR-managed "Place of Work" options (name + full address, HQ flag).
function Locations() {
  const [rows, setRows] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const load = () => api.get("/api/onboarding/admin/locations").then(({ data }) => setRows(data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const save = async () => {
    setError("");
    const payload = { value: draft.value, address: draft.address, is_hq: !!draft.is_hq, sort_order: Number(draft.sort_order) || 0, is_active: true };
    try {
      if (draft.id) await api.put(`/api/onboarding/admin/locations/${draft.id}`, payload);
      else await api.post("/api/onboarding/admin/locations", payload);
      setDraft(null); load();
    } catch (err) { setError(err.response?.data?.detail || "Could not save"); }
  };
  const visible = (rows || []).filter((r) => r.is_active !== false);
  return (
    <div className="bg-paper rounded-sm shadow-card mb-6">
      <div className="flex items-center justify-between px-5 py-3 border-b border-ink/10">
        <p className="text-xs text-ink/70">Place of Work choices on the public form. The name is what gets stored on the employee; the full address is shown to the joiner.</p>
        <button onClick={() => setDraft({ value: "", address: "", is_hq: false, sort_order: visible.length + 1 })}
          className="flex items-center gap-1.5 bg-ledger-800 text-manila px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-ledger-700 flex-shrink-0 ml-3"><Plus size={13} /> Add place</button>
      </div>
      {draft && (
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-ink/10 bg-manila/30">
          <input value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} placeholder="Name, e.g. Pedder Road, Mumbai" className={inputCls} />
          <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="Full address" className={inputCls} />
          <label className="flex items-center gap-2 text-xs text-ink/70"><input type="checkbox" checked={!!draft.is_hq} onChange={(e) => setDraft({ ...draft, is_hq: e.target.checked })} /> This is HQ</label>
          <label className="flex items-center gap-2 text-xs text-ink/70">Order <input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} className={`${inputCls} w-20`} /></label>
          {error && <p className="text-sm text-rust-500 sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button onClick={() => setDraft(null)} className="text-xs text-ink/70 px-3 py-1.5">Cancel</button>
            <button onClick={save} className="bg-jade-600 text-white px-4 py-1.5 rounded-sm text-xs font-semibold hover:bg-jade-700">Save</button>
          </div>
        </div>
      )}
      <ul className="divide-y divide-ink/[0.07]">
        {visible.map((r) => (
          <li key={r.value} className="flex items-center gap-3 px-5 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-ink font-medium">{r.is_hq && <span className="text-jade-600">HQ · </span>}{r.value}</p>
              <p className="text-xs text-ink/60">{r.address || <span className="text-rust-500">No address yet — click Edit to add it</span>}</p>
            </div>
            {r.id && <button onClick={() => setDraft({ ...r })} className="text-xs text-jade-600 font-semibold">Edit</button>}
            {r.id && <button onClick={async () => { await api.delete(`/api/onboarding/admin/locations/${r.id}`); load(); }} className="text-xs text-rust-500">Remove</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// HR-managed extra fields for the public form (no tech request needed).
function FormFields() {
  const [fields, setFields] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const load = () => api.get("/api/onboarding/admin/fields").then(({ data }) => setFields(data)).catch(() => setFields([]));
  useEffect(() => { load(); }, []);

  const save = async () => {
    setError("");
    const payload = {
      label: draft.label, field_type: draft.field_type, required: !!draft.required, section: draft.section,
      help_text: draft.help_text, sort_order: Number(draft.sort_order) || 0, is_active: true,
      options: draft.field_type === "select" ? String(draft.optionsText || "").split("\n") : [],
    };
    try {
      if (draft.id) await api.put(`/api/onboarding/admin/fields/${draft.id}`, payload);
      else await api.post("/api/onboarding/admin/fields", payload);
      setDraft(null);
      load();
    } catch (err) { setError(err.response?.data?.detail || "Could not save field"); }
  };
  const remove = async (id) => { await api.delete(`/api/onboarding/admin/fields/${id}`); load(); };
  const visible = (fields || []).filter((f) => f.is_active);

  return (
    <div className="bg-paper rounded-sm shadow-card">
      <div className="flex items-center justify-between px-5 py-3 border-b border-ink/10">
        <p className="text-xs text-ink/70">Extra questions shown on the public form, after the built-in sections. Existing answers stay on each submission if you remove a field.</p>
        <button onClick={() => setDraft({ label: "", field_type: "text", section: "Additional Details", help_text: "", required: false, sort_order: visible.length + 1, optionsText: "" })}
          className="flex items-center gap-1.5 bg-ledger-800 text-manila px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-ledger-700 flex-shrink-0 ml-3"><Plus size={13} /> Add field</button>
      </div>
      {draft && (
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-ink/10 bg-manila/30">
          <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Question / label" className={inputCls} />
          <select value={draft.field_type} onChange={(e) => setDraft({ ...draft, field_type: e.target.value })} className={inputCls}>
            {FIELD_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input value={draft.section} onChange={(e) => setDraft({ ...draft, section: e.target.value })} placeholder="Section heading" className={inputCls} />
          <input value={draft.help_text} onChange={(e) => setDraft({ ...draft, help_text: e.target.value })} placeholder="Help text (optional)" className={inputCls} />
          {draft.field_type === "select" && (
            <textarea value={draft.optionsText} onChange={(e) => setDraft({ ...draft, optionsText: e.target.value })} rows={3} placeholder="One choice per line" className={`${inputCls} sm:col-span-2`} />
          )}
          <label className="flex items-center gap-2 text-xs text-ink/70"><input type="checkbox" checked={!!draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} /> Required</label>
          <label className="flex items-center gap-2 text-xs text-ink/70">Order <input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} className={`${inputCls} w-20`} /></label>
          {error && <p className="text-sm text-rust-500 sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button onClick={() => setDraft(null)} className="text-xs text-ink/70 px-3 py-1.5">Cancel</button>
            <button onClick={save} className="bg-jade-600 text-white px-4 py-1.5 rounded-sm text-xs font-semibold hover:bg-jade-700">Save field</button>
          </div>
        </div>
      )}
      <ul className="divide-y divide-ink/[0.07]">
        {fields && visible.length === 0 && <li className="px-5 py-6 text-sm text-ink/60 text-center">No extra fields yet.</li>}
        {visible.map((f) => (
          <li key={f.id} className="flex items-center gap-3 px-5 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-ink font-medium">{f.label}{f.required && <span className="text-rust-500"> *</span>}</p>
              <p className="text-xs text-ink/60">{f.section} · {FIELD_TYPES.find(([k]) => k === f.field_type)?.[1]}{f.field_type === "select" ? ` (${f.options.length} choices)` : ""} · order {f.sort_order}</p>
            </div>
            <button onClick={() => setDraft({ ...f, optionsText: (f.options || []).join("\n") })} className="text-xs text-jade-600 font-semibold">Edit</button>
            <button onClick={() => remove(f.id)} className="text-xs text-rust-500">Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
      <p className="text-[10px] uppercase tracking-wider text-ink/70">{label}</p>
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
    setBusy(true);
    try {
      const { data } = await api.put(`/api/onboarding/submissions/${id}`, {
        action, admin_note: note, employee_code: employeeCode, password, employee_category: employeeCategory,
      });
      if (data.issued) {
        window.alert(
          `Employee created.\n\nEmployee ID: ${data.issued.employee_code}` +
          (data.issued.password ? `\nTemporary password: ${data.issued.password}\n\nNot emailed to the candidate — send the login with the offer letter once they have signed and returned it.` : "")
        );
      }
      onResolved();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to resolve");
    } finally {
      setBusy(false);
    }
  };

  if (!submission) return <p className="text-ink/70 text-sm"><span className="t-shimmer" data-text="Loading…">Loading…</span></p>;

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
            <p className="text-xs text-ink/70 font-nums">{submission.reference_no ? `Ref #${submission.reference_no} · ` : ""}Submitted {new Date(submission.submitted_at).toLocaleString()}</p>
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
              <p className="text-[10px] uppercase tracking-wider text-ink/70">KRA</p>
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
            <DocLink label="Photo" url={submission.photo_url} />
            <DocLink label="Resume" url={submission.resume_url} />
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

        {Object.keys(submission.custom_values || {}).length > 0 && (
          <DetailGroup title="Additional details">
            {Object.entries(submission.custom_values).map(([k, v]) => (
              <DetailField key={k} label={k.replace(/_/g, " ")} value={typeof v === "boolean" ? (v ? "Yes" : "No") : Array.isArray(v) ? v.join(", ") : v} />
            ))}
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
            <p className="text-xs text-ink/70 mb-3">
              Approving creates the real employee record. Leave Employee Code and Password blank to auto-assign the next free ID and a temporary password (shown to you here, NOT emailed — send it with the signed offer letter). If you type a code, it must match the biometric device.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Employee Code</label>
                <input
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  placeholder="Auto-assign next free ID"
                  className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Initial Password</label>
                <input
                  value={password}
                  placeholder="Auto-generate"
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
    if (tab === "form") return;
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

      <SlidingTabs tabs={TABS} value={tab} onChange={setTab} className="flex gap-1 mb-4" />

      {tab === "form" ? <><Locations /><FormFields /></> : (
      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left sticky top-0 z-10 bg-paper shadow-[0_1px_0_rgba(0,0,0,0.08)]">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Ref</th>
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
              <tr><td className="px-5 py-12 text-ink/70 text-center text-sm" colSpan={7}><span className="t-shimmer" data-text="Loading…">Loading…</span></td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-5 py-12 text-ink/70 text-center text-sm" colSpan={7}>No {tab} submissions.</td></tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-ink/[0.06] last:border-0 cursor-pointer hover:bg-manila/30"
                  onClick={() => setSelectedId(r.id)}
                >
                  <td className="px-5 py-3.5 text-ink/70 font-nums">{r.reference_no ? `#${r.reference_no}` : "—"}</td>
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
      )}
    </div>
  );
}
