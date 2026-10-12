import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import axios from "axios";

// Public page behind the emailed offer links: the approver adds initials,
// the candidate types their name to sign. No login; the token is the key.
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "" });

export default function SignLetter() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.get(`/api/offers/sign/${token}`).then(({ data }) => setData(data)).catch((e) => setError(e.response?.data?.detail || "Could not load this letter"));
  }, [token]);

  if (error) return <p className="p-8 text-center text-rust-500">{error}</p>;
  if (!data) return <p className="p-8 text-center text-ink/70">Loading…</p>;

  const isApprover = data.role === "approver";
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post(`/api/offers/sign/${token}`, isApprover ? { initials: value, confirm } : { signature: value, confirm });
      setDone(true);
    } catch (e) {
      setError(e.response?.data?.detail || "Could not submit");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-manila/60 px-3 py-6">
      <div className="mx-auto max-w-[794px]">
        <article className="bg-white shadow-stamp px-6 py-8 sm:px-14 sm:py-12">
          <header className="flex flex-col items-center mb-8">
            <img src="/jade-letterhead-logo.png" alt="JADE" className="h-[60px] w-auto" />
            <div className="w-full mt-5 border-t border-ink/70" />
            <div className="w-full mt-[3px] border-t border-ink/20" />
          </header>
          <div className="letter-doc" dangerouslySetInnerHTML={{ __html: data.rendered_body }} />
        </article>

        <div className="bg-paper rounded-sm shadow-card p-5 mt-5 space-y-3">
          {done ? (
            <p className="flex items-center gap-2 text-jade-700"><CheckCircle2 size={18} /> {isApprover ? "Approved. The offer has been sent to the candidate to sign." : "Thank you. Your acceptance is recorded and a signed copy is on its way to your email."}</p>
          ) : !data.can_act ? (
            <p className="text-ink/70 text-sm">{data.status === "accepted" ? "This offer has been signed." : isApprover ? "This offer has already been approved." : "This offer is not ready to sign yet."}</p>
          ) : (
            <>
              <p className="font-display text-lg text-ink">{isApprover ? `Approve offer for ${data.candidate_name}` : "Accept this offer"}</p>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70">{isApprover ? "Your initials" : "Type your full name to sign"}</label>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                maxLength={isApprover ? 6 : 80}
                className={`w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 ${isApprover ? "uppercase tracking-widest" : ""}`}
                style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 20 }}
              />
              <label className="flex items-start gap-2 text-sm text-ink">
                <input type="checkbox" className="mt-1" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
                {isApprover ? "I approve this offer letter." : "I have read and understood the terms of this offer and accept them."}
              </label>
              {error && <p className="text-sm text-rust-500">{error}</p>}
              <button onClick={submit} disabled={busy || !value.trim() || !confirm} className="w-full bg-jade-600 text-white rounded-sm px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
                {busy ? "Submitting…" : isApprover ? "Approve offer" : "Sign and accept"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
