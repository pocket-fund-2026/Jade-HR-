import { useEffect, useState } from "react";

import CareersNav from "../../components/CareersNav.jsx";
import api from "../../lib/api.js";
import { formatDateTime } from "../../lib/careers.js";

const INPUT = "w-full rounded-sm border border-ink/15 bg-paper px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-jade-500";
const LABEL = "text-[11px] font-semibold uppercase tracking-wider text-ink/50";
const DAYS = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [0, "Sunday"]];
const BLANK = { name: "", email: "", slot_min: 30, buffer_min: 15, min_notice_hours: 12, max_days_ahead: 14, per_day: 2, active: true, days: {} };

// windows[] <-> per-day editor state: { 1: { on: true, w: [["10:00","13:00"],["14:00","18:00"]] }, ... }
const toDays = (windows = []) => { const d = {}; for (const w of windows) { (d[w.dow] ||= { on: true, w: [] }).w.push([w.start, w.end]); } return d; };
const toWindows = (days) => Object.entries(days).flatMap(([dow, v]) => (v.on ? v.w.filter(([a, b]) => a && b).map(([start, end]) => ({ dow: Number(dow), start, end })) : []));

// HR sets when each interviewer can interview; the scheduling forms then suggest the next free times from this.
export default function CareersSlots() {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState({});
  const load = () => api.get("/api/careers/availability").then(({ data }) => setList(data));
  useEffect(() => { load(); }, []);

  const open = (r) => { setErr(""); setEdit(r ? { ...r, email: r.email || "", days: toDays(r.windows) } : { ...BLANK, days: Object.fromEntries([1, 2, 3, 4, 5, 6].map((d) => [d, { on: true, w: [["10:00", "13:00"], ["14:00", "18:00"]] }])) }); };
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });
  const setDay = (dow, v) => setEdit({ ...edit, days: { ...edit.days, [dow]: v } });
  const save = async (e) => {
    e.preventDefault(); setSaving(true); setErr("");
    try { await api.post("/api/careers/availability", { ...edit, email: edit.email || null, windows: toWindows(edit.days) }); setEdit(null); await load(); }
    catch (e2) { setErr(e2?.response?.data?.detail || "Could not save"); } finally { setSaving(false); }
  };
  const remove = async (r) => { if (!confirm(`Remove ${r.name}'s availability?`)) return; await api.delete(`/api/careers/availability/${r.id}`); await load(); };
  const check = async (r) => {
    setPreview((p) => ({ ...p, [r.id]: { text: "Checking…" } }));
    try { const { data } = await api.post("/api/careers/availability/suggest", { interviewer_email: r.email, duration_min: r.slot_min, count: 4 }); setPreview((p) => ({ ...p, [r.id]: { slots: data.slots } })); }
    catch (e) { setPreview((p) => ({ ...p, [r.id]: { text: e?.response?.data?.detail || "No times found", bad: true } })); }
  };
  const summary = (r) => DAYS.map(([d, n]) => { const ws = r.windows.filter((w) => w.dow === d); return ws.length ? `${n.slice(0, 3)} ${ws.map((w) => `${w.start}–${w.end}`).join(", ")}` : null; }).filter(Boolean).join(" · ") || "No working windows set";

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-display text-2xl text-ink">Careers — Interview Slots</h2>
        <p className="text-xs text-ink/70 mt-0.5">Set when each interviewer can interview (IST). When you schedule or send the second mail, <strong>Suggest times</strong> fills in the next free slots, skipping other interviews and the interviewer's Google Calendar. You can still edit them before sending.</p>
      </div>
      <CareersNav />
      {!edit && <button type="button" onClick={() => open(null)} className="mb-4 px-3 py-1.5 rounded-sm text-xs font-semibold bg-jade-600 text-white hover:bg-jade-700">+ Add interviewer availability</button>}

      {edit && (
        <form onSubmit={save} className="bg-paper rounded-sm shadow-card p-5 mb-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className={LABEL}>Interviewer name</span><input required value={edit.name} onChange={set("name")} className={`${INPUT} mt-1`} placeholder="e.g. HR team" /></label>
            <label className="block"><span className={LABEL}>Email (gets invite + brief; used for the calendar check)</span><input type="email" value={edit.email} onChange={set("email")} className={`${INPUT} mt-1`} placeholder="optional for a shared default" /></label>
          </div>
          <div>
            <span className={LABEL}>Weekly availability</span>
            <div className="mt-2 space-y-1.5">
              {DAYS.map(([dow, name]) => {
                const v = edit.days[dow] || { on: false, w: [["10:00", "13:00"]] };
                return (
                  <div key={dow} className="flex flex-wrap items-center gap-2 text-sm">
                    <label className="flex items-center gap-2 w-28"><input type="checkbox" checked={v.on} onChange={(e) => setDay(dow, { ...v, on: e.target.checked })} /> {name}</label>
                    {v.on && v.w.map((w, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <input type="time" value={w[0]} onChange={(e) => setDay(dow, { ...v, w: v.w.map((x, j) => (j === i ? [e.target.value, x[1]] : x)) })} className={`${INPUT} !w-28`} />–
                        <input type="time" value={w[1]} onChange={(e) => setDay(dow, { ...v, w: v.w.map((x, j) => (j === i ? [x[0], e.target.value] : x)) })} className={`${INPUT} !w-28`} />
                        {v.w.length > 1 && <button type="button" onClick={() => setDay(dow, { ...v, w: v.w.filter((_, j) => j !== i) })} className="text-rust-500 text-xs px-1">✕</button>}
                      </span>
                    ))}
                    {v.on && v.w.length < 2 && <button type="button" onClick={() => setDay(dow, { ...v, w: [...v.w, ["14:00", "18:00"]] })} className="text-xs text-jade-700 font-semibold hover:underline">+ second window</button>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <label className="block"><span className={LABEL}>Slot length (min)</span><input type="number" min="10" max="240" step="5" value={edit.slot_min} onChange={set("slot_min")} className={`${INPUT} mt-1`} /></label>
            <label className="block"><span className={LABEL}>Gap between (min)</span><input type="number" min="0" max="120" step="5" value={edit.buffer_min} onChange={set("buffer_min")} className={`${INPUT} mt-1`} /></label>
            <label className="block"><span className={LABEL}>Minimum notice (hours)</span><input type="number" min="0" max="168" value={edit.min_notice_hours} onChange={set("min_notice_hours")} className={`${INPUT} mt-1`} /></label>
            <label className="block"><span className={LABEL}>Look ahead (days)</span><input type="number" min="1" max="60" value={edit.max_days_ahead} onChange={set("max_days_ahead")} className={`${INPUT} mt-1`} /></label>
            <label className="block"><span className={LABEL}>Offer per day</span><select value={edit.per_day} onChange={set("per_day")} className={`${INPUT} mt-1`}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active (used for suggestions)</label>
          {err && <p className="text-xs text-rust-500">{err}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-3 py-1.5 rounded-sm text-xs font-semibold bg-jade-600 text-white hover:bg-jade-700 disabled:opacity-40">{saving ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => setEdit(null)} className="px-3 py-1.5 rounded-sm text-xs text-ink/70 hover:text-ink">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {(list || []).map((r) => (
          <section key={r.id} className={`bg-paper rounded-sm shadow-card p-5 ${r.active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div><h3 className="font-display text-lg text-ink">{r.name}</h3><p className="text-xs text-ink/60">{r.email || "Shared default (any interviewer)"}{r.active ? "" : " · inactive"}</p></div>
              <div className="flex gap-3 text-xs"><button type="button" onClick={() => open(r)} className="text-jade-700 font-semibold hover:underline">Edit</button><button type="button" onClick={() => remove(r)} className="text-rust-500 hover:underline">Remove</button></div>
            </div>
            <p className="text-sm text-ink/80 mt-2">{summary(r)}</p>
            <p className="text-[11px] text-ink/50 mt-1 font-nums">{r.slot_min}-min slots, {r.buffer_min}-min gap, {r.min_notice_hours}h notice, {r.max_days_ahead} days ahead, up to {r.per_day}/day</p>
            <button type="button" onClick={() => check(r)} className="mt-3 text-xs font-semibold text-jade-700 hover:underline">Preview next free times</button>
            {preview[r.id]?.slots && <ul className="mt-1 text-xs text-ink/80 font-nums">{preview[r.id].slots.map((s) => <li key={s}>{formatDateTime(s)}</li>)}</ul>}
            {preview[r.id]?.text && <p className={`mt-1 text-xs ${preview[r.id].bad ? "text-rust-500" : "text-ink/60"}`}>{preview[r.id].text}</p>}
          </section>
        ))}
        {list && !list.length && !edit && <p className="text-sm text-ink/60">No availability set up yet. Add the first interviewer to get started.</p>}
      </div>
    </div>
  );
}
