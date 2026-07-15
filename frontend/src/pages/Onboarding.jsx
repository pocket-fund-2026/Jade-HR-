import { useState } from "react";

import api from "../lib/api.js";

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
  date_of_offer_letter: "",
  designation: "", department: "", kra: "",
  requires_personal_email: false, requires_oms_login: false,
  place_of_work: LOCATIONS[0], timings_and_days: "",
  basic: "", hra: "", conveyance: "", other_allowance: "", monthly_ctc: "",
  signatory_name: "", signatory_designation: "", signatory_email: "",
  approver_name: "", approver_email: "", signature_confirmed: false,
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Section({ title, children }) {
  return (
    <div className="bg-paper rounded-sm shadow-card p-5 sm:p-6">
      <h3 className="font-display text-lg text-ink mb-4">{title}</h3>
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
      const paths = [];
      for (const file of files) {
        const content_base64 = await fileToBase64(file);
        const { data } = await api.post("/api/onboarding/upload", {
          filename: file.name,
          content_base64,
          content_type: file.type || "application/octet-stream",
        });
        paths.push(data.path);
      }
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
      {hint && <p className="text-xs text-ink/50 mb-1.5">{hint}</p>}
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
    setBusy(true);
    try {
      const payload = {
        ...form,
        date_of_birth: form.date_of_birth || null,
        date_of_joining: form.date_of_joining || null,
        date_of_offer_letter: form.date_of_offer_letter || null,
        basic: Number(form.basic) || 0,
        hra: Number(form.hra) || 0,
        conveyance: Number(form.conveyance) || 0,
        other_allowance: Number(form.other_allowance) || 0,
        monthly_ctc: Number(form.monthly_ctc) || 0,
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
        <div className="w-full max-w-sm relative bg-paper rounded-sm shadow-stamp px-8 pt-8 pb-7 border-t-4 border-jade-500 rise-in text-center">
          <p className="font-display text-ink text-xl mb-2">Thank you</p>
          <p className="text-sm text-ink/70">
            Your details have been submitted for JADE HR's review. You'll be contacted once your joining formalities are complete.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ledger-900 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
      <div className="relative max-w-3xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <img src="/jade-logo.png" alt="" className="w-12 h-12 mx-auto mb-3" />
          <p className="font-display text-manila text-2xl">New Joinee Details</p>
          <p className="text-manila/50 text-sm mt-1">Please fill in your details to complete your joining formalities with JADE</p>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <Section title="Personal Details">
            <TextField label="Full Name" value={form.full_name} onChange={set("full_name")} required span />
            <TextField label="Date of Birth" type="date" value={form.date_of_birth} onChange={set("date_of_birth")} required />
            <TextField label="Mobile" value={form.mobile} onChange={set("mobile")} required />
            <TextField label="Emergency Contact No." value={form.emergency_contact_no} onChange={set("emergency_contact_no")} required />
            <TextField label="Email" type="email" value={form.email} onChange={set("email")} required />
          </Section>

          <Section title="Permanent Address">
            <TextField label="Address Line 1" placeholder="Flat / house / apartment / society" value={form.address_line1} onChange={set("address_line1")} required span />
            <TextField label="Address Line 2" placeholder="Road / street" value={form.address_line2} onChange={set("address_line2")} required span />
            <TextField label="Address Line 3" placeholder="Landmark / area" value={form.address_line3} onChange={set("address_line3")} span />
            <TextField label="Address Line 4" placeholder="City - Pin - Country" value={form.address_line4} onChange={set("address_line4")} required span />
          </Section>

          <Section title="Employment Details">
            <TextField label="Date of Joining" type="date" value={form.date_of_joining} onChange={set("date_of_joining")} required />
            <CheckboxField label="I am a fresher" checked={form.is_fresher} onChange={setChecked("is_fresher")} />
          </Section>

          <Section title="Bank Account Information">
            <TextField label="Bank Name and Branch" value={form.bank_name} onChange={set("bank_name")} required span />
            <TextField label="Bank Account No" value={form.bank_account_no} onChange={set("bank_account_no")} required />
            <TextField label="Bank IFSC Code" value={form.bank_ifsc} onChange={set("bank_ifsc")} required />
          </Section>

          <Section title="Document Upload">
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
          </Section>

          <Section title="Job Designation">
            <TextField label="Designation" value={form.designation} onChange={set("designation")} required />
            <TextField label="Department" value={form.department} onChange={set("department")} required />
            <TextAreaField label="KRA in Detail" value={form.kra} onChange={set("kra")} required />
            <CheckboxField label="Requires Personal Email" checked={form.requires_personal_email} onChange={setChecked("requires_personal_email")} />
            <CheckboxField label="Requires Independent OMS Login" checked={form.requires_oms_login} onChange={setChecked("requires_oms_login")} />
          </Section>

          <Section title="Workplace & Schedule">
            <SelectField label="Place of Work" value={form.place_of_work} onChange={set("place_of_work")} options={LOCATIONS} required />
            <TextField label="Timings + Days" placeholder="e.g. 10:00 AM - 6:30 PM, Mon-Sat" value={form.timings_and_days} onChange={set("timings_and_days")} required />
          </Section>

          <Section title="Compensation">
            <TextField label="Basic" type="number" value={form.basic} onChange={set("basic")} required />
            <TextField label="HRA" type="number" value={form.hra} onChange={set("hra")} required />
            <TextField label="Conveyance" type="number" value={form.conveyance} onChange={set("conveyance")} required />
            <TextField label="Other Allowance" type="number" value={form.other_allowance} onChange={set("other_allowance")} required />
            <TextField label="Monthly CTC" type="number" value={form.monthly_ctc} onChange={set("monthly_ctc")} required span />
          </Section>

          <Section title="Authorization">
            <TextField label="Full Name of Authorized Signatory" value={form.signatory_name} onChange={set("signatory_name")} required />
            <TextField label="Designation of Authorized Signatory" value={form.signatory_designation} onChange={set("signatory_designation")} required />
            <TextField label="Email of Authorized Signatory" type="email" value={form.signatory_email} onChange={set("signatory_email")} required />
            <TextField label="Approver Name" value={form.approver_name} onChange={set("approver_name")} required />
            <TextField label="Approver Email" type="email" value={form.approver_email} onChange={set("approver_email")} required />
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
