import { formatTime } from "./format.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const STATUS_CODE = {
  present: "P", absent: "A", weekoff: "WO", holiday: "H", leave: "L", half_day: "HD", wfh: "WFH", future: "",
};

// A leave day's own type, so the sheet distinguishes Paid Leave from a
// Comp-Off rather than showing a flat "L" for both (HR, 10 Sept 2026 —
// "current system lacks differentiation between leave types (PL vs
// comp-off) in the attendance sheet"). Anything not listed falls back to
// the generic "L".
export const LEAVE_TYPE_CODE = {
  paid: "PL", comp_off: "CO", unpaid: "LWP", maternity: "ML", paternity: "PTL",
  half_day: "HD", compassionate: "CL", casual: "CL", sick: "SL", earned: "EL",
};

// The code that actually goes in a day's cell: leave days carry their own
// type code, a present day worked on the employee's declared weekly off
// shows WOP (never just a bare P — HR, 25 Sept 2026: "if somebody is
// present on [their weekoff] it needs to show WOP"), everything else uses
// the plain status code.
export function dayCode(d) {
  if (d.status === "leave") return LEAVE_TYPE_CODE[d.leave_type] || STATUS_CODE.leave;
  if (d.status === "present" && d.worked_on_weekly_off) return "WOP";
  // Unearned Sunday (<3 days in office that week): absent, but labelled so it is not mistaken for a normal absence.
  if (d.status === "absent" && d.weekoff_forfeited) return "A (Sun)";
  return STATUS_CODE[d.status] ?? d.status;
}

// Which STATUS_COLORS/STATUS_CLASS key actually applies to a day — same
// "present but flag the weekoff" override as dayCode above, kept as one
// function so the Excel fill/font and the on-screen cell class can never
// drift out of sync with what dayCode prints.
export function statusColorKey(d) {
  if (d.status === "present" && d.worked_on_weekly_off) return "weekoff_present";
  return d.status;
}

// Worked on the declared weekly off (WOP): strong orange so it is never missed.
export const WOP_FILL = "FFFFB74D";
export const WOP_FONT = "FF4A2800";
export function isWop(d) {
  return !!d && d.status === "present" && !!d.worked_on_weekly_off;
}

// Mirrors AttendanceReport.jsx's STATUS_CLASS (tailwind.config.js jade/rust/
// ochre/manila/ink) — Excel cell colors can't reference Tailwind classes
// directly, so these are hand-converted to ARGB and have to be kept in sync
// by hand if the on-screen palette ever changes.
const STATUS_COLORS = {
  present: { fill: "FFEAF4EF", font: "FF1B4A37" },
  absent: { fill: "FFFBEEE9", font: "FF832F23" },
  weekoff: { fill: "FFEFECE5", font: "FFA19F9A" },
  // Present + worked their declared weekly off — same jade background as an
  // ordinary Present (they did show up and work), bolded and flagged gold
  // so it doesn't read as an indistinguishable P on a scan of the sheet.
  weekoff_present: { fill: WOP_FILL, font: WOP_FONT, bold: true },
  holiday: { fill: "FFFBF0E2", font: "FF8B5219" },
  leave: { fill: "FFEFE9DA", font: "FF5B5952" },
  half_day: { fill: "FFFBF0E2", font: "FF8B5219" },
  wfh: { fill: "FFEFECE5", font: "FF1B4A37" },
};

const HEADER_FILL = "FF16302A"; // ledger-800
const HEADER_FONT = "FFEFE9DA"; // manila

// Late arrivals are graded by severity, not just flagged — a bare "red or
// not" (the previous version) used the exact same red as Absent, so a late
// cell and an absent cell read identically at a glance. Cutoffs must match
// backend/payroll.py's LATE_GRACE_MINUTES / _V3_*_END_MIN and
// LATE_POLICY_V3_EFFECTIVE exactly, since the backend is the authority for
// whether a day is late at all (`d.late`) — this only grades *how* late,
// purely for display. Policy v2 (the 22-Sept-2026 revision) never actually
// governs a real day: Policy v3 was activated from the 23-Aug-2026 pay cycle
// — a date BEFORE v2's own effective date — so v2 is superseded before it
// could ever take effect and is intentionally omitted here (v1.1 through
// 22 Aug 2026, v3 from 23 Aug 2026 onward).
const LATE_POLICY_V3_EFFECTIVE = "2026-08-23"; // Attendance, Punctuality, Leave & WFH Policy v2.0
const LATE_GRACE_MINUTES = 10 * 60 + 11; // v1.1: 10:11 AM IST
const LATE_ON_TIME_MINUTES_V3 = 10 * 60; // v3: 10:00 AM IST, no grace before banding starts
const LATE_TIERS = [
  { label: "1–15m", maxMinutes: 15, fill: "FFFCEFC2", font: "FF8A6D1D" }, // mild — soft gold
  { label: "16–45m", maxMinutes: 45, fill: "FFFAD9B3", font: "FFA6531B" }, // moderate — soft orange
  { label: "46m+", maxMinutes: Infinity, fill: "FFF6C6C0", font: "FFA3241B", bold: true }, // severe — soft red, bold
];
// v3's 5 bands (doc §9-13): Daily Tolerance/Extended Buffer carry no
// deduction at all (still shaded, distinctly, since they still earn a
// Yellow Card), Level 1/2 are ¼-day, Level 3 is ½-day.
const LATE_TIERS_V3 = [
  { label: "Daily Tolerance (1–10m)", maxMinutes: 10, fill: "FFEFECE5", font: "FF5B5952" },
  { label: "Extended Buffer (11–20m)", maxMinutes: 20, fill: "FFFCEFC2", font: "FF8A6D1D" },
  { label: "Level 1 (21–45m)", maxMinutes: 45, fill: "FFFAD9B3", font: "FFA6531B" },
  { label: "Level 2 (46–105m)", maxMinutes: 105, fill: "FFF6AFA6", font: "FFA3241B" },
  { label: "Level 3 (106m+)", maxMinutes: Infinity, fill: "FFF6C6C0", font: "FFA3241B", bold: true },
];

