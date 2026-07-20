import { formatHoursMins, formatTime } from "./format.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const STATUS_CODE = {
  present: "P", absent: "A", weekoff: "WO", holiday: "H", leave: "L", half_day: "HD", future: "",
};

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

export async function exportAttendanceExcel(rows, year, month) {
  const XLSX = await import("xlsx");
  const data = rows.map((r) => {
    const row = { "Employee Code": r.employee_code, "Name": r.name, "Department": r.department };
    for (const d of r.daily) {
      const code = STATUS_CODE[d.status] ?? d.status;
      row[dayNumber(d.date)] = d.first_in ? `${code} ${formatTime(d.first_in)}-${formatTime(d.last_out)}` : code;
    }
    const s = summarize(r.daily);
    row["Present"] = s.present;
    row["Absent"] = s.absent;
    row["Leave"] = s.leave;
    row["Weekoff"] = s.weekoff;
    row["Holiday"] = s.holiday;
    row["Late"] = s.late;
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Attendance");
  XLSX.writeFile(wb, `jade-hr-attendance-${MONTH_NAMES[month - 1]}-${year}.xlsx`);
}

// Date-wise detailed export: one row per employee per day, with in/out times
// in their own columns plus worked/OT hours — a "long" format that's easy to
// filter/pivot in Excel, unlike exportAttendanceExcel's wide sheet (one row
// per employee, one column per date) where in/out is inline text within
// each date's cell instead of its own column.
export async function exportAttendanceTimingsExcel(rows, year, month) {
  const XLSX = await import("xlsx");
  const data = rows.flatMap((r) =>
    r.daily.map((d) => ({
      "Date": d.date,
      "Employee Code": r.employee_code,
      "Name": r.name,
      "Department": r.department,
      "In Time": d.first_in ? formatTime(d.first_in) : "",
      "Out Time": d.last_out ? formatTime(d.last_out) : "",
      "Hours Worked": d.hours_worked ? formatHoursMins(d.hours_worked) : "",
      "OT Hours": d.ot_hours ? formatHoursMins(d.ot_hours) : "",
      "Status": d.status,
      "Late": d.late ? "Yes" : "",
    }))
  );
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Attendance Timings");
  XLSX.writeFile(wb, `jade-hr-attendance-timings-${MONTH_NAMES[month - 1]}-${year}.xlsx`);
}
