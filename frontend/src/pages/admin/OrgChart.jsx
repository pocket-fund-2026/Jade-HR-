import { Network, RefreshCw, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Link } from "react-router-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";

const STATUSES = ["On Probation", "Confirmed", "Resigned", "Absconded", "Terminated"];
const STATUS_CLS = {
  "On Probation": "bg-ochre-500/15 text-ochre-700",
  Confirmed: "bg-jade-500/15 text-jade-700",
  Resigned: "bg-ink/10 text-ink/70",
  Absconded: "bg-rust-500/15 text-rust-500",
  Terminated: "bg-rust-500/15 text-rust-500",
};

const selectCls =
  "rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

function StatusBadge({ status }) {
  return <span className={`inline-block whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CLS[status] || ""}`}>{status}</span>;
}

function buildTree(rows) {
  const ids = new Set(rows.map((r) => r.employee_id));
  const kids = {};
  const roots = [];
  for (const r of rows) {
    if (r.reporting_manager_id && ids.has(r.reporting_manager_id) && r.reporting_manager_id !== r.employee_id) {
      (kids[r.reporting_manager_id] ||= []).push(r);
    } else roots.push(r);
  }
  return { roots, kids };
}

const CHART_CSS = `
.oc{--c:rgba(60,60,60,.35);display:inline-block;transform-origin:top left}
.oc ul{display:flex;justify-content:center;padding-top:22px;margin:0;position:relative}
.oc li{list-style:none;text-align:center;position:relative;padding:22px 5px 0}
.oc li::before,.oc li::after{content:"";position:absolute;top:0;right:50%;width:50%;height:22px;border-top:1.5px solid var(--c)}
.oc li::after{right:auto;left:50%;border-left:1.5px solid var(--c)}
.oc li:only-child::before,.oc li:only-child::after{display:none}
.oc li:only-child{padding-top:0}
.oc li:first-child::before,.oc li:last-child::after{border:0 none}
.oc li:last-child::before{border-right:1.5px solid var(--c);border-radius:0 6px 0 0}
.oc li:first-child::after{border-radius:6px 0 0 0}
.oc ul ul::before{content:"";position:absolute;top:0;left:50%;height:22px;border-left:1.5px solid var(--c)}
.oc>ul{padding-top:0}.oc>ul>li{padding-top:0}.oc>ul>li::before,.oc>ul>li::after{display:none}
.oc-card{display:inline-block;width:140px;border:1.5px solid rgba(60,60,60,.18);border-top-width:4px;border-radius:6px;background:#fff;padding:6px 8px;text-align:left;box-shadow:0 1px 3px rgba(0,0,0,.08);position:relative}
.oc-card.s-Confirmed{border-top-color:#2f8f6b}.oc-card.s-On{border-top-color:#c9962b}
.oc-card.s-Resigned{border-top-color:#888}.oc-card.s-Absconded,.oc-card.s-Terminated{border-top-color:#c0502f}
.oc-card.s-Group{border-top-color:#9aa5b1;background:#f1f4f7;border-style:dashed}.oc-card.s-Chair{border-top-color:#1f2937;background:#f4f1ea}
.oc-top{display:inline-flex;align-items:center;gap:0}
.oc-top .oc-link{width:48px;border-top:1.5px solid var(--c)}
.oc ul.oc-stack{display:block;width:140px;margin:0 auto;padding:14px 0 0;position:relative}
.oc ul.oc-stack::before{content:"";position:absolute;left:8px;top:0;bottom:16px;height:auto;border-left:1.5px solid var(--c)}
.oc ul.oc-stack>li{display:block;text-align:left;padding:5px 0 0 16px}
.oc ul.oc-stack>li::before{content:"";position:absolute;left:8px;top:26px;width:8px;height:0;right:auto;border:0;border-top:1.5px solid var(--c);border-radius:0}
.oc ul.oc-stack>li::after{display:none}
.oc ul.oc-stack .oc-card{width:124px}
.oc ul.oc-stack .oc-foot span:last-child{display:none}
.oc-name{font-size:12px;font-weight:600;line-height:1.2;color:#1c1c1c}
.oc-role{font-size:10px;color:#666;margin-top:2px;min-height:14px;line-height:1.2}
.oc-foot{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-top:6px}
.oc-tog{position:absolute;left:50%;bottom:-11px;transform:translateX(-50%);width:22px;height:22px;border-radius:50%;border:1.5px solid rgba(60,60,60,.35);background:#fff;font-size:10px;font-weight:600;cursor:pointer;z-index:2;line-height:1}
`;

