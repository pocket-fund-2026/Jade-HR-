import { CheckCircle2, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import MonthPicker from "../../components/MonthPicker.jsx";
import PayslipDetail from "../../components/PayslipDetail.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";

const today = new Date();

export default function MyPayslip() {
  const { user } = useAuth();
  const isHr = user?.role === "hr";
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [summary, setSummary] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get("/api/me/payroll", { params: { year, month } }),
      isHr ? api.get("/api/me/payslip-approvals") : Promise.resolve({ data: [] }),
    ])
      .then(([payroll, approvals]) => {
        setSummary(payroll.data);
        setSubmissions(approvals.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [year, month]);

  const currentSubmission = useMemo(
    () => submissions.find((s) => s.period_year === year && s.period_month === month),
    [submissions, year, month],
  );

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.post("/api/me/payslip-approvals", { period_year: year, period_month: month });
      load();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 no-print">
        <div>
          <h2 className="font-display text-2xl text-ink">My Payslip</h2>
          {isHr && <p className="text-xs text-ink/70 mt-0.5">Your own payslip — submit each period to Accounts for sign-off.</p>}
        </div>
        <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
      </div>

      {isHr && !loading && (
        <div className="bg-paper rounded-sm shadow-card px-5 py-4 mb-6 flex items-center justify-between gap-4 no-print">
          <div>
            {currentSubmission ? (
              <div className="flex items-center gap-2">
                <StampBadge status={currentSubmission.status}>{currentSubmission.status}</StampBadge>
                {currentSubmission.status === "approved" && (
                  <span className="text-xs text-ink/70 flex items-center gap-1"><CheckCircle2 size={13} className="text-jade-600" /> Approved by Accounts</span>
                )}
                {currentSubmission.admin_note && <span className="text-xs text-ink/70">— {currentSubmission.admin_note}</span>}
              </div>
            ) : (
              <p className="text-sm text-ink/70">Not yet submitted for this period.</p>
            )}
          </div>
          {(!currentSubmission || currentSubmission.status === "rejected") && (
            <button
              onClick={submit}
              disabled={submitting}
              className="flex items-center gap-1.5 bg-jade-600 text-white px-3 py-2 rounded-sm text-xs font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors flex-shrink-0"
            >
              <Send size={13} /> {submitting ? "Submitting…" : currentSubmission ? "Resubmit for Approval" : "Submit for Approval"}
            </button>
          )}
        </div>
      )}

      {loading || !summary ? <p className="text-ink/70">Loading ledger…</p> : <PayslipDetail summary={summary} />}
    </div>
  );
}
