import { useEffect, useState } from "react";

import MonthPicker from "../../components/MonthPicker.jsx";
import PayslipDetail from "../../components/PayslipDetail.jsx";
import api from "../../lib/api.js";

const today = new Date();

export default function MyPayslip() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get("/api/me/payroll", { params: { year, month } })
      .then(({ data }) => setSummary(data))
      .finally(() => setLoading(false));
  }, [year, month]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">My Payslip</h2>
        <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
      </div>

      {loading ? <p className="text-gray-400">Loading...</p> : <PayslipDetail summary={summary} />}
    </div>
  );
}
