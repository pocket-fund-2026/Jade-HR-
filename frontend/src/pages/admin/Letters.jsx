import {
  ArrowLeft, Bold, Briefcase, CheckCircle2, Download, FileSignature, FileText, GraduationCap, List, ListOrdered,
  Mail, Pencil, Plus, Printer, Save, Send, ShieldAlert, UserCheck, UserMinus,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useConfirm } from "../../components/ConfirmDialog.jsx";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import { formatOrdinalDate } from "../../lib/format.js";

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Empty tokens show as a soft highlighted blank in the PREVIEW only, so HR
// can see at a glance what's still to fill — the saved letter (backend
// _substitute) just gets an empty string.
function substitute(body, values, { markBlanks = false } = {}) {
  return body.replace(TOKEN_RE, (_, key) => {
    const v = values[key];
    if (v == null || v === "") return markBlanks ? `<span class="lt-blank">${escapeHtml(TOKEN_LABELS[key] || key)}</span>` : "";
    return v;
  });
}

// Multi-line tokens get a textarea instead of a single-line input, and each
// non-blank line is wrapped into the given HTML structure before substitution.
const MULTILINE_TOKENS = {
  kras: "numbered",
  termination_reasons: "bullets",
  warning_body: "paragraphs",
};

// Tokens whose value is pre-built HTML (multiline wraps above, or generated
// server-side like the Quarter Red Card month list) — everything else typed
// into the form is escaped, matching the backend's html.escape.
function wrapMultiline(text, mode) {
  const lines = text.split("\n").map((l) => escapeHtml(l.trim())).filter(Boolean);
  if (!lines.length) return "";
  if (mode === "numbered") return `<ol>${lines.map((l) => `<li>${l}</li>`).join("")}</ol>`;
  if (mode === "bullets") return `<ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;
  return lines.map((l) => `<p>${l}</p>`).join("");
}

// Tokens auto-filled from an existing employee record — anything else on a
// template is left for HR to type in per letter, always editable afterward.
function autofillFromEmployee(employee, profile) {
  if (!employee) return {};
  return {
    employee_name: `${employee.first_name} ${employee.last_name || ""}`.trim(),
    employee_code: employee.employee_code,
    designation: employee.designation || "",
    department: employee.department || "",
    date_of_joining: formatOrdinalDate(employee.date_of_joining),
    joining_date: formatOrdinalDate(employee.date_of_joining),
    start_date: formatOrdinalDate(employee.date_of_joining),
    email: employee.email || "",
    address: profile?.current_address || profile?.permanent_address || "",
  };
}

const WORK_LOCATION = "Jade Lifestyles India, Madhu Estate, 2nd Floor B wing, Pandurang Budhkar Marg, Lower Parel, Mumbai 400013.";

// Starting values for tokens no employee record can supply — every one of
// these stays editable in the form before the letter is generated.
function defaultsFor(letterType, todayLabel, signatoryName, employeeName) {
  const common = {
    company_name: "JADE Lifestyles India",
    signatory_name: signatoryName || "",
    signatory_title: "Head - HR",
    letter_date: todayLabel,
  };
  const kv = { ...common };
  if (letterType === "offer_internship") {
    kv.work_location = WORK_LOCATION;
    kv.work_hours = "Monday to Friday - 10:00 am to 6:30 pm; Saturday – 10:00 am to 3:00 pm.";
    kv.duration = "2 months";
  }
  if (letterType === "offer_employment") {
    kv.work_location = WORK_LOCATION;
    kv.work_hours = "10:00am to 07:00pm Monday to Saturday";
    kv.probation_days = "90";
    kv.leave_days = "24";
    kv.acceptance_days = "3";
    kv.kras = "";
  }
  if (letterType === "warning") {
    kv.warning_subject = "Formal Warning Regarding Work Performance and Conduct";
    kv.warning_body = "";
  }
  if (letterType === "termination") {
    kv.termination_reasons = "";
  }
  if (letterType === "relieving") {
    kv.conduct_remark = `We found ${employeeName || "them"} to be hardworking and sincere.`;
  }
  if (letterType === "review_form") {
    kv.review_period = "";
    kv.reviewer_title = "";
  }
  return kv;
}

const TOKEN_LABELS = {
  employee_name: "Employee name", employee_code: "Employee code", designation: "Designation",
  department: "Department", date_of_joining: "Date of joining", email: "Email", address: "Address",
  letter_date: "Letter date", signatory_name: "Signatory name", signatory_title: "Signatory title",
  company_name: "Company name", work_location: "Work location", work_hours: "Hours of work",
  internship_role: "Internship role", stipend: "Stipend", commencement_date: "Commencement date",
  duration: "Duration", joining_date: "Joining date", probation_days: "Probation (days)",
  kras: "Key Responsibility Areas (one per line)", basic_salary: "Basic Salary", hra: "HRA",
  conveyance: "Conveyance", other_allowance: "Other Allowance", total_ctc: "Total CTC",
  leave_days: "Paid leave days/year", acceptance_days: "Days to accept offer",
  offer_letter_date: "Offer letter date", termination_reasons: "Reasons (one per line)",
  start_date: "Start date", end_date: "Last working day", conduct_remark: "Conduct remark",
  warning_subject: "Subject", warning_body: "Details of the issue (one paragraph per line)",
  review_period: "Period of review", reviewer_title: "Reviewer title",
  quarter_label: "Quarter", late_mark_summary: "Late-marking summary", pl_forfeited: "PL days forfeited",
  action_date: "Forfeiture effective date",
};

// Form sections, so a long template (the offer letter has 25+ tokens)
// reads as a few short groups instead of one undifferentiated column.
const TOKEN_GROUPS = [
  { title: "Recipient", keys: ["employee_name", "employee_code", "designation", "department", "email", "address", "date_of_joining"] },
  { title: "Role & terms", keys: ["internship_role", "joining_date", "commencement_date", "duration", "work_location", "work_hours", "probation_days", "leave_days", "acceptance_days", "kras", "offer_letter_date", "start_date", "end_date", "review_period", "reviewer_title"] },
  { title: "Compensation", keys: ["stipend", "basic_salary", "hra", "conveyance", "other_allowance", "total_ctc"] },
  { title: "Letter content", keys: ["warning_subject", "warning_body", "termination_reasons", "conduct_remark", "quarter_label", "late_mark_summary", "pl_forfeited", "action_date"] },
  { title: "Sign-off", keys: ["letter_date", "signatory_name", "signatory_title", "company_name"] },
];

const MONEY_TOKENS = new Set(["basic_salary", "hra", "conveyance", "other_allowance", "total_ctc"]);

// Hub card metadata for the built-in letter types. HR-created types fall
// back to the "Custom" group with a generic description.
const LETTER_META = {
  offer_employment: { group: "Hiring", icon: Briefcase, blurb: "Full-time offer with role, CTC breakup, probation and policy terms, plus an acceptance slip." },
  offer_internship: { group: "Hiring", icon: GraduationCap, blurb: "Internship offer with role, stipend, duration and an acceptance slip." },
  confirmation: { group: "During employment", icon: UserCheck, blurb: "Confirms employment after a successful probation period." },
  review_form: { group: "During employment", icon: FileSignature, blurb: "Probation review form for the reviewer and HOD to rate and sign." },
  warning: { group: "Conduct", icon: ShieldAlert, blurb: "Formal warning for performance or conduct, with acknowledgement of receipt." },
  final_warning: { group: "Conduct", icon: ShieldAlert, blurb: "Quarter Red Card final warning. Issued automatically by the late-arrival policy run." },
  termination: { group: "Exit", icon: UserMinus, blurb: "Termination of employment, listing the reasons and handover steps." },
  relieving: { group: "Exit", icon: FileText, blurb: "Relieving and experience letter with service dates and conduct remark." },
};
const GROUP_ORDER = ["Hiring", "During employment", "Conduct", "Exit", "Custom"];

const OFFICE_ADDRESS = "101 Raheja Xion, Dr. Ambedkar Road, Byculla (East), Mumbai 400027, India";
const HR_CONTACT = "team.hr@jadecouture.com";

// The printable page: letterhead, letter body, footer. One component for
// the generator preview, issued-letter view, print and PDF, so all four
// are guaranteed to match.
function LetterSheet({ html, sheetRef }) {
  return (
    <article ref={sheetRef} className="letter-sheet relative mx-auto w-full max-w-[794px] bg-white shadow-stamp px-6 py-8 sm:px-14 sm:py-12">
      <header className="flex flex-col items-center text-center mb-8">
        <img src="/jade-letterhead-logo.png" alt="JADE" className="h-[60px] w-auto" crossOrigin="anonymous" />
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.38em] text-ink/55 mt-2.5 pl-[0.38em]">Lifestyles India</p>
        <div className="w-full mt-4 border-t border-ink/70" />
        <div className="w-full mt-[3px] border-t border-ink/20" />
      </header>
      <div className="letter-doc" dangerouslySetInnerHTML={{ __html: html }} />
      <footer className="mt-12 pt-3 border-t border-ink/15 text-center text-[9.5px] leading-relaxed tracking-[0.06em] text-ink/50">
        <p>JADE Lifestyles India · {OFFICE_ADDRESS}</p>
        <p>{HR_CONTACT}</p>
      </footer>
    </article>
  );
}

// Prints JUST the letter: the admin layout is a fixed-height flex shell
// with an always-visible dark sidebar, so window.print() on the page
// printed the sidebar and clipped the letter at one screen. A throwaway
// iframe with the app's stylesheets and only the sheet inside gives a
// clean multi-page A4 print.
function printSheet(el, title) {
  if (!el) return;
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(iframe);
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join("\n");
  const doc = iframe.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title || "Letter")}</title>${styles}
<style>
  @page { size: A4; margin: 14mm 0 16mm; }
  html, body { background: #fff !important; margin: 0; }
  .letter-sheet { box-shadow: none !important; max-width: none !important; padding: 0 18mm !important; }
  .lt-blank { background: none !important; border-bottom: 1px solid #999; color: transparent !important; }
</style></head><body>${el.outerHTML}</body></html>`);
  doc.close();
  const go = () => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => iframe.remove(), 1000);
  };
  const fonts = doc.fonts?.ready || Promise.resolve();
  const imgs = [...doc.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));
  Promise.all([fonts, ...imgs]).then(() => setTimeout(go, 150));
}

