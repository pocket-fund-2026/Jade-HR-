import { useEffect, useState } from "react";
import { FileSignature } from "lucide-react";
import api from "../lib/api.js";

// Dashboard strip for employee IDs HR listed on an offer: shows when a
// candidate has accepted. Renders nothing when there are none.
export default function OfferNotices() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api.get("/api/offers/my-notices").then(({ data }) => setRows(data)).catch(() => {});
  }, []);
  if (!rows.length) return null;
  return (
    <div className="bg-jade-50 border border-jade-500/30 rounded-sm px-4 py-3 mb-6 flex items-start gap-3">
      <FileSignature size={16} className="text-jade-700 flex-shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1 text-sm text-ink">
        {rows.map((r) => (
          <p key={r.id}>{r.message} <span className="text-ink/50 text-xs">{new Date(r.created_at).toLocaleDateString("en-IN")}</span></p>
        ))}
      </div>
    </div>
  );
}
