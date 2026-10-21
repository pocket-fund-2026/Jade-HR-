import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import axios from "axios";

// Public page behind the biometric-enrolment email sent to JADE HR (Laki)
// once a new joiner's work email is set. Confirming here closes the
// biometric step of the onboarding pipeline. The token is the key.
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "" });

const METHODS = [
  { key: "fingerprint", label: "Fingerprint" },
  { key: "face", label: "Face" },
  { key: "card", label: "Card" },
];

const inputCls = "w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 border-b border-ink/10 py-2 text-sm">
      <span className="text-ink/60 text-xs uppercase tracking-wider font-semibold">{label}</span>
      <span className="text-ink font-medium text-right">{value || "—"}</span>
    </div>
  );
}

export default function BiometricForm() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [deviceCode, setDeviceCode] = useState("");
  const [methods, setMethods] = useState(["fingerprint"]);
  const [by, setBy] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.get(`/api/onboarding-cases/biometric/${token}`)
      .then(({ data }) => { setData(data); setDeviceCode(data.employee_code || ""); })
      .catch((e) => setError(e.response?.data?.detail || "Could not load this form"));
  }, [token]);

  if (error && !data) return <p className="p-8 text-center text-rust-500">{error}</p>;
  if (!data) return <p className="p-8 text-center text-ink/70"><span className="t-shimmer" data-text="Loading…">Loading…</span></p>;

  const toggle = (key) => setMethods((m) => (m.includes(key) ? m.filter((x) => x !== key) : [...m, key]));
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post(`/api/onboarding-cases/biometric/${token}`, { device_code: deviceCode, methods, enrolled_by: by, note });
      setDone(true);
    } catch (e) {
      setError(e.response?.data?.detail || "Could not submit");
    } finally {
      setBusy(false);
    }
  };
  const mismatch = deviceCode.trim() && data.employee_code && deviceCode.trim() !== data.employee_code;

  return (
    <div className="min-h-screen bg-manila/60 px-4 py-6">
      <div className="mx-auto max-w-[560px] space-y-4">
        <div className="text-center">
          <img src="/jade-letterhead-logo.png" alt="JADE" className="h-[48px] w-auto mx-auto" />
          <p className="font-display text-xl text-ink mt-3">Biometric enrolment form</p>
        </div>
        <div className="bg-paper rounded-sm shadow-card p-5">
          <Row label="Employee" value={data.employee_name} />
          <Row label="Employee code" value={data.employee_code} />
          <Row label="Designation" value={data.designation} />
          <Row label="Department" value={data.department} />
          <Row label="Location" value={data.location} />
          <Row label="Date of joining" value={data.date_of_joining} />
          <Row label="Mobile" value={data.mobile} />
          <Row label="Work email" value={data.work_email} />
        </div>

        <div className="bg-paper rounded-sm shadow-card p-5 space-y-3">
          {done || data.enrolled_at ? (
            <p className="flex items-center gap-2 text-jade-700 text-sm"><CheckCircle2 size={18} /> Enrolment confirmed{data.device_code ? ` (device ID ${data.device_code})` : ""}. Thank you.</p>
          ) : (
            <>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70">Device user ID</label>
              <input value={deviceCode} onChange={(e) => setDeviceCode(e.target.value)} className={inputCls} />
              {mismatch && <p className="text-xs text-rust-500">This does not match the employee code {data.employee_code}. Attendance will not link unless they match.</p>}
              <p className="block text-xs font-semibold uppercase tracking-wider text-ink/70">Enrolled with</p>
              <div className="flex gap-4">
                {METHODS.map((m) => (
                  <label key={m.key} className="flex items-center gap-1.5 text-sm text-ink">
                    <input type="checkbox" checked={methods.includes(m.key)} onChange={() => toggle(m.key)} /> {m.label}
                  </label>
                ))}
              </div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70">Your name</label>
              <input value={by} onChange={(e) => setBy(e.target.value)} className={inputCls} />
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70">Note (optional)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
              {error && <p className="text-sm text-rust-500">{error}</p>}
              <button onClick={submit} disabled={busy || !deviceCode.trim() || !methods.length || by.trim().length < 2} className="w-full bg-jade-600 text-white rounded-sm px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
                {busy ? "Submitting…" : "Confirm enrolment"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
