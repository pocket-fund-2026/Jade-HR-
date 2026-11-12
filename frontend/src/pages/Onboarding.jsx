import { ChevronDown, HelpCircle } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../lib/api.js";
import { CORE_FIELDS, CORE_SECTIONS, effectiveField } from "../lib/onboardingFields.js";
import { prepareUpload } from "../lib/upload.js";

const LOCATIONS = [
  "Madhu Estate, Mumbai",
  "Pedder Road, Mumbai",
  "Mehrauli (Ambawatta), Delhi",
  "Emporio, Delhi",
  "Ahmedabad",
];

const EMPTY_FORM = {
  full_name: "", date_of_birth: "", mobile: "", emergency_contact_no: "", email: "",
  address_line1: "", address_line2: "", address_line3: "", address_line4: "",
  date_of_joining: "", is_fresher: false,
  bank_name: "", bank_account_no: "", bank_ifsc: "",
  aadhar_no: "", aadhar_front_path: "", aadhar_back_path: "",
  pan_no: "", pan_card_path: "", salary_slip_paths: [],
  photo_path: "", resume_path: "",
  date_of_offer_letter: "",
  designation: "", department: "", kra: "",
  requires_personal_email: false, requires_oms_login: false,
  place_of_work: LOCATIONS[0], timings_and_days: "",
  signature_confirmed: false,
};

