// Canonical leave-type labels — single source of truth (previously
// duplicated by hand across ~7 files). Casual/Sick/Earned are kept here so
// old requests still display a real label, but are no longer offered for
// new requests (see SELECTABLE_LEAVE_TYPES) — Jul 2026's Paid Leave merge
// (24/yr, carries forward) replaced them company-wide.
export const LEAVE_LABELS = {
  paid: "Paid Leave",
  casual: "Casual Leave (discontinued)",
  sick: "Sick Leave (discontinued)",
  earned: "Privilege Leave (discontinued)",
  unpaid: "Unpaid Leave",
  other: "Other",
  paternity: "Paternity Leave",
  maternity: "Maternity Leave",
  compassionate: "Compassionate Leave",
  comp_off: "Comp-Off",
};

// Offered on new leave-request forms — excludes the discontinued types and
// (separately) whatever CORPORATE_ONLY_TYPES filters out for non-corporate staff.
export const SELECTABLE_LEAVE_TYPES = ["paid", "unpaid", "other", "paternity", "maternity", "compassionate", "comp_off"];

export const CORPORATE_ONLY_TYPES = new Set(["paternity", "maternity", "compassionate", "comp_off"]);

export function selectableLeaveTypes(isCorporate) {
  return SELECTABLE_LEAVE_TYPES.filter((t) => isCorporate || !CORPORATE_ONLY_TYPES.has(t));
}