function minutesLate(firstInIso, istDate) {
  if (!firstInIso) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata",
  }).formatToParts(new Date(firstInIso));
  const part = (type) => parts.find((p) => p.type === type).value;
  const grace = istDate >= LATE_POLICY_V3_EFFECTIVE ? LATE_ON_TIME_MINUTES_V3 : LATE_GRACE_MINUTES;
  return Number(part("hour")) * 60 + Number(part("minute")) - grace;
}

// `d.late` (from the API) is the authority on WHETHER a day is late, computed
// backend-side at second precision (past 10:11 under v1.1, or past 10:00 —
// banded — under v3, with each employee's own shift start and stay-back
// extensions). This only picks a severity tier for display once that's
// already true.
function lateTier(d) {
  if (!d.late) return null;
  const v3 = d.date >= LATE_POLICY_V3_EFFECTIVE;
  const tiers = v3 ? LATE_TIERS_V3 : LATE_TIERS;
  const late = minutesLate(d.first_in, d.date);
  // late===null: no timestamp to grade at all (shouldn't happen given
  // d.late is true, but flag for review rather than silently no-op).
  if (late === null) return tiers[tiers.length - 1];
  // late<=0: minute-level rounding lost the seconds that actually tripped
  // `late` backend-side (e.g. 10:11:47, or 10:00:30 under v3) — genuinely
  // only seconds over, not "0 or negative minutes", so it belongs in the
  // mildest tier, not a fall-through to the harshest one.
  if (late <= 0) return tiers[0];
  return tiers.find((t) => late <= t.maxMinutes);
}

function applyLateTier(cell, tier, baseFont) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tier.fill } };
  cell.font = { ...baseFont, color: { argb: tier.font }, bold: !!tier.bold };
}

// A color-swatch legend (not just a prose description — the swatches use
// the real tier colors) explaining the late-shading gradient, prepended to
// a sheet. Mirrors the on-screen Attendance Sheet's own legend caption
// ("P = Present · A = Absent · ...") as an export-side equivalent.
function addLateLegend(ws, font, days) {
  // A sheet's dates fall entirely on one side of LATE_POLICY_V3_EFFECTIVE in
  // practice (pay cycles run 23rd-22nd and v3 activated exactly on a cycle
  // boundary), so picking the legend off the first day is representative of
  // the whole sheet — see lateTier's own per-day check for why this can
  // never actually straddle within one export.
  const v3 = (days || []).some((d) => d.date >= LATE_POLICY_V3_EFFECTIVE);
  const tiers = v3 ? LATE_TIERS_V3 : LATE_TIERS;
  const label = v3 ? "Late shading (In Time, past 10:00 AM):" : "Late shading (In Time, past 10:11 AM):";
  const row = ws.addRow([label, ...tiers.map((t) => t.label)]);
  row.getCell(1).font = { ...font, bold: true };
  tiers.forEach((t, i) => {
    const cell = row.getCell(2 + i);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: t.fill } };
    cell.font = { ...font, color: { argb: t.font }, bold: true };
    cell.alignment = { horizontal: "center" };
  });
  return row;
}

// Per-day deduction note for the Remarks column: how much of that day's 1 day
// of pay is deducted and why, per the attendance/late-coming policies. The
// backend is the authority — late-coming deductions arrive as `lop_days`
// (with `late_band_v3` under Policy v3); absent/unpaid leave cost the full
// day, half-day and WFH (50% pay, doc §25) cost half. a plain label when
// nothing is deducted. Note: custom date-range exports don't run the late-coming engine
// backend-side, so only the status-based deductions appear there.
export function dayRemark(d) {
  // Must never throw: a malformed row would otherwise abort the whole export.
  try {
    return buildRemark(d || {});
  } catch {
    return "";
  }
}