function Card({ row, count, open, onToggle }) {
  const chair = row.chair;
  const cls = chair ? "s-Chair" : row.group ? "s-Group" : `s-${row.status.split(" ")[0]}`;
  return (
    <div className={`oc-card ${cls}`}>
      <div className="oc-name">{row.name}</div>
      <div className="oc-role">{row.designation || (chair ? "Chairman" : "—")}</div>
      {!chair && !row.group && (
        <div className="oc-foot">
          <StatusBadge status={row.status} />
          <span className="text-[9px] text-ink/40 truncate" title={row.location}>{row.location.split(",")[0].split(" ")[0]}</span>
        </div>
      )}
      {count > 0 && (
        <button className="oc-tog" onClick={onToggle} title={open ? "Collapse" : `Show ${count} direct reports`}>
          {open ? "−" : count}
        </button>
      )}
    </div>
  );
}

function Node({ row, kids, depth, seen, collapsed, toggle, top }) {
  const children = (kids[row.employee_id] || []).filter((c) => !seen.has(c.employee_id));
  const next = new Set(seen).add(row.employee_id); // guards against manager loops
  const isOpen = !collapsed.has(row.employee_id);
  // People with no reports of their own stack in a column under the manager instead of
  // spreading sideways — keeps the chart narrow enough to fit the screen.
  const branches = children.filter((c) => (kids[c.employee_id] || []).length);
  const leaves = children.filter((c) => !(kids[c.employee_id] || []).length);
  const renderNode = (c) => (
    <Node key={c.employee_id} row={c} kids={kids} depth={depth + 1} seen={next} collapsed={collapsed} toggle={toggle} />
  );
  return (
    <li>
      {top ? (
        <div className="oc-top">{top}</div>
      ) : (
        <Card row={row} count={children.length} open={isOpen} onToggle={() => toggle(row.employee_id)} />
      )}
      {children.length > 0 && isOpen && (
        <>
          {branches.length > 0 && <ul>{branches.map(renderNode)}</ul>}
          {leaves.length > 0 && <ul className="oc-stack">{leaves.map(renderNode)}</ul>}
        </>
      )}
    </li>
  );
}

