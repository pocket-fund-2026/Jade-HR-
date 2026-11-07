import { useState } from "react";

import api from "../lib/api.js";
import { prepareUpload } from "../lib/upload.js";

const labelCls = "block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5";
const inputCls = "w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500";
const EMPTY = { vendor_name: "", vendor_email: "", vendor_phone: "", invoice_number: "", amount: "", invoice_date: "", bill_details: "" };

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-ledger-900 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
      <div className="relative max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <img src="/jade-logo.png" alt="" className="w-20 h-20 mx-auto mb-3" />
          <p className="font-display text-manila text-2xl">Submit an Invoice</p>
          <p className="text-manila/60 text-sm mt-1">JADE Lifestyles India · vendor invoice submission</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function Track() {
  const [ref, setRef] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const look = async (e) => {
    e.preventDefault();
    setError(""); setResult(null);
    try {
      const { data } = await api.get("/api/invoices/track", { params: { reference_no: ref.replace(/\D/g, ""), email } });
      setResult(data);
    } catch (err) { setError(err.response?.data?.detail || "Could not look that up"); }
  };
  return (
    <form onSubmit={look} className="bg-paper rounded-sm shadow-card p-5 sm:p-6 mt-5 space-y-3">
      <h3 className="font-display text-lg text-ink">Track an invoice</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Reference number, e.g. #5001" className={inputCls} required />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email you submitted with" className={inputCls} required />
      </div>
      <button className="rounded-sm border border-ink/20 px-4 py-2 text-sm font-semibold text-ink hover:border-jade-500">Check status</button>
      {error && <p className="text-sm text-rust-500">{error}</p>}
      {result && (
        <div className="text-sm text-ink/80 bg-manila/40 rounded-sm p-3 space-y-1">
          <p><span className="font-semibold">#{result.reference_no}</span> · Invoice {result.invoice_number}</p>
          <p>Status: <span className="font-semibold text-jade-700">{result.status_label}</span></p>
          {(result.verification_note || result.decision_note) && <p>Note: {result.verification_note || result.decision_note}</p>}
        </div>
      )}
    </form>
  );
}

export default function InvoiceSubmit() {
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!file) { setError("Please attach the invoice (PDF or image)"); return; }
    setBusy(true);
    try {
      const { data: up } = await api.post("/api/invoices/upload", await prepareUpload(file));
      const { data } = await api.post("/api/invoices/submit", {
        ...form, amount: Number(form.amount), invoice_date: form.invoice_date || null, attachment_path: up.path,
      });
      setDone(data);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Submission failed, please try again");
    } finally { setBusy(false); }
  };

  if (done) {
    const rejected = done.status === "verification_rejected";
    return (
      <Shell>
        <div className={`bg-paper rounded-sm shadow-stamp p-8 text-center border-t-4 ${rejected ? "border-rust-500" : "border-jade-500"}`}>
          <p className="font-display text-ink text-xl mb-2">{rejected ? "We couldn't verify this invoice" : "Invoice received"}</p>
          <p className="text-sm text-ink/70">Reference number <span className="font-nums font-semibold text-jade-700">#{done.reference_no}</span></p>
          <p className="text-sm text-ink/70 mt-1">Status: {done.status_label}</p>
          {rejected && <p className="text-sm text-rust-500 mt-3">{done.reason}</p>}
          <button onClick={() => { setDone(null); setForm(EMPTY); setFile(null); }} className="mt-5 text-sm text-jade-700 font-semibold underline">Submit another invoice</button>
        </div>
        <Track />
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={submit} className="bg-paper rounded-sm shadow-card p-5 sm:p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className={labelCls}>Vendor name *</label><input value={form.vendor_name} onChange={set("vendor_name")} className={inputCls} required /></div>
          <div><label className={labelCls}>Email ID *</label><input type="email" value={form.vendor_email} onChange={set("vendor_email")} className={inputCls} required /></div>
          <div><label className={labelCls}>Phone number *</label><input value={form.vendor_phone} onChange={set("vendor_phone")} className={inputCls} required /></div>
          <div><label className={labelCls}>Invoice number *</label><input value={form.invoice_number} onChange={set("invoice_number")} className={inputCls} required /></div>
          <div><label className={labelCls}>Amount (₹, incl. tax) *</label><input type="number" step="0.01" min="0.01" value={form.amount} onChange={set("amount")} className={inputCls} required /></div>
          <div><label className={labelCls}>Invoice date</label><input type="date" value={form.invoice_date} onChange={set("invoice_date")} className={inputCls} /></div>
        </div>
        <div><label className={labelCls}>Bill details</label><textarea rows={3} value={form.bill_details} onChange={set("bill_details")} placeholder="What is this invoice for?" className={inputCls} /></div>
        <div>
          <label className={labelCls}>Invoice attachment (PDF or image) *</label>
          <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-xs text-ink/70 file:mr-3 file:rounded-sm file:border-0 file:bg-ledger-800 file:text-manila file:px-3 file:py-2 file:text-xs file:font-semibold file:cursor-pointer" />
          <p className="text-xs text-ink/60 mt-1">The invoice number and amount you enter are checked against the document, so please make sure they match.</p>
        </div>
        {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}
        <button disabled={busy} className="w-full rounded-sm bg-jade-600 text-white py-3 font-semibold hover:bg-jade-700 disabled:opacity-50">{busy ? "Submitting…" : "Submit invoice"}</button>
      </form>
      <Track />
    </Shell>
  );
}