// A worked day (Present/Half day/WFH) where the biometric has only ONE punch —
// no check-in, no check-out, or the same single timestamp as both. The hours
// can't be trusted, so HR types that day's Remarks by hand: the cell is left
// blank and the row is highlighted (HR, 17 Nov 2026).
export const MISSED_PUNCH_FILL = "FFFFE066";
export const MISSED_PUNCH_FONT = "FF5C3B00";
export function missedPunch(d) {
  if (!d || !["present", "half_day", "wfh"].includes(d.status)) return false;
  // An approved dispute settled the day: it is a full day, not a missed punch.
  if (d.dispute_approved) return false;
  if (!d.first_in || !d.last_out) return true;
  return new Date(d.first_in).getTime() === new Date(d.last_out).getTime();
}

function paintWop(row, fromCol, toCol) {
  for (let col = fromCol; col <= toCol; col++) {
    const cell = row.getCell(col);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WOP_FILL } };
    cell.font = { ...(cell.font || {}), color: { argb: WOP_FONT }, bold: true };
  }
}

function paintMissed(row, fromCol, toCol) {
  for (let col = fromCol; col <= toCol; col++) {
    const cell = row.getCell(col);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MISSED_PUNCH_FILL } };
    cell.font = { ...(cell.font || {}), color: { argb: MISSED_PUNCH_FONT }, bold: true };
  }
}

