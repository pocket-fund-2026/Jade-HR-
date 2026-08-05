import { useEffect, useState } from "react";

import MonthPicker from "../../components/MonthPicker.jsx";
import PayslipDetail from "../../components/PayslipDetail.jsx";
import api from "../../lib/api.js";
import { currentPayPeriod } from "../../lib/format.js";

const currentPeriod = currentPayPeriod();

// Same /api/me/payroll data and PayslipDetail component as the console's
// admin/MyPayslip — that page is only reachable by hr/accounts console
// logins (Protected roles={CONSOLE_ROLES} in App.jsx), so plain "employee"
// role accounts (which is what HODs are — see head_of_department flag on
// hr_employee_profile, not a distinct role) had no payslip page at all.
export default function MyPayslip() {
  const [year, setYear] = useState(currentPeriod.year);
  const [month, setMonth] = useState(currentPeriod.month);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/api/me/payroll", { params: { year, month } })
      .then(({ data }) => setSummary(data))
      .finally(() => setLoading(false));
  }, [year, month]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 no-print">
        <h2 className="font-display text-2xl text-ink">My Payslip</h2>
        <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
      </div>

      {loading || !summary ? <p className="text-ink/70">Loading ledger…</p> : <PayslipDetail summary={summary} />}
    </div>
  );
}
