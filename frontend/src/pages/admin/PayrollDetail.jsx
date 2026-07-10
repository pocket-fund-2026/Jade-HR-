import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import MonthPicker from "../../components/MonthPicker.jsx";
import PayslipDetail from "../../components/PayslipDetail.jsx";
import api from "../../lib/api.js";

const today = new Date();

export default function PayrollDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const year = Number(params.get("year")) || today.getFullYear();
  const month = Number(params.get("month")) || today.getMonth() + 1;
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/api/payroll/${id}`, { params: { year, month } })
      .then(({ data }) => setSummary(data))
      .finally(() => setLoading(false));
  }, [id, year, month]);

  return (
    <div>
      <Link to="/admin/payroll" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Payroll
      </Link>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-2 mb-6">
        <h2 className="font-display text-2xl text-ink">{summary?.name || "Payslip"}</h2>
        <MonthPicker year={year} month={month} onChange={(y, m) => setParams({ year: y, month: m })} />
      </div>

      {loading ? <p className="text-ink/70">Loading ledger…</p> : <PayslipDetail summary={summary} />}
    </div>
  );
}
