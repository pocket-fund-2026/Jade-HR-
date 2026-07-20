import { useEffect, useState } from "react";

import api from "../../lib/api.js";
import { formatINR } from "../../lib/format.js";

function currentFinancialYear() {
  const today = new Date();
  const startYear = today.getMonth() + 1 >= 4 ? today.getFullYear() : today.getFullYear() - 1;
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

const EMPTY = {
  financial_year: currentFinancialYear(),
  regime: "new",
  rent_paid_annual: 0,
  landlord_pan: "",
  section_80c: 0,
  section_80d: 0,
  home_loan_interest: 0,
  other_deductions: 0,
};

export default function TaxDeclaration() {
  const [form, setForm] = useState(EMPTY);
  const [projection, setProjection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/api/me/tax-declaration", { params: { financial_year: EMPTY.financial_year } })
      .then(({ data }) => setForm({ ...EMPTY, ...data }))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    // Skip while `load()` is still in flight — otherwise this fires once
    // with the EMPTY placeholder values, then again the moment the real
    // declaration arrives, doubling this call on every visit.
    if (loading) return;
    api.get("/api/me/tax-projection", { params: { financial_year: form.financial_year } })
      .then(({ data }) => setProjection(data))
      .catch(() => setProjection(null));
  }, [loading, form.financial_year, form.regime, form.rent_paid_annual, form.section_80c, form.section_80d, form.home_loan_interest, form.other_deductions]);

  const setField = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/api/me/tax-declaration", form);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-ink/70">Loading…</p>;

  const inputClass = "w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl text-ink mb-1">Tax Declaration</h2>
      <p className="text-xs text-ink/70 font-nums mb-6">FY {form.financial_year} — determines the TDS deducted from your monthly payslip</p>

      <div className="bg-paper rounded-sm shadow-card p-6 space-y-5">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-2">Tax Regime</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="radio" name="regime" checked={form.regime === "new"} onChange={() => setField("regime", "new")} className="accent-jade-600" />
              New Regime (default)
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="radio" name="regime" checked={form.regime === "old"} onChange={() => setField("regime", "old")} className="accent-jade-600" />
              Old Regime
            </label>
          </div>
          <p className="text-[11px] text-ink/65 mt-1.5">New Regime has lower slab rates but no HRA/80C/80D/home-loan-interest deductions. Old Regime lets you claim those below, but at higher slab rates.</p>
        </div>

        {form.regime === "old" && (
          <div className="border-t border-ink/10 pt-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ochre-700">Old Regime Declarations</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Annual Rent Paid (₹)</label>
                <input type="number" className={inputClass} value={form.rent_paid_annual} onChange={(e) => setField("rent_paid_annual", Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Landlord PAN (if rent &gt; ₹1L/yr)</label>
                <input className={inputClass} value={form.landlord_pan} onChange={(e) => setField("landlord_pan", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Section 80C (PF/ELSS/Insurance/PPF)</label>
                <input type="number" className={inputClass} value={form.section_80c} onChange={(e) => setField("section_80c", Number(e.target.value))} />
                <p className="text-[11px] text-ink/65 mt-1">Capped at ₹1,50,000</p>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Section 80D (Health Insurance)</label>
                <input type="number" className={inputClass} value={form.section_80d} onChange={(e) => setField("section_80d", Number(e.target.value))} />
                <p className="text-[11px] text-ink/65 mt-1">Capped at ₹1,00,000</p>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Home Loan Interest (Sec 24b)</label>
                <input type="number" className={inputClass} value={form.home_loan_interest} onChange={(e) => setField("home_loan_interest", Number(e.target.value))} />
                <p className="text-[11px] text-ink/65 mt-1">Capped at ₹2,00,000 (self-occupied)</p>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Other Deductions</label>
                <input type="number" className={inputClass} value={form.other_deductions} onChange={(e) => setField("other_deductions", Number(e.target.value))} />
                <p className="text-[11px] text-ink/65 mt-1">e.g. 80CCD(1B) NPS, 80E education loan interest</p>
              </div>
            </div>
          </div>
        )}

        {saved && <p className="text-sm text-jade-700">Declaration saved.</p>}
        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save Declaration"}
          </button>
        </div>
      </div>

      {projection && (
        <div className="bg-paper rounded-sm shadow-card p-6 mt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-4">Projected Tax (live preview)</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink/70">Projected Annual Gross</p>
              <p className="font-nums text-ink font-semibold">{formatINR(projection.projected_annual_gross)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink/70">Taxable Income</p>
              <p className="font-nums text-ink font-semibold">{formatINR(projection.taxable_income)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink/70">Annual Tax (incl. cess)</p>
              <p className="font-nums text-ink font-semibold">{formatINR(projection.annual_tax)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink/70">Months Remaining (FY)</p>
              <p className="font-nums text-ink font-semibold">{projection.months_remaining}</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-[11px] uppercase tracking-wider text-ink/70">Monthly TDS</p>
              <p className="font-nums text-jade-700 font-semibold text-lg">{formatINR(projection.monthly_tds)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