function Section({ title, step, children }) {
  return (
    <div id={`step-${step}`} className="bg-paper rounded-sm shadow-card p-5 sm:p-6 scroll-mt-4">
      <h3 className="font-display text-lg text-ink mb-4 flex items-center gap-2.5">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-jade-600 text-white text-xs font-semibold flex items-center justify-center">
          {step}
        </span>
        {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function TextField({ label, value, onChange, type = "text", span, required, placeholder }) {
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">
        {label}{required && <span className="text-rust-500"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500"
      />
    </div>
  );
}

function TextAreaField({ label, value, onChange, required }) {
  return (
    <div className="sm:col-span-2">
      <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">
        {label}{required && <span className="text-rust-500"> *</span>}
      </label>
      <textarea
        value={value}
        onChange={onChange}
        required={required}
        rows={3}
        className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options, required }) {
  // options: strings, or {value, label} pairs
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">
        {label}{required && <span className="text-rust-500"> *</span>}
      </label>
      <select
        value={value}
        onChange={onChange}
        required={required}
        className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500"
      >
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function CheckboxField({ label, checked, onChange, span }) {
  return (
    <label className={`flex items-center gap-2 text-sm text-ink cursor-pointer ${span ? "sm:col-span-2" : ""}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="w-4 h-4 accent-jade-600" />
      {label}
    </label>
  );
}

function FileField({ label, hint, multiple, count, onUploaded }) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setError("");
    setBusy(true);
    setStatus("Uploading…");
    try {
      const paths = await Promise.all(
        files.map(async (file) => {
          const { data } = await api.post("/api/onboarding/upload", await prepareUpload(file));
          return data.path;
        }),
      );
      onUploaded(multiple ? paths : paths[0]);
      setStatus(multiple ? `${paths.length} file(s) added` : "Uploaded");
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Upload failed — please try again");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">{label}</label>
      {hint && <p className="text-xs text-ink/70 mb-1.5">{hint}</p>}
      <input
        type="file"
        accept="image/*,.pdf"
        multiple={multiple}
        disabled={busy}
        onChange={handleFiles}
        className="w-full text-xs text-ink/70 file:mr-3 file:rounded-sm file:border-0 file:bg-ledger-800 file:text-manila file:px-3 file:py-2 file:text-xs file:font-semibold file:cursor-pointer disabled:opacity-50"
      />
      {(status || count > 0) && (
        <p className="text-xs text-jade-600 mt-1">{status || `${count} file(s) on file`}</p>
      )}
      {error && <p className="text-xs text-rust-500 mt-1">{error}</p>}
    </div>
  );
}

// One HR-defined extra field (sql/080) — rendered with the same building
// blocks as the built-in ones; answers go to custom_values[field_key].
function CustomField({ field, value, onChange }) {
  const label = field.help_text ? `${field.label}` : field.label;
  const hint = field.help_text ? <p className="text-xs text-ink/60 -mt-1">{field.help_text}</p> : null;
  let input;
  if (field.field_type === "textarea") input = <TextAreaField label={label} value={value || ""} onChange={(e) => onChange(e.target.value)} required={field.required} />;
  else if (field.field_type === "select") input = <SelectField label={label} value={value || ""} onChange={(e) => onChange(e.target.value)} options={field.options} required={field.required} />;
  else if (field.field_type === "checkbox") input = <CheckboxField label={label} checked={!!value} onChange={(e) => onChange(e.target.checked)} span />;
  else if (field.field_type === "file") input = <FileField label={`${label}${field.required ? " *" : ""}`} onUploaded={onChange} count={value ? 1 : 0} />;
  else input = <TextField label={label} type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"} value={value || ""} onChange={(e) => onChange(e.target.value)} required={field.required} />;
  return <div className={field.field_type === "textarea" || field.field_type === "checkbox" ? "sm:col-span-2" : ""}>{input}{hint}</div>;
}

function StepStrip({ titles }) {
  return (
    <div className="hidden sm:flex items-center gap-1.5 mb-6 overflow-x-auto">
      {titles.map((title, i) => (
        <a
          key={title}
          href={`#step-${i + 1}`}
          title={title}
          className="flex-shrink-0 w-7 h-7 rounded-full bg-manila/20 border border-manila/30 text-manila/70 text-xs font-semibold flex items-center justify-center hover:bg-manila/30 hover:text-manila transition-colors"
        >
          {i + 1}
        </a>
      ))}
      <span className="text-manila/50 text-xs ml-1">{titles.length} short sections — jump to any of them</span>
    </div>
  );
}

function FaqPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-paper border-l-4 border-jade-500 rounded-sm shadow-card mb-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-jade-700">
          <HelpCircle size={15} /> What happens after I submit this?
        </span>
        <ChevronDown size={16} className={`text-jade-700 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-ink/80 space-y-2">
          <p>You don't need an Employee Code or login to fill in or submit this form.</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Your details go straight to JADE HR's review queue.</li>
            <li>Once you're enrolled on the biometric attendance device and your first punch/the next roster sync assigns you an Employee Code, this submission is automatically matched to it by name.</li>
            <li>Your employee record then gets filled in from what you submitted here — no need to re-enter anything.</li>
            <li>You can then log in with your Employee Code and password (given to you by HR) and see everything you submitted under "My Onboarding" in your dashboard.</li>
          </ol>
          <p className="text-xs text-ink/60">This usually takes a day or so. If it's been longer and you still can't log in, check with HR.</p>
        </div>
      )}
    </div>
  );
}

export default function Onboarding() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [refNo, setRefNo] = useState(null);
  const [extraFields, setExtraFields] = useState([]);
  const [custom, setCustom] = useState({});
  const [overrides, setOverrides] = useState({});

  const [locationOptions, setLocationOptions] = useState(LOCATIONS);
  useEffect(() => {
    api.get("/api/onboarding/locations").then(({ data }) => {
      if (!data?.length) return;
      setLocationOptions(data.map((l) => ({
        value: l.value,
        label: `${l.is_hq ? "HQ — " : ""}${l.value}${l.address ? ` — ${l.address}` : ""}`,
      })));
    }).catch(() => {});
    api.get("/api/onboarding/fields").then(({ data }) => setExtraFields(data)).catch(() => {});
    api.get("/api/onboarding/core-fields").then(({ data }) => setOverrides(data || {})).catch(() => {});
  }, []);

  // Extra fields grouped by the section name HR gave them, in the order defined.
  const extraSections = extraFields.reduce((acc, f) => {
    (acc.find((g) => g.title === f.section) || (acc[acc.push({ title: f.section, fields: [] }) - 1])).fields.push(f);
    return acc;
  }, []);

  // Built-in questions after HR's builder overrides: hidden ones drop out, and a section with nothing left disappears.
  const coreSections = CORE_SECTIONS
    .map((title) => ({ title, fields: CORE_FIELDS.filter((f) => f.section === title).map((f) => effectiveField(f, overrides)).filter((f) => !f.hidden) }))
    .filter((g) => g.fields.length);
  const stepTitles = [...coreSections.map((g) => g.title), ...extraSections.map((g) => g.title), "Confirmation"];

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setChecked = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.checked }));
  const setFile = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const missingCoreFile = CORE_FIELDS.map((f) => effectiveField(f, overrides)).find(
      (f) => !f.hidden && f.required && (f.type === "file" || f.type === "files")
        && !(f.type === "files" ? form[f.key]?.length : form[f.key]),
    );
    if (missingCoreFile) {
      setError(`Please upload: ${missingCoreFile.label}`);
      window.scrollTo(0, 0);
      return;
    }
    const missingFile = extraFields.find((f) => f.field_type === "file" && f.required && !custom[f.field_key]);
    if (missingFile) {
      setError(`Please upload: ${missingFile.label}`);
      window.scrollTo(0, 0);
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...form,
        custom_values: custom,
        date_of_birth: form.date_of_birth || null,
        date_of_joining: form.date_of_joining || null,
        date_of_offer_letter: form.date_of_offer_letter || null,
      };
      const { data } = await api.post("/api/onboarding/submit", payload);
      setRefNo(data.reference_no || null);
      setDone(true);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.response?.data?.detail || "Submission failed — please check the form and try again");
      window.scrollTo(0, 0);
    } finally {
      setBusy(false);
    }
  };

  const renderCoreField = (f) => {
    const k = f.key;
    if (f.type === "checkbox") return <CheckboxField key={k} label={f.label} checked={!!form[k]} onChange={setChecked(k)} />;
    if (f.type === "file") return <FileField key={k} label={f.label} hint={f.hint} count={form[k] ? 1 : 0} onUploaded={setFile(k)} />;
    if (f.type === "files") {
      return (
        <FileField
          key={k} label={f.label} hint={f.hint} multiple count={form[k].length}
          onUploaded={(paths) => setForm((cur) => ({ ...cur, [k]: [...cur[k], ...paths] }))}
        />
      );
    }
    if (f.type === "textarea") return <TextAreaField key={k} label={f.label} value={form[k]} onChange={set(k)} required={f.required} />;
    if (f.type === "place") return <SelectField key={k} label={f.label} value={form[k]} onChange={set(k)} options={locationOptions} required={f.required} />;
    return (
      <TextField
        key={k} label={f.label} type={f.type === "date" ? "date" : f.type === "email" ? "email" : "text"}
        placeholder={f.placeholder} value={form[k]} onChange={set(k)} required={f.required} span={f.span}
      />
    );
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ledger-900 px-4 py-12 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <div className="w-full max-w-md relative bg-paper rounded-sm shadow-stamp px-8 pt-8 pb-7 border-t-4 border-jade-500 rise-in text-center">
          <p className="font-display text-ink text-xl mb-2">Thank you, {form.full_name.split(" ")[0] || "there"}</p>
          <p className="text-sm text-ink/70 mb-5">
            Your details have been submitted for JADE HR's review.
          </p>
          {refNo && (
            <p className="text-sm text-ink mb-5">
              Your reference number: <span className="font-nums font-semibold text-jade-700">#{refNo}</span>
              <span className="block text-xs text-ink/60 mt-0.5">Quote this if you contact HR about your joining.</span>
            </p>
          )}
          <div className="text-left bg-manila/40 rounded-sm p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">What happens next</p>
            <ol className="list-decimal pl-5 text-sm text-ink/80 space-y-1.5">
              <li>HR will enroll you on the biometric attendance device at your work location.</li>
              <li>Your first punch (or the next nightly sync) assigns you an Employee Code and links it back to this submission automatically.</li>
              <li>HR will share your Employee Code and an initial password with you so you can log in.</li>
              <li>Once logged in, you'll find everything you submitted here under "My Onboarding" in your dashboard.</li>
            </ol>
          </div>
          <p className="text-xs text-ink/50 mt-4">This usually takes a day or so — reach out to HR if it's been longer.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ledger-900 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
      <div className="relative max-w-3xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <img src="/jade-logo.png" alt="" className="w-24 h-24 mx-auto mb-3" />
          <p className="font-display text-manila text-2xl">New Joinee Details</p>
          <p className="text-manila/60 text-sm mt-1">Please fill in your details to complete your joining formalities with JADE</p>
        </div>

        <StepStrip titles={stepTitles} />
        <FaqPanel />

        <form onSubmit={submit} className="space-y-5">
          {coreSections.map((g, i) => (
            <Section key={g.title} title={g.title} step={i + 1}>
              {g.fields.map((f) => renderCoreField(f))}
            </Section>
          ))}

          {extraSections.map((g, i) => (
            <Section key={g.title} title={g.title} step={coreSections.length + 1 + i}>
              {g.fields.map((f) => (
                <CustomField key={f.field_key} field={f} value={custom[f.field_key]} onChange={(v) => setCustom((c) => ({ ...c, [f.field_key]: v }))} />
              ))}
            </Section>
          ))}

          <Section title="Confirmation" step={coreSections.length + extraSections.length + 1}>
            <CheckboxField
              label="I confirm the details above are accurate to the best of my knowledge"
              checked={form.signature_confirmed}
              onChange={setChecked("signature_confirmed")}
              span
            />
          </Section>

          {error && (
            <p className="text-sm text-rust-500 bg-paper rounded-sm border-l-2 border-rust-500 px-4 py-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-sm bg-jade-600 text-white py-3 font-semibold tracking-wide hover:bg-jade-700 disabled:opacity-50 transition-colors"
          >
            {busy ? "Submitting…" : "Submit Details"}
          </button>
        </form>
      </div>
    </div>
  );
}
