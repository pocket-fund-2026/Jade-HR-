// Builds the real workbooks in Node (browser download stubbed) and reads the
// cells back: every person must have a Remarks value for every single day.
import assert from "node:assert/strict";
import test from "node:test";

let captured = null;
globalThis.document = {
  createElement: () => ({ click() {}, remove() {} }),
  body: { appendChild() {} },
};
const realCreate = URL.createObjectURL;
URL.createObjectURL = (blob) => { captured = { blob }; return "blob:test"; };
URL.revokeObjectURL = () => {};

const { exportAttendanceExcel, exportAttendanceTimingsExcel, exportDailyAttendanceExcel } = await import("./attendanceExport.js");
const ExcelJS = (await import("exceljs")).default;

const mk = (date, over = {}) => ({ date, status: "present", first_in: `${date}T04:30:00+00:00`, last_out: `${date}T13:30:00+00:00`, hours_worked: 9, ot_hours: 0, late: false, ...over });
const days = (code) => [
  mk("2026-11-01"),
  mk("2026-11-02", { first_in: "2026-11-02T05:25:00+00:00", late: true, lop_days: 0.25, late_band_v3: "level2" }),
  mk("2026-11-03", { status: "absent", first_in: null, last_out: null, hours_worked: 0 }),
  mk("2026-11-04", { status: "weekoff", first_in: null, last_out: null }),
  mk("2026-11-05", { first_in: "2026-11-05T09:00:00+00:00", late: true, lop_days: 0.5, late_band_v3: "level3" }),
];
const rows = ["1001", "1002", "1003"].map((c) => ({ employee_code: c, name: `Emp ${c}`, department: "Ops", time_slot: "10:00 AM – 7:00 PM", daily: days(c) }));
rows.push({ employee_code: "1004", name: "No daily", department: "Ops" }); // malformed: no daily array

async function workbookFrom(fn) {
  captured = null;
  await fn();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await captured.blob.arrayBuffer()));
  return wb;
}

test("wide sheet: a Remarks cell under every day for every person", async () => {
  const wb = await workbookFrom(() => exportAttendanceExcel(rows.slice(0, 3), 2026, 11));
  const ws = wb.getWorksheet("Attendance");
  const header = ws.getRow(2).values.slice(1);
  const remarkCols = header.map((h, i) => (String(h).endsWith("Remarks") ? i + 1 : 0)).filter(Boolean);
  assert.equal(remarkCols.length, 5);
  for (let r = 3; r <= 5; r++) {
    const vals = remarkCols.map((c) => String(ws.getRow(r).getCell(c).value));
    assert.ok(vals.every((v) => v !== "" && v !== "undefined" && v !== "null"), `blank remark in row ${r}: ${vals}`);
    assert.deepEqual(vals, ["1", "0.75", "0", "1", "0.5"]);
  }
});

test("a malformed row does not break the whole export", async () => {
  const wb = await workbookFrom(() => exportAttendanceExcel(rows, 2026, 11));
  assert.equal(wb.getWorksheet("Attendance").rowCount >= 6, true);
});

test("timings export: Remarks on every day row of every tab", async () => {
  const wb = await workbookFrom(() => exportAttendanceTimingsExcel(rows.slice(0, 3), 2026, 11));
  let dayRows = 0;
  wb.eachSheet((ws) => ws.eachRow((row) => {
    if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(String(row.getCell(3).value))) {
      dayRows += 1;
      const v = String(row.getCell(11).value);
      assert.ok(v && v !== "undefined", `blank remark on ${row.getCell(3).value}`);
    }
  }));
  assert.equal(dayRows, 15);
});

test("single-employee daily export: Remarks on every day", async () => {
  const wb = await workbookFrom(() => exportDailyAttendanceExcel(days("1001"), { employeeCode: "1001", name: "Emp", rangeLabel: "Nov" }));
  const ws = wb.getWorksheet("Daily Attendance");
  assert.equal(String(ws.getRow(3).getCell(7).value), "Remarks");
  const vals = [4, 5, 6, 7, 8].map((r) => String(ws.getRow(r).getCell(7).value));
  assert.deepEqual(vals, ["1", "0.75", "0", "1", "0.5"]);
});

test("missed punch: row highlighted, Remarks blank, in all three exports", async () => {
  const missed = [mk("2026-11-01"), mk("2026-11-02", { last_out: "2026-11-02T04:30:00+00:00", hours_worked: 0 })];
  const r = [{ employee_code: "2001", name: "Missed", department: "Ops", time_slot: "10:00 AM – 7:00 PM", daily: missed }];
  const fill = (c) => c.fill?.fgColor?.argb;

  let wb = await workbookFrom(() => exportAttendanceExcel(r, 2026, 11));
  let row = wb.getWorksheet("Attendance").getRow(3);
  assert.equal(fill(row.getCell(8)), "FFFFE066");          // day 2 In
  assert.equal(fill(row.getCell(11)), "FFFFE066");         // day 2 Remarks
  assert.ok(!row.getCell(11).value);                        // blank, for manual entry
  assert.equal(String(row.getCell(7).value), "1"); // day 1 normal

  wb = await workbookFrom(() => exportAttendanceTimingsExcel(r, 2026, 11));
  const hit = [];
  wb.eachSheet((ws) => ws.eachRow((rw) => { if (fill(rw.getCell(11)) === "FFFFE066") hit.push(rw.getCell(11).value); }));
  assert.deepEqual(hit.map((v) => v || ""), [""]);

  wb = await workbookFrom(() => exportDailyAttendanceExcel(missed, { employeeCode: "2001", name: "Missed", rangeLabel: "x" }));
  const ws = wb.getWorksheet("Daily Attendance");
  assert.equal(fill(ws.getRow(5).getCell(7)), "FFFFE066");
  assert.ok(!ws.getRow(5).getCell(7).value);
});

test("timings export: Employee Code and Name lead every row, then the day columns", async () => {
  const wb = await workbookFrom(() => exportAttendanceTimingsExcel(rows.slice(0, 2), 2026, 11));
  const ws = wb.worksheets[0];
  let header = null;
  const data = [];
  ws.eachRow((row) => {
    const v = row.values.slice(1).map((c) => (c && c.text !== undefined ? c.text : c));
    if (v[0] === "Employee Code") header = v;
    else if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(String(v[2]))) data.push(v);
  });
  assert.deepEqual(header, ["Employee Code", "Employee Name", "AttendanceDate", "Shift", "A. InTime", "A.OutTime", "W. Duration", "OT", "T Duration", "Status", "Remarks"]);
  assert.equal(data.length, 10);
  assert.deepEqual([data[0][0], data[0][1]], ["1001", "Emp 1001"]);
  assert.deepEqual([data[5][0], data[5][1]], ["1002", "Emp 1002"]);
});
