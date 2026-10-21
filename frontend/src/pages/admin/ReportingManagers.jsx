import { AlertTriangle, Check, ChevronDown, Crown, GitBranch, MailWarning, RefreshCw, Search, Sparkles, Undo2, Upload, UserX, Users, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import PersonAvatar from "../../components/PersonAvatar.jsx";
import ReportingManagerImportModal from "../../components/ReportingManagerImportModal.jsx";
import api from "../../lib/api.js";

const selectCls =
  "rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

// Status of a row once any unsaved edit is applied.
const STATUS_META = {
  assigned: { label: "Assigned", cls: "bg-jade-500/15 text-jade-700" },
  suggested: { label: "Suggested", cls: "bg-ledger-700/10 text-ledger-800" },
  ambiguous: { label: "Needs review", cls: "bg-ochre-500/15 text-ochre-700" },
  missing: { label: "No manager", cls: "bg-rust-500/15 text-rust-500" },
  top: { label: "Reports to Chairman", cls: "bg-ink/10 text-ink/70" },
};

const avatarPerson = (p) => {
  const [first_name, ...rest] = (p?.name || "").split(" ");
  return { first_name, last_name: rest.join(" "), avatar_url: p?.avatar_url };
};

const subline = (p) => [p.designation, p.department, p.location].filter(Boolean).join(" · ");

// Searchable manager dropdown. The list is position:fixed so it isn't clipped
// by the table's horizontal scroll container.
function ManagerPicker({ value, managersById, managers, excludeId, onChange, placeholder = "Choose manager…", compact }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const listRef = useRef(null);

  const current = value ? managersById.get(value) : null;
  const options = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = managers.filter((m) => m.is_active && m.id !== excludeId && words.every((w) =>
      `${m.name} ${m.employee_code} ${m.designation || ""} ${m.department || ""} ${m.location || ""}`.toLowerCase().includes(w)));
    return [{ id: null }, ...list.slice(0, 60)];
  }, [q, managers, excludeId]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = Math.max(r.width, 320);
    const below = window.innerHeight - r.bottom;
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPos(below < 340 && r.top > below
      ? { left, width, bottom: window.innerHeight - r.top + 4 }
      : { left, width, top: r.bottom + 4 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onScroll = (e) => { if (!popRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  useEffect(() => { setHi(q ? 1 : 0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi]);

  const pick = (id) => { onChange(id); setOpen(false); setQ(""); btnRef.current?.focus(); };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(options.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (options[hi]) pick(options[hi].id); }
    else if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); }
  };

  return (
    <>
      <button
        ref={btnRef} type="button" onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 text-left rounded-sm border bg-manila/40 hover:border-jade-500 focus:outline-none focus:ring-2 focus:ring-jade-500 transition-colors ${open ? "border-jade-500" : "border-ink/15"} ${compact ? "px-2 py-1.5" : "px-2.5 py-2"}`}
      >
        {current ? (
          <>
            <PersonAvatar person={avatarPerson(current)} className="w-6 h-6" />
            <span className="min-w-0 flex-1">
              <span className={`block text-sm truncate ${current.is_active ? "text-ink" : "text-ink/50 line-through"}`}>{current.name}</span>
              {!compact && <span className="block text-[11px] text-ink/55 truncate">{current.designation || current.employee_code}</span>}
            </span>
          </>
        ) : (
          <span className="flex-1 text-sm text-ink/45">{placeholder}</span>
        )}
        <ChevronDown size={14} className="text-ink/50 flex-shrink-0" />
      </button>
      {open && pos && (
        <div
          ref={popRef} style={{ position: "fixed", ...pos, zIndex: 60 }}
          className="bg-paper rounded-sm shadow-stamp border border-ink/10 overflow-hidden"
        >
          <div className="relative border-b border-ink/10">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/50" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
              placeholder="Search name, code, designation, department…"
              className="w-full bg-transparent pl-8 pr-3 py-2.5 text-sm text-ink focus:outline-none"
            />
          </div>
          <ul ref={listRef} className="max-h-72 overflow-y-auto py-1" role="listbox">
            {options.map((m, idx) => (
              <li
                key={m.id || "none"} data-idx={idx} role="option" aria-selected={m.id === value}
                onMouseEnter={() => setHi(idx)} onMouseDown={(e) => { e.preventDefault(); pick(m.id); }}
                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer ${idx === hi ? "bg-jade-500/10" : ""}`}
              >
                {m.id ? (
                  <>
                    <PersonAvatar person={avatarPerson(m)} className="w-7 h-7" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-ink truncate">
                        {m.name} <span className="text-ink/45 text-xs font-nums">{m.employee_code}</span>
                      </span>
                      <span className="block text-[11px] text-ink/55 truncate">{subline(m) || "—"}</span>
                    </span>
                    {!m.email && <MailWarning size={13} className="text-ochre-600 flex-shrink-0" title="No email on file" />}
                  </>
                ) : (
                  <span className="flex items-center gap-2 text-sm text-ink/60"><UserX size={14} /> No reporting manager</span>
                )}
                {m.id === value && <Check size={14} className="text-jade-600 flex-shrink-0" />}
              </li>
            ))}
            {options.length === 1 && q && <li className="px-3 py-3 text-sm text-ink/50">Nobody matches “{q}”.</li>}
          </ul>
        </div>
      )}
    </>
  );
}

