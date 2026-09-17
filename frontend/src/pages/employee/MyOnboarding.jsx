import { useEffect, useState } from "react";

import api from "../../lib/api.js";

function DetailField({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-ink/70">{label}</p>
      <p className="text-sm text-ink">{value || "—"}</p>
    </div>
  );
}

function DetailGroup({ title, children }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-2">{title}</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">{children}</div>
    </div>
  );
}

function DocLink({ label, url }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-xs text-jade-600 underline block">
      {label}
    </a>
  );
}

// Read-only view of the details a new joinee submitted through the public
// /onboarding/new form — self-view of GET /api/onboarding/my-submission,
// which is only ever populated once HR (or the automatic biometric-code
// match in employee_roster_sync.py) resolves that submission onto this
// employee's own record.
export default function MyOnboarding() {
  const [submission, setSubmission] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/onboarding/my-submission")
      .then(({ data }) => setSubmission(data))
      .catch((err) => {
        if (err.response?.status === 404) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-ink/70 text-sm">Loading…</p>;

  if (notFound) {
    return (
      <div className="bg-paper rounded-sm shadow-card p-6">
        <h2 className="font-display text-2xl text-ink mb-2">My Onboarding Details</h2>
        <p className="text-sm text-ink/70">
          Nothing on file yet — either you joined before the online onboarding form existed, or your submission
          hasn't been linked to your employee record yet. If you filled in the form and this still looks empty a
          few days after your biometric attendance started, check with HR.
        </p>
      </div>
    );
  }

  const address = [submission.address_line1, submission.address_line2, submission.address_line3, submission.address_line4]
    .filter(Boolean).join("\n");

  return (
    <div>
      <h2 className="font-display text-2xl text-ink mb-1">My Onboarding Details</h2>
      <p className="text-xs text-ink/70 font-nums mb-6">
        What you submitted on the joining-formalities form, submitted {new Date(submission.submitted_at).toLocaleDateString()}.
        If anything here is wrong, let HR know so it can be corrected on your employee record.
      </p>

      <div className="bg-paper rounded-sm shadow-card p-6 space-y-6">
        <DetailGroup title="Personal">
          <DetailField label="Full Name" value={submission.full_name} />
          <DetailField label="Date of Birth" value={submission.date_of_birth} />
          <DetailField label="Mobile" value={submission.mobile} />
          <DetailField label="Emergency Contact" value={submission.emergency_contact_no} />
          <DetailField label="Email" value={submission.email} />
        </DetailGroup>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-2">Permanent Address</h4>
          <p className="text-sm text-ink whitespace-pre-line">{address || "—"}</p>
        </div>

        <DetailGroup title="Employment">
          <DetailField label="Designation" value={submission.designation} />
          <DetailField label="Department" value={submission.department} />
          <DetailField label="Place of Work" value={submission.place_of_work} />
          <DetailField label="Date of Joining" value={submission.date_of_joining} />
          <DetailField label="Timings + Days" value={submission.timings_and_days} />
        </DetailGroup>

        <DetailGroup title="Bank">
          <DetailField label="Bank Name and Branch" value={submission.bank_name} />
          <DetailField label="Account No" value={submission.bank_account_no} />
          <DetailField label="IFSC" value={submission.bank_ifsc} />
        </DetailGroup>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-2">Documents</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-2">
            <DetailField label="Aadhar No" value={submission.aadhar_no} />
            <DetailField label="PAN No" value={submission.pan_no} />
          </div>
          <div className="space-y-1">
            <DocLink label="Aadhar Card — Front" url={submission.aadhar_front_url} />
            <DocLink label="Aadhar Card — Back" url={submission.aadhar_back_url} />
            <DocLink label="PAN Card" url={submission.pan_card_url} />
            <DocLink label="Photo" url={submission.photo_url} />
            <DocLink label="Resume" url={submission.resume_url} />
          </div>
        </div>
      </div>
    </div>
  );
}
