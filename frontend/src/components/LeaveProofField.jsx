import { Paperclip } from "lucide-react";

import api from "../lib/api.js";
import { prepareUpload } from "../lib/upload.js";

// Optional "proof of approval" picker for leave requests — never required.
export default function LeaveProofField({ file, onChange }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">
        Proof of approval <span className="normal-case font-normal text-ink/70">(optional)</span>
      </label>
      <label className="flex items-center gap-2 w-full rounded-sm border border-dashed border-ink/20 bg-manila/40 px-3 py-2.5 text-sm text-ink/70 cursor-pointer hover:bg-manila/60 transition-colors">
        <Paperclip size={14} />
        <span className="truncate">{file ? file.name : "Attach a screenshot, photo or PDF of the approval…"}</span>
        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => onChange(e.target.files?.[0] || null)} />
        {file && (
          <button type="button" onClick={(e) => { e.preventDefault(); onChange(null); }} className="ml-auto text-xs text-rust-500 hover:underline">Remove</button>
        )}
      </label>
    </div>
  );
}

// Uploads the picked file (if any) and returns the fields to merge into the
// leave request body; returns {} when nothing was attached.
export async function uploadLeaveProof(file) {
  if (!file) return {};
  const { data } = await api.post("/api/leave-requests/upload", await prepareUpload(file));
  return { attachment_path: data.path, attachment_filename: data.filename };
}

export function LeaveProofLink({ request }) {
  if (!request?.attachment_url) return null;
  return (
    <a href={request.attachment_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-jade-600 hover:underline mt-1 text-xs">
      <Paperclip size={11} /> {request.attachment_filename || "Proof of approval"}
    </a>
  );
}