export default function OrgChart() {
  const [data, setData] = useState(null);
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("");
  const [view, setView] = useState("chart");
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [collapsed, setCollapsed] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/org-chart", { params: location ? { location } : {} });
      setData(data);
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (data?.employees || []).filter((r) => !status || r.status === status), [data, status]);
  // One tree: Chairman -> Monica (Director) -> everyone. People with no manager on record are
  // grouped by location under Monica so a 100-wide row doesn't swamp the chart.
  const chair = { employee_id: "__chair__", name: "Nehal Sir", designation: "Chairman", chair: true };
  const topRow = { employee_id: "__top__" };
  const { kids, depthCollapsed, monica } = useMemo(() => {
    const { roots, kids: base } = buildTree(rows);
    const monica = rows.find((r) => /^monica\b/i.test(r.name) && /director/i.test(r.designation));
    // Chairman and Monica share the top row; everyone hangs from a point between them.
    const topKids = [...(base[monica?.employee_id] || [])];
    const groups = {};
    for (const r of roots) {
      if (monica && r.employee_id === monica.employee_id) continue;
      if (r.top_of_org || (base[r.employee_id] || []).length || r.reporting_manager) topKids.push(r);
      else (groups[r.location] ||= []).push(r);
    }
    const k = { ...base, __top__: topKids };
    if (monica) delete k[monica.employee_id];
    // Direct reports with no team of their own go in one group, so they aren't mistaken for another manager's stack.
    const solo = topKids.filter((r) => !(k[r.employee_id] || []).length);
    if (solo.length) {
      for (const r of solo) topKids.splice(topKids.indexOf(r), 1);
      const g = { employee_id: "__grp:direct", name: `${monica ? "Monica's" : "Direct"} team`, designation: `${solo.length} direct reports`, group: true };
      k[g.employee_id] = solo;
      topKids.unshift(g);
    }
    for (const [loc, members] of Object.entries(groups)) {
      const g = { employee_id: `__grp:${loc}`, name: `${loc.split(",")[0]} team`, designation: `${members.length} people · no manager recorded`, group: true };
      k[g.employee_id] = members;
      topKids.push(g);
    }
    // Only the first level shows by default; click a card's number to open its team.
    const hide = new Set();
    const walk = (r, d, seen) => {
      const ch = (k[r.employee_id] || []).filter((c) => !seen.has(c.employee_id));
      if (ch.length && (d >= 1 || String(r.employee_id).startsWith("__grp"))) hide.add(r.employee_id);
      const next = new Set(seen).add(r.employee_id);
      ch.forEach((c) => walk(c, d + 1, next));
    };
    walk(topRow, 0, new Set());
    return { kids: k, depthCollapsed: hide, monica };
  }, [rows]);
  useEffect(() => { setCollapsed(depthCollapsed); }, [depthCollapsed]);
  const toggle = (id) => setCollapsed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Fit mode scales the whole chart to the available width so it doesn't need sideways scrolling.
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [fit, setFit] = useState(true);
  const [dragging, setDragging] = useState(false);
  // Click-and-drag on the chart background pans it (buttons still click normally).
  const startDrag = (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    const box = outerRef.current;
    const start = { x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop };
    setDragging(true);
    const move = (ev) => {
      box.scrollLeft = start.left - (ev.clientX - start.x);
      box.scrollTop = start.top - (ev.clientY - start.y);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    e.preventDefault();
  };
  const [dim, setDim] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const el = innerRef.current;
      const box = outerRef.current;
      if (!el || !box) return;
      setDim({ w: el.offsetWidth, h: el.offsetHeight });
      if (fit && el.offsetWidth) setZoom(Math.max(0.25, Math.min(1, (box.clientWidth - 8) / el.offsetWidth)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [collapsed, kids, view, fit, rows]);

  const downloadGaps = () => {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const gaps = rows.filter((r) => (!r.reporting_manager && !r.top_of_org) || !r.designation || r.name_pending);
    const csv = ["Employee Code,Name,Location,Department,Designation,Reporting Manager,Missing"]
      .concat(gaps.map((r) => [r.employee_code, r.name, r.location, r.department, r.designation, r.reporting_manager,
        [!r.reporting_manager && !r.top_of_org && "manager", !r.designation && "designation", r.name_pending && "name"].filter(Boolean).join(" + ")].map(q).join(",")))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "org-chart-missing-data.csv";
    a.click();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink flex items-center gap-2"><Network size={22} /> Organisation Chart</h2>
          <p className="text-sm text-ink/60">
            Live from employee records{data ? ` · as of ${formatDate(data.as_of)} · ${data.headcount} active` : ""}. People drop off after their last working day but stay in the database.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={location} onChange={(e) => setLocation(e.target.value)} className={selectCls}>
            <option value="">All locations</option>
            {(data?.locations || []).map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s} ({data?.status_counts?.[s] || 0})</option>)}
          </select>
          <div className="flex rounded-sm border border-ink/15 overflow-hidden text-sm">
            {["chart", "list"].map((v) => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-2 capitalize ${view === v ? "bg-jade-500 text-white" : "bg-manila/40 text-ink"}`}>{v}</button>
            ))}
          </div>
          {view === "chart" && (
            <div className="flex items-center gap-1">
              <button className={`${selectCls} flex items-center gap-1`} title="Zoom out" onClick={() => { setFit(false); setZoom((z) => Math.max(0.25, +(z - 0.15).toFixed(2))); }}>
                <ZoomOut size={16} /> <span className="hidden sm:inline">Zoom out</span>
              </button>
              <span className="text-xs w-10 text-center font-nums">{Math.round(zoom * 100)}%</span>
              <button className={`${selectCls} flex items-center gap-1`} title="Zoom in" onClick={() => { setFit(false); setZoom((z) => Math.min(2, +(z + 0.15).toFixed(2))); }}>
                <ZoomIn size={16} /> <span className="hidden sm:inline">Zoom in</span>
              </button>
              <button className={`${selectCls} ${fit ? "bg-jade-500 text-white" : ""}`} onClick={() => setFit(true)}>Fit</button>
              <button className={selectCls} onClick={() => setCollapsed(new Set())}>Expand all</button>
              <button
                className={`${selectCls} flex items-center gap-1`} title="Reset zoom, fit to screen and collapse back to the first level"
                onClick={() => { setCollapsed(depthCollapsed); setFit(true); outerRef.current?.scrollTo({ top: 0, left: 0 }); }}
              >
                <RotateCcw size={14} /> Reset view
              </button>
            </div>
          )}
          <button onClick={load} className={`${selectCls} flex items-center gap-1`} title="Refresh"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
        </div>
      </div>

      {data && (data.status_counts?.["On Probation"] || 0) > 0.5 * data.headcount && (
        <div className="rounded-sm border border-ochre-500/40 bg-ochre-500/10 px-4 py-3 text-sm text-ink">
          Most people show as <b>On Probation</b> because their confirmation date hasn't been entered yet. HR team: please add confirmation dates under{" "}
          <Link to="/admin/confirmations" className="underline">Confirmations</Link> or on each employee's Employment tab.
        </div>
      )}

      {data && (data.data_gaps.no_reporting_manager > 0 || data.data_gaps.no_designation > 0) && (
        <p className="text-xs text-ink/60">
          <button onClick={downloadGaps} className="underline mr-2">Download missing-data list</button>
          Gaps in this view: {data.data_gaps.name_pending} still named by biometric code only, {data.data_gaps.no_reporting_manager} without a reporting manager, {data.data_gaps.manager_not_linked} with a manager name that isn't linked to an employee record, {data.data_gaps.no_designation} without a designation.
        </p>
      )}

      <div className="bg-paper rounded-sm shadow-card p-5 overflow-x-auto">
        {view === "chart" ? (
          rows.length ? (
            <>
              <div
                ref={outerRef} onMouseDown={startDrag}
                className={`overflow-auto max-h-[80vh] pb-6 select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
              >
                <style>{CHART_CSS}</style>
                <div style={{ width: dim.w * zoom || undefined, height: dim.h * zoom || undefined, margin: "0 auto" }}>
                  <div ref={innerRef} className="oc" style={{ transform: `scale(${zoom})` }}>
                    <ul>
                      <Node
                        row={topRow} kids={kids} depth={0} seen={new Set()} collapsed={collapsed} toggle={toggle}
                        top={(
                          <>
                            <Card row={chair} count={0} />
                            {monica && <><span className="oc-link" /><Card row={monica} count={0} /></>}
                          </>
                        )}
                      />
                    </ul>
                  </div>
                </div>
              </div>
            </>
          ) : <p className="text-sm text-ink/60">{loading ? "Loading…" : "No employees match."}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/50 border-b border-ink/10">
                <th className="py-2 pr-4">Employee</th><th className="pr-4">Designation</th><th className="pr-4">Reporting manager</th>
                <th className="pr-4">Location</th><th className="pr-4">Status</th><th className="pr-4">Resigned on</th><th>Last working day</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0">
                  <td className="py-2 pr-4 font-medium text-ink">{r.name}</td>
                  <td className="pr-4 text-ink/70">{r.designation || "—"}</td>
                  <td className="pr-4 text-ink/70">{r.reporting_manager || "—"}</td>
                  <td className="pr-4 text-ink/70">{r.location}</td>
                  <td className="pr-4"><StatusBadge status={r.status} /></td>
                  <td className="pr-4 text-ink/70">{r.resignation_date ? formatDate(r.resignation_date) : "—"}</td>
                  <td className="text-ink/70">{r.leaving_date ? formatDate(r.leaving_date) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
