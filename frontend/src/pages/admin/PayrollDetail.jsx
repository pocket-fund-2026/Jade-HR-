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
      <Link to="/admin/payroll" className="text-sm text-gray-500 hover:underline">← Back to Payroll</Link>
      <div className="flex items-center justify-between mt-2 mb-6">
        <h2 className="text-xl font-semibold">{summary?.name || "Payslip"}</h2>
        <MonthPicker year={year} month={month} onChange={(y, m) => setParams({ year: y, month: m })} />
      </div>

      {loading ? <p className="text-gray-400">Loading...</p> : <PayslipDetail summary={summary} />}
    </div>
  );
}
