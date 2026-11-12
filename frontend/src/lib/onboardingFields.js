// The built-in questions of the new-joinee form. One list, used by the public
// form (to render) and by the HR form builder (to let HR hide, rename or
// make each one required). HR overrides live in hr_onboarding_core_fields; a
// field with no override behaves exactly as defined here.
//
// `locked` fields cannot be hidden: the person's name and email are how the
// submission is matched to a biometric code and how the offer letter and login
// reach them.
export const CORE_FIELDS = [
  { section: "Personal Details", key: "full_name", label: "Full Name", type: "text", required: true, span: true, locked: true },
  { section: "Personal Details", key: "date_of_birth", label: "Date of Birth", type: "date", required: true },
  { section: "Personal Details", key: "mobile", label: "Mobile", type: "text", required: true },
  { section: "Personal Details", key: "emergency_contact_no", label: "Emergency Contact No.", type: "text", required: true },
  { section: "Personal Details", key: "email", label: "Email", type: "email", required: true, locked: true },
  { section: "Personal Details", key: "photo_path", label: "Upload Photo", type: "file", required: true, hint: "A clear passport-style photo" },

  { section: "Permanent Address", key: "address_line1", label: "Address Line 1", type: "text", required: true, span: true, placeholder: "Flat / house / apartment / society" },
  { section: "Permanent Address", key: "address_line2", label: "Address Line 2", type: "text", required: true, span: true, placeholder: "Road / street" },
  { section: "Permanent Address", key: "address_line3", label: "Address Line 3", type: "text", required: false, span: true, placeholder: "Landmark / area" },
  { section: "Permanent Address", key: "address_line4", label: "Address Line 4", type: "text", required: true, span: true, placeholder: "City - Pin - Country" },

  { section: "Employment Details", key: "date_of_joining", label: "Date of Joining", type: "date", required: true },
  { section: "Employment Details", key: "is_fresher", label: "I am a fresher", type: "checkbox", required: false },

  { section: "Bank Account Information", key: "bank_name", label: "Bank Name and Branch", type: "text", required: true, span: true },
  { section: "Bank Account Information", key: "bank_account_no", label: "Bank Account No", type: "text", required: true },
  { section: "Bank Account Information", key: "bank_ifsc", label: "Bank IFSC Code", type: "text", required: true },

  { section: "Document Upload", key: "aadhar_no", label: "Aadhar Card No", type: "text", required: true },
  { section: "Document Upload", key: "pan_no", label: "PAN Card No", type: "text", required: true },
  { section: "Document Upload", key: "aadhar_front_path", label: "Upload Aadhar Card — Front", type: "file", required: false },
  { section: "Document Upload", key: "aadhar_back_path", label: "Upload Aadhar Card — Back", type: "file", required: false },
  { section: "Document Upload", key: "pan_card_path", label: "Upload PAN Card", type: "file", required: false },
  { section: "Document Upload", key: "salary_slip_paths", label: "Upload Latest Salary Slip(s)", type: "files", required: false, hint: "You can select more than one page/file" },
  { section: "Document Upload", key: "date_of_offer_letter", label: "Date of Offer Letter", type: "date", required: false },
  { section: "Document Upload", key: "resume_path", label: "Upload Resume", type: "file", required: false, hint: "For offline/consultant hires without one already on file — optional otherwise" },

  { section: "Job Designation", key: "designation", label: "Designation", type: "text", required: true },
  { section: "Job Designation", key: "department", label: "Department", type: "text", required: true },
  { section: "Job Designation", key: "kra", label: "KRA in Detail", type: "textarea", required: true },
  { section: "Job Designation", key: "requires_personal_email", label: "Requires Personal Email", type: "checkbox", required: false },
  { section: "Job Designation", key: "requires_oms_login", label: "Requires Independent OMS Login", type: "checkbox", required: false },

  { section: "Workplace & Schedule", key: "place_of_work", label: "Place of Work", type: "place", required: true },
  { section: "Workplace & Schedule", key: "timings_and_days", label: "Timings + Days", type: "text", required: true, placeholder: "e.g. 10:00 AM - 6:30 PM, Mon-Sat" },
];

export const CORE_SECTIONS = [...new Set(CORE_FIELDS.map((f) => f.section))];

// overrides: { [key]: { hidden?: bool, hr_only?: bool, label?: string, required?: bool } }
// `hrOnly`: not asked of the candidate, HR fills it in on the submission (KRA, designation, timings, ...).
export function effectiveField(field, overrides = {}) {
  const o = overrides[field.key] || {};
  return {
    ...field,
    hrOnly: !field.locked && !!o.hr_only && !o.hidden,
    // Both "hidden" and "HR fills it" mean the candidate is not asked.
    hidden: !field.locked && (!!o.hidden || !!o.hr_only),
    label: (o.label || "").trim() || field.label,
    required: field.locked ? field.required : (typeof o.required === "boolean" ? o.required : field.required),
    overridden: !!(o.hidden || o.hr_only || (o.label || "").trim() || typeof o.required === "boolean"),
  };
}
