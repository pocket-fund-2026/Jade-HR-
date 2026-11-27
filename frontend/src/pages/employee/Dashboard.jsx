import { Bell, Briefcase, CalendarDays, ChevronRight, Flag, Home, Paperclip, Printer, Wallet, X } from "lucide-react";
import OfferNotices from "../../components/OfferNotices.jsx";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import AbsenceRequestModal from "../../components/AbsenceRequestModal.jsx";
import AppealModal from "../../components/AppealModal.jsx";
import DisputeModal from "../../components/DisputeModal.jsx";
import ExitAssetsModal from "../../components/ExitAssetsModal.jsx";
import ExitInterviewModal from "../../components/ExitInterviewModal.jsx";
import { hasUnseenSignoff } from "../../lib/exitPopup.js";
import ExitSignoffModal from "../../components/ExitSignoffModal.jsx";
import LeaveRequestModal from "../../components/LeaveRequestModal.jsx";
import LoanRequestModal from "../../components/LoanRequestModal.jsx";
import MarketVisitCheckinCard from "../../components/MarketVisitCheckinCard.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import MonthPicker from "../../components/MonthPicker.jsx";
import PayslipDetail from "../../components/PayslipDetail.jsx";
import DailyAttendanceSection from "../../components/DailyAttendanceSection.jsx";
import SelfieCheckinCard from "../../components/SelfieCheckinCard.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import WFHRequestModal from "../../components/WFHRequestModal.jsx";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import { currentPayPeriod, formatDate, formatHolidayDate, formatHoursMins, formatTime, lateAllowanceInfo } from "../../lib/format.js";
import { LEAVE_LABELS } from "../../lib/leaveTypes.js";
import AnimatedNumber from "../../components/AnimatedNumber.jsx";

const today = new Date();
const DAY_TYPE_LABELS = {
  closed: "Store closed",
  day_off: "Day Off (paid, same as store closed)",
  open_statutory: "Open (statutory pay)",
  open_till_4pm: "Open till a set time",
  open_normal: "Open (no special pay)",
  anniversary: "Anniversary (informational only)",
};

function RequestTile({ icon: Icon, tone, title, text, pending, onClick }) {
  const chip = tone === "ochre" ? "bg-ochre-50 text-ochre-700" : "bg-jade-50 text-jade-700";
  return (
    <button
      type="button" onClick={onClick}
      className="group text-left bg-paper rounded-sm shadow-card border border-transparent hover:border-jade-500 px-4 py-3.5 flex items-center gap-3 transition-colors"
    >
      <span className={`rounded-sm p-2.5 flex-shrink-0 ${chip}`}><Icon size={20} /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-[11px] text-ink/60 truncate">{text}</span>
        {pending > 0 && <span className="inline-block mt-1 text-[10px] font-semibold text-ochre-700 bg-ochre-50 rounded-full px-2 py-0.5">{pending} waiting for approval</span>}
      </span>
      <ChevronRight size={16} className="text-ink/30 group-hover:text-jade-600 transition-colors flex-shrink-0" />
    </button>
  );
}

function wfhNote(w) {
  if (w.status !== "approved") return w.resolution_note || "";
  const base = w.work_completed === true ? "Completion confirmed — 50% pay"
    : w.work_completed === false ? "Completion not confirmed — normal attendance/leave rules apply"
    : "Awaiting your manager's completion confirmation";
  return [base, w.resolution_note].filter(Boolean).join(" · ");
}