// HR's typed remark as a number ("0.5", " 1 ", ".75", "0,5"), or null when it
// is not one. Remarks are a pay fraction HR sums in Excel (HR, 21 Nov 2026),
// so the exports must write them as real numbers, never text.
export function parseRemarkNumber(raw) {
  if (raw === null || raw === undefined) return null;
  const t = String(raw).trim().replace(",", ".");
  if (!/^\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// What goes IN the Remarks cell of an export: always a number (or blank when
// nothing can be told), so Excel can SUM it. An older non-numeric typed remark
// is not lost: it rides along as the cell's comment (see remarkNote).
export function dayRemarkValue(d) {
  try {
    const paid = dayPaidFraction(d || {});
    return paid === null ? "" : paid;
  } catch {
    return "";
  }
}

// HR's typed remark when it is free text rather than a number, else "".
export function remarkNote(d) {
  const m = d && typeof d.remark_manual === "string" ? d.remark_manual.trim() : "";
  return m && parseRemarkNumber(m) === null ? m : "";
}

// Writes a Remarks cell: numeric value, 0.## format, free-text remark as note.
function setRemarkCell(cell, d) {
  cell.value = dayRemarkValue(d);
  if (typeof cell.value === "number") cell.numFmt = "0.##";
  const note = remarkNote(d);
  if (note) cell.note = note;
}

function buildRemark(d) {
  // HR's typed Remarks (Attendance Sheet) always win over the computed value.
  if (typeof d.remark_manual === "string" && d.remark_manual.trim()) return d.remark_manual.trim();
  if (missedPunch(d)) return ""; // entered manually
  const paid = dayPaidFraction(d);
  return paid === null ? "" : String(paid);
}

// What fraction of the day's pay is paid. 1 = full day, 0.75 / 0.5 / 0.25 =
// partial, 0 = nothing (absent, unpaid leave). null when it can't be told
// (future day, or a one-punch day HR must fill in by hand). A NUMBER HR
// typed wins; a free-text remark is ignored. This is what the Total adds up.
export function dayPaidFraction(d) {
  // A number HR typed for the day (e.g. 0.5 on a missed punch) is the value.
  const typed = d ? parseRemarkNumber(d.remark_manual) : null;
  if (typed !== null) return typed;
  if (!d || d.status === "future" || !d.status || missedPunch(d)) return null;
  let deducted = Number(d.lop_days) || 0;
  if (d.status === "absent" || (d.status === "leave" && d.leave_type === "unpaid")) deducted += 1;
  else if (d.status === "half_day" || d.status === "wfh") deducted += 0.5;
  return Number(Math.min(1, Math.max(0, 1 - deducted)).toFixed(2));
}

// Total attendance for the row: the paid fractions of every day, summed
// (weekoffs and holidays count as 1, like their per-day remark).
export function totalPaidDays(daily) {
  const total = (daily || []).reduce((sum, d) => sum + (dayPaidFraction(d) ?? 0), 0);
  return Number(total.toFixed(2));
}

export function dayNumber(iso) {
  return Number(iso.slice(8, 10));
}

export function summarize(daily) {
  const counts = { present: 0, absent: 0, leave: 0, weekoff: 0, holiday: 0, late: 0 };
  for (const d of daily) {
    if (d.status in counts) counts[d.status] += 1;
    if (d.late) counts.late += 1;
  }
  return counts;
}

const DISPUTE_TYPE_LABEL = {
  missed_clock_in: "Missed in", missed_clock_out: "Missed out", both: "Missed in+out",
  late_coming: "Late mark", weekly_off: "Sunday", other: "Other",
};
const DISPUTE_STATUS_LABEL = { approved: "Approved", rejected: "Rejected", pending: "Pending" };

// "Approved · Missed out" for a day's dispute, "" when none.
export function disputeLabel(d) {
  const x = d && d.dispute;
  if (!x) return "";
  const st = DISPUTE_STATUS_LABEL[x.status] || x.status || "";
  const ty = DISPUTE_TYPE_LABEL[x.issue_type] || x.issue_type || "";
  return [st, ty].filter(Boolean).join(" · ");
}

const OTHER_LEAVE_TYPES = new Set(["sick", "casual", "earned", "compassionate", "maternity", "paternity"]);

// Per-employee analysis for the sheets (HR, 28 Nov 2026): every count is read
// off the same daily rows the grid prints, so the totals always tally with the
// cells. Late = Yellow Cards actually charged (excused-by-extra-hours days are
// counted separately); Late LOP = the backend's lop_days for lateness.
export function analyzeDaily(daily) {
  const a = {
    present: 0, wop: 0, absent: 0, sundayAbsent: 0, weekoff: 0, holiday: 0,
    pl: 0, compOff: 0, otherLeave: 0, lwp: 0, halfDay: 0, wfh: 0,
    late: 0, lateExcused: 0, lateLop: 0, missedPunch: 0,
    disputes: 0, disputesApproved: 0, disputesRejected: 0, disputesPending: 0,
    hours: 0, otHours: 0, extraHours: 0, compOffEarned: 0, paid: 0,
  };
  for (const d of daily || []) {
    if (d.status === "present") {
      if (d.worked_on_weekly_off) a.wop += 1; else a.present += 1;
    } else if (d.status === "absent") {
      if (d.weekoff_forfeited) a.sundayAbsent += 1; else a.absent += 1;
    } else if (d.status === "weekoff") a.weekoff += 1;
    else if (d.status === "holiday") a.holiday += 1;
    else if (d.status === "half_day") a.halfDay += 1;
    else if (d.status === "wfh") a.wfh += 1;
    else if (d.status === "leave") {
      if (d.leave_type === "paid") a.pl += 1;
      else if (d.leave_type === "comp_off") a.compOff += 1;
      else if (d.leave_type === "unpaid") a.lwp += 1;
      else if (OTHER_LEAVE_TYPES.has(d.leave_type)) a.otherLeave += 1;
      else a.otherLeave += 1;
    }
    if (d.late_band_v3 || d.late) a.late += 1;
    if (d.late_excused_by_extra_hours) a.lateExcused += 1;
    a.lateLop += Number(d.lop_days) || 0;
    if (missedPunch(d)) a.missedPunch += 1;
    if (d.dispute) {
      a.disputes += 1;
      if (d.dispute.status === "approved") a.disputesApproved += 1;
      else if (d.dispute.status === "rejected") a.disputesRejected += 1;
      else a.disputesPending += 1;
    }
    a.hours += Number(d.hours_worked) || 0;
    a.otHours += Number(d.ot_hours) || 0;
    a.extraHours += Number(d.extra_hours) || 0;
    if (d.comp_off_eligible) a.compOffEarned += Number(d.comp_off_units) || 1;
  }
  a.paid = totalPaidDays(daily);
  for (const k of ["lateLop", "hours", "otHours", "extraHours", "compOffEarned"]) a[k] = Number(a[k].toFixed(2));
  return a;
}

// Column order for every analysis table/row: [header, key, kind]
export const ANALYSIS_COLUMNS = [
  ["Present", "present"], ["WOP", "wop"], ["Absent", "absent"], ["A (Sun)", "sundayAbsent"],
  ["Weekoff", "weekoff"], ["Holiday", "holiday"], ["PL", "pl"], ["Comp-Off taken", "compOff"],
  ["Other leave", "otherLeave"], ["LWP", "lwp"], ["Half day", "halfDay"], ["WFH", "wfh"],
  ["Late (Yellow)", "late"], ["Late excused (extra hrs)", "lateExcused"], ["Late LOP days", "lateLop"],
  ["Missed punch", "missedPunch"], ["Disputes", "disputes"], ["Disputes approved", "disputesApproved"],
  ["Disputes rejected", "disputesRejected"], ["Disputes pending", "disputesPending"],
  ["Hours worked", "hours", "hours"], ["OT hours", "otHours", "hours"], ["Extra hours after shift", "extraHours", "hours"],
  ["Comp-Off earned", "compOffEarned"], ["Total Attendance (paid days)", "paid"],
];

// exceljs is a separate file that Vite renames on every deploy, so a tab left
// open across a deploy can fail to fetch it ("Failed to fetch dynamically
// imported module"). Retry once, then tell the user plainly and reload so the
// next click works, rather than failing silently.
async function loadExcelJS() {
  try {
    const mod = await import("exceljs");
    return mod.default ?? mod;
  } catch (first) {
    try {
      await new Promise((r) => setTimeout(r, 600));
      const mod = await import("exceljs");
      return mod.default ?? mod;
    } catch {
      if (typeof window !== "undefined") {
        window.alert("JADE HR was updated since this page was opened. The page will reload now. Please press Export again.");
        window.location.reload();
      }
      throw first;
    }
  }
}

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.font = { color: { argb: HEADER_FONT }, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  row.height = 20;
}

// Colors columns [fromCol, toCol] (1-indexed) of `row` to match `status` —
// both the fill and the text itself, per the user's ask for "proper
// coloring", not just a tinted background.
function colorRowByStatus(row, status, fromCol, toCol) {
  const c = STATUS_COLORS[status];
  if (!c) return;
  for (let col = fromCol; col <= toCol; col++) {
    const cell = row.getCell(col);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.fill } };
    cell.font = { color: { argb: c.font }, bold: !!c.bold };
  }
}

