import { Briefcase } from "lucide-react";
import { useEffect, useState } from "react";

import AbsenceRequestModal from "../../components/AbsenceRequestModal.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";

// Self-service "Report work absence" for HR / Accounts logins, who land in the
// admin console and have no /employee dashboard (where the form lives for
// everyone else). Same modal, same /api/me/absence-requests endpoints.
export default function MyAbsence() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/api/me/absence-requests")
      .then((r) => setRequests(r.data))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink mb-1">My work absence</h2>
          <p className="text-sm text-ink/70">Report time you were away on work and track its approval.</p>
        </div>
        <button type="button" onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-jade-600 text-white px-[1.5em] py-[0.625em] leading-tight rounded-sm text-sm font-semibold hover:bg-jade-700 transition-colors shrink-0">
          <Briefcase size={14} /> Report work absence
        </button>
      </div>

      {loading ? (
        <p className="text-ink/70 text-sm"><span className="t-shimmer" data-text="Loading…">Loading…</span></p>
      ) : (
        <div className="bg-paper rounded-sm shadow-card divide-y divide-ink/[0.06]">
          {requests.length === 0 ? (
            <EmptyState title="No work absence requests yet" action={{ label: "Report work absence", onClick: () => setShowModal(true) }}>Requests you file show up here with their status.</EmptyState>
          ) : (
            requests.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div>
                  <p className="text-sm text-ink font-medium">
                    {formatDate(a.start_date)} – {formatDate(a.end_date)} · {a.number_of_days} day{a.number_of_days === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-ink/70 mt-0.5">{a.details}</p>
                  {a.approver_name && <p className="text-xs text-ink/70 mt-0.5">Approver: {a.approver_name}</p>}
                  {a.admin_note && <p className="text-xs text-ink/70 mt-0.5">{a.admin_note}</p>}
                </div>
                <StampBadge status={a.status}>{a.status}</StampBadge>
              </div>
            ))
          )}
        </div>
      )}

      {showModal && (
        <AbsenceRequestModal
          onClose={() => setShowModal(false)}
          onSubmitted={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}
