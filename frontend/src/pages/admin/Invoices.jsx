import { ArrowLeft, Check, FileText, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";

const STATUSES = [
  ["", "All"], ["pending_verification", "To verify"], ["verified", "To approve"], ["approved", "To pay"],
  ["paid", "Paid"], ["verification_rejected", "Verification rejected"], ["rejected", "Rejected"],
];
const TONE = { verified: "pending", pending_verification: "pending", approved: "approved", paid: "approved", rejected: "rejected", verification_rejected: "rejected" };
const LABEL = {
  pending_verification: "Awaiting verification", verification_rejected: "Verification rejected", verified: "Awaiting approval",
  approved: "Approved", rejected: "Rejected", paid: "Paid",
};
const money = (n) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const inputCls = "w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jade-500";

function InvoiceDetail({ id, onBack, onChanged }) {
  const { can } = useAuth();
  const [inv, setInv] = useState(null);
  const [note, setNote] = useState("");
  const [payRef, setPayRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = () => api.get(`/api/invoices/${id}`).then(({ data }) => setInv(data));
  useEffect(() => { load(); }, [id]);

  const act = async (path, body = { note }, params) => {
    setBusy(true); setError("");
    try { await api.post(`/api/invoices/${id}/${path}`, body, { params }); setNote(""); await load(); onChanged(); }
    catch (err) { setError(err.response?.data?.detail || "That did not go through"); }
    finally { setBusy(false); }
  };

  if (!inv) return <p className="text-ink/70 text-sm">Loading…</p>;
  const ex = inv.extracted || {};
  const isPdf = inv.attachment_type === "application/pdf";
  const mismatch = (a, b) => b != null && b !== "" && String(a).toLowerCase().replace(/[^a-z0-9]/g, "") !== String(b).toLowerCase().replace(/[^a-z0-9]/g, "");

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-ink/70 hover:text-ink mb-4"><ArrowLeft size={15} /> Back to invoices</button>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(340px,440px)_1fr] gap-5 items-start">
        <div className="space-y-4">
          <div className="bg-paper rounded-sm shadow-card p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/55">Ref #{inv.reference_no}</p>
                <h3 className="font-display text-xl text-ink">{inv.vendor_name}</h3>
                <p className="text-xs text-ink/70">{inv.vendor_email} · {inv.vendor_phone}</p>
              </div>
              <StampBadge status={TONE[inv.status]}>{LABEL[inv.status]}</StampBadge>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-ink/60">Invoice number</dt><dd className="text-ink font-nums">{inv.invoice_number}</dd></div>
              <div><dt className="text-xs text-ink/60">Amount</dt><dd className="text-ink font-nums">{money(inv.amount)}</dd></div>
              <div><dt className="text-xs text-ink/60">Invoice date</dt><dd className="text-ink">{inv.invoice_date || "—"}</dd></div>
              <div><dt className="text-xs text-ink/60">Submitted</dt><dd className="text-ink">{new Date(inv.submitted_at).toLocaleString()}</dd></div>
            </dl>
            {inv.bill_details && <p className="text-sm text-ink/80 whitespace-pre-wrap border-t border-ink/10 pt-3">{inv.bill_details}</p>}
          </div>

          <div className="bg-paper rounded-sm shadow-card p-5">
            <p className="font-display text-base text-ink mb-2">Read from the invoice</p>
            {Object.keys(ex).filter((k) => k !== "submitter").length === 0 ? <p className="text-xs text-ink/60">Nothing could be read automatically (image or scanned PDF).</p> : (
              <dl className="text-sm space-y-1.5">
                <div className="flex justify-between"><dt className="text-ink/60">Company</dt><dd className="text-ink">{ex.company_name || "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-ink/60">Invoice number</dt><dd className={mismatch(inv.invoice_number, ex.invoice_number) ? "text-rust-500" : "text-ink"}>{ex.invoice_number || "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-ink/60">Amount</dt><dd className={ex.amount != null && Math.abs(ex.amount - Number(inv.amount)) > 0.01 ? "text-rust-500" : "text-ink"}>{ex.amount != null ? money(ex.amount) : "—"}</dd></div>
              </dl>
            )}
            <p className="font-display text-base text-ink mt-4 mb-2">Verification ({inv.verification_source})</p>
            <ul className="text-sm space-y-1">
              {(inv.verification_checks || []).map((c, i) => (
                <li key={i} className="flex gap-2"><span className={c.ok ? "text-jade-600" : "text-rust-500"}>{c.ok ? "✓" : "✗"}</span><span><span className="text-ink">{c.check}</span> <span className="text-ink/60">— {c.detail}</span></span></li>
              ))}
            </ul>
            {inv.verification_note && <p className="text-xs text-rust-500 mt-2">{inv.verification_note}</p>}
          </div>

          <div className="bg-paper rounded-sm shadow-card p-5 space-y-3">
            <p className="font-display text-base text-ink">Actions</p>
            {["paid", "rejected"].includes(inv.status) && <p className="text-xs text-ink/60">This invoice is closed.</p>}
            {(["pending_verification", "verification_rejected", "verified"].includes(inv.status) && can("invoices.verify")) && (
              <div className="flex gap-2">
                {inv.status !== "verified" && <button disabled={busy} onClick={() => act("verify", { note }, { passed: true })} className="flex items-center gap-1.5 bg-jade-600 text-white px-3 py-1.5 rounded-sm text-xs font-semibold"><Check size={13} /> Pass verification</button>}
                {inv.status !== "verification_rejected" && <button disabled={busy} onClick={() => act("verify", { note }, { passed: false })} className="flex items-center gap-1.5 border border-rust-500 text-rust-500 px-3 py-1.5 rounded-sm text-xs font-semibold"><X size={13} /> Reject verification</button>}
              </div>
            )}
            {inv.status === "verified" && can("invoices.approve") && (
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => act("approve")} className="flex items-center gap-1.5 bg-ledger-800 text-manila px-3 py-1.5 rounded-sm text-xs font-semibold"><Check size={13} /> Approve</button>
                <button disabled={busy} onClick={() => act("reject")} className="flex items-center gap-1.5 border border-rust-500 text-rust-500 px-3 py-1.5 rounded-sm text-xs font-semibold"><X size={13} /> Reject</button>
              </div>
            )}
            {["pending_verification", "verification_rejected", "verified"].includes(inv.status) && <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note / reason (required to reject; the vendor is emailed it)" className={inputCls} />}
            {inv.status === "approved" && can("invoices.pay") && (
              <div className="flex gap-2">
                <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Payment reference / UTR" className={inputCls} />
                <button disabled={busy} onClick={() => act("pay", { payment_ref: payRef })} className="bg-jade-600 text-white px-3 py-1.5 rounded-sm text-xs font-semibold whitespace-nowrap">Mark paid</button>
              </div>
            )}
            {error && <p className="text-sm text-rust-500">{error}</p>}
          </div>

          <div className="bg-paper rounded-sm shadow-card p-5">
            <p className="font-display text-base text-ink mb-2">Audit trail</p>
            <ol className="text-xs space-y-1.5">
              {inv.events.map((e) => (
                <li key={e.id} className="text-ink/80"><span className="font-nums text-ink/55">{new Date(e.created_at).toLocaleString()}</span> · <span className="font-semibold">{e.action.replace(/_/g, " ")}</span> · {e.actor_label}{e.note ? ` — ${e.note}` : ""}</li>
              ))}
            </ol>
          </div>
        </div>

        <div className="bg-manila/60 rounded-sm p-3 min-h-[480px]">
          {inv.attachment_url ? (isPdf
            ? <iframe title="Invoice" src={inv.attachment_url} className="w-full h-[78vh] bg-white rounded-sm" />
            : <img src={inv.attachment_url} alt="Invoice" className="max-w-full mx-auto rounded-sm" />)
            : <p className="text-sm text-ink/60 p-6">The attachment could not be loaded.</p>}
          {inv.attachment_url && <a href={inv.attachment_url} target="_blank" rel="noreferrer" className="block text-center text-xs text-jade-700 underline mt-2">Open in a new tab</a>}
        </div>
      </div>
    </div>
  );
}

const REC_TONE = { matched: "text-jade-600", review: "text-ochre-700", amount_mismatch: "text-ochre-700", unmatched: "text-rust-500", duplicate_payment: "text-rust-500", already_imported: "text-ink/50" };
const REC_LABEL = { matched: "Matched", review: "Check", amount_mismatch: "Amount differs", unmatched: "No invoice", duplicate_payment: "Duplicate payment", already_imported: "Already done" };

// Bank statement <-> invoices. The system proposes; nothing is marked paid until you confirm.
function Reconciliation() {
  const [summary, setSummary] = useState(null);
  const [preview, setPreview] = useState(null);
  const [choice, setChoice] = useState({}); // hash -> invoice_id | "" (none) | "skip"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const loadSummary = () => api.get("/api/invoices/reconcile/summary").then(({ data }) => setSummary(data)).catch((e) => setError(e.response?.data?.detail || ""));
  useEffect(() => { loadSummary(); }, []);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(""); setResult(null); setBusy(true);
    try {
      const { data } = await api.post("/api/invoices/reconcile/preview", { csv_text: await file.text() });
      setPreview(data);
      const init = {};
      for (const l of data.lines) init[l.hash] = l.status === "matched" ? l.invoice_id : (["already_imported", "duplicate_payment"].includes(l.status) ? "skip" : (l.status === "unmatched" ? "skip" : "skip"));
      setChoice(init);
    } catch (err) { setError(err.response?.data?.detail || "Could not read that statement"); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    const matches = preview.lines.filter((l) => choice[l.hash] && choice[l.hash] !== "skip")
      .map((l) => ({ hash: l.hash, date: l.date, description: l.description, reference: l.reference, amount_paise: l.amount_paise, invoice_id: choice[l.hash] === "none" ? null : choice[l.hash] }));
    if (!matches.length) { setError("Nothing selected to confirm"); return; }
    setBusy(true); setError("");
    try {
      const { data } = await api.post("/api/invoices/reconcile/confirm", { matches });
      setResult(data.outcomes); setPreview(null); loadSummary();
    } catch (err) { setError(err.response?.data?.detail || "Could not save"); }
    finally { setBusy(false); }
  };

  const picked = preview ? preview.lines.filter((l) => choice[l.hash] && choice[l.hash] !== "skip").length : 0;
  return (
    <div className="space-y-5">
      <div className="bg-paper rounded-sm shadow-card p-5">
        <p className="font-display text-base text-ink">Reconcile a bank statement</p>
        <p className="text-xs text-ink/65 mt-1 mb-3">Upload the CSV from your bank. Outgoing payments are matched to approved invoices by invoice number, payment reference, amount and vendor name. Only the safe matches are pre-ticked; nothing is marked paid until you confirm.</p>
        <input type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy}
          className="text-xs text-ink/70 file:mr-3 file:rounded-sm file:border-0 file:bg-ledger-800 file:text-manila file:px-3 file:py-2 file:text-xs file:font-semibold file:cursor-pointer" />
        {error && <p className="text-sm text-rust-500 mt-2">{error}</p>}
        {result && (
          <ul className="text-xs mt-3 space-y-0.5">
            <li className="text-jade-700 font-semibold">Saved: {result.filter((o) => ["matched", "recorded"].includes(o.status)).length} line(s)</li>
            {result.filter((o) => ["skipped", "error"].includes(o.status)).map((o, i) => <li key={i} className="text-rust-500">Not saved: {o.detail}</li>)}
          </ul>
        )}
      </div>

      {preview && (
        <div className="bg-paper rounded-sm shadow-card overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-ink/10">
            <p className="text-xs text-ink/70">{preview.lines.length} payment line(s){preview.skipped ? ` · ${preview.skipped} non-payment row(s) skipped` : ""} · {Object.entries(preview.counts).map(([k, v]) => `${v} ${REC_LABEL[k].toLowerCase()}`).join(", ")}</p>
            <button disabled={busy || !picked} onClick={confirm} className="bg-jade-600 text-white px-4 py-1.5 rounded-sm text-xs font-semibold disabled:opacity-40">Confirm {picked} selected</button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-ink/60"><tr>
              <th className="px-4 py-2">Bank line</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Result</th><th className="px-4 py-2">Settles invoice</th></tr></thead>
            <tbody>
              {preview.lines.map((l) => (
                <tr key={l.hash} className="border-t border-ink/[0.06] align-top">
                  <td className="px-4 py-2.5"><p className="text-ink">{l.description || "—"}</p><p className="text-xs text-ink/55 font-nums">{l.date}{l.reference ? ` · ${l.reference}` : ""}</p></td>
                  <td className="px-4 py-2.5 text-right font-nums">{money(l.amount_paise / 100)}</td>
                  <td className="px-4 py-2.5"><p className={`text-xs font-semibold ${REC_TONE[l.status]}`}>{REC_LABEL[l.status]}</p><p className="text-[11px] text-ink/60 max-w-[220px]">{l.why}</p></td>
                  <td className="px-4 py-2.5">
                    {l.status === "already_imported" ? <span className="text-xs text-ink/50">—</span> : (
                      <select value={choice[l.hash] || "skip"} onChange={(e) => setChoice((c) => ({ ...c, [l.hash]: e.target.value }))} className={`${inputCls} min-w-[220px]`}>
                        <option value="skip">Don't import</option>
                        <option value="none">Record as payment with no invoice</option>
                        {l.invoice_id && <option value={l.invoice_id}>{l.vendor_name} · {l.invoice_number} (proposed)</option>}
                        {preview.open_invoices.filter((o) => o.id !== l.invoice_id).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    )}
                    {choice[l.hash] && !["skip", "none"].includes(choice[l.hash]) && l.status === "amount_mismatch" && <p className="text-[11px] text-ochre-700 mt-1">Will be marked paid; the difference is recorded.</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="bg-paper rounded-sm shadow-card p-5">
            <p className="font-display text-base text-ink mb-2">Outstanding (approved, not yet paid)</p>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {Object.entries(summary.aging).map(([k, v]) => <div key={k} className="bg-manila/50 rounded-sm p-2"><p className="text-[10px] uppercase text-ink/55">{k}</p><p className={`font-nums text-sm ${k === "60+ days" && v > 0 ? "text-rust-500" : "text-ink"}`}>{money(v)}</p></div>)}
            </div>
            {summary.outstanding.length === 0 ? <p className="text-xs text-ink/60">Nothing outstanding.</p> : (
              <ul className="text-sm divide-y divide-ink/[0.07]">{summary.outstanding.map((i) => <li key={i.id} className="py-1.5 flex justify-between gap-3"><span>{i.vendor_name} · {i.invoice_number} <span className="text-xs text-ink/55">({i.age_days}d)</span></span><span className="font-nums">{money(i.amount)}</span></li>)}</ul>
            )}
          </div>
          <div className="bg-paper rounded-sm shadow-card p-5 space-y-4">
            <div>
              <p className="font-display text-base text-ink mb-1">Needs attention</p>
              {!summary.paid_not_in_bank.length && !summary.unmatched_payments.length && !summary.paid_with_difference.length && <p className="text-xs text-ink/60">All reconciled payments line up.</p>}
              {summary.paid_not_in_bank.length > 0 && <div className="mb-2"><p className="text-xs font-semibold text-ochre-700">Marked paid, never seen in a bank statement ({summary.paid_not_in_bank.length})</p><ul className="text-xs text-ink/80">{summary.paid_not_in_bank.map((i) => <li key={i.id}>{i.vendor_name} · {i.invoice_number} · {money(i.amount)}</li>)}</ul></div>}
              {summary.unmatched_payments.length > 0 && <div className="mb-2"><p className="text-xs font-semibold text-rust-500">Bank payments with no invoice ({summary.unmatched_payments.length})</p><ul className="text-xs text-ink/80">{summary.unmatched_payments.map((p) => <li key={p.id}>{p.bank_date} · {p.description || p.reference} · {money(p.amount)}</li>)}</ul></div>}
              {summary.paid_with_difference.length > 0 && <div><p className="text-xs font-semibold text-ochre-700">Paid, but not the invoiced amount ({summary.paid_with_difference.length})</p><ul className="text-xs text-ink/80">{summary.paid_with_difference.map((i) => <li key={i.id}>{i.vendor_name} · {i.invoice_number} · invoice {money(i.amount)}, bank {money(i.bank_amount)} ({i.difference > 0 ? "+" : ""}{i.difference.toFixed(2)})</li>)}</ul></div>}
            </div>
            <div>
              <p className="font-display text-base text-ink mb-1">By vendor</p>
              <table className="w-full text-xs"><thead className="text-left text-ink/55"><tr><th className="py-1">Vendor</th><th className="text-right">Invoiced</th><th className="text-right">Paid</th><th className="text-right">Outstanding</th></tr></thead>
                <tbody>{summary.vendors.map((v) => <tr key={v.vendor} className="border-t border-ink/[0.06]"><td className="py-1">{v.vendor}</td><td className="text-right font-nums">{money(v.invoiced)}</td><td className="text-right font-nums">{money(v.paid)}</td><td className={`text-right font-nums ${v.outstanding > 0 ? "text-ochre-700" : ""}`}>{money(v.outstanding)}</td></tr>)}</tbody></table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Invoices() {
  const { can } = useAuth();
  const [view, setView] = useState("list"); // list | reconcile
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [openId, setOpenId] = useState(null);
  const load = () => api.get("/api/invoices", { params: { status: status || undefined } }).then(({ data }) => setRows(data)).catch(() => setRows([]));
  useEffect(() => { setRows(null); load(); }, [status]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows || []).filter((r) => !n || [r.vendor_name, r.invoice_number, r.vendor_email, String(r.reference_no), r.extracted?.company_name || ""].join(" ").toLowerCase().includes(n));
  }, [rows, q]);

  if (view === "reconcile" && !openId) {
    return (
      <div>
        <div className="mb-5 flex items-end justify-between gap-3">
          <div><h2 className="font-display text-2xl text-ink">Invoice reconciliation</h2><p className="text-xs text-ink/70 mt-0.5">Match bank payments to approved invoices and see what is still outstanding.</p></div>
          <button onClick={() => setView("list")} className="text-xs text-jade-700 underline">← Back to invoices</button>
        </div>
        <Reconciliation />
      </div>
    );
  }

  if (openId) return <InvoiceDetail id={openId} onBack={() => setOpenId(null)} onChanged={load} />;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink">Invoices</h2>
          <p className="text-xs text-ink/70 mt-0.5">Vendor invoices: verified automatically, then approved and paid.</p>
        </div>
        <div className="flex items-center gap-4">
          {can("invoices.reconcile") && <button onClick={() => setView("reconcile")} className="bg-ledger-800 text-manila px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-ledger-700">Reconcile with bank</button>}
          <a href="/invoices/submit" target="_blank" rel="noreferrer" className="text-xs text-jade-600 underline">Open vendor submission link ↗</a>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {STATUSES.map(([k, l]) => (
          <button key={k} onClick={() => setStatus(k)} className={`px-3 py-1.5 rounded-sm text-xs font-semibold border ${status === k ? "bg-ledger-800 text-manila border-ledger-800" : "border-ink/15 text-ink/70 hover:border-jade-500"}`}>{l}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendor, invoice no., ref…" className={`${inputCls} max-w-xs ml-auto`} />
      </div>
      {rows === null ? <p className="text-sm text-ink/70">Loading…</p> : shown.length === 0 ? <p className="text-sm text-ink/60 bg-paper rounded-sm shadow-card p-8 text-center">No invoices here.</p> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {shown.map((r) => (
            <button key={r.id} onClick={() => setOpenId(r.id)} className="text-left bg-paper rounded-sm shadow-card p-4 hover:shadow-md hover:ring-1 hover:ring-jade-500/50 transition">
              <div className="flex items-start justify-between gap-2">
                <span className="w-8 h-8 rounded-sm bg-jade-50 text-jade-600 flex items-center justify-center flex-shrink-0"><FileText size={16} /></span>
                <StampBadge status={TONE[r.status]}>{LABEL[r.status]}</StampBadge>
              </div>
              <p className="font-display text-[15px] text-ink mt-2 leading-tight">{r.vendor_name}</p>
              <p className="text-xs text-ink/60">{r.extracted?.company_name && r.extracted.company_name !== r.vendor_name ? `${r.extracted.company_name} · ` : ""}Invoice {r.invoice_number} · #{r.reference_no}</p>
              <div className="flex items-end justify-between mt-3">
                <p className="font-nums text-lg text-ink">{money(r.amount)}</p>
                <p className="text-[11px] text-ink/55">{new Date(r.submitted_at).toLocaleDateString()}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