async function downloadWorkbook(wb, filename) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Wide format: one row per employee, with a dedicated In/Out/Status column
// group per date (rather than cramming all three into one cell) — status
// cells are color-coded to match the on-screen Attendance Sheet.
export async function exportAttendanceExcel(rows, year, month, rangeLabel) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  // Master tab with everyone, then one tab per store/location team.
  const used = new Set();
  writeAttendanceSheet(wb.addWorksheet(safeSheetName("Master", used)), rows);
  writeAnalysisSheet(wb.addWorksheet(safeSheetName("Analysis", used)), rows);
  const byLocation = new Map();
  for (const r of rows) {
    const key = (r.location || "").trim() || "Unassigned";
    if (!byLocation.has(key)) byLocation.set(key, []);
    byLocation.get(key).push(r);
  }
  // One tab per shift time slot (same grouping as the old Timings export:
  // a Flexible employee with a reference slot goes on that slot's tab).
  const bySlot = new Map();
  for (const r of rows) {
    const key = (r.time_slot === "Flexible" && r.flexible_reference_time_slot) || r.time_slot || "Unassigned";
    if (!bySlot.has(key)) bySlot.set(key, []);
    bySlot.get(key).push(r);
  }
  const slotRank = (k) => (k === "Flexible" || k === "Unassigned" ? 1 : 0);
  const slotKeys = [...bySlot.keys()].sort((a, b) => slotRank(a) - slotRank(b) || a.localeCompare(b));
  for (const key of slotKeys) {
    writeTimingsSheet(wb.addWorksheet(safeSheetName(key, used)), bySlot.get(key));
  }

  // Then one tab per store, named exactly the store, holding that store's datewise
  // In/Out timings — all in this single workbook (Master = wide month grid).
  const storeKeys = [...byLocation.keys()].sort((x, y) => x.localeCompare(y));
  for (const key of storeKeys) {
    writeTimingsSheet(wb.addWorksheet(safeSheetName(key, used)), byLocation.get(key));
  }

  await downloadWorkbook(wb, `jade-hr-attendance-${rangeLabel || `${MONTH_NAMES[month - 1]}-${year}`}.xlsx`);
}