// Everything the person has asked for (leave, work absence, WFH, loans) in one
// list, newest first, instead of four separate tables.
function MyRequests({ leave, absence, loans, wfh }) {
  const [kind, setKind] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const range = (a, b) => (a === b ? formatDate(a) : `${formatDate(a)} – ${formatDate(b)}`);
  const rows = [
    ...leave.map((l) => ({ id: `l-${l.id}`, kind: "leave", label: LEAVE_LABELS[l.leave_type] || "Leave", when: range(l.start_date, l.end_date), sort: l.created_at || l.start_date, text: l.reason, status: l.status, note: l.admin_note })),
    ...absence.map((a) => ({ id: `a-${a.id}`, kind: "absence", label: "Work absence", when: `${range(a.start_date, a.end_date)} · ${a.number_of_days} day${Number(a.number_of_days) === 1 ? "" : "s"}`, sort: a.created_at || a.start_date, text: a.details, status: a.status, note: a.admin_note })),
    ...wfh.map((w) => ({ id: `w-${w.id}`, kind: "wfh", label: "WFH", when: range(w.start_date, w.end_date), sort: w.created_at || w.start_date, text: w.reason, status: w.status, note: wfhNote(w) })),
    ...loans.map((l) => ({ id: `n-${l.id}`, kind: "loan", label: "Loan", when: `₹${Number(l.amount).toLocaleString("en-IN")} · ${l.repayment_months} months`, sort: l.created_at || "", text: l.reason, status: l.status, note: l.admin_note })),
  ].sort((a, b) => String(b.sort).localeCompare(String(a.sort)));
  if (!rows.length) return null;
  const kinds = [["all", "All"], ["leave", "Leave"], ["absence", "Work absence"], ["wfh", "WFH"], ["loan", "Loans"]]
    .filter(([k]) => k === "all" || rows.some((r) => r.kind === k));
  const filtered = rows.filter((r) => kind === "all" || r.kind === kind);
  const shown = showAll ? filtered : filtered.slice(0, 6);
  const pending = rows.filter((r) => r.status === "pending").length;
  return (
    <div className="bg-paper rounded-sm shadow-card overflow-hidden mt-6 no-print">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 pt-4 pb-3">
        <p className="text-xs font-semibold text-ink/70">
          My requests{pending > 0 && <span className="ml-2 text-ochre-700">{pending} waiting for approval</span>}
        </p>
        {kinds.length > 2 && (
          <div className="flex flex-wrap gap-1">
            {kinds.map(([k, l]) => (
              <button key={k} onClick={() => { setKind(k); setShowAll(false); }}
                className={`rounded-sm px-2.5 py-1 text-[11px] font-semibold border transition-colors ${kind === k ? "bg-ledger-800 text-manila border-ledger-800" : "border-ink/15 text-ink/65 hover:text-ink"}`}>
                {l}
              </button>
            ))}
          </div>
        )}
      </div>
      <ul className="divide-y divide-ink/[0.06] border-t border-ink/[0.06]">
        {shown.map((r) => (
          <li key={r.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div className="min-w-0 flex-1 basis-60">
              <p className="text-sm text-ink">
                <span className="font-semibold">{r.label}</span>
                <span className="text-ink/60 font-nums"> · {r.when}</span>
              </p>
              {r.text && <p className="text-sm text-ink/65 break-words">{r.text}</p>}
            </div>
            <div className="min-w-0 sm:text-right sm:max-w-[45%]">
              <StampBadge status={r.status}>{r.status}</StampBadge>
              {r.note && <p className="text-xs text-ink/60 mt-1 break-words">{r.note}</p>}
            </div>
          </li>
        ))}
      </ul>
      {filtered.length > 6 && (
        <button onClick={() => setShowAll((v) => !v)} className="w-full border-t border-ink/[0.06] py-2.5 text-xs font-semibold text-jade-700 hover:bg-manila/40">
          {showAll ? "Show fewer" : `Show all ${filtered.length}`}
        </button>
      )}
    </div>
  );
}

const SHORT_MONTHS_EMP = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function Dashboard() {
  const { user } = useAuth();
  const [year, setYear] = useState(currentPayPeriod().year);
  const [month, setMonth] = useState(currentPayPeriod().month);
  const [summary, setSummary] = useState(null);
  // Privacy: the payslip stays hidden until the person opens it, so salary is never on screen by default.
  const [showPayslip, setShowPayslip] = useState(false);
  const [disputes, setDisputes] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveBalance, setLeaveBalance] = useState([]);
  const [absenceRequests, setAbsenceRequests] = useState([]);
  const [loanRequests, setLoanRequests] = useState([]);
  const [wfhRequests, setWfhRequests] = useState([]);
  const [aip, setAip] = useState(null);
  const [myExit, setMyExit] = useState(null);
  const [compOff, setCompOff] = useState(null);
  const [showExitInterview, setShowExitInterview] = useState(false);
  const [myAssets, setMyAssets] = useState(null);
  const [showAssets, setShowAssets] = useState(false);
  const [signoffs, setSignoffs] = useState([]);
  const [showSignoffs, setShowSignoffs] = useState(false);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [disputeDate, setDisputeDate] = useState(null);
  const [appealing, setAppealing] = useState(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [showWfhModal, setShowWfhModal] = useState(false);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [dismissedNotice, setDismissedNotice] = useState(false);
  const [showAllUpdates, setShowAllUpdates] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link target for the Policy page's "My Leave" link, which can't
  // route straight to a leave page for employees -- there isn't one, leave
  // is applied for via this dashboard's own modal, not a separate route.
  useEffect(() => {
    if (searchParams.get("apply-leave") === "1") {
      setShowLeaveModal(true);
      searchParams.delete("apply-leave");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // HOD sign-offs and the leaver's own handover form are fetched on their own so a failure here can never blank the dashboard.
  const loadExitExtras = () => {
    api.get("/api/me/exit-assets").then(({ data }) => setMyAssets(data)).catch(() => setMyAssets(null));
    api.get("/api/me/exit-signoffs").then(({ data }) => {
      setSignoffs(data);
      // Pops up for each newly assigned sign-off; the banner below stays until everything is signed.
      if (hasUnseenSignoff(data)) setShowSignoffs(true);
    }).catch(() => setSignoffs([]));
  };
  useEffect(() => {
    loadExitExtras();
    const t = setInterval(() => api.get("/api/me/exit-signoffs").then(({ data }) => { setSignoffs(data); if (hasUnseenSignoff(data)) setShowSignoffs(true); }).catch(() => {}), 60000);
    return () => clearInterval(t);
  }, []);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get("/api/me/payroll", { params: { year, month } }),
      api.get("/api/me/disputes"),
      api.get("/api/me/leave-requests"),
      api.get("/api/me/leave-balance"),
      api.get("/api/me/absence-requests"),
      api.get("/api/me/loan-requests"),
      api.get("/api/me/holidays", { params: { year: today.getFullYear() } }),
      api.get("/api/wfh-requests/mine"),
      api.get("/api/late-policy/v3/aip/mine"),
      api.get("/api/me/exit-interview"),
      api.get("/api/me/comp-off"),
    ])
      .then(([payroll, disputesRes, leaveRes, balanceRes, absenceRes, loanRes, holidaysRes, wfhRes, aipRes, exitRes, compOffRes]) => {
        setSummary(payroll.data);
        setDisputes(disputesRes.data);
        setLeaveRequests(leaveRes.data);
        setLeaveBalance(balanceRes.data);
        setAbsenceRequests(absenceRes.data);
        setLoanRequests(loanRes.data);
        setHolidays(holidaysRes.data);
        setWfhRequests(wfhRes.data);
        setAip(aipRes.data);
        setMyExit(exitRes.data);
        setCompOff(compOffRes.data);
        setDismissedNotice(false);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [year, month]);

  const disputedDates = new Set(disputes.filter((d) => d.status === "pending").map((d) => d.date));
  const todayIso = new Date().toISOString().slice(0, 10);

  // seen_by_employee reflects state *before* this fetch (the backend marks
  // them seen server-side as a read side-effect), so this only fires once.
  const freshUpdates = [
    ...disputes.filter((d) => d.status !== "pending" && !d.seen_by_employee).map((d) => ({
      kind: "dispute", id: d.id, status: d.status,
      text: `Your reported issue for ${formatDate(d.date)} was ${d.status}`,
    })),
    ...leaveRequests.filter((l) => l.status !== "pending" && !l.seen_by_employee).map((l) => ({
      kind: "leave", id: l.id, status: l.status,
      text: `Your ${LEAVE_LABELS[l.leave_type]} leave (${formatDate(l.start_date)}–${formatDate(l.end_date)}) was ${l.status}`,
    })),
  ];

  // Leave decisions are marked seen by the server when read; dispute decisions
  // are marked here once shown, so the same notice doesn't return every visit.
  const unseenDisputeIds = freshUpdates.filter((u) => u.kind === "dispute").map((u) => u.id).join(",");
  useEffect(() => {
    if (!unseenDisputeIds) return;
    api.post("/api/me/disputes/mark-seen", { ids: unseenDisputeIds.split(",") }).catch(() => {});
  }, [unseenDisputeIds]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 no-print">
        <h2 className="font-display text-2xl text-ink">My dashboard</h2>
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={() => { setShowPayslip(true); setTimeout(() => window.print(), 150); }}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-[1.5em] py-[0.625em] leading-tight rounded-sm text-sm font-semibold hover:border-jade-500 transition-colors"
          >
            <Printer size={15} /> Print payslip
          </button>
          <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
        </div>
      </div>

      <OfferNotices />

      {!dismissedNotice && freshUpdates.length > 0 && (
        <div className="bg-ochre-50 border border-ochre-400/40 rounded-sm px-4 py-3 mb-6 flex items-start gap-3">
          <Bell size={16} className="text-ochre-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-xs font-semibold text-ink/70">
              {freshUpdates.length === 1 ? "1 update since your last visit" : `${freshUpdates.length} updates since your last visit`}
            </p>
            {(showAllUpdates ? freshUpdates : freshUpdates.slice(0, 3)).map((u) => (
              <p key={`${u.kind}-${u.id}`} className="text-sm text-ink/80 break-words">
                <span className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${u.status === "approved" ? "bg-jade-600" : "bg-rust-500"}`} />
                {u.text}
              </p>
            ))}
            {freshUpdates.length > 3 && (
              <button onClick={() => setShowAllUpdates((v) => !v)} className="text-xs font-semibold text-jade-700 hover:underline">
                {showAllUpdates ? "Show fewer" : `and ${freshUpdates.length - 3} more`}
              </button>
            )}
          </div>
          <button onClick={() => setDismissedNotice(true)} aria-label="Dismiss" className="p-1 -m-1 text-ink/60 hover:text-ink">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="no-print">
        <SelfieCheckinCard />
        <MarketVisitCheckinCard />
      </div>

      <div className="no-print mb-6">
        <p className="text-xs font-semibold text-ink/70 mb-2">What do you need?</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RequestTile
            icon={CalendarDays} tone="jade" title="Apply for leave" text="Paid leave, half day or comp-off"
            pending={leaveRequests.filter((l) => l.status === "pending").length}
            onClick={() => setShowLeaveModal(true)}
          />
          <RequestTile
            icon={Briefcase} tone="jade" title="Work-related absence" text="Client visit, event, travel or training"
            pending={absenceRequests.filter((a) => a.status === "pending").length}
            onClick={() => setShowAbsenceModal(true)}
          />
          <RequestTile
            icon={Flag} tone="ochre" title="Fix my attendance" text="Missed punch, wrong late mark, Sunday"
            pending={disputes.filter((d) => d.status === "pending").length}
            onClick={() => setDisputeDate(new Date().toLocaleDateString("en-CA"))}
          />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5">
          <button onClick={() => setShowWfhModal(true)} className="flex items-center gap-1.5 text-xs font-semibold text-ink/70 hover:text-jade-700">
            <Home size={13} /> Request WFH
          </button>
          <button onClick={() => setShowLoanModal(true)} className="flex items-center gap-1.5 text-xs font-semibold text-ink/70 hover:text-jade-700">
            <Wallet size={13} /> Request loan
          </button>
        </div>
      </div>

      {loading || !summary ? (
        <p className="text-ink/70">Loading ledger…</p>
      ) : (
        <div className="print-area flex flex-col">
          {signoffs.length > 0 && (
            <div className="bg-rust-50 border border-rust-500/40 rounded-sm px-4 py-3 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
              <div className="text-sm text-ink/80">
                <strong className="text-ink">Exit clearance</strong> — {signoffs.length === 1 ? `${signoffs[0].employee_name} is leaving and` : `${signoffs.length} people are leaving and`} needs your e-sign.
              </div>
              <button onClick={() => setShowSignoffs(true)} className="bg-ledger-800 text-manila px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold hover:bg-ledger-700 transition-colors whitespace-nowrap self-start sm:self-auto">
                Review and sign exit clearance
              </button>
            </div>
          )}
          {myExit?.has_exit && (
            <div className="bg-manila border border-ink/20 rounded-sm px-4 py-3 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
              <div className="text-sm text-ink/80">
                <strong className="text-ink">Exit interview</strong> — your last working day is{" "}
                {formatDate(myExit.last_working_day)}.{" "}
                {myExit.submitted
                  ? "Thanks, your answers are with HR. You can still update them until your last day."
                  : "Please fill this in before you leave — it goes straight to HR."}
              </div>
              <button
                onClick={() => setShowExitInterview(true)}
                className="flex items-center gap-1.5 bg-ledger-800 text-manila px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold hover:bg-ledger-700 transition-colors whitespace-nowrap self-start sm:self-auto"
              >
                {myExit.submitted ? "Review answers" : "Fill exit interview"}
              </button>
              {myAssets?.has_exit && (
                <button
                  onClick={() => setShowAssets(true)}
                  className="flex items-center gap-1.5 border border-ledger-800 text-ledger-800 px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold hover:bg-ledger-800 hover:text-manila transition-colors whitespace-nowrap self-start sm:self-auto"
                >
                  {myAssets.submitted ? "System handover ✓" : "System handover (required)"}
                </button>
              )}
            </div>
          )}
          {aip && aip.status === "active" && (
            <div className="bg-rust-50 border border-rust-500/40 rounded-sm px-4 py-3 mb-6 text-sm text-rust-500 no-print">
              <strong>You are on an Attendance Improvement Plan</strong> — {formatDate(aip.start_date)} to{" "}
              {formatDate(aip.end_date)} ({aip.duration_days} days). Only one late arrival is permitted for its
              entire length; a further one is a failure of the AIP. This stays in effect across pay cycles until HR
              closes it, even in a cycle where you haven’t earned a new Red Card.
            </div>
          )}
          {summary.red_card && (
            <div className="bg-rust-50 border border-rust-500/40 rounded-sm px-4 py-3 mb-6 text-sm text-rust-500 no-print">
              {summary.late_policy_version === 3 ? (
                <>
                  <strong>Red Card this cycle</strong> — {summary.late_mark_count} Yellow Cards recorded (23rd–22nd
                  cycle). You have been placed on an Attendance Improvement Plan (AIP) — see HR for its duration and
                  terms. Only one late arrival is permitted for its entire length.
                </>
              ) : summary.late_policy_version === 2 ? (
                <>
                  <strong>Red Card this cycle</strong> — {summary.late_mark_count} late marks recorded (23rd–22nd
                  cycle). New Paid Leave and Comp-Off requests can’t be self-submitted for the rest of this cycle. A
                  Red Card in every month of the quarter is a Quarter Red Card: Final Warning letter and 2 Paid Leave
                  days forfeited.
                </>
              ) : (
                <>
                  <strong>Red Card this cycle</strong> — {summary.late_mark_count} late marks recorded (23rd–22nd
                  cycle). Leave taken during a Red Card cycle is treated as Loss of Pay unless corrected by HR.
                </>
              )}
            </div>
          )}
          {summary.yellow_card && summary.late_policy_version === 3 && (
            <div className="bg-manila border border-ink/15 rounded-sm px-4 py-3 mb-6 text-sm text-ink no-print">
              <strong>Yellow Card this cycle</strong> — {summary.late_mark_count} of 7 Yellow Cards used (23rd–22nd
              cycle; every late arrival earns one, even a penalty-free Daily Tolerance or Extended Buffer arrival). 7
              Yellow Cards in a cycle is a Red Card and an Attendance Improvement Plan.
            </div>
          )}
          {summary.yellow_card && summary.late_policy_version !== 3 && (
            <div className="bg-manila border border-ink/15 rounded-sm px-4 py-3 mb-6 text-sm text-ink no-print">
              <strong>Yellow Card this cycle</strong> — {summary.late_mark_count} of 3 free late marks used (23rd–22nd
              cycle), no deduction. From the 4th late mark each one costs ¼ day, or ½ day if you arrive at 11:00 am or
              later. More than 3 is a Red Card.
            </div>
          )}
          <div className="mb-6 order-first">
            <DailyAttendanceSection
              monthDaily={summary.daily}
              employeeId={summary.employee_id}
              employeeCode={summary.employee_code}
              name={summary.name}
              rangeLabel={`${SHORT_MONTHS_EMP[month - 1]} ${year}`}
              selfService
            />
          </div>
          <div className="mb-6 order-last mt-2">
            <div className="flex items-center justify-between gap-3 mb-2 no-print">
              <p className="text-xs font-semibold text-ink/70">Your payslip for {SHORT_MONTHS_EMP[month - 1]} {year}</p>
              <button type="button" onClick={() => setShowPayslip((v) => !v)}
                className="bg-paper border border-ink/15 text-ink px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold hover:border-jade-500 transition-colors">
                {showPayslip ? "Hide payslip" : "Show payslip"}
              </button>
            </div>
            {showPayslip && <PayslipDetail summary={summary} showDailyAttendance={false} />}
          </div>

          <div className="bg-paper rounded-sm shadow-card p-5 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <p className="text-xs font-semibold text-ink/70">Leave balance ({today.getFullYear()})</p>
              <button onClick={() => setShowLeaveModal(true)} className="text-xs font-semibold text-jade-700 hover:underline">
                Apply for leave →
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {leaveBalance.filter((b) => !["unpaid", "maternity", "compassionate"].includes(b.leave_type)).map((b) => (
                <div key={b.leave_type}>
                  <p className="text-[11px] text-ink/70">{LEAVE_LABELS[b.leave_type]}</p>
                  <p className="font-nums text-lg text-ink mt-0.5">
                    <AnimatedNumber value={String(b.remaining)} /> <span className="text-ink/65 text-sm">/ {b.allocated}</span>
                  </p>
                  {b.leave_type === "paid" && b.carried_forward > 0 && (
                    <p className="text-[10px] text-ink/70 mt-0.5">
                      incl. {Math.round(b.carried_forward * 10) / 10} carried forward
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {compOff?.entries?.length > 0 && (
            <div className="bg-paper rounded-sm shadow-card p-5 mb-6 no-print">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <p className="text-xs font-semibold text-ink/70">Comp-Off earned</p>
                <p className="text-xs text-ink/70">
                  Balance <span className="font-nums text-ink font-semibold"><AnimatedNumber value={String(compOff.balance)} /></span> day(s) ·
                  valid {compOff.validity_days} days from the day worked
                </p>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {compOff.entries.map((c) => (
                    <tr key={c.id} className="border-t border-ink/[0.06]">
                      <td className="py-2 font-nums text-ink/70 w-32">{formatDate(c.earned_date)}</td>
                      <td className="py-2 font-nums text-ink w-16">{c.units}d</td>
                      <td className="py-2 text-ink/70">
                        {c.effective_status === "available"
                          ? `Expires ${formatDate(c.expiry_date)}${c.days_to_expiry <= 30 ? ` — ${c.days_to_expiry}d left` : ""}`
                          : c.effective_status === "used"
                            ? "Used against a leave"
                            : "Expired"}
                      </td>
                      <td className="py-2 text-right">
                        <StampBadge status={c.effective_status === "available" ? "approved" : c.effective_status === "used" ? "leave" : "inactive"}>
                          {c.effective_status}
                        </StampBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-ink/60 mt-3">
                Earned only by working a weekly off or declared public holiday (up to 4 hours: ½ day; above 4 hours: 1 day). Use within 120 days, up to 2 days at a time; do not club with weekly offs, public holidays or festival breaks. Cannot be encashed or transferred. Apply by
                requesting leave with type "Comp-Off" — your reporting manager and HR are notified for approval.
              </p>
            </div>
          )}

          <div className="bg-paper rounded-sm shadow-card p-5 mb-6">
            <p className="text-xs font-semibold text-ink/70 mb-4">Holidays ({today.getFullYear()})</p>
            {holidays.length === 0 ? (
              <EmptyState title={`No holidays for ${today.getFullYear()} yet`} action={{ label: "Read the leave policy", to: "/employee/policy" }}>
                HR has not published this year’s holiday list. The policy page explains how holidays are declared.
              </EmptyState>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {holidays.map((h) => (
                    <tr key={h.id} className="border-t border-ink/[0.06] first:border-0">
                      <td className="py-2 pr-4 font-nums text-ink/70 w-28">{formatHolidayDate(h.holiday_date)}</td>
                      <td className="py-2 pr-4 text-ink">{h.description}</td>
                      <td className="py-2 text-ink/70">{DAY_TYPE_LABELS[h.day_type] || h.day_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <MyRequests leave={leaveRequests} absence={absenceRequests} loans={loanRequests} wfh={wfhRequests} />
        </div>
      )}

      {appealing && <AppealModal dispute={appealing} onClose={() => setAppealing(null)} onSubmitted={() => { setAppealing(null); load(); }} />}
      {disputeDate && (
        <DisputeModal
          date={disputeDate}
          defaultIssue={(() => { const x = summary?.daily?.find((r) => r.date === disputeDate); return x?.status === "leave" ? "leave" : x?.weekoff_forfeited ? "weekly_off" : x?.late ? "late_coming" : undefined; })()}
          onClose={() => setDisputeDate(null)}
          onSubmitted={() => { setDisputeDate(null); load(); }}
        />
      )}
      {showLeaveModal && (
        <LeaveRequestModal
          onClose={() => setShowLeaveModal(false)}
          onSubmitted={() => { setShowLeaveModal(false); load(); }}
        />
      )}
      {showAbsenceModal && (
        <AbsenceRequestModal
          onClose={() => setShowAbsenceModal(false)}
          onSubmitted={() => { setShowAbsenceModal(false); load(); }}
        />
      )}
      {showWfhModal && (
        <WFHRequestModal
          onClose={() => setShowWfhModal(false)}
          onSubmitted={() => { setShowWfhModal(false); load(); }}
        />
      )}
      {showAssets && (
        <ExitAssetsModal
          existing={myAssets}
          onClose={() => setShowAssets(false)}
          onSubmitted={() => { setShowAssets(false); loadExitExtras(); }}
        />
      )}
      {showSignoffs && signoffs.length > 0 && (
        <ExitSignoffModal
          items={signoffs}
          fullName={user?.name || ""}
          onClose={() => setShowSignoffs(false)}
          onChanged={(left) => setSignoffs(left)}
        />
      )}
      {showExitInterview && (
        <ExitInterviewModal
          existing={myExit?.interview}
          onClose={() => setShowExitInterview(false)}
          onSubmitted={() => { setShowExitInterview(false); load(); }}
        />
      )}
      {showLoanModal && (
        <LoanRequestModal
          onClose={() => setShowLoanModal(false)}
          onSubmitted={() => { setShowLoanModal(false); load(); }}
        />
      )}
    </div>
  );
}
