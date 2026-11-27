import { MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

import EmptyState from "../../components/EmptyState.jsx";
import { ApprovalCard, CardList, DecisionBar, PageHeader, TeamTabs } from "../../components/TeamUI.jsx";
import api from "../../lib/api.js";
import { formatFullDate, formatTime } from "../../lib/format.js";

function formatDateTime(iso) {
  if (!iso) return "-";
  return `${formatFullDate(iso)}, ${formatTime(iso)}`;
}

function VisitCard({ visit, onResolved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const resolve = async (action) => {
    setBusy(true);
    try {
      await api.post(`/api/market-visits/${visit.id}/resolve`, { action, note });
      onResolved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ApprovalCard
      person={visit.hr_employees}
      meta={`${visit.visit_type === "check_out" ? "Check-out" : "Check-in"}${visit.place ? ` · ${visit.place}` : ""}${visit.place_type && visit.place_type !== "market" ? ` (${visit.place_type})` : ""}`}
      title={formatDateTime(visit.captured_at)}
      aside={visit.photo_url ? (
        <a href={visit.photo_url} target="_blank" rel="noreferrer" className="flex-shrink-0">
          <img src={visit.photo_url} alt="Check-in selfie" className="w-16 h-16 rounded-sm object-cover" />
        </a>
      ) : null}
      footer={
        <DecisionBar
          note={note} onNote={setNote} busy={busy} noteRequired={false}
          onReject={() => resolve("reject")} onApprove={() => resolve("approve")}
          rejectLabel="Reject" approveLabel="Approve check-in"
        />
      }
    >
      <a
        href={`https://www.google.com/maps?q=${visit.latitude},${visit.longitude}`}
        target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs font-semibold text-jade-700 hover:underline font-nums"
      >
        <MapPin size={12} /> Open in Maps ({Number(visit.latitude).toFixed(4)}, {Number(visit.longitude).toFixed(4)})
      </a>
      {!visit.photo_url && <p className="text-xs text-ink/55">No photo</p>}
    </ApprovalCard>
  );
}

export default function TeamMarketVisits() {
  const { refetchPendingCount } = useOutletContext() || {};
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/api/market-visits/my-team", { params: { status: "pending" } }).then(({ data }) => setVisits(data)).finally(() => setLoading(false));
  };
  const onResolved = () => { load(); refetchPendingCount?.(); };

  useEffect(load, []);

  return (
    <div>
      <TeamTabs />
      <PageHeader title="Team market visits" subtitle="Geotagged field check-ins from people who report to you." />
      <CardList
        loading={loading}
        empty={<EmptyState title="No pending check-ins" action={{ label: "Back to my dashboard", to: "/employee" }}>Market-visit check-ins from your team wait here for your approval.</EmptyState>}
      >
        {visits.map((v) => <VisitCard key={v.id} visit={v} onResolved={onResolved} />)}
      </CardList>
    </div>
  );
}