function writeAttendanceSheet(ws, rows) {
  const days = rows[0]?.daily ?? [];

  addLateLegend(ws, { size: 10 }, days);

  const header = ["Employee Code", "Name", "Department"];
  for (const d of days) {
    const n = dayNumber(d.date);
    header.push(`${n} In`, `${n} Out`, `${n} OT`, `${n} Status`, `${n} Remarks`);
  }
  for (const [label] of ANALYSIS_COLUMNS) header.push(label);
  styleHeaderRow(ws.addRow(header));
  const analysisStart = 4 + days.length * 5;
  const totals = Object.fromEntries(ANALYSIS_COLUMNS.map(([, k]) => [k, 0]));

  for (const r of rows) {
    const values = [r.employee_code, r.name, r.department];
    for (const d of (r.daily || [])) {
      values.push(
        d.first_in ? formatTime(d.first_in) : "",
        d.last_out ? formatTime(d.last_out) : "",
        Number(d.ot_hours) > 0 ? Number(Number(d.ot_hours).toFixed(2)) : "",
        dayCode(d),
        dayRemarkValue(d),
      );
    }
    const a = analyzeDaily(r.daily);
    for (const [, k] of ANALYSIS_COLUMNS) { values.push(a[k]); totals[k] += a[k]; }
    const row = ws.addRow(values);
    ANALYSIS_COLUMNS.forEach(([, k, kind], i) => {
      const cell = row.getCell(analysisStart + i);
      cell.numFmt = kind === "hours" ? "0.00" : "0.##";
      cell.alignment = { horizontal: "center" };
    });
    row.getCell(analysisStart + ANALYSIS_COLUMNS.length - 1).font = { bold: true };

    (r.daily || []).forEach((d, i) => {
      const col = 4 + i * 5; // 1-indexed — Employee Code/Name/Department occupy 1-3; In, Out, OT, Status, Remarks
      setRemarkCell(row.getCell(col + 4), d);
      colorRowByStatus(row, statusColorKey(d), col, col + 3);
      row.getCell(col + 2).numFmt = "0.00";
      // col is the "In" cell of the group — grade it by lateness severity,
      // overriding just that cell's fill+font (Out/Status keep their normal
      // status coloring — a late day is still Present everywhere else).
      const tier = lateTier(d);
      if (tier) applyLateTier(row.getCell(col), tier, {});
      if (isWop(d)) paintWop(row, col, col + 4);
      if (missedPunch(d)) {
        paintMissed(row, col, col + 4);
        if (isWop(d)) paintWop(row, col + 3, col + 3); // keep WOP visible on the Status cell
      }
      if (Number(d.ot_hours) > 0) row.getCell(col + 2).font = { ...(row.getCell(col + 2).font || {}), bold: true };
    });
  }

  const totalValues = ["", "TOTAL", ""];
  for (let i = 0; i < days.length * 5; i++) totalValues.push("");
  for (const [, k] of ANALYSIS_COLUMNS) totalValues.push(Number(totals[k].toFixed(2)));
  styleHeaderRow(ws.addRow(totalValues));
  ANALYSIS_COLUMNS.forEach((_, i) => { ws.getColumn(analysisStart + i).width = 11; });

  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 16;
  for (let i = 0; i < days.length; i++) {
    const col = 4 + i * 5;
    ws.getColumn(col).width = 9;
    ws.getColumn(col + 1).width = 9;
    ws.getColumn(col + 2).width = 6; // OT
    ws.getColumn(col + 3).width = 8;
    ws.getColumn(col + 4).width = 34; // Remarks
  }
  // Freeze the legend + header rows and employee identity columns so all
  // stay in view while scanning across a month's worth of day-groups.
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 2 }];
}

