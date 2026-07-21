import { formatTime } from "./format.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const STATUS_CODE = {
  present: "P", absent: "A", weekoff: "WO", holiday: "H", leave: "L", half_day: "HD", future: "",
};

// Mirrors AttendanceReport.jsx's STATUS_CLASS (tailwind.config.js jade/rust/
// ochre/manila/ink) — Excel cell colors can't reference Tailwind classes
// directly, so these are hand-converted to ARGB and have to be kept in sync
// by hand if the on-screen palette ever changes.
const STATUS_COLORS = {
  present: { fill: "FFEAF4EF", font: "FF1B4A37" },
  absent: { fill: "FFFBEEE9", font: "FF832F23" },
  weekoff: { fill: "FFEFECE5", font: "FFA19F9A" },
  holiday: { fill: "FFFBF0E2", font: "FF8B5219" },
  leave: { fill: "FFEFE9DA", font: "FF5B5952" },
  half_day: { fill: "FFFBF0E2", font: "FF8B5219" },
};

const HEADER_FILL = "FF16302A"; // ledger-800
const HEADER_FONT = "FFEFE9DA"; // manila

// Late arrivals are graded by severity, not just flagged — a bare "red or
// not" (the previous version) used the exact same red as Absent, so a late
// cell and an absent cell read identically at a glance. Cutoff must match
// backend/payroll.py's LATE_GRACE = time(10, 11) exactly, since that's the
// authority for whether a day is late at all (`d.late`) — this only grades
// *how* late, purely for display.
const LATE_GRACE_MINUTES = 10 * 60 + 11; // 10:11 AM IST
const LATE_TIERS = [
  { label: "1–15m", maxMinutes: 15, fill: "FFFCEFC2", font: "FF8A6D1D" }, // mild — soft gold
  { label: "16–45m", maxMinutes: 45, fill: "FFFAD9B3", font: "FFA6531B" }, // moderate — soft orange
  { label: "46m+", maxMinutes: Infinity, fill: "FFF6C6C0", font: "FFA3241B", bold: true }, // severe — soft red, bold
];

function minutesLate(firstInIso) {
  if (!firstInIso) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata",
  }).formatToParts(new Date(firstInIso));
  const hour = Number(parts.find((p) => p.type === "hour").value);
  const minute = Number(parts.find((p) => p.type === "minute").value);
  return hour * 60 + minute - LATE_GRACE_MINUTES;
}

// `d.late` (from the API) is the authority on WHETHER a day is late, computed
// backend-side at second precision (`first_in > time(10, 11)`). This only
// picks a severity tier for display once that's already true.
function lateTier(d) {
  if (!d.late) return null;
  const late = minutesLate(d.first_in);
  // late===null: no timestamp to grade at all (shouldn't happen given
  // d.late is true, but flag for review rather than silently no-op).
  if (late === null) return LATE_TIERS[LATE_TIERS.length - 1];
  // late<=0: minute-level rounding lost the seconds that actually tripped
  // `late` backend-side (e.g. 10:11:47) — genuinely only seconds over, not
  // "0 or negative minutes", so it belongs in the mildest tier, not a
  // fall-through to the harshest one.
  if (late <= 0) return LATE_TIERS[0];
  return LATE_TIERS.find((t) => late <= t.maxMinutes);
}

function applyLateTier(cell, tier, baseFont) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tier.fill } };
  cell.font = { ...baseFont, color: { argb: tier.font }, bold: !!tier.bold };
}

// A color-swatch legend (not just a prose description — the swatches use
// the real tier colors) explaining the late-shading gradient, prepended to
// a sheet. Mirrors the on-screen Attendance Sheet's own legend caption
// ("P = Present · A = Absent · ...") as an export-side equivalent.
function addLateLegend(ws, font) {
  const row = ws.addRow(["Late shading (In Time, past 10:11 AM):", ...LATE_TIERS.map((t) => t.label)]);
  row.getCell(1).font = { ...font, bold: true };
  LATE_TIERS.forEach((t, i) => {
    const cell = row.getCell(2 + i);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: t.fill } };
    cell.font = { ...font, color: { argb: t.font }, bold: true };
    cell.alignment = { horizontal: "center" };
  });
  return row;
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