async function sheetToPdf(el, filename) {
  const html2pdf = (await import("html2pdf.js")).default;
  return html2pdf()
    .set({
      margin: [12, 0, 14, 0],
      filename,
      image: { type: "jpeg", quality: 0.92 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"], avoid: [".lt-sign", ".lt-accept", "tr", ".lt-heading"] },
    })
    .from(el);
}

function pdfFilename(title, name) {
  const slug = (s) => (s || "").trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${[slug(title), slug(name)].filter(Boolean).join("_") || "Letter"}.pdf`;
}

const inputCls = "w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";
const labelCls = "block text-[11px] font-semibold uppercase tracking-wider text-ink/70 mb-1";
const primaryBtn = "flex items-center justify-center gap-2 bg-ledger-800 text-manila px-4 py-2 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors";
const secondaryBtn = "flex items-center justify-center gap-2 border border-ink/15 bg-paper text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 hover:text-jade-700 disabled:opacity-50 transition-colors";

const NEW_TEMPLATE_SCAFFOLD = `<p class="lt-dateline"><span>Mumbai</span><span><strong>{{letter_date}}</strong></span></p>
<div class="lt-to"><span class="lt-label">To</span><strong>{{employee_name}}</strong><br>{{designation}}, {{department}}</div>
<p class="lt-subject">Subject of the letter</p>
<p>Dear {{employee_name}},</p>
<p>[Letter body goes here.]</p>
<div class="lt-sign"><p>Yours sincerely,<br>For <strong>{{company_name}}</strong></p><div class="lt-sign-space"></div><p><span class="lt-sign-name"><strong>{{signatory_name}}</strong></span><br><span class="lt-sign-meta">{{signatory_title}}</span></p></div>
`;

function slugify(title) {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "letter";
}

// Lets HR type a letter the way they'd type it in a word processor — no HTML
// tags — while still producing the <p>/<strong>/<ol>/<ul> markup the
// generator's substitute()+dangerouslySetInnerHTML pipeline expects.
function RichTextEditor({ value, onChange }) {
  const editorRef = useRef(null);
  const loadedValue = useRef(null);

  useEffect(() => {
    if (editorRef.current && loadedValue.current !== value) {
      editorRef.current.innerHTML = value;
      loadedValue.current = value;
    }
  }, [value]);

  const emit = () => {
    if (!editorRef.current) return;
    loadedValue.current = editorRef.current.innerHTML;
    onChange(editorRef.current.innerHTML);
  };

  const exec = (command) => {
    editorRef.current?.focus();
    document.execCommand(command);
    emit();
  };

  const toolbarButton = (command, label, Icon) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => exec(command)}
      title={label}
      className="p-1.5 rounded-sm border border-ink/15 text-ink hover:border-jade-500 hover:text-jade-600 transition-colors"
    >
      <Icon size={14} />
    </button>
  );

  return (
    <div>
      <div className="flex gap-1.5 mb-2">
        {toolbarButton("bold", "Bold", Bold)}
        {toolbarButton("insertOrderedList", "Numbered list", ListOrdered)}
        {toolbarButton("insertUnorderedList", "Bullet list", List)}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onFocus={() => document.execCommand("defaultParagraphSeparator", false, "p")}
        className="letter-doc w-full min-h-[420px] rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
      />
    </div>
  );
}

function TemplateEditor({ template, onClose, onSaved, onDeleted }) {
  const confirm = useConfirm();
  const isNew = !template;
  const [letterType, setLetterType] = useState(template?.letter_type || "");
  const [typeEdited, setTypeEdited] = useState(false);
  const [title, setTitle] = useState(template?.title || "");
  const [body, setBody] = useState(template?.body || NEW_TEMPLATE_SCAFFOLD);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const tokens = useMemo(() => [...new Set([...body.matchAll(TOKEN_RE)].map((m) => m[1]))], [body]);

  const onTitleChange = (value) => {
    setTitle(value);
    if (isNew && !typeEdited) setLetterType(slugify(value));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (isNew) {
        const { data } = await api.post("/api/letters/templates", { letter_type: letterType, title, body });
        onSaved(data, true);
      } else {
        const { data } = await api.put(`/api/letters/templates/${template.letter_type}`, { title, body });
        onSaved(data, false);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!(await confirm(`Delete the "${template.title}" template? This can't be undone.`, { danger: true, confirmLabel: "Delete" }))) return;
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/api/letters/templates/${template.letter_type}`);
      onDeleted(template.letter_type);
    } catch (err) {
      setError(err.response?.data?.detail || "Delete failed");
      setDeleting(false);
    }
  };

  return (
    <div>
      <button onClick={onClose} className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors mb-4">
        <ArrowLeft size={13} /> Back to Letters
      </button>
      <h2 className="font-display text-2xl text-ink mb-1">{isNew ? "New Letter Type" : "Edit Template"}</h2>
      <p className="text-sm text-ink/70 mb-5">
        Type the letter as you'd write it — use <code className="font-nums">{"{{token_name}}"}</code> for anything that should be filled in per letter.
      </p>

      <div className="bg-paper rounded-sm shadow-card p-6 mb-4">
        <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Title</label>
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="e.g. Increment Letter"
          className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink mb-4 focus:outline-none focus:ring-2 focus:ring-jade-500"
        />
        {isNew && (
          <>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Type key</label>
            <input
              value={letterType}
              onChange={(e) => { setTypeEdited(true); setLetterType(slugify(e.target.value)); }}
              className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink font-nums mb-4 focus:outline-none focus:ring-2 focus:ring-jade-500"
            />
          </>
        )}
        <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Letter Body</label>
        <RichTextEditor value={body} onChange={setBody} />
        {tokens.length > 0 && (
          <p className="text-xs text-ink/70 mt-2">Tokens found: {tokens.join(", ")}</p>
        )}
        {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5 mt-3">{error}</p>}
        <div className="flex justify-between items-center mt-4">
          {!isNew ? (
            <button
              onClick={remove}
              disabled={deleting}
              className="text-xs text-rust-500 hover:underline disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete template"}
            </button>
          ) : <span />}
          <button
            onClick={save}
            disabled={saving || !title.trim() || (isNew && !letterType.trim())}
            className="flex items-center gap-2 bg-ledger-800 text-manila px-4 py-2 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
          >
            <Save size={15} /> {saving ? "Saving…" : isNew ? "Create Template" : "Save Template"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldInput({ token, value, onChange }) {
  if (MULTILINE_TOKENS[token]) {
    return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} className={inputCls} />;
  }
  if (MONEY_TOKENS.has(token)) {
    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink/50">₹</span>
        <input value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} pl-7 font-nums`} inputMode="decimal" />
      </div>
    );
  }
  return <input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
}

