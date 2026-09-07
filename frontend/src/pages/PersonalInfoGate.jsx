import { HeartPulse } from "lucide-react";
import { useState } from "react";

import { useAuth } from "../lib/auth.jsx";
import api from "../lib/api.js";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

const FIELDS = [
  { k: "blood_group", l: "Blood Group", t: "select", options: BLOOD_GROUPS },
  { k: "insurance", l: "Insurance", t: "text", placeholder: "Policy/provider details" },
  { k: "additional_contact_1_name", l: "Additional Contact 1 — Name", t: "text" },
  { k: "additional_contact_1_phone", l: "Additional Contact 1 — Phone", t: "text" },
  { k: "additional_contact_2_name", l: "Additional Contact 2 — Name", t: "text" },
  { k: "additional_contact_2_phone", l: "Additional Contact 2 — Phone", t: "text" },
];

export default function PersonalInfoGate() {
  const { user, personalInfo, reloadPersonalInfo } = useAuth();
  const [form, setForm] = useState(() =>
    Object.fromEntries(FIELDS.map((f) => [f.k, personalInfo?.[f.k] || ""])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const allFilled = FIELDS.every((f) => form[f.k]?.trim());

  const submit = async (e) => {
    e.preventDefault();
    if (!allFilled) return;
    setSubmitting(true);
    setError("");
    try {
      await api.put("/api/me/personal-info", form);
      // Flips the gate in AuthProvider, letting the router through to the
      // console the user was originally headed for.
      await reloadPersonalInfo();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not save your details — please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-manila flex flex-col">
      <header className="bg-ledger-800 text-manila px-5 sm:px-8 py-5">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <HeartPulse size={20} className="text-manila/80" />
            <h1 className="font-display text-xl sm:text-2xl">Personal information</h1>
          </div>
          <p className="text-sm text-manila/70 mt-1.5">
            {user?.name ? `${user.name}, before` : "Before"} you use the HR Console, please fill in your medical and
            emergency contact details. This is required once and is stored on your employee record.
          </p>
        </div>
      </header>

      <div className="flex-1 max-w-2xl w-full mx-auto px-5 sm:px-8 py-6">
        <form onSubmit={submit} className="bg-paper rounded-sm shadow-card p-5 space-y-4">
          {FIELDS.map((f) => (
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
              ) : (
                <input
                  type="text"
                  value={form[f.k]}
                  onChange={(e) => set(f.k, e.target.value)}
                  placeholder={f.placeholder}
                  required
                  className="mt-1 w-full border border-ink/20 rounded-sm px-3 py-2 text-sm"
                />
              )}
            </label>
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