async function loadExcelJS() {
  const mod = await import("exceljs");
  return mod.default ?? mod;
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
    cell.font = { color: { argb: c.font } };
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
export async function exportAttendanceExcel(rows, year, month) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Attendance");
  const days = rows[0]?.daily ?? [];

  addLateLegend(ws, { size: 10 });

  const header = ["Employee Code", "Name", "Department"];
  for (const d of days) {
    const n = dayNumber(d.date);
    header.push(`${n} In`, `${n} Out`, `${n} Status`);
  }
  header.push("Present", "Absent", "Leave", "Weekoff", "Holiday", "Late");
  styleHeaderRow(ws.addRow(header));

  for (const r of rows) {
    const values = [r.employee_code, r.name, r.department];
    for (const d of r.daily) {
      values.push(
        d.first_in ? formatTime(d.first_in) : "",
        d.last_out ? formatTime(d.last_out) : "",
        STATUS_CODE[d.status] ?? d.status,
      );
    }
    const s = summarize(r.daily);
    values.push(s.present, s.absent, s.leave, s.weekoff, s.holiday, s.late);
    const row = ws.addRow(values);

    r.daily.forEach((d, i) => {
      const col = 4 + i * 3; // 1-indexed — Employee Code/Name/Department occupy 1-3
      colorRowByStatus(row, d.status, col, col + 2);
      // col is the "In" cell of the group — grade it by lateness severity,
      // overriding just that cell's fill+font (Out/Status keep their normal
      // status coloring — a late day is still Present everywhere else).
      const tier = lateTier(d);
      if (tier) applyLateTier(row.getCell(col), tier, {});
    });
  }

  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 16;
  for (let i = 0; i < days.length; i++) {
    const col = 4 + i * 3;
    ws.getColumn(col).width = 9;
    ws.getColumn(col + 1).width = 9;
    ws.getColumn(col + 2).width = 8;
  }
  // Freeze the legend + header rows and employee identity columns so all
  // stay in view while scanning across a month's worth of day-groups.
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 2 }];

  await downloadWorkbook(wb, `jade-hr-attendance-${MONTH_NAMES[month - 1]}-${year}.xlsx`);
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

// Date-wise export, structured to match the attendance-machine export format
// HR already gets from the biometric system (reference file supplied
// 2026-07-20): one block per employee — an "Employee Code"/name header row,
// a column-header row, then one row per day — separated by a blank row,
// stacked down a single sheet, rather than one flat table with the employee
// repeated on every row. No color-coding here; the reference sheet is plain
// black-on-white, unlike exportAttendanceExcel's status-colored cells.
export async function exportAttendanceTimingsExcel(rows, year, month) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("DailyAttendance_BasicReport_Emp");

  addLateLegend(ws, BLOCK_FONT);
  ws.addRow([]);

  for (const r of rows) {
    const headerRow = ws.addRow(["Employee Code", r.employee_code, null, null, null, r.name, null, null]);
    headerRow.eachCell((cell) => { cell.font = BLOCK_FONT; cell.alignment = { horizontal: "left", vertical: "top" }; });
    ws.mergeCells(headerRow.number, 2, headerRow.number, 4);
    ws.mergeCells(headerRow.number, 6, headerRow.number, 8);

    const colHeaderRow = ws.addRow(["AttendanceDate", "Shift", "A. InTime", "A.OutTime", "W. Duration", "OT", "T Duration", "Status"]);
    colHeaderRow.eachCell((cell) => { cell.font = { ...BLOCK_FONT, bold: true }; cell.alignment = { horizontal: "left", vertical: "top" }; });

    for (const d of r.daily) {
      // jade-hr has no separate per-day "shift code" concept (the source
      // system's "GS"/etc) — Shift mirrors Status (WO shows in both, same
      // as the reference) rather than inventing a code jade-hr can't back.
      const status = STATUS_CODE[d.status] ?? d.status;
      const dataRow = ws.addRow([
        formatBlockDate(d.date),
        status,
        formatClockHHMM(d.first_in),
        formatClockHHMM(d.last_out),
        formatDurationHHMM(d.hours_worked),
        formatDurationHHMM(d.ot_hours),
        formatDurationHHMM((d.hours_worked || 0) + (d.ot_hours || 0)),
        status,
      ]);
      dataRow.eachCell((cell) => { cell.font = BLOCK_FONT; cell.alignment = { horizontal: "left", vertical: "top" }; });
      // Cell 3 is "A. InTime" — grade it by lateness severity, same tiers
      // and colors as the wide export's In column.
      const tier = lateTier(d);
      if (tier) {
        applyLateTier(dataRow.getCell(3), tier, BLOCK_FONT);
        dataRow.getCell(3).alignment = { horizontal: "left", vertical: "top" };
      }
    }

    ws.addRow([]);
  }

  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 5;
  ws.getColumn(3).width = 8.5;
  ws.getColumn(4).width = 10;
  ws.getColumn(5).width = 10;
  ws.getColumn(6).width = 5;
  ws.getColumn(7).width = 9;
  ws.getColumn(8).width = 6;

  await downloadWorkbook(wb, `jade-hr-attendance-timings-${MONTH_NAMES[month - 1]}-${year}.xlsx`);
}
