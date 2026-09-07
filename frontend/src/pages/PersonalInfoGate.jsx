import { HeartPulse } from "lucide-react";
import { useMemo, useState } from "react";

import { useAuth } from "../lib/auth.jsx";
import api from "../lib/api.js";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

// mother_name/spouse_name is intentionally NOT in here — exactly one of them
// is required, decided at render time by marital_status (see conditionalField below).
const SECTIONS = [
  {
    label: "Personal",
    fields: [
      { k: "gender", l: "Gender", t: "select", options: ["Male", "Female", "Other"] },
      { k: "date_of_birth", l: "Date of Birth", t: "date" },
      { k: "marital_status", l: "Marital Status", t: "select", options: ["Single", "Married", "Divorced", "Widowed"] },
      { k: "father_name", l: "Father Name", t: "text" },
      // Mother Name / Spouse Name (whichever applies) is inserted here at
      // render time, right after Father Name — see conditionalField below.
      { k: "personal_email_id", l: "Personal Email", t: "email" },
      { k: "current_address", l: "Current Address", t: "textarea" },
    ],
  },
  {
    label: "Government IDs",
    fields: [
      { k: "aadhar_no", l: "Aadhar No", t: "text" },
      { k: "pan_no", l: "PAN No", t: "text" },
    ],
  },
  {
    label: "Bank Details",
    fields: [
      { k: "bank_name", l: "Bank Name", t: "text" },
      { k: "bank_account_no", l: "Bank Account No", t: "text" },
      { k: "bank_ifsc", l: "Bank IFSC", t: "text" },
    ],
  },
  {
    label: "Medical",
    fields: [
      { k: "blood_group", l: "Blood Group", t: "select", options: BLOOD_GROUPS },
      { k: "insurance", l: "Insurance", t: "text", placeholder: "Policy/provider details" },
    ],
  },
  {
    label: "Emergency Contacts",
    fields: [
      { k: "additional_contact_1_name", l: "Additional Contact 1 — Name", t: "text" },
      { k: "additional_contact_1_phone", l: "Additional Contact 1 — Phone", t: "text" },
      { k: "additional_contact_2_name", l: "Additional Contact 2 — Name", t: "text" },
      { k: "additional_contact_2_phone", l: "Additional Contact 2 — Phone", t: "text" },
    ],
  },
];

const ALL_KEYS = SECTIONS.flatMap((s) => s.fields.map((f) => f.k));

export default function PersonalInfoGate() {
  const { user, personalInfo, reloadPersonalInfo } = useAuth();
  const [form, setForm] = useState(() => {
    const initial = Object.fromEntries(ALL_KEYS.map((k) => [k, personalInfo?.[k] || ""]));
    initial.mother_name = personalInfo?.mother_name || "";
    initial.spouse_name = personalInfo?.spouse_name || "";
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  // Exactly one of Mother Name / Spouse Name is required, chosen by the
  // marital status the employee is filling in right now (not the server's
  // stale copy), so the form updates live as they pick it.
  const conditionalField = useMemo(
    () => (form.marital_status === "Married"
      ? { k: "spouse_name", l: "Spouse Name" }
      : { k: "mother_name", l: "Mother Name" }),
    [form.marital_status],
  );

  const allFilled =
    ALL_KEYS.every((k) => form[k]?.trim()) && form[conditionalField.k]?.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (!allFilled) return;
    setSubmitting(true);
    setError("");
    try {
      // Only send the conditional field that actually applies — no point
      // writing a stray value into the other one.
      const { mother_name, spouse_name, ...rest } = form;
      const payload = { ...rest, [conditionalField.k]: form[conditionalField.k] };
      await api.put("/api/me/personal-info", payload);
      // Flips the gate in AuthProvider, letting the router through to the
      // console the user was originally headed for.
      await reloadPersonalInfo();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not save your details — please try again.");
      setSubmitting(false);
    }
  };

  const renderField = (f) => (
    <label key={f.k} className="block">
      <span className="text-sm font-medium text-ink">{f.l}</span>
      {f.t === "select" ? (
        <select
          value={form[f.k]}
          onChange={(e) => set(f.k, e.target.value)}
          required
          className="mt-1 w-full border border-ink/20 rounded-sm px-3 py-2 text-sm bg-white"
        >
          <option value="" disabled>Select…</option>
          {f.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : f.t === "textarea" ? (
        <textarea
          value={form[f.k]}
          onChange={(e) => set(f.k, e.target.value)}
          required
          rows={2}
          className="mt-1 w-full border border-ink/20 rounded-sm px-3 py-2 text-sm"
        />
      ) : (
        <input
          type={f.t === "date" ? "date" : f.t === "email" ? "email" : "text"}
          value={form[f.k]}
          onChange={(e) => set(f.k, e.target.value)}
          placeholder={f.placeholder}
          required
          className="mt-1 w-full border border-ink/20 rounded-sm px-3 py-2 text-sm"
        />
      )}
    </label>
  );

  return (
    <div className="min-h-screen bg-manila flex flex-col">
      <header className="bg-ledger-800 text-manila px-5 sm:px-8 py-5">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <HeartPulse size={20} className="text-manila/80" />
            <h1 className="font-display text-xl sm:text-2xl">Personal information</h1>
          </div>
          <p className="text-sm text-manila/70 mt-1.5">
            {user?.name ? `${user.name}, before` : "Before"} you use the HR Console, please fill in your personal,
            ID, bank, medical and emergency contact details. This is required once and is stored on your employee record.
          </p>
        </div>
      </header>

      <div className="flex-1 max-w-2xl w-full mx-auto px-5 sm:px-8 py-6">
        <form onSubmit={submit} className="bg-paper rounded-sm shadow-card p-5 space-y-6">
          {SECTIONS.map((section) => (
            <div key={section.label} className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink/50">{section.label}</h2>
              {section.fields.map((f) => (
                <div key={f.k} className="space-y-4">
                  {renderField(f)}
                  {f.k === "father_name" && renderField({ ...conditionalField, t: "text" })}
                </div>
              ))}
            </div>
          ))}

          {error && <p className="text-sm text-rust-500">{error}</p>}
          <button
            type="submit"
            disabled={!allFilled || submitting}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-jade-600 text-white px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-jade-700 disabled:opacity-40 transition-colors"
          >
            <HeartPulse size={15} />
            {submitting ? "Saving…" : "Save and continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
