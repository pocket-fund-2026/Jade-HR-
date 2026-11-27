import { Baby, CalendarDays, Clock, Heart, Plane, Repeat, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../lib/api.js";
import useLeaveCutoff, { cutoffHint } from "../lib/useLeaveCutoff.js";
import { useAuth } from "../lib/auth.jsx";
import { formatDate } from "../lib/format.js";
import { uploadLeaveProof } from "./LeaveProofField.jsx";
import { LEAVE_LABELS, selectableLeaveTypes } from "../lib/leaveTypes.js";
import CompOffPolicy from "./CompOffPolicy.jsx";
import RequestSheet, {
  ChoiceCard, ErrorNote, FilePick, FilingAs, QuickPick, SectionLabel, SubmitRow,
  dayCount, inputCls, isoDate, shiftDays,
} from "./RequestSheet.jsx";

const TYPE_META = {
  paid: { icon: Plane, title: "Paid Leave", hint: "Full-day leave from your balance" },
  half_day: { icon: Sun, title: "Half Day", hint: "Half a day paid, half without pay" },
  comp_off: { icon: Repeat, title: "Comp-Off", hint: "For a weekly off or holiday you worked" },
  paternity: { icon: Baby, title: "Paternity", hint: "Corporate staff" },
  maternity: { icon: Heart, title: "Maternity", hint: "Corporate staff" },
  compassionate: { icon: Heart, title: "Compassionate", hint: "Bereavement in the family" },
};

// `onBehalfOf` (an employee row: {id, first_name, last_name, employee_code,
// employee_category}) switches this from the normal employee self-service
// form into HR's Red Card exception path — files the request under that
// employee instead of the caller, and skips the Red Card block (filing it
// IS the documented management exception).
export default function LeaveRequestModal({ onClose, onSubmitted, onBehalfOf }) {
  const { user } = useAuth();
  const subject = onBehalfOf ?? user;
  const isCorporate = subject?.employee_category === "corporate";
  const availableTypes = selectableLeaveTypes(isCorporate);
  const cutoff = useLeaveCutoff();
  const [leaveType, setLeaveType] = useState("paid");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [proof, setProof] = useState(null);
  const [session, setSession] = useState("first");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [approverName, setApproverName] = useState("");
  const [balance, setBalance] = useState({});
  const isHalf = leaveType === "half_day";

  // Approver is resolved server-side from the reporting manager; shown here
  // read-only for confirmation, never submitted.
  useEffect(() => {
    if (onBehalfOf || !user?.id) return;
    api.get(`/api/employees/${user.id}/profile`).then(({ data }) => {
      if (data.reporting_to) setApproverName(data.reporting_to);
    }).catch(() => {});
    Promise.all([
      api.get("/api/me/leave-balance").catch(() => ({ data: [] })),
      api.get("/api/me/comp-off").catch(() => ({ data: null })),
    ]).then(([bal, co]) => {
      const map = {};
      (bal.data || []).forEach((b) => { map[b.leave_type] = b.remaining; });
      if (co.data?.balance != null) map.comp_off = co.data.balance;
      if (map.paid != null) map.half_day = map.paid;
      setBalance(map);
    });
  }, [user?.id, onBehalfOf]);

  const today = isoDate(new Date());
  const tomorrow = shiftDays(today, 1);
  const days = isHalf ? (startDate ? 0.5 : 0) : dayCount(startDate, endDate || startDate);
  const left = balance[leaveType];

  const pickStart = (v) => {
    setStartDate(v);
    if (isHalf || !endDate || endDate < v) setEndDate(v);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!startDate) { setError("Pick the day your leave starts"); return; }
    const end = isHalf ? startDate : (endDate || startDate);
    if (end < startDate) { setError("The last day must be on or after the first day"); return; }
    if (!reason.trim()) { setError("Add a short reason so your manager knows what it is for"); return; }
    setBusy(true);
    try {
      const proofFields = await uploadLeaveProof(proof);
      await api.post("/api/me/leave-requests", {
        ...proofFields,
        leave_type: leaveType,
        start_date: startDate,
        end_date: end,
        reason,
        ...(isHalf ? { half_day_session: session } : {}),
        ...(onBehalfOf ? { employee_id: onBehalfOf.id } : {}),
      });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not send — please try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <RequestSheet
      icon={CalendarDays}
      eyebrow={onBehalfOf ? "Red Card exception" : "Apply for leave"}
      title={onBehalfOf ? `Filing for ${onBehalfOf.first_name} ${onBehalfOf.last_name || ""}`.trim() : "Take time off"}
      onClose={onClose}
      done={done && {
        title: "Leave request sent",
        text: `${LEAVE_LABELS[leaveType]} · ${days} day${days === 1 ? "" : "s"} from ${formatDate(startDate)}. ${approverName ? `${approverName} and HR` : "Your manager and HR"} will review it. You'll see the decision on your dashboard.`,
        onDone: onSubmitted,
      }}
      footer={<SubmitRow form="leave-form" onCancel={onClose} busy={busy} label={onBehalfOf ? "File exception" : "Send leave request"} />}
    >
      <form id="leave-form" onSubmit={submit}>
        <FilingAs person={subject} extra={!onBehalfOf && (
          <> · goes to <span className="font-semibold text-ink/80">{approverName || "your reporting manager"}</span></>
        )} />

        <SectionLabel>What kind of leave?</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
          {availableTypes.map((t) => {
            const m = TYPE_META[t] || { icon: Plane, title: LEAVE_LABELS[t] };
            return (
              <ChoiceCard
                key={t} selected={leaveType === t} onClick={() => { setLeaveType(t); if (t === "half_day") setEndDate(startDate); }}
                icon={m.icon} title={m.title} hint={m.hint}
                badge={balance[t] != null ? `${balance[t]} left` : null}
              />
            );
          })}
        </div>
        {leaveType === "comp_off" && <div className="mb-5"><CompOffPolicy /></div>}

        <SectionLabel>{isHalf ? "Which day?" : "When?"}</SectionLabel>
        <div className="mb-2">
          <QuickPick
            value={startDate}
            onPick={pickStart}
            options={[{ value: today, label: "Today" }, { value: tomorrow, label: "Tomorrow" }]}
          />
        </div>
        <div className={`grid gap-3 mb-2 ${isHalf ? "grid-cols-1" : "grid-cols-2"}`}>
          <div>
            <label htmlFor="lv_from" className="block text-[11px] text-ink/60 mb-1">{isHalf ? "Date" : "First day"}</label>
            <input id="lv_from" type="date" required min={cutoff?.earliest_date} className={`${inputCls} font-nums`}
              value={startDate} onChange={(e) => pickStart(e.target.value)} />
          </div>
          {!isHalf && (
            <div>
              <label htmlFor="lv_to" className="block text-[11px] text-ink/60 mb-1">Last day</label>
              <input id="lv_to" type="date" required min={startDate || cutoff?.earliest_date} className={`${inputCls} font-nums`}
                value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          )}
        </div>
        {isHalf && (
          <div className="grid grid-cols-2 gap-2 mb-2">
            <ChoiceCard selected={session === "first"} onClick={() => setSession("first")} icon={Sun} title="Morning off" hint="First half" />
            <ChoiceCard selected={session === "second"} onClick={() => setSession("second")} icon={Clock} title="Afternoon off" hint="Second half" />
          </div>
        )}
        {days > 0 && (
          <p className="text-sm text-ink mb-1">
            <span className="font-nums font-semibold">{days}</span> day{days === 1 ? "" : "s"}
            {left != null && <span className={`ml-2 text-xs ${days > left ? "text-rust-500 font-semibold" : "text-ink/60"}`}>
              {days > left ? `· more than your ${left} left` : `· ${Math.max(0, Math.round((left - days) * 10) / 10)} left after this`}
            </span>}
          </p>
        )}
        {cutoff && <p className="text-[11px] text-ink/55 mb-5">{cutoffHint(cutoff)}</p>}

        <SectionLabel htmlFor="lv_reason" required>Reason</SectionLabel>
        <textarea id="lv_reason" required rows={2} className={`${inputCls} mb-4`} placeholder="e.g. Family function in Pune"
          value={reason} onChange={(e) => setReason(e.target.value)} />

        <SectionLabel optional>Proof of approval</SectionLabel>
        <FilePick file={proof} onChange={setProof} accept="image/*,application/pdf" placeholder="Screenshot, photo or PDF" />

        <ErrorNote>{error}</ErrorNote>
      </form>
    </RequestSheet>
  );
}
