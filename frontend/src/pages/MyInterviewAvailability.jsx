import { useEffect, useState } from "react";

import api from "../lib/api.js";

const INPUT = "w-full rounded-sm border border-ink/15 bg-paper px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-jade-500";
const LABEL = "text-[11px] font-semibold uppercase tracking-wider text-ink/50";
const DAYS = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [0, "Sunday"]];
const toDays = (windows = []) => { const d = {}; for (const w of windows) (d[w.dow] ||= { on: true, w: [] }).w.push([w.start, w.end]); return d; };
const toWindows = (days) => Object.entries(days).flatMap(([dow, v]) => (v.on ? v.w.filter(([a, b]) => a && b).map(([start, end]) => ({ dow: Number(dow), start, end })) : []));
const DEFAULTS = { slot_min: 30, buffer_min: 15, min_notice_hours: 12, max_days_ahead: 14, per_day: 4, active: true };

// An interviewer's OWN interview availability. Candidates they are assigned choose only among the open slots this produces.
// Used under /employee (reporting managers, store managers) and /admin/careers/my-availability.
export default function MyInterviewAvailability() {
  const [state, setState] = useState(null); // { email, row }
  const [f, setF] = useState(null);
  const [days, setDays] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => api.get("/api/careers/my-availability").then(({ data }) => {
    const row = data.rows[0] || null;
    setState({ email: data.email, row });
    setF({ ...DEFAULTS, ...(row || {}) });
    setDays(row ? toDays(row.windows) : Object.fromEntries([1, 2, 3, 4, 5, 6].map((d) => [d, { on: true, w: [["10:00", "13:00"], ["14:00", "18:00"]] }])));
  });
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });
  const setDay = (dow, v) => setDays({ ...days, [dow]: v });
  const save = async (e) => {
    e.preventDefault(); setSaving(true); setMsg("");
    try { await api.post("/api/careers/my-availability", { ...f, windows: toWindows(days) }); setMsg("Saved. Candidates assigned to you can now pick from these slots."); await load(); }
    catch (er) { setMsg(typeof er?.response?.data?.detail === "string" ? er.response.data.detail : "Could not save"); } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!state?.row || !confirm("Remove your interview availability? No new interview times will be offered with you.")) return;
    await api.delete(`/api/careers/my-availability/${state.row.id}`); await load();
  };

  if (!f) return <p className="text-sm text-ink/60">Loading…</p>;
  return (
    <div className="max-w-3xl">
      <h2 className="font-display text-2xl text-ink">My interview availability</h2>
      <p className="text-xs text-ink/70 mt-0.5 mb-4">Set the times (IST) you can interview candidates. When HR picks you as interviewer, the candidate chooses among your open slots only; a slot disappears once it is booked. Invites and the Google Meet link are emailed to you and the candidate. Saved under {state.email || "your work email"}.</p>
      <form onSubmit={save} className="bg-paper rounded-sm shadow-card p-5 space-y-4">
        <div className="space-y-1.5">
          {DAYS.map(([dow, name]) => {
            const v = days[dow] || { on: false, w: [["10:00", "13:00"]] };
            return (
              <div key={dow} className="flex items-start gap-3 text-sm">
                <label className="flex items-center gap-2 w-32 pt-1.5"><input type="checkbox" checked={v.on} onChange={(e) => setDay(dow, { ...v, on: e.target.checked })} /> {name}</label>
                <div className="space-y-1">
                  {v.on && v.w.map((w, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input type="time" value={w[0]} onChange={(e) => setDay(dow, { ...v, w: v.w.map((x, j) => (j === i ? [e.target.value, x[1]] : x)) })} className={`${INPUT} w-28`} />
                      <span className="text-ink/50">to</span>
                      <input type="time" value={w[1]} onChange={(e) => setDay(dow, { ...v, w: v.w.map((x, j) => (j === i ? [x[0], e.target.value] : x)) })} className={`${INPUT} w-28`} />
                      {v.w.length > 1 && <button type="button" onClick={() => setDay(dow, { ...v, w: v.w.filter((_, j) => j !== i) })} className="text-xs text-rust-500 px-1">✕</button>}
                    </div>
                  ))}
                  {v.on && <button type="button" onClick={() => setDay(dow, { ...v, w: [...v.w, ["14:00", "18:00"]] })} className="text-xs text-jade-700 font-semibold hover:underline">+ another window</button>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="block"><span className={LABEL}>Slot length (min)</span><input type="number" min="10" max="240" step="5" value={f.slot_min} onChange={set("slot_min")} className={`${INPUT} mt-1`} /></label>
          <label className="block"><span className={LABEL}>Gap between (min)</span><input type="number" min="0" max="120" step="5" value={f.buffer_min} onChange={set("buffer_min")} className={`${INPUT} mt-1`} /></label>
          <label className="block"><span className={LABEL}>Notice needed (hours)</span><input type="number" min="0" max="168" value={f.min_notice_hours} onChange={set("min_notice_hours")} className={`${INPUT} mt-1`} /></label>
          <label className="block"><span className={LABEL}>Days ahead</span><input type="number" min="1" max="60" value={f.max_days_ahead} onChange={set("max_days_ahead")} className={`${INPUT} mt-1`} /></label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Currently taking interviews</label>
        <div className="flex gap-3 items-center">
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-sm text-sm font-semibold bg-jade-600 text-white hover:bg-jade-700 disabled:opacity-40">{saving ? "Saving…" : "Save my availability"}</button>
          {state.row && <button type="button" onClick={remove} className="text-xs text-rust-500 hover:underline">Remove</button>}
          {msg && <span className="text-xs text-ink/80">{msg}</span>}
        </div>
      </form>
    </div>
  );
}
