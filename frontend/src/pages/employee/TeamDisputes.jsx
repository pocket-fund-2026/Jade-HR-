import { Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

import EmptyState from "../../components/EmptyState.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import { ApprovalCard, CardList, DecisionBar, PageHeader, TeamTabs } from "../../components/TeamUI.jsx";
import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";
import SlidingTabs from "../../components/SlidingTabs.jsx";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const ISSUE = {
  missed_clock_in: "Forgot to clock in",
  missed_clock_out: "Forgot to clock out",
  both: "Forgot to clock in and out",
  late_coming: "Disputes a late mark",
  weekly_off: "Sunday marked absent",
  leave: "Leave marked wrongly",
  other: "Something else",
};

const timeInput = "w-full md:w-[8.5rem] rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 min-h-[44px] text-sm font-nums focus:outline-none focus:ring-2 focus:ring-jade-500";

function DisputeDetails({ d }) {
  return (
    <>
      {d.reason && <p>{d.reason}</p>}
      {(d.claimed_in || d.claimed_out) && (
        <p className="text-xs text-ink/60 font-nums">
          Says: {d.claimed_in ? `in ${d.claimed_in.slice(0, 5)}` : ""}{d.claimed_in && d.claimed_out ? " · " : ""}{d.claimed_out ? `out ${d.claimed_out.slice(0, 5)}` : ""}
        </p>
      )}
      {d.appeal_of && (
        <p className="text-xs text-ochre-700"><strong>Appeal</strong> of a rejection{d.appeal_original_by ? ` by ${d.appeal_original_by}` : ""}{d.appeal_original_note ? `: "${d.appeal_original_note}"` : ""}</p>
      )}
      {d.delay_reason && <p className="text-xs text-ochre-700"><strong>Reason for delay:</strong> {d.delay_reason}</p>}
      {d.hr_response && <p className="text-xs text-ink/80 border-l-2 border-jade-500 pl-2"><strong>HR response:</strong> {d.hr_response}</p>}
      {d.claims_store_visit && (
        <p className={`text-[11px] font-semibold ${d.store_visit_verified ? "text-jade-700" : (d.movement || []).length ? "text-ochre-700" : "text-rust-500"}`}>
          Claims a store visit: {d.store_visit_verified ? "backed by a verified geotag check-in" : (d.movement || []).length ? "a check-in exists but was not verified at the store" : "no geotag check-in that day"}
        </p>
      )}
      {(d.movement || []).length > 0 && (
        <p className="text-[11px] text-ink/70 border-l-2 border-jade-500 pl-2">
          <span className="font-semibold">Geotag check-ins that day:</span>{" "}
          {d.movement.map((m) => `${m.visit_type === "check_out" ? "out" : "in"} ${m.place || m.place_type} ${new Date(m.captured_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}`).join(" · ")}
        </p>
      )}
      {d.photo_url && (
        <a href={d.photo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-jade-700 hover:underline">
          <Paperclip size={12} /> {d.photo_filename || "View photo"}
        </a>
      )}
    </>
  );
}

function DisputeCard({ dispute, onResolved }) {
  const [firstIn, setFirstIn] = useState(dispute.claimed_in?.slice(0, 5) || "");
  const [lastOut, setLastOut] = useState(dispute.claimed_out?.slice(0, 5) || "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = dispute.status === "pending";

  const resolve = async (action) => {
    setBusy(true);
    setError("");
    try {
      await api.put(`/api/me/team-disputes/${dispute.id}`, {
        action,
        admin_note: note,
        first_in: firstIn ? `${firstIn}:00` : null,
        last_out: lastOut ? `${lastOut}:00` : null,
        status_override: dispute.issue_type === "weekly_off" ? "weekoff" : "present",
      });
      onResolved();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not settle this dispute");
      onResolved();
    } finally {
      setBusy(false);
    }
  };

  const by = dispute.resolved_by_role
    ? dispute.resolved_by_role === "manager" ? "manager" : dispute.resolved_by_role === "ai" ? "AI review (auto)" : dispute.resolved_by_role === "policy" ? "policy (auto)" : "HR"
    : null;

  return (
    <ApprovalCard
      person={dispute.hr_employees}
      meta={[ISSUE[dispute.issue_type] || dispute.issue_type.replace(/_/g, " "), dispute.hr_employees?.location].filter(Boolean).join(" · ")}
      title={formatDate(dispute.date)}
      aside={!pending && (
        <div className="text-right flex-shrink-0">
          <StampBadge status={dispute.status}>{dispute.status}</StampBadge>
          {by && <p className="text-[11px] text-ink/55 mt-1">by {by}</p>}
        </div>
      )}
      footer={pending && (
        <>
          <DecisionBar
            note={note} onNote={setNote} busy={busy}
            onReject={() => resolve("reject")} onApprove={() => resolve("approve")}
            approveLabel="Approve"
            extra={dispute.issue_type !== "weekly_off" && dispute.issue_type !== "leave" && (
              <div className="grid grid-cols-2 gap-2 md:flex md:flex-shrink-0">
                <label className="block text-[11px] text-ink/60">Confirm in<input type="time" value={firstIn} onChange={(e) => setFirstIn(e.target.value)} aria-label="Confirmed clock-in" className={`${timeInput} mt-0.5`} /></label>
                <label className="block text-[11px] text-ink/60">Confirm out<input type="time" value={lastOut} onChange={(e) => setLastOut(e.target.value)} aria-label="Confirmed clock-out" className={`${timeInput} mt-0.5`} /></label>
              </div>
            )}
          />
          {error && <p className="text-xs text-rust-500 mt-2">{error}</p>}
        </>
      )}
    >
      <DisputeDetails d={dispute} />
      {!pending && dispute.admin_note && <p className="text-xs text-ink/60">Remark: {dispute.admin_note}</p>}
    </ApprovalCard>
  );
}

const POLL_MS = 20000;

export default function TeamDisputes() {
  const { refetchPendingCount } = useOutletContext() || {};
  const [tab, setTab] = useState("pending");
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = (silent) => {
    if (!silent) setLoading(true);
    api.get("/api/me/team-disputes", { params: { status: tab } }).then(({ data }) => setDisputes(data)).finally(() => setLoading(false));
  };
  const onResolved = () => { load(); refetchPendingCount?.(); };

  useEffect(() => {
    load();
    if (tab !== "pending") return;
    const interval = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(interval);
  }, [tab]);

  return (
    <div>
      <TeamTabs />
      <PageHeader
        title="Team disputes"
        subtitle="Attendance corrections from people who report to you. HR sees the same list; whoever settles one first closes it."
      />
      <SlidingTabs tabs={TABS} value={tab} onChange={setTab} className="flex gap-1 mb-4" />
      <CardList
        loading={loading}
        empty={
          <EmptyState
            title={`No ${tab} disputes`}
            action={tab === "pending" ? { label: "Back to my dashboard", to: "/employee" } : { label: "View pending disputes", onClick: () => setTab("pending") }}
          >
            {tab === "pending" ? "You're all caught up. Attendance disputes from your team will appear here." : `Disputes you or HR have ${tab} will be listed here.`}
          </EmptyState>
        }
      >
        {disputes.map((d) => <DisputeCard key={d.id} dispute={d} onResolved={onResolved} />)}
      </CardList>
    </div>
  );
}
