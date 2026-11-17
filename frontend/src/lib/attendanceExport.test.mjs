import assert from "node:assert/strict";
import test from "node:test";

import { dayCode, dayRemark, summarize } from "./attendanceExport.js";

const P = { first_in: "2026-10-24T05:00:00+00:00", last_out: "2026-10-24T13:00:00+00:00" };

test("remark is just the pay fraction", () => {
  assert.equal(dayRemark({ ...P, status: "present" }), "1");
  assert.equal(dayRemark({ status: "weekoff" }), "1");
  assert.equal(dayRemark({ status: "holiday" }), "1");
  assert.equal(dayRemark({ status: "leave", leave_type: "paid" }), "1");
  assert.equal(dayRemark({ ...P, status: "present", late: true, lop_days: 0, late_band_v3: "daily_tolerance" }), "1");
});

test("late bands follow policy v3 amounts", () => {
  assert.equal(dayRemark({ ...P, status: "present", lop_days: 0.25, late_band_v3: "level1" }), "0.75");
  assert.equal(dayRemark({ ...P, status: "present", lop_days: 0.25, late_band_v3: "level2" }), "0.75");
  assert.equal(dayRemark({ ...P, status: "present", lop_days: 0.5, late_band_v3: "level3" }), "0.5");
  assert.equal(dayRemark({ ...P, status: "present", lop_days: 0.25, late_band_v3: "extended_buffer" }), "0.75");
  assert.equal(dayRemark({ ...P, status: "present", lop_days: 0.5 }), "0.5");
});

test("status based deductions", () => {
  assert.equal(dayRemark({ status: "absent" }), "0");
  assert.equal(dayRemark({ status: "leave", leave_type: "unpaid" }), "0");
  assert.equal(dayRemark({ ...P, status: "half_day" }), "0.5");
  assert.equal(dayRemark({ ...P, status: "wfh" }), "0.5");
});

test("never throws on malformed rows", () => {
  for (const bad of [undefined, null, {}, { lop_days: "abc" }, { lop_days: null, status: null }, "x", 5]) {
    assert.equal(typeof dayRemark(bad), "string");
  }
  assert.equal(dayRemark({ ...P, status: "present", lop_days: "0.25" }), "0.75");
});

test("existing helpers unchanged", () => {
  assert.equal(dayCode({ status: "present", worked_on_weekly_off: true }), "WOP");
  assert.equal(summarize([{ status: "present", late: true }, { status: "absent" }]).late, 1);
});

test("missed check-in/out: blank remark for manual entry", () => {
  assert.equal(dayRemark({ ...P, status: "present", first_in: "2026-10-22T05:39:49+00:00", last_out: "2026-10-22T05:39:49+00:00" }), "");
  assert.equal(dayRemark({ ...P, status: "present", first_in: "2026-10-22T05:39:49+00:00", last_out: null }), "");
  assert.equal(dayRemark({ ...P, status: "present", first_in: null, last_out: "2026-10-22T14:00:00+00:00" }), "");
  assert.equal(dayRemark({ ...P, status: "present", first_in: "2026-10-24T05:01:55+00:00", last_out: "2026-10-24T10:41:31+00:00" }), "1");
  assert.equal(dayRemark({ status: "absent" }), "0");
});
