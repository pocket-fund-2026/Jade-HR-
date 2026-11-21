import { CheckCircle2 } from "lucide-react";
import axios from "axios";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { SIGNATURE_FONT_STACK } from "../lib/signature.js";

// Public one-tap page behind the emailed exit-clearance link: who is leaving,
// which rows are yours, one tick, one button. The link itself identifies the
// signer, so there is no login and nothing to type.
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "" });

function fmt(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export default function ExitSignoffLink() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.get(`/api/exit-sign/${token}`).then(({ data }) => setData(data)).catch((e) => setError(e.response?.data?.detail || "Could not load this page"));
  }, [token]);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post(`/api/exit-sign/${token}/sign`, { confirm, notes });
      setDone(true);
    } catch (e) {
      setError(e.response?.data?.detail || "Could not sign off");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <p className="p-8 text-center text-ink/70">{error || "Loading…"}</p>;
  const allDone = data.pending === 0;

  return (
    <div className="min-h-screen bg-manila/60 px-3 py-8">
      <div className="mx-auto max-w-[520px] bg-paper rounded-sm shadow-stamp border-t-4 border-jade-500 p-6 space-y-5">
        <div className="flex flex-col items-center">
          <img src="/jade-letterhead-logo.png" alt="JADE" className="h-[48px] w-auto" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-jade-600">Exit clearance</p>
          <p className="font-display text-2xl text-ink mt-1">{data.leaver.name}</p>
          <p className="text-sm text-ink/70">
            {data.leaver.code} · {data.leaver.department || "—"} · last working day {fmt(data.leaver.last_working_day)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-2">What you are clearing</p>
          <ul className="space-y-1.5">
            {data.items.map((i, k) => (
              <li key={k} className="flex items-center gap-2 text-sm text-ink">
                <CheckCircle2 size={16} className={i.done || done ? "text-jade-600" : "text-ink/20"} />
                <span><strong>{i.row}</strong> — {i.label}</span>
              </li>
            ))}
          </ul>
        </div>

        {done || allDone ? (
          <p className="flex items-center gap-2 text-jade-700 text-sm"><CheckCircle2 size={18} /> {done ? "Signed off. Thank you." : "You have already signed off everything for this person."}</p>
        ) : !data.exit_open ? (
          <p className="text-sm text-ink/70">This exit is already closed.</p>
        ) : (
          <>
            <div>
              <p className="text-xs text-ink/60 mb-1">Signing as</p>
              <div className="border-b border-ink/40 min-h-[56px] flex items-end px-2 pb-1">
                <span style={{ fontFamily: SIGNATURE_FONT_STACK, fontSize: 38, color: "#1a2a6c", lineHeight: 1.2 }}>{data.signer_name}</span>
              </div>
            </div>
            <input
              value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note (optional)"
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
            />
            <label className="flex items-start gap-2 text-sm text-ink cursor-pointer">
              <input type="checkbox" className="mt-1" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
              Everything under my department is cleared for {data.leaver.name}.
            </label>
            {error && <p className="text-sm text-rust-500">{error}</p>}
            <button onClick={submit} disabled={busy || !confirm} className="w-full bg-jade-600 text-white rounded-sm px-4 py-3 text-sm font-semibold disabled:opacity-50">
              {busy ? "Signing…" : "Sign off"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