function LetterGenerator({ template, onClose, onIssued }) {
  const { user } = useAuth();
  const todayLabel = formatOrdinalDate(new Date().toISOString());
  const [mode, setMode] = useState("existing"); // existing | new
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [fieldValues, setFieldValues] = useState(() => defaultsFor(template.letter_type, todayLabel, user?.name));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Every employee, active or not — Relieving/Termination letters are
    // almost always written for someone who has already been deactivated.
    api.get("/api/employees", { params: { lite: true } }).then(({ data }) => {
      const sorted = [...data].sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        return `${a.first_name} ${a.last_name || ""}`.localeCompare(`${b.first_name} ${b.last_name || ""}`);
      });
      setEmployees(sorted);
    });
  }, []);

  const applyEmployee = async (id) => {
    setEmployeeId(id);
    if (!id) return;
    const [{ data: employee }, { data: profile }] = await Promise.all([
      api.get(`/api/employees/${id}`),
      api.get(`/api/employees/${id}/profile`),
    ]);
    setFieldValues((prev) => ({
      ...prev,
      ...defaultsFor(template.letter_type, todayLabel, user?.name, `${employee.first_name} ${employee.last_name || ""}`.trim()),
      ...autofillFromEmployee(employee, profile),
    }));
  };

  const setField = (key, value) => setFieldValues((prev) => ({ ...prev, [key]: value }));

  const previewValues = useMemo(() => {
    const out = {};
    for (const [key, v] of Object.entries(fieldValues)) {
      out[key] = MULTILINE_TOKENS[key] ? wrapMultiline(v || "", MULTILINE_TOKENS[key]) : escapeHtml(v ?? "");
    }
    return out;
  }, [fieldValues]);

  const previewHtml = useMemo(() => substitute(template.body, previewValues, { markBlanks: true }), [template.body, previewValues]);

  const groups = useMemo(() => {
    const placed = new Set();
    const out = TOKEN_GROUPS.map((g) => {
      const keys = g.keys.filter((k) => template.tokens.includes(k));
      keys.forEach((k) => placed.add(k));
      return { ...g, keys };
    });
    const rest = template.tokens.filter((t) => !placed.has(t));
    if (rest.length) out.splice(out.length - 1, 0, { title: "Other details", keys: rest });
    return out.filter((g) => g.keys.length);
  }, [template.tokens]);

  const missing = template.tokens.filter((t) => !(fieldValues[t] || "").trim());

  const generate = async () => {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/api/letters/generate", {
        letter_type: template.letter_type,
        employee_id: mode === "existing" ? (employeeId || null) : null,
        // Raw values — the backend escapes them and wraps the multi-line ones.
        field_values: Object.fromEntries(template.tokens.map((t) => [t, fieldValues[t] || ""])),
      });
      onIssued(data.id);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not generate letter");
      setSaving(false);
    }
  };

  return (
    <div>
      <button onClick={onClose} className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors mb-4">
        <ArrowLeft size={13} /> Back to Letters
      </button>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-jade-600 mb-1">New letter</p>
          <h2 className="font-display text-2xl text-ink">{template.title}</h2>
        </div>
        <p className="text-xs text-ink/60">
          {missing.length ? `${missing.length} field${missing.length === 1 ? "" : "s"} still blank, highlighted in the preview` : "All fields filled"}
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,400px)_1fr] gap-6 items-start">
        <div className="xl:sticky xl:top-4 space-y-4">
          <div className="bg-paper rounded-sm shadow-card p-5">
            <p className={labelCls}>Letter for</p>
            <div className="grid grid-cols-2 gap-1 p-1 bg-manila rounded-sm mb-3 text-xs font-semibold">
              {[["existing", "Existing employee"], ["new", "New / not in system"]].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMode(k)}
                  className={`py-1.5 rounded-sm transition-colors ${mode === k ? "bg-paper text-ink shadow-card" : "text-ink/60 hover:text-ink"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === "existing" ? (
              <select value={employeeId} onChange={(e) => applyEmployee(e.target.value)} className={inputCls}>
                <option value="">Select an employee…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employee_code} — {e.first_name} {e.last_name}{!e.is_active ? " (Inactive)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-ink/60">Type the candidate's details below. Add their email so the letter can be sent to them.</p>
            )}
          </div>

          <div className="bg-paper rounded-sm shadow-card divide-y divide-ink/10 xl:max-h-[calc(100vh-330px)] xl:overflow-y-auto">
            {groups.map((g) => (
              <fieldset key={g.title} className="p-5 space-y-3">
                <legend className="sr-only">{g.title}</legend>
                <p className="font-display text-base text-ink">{g.title}</p>
                {g.keys.map((token) => (
                  <div key={token}>
                    <label className={labelCls}>{TOKEN_LABELS[token] || token.replace(/_/g, " ")}</label>
                    <FieldInput token={token} value={fieldValues[token] || ""} onChange={(v) => setField(token, v)} />
                  </div>
                ))}
              </fieldset>
            ))}
          </div>

          {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}
          <button onClick={generate} disabled={saving} className={`${primaryBtn} w-full py-2.5`}>
            <FileSignature size={15} /> {saving ? "Issuing…" : "Issue letter"}
          </button>
          <p className="text-[11px] text-ink/55 text-center -mt-2">Saves it to Issued Letters, where you can print, download or email it.</p>
        </div>

        <div className="bg-manila/60 rounded-sm p-3 sm:p-6 overflow-x-auto">
          <LetterSheet html={previewHtml} />
        </div>
      </div>
    </div>
  );
}

function defaultCoverMessage(letter, senderName) {
  const first = (letter.employee_name || "").split(" ")[0] || "there";
  const sign = `\n\nWarm regards,\n${senderName || "HR Team"}\nHR, JADE Lifestyles India`;
  const fv = letter.field_values || {};
  switch (letter.letter_type) {
    case "offer_employment":
      return `Dear ${first},\n\nWe are delighted to share your offer of employment with JADE Lifestyles India. Please review it, sign the acceptance at the end, and send a copy back to us within ${fv.acceptance_days || "3"} days.\n\nWe look forward to welcoming you.${sign}`;
    case "offer_internship":
      return `Dear ${first},\n\nPlease find your internship offer from JADE Lifestyles India. Kindly sign the acceptance at the end and reply with a copy to confirm.${sign}`;
    case "confirmation":
      return `Dear ${first},\n\nCongratulations on completing your probation. Your confirmation letter is below and attached.${sign}`;
    case "relieving":
      return `Dear ${first},\n\nPlease find your relieving and experience letter below and attached. Thank you for your time with JADE, and all the best for what's next.${sign}`;
    default:
      return `Dear ${first},\n\nPlease find your ${letter.title} below and attached as a PDF. If you have any questions, simply reply to this email.${sign}`;
  }
}

