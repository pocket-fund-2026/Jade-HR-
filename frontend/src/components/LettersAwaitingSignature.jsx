import { FileSignature } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../lib/api.js";

// HR dashboard card: letters already sent for e-signing that are not fully
// signed yet — either still with the approver, or signed by the approver and
// waiting on the offered candidate's own signature.
export default function LettersAwaitingSignature() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api.get("/api/letters/history", { params: { limit: 200 } })
      .then(({ data }) => setRows(data.filter((r) => r.approval_status === "awaiting_approval" || r.approval_status === "awaiting_candidate")))
      .catch(() => setRows([])); // no letters permission: card just stays hidden
  }, []);
  if (!rows.length) return null;
  return (
    <div className="bg-paper rounded-sm shadow-card border-l-4 border-ochre-500 p-4 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <FileSignature size={16} className="text-jade-600" />
        <p className="font-display text-lg text-ink">Letters waiting for a signature</p>
        <Link to="/admin/letters" className="ml-auto text-xs font-semibold text-jade-700 hover:underline">Open letters</Link>
      </div>
      <ul className="divide-y divide-ink/5">
        {rows.map((r) => (
          <li key={r.id} className="py-2 text-sm flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-ink font-semibold clamp-2" title={r.title}>{r.title}</span>
            <span className="text-ink/70">{r.employee_name || r.candidate_email}</span>
            {r.approval_status === "awaiting_candidate"
              ? <span className="text-rust-500 font-semibold text-xs">Signature of the offered candidate is remaining</span>
              : <span className="text-ochre-600 font-semibold text-xs">Waiting for the approver’s e-signature</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
