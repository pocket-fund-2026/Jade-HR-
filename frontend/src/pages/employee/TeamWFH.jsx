import { useEffect, useState } from "react";

import EmptyState from "../../components/EmptyState.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import { ApprovalCard, CardList, DecisionBar, PageHeader, TeamTabs } from "../../components/TeamUI.jsx";
import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";

const range = (r) => (r.start_date === r.end_date ? formatDate(r.start_date) : `${formatDate(r.start_date)} – ${formatDate(r.end_date)}`);

function ConfirmCard({ request, onResolved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const confirm = async (confirmed) => {
    setBusy(true);
    try {
      await api.post(`/api/wfh-requests/${request.id}/confirm-completion`, { confirmed, note });
      onResolved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ApprovalCard
      person={request.hr_employees}
      title={range(request)}
      footer={
        <DecisionBar
          note={note} onNote={setNote} busy={busy} noteRequired={false}
          onReject={() => confirm(false)} onApprove={() => confirm(true)}
          rejectLabel="Not completed" approveLabel="Work completed"
        />
      }
    >
      {request.reason && <p>{request.reason}</p>}
    </ApprovalCard>
  );
}

export default function TeamWFH() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/api/wfh-requests/my-team", { params: { status: "approved" } }).then(({ data }) => setRequests(data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const awaiting = requests.filter((r) => r.work_completed === null || r.work_completed === undefined);
  const confirmed = requests.filter((r) => r.work_completed !== null && r.work_completed !== undefined);

  return (
    <div>
      <TeamTabs />
      <PageHeader title="Team WFH" subtitle="Approved work-from-home days from your team. Confirm whether the assigned work was done." />
      <CardList
        loading={loading}
        empty={<EmptyState title="Nothing to confirm" action={{ label: "Open team leave", to: "/employee/team-leave" }}>Approved work-from-home days from your team appear here so you can confirm the work was done.</EmptyState>}
      >
        {awaiting.map((r) => <ConfirmCard key={r.id} request={r} onResolved={load} />)}
      </CardList>

      {confirmed.length > 0 && (
        <div className="mt-8">
          <p className="text-xs font-semibold text-ink/70 mb-2">Already confirmed</p>
          <ul className="bg-paper rounded-sm shadow-card divide-y divide-ink/[0.07]">
            {confirmed.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-sm text-ink">{r.hr_employees?.first_name} {r.hr_employees?.last_name}</span>
                  <span className="block text-xs text-ink/60 font-nums">{range(r)}</span>
                </span>
                <StampBadge status={r.work_completed ? "approved" : "rejected"}>
                  {r.work_completed ? "Completed — 50% pay" : "Not completed"}
                </StampBadge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