// 24-hour zero-padded "HH:MM", IST — the biometric-export convention this
// sheet matches, distinct from formatTime()'s 12-hour "10:45 am" used
// on-screen and in exportAttendanceExcel. "00:00" (not blank) when there's
// no punch, matching the reference's weekoff rows.
function formatClockHHMM(iso) {
  if (!iso) return "00:00";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

// Same "HH:MM" zero-padding, for a decimal-hours duration (hours_worked,
// ot_hours) rather than a clock timestamp.
function formatDurationHHMM(decimalHours) {
  const totalMinutes = Math.round((decimalHours || 0) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatBlockDate(iso) {
  const [y, m, day] = iso.split("-").map(Number);
  return `${String(day).padStart(2, "0")}-${MONTH_NAMES[m - 1].slice(0, 3)}-${y}`;
}

const BLOCK_FONT = { name: "Arial", size: 8 };

// Excel sheet names can't exceed 31 chars or contain : \ / ? * [ ], and must
// be unique within the workbook — a raw time_slot label ("10:00 AM – 7:40
// PM") trips all three, so it's sanitized and de-duped here rather than
// passed straight to addWorksheet.
function safeSheetName(label, used) {
  let name = (label || "Unassigned").replace(/:/g, ".").replace(/[:\\/?*[\]]/g, "").trim().slice(0, 31) || "Unassigned";
  let unique = name;
  let n = 2;
  while (used.has(unique)) {
    const suffix = ` (${n++})`;
    unique = name.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(unique);
  return unique;
}

// One row per employee with the full analysis, plus a TOTAL row.
function writeAnalysisSheet(ws, rows) {
  const header = ["Employee Code", "Name", "Store", "Department", ...ANALYSIS_COLUMNS.map(([l]) => l)];
  styleHeaderRow(ws.addRow(header));
  ws.getRow(1).eachCell((c) => { c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; });
  ws.getRow(1).height = 32;
  const totals = Object.fromEntries(ANALYSIS_COLUMNS.map(([, k]) => [k, 0]));
  for (const r of rows) {
    const a = analyzeDaily(r.daily);
    const row = ws.addRow([r.employee_code, r.name, (r.location || "").trim() || "Unassigned", r.department || "",
      ...ANALYSIS_COLUMNS.map(([, k]) => { totals[k] += a[k]; return a[k]; })]);
    ANALYSIS_COLUMNS.forEach(([, k, kind], i) => {
      const cell = row.getCell(5 + i);
      cell.numFmt = kind === "hours" ? "0.00" : "0.##";
      cell.alignment = { horizontal: "center" };
      if ((k === "absent" || k === "sundayAbsent" || k === "lateLop" || k === "disputesPending") && a[k] > 0) {
        cell.font = { color: { argb: "FF832F23" }, bold: true };
      }
    });
  }
  styleHeaderRow(ws.addRow(["", "TOTAL", "", "", ...ANALYSIS_COLUMNS.map(([, k]) => Number(totals[k].toFixed(2)))]));
  [14, 24, 18, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ANALYSIS_COLUMNS.forEach((_, i) => { ws.getColumn(5 + i).width = 11; });
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } };
}

function writeTimingsSheet(ws, rows) {
  addLateLegend(ws, BLOCK_FONT, rows[0]?.daily ?? []);
  ws.addRow([]);

  // One flat table: Employee Code and Employee Name lead EVERY row (HR,
  // 17 Nov 2026), then the day's columns, so the sheet can be filtered/sorted.
  const colHeaderRow = ws.addRow([
    "Employee Code", "Employee Name", "Store", "AttendanceDate", "Shift", "A. InTime", "A.OutTime",
    "W. Duration", "OT", "T Duration", "Status", "Remarks", "Dispute",
  ]);
  colHeaderRow.eachCell((cell) => { cell.font = { ...BLOCK_FONT, bold: true }; cell.alignment = { horizontal: "left", vertical: "top" }; });
  const headerRowNumber = colHeaderRow.number;

  for (const r of rows) {
    for (const d of (r.daily || [])) {
      // jade-hr has no separate per-day "shift code" concept (the source
      // system's "GS"/etc) — Shift mirrors Status (WO shows in both, same
      // as the reference) rather than inventing a code jade-hr can't back.
      const status = dayCode(d);
      // `hours_worked` is the RAW in-to-out span and already contains
      // whatever portion of it counts as OT, so W. Duration shows only the
      // non-OT/regular portion — it and OT then sum to the real total.
      const regularHours = Math.max(0, (d.hours_worked || 0) - (d.ot_hours || 0));
      const dataRow = ws.addRow([
        r.employee_code,
        r.name,
        (r.location || "").trim() || "Unassigned",
        formatBlockDate(d.date),
        status,
        formatClockHHMM(d.first_in),
        formatClockHHMM(d.last_out),
        formatDurationHHMM(regularHours),
        formatDurationHHMM(d.ot_hours),
        formatDurationHHMM(d.hours_worked),
        status,
        dayRemarkValue(d),
        disputeLabel(d),
      ]);
      dataRow.eachCell((cell) => { cell.font = BLOCK_FONT; cell.alignment = { horizontal: "left", vertical: "top" }; });
      setRemarkCell(dataRow.getCell(12), d);
      // Cell 6 is "A. InTime" — grade it by lateness severity, same tiers
      // and colors as the wide export's In column.
      const tier = lateTier(d);
      if (tier) {
        applyLateTier(dataRow.getCell(6), tier, BLOCK_FONT);
        dataRow.getCell(6).alignment = { horizontal: "left", vertical: "top" };
      }
      if (isWop(d)) paintWop(dataRow, 1, 12);
      if (missedPunch(d)) {
        paintMissed(dataRow, 1, 12);
        if (isWop(d)) { paintWop(dataRow, 5, 5); paintWop(dataRow, 11, 11); }
      }
    }
    // Summary line under each employee's days: the same analysis as the Master tab.
    const a = analyzeDaily(r.daily);
    const parts = [
      `P ${a.present}`, a.wop ? `WOP ${a.wop}` : null, `A ${a.absent}`, a.sundayAbsent ? `A(Sun) ${a.sundayAbsent}` : null,
      `WO ${a.weekoff}`, `H ${a.holiday}`, `PL ${a.pl}`, `CO taken ${a.compOff}`,
      a.otherLeave ? `Other leave ${a.otherLeave}` : null, a.lwp ? `LWP ${a.lwp}` : null,
      a.halfDay ? `HD ${a.halfDay}` : null, a.wfh ? `WFH ${a.wfh}` : null,
      `Late ${a.late}`, a.lateExcused ? `Late excused ${a.lateExcused}` : null, `Late LOP ${a.lateLop}`,
      `Disputes ${a.disputes} (approved ${a.disputesApproved}, rejected ${a.disputesRejected}, pending ${a.disputesPending})`,
      `Worked ${formatDurationHHMM(a.hours)}`, `OT ${formatDurationHHMM(a.otHours)}`,
      a.compOffEarned ? `CO earned ${a.compOffEarned}` : null, `Paid days ${a.paid}`,
    ].filter(Boolean);
    const sumRow = ws.addRow([r.employee_code, r.name, "SUMMARY", parts.join("  |  ")]);
    ws.mergeCells(sumRow.number, 4, sumRow.number, 13);
    sumRow.eachCell((cell) => {
      cell.font = { ...BLOCK_FONT, bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFE9DA" } };
      cell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
    });
    sumRow.height = 24;
    ws.addRow([]); // one blank row between employees
  }

  [14, 24, 16, 14, 7, 10, 10, 11, 7, 10, 8, 30, 22].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: headerRowNumber }];
}

// Date-wise export, structured to match the attendance-machine export format
// HR already gets from the biometric system (reference file supplied
// 2026-07-20): one block per employee — an "Employee Code"/name header row,
// a column-header row, then one row per day — separated by a blank row,
// stacked down a single sheet. Employees are split into one worksheet PER
// shift timing (hr_employee_profile.time_slot — 25 Sept 2026 HR ask, ahead
// of payroll) so each shift's rows can be worked/printed independently
// instead of hunting through one flat sheet for a given shift's employees.
// An employee with no time_slot assigned lands on an "Unassigned" tab rather
// than being silently dropped. No color-coding beyond lateness; the
// reference sheet is plain black-on-white, unlike exportAttendanceExcel's
// status-colored cells.
export async function exportAttendanceTimingsExcel(rows, year, month, rangeLabel) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();

  const bySlot = new Map();
  for (const r of rows) {
    // A Flexible employee with a Reference Time Slot set (Employee Details —
    // only shown/settable when Time Slot is "Flexible") lands on THAT slot's
    // own tab instead of a generic "Flexible" one — late-mark grading is
    // unaffected either way, this only changes which tab they print on.
    const key = (r.time_slot === "Flexible" && r.flexible_reference_time_slot) || r.time_slot || "Unassigned";
    if (!bySlot.has(key)) bySlot.set(key, []);
    bySlot.get(key).push(r);
  }
  // Sort slots by earliest shift start where discernible ("10:00 AM ..."
  // sorts before "11:00 AM ..."), with "Flexible"/"Unassigned" pushed last.
  const slots = [...bySlot.keys()].sort((a, b) => {
    const rank = (s) => (s === "Flexible" || s === "Unassigned" ? 1 : 0);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return a.localeCompare(b);
  });

  const used = new Set();
  writeAnalysisSheet(wb.addWorksheet(safeSheetName("Analysis", used)), rows);
  for (const slot of slots) {
    const ws = wb.addWorksheet(safeSheetName(slot, used));
    writeTimingsSheet(ws, bySlot.get(slot));
  }
  // Then one tab per store, named exactly the store.
  const byStore = new Map();
  for (const r of rows) {
    const key = (r.location || "").trim() || "Unassigned";
    if (!byStore.has(key)) byStore.set(key, []);
    byStore.get(key).push(r);
  }
  for (const key of [...byStore.keys()].sort((x, y) => x.localeCompare(y))) {
    writeTimingsSheet(wb.addWorksheet(safeSheetName(key, used)), byStore.get(key));
  }

  await downloadWorkbook(wb, `jade-hr-attendance-timings-${rangeLabel || `${MONTH_NAMES[month - 1]}-${year}`}.xlsx`);
}

// Single-employee, one-row-per-day export for the "Daily attendance" section
// on My Payslip / an admin's payroll detail view — a flat Date/In/Out/Hours/
// OT Hours/Status table (mirrors the on-screen columns exactly), not the
// wide per-employee-per-month layout the two exports above use, since this
// covers one employee over any arbitrary date range rather than every
// employee over one calendar month.
export async function exportDailyAttendanceExcel(daily, { employeeCode, name, rangeLabel }) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Daily Attendance");

  const titleRow = ws.addRow([`${name || ""} [${employeeCode || ""}]`, rangeLabel || ""]);
  titleRow.font = { bold: true, size: 11 };
  ws.addRow([]);

  const header = ["Date", "In", "Out", "Hours", "OT Hours", "Status", "Remarks"];
  styleHeaderRow(ws.addRow(header));

  for (const d of daily) {
    const row = ws.addRow([
      formatBlockDate(d.date),
      formatClockHHMM(d.first_in),
      formatClockHHMM(d.last_out),
      formatDurationHHMM(d.hours_worked),
      formatDurationHHMM(d.ot_hours),
      dayCode(d),
      dayRemarkValue(d),
    ]);
    setRemarkCell(row.getCell(7), d);
    colorRowByStatus(row, statusColorKey(d), 1, 6);
    const tier = lateTier(d);
    if (tier) applyLateTier(row.getCell(2), tier, {});
    if (isWop(d)) paintWop(row, 1, 7);
    if (missedPunch(d)) {
      paintMissed(row, 1, 7);
      if (isWop(d)) paintWop(row, 6, 6);
    }
  }

  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 9;
  ws.getColumn(5).width = 10;
  ws.getColumn(6).width = 10;
  ws.getColumn(7).width = 30;
  ws.views = [{ state: "frozen", ySplit: 3 }];

  const suffix = employeeCode ? `-${employeeCode}` : "";
  await downloadWorkbook(wb, `jade-hr-daily-attendance${suffix}.xlsx`);
}
