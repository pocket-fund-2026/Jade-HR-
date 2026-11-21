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

test("HR-typed remark overrides the computed one, including on missed punches", () => {
  assert.equal(dayRemark({ ...P, status: "present", lop_days: 0.25, remark_manual: "Forgot to punch out" }), "Forgot to punch out");
  assert.equal(dayRemark({ status: "present", first_in: "2026-10-22T05:39:49+00:00", last_out: null, remark_manual: " Left at 4pm " }), "Left at 4pm");
  assert.equal(dayRemark({ ...P, status: "present", remark_manual: "  " }), "1");
});

test("remarks are numbers in exports; typed numbers count towards the total", async () => {
  const { dayRemarkValue, remarkNote, parseRemarkNumber, totalPaidDays } = await import("./attendanceExport.js");
  assert.equal(dayRemarkValue({ ...P, status: "present", lop_days: 0.25 }), 0.75);
  assert.equal(dayRemarkValue({ status: "absent" }), 0);
  assert.equal(parseRemarkNumber(" 0,5 "), 0.5);
  assert.equal(parseRemarkNumber(".75"), 0.75);
  assert.equal(parseRemarkNumber("Left at 4pm"), null);
  // Missed punch with HR's typed 0.5: the cell is 0.5 and the total includes it.
  const missed = { status: "present", first_in: "2026-10-22T05:39:49+00:00", last_out: null, remark_manual: "0.5" };
  assert.equal(dayRemarkValue(missed), 0.5);
  assert.equal(totalPaidDays([missed, { status: "weekoff" }]), 1.5);
  // Old free-text remark: number stays in the cell, text goes to the note.
  const text = { ...P, status: "present", lop_days: 0.25, remark_manual: "Forgot to punch out" };
  assert.equal(dayRemarkValue(text), 0.75);
  assert.equal(remarkNote(text), "Forgot to punch out");
});