function FilterCard({ label, value, sub, active, onClick, accent, icon: Icon }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`text-left bg-paper rounded-sm shadow-card px-4 py-3 border-t-2 transition-colors ${active ? "border-jade-500 ring-1 ring-jade-500/40" : "border-ink/10 hover:border-ink/30"}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70 flex items-center gap-1.5">
        {Icon && <Icon size={12} />} {label}
      </p>
      <p className={`font-display text-2xl leading-tight mt-1 font-nums ${accent || "text-ink"}`}>{value}</p>
      {sub && <p className="text-[11px] text-ink/60 mt-0.5">{sub}</p>}
    </button>
  );
}

export default function ReportingManagers() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [edits, setEdits] = useState(() => new Map());
  const [selected, setSelected] = useState(() => new Set());
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [location, setLocation] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [view, setView] = useState("people");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { data } = await api.get("/api/employees/reporting-managers");
      setData(data);
    } catch (err) {
      setLoadError(err.response?.data?.detail || "Couldn't load reporting managers");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Don't lose unsaved assignments to an accidental tab close.
  useEffect(() => {
    if (!edits.size) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [edits.size]);

  const managers = data?.managers || [];
  const managersById = useMemo(() => new Map(managers.map((m) => [m.id, m])), [managers]);

  // Rows with unsaved edits applied.
  const rows = useMemo(() => (data?.rows || []).map((r) => {
    if (!edits.has(r.id)) return { ...r, effective: r.manager_id, effStatus: r.status, changed: false };
    const m = edits.get(r.id);
    return { ...r, effective: m, effStatus: m ? "assigned" : "missing", changed: true };
  }), [data, edits]);

  const counts = useMemo(() => {
    const c = { all: rows.length, assigned: 0, suggested: 0, ambiguous: 0, missing: 0, top: 0 };
    rows.forEach((r) => { c[r.effStatus] += 1; });
    return c;
  }, [rows]);

  const teamSize = useMemo(() => {
    const t = new Map();
    rows.forEach((r) => { if (r.effective) t.set(r.effective, (t.get(r.effective) || 0) + 1); });
    return t;
  }, [rows]);

  const departments = useMemo(() => [...new Set(rows.map((r) => r.department).filter(Boolean))].sort(), [rows]);
  const locations = useMemo(() => [...new Set(rows.map((r) => r.location).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (status === "changed" ? !r.changed : status && r.effStatus !== status) return false;
      if (dept && r.department !== dept) return false;
      if (location && r.location !== location) return false;
      if (managerFilter && r.effective !== managerFilter) return false;
      if (!words.length) return true;
      const mgr = r.effective ? managersById.get(r.effective)?.name || "" : "";
      const hay = `${r.name} ${r.employee_code} ${r.designation || ""} ${r.department || ""} ${mgr} ${r.reporting_to_text || ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    }).sort((a, b) => {
      // Rows that need attention first, then alphabetical.
      const rank = { ambiguous: 0, suggested: 1, missing: 2, top: 3, assigned: 4 };
      return (rank[a.status] - rank[b.status]) || a.name.localeCompare(b.name);
    });
  }, [rows, status, dept, location, managerFilter, q, managersById]);

  const setManager = (row, managerId) => {
    setNotice(null);
    setEdits((prev) => {
      const next = new Map(prev);
      if ((managerId || null) === (row.manager_id || null)) next.delete(row.id);
      else next.set(row.id, managerId || null);
      return next;
    });
  };
  const undo = (id) => setEdits((prev) => { const next = new Map(prev); next.delete(id); return next; });

  const suggestedRows = rows.filter((r) => r.status === "suggested" && !r.changed);
  const acceptAllSuggestions = () => {
    setNotice(null);
    setEdits((prev) => {
      const next = new Map(prev);
      suggestedRows.forEach((r) => next.set(r.id, r.candidate_ids[0]));
      return next;
    });
  };

  const applyToSelected = (managerId) => {
    const byId = new Map(rows.map((r) => [r.id, r]));
    [...selected].forEach((id) => { const r = byId.get(id); if (r && r.id !== managerId) setManager(r, managerId); });
    setSelected(new Set());
  };

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allVisibleSelected) filtered.forEach((r) => next.delete(r.id));
    else filtered.forEach((r) => next.add(r.id));
    return next;
  });
  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const changes = [...edits].map(([employee_id, manager_id]) => ({ employee_id, manager_id }));
      const { data: res } = await api.post("/api/employees/reporting-managers", { changes });
      setEdits(new Map());
      setNotice({
        kind: "ok",
        text: `Saved ${res.updated} reporting manager change${res.updated === 1 ? "" : "s"}.`,
        warn: res.no_manager_email.length
          ? `No email on file for ${res.no_manager_email.join(", ")}: approvals and My Team work, but the late-coming digest can't reach them until an email is added.`
          : "",
      });
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: err.response?.data?.detail || "Couldn't save. Nothing was changed, so try again." });
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => { setStatus(""); setQ(""); setDept(""); setLocation(""); setManagerFilter(""); };
  const filterManager = managerFilter ? managersById.get(managerFilter) : null;

  // Manager overview: everyone who has at least one report, biggest teams first.
  const teams = useMemo(() => {
    const byMgr = new Map();
    rows.forEach((r) => {
      if (!r.effective) return;
      if (dept && r.department !== dept) return;
      if (location && r.location !== location) return;
      (byMgr.get(r.effective) || byMgr.set(r.effective, []).get(r.effective)).push(r);
    });
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return [...byMgr].map(([id, members]) => ({ manager: managersById.get(id), members }))
      .filter((t) => t.manager && words.every((w) =>
        `${t.manager.name} ${t.manager.designation || ""} ${t.manager.department || ""}`.toLowerCase().includes(w)))
      .sort((a, b) => b.members.length - a.members.length || a.manager.name.localeCompare(b.manager.name));
  }, [rows, managersById, dept, location, q]);

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink flex items-center gap-2"><GitBranch size={22} /> Reporting Managers</h2>
          <p className="text-sm text-ink/60 max-w-2xl">
            Who each person reports to. This drives leave and WFH approvals, each manager's My Team view, the late-coming
            digest email and the <Link to="/admin/org-chart" className="underline">Org Chart</Link>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-sm border border-ink/15 overflow-hidden text-sm">
            {[["people", "By employee"], ["teams", "By manager"]].map(([v, l]) => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-2 ${view === v ? "bg-jade-500 text-white" : "bg-manila/40 text-ink"}`}>{l}</button>
            ))}
          </div>
          <button onClick={() => setShowImport(true)} className={`${selectCls} flex items-center gap-1.5`}>
            <Upload size={14} /> CSV import
          </button>
          <button onClick={load} className={`${selectCls} flex items-center gap-1`} title="Refresh">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {loadError && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{loadError}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <FilterCard icon={Users} label="Everyone" value={counts.all} sub="active employees" active={!status} onClick={() => setStatus("")} />
        <FilterCard icon={Check} label="Assigned" value={counts.assigned} accent="text-jade-700"
          sub={counts.all ? `${Math.round((100 * (counts.assigned + counts.top)) / counts.all)}% covered` : ""}
          active={status === "assigned"} onClick={() => setStatus(status === "assigned" ? "" : "assigned")} />
        <FilterCard icon={Sparkles} label="Suggested" value={counts.suggested} sub="name on file matches one person"
          active={status === "suggested"} onClick={() => setStatus(status === "suggested" ? "" : "suggested")} />
        <FilterCard icon={AlertTriangle} label="Needs review" value={counts.ambiguous} accent="text-ochre-700" sub="more than one possible match"
          active={status === "ambiguous"} onClick={() => setStatus(status === "ambiguous" ? "" : "ambiguous")} />
        <FilterCard icon={UserX} label="No manager" value={counts.missing} accent="text-rust-500" sub="nothing usable on file"
          active={status === "missing"} onClick={() => setStatus(status === "missing" ? "" : "missing")} />
      </div>

      {suggestedRows.length > 0 && view === "people" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-jade-500/30 bg-jade-500/[0.06] px-4 py-3">
          <p className="text-sm text-ink">
            <Sparkles size={14} className="inline -mt-0.5 mr-1 text-jade-600" />
            <b>{suggestedRows.length}</b> people have a manager name on file that matches exactly one active employee.
            Accept them all, check the list, then save.
          </p>
          <button onClick={acceptAllSuggestions} className="bg-jade-600 text-white px-3.5 py-2 rounded-sm text-sm font-semibold hover:bg-jade-700 transition-colors">
            Accept all {suggestedRows.length} suggestions
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-2">
        <div className="relative lg:max-w-xs flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/60" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={view === "people" ? "Search employee, code, manager…" : "Search manager…"}
            className={`${selectCls} w-full pl-9`}
          />
        </div>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className={selectCls}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={location} onChange={(e) => setLocation(e.target.value)} className={selectCls}>
          <option value="">All locations</option>
          {locations.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        {view === "people" && edits.size > 0 && (
          <button onClick={() => setStatus(status === "changed" ? "" : "changed")}
            className={`${selectCls} ${status === "changed" ? "bg-jade-500 text-white" : ""}`}>
            Unsaved only ({edits.size})
          </button>
        )}
        {filterManager && view === "people" && (
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-ledger-800 text-manila px-3 py-2 text-sm">
            Team of {filterManager.name}
            <button onClick={() => setManagerFilter("")} aria-label="Clear manager filter"><X size={14} /></button>
          </span>
        )}
        {(status || q || dept || location || managerFilter) && (
          <button onClick={clearFilters} className="text-sm text-ink/60 hover:text-ink underline px-1">Clear filters</button>
        )}
      </div>

      {notice && (
        <div className={`rounded-sm px-4 py-3 text-sm border ${notice.kind === "ok" ? "border-jade-500/30 bg-jade-500/[0.06] text-ink" : "border-rust-500/40 bg-rust-500/10 text-rust-500"}`}>
          <p>{notice.text}</p>
          {notice.warn && <p className="text-ochre-700 mt-1 flex items-start gap-1.5"><MailWarning size={14} className="mt-0.5 flex-shrink-0" /> {notice.warn}</p>}
        </div>
      )}

      {view === "people" ? (
        <div className="bg-paper rounded-sm shadow-card overflow-x-auto">
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-ink/10 bg-manila/50">
              <span className="text-sm text-ink font-semibold">{selected.size} selected</span>
              <span className="text-sm text-ink/60">Set their manager to</span>
              <div className="w-72">
                <ManagerPicker value={null} managers={managers} managersById={managersById} onChange={applyToSelected} compact placeholder="Pick a manager…" />
              </div>
              <button onClick={() => setSelected(new Set())} className="text-sm text-ink/60 hover:text-ink underline">Deselect</button>
            </div>
          )}
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/50 border-b border-ink/10">
                <th className="py-2.5 pl-4 pr-2 w-8">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all shown" className="accent-jade-600" />
                </th>
                <th className="pr-4">Employee</th>
                <th className="pr-4">Department · Location</th>
                <th className="pr-4 w-[300px]">Reporting manager</th>
                <th className="pr-4">Status</th>
                <th className="pr-4 w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const meta = STATUS_META[r.effStatus];
                const mgr = r.effective ? managersById.get(r.effective) : null;
                const showCandidates = !r.changed && (r.status === "suggested" || r.status === "ambiguous");
                return (
                  <tr key={r.id} className={`border-b border-ink/[0.06] last:border-0 align-top ${r.changed ? "bg-jade-500/[0.05]" : selected.has(r.id) ? "bg-manila/40" : ""}`}>
                    <td className="py-3 pl-4 pr-2">
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} aria-label={`Select ${r.name}`} className="accent-jade-600 mt-2" />
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2.5">
                        <PersonAvatar person={avatarPerson(r)} className="w-8 h-8" />
                        <div className="min-w-0">
                          <Link to={`/admin/employees/${r.id}`} className="font-medium text-ink hover:underline">{r.name}</Link>
                          <p className="text-[11px] text-ink/55">
                            <span className="font-nums">{r.employee_code}</span>{r.designation ? ` · ${r.designation}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-ink/70">
                      <p>{r.department || "—"}</p>
                      <p className="text-[11px] text-ink/50">{r.location || ""}</p>
                    </td>
                    <td className="py-2.5 pr-4">
                      <ManagerPicker
                        value={r.effective} managers={managers} managersById={managersById} excludeId={r.id}
                        onChange={(id) => setManager(r, id)}
                        placeholder={r.status === "top" ? "Chairman (no record needed)" : "Choose manager…"}
                      />
                      {mgr && !mgr.email && (
                        <p className="text-[11px] text-ochre-700 mt-1 flex items-center gap-1"><MailWarning size={11} /> No email on file, so the late digest can't reach them</p>
                      )}
                      {mgr && !mgr.is_active && (
                        <p className="text-[11px] text-rust-500 mt-1">This manager has left. Pick who they report to now.</p>
                      )}
                      {showCandidates && (
                        <div className="mt-1.5">
                          <p className="text-[11px] text-ink/55 mb-1">On file: “{r.reporting_to_text}”</p>
                          <div className="flex flex-wrap gap-1">
                            {r.candidate_ids.map((cid) => {
                              const c = managersById.get(cid);
                              if (!c) return null;
                              return (
                                <button
                                  key={cid} onClick={() => setManager(r, cid)} title={subline(c)}
                                  className="inline-flex items-center gap-1 rounded-sm border border-jade-500/40 bg-jade-500/[0.06] px-2 py-0.5 text-xs text-left text-jade-700 hover:bg-jade-500/15"
                                >
                                  <Check size={11} /> {r.status === "suggested" ? "Use " : ""}{c.name}{c.department ? ` (${c.department})` : ""}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {!r.changed && r.status === "missing" && r.reporting_to_text && (
                        <p className="text-[11px] text-ink/55 mt-1">On file: “{r.reporting_to_text}”, which matches nobody active</p>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${meta.cls}`}>
                        {r.effStatus === "top" && <Crown size={10} className="inline -mt-0.5 mr-1" />}{meta.label}
                      </span>
                      {r.changed && <p className="text-[11px] text-jade-700 mt-1">Unsaved</p>}
                    </td>
                    <td className="py-3 pr-4">
                      {r.changed && (
                        <button onClick={() => undo(r.id)} title="Undo this change" className="text-ink/50 hover:text-ink"><Undo2 size={15} /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length && (
            <p className="text-sm text-ink/60 px-4 py-8 text-center">
              {loading ? "Loading…" : "Nobody matches these filters."}
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map(({ manager: m, members }) => (
            <div key={m.id} className="bg-paper rounded-sm shadow-card p-4">
              <div className="flex items-start gap-3">
                <PersonAvatar person={avatarPerson(m)} className="w-10 h-10" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink truncate">{m.name}</p>
                  <p className="text-[11px] text-ink/55 truncate">{subline(m) || m.employee_code}</p>
                  {!m.email && <p className="text-[11px] text-ochre-700 mt-0.5 flex items-center gap-1"><MailWarning size={11} /> No email on file</p>}
                  {!m.is_active && <p className="text-[11px] text-rust-500 mt-0.5">Has left: reassign this team</p>}
                </div>
                <span className="font-display text-xl text-ink font-nums">{members.length}</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-3">
                {members.slice(0, 12).map((r) => (
                  <span key={r.id} title={subline(r)}
                    className={`rounded-full px-2 py-0.5 text-xs ${r.changed ? "bg-jade-500/15 text-jade-700" : "bg-manila/60 text-ink/80"}`}>
                    {r.name}
                  </span>
                ))}
                {members.length > 12 && <span className="text-xs text-ink/50 px-1 py-0.5">+{members.length - 12} more</span>}
              </div>
              <button
                onClick={() => { setManagerFilter(m.id); setStatus(""); setQ(""); setView("people"); }}
                className="mt-3 text-sm text-jade-700 hover:underline"
              >
                Edit this team →
              </button>
            </div>
          ))}
          {!teams.length && <p className="text-sm text-ink/60">{loading ? "Loading…" : "No managers match."}</p>}
        </div>
      )}

      {edits.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-xl">
          <div className="flex items-center justify-between gap-3 bg-ledger-800 text-manila rounded-sm shadow-stamp px-4 py-3">
            <span className="text-sm"><b>{edits.size}</b> unsaved change{edits.size === 1 ? "" : "s"}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => { setEdits(new Map()); setNotice(null); }} disabled={saving} className="text-sm text-manila/80 hover:text-manila px-2">
                Discard
              </button>
              <button onClick={save} disabled={saving} className="bg-jade-500 text-white px-4 py-2 rounded-sm text-sm font-semibold hover:bg-jade-600 disabled:opacity-60 transition-colors">
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ReportingManagerImportModal
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); load(); }}
        />
      )}
    </div>
  );
}
