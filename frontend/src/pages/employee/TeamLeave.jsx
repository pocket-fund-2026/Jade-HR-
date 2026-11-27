import { LeaveProofLink } from "../../components/LeaveProofField.jsx";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

import EmptyState from "../../components/EmptyState.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import { ApprovalCard, CardList, DecisionBar, PageHeader, TeamTabs } from "../../components/TeamUI.jsx";
import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";
import { LEAVE_LABELS } from "../../lib/leaveTypes.js";
import SlidingTabs from "../../components/SlidingTabs.jsx";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const dayCount = (r) => (r.leave_type === "half_day" ? 0.5 : (new Date(r.end_date) - new Date(r.start_date)) / 86400000 + 1);
const range = (r) => (r.start_date === r.end_date ? formatDate(r.start_date) : `${formatDate(r.start_date)} – ${formatDate(r.end_date)}`);

function LeaveCard({ request, onResolved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const days = dayCount(request);
  const pending = request.status === "pending";

  const resolve = async (action) => {
    setBusy(true);
    setError("");
    try {
      await api.put(`/api/leave-requests/${request.id}`, { action, admin_note: note });
      onResolved();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not save — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ApprovalCard
      person={request.hr_employees}
      meta={[LEAVE_LABELS[request.leave_type] || request.leave_type, request.hr_employees?.location].filter(Boolean).join(" · ")}
      title={`${range(request)} · ${days} day${days === 1 ? "" : "s"}`}
      aside={!pending && <StampBadge status={request.status}>{request.status}</StampBadge>}
      footer={pending && (
        <>
          <DecisionBar note={note} onNote={setNote} busy={busy} onReject={() => resolve("reject")} onApprove={() => resolve("approve")} rejectLabel="Reject" approveLabel="Approve leave" />
          {error && <p className="text-xs text-rust-500 mt-2">{error}</p>}
        </>
      )}
    >
      {request.reason && <p>{request.reason}</p>}
      <LeaveProofLink request={request} />
      {!pending && request.admin_note && <p className="text-xs text-ink/60">Remark: {request.admin_note}</p>}
    </ApprovalCard>
  );
}

const POLL_MS = 20000;

export default function TeamLeave() {
  const { refetchPendingCount } = useOutletContext() || {};
  const [tab, setTab] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = (silent) => {
    if (!silent) setLoading(true);
    api
      .get("/api/me/team-leave-requests", { params: { status: tab } })
      .then(({ data }) => setRequests(data))
      .finally(() => setLoading(false));
  };

  const onResolved = () => {
    load();
    refetchPendingCount?.();
  };

  useEffect(() => {
    load();
    if (tab !== "pending") return;
    const interval = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(interval);
  }, [tab]);

  return (
    <div>
      <TeamTabs />
      <PageHeader title="Team leave" subtitle="Leave requests from people who report to you. Add a short remark, then approve or reject." />
      <SlidingTabs tabs={TABS} value={tab} onChange={setTab} className="flex gap-1 mb-4" />
      <CardList
        loading={loading}
        empty={
          <EmptyState
            title={`No ${tab} leave requests`}
            action={tab === "pending" ? { label: "Back to my dashboard", to: "/employee" } : { label: "View pending requests", onClick: () => setTab("pending") }}
          >
            {tab === "pending" ? "You're all caught up. New requests from your team will appear here." : `Requests you have ${tab} will be listed here.`}
          </EmptyState>
        }
      >
        {requests.map((r) => <LeaveCard key={r.id} request={r} onResolved={onResolved} />)}
      </CardList>
    </div>
  );
}