function EmailPanel({ letter, sheetRef, onSent }) {
  const { user } = useAuth();
  const [to, setTo] = useState(letter.employee_email || "");
  const [cc, setCc] = useState(HR_CONTACT);
  const [subject, setSubject] = useState(`${letter.title} | JADE Lifestyles India`);
  const [message, setMessage] = useState(() => defaultCoverMessage(letter, user?.name));
  const [attachPdf, setAttachPdf] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  const send = async () => {
    setSending(true);
    setError("");
    setSentTo("");
    try {
      let pdf_base64 = null;
      const pdf_filename = pdfFilename(letter.title, letter.employee_name);
      if (attachPdf && sheetRef.current) {
        const uri = await (await sheetToPdf(sheetRef.current, pdf_filename)).outputPdf("datauristring");
        pdf_base64 = uri.slice(uri.indexOf(",") + 1);
      }
      const { data } = await api.post(`/api/letters/history/${letter.id}/email`, {
        to, cc: cc.split(/[,;\s]+/).filter(Boolean), subject, message, pdf_base64, pdf_filename,
      });
      setSentTo(data.emailed_to);
      onSent(data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Could not send the email");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-paper rounded-sm shadow-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Mail size={16} className="text-jade-600" />
        <p className="font-display text-lg text-ink">Email this letter</p>
      </div>
      <p className="text-xs text-ink/60 -mt-1">Sent from Tina at JADE HR. Replies go to {HR_CONTACT}.</p>
      <div>
        <label className={labelCls}>To</label>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" className={inputCls} type="email" />
        {!letter.employee_email && <p className="text-[11px] text-ochre-700 mt-1">No email on file for this person. Type one in.</p>}
      </div>
      <div>
        <label className={labelCls}>CC</label>
        <input value={cc} onChange={(e) => setCc(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Message</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8} className={inputCls} />
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} /> Attach the letter as a PDF
      </label>
      {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}
      {sentTo && (
        <p className="flex items-center gap-1.5 text-sm text-jade-700"><CheckCircle2 size={15} /> Sent to {sentTo}</p>
      )}
      <button onClick={send} disabled={sending || !to.includes("@")} className={`${primaryBtn} w-full`}>
        <Send size={15} /> {sending ? (attachPdf ? "Preparing PDF and sending…" : "Sending…") : letter.emailed_at ? "Send again" : "Send email"}
      </button>
    </div>
  );
}

function formatStamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${formatOrdinalDate(iso)}, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

function IssuedLetter({ letterId, onClose }) {
  const sheetRef = useRef(null);
  const [letter, setLetter] = useState(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api.get(`/api/letters/history/${letterId}`).then(({ data }) => setLetter(data)).catch(() => setError("Could not load this letter"));
  }, [letterId]);

  if (error) return <p className="text-sm text-rust-500">{error}</p>;
  if (!letter) return <p className="text-ink/70">Loading…</p>;

  const download = async () => {
    setDownloading(true);
    try {
      await (await sheetToPdf(sheetRef.current, pdfFilename(letter.title, letter.employee_name))).save();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <button onClick={onClose} className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors mb-4">
        <ArrowLeft size={13} /> Back to Letters
      </button>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-jade-600 mb-1">Issued letter</p>
          <h2 className="font-display text-2xl text-ink">{letter.title}{letter.employee_name ? ` · ${letter.employee_name}` : ""}</h2>
          <p className="text-xs text-ink/60 mt-1">
            Issued {formatStamp(letter.created_at)}{letter.generated_by_name ? ` by ${letter.generated_by_name}` : ""}
            {letter.emailed_at ? ` · Emailed to ${letter.emailed_to} on ${formatStamp(letter.emailed_at)}` : " · Not emailed yet"}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => printSheet(sheetRef.current, letter.title)} className={secondaryBtn}><Printer size={15} /> Print</button>
          <button onClick={download} disabled={downloading} className={secondaryBtn}><Download size={15} /> {downloading ? "Preparing…" : "Download PDF"}</button>
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,380px)_1fr] gap-6 items-start">
        <div className="xl:sticky xl:top-4">
          <EmailPanel letter={letter} sheetRef={sheetRef} onSent={(d) => setLetter((l) => ({ ...l, ...d }))} />
        </div>
        <div className="bg-manila/60 rounded-sm p-3 sm:p-6 overflow-x-auto">
          <LetterSheet html={letter.rendered_body} sheetRef={sheetRef} />
        </div>
      </div>
    </div>
  );
}

