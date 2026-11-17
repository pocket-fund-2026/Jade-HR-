import assert from "node:assert/strict";
import test from "node:test";

import { dayCode, dayRemark, summarize } from "./attendanceExport.js";

test("no deduction shows 0", () => {
  assert.equal(dayRemark({ status: "present" }), "0");
  assert.equal(dayRemark({ status: "weekoff" }), "0");
  assert.equal(dayRemark({ status: "holiday" }), "0");
  assert.equal(dayRemark({ status: "leave", leave_type: "paid" }), "0");
  assert.equal(dayRemark({ status: "present", late: true, lop_days: 0, late_band_v3: "daily_tolerance" }), "0");
});

test("late bands follow policy v3 amounts", () => {
  assert.equal(dayRemark({ status: "present", lop_days: 0.25, late_band_v3: "level1" }), "1 - 1/4 = 0.75 — Late Level 1 (21–45m)");
  assert.equal(dayRemark({ status: "present", lop_days: 0.25, late_band_v3: "level2" }), "1 - 1/4 = 0.75 — Late Level 2 (46–105m)");
  assert.equal(dayRemark({ status: "present", lop_days: 0.5, late_band_v3: "level3" }), "1 - 1/2 = 0.5 — Late Level 3 (106m+)");
  assert.equal(dayRemark({ status: "present", lop_days: 0.25, late_band_v3: "extended_buffer" }), "1 - 1/4 = 0.75 — Extended Buffer late (beyond free buffer)");
  assert.equal(dayRemark({ status: "present", lop_days: 0.5 }), "1 - 1/2 = 0.5 — Late arrival");
});

test("status based deductions", () => {
  assert.equal(dayRemark({ status: "absent" }), "1 - 1 = 0 — Absent");
  assert.equal(dayRemark({ status: "leave", leave_type: "unpaid" }), "1 - 1 = 0 — Unpaid leave");
  assert.equal(dayRemark({ status: "half_day" }), "1 - 1/2 = 0.5 — Half day");
  assert.equal(dayRemark({ status: "wfh" }), "1 - 1/2 = 0.5 — WFH (50% pay)");
});

test("never throws on malformed rows", () => {
  for (const bad of [undefined, null, {}, { lop_days: "abc" }, { lop_days: null, status: null }, "x", 5]) {
    assert.equal(typeof dayRemark(bad), "string");
  }
  assert.equal(dayRemark({ status: "present", lop_days: "0.25" }), "1 - 1/4 = 0.75 — Late arrival");
});

test("existing helpers unchanged", () => {
  assert.equal(dayCode({ status: "present", worked_on_weekly_off: true }), "WOP");
  assert.equal(summarize([{ status: "present", late: true }, { status: "absent" }]).late, 1);
});
