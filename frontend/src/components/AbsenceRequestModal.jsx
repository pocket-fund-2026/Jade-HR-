import { Briefcase, ChevronDown, Pencil } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../lib/api.js";
import { prepareUpload } from "../lib/upload.js";
import { useAuth } from "../lib/auth.jsx";
import { formatDate } from "../lib/format.js";
import RequestSheet, {
  ErrorNote, FilePick, FilingAs, QuickPick, SectionLabel, SubmitRow,
  dayCount, inputCls, isoDate, shiftDays,
} from "./RequestSheet.jsx";

// Absences may only be reported for the CURRENT pay cycle (HR rule): today or a
// backdated day within it, never a future date or a closed cycle. Pay cycles
// run the 23rd of the prior month to the 22nd.
function dateBounds() {
  const now = new Date();
  const start = now.getDate() >= 23 ? new Date(now.getFullYear(), now.getMonth(), 23) : new Date(now.getFullYear(), now.getMonth() - 1, 23);
  return { min: isoDate(start), max: isoDate(now) };
}

export default function AbsenceRequestModal({ onClose, onSubmitted }) {
  const { user } = useAuth();
  const bounds = dateBounds();
  const today = bounds.max;
  const yesterday = shiftDays(today, -1);

  const [department, setDepartment] = useState(user?.department || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [numberOfDays, setNumberOfDays] = useState(0);
  const [daysTouched, setDaysTouched] = useState(false);
  const [details, setDetails] = useState("");
  const [showPunch, setShowPunch] = useState(false);
  const [inDate, setInDate] = useState("");
  const [inTime, setInTime] = useState("");
  const [outDate, setOutDate] = useState("");
  const [outTime, setOutTime] = useState("");
  const [approverName, setApproverName] = useState("");
  const [approverEmail, setApproverEmail] = useState("");
  const [editApprover, setEditApprover] = useState(true);
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    api.get(`/api/employees/${user.id}/profile`).then(({ data }) => {
      if (data.reporting_to) setApproverName(data.reporting_to);
      if (data.reporting_to_email) setApproverEmail(data.reporting_to_email);
      // Approver already on file from last time: show it as one line, editable on tap.
      if (data.reporting_to && data.reporting_to_email) setEditApprover(false);
    }).catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (!daysTouched) setNumberOfDays(dayCount(startDate, endDate));
  }, [startDate, endDate, daysTouched]);

  const pickStart = (v) => {
    setStartDate(v);
    if (!endDate || endDate < v) setEndDate(v);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!startDate || !endDate) { setError("Pick the day(s) you were away for work"); return; }
    if (endDate < startDate) { setError("The last day must be on or after the first day"); return; }
    if (endDate > bounds.max || (bounds.min && startDate < bounds.min)) {
      setError(bounds.min
        ? "Absences can only be reported within the current pay cycle, up to today — no future or older dates."
        : "Absences can only be reported up to today — no future dates.");
      return;
    }
    if (!approverName.trim() || !approverEmail.trim()) { setEditApprover(true); setError("Add your approver's name and email"); return; }
    setBusy(true);
    try {
      let attachment_path = null;
      let attachment_filename = null;
      if (file) {
        const { data } = await api.post("/api/absence-requests/upload", await prepareUpload(file));
        attachment_path = data.path;
        attachment_filename = data.filename;
      }
      await api.post("/api/me/absence-requests", {
        department,
        start_date: startDate,
        end_date: endDate,
        number_of_days: Number(numberOfDays),
        details,
        punch_in_date: inDate || null,
        punch_in_time: inTime ? `${inTime}:00` : null,
        punch_out_date: outDate || null,
        punch_out_time: outTime ? `${outTime}:00` : null,
        approver_name: approverName,
        approver_email: approverEmail,
        attachment_path,
        attachment_filename,
        save_approver: true,
      });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Could not send — please try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <RequestSheet
      icon={Briefcase}
      eyebrow="Work-related absence"
      title="Away from my desk for work"
      onClose={onClose}
      done={done && {
        title: "Absence reported",
        text: `${numberOfDays} day${Number(numberOfDays) === 1 ? "" : "s"} from ${formatDate(startDate)}. ${approverName} has been emailed and HR will approve it here. It won't touch your leave balance.`,
        onDone: onSubmitted,
      }}
      footer={<SubmitRow form="absence-form" onCancel={onClose} busy={busy} label="Send absence report" />}
    >
      <form id="absence-form" onSubmit={submit}>
        <FilingAs person={user} extra={
          <> · <input aria-label="Department" required value={department} onChange={(e) => setDepartment(e.target.value)}
            placeholder="Department" className="inline-block w-36 bg-transparent border-b border-dashed border-ink/30 focus:border-jade-500 focus:outline-none text-ink/80 font-semibold px-0.5" /></>
        } />
        <p className="text-xs text-ink/65 bg-manila/60 rounded-sm px-3 py-2 mb-5">
          Use this for client visits, store events, travel or training — days you worked but weren't at your usual place. It is <strong>not</strong> leave.
        </p>

        <SectionLabel>Which day(s)?</SectionLabel>
        <div className="mb-2">
          <QuickPick value={startDate === endDate ? startDate : ""} onPick={(v) => { setStartDate(v); setEndDate(v); }}
            options={[{ value: today, label: "Today" }, { value: yesterday, label: "Yesterday" }]} />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <label htmlFor="ab_from" className="block text-[11px] text-ink/60 mb-1">First day</label>
            <input id="ab_from" type="date" required min={bounds.min} max={bounds.max} className={`${inputCls} font-nums`}
              value={startDate} onChange={(e) => pickStart(e.target.value)} />
          </div>
          <div>
            <label htmlFor="ab_to" className="block text-[11px] text-ink/60 mb-1">Last day</label>
            <input id="ab_to" type="date" required min={startDate || bounds.min} max={bounds.max} className={`${inputCls} font-nums`}
              value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2 mb-5">
          <label htmlFor="ab_days" className="text-xs text-ink/60">Number of days</label>
          <input id="ab_days" type="number" min="0" step="0.5" required className={`${inputCls} font-nums !w-20 !py-1.5`}
            value={numberOfDays} onChange={(e) => { setDaysTouched(true); setNumberOfDays(e.target.value); }} />
          <span className="text-[11px] text-ink/50">change to 0.5 for half a day</span>
        </div>

        <SectionLabel htmlFor="ab_details" required>Where were you, and what for?</SectionLabel>
        <textarea id="ab_details" required rows={2} className={`${inputCls} mb-4`} placeholder="e.g. Client fitting at a customer's home, 11am–4pm"
          value={details} onChange={(e) => setDetails(e.target.value)} />

        <button type="button" onClick={() => setShowPunch((v) => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-jade-700 hover:underline mb-3">
          <ChevronDown size={14} className={`transition-transform ${showPunch ? "rotate-180" : ""}`} />
          {showPunch ? "Hide punch times" : "Add punch times (optional, for night work)"}
        </button>
        {showPunch && (
          <div className="grid grid-cols-2 gap-3 mb-4 rounded-sm border border-ink/10 p-3">
            <div>
              <label htmlFor="ab_in_d" className="block text-[11px] text-ink/60 mb-1">Punch-in date</label>
              <input id="ab_in_d" type="date" className={`${inputCls} font-nums`} value={inDate}
                onChange={(e) => { setInDate(e.target.value); if (!outDate) setOutDate(e.target.value); }} />
            </div>
            <div>
              <label htmlFor="ab_in_t" className="block text-[11px] text-ink/60 mb-1">Punch-in time</label>
              <input id="ab_in_t" type="time" className={`${inputCls} font-nums`} value={inTime} onChange={(e) => setInTime(e.target.value)} />
            </div>
            <div>
              <label htmlFor="ab_out_d" className="block text-[11px] text-ink/60 mb-1">Punch-out date</label>
              <input id="ab_out_d" type="date" min={inDate || undefined} className={`${inputCls} font-nums`} value={outDate} onChange={(e) => setOutDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="ab_out_t" className="block text-[11px] text-ink/60 mb-1">Punch-out time</label>
              <input id="ab_out_t" type="time" className={`${inputCls} font-nums`} value={outTime} onChange={(e) => setOutTime(e.target.value)} />
            </div>
            <p className="col-span-2 text-[11px] text-ink/55">For night work, set the punch-out date to the next day.</p>
          </div>
        )}

        <SectionLabel required>Who approves this?</SectionLabel>
        {editApprover ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-1">
            <input aria-label="Approver name" required placeholder="Manager's name" className={inputCls}
              value={approverName} onChange={(e) => setApproverName(e.target.value)} />
            <input aria-label="Approver email" type="email" required placeholder="manager@…" className={inputCls}
              value={approverEmail} onChange={(e) => setApproverEmail(e.target.value)} />
            <p className="sm:col-span-2 text-[11px] text-ink/55">Your reporting manager. We'll remember this for next time.</p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-sm border border-ink/15 px-3 py-2.5 mb-1">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{approverName}</p>
              <p className="text-xs text-ink/60 truncate">{approverEmail}</p>
            </div>
            <button type="button" onClick={() => setEditApprover(true)} className="flex items-center gap-1 text-xs font-semibold text-jade-700 hover:underline">
              <Pencil size={12} /> Change
            </button>
          </div>
        )}

        <div className="mt-4">
          <SectionLabel optional>Attachment</SectionLabel>
          <FilePick file={file} onChange={setFile} placeholder="Ticket, invite, photo or PDF" />
        </div>

        <ErrorNote>{error}</ErrorNote>
      </form>
    </RequestSheet>
  );
}