function IssuedLettersTable({ onOpen }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.get("/api/letters/history", { params: { limit: 200 } }).then(({ data }) => setRows(data)).catch(() => setRows([]));
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!rows || !term) return rows || [];
    return rows.filter((r) => `${r.title} ${r.employee_name} ${r.employee_code} ${r.emailed_to || ""}`.toLowerCase().includes(term));
  }, [rows, q]);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h3 className="font-display text-xl text-ink">Issued letters</h3>
          <p className="text-xs text-ink/60">Every letter generated here, with whether it has been emailed.</p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code or letter…" className={`${inputCls} sm:w-64`} />
      </div>
      <div className="bg-paper rounded-sm shadow-card overflow-x-auto">
        {rows === null ? (
          <p className="p-5 text-sm text-ink/70">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink/60">{rows.length ? "No letters match that search." : "No letters issued yet. Pick a template above to issue the first one."}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink/60 border-b border-ink/10">
                <th className="px-4 py-2.5 font-semibold">Issued</th>
                <th className="px-4 py-2.5 font-semibold">Letter</th>
                <th className="px-4 py-2.5 font-semibold">For</th>
                <th className="px-4 py-2.5 font-semibold">Email</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-ink/5 last:border-0 hover:bg-manila/40">
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink/70">{formatOrdinalDate(r.created_at)}</td>
                  <td className="px-4 py-2.5 text-ink">{r.title}</td>
                  <td className="px-4 py-2.5 text-ink">
                    {r.employee_name || "—"}
                    {r.employee_code && <span className="text-ink/50 font-nums text-xs ml-1.5">{r.employee_code}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.emailed_at ? (
                      <span className="inline-flex items-center gap-1 text-xs text-jade-700 bg-jade-50 px-2 py-0.5 rounded-sm" title={formatStamp(r.emailed_at)}>
                        <CheckCircle2 size={12} /> {r.emailed_to}
                      </span>
                    ) : (
                      <span className="text-xs text-ink/50">Not sent</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => onOpen(r.id)} className="text-xs font-semibold text-jade-700 hover:underline">Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export default function Letters() {
  const { can } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("hub"); // hub | edit | new | generate | issued
  const [activeType, setActiveType] = useState(null);
  const [issuedId, setIssuedId] = useState(null);

  const load = () => {
    setLoading(true);
    api.get("/api/letters/templates").then(({ data }) => setTemplates(data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const active = templates.find((t) => t.letter_type === activeType);

  const grouped = useMemo(() => {
    const byGroup = {};
    for (const t of templates) {
      const g = LETTER_META[t.letter_type]?.group || "Custom";
      (byGroup[g] ||= []).push(t);
    }
    return GROUP_ORDER.filter((g) => byGroup[g]).map((g) => [g, byGroup[g]]);
  }, [templates]);

  const openIssued = (id) => { setIssuedId(id); setView("issued"); };

  if (view === "new") {
    return (
      <TemplateEditor
        template={null}
        onClose={() => setView("hub")}
        onSaved={(created) => {
          setTemplates((ts) => [...ts, created].sort((a, b) => a.title.localeCompare(b.title)));
          setView("hub");
        }}
      />
    );
  }

  if (view === "edit" && active) {
    return (
      <TemplateEditor
        template={active}
        onClose={() => setView("hub")}
        onSaved={(updated) => {
          setTemplates((ts) => ts.map((t) => (t.letter_type === updated.letter_type ? { ...t, ...updated } : t)));
          setView("hub");
        }}
        onDeleted={(letterType) => {
          setTemplates((ts) => ts.filter((t) => t.letter_type !== letterType));
          setView("hub");
        }}
      />
    );
  }

  if (view === "generate" && active) {
    return <LetterGenerator template={active} onClose={() => setView("hub")} onIssued={openIssued} />;
  }

  if (view === "issued" && issuedId) {
    return <IssuedLetter letterId={issuedId} onClose={() => setView("hub")} />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-2xl text-ink">Letters</h2>
          <p className="text-sm text-ink/70 mt-1">Issue offer, confirmation, conduct and exit letters on JADE letterhead, then print, download or email them.</p>
        </div>
        {can("letters.manage") && (
          <button onClick={() => setView("new")} className="flex items-center gap-1.5 bg-ledger-800 text-manila px-3 py-2 rounded-sm text-xs font-semibold hover:bg-ledger-700 transition-colors">
            <Plus size={14} /> New Letter Type
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-ink/70">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {grouped.map(([group, items]) => (
            <section key={group} className="bg-paper rounded-sm shadow-card">
              <p className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/55 border-b border-ink/10">{group}</p>
              <ul className="divide-y divide-ink/[0.07]">
                {items.map((t) => {
                  const meta = LETTER_META[t.letter_type] || { icon: FileText, blurb: "Custom letter template." };
                  const Icon = meta.icon;
                  return (
                    <li key={t.letter_type} className="flex items-center gap-3 px-4 py-3 hover:bg-manila/30 transition-colors">
                      <span className="w-8 h-8 rounded-sm bg-jade-50 text-jade-600 flex items-center justify-center flex-shrink-0"><Icon size={16} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-[15px] text-ink leading-tight">{t.title}</p>
                        <p className="text-xs text-ink/60 leading-snug mt-0.5 line-clamp-2">{meta.blurb}</p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        {can("letters.generate") && (
                          <button
                            onClick={() => { setActiveType(t.letter_type); setView("generate"); }}
                            className="bg-ledger-800 text-manila px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-ledger-700 transition-colors"
                          >
                            Generate
                          </button>
                        )}
                        {can("letters.manage") && (
                          <button
                            onClick={() => { setActiveType(t.letter_type); setView("edit"); }}
                            title="Edit template"
                            aria-label={`Edit ${t.title} template`}
                            className="flex items-center border border-ink/15 text-ink px-2 py-1.5 rounded-sm hover:border-jade-500 hover:text-jade-700 transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <IssuedLettersTable onOpen={openIssued} />
    </div>
  );
}
