import { ChevronDown, HelpCircle } from "lucide-react";
import { useState } from "react";

import api from "../lib/api.js";

const LOCATIONS = [
  "Madhu Estate, Mumbai",
  "Pedder Road, Mumbai",
  "Mehrauli (Ambawatta), Delhi",
  "Emporio, Delhi",
  "Ahmedabad",
];

// Mirrors the Section titles below, in order — used to render the step
// progress strip and to number each Section heading.
const STEP_TITLES = [
  "Personal Details", "Permanent Address", "Employment Details", "Bank Account Information",
  "Document Upload", "Job Designation", "Workplace & Schedule", "Confirmation",
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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
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
          const content_base64 = await fileToBase64(file);
          const { data } = await api.post("/api/onboarding/upload", {
            filename: file.name,
            content_base64,
            content_type: file.type || "application/octet-stream",
          });
          return data.path;
        }),
      );
      onUploaded(multiple ? paths : paths[0]);
      setStatus(multiple ? `${paths.length} file(s) added` : "Uploaded");
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed — please try again");
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

function StepStrip() {
  return (
    <div className="hidden sm:flex items-center gap-1.5 mb-6 overflow-x-auto">
      {STEP_TITLES.map((title, i) => (
        <a
          key={title}
          href={`#step-${i + 1}`}
          title={title}
          className="flex-shrink-0 w-7 h-7 rounded-full bg-manila/20 border border-manila/30 text-manila/70 text-xs font-semibold flex items-center justify-center hover:bg-manila/30 hover:text-manila transition-colors"
        >
          {i + 1}
        </a>
      ))}
      <span className="text-manila/50 text-xs ml-1">{STEP_TITLES.length} short sections — jump to any of them</span>
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

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setChecked = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.checked }));
  const setFile = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.photo_path) {
      setError("Please upload a photo before submitting");
      window.scrollTo(0, 0);
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...form,
        date_of_birth: form.date_of_birth || null,
        date_of_joining: form.date_of_joining || null,
        date_of_offer_letter: form.date_of_offer_letter || null,
      };
      await api.post("/api/onboarding/submit", payload);
      setDone(true);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.response?.data?.detail || "Submission failed — please check the form and try again");
      window.scrollTo(0, 0);
    } finally {
      setBusy(false);
    }
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

        <StepStrip />
        <FaqPanel />

        <form onSubmit={submit} className="space-y-5">
          <Section title="Personal Details" step={1}>
            <TextField label="Full Name" value={form.full_name} onChange={set("full_name")} required span />
            <TextField label="Date of Birth" type="date" value={form.date_of_birth} onChange={set("date_of_birth")} required />
            <TextField label="Mobile" value={form.mobile} onChange={set("mobile")} required />
            <TextField label="Emergency Contact No." value={form.emergency_contact_no} onChange={set("emergency_contact_no")} required />
            <TextField label="Email" type="email" value={form.email} onChange={set("email")} required />
            <FileField label="Upload Photo" hint="A clear passport-style photo" count={form.photo_path ? 1 : 0} onUploaded={setFile("photo_path")} />
          </Section>

          <Section title="Permanent Address" step={2}>
            <TextField label="Address Line 1" placeholder="Flat / house / apartment / society" value={form.address_line1} onChange={set("address_line1")} required span />
            <TextField label="Address Line 2" placeholder="Road / street" value={form.address_line2} onChange={set("address_line2")} required span />
            <TextField label="Address Line 3" placeholder="Landmark / area" value={form.address_line3} onChange={set("address_line3")} span />
            <TextField label="Address Line 4" placeholder="City - Pin - Country" value={form.address_line4} onChange={set("address_line4")} required span />
          </Section>

          <Section title="Employment Details" step={3}>
            <TextField label="Date of Joining" type="date" value={form.date_of_joining} onChange={set("date_of_joining")} required />
            <CheckboxField label="I am a fresher" checked={form.is_fresher} onChange={setChecked("is_fresher")} />
          </Section>

          <Section title="Bank Account Information" step={4}>
            <TextField label="Bank Name and Branch" value={form.bank_name} onChange={set("bank_name")} required span />
            <TextField label="Bank Account No" value={form.bank_account_no} onChange={set("bank_account_no")} required />
            <TextField label="Bank IFSC Code" value={form.bank_ifsc} onChange={set("bank_ifsc")} required />
          </Section>

          <Section title="Document Upload" step={5}>
            <TextField label="Aadhar Card No" value={form.aadhar_no} onChange={set("aadhar_no")} required />
            <TextField label="PAN Card No" value={form.pan_no} onChange={set("pan_no")} required />
            <FileField label="Upload Aadhar Card — Front" count={form.aadhar_front_path ? 1 : 0} onUploaded={setFile("aadhar_front_path")} />
            <FileField label="Upload Aadhar Card — Back" count={form.aadhar_back_path ? 1 : 0} onUploaded={setFile("aadhar_back_path")} />
            <FileField label="Upload PAN Card" count={form.pan_card_path ? 1 : 0} onUploaded={setFile("pan_card_path")} />
            <FileField
              label="Upload Latest Salary Slip(s)"
              hint="You can select more than one page/file"
              multiple
              count={form.salary_slip_paths.length}
              onUploaded={(paths) => setForm((f) => ({ ...f, salary_slip_paths: [...f.salary_slip_paths, ...paths] }))}
            />
            <TextField label="Date of Offer Letter" type="date" value={form.date_of_offer_letter} onChange={set("date_of_offer_letter")} />
            <FileField
              label="Upload Resume"
              hint="For offline/consultant hires without one already on file — optional otherwise"
              count={form.resume_path ? 1 : 0}
              onUploaded={setFile("resume_path")}
            />
          </Section>

          <Section title="Job Designation" step={6}>
            <TextField label="Designation" value={form.designation} onChange={set("designation")} required />
            <TextField label="Department" value={form.department} onChange={set("department")} required />
            <TextAreaField label="KRA in Detail" value={form.kra} onChange={set("kra")} required />
            <CheckboxField label="Requires Personal Email" checked={form.requires_personal_email} onChange={setChecked("requires_personal_email")} />
            <CheckboxField label="Requires Independent OMS Login" checked={form.requires_oms_login} onChange={setChecked("requires_oms_login")} />
          </Section>

          <Section title="Workplace & Schedule" step={7}>
            <SelectField label="Place of Work" value={form.place_of_work} onChange={set("place_of_work")} options={LOCATIONS} required />
            <TextField label="Timings + Days" placeholder="e.g. 10:00 AM - 6:30 PM, Mon-Sat" value={form.timings_and_days} onChange={set("timings_and_days")} required />
          </Section>

          <Section title="Confirmation" step={8}>
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
