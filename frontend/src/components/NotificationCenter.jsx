import { Bell, CheckCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  NOTIFICATION_TYPES, SEEN_EVENT, TONES, countLabel, itemTime, itemWho, markAllSeen, readSeenAt,
} from "../lib/notifications.js";

// Bell + dropdown + pop-up toasts for the whole admin console (rendered by
// AdminLayout). `pending` is { leave: [...], disputes: [...], ... } from
// AdminLayout's 25-second poll. "New" = arrived after the shared seen-at
// marker that the Dashboard's dismiss button also writes.

const TOAST_MS = 9000;
const BASE_TITLE = typeof document !== "undefined" ? document.title.replace(/^\(\d+\)\s*/, "") : "JADE HR";

function Toast({ toast, onClose, onOpen }) {
  const t = NOTIFICATION_TYPES.find((x) => x.key === toast.type);
  const tone = TONES[t?.tone || "jade"];
  const Icon = t?.icon || Bell;
  // Ref, not a dependency: the parent re-renders on every 25 s poll and a
  // fresh onClose would otherwise restart the timer forever.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return undefined;
    const id = setTimeout(() => closeRef.current(), TOAST_MS);
    return () => clearTimeout(id);
  }, [paused]);
  return (
    <div role="status" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className="toast-in pointer-events-auto w-[340px] max-w-[calc(100vw-2rem)] bg-paper rounded-sm shadow-stamp border border-ink/10 overflow-hidden flex">
      <span className={`w-1 flex-shrink-0 ${tone.bar}`} />
      <button type="button" onClick={onOpen} className="flex-1 flex items-start gap-3 p-3.5 text-left hover:bg-manila/40 transition-colors">
        <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${tone.chip}`}><Icon size={15} /></span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{toast.title}</span>
          <span className="block text-xs text-ink/65 mt-0.5">{toast.body}</span>
          <span className={`block text-xs font-semibold mt-1.5 ${tone.text}`}>{t?.cta} →</span>
        </span>
      </button>
      <button type="button" onClick={onClose} aria-label="Dismiss notification" className="px-2 text-ink/40 hover:text-ink self-start pt-3"><X size={14} /></button>
    </div>
  );
}

function useGroups(pending) {
  const [seenAt, setSeenAt] = useState(readSeenAt);
  useEffect(() => {
    const onSeen = (e) => setSeenAt(e.detail || readSeenAt());
    window.addEventListener(SEEN_EVENT, onSeen);
    return () => window.removeEventListener(SEEN_EVENT, onSeen);
  }, []);
  const groups = useMemo(() => NOTIFICATION_TYPES
    .map((t) => {
      const items = pending[t.key] || [];
      return { ...t, items, fresh: items.filter((i) => itemTime(i) > seenAt) };
    })
    .filter((g) => g.items.length > 0), [pending, seenAt]);
  return {
    groups,
    totalPending: groups.reduce((n, g) => n + g.items.length, 0),
    totalFresh: groups.reduce((n, g) => n + g.fresh.length, 0),
  };
}

// Mounted ONCE (AdminLayout root): pop-up toasts + the tab-title counter.
export function NotificationToasts({ pending, loaded }) {
  const navigate = useNavigate();
  const { groups, totalFresh } = useGroups(pending);
  const [toasts, setToasts] = useState([]);
  const knownIds = useRef(null);

  // Browser tab title carries the count, so it's visible from other tabs.
  useEffect(() => {
    document.title = totalFresh > 0 ? `(${totalFresh}) ${BASE_TITLE}` : BASE_TITLE;
  }, [totalFresh]);
  useEffect(() => () => { document.title = BASE_TITLE; }, []);

  // Pop-ups: on the first poll, one summary toast per type with unseen
  // items; afterwards, a toast for every item that wasn't there last poll.
  useEffect(() => {
    if (!loaded) return;
    const current = {};
    for (const t of NOTIFICATION_TYPES) current[t.key] = new Set((pending[t.key] || []).map((i) => i.id));
    const next = [];
    if (knownIds.current === null) {
      for (const g of groups) {
        if (g.fresh.length) {
          next.push({ id: `${g.key}-initial`, type: g.key, title: `${countLabel(g, g.fresh.length)} waiting`, body: "Arrived since you last checked." });
        }
      }
    } else {
      for (const t of NOTIFICATION_TYPES) {
        const added = (pending[t.key] || []).filter((i) => !knownIds.current[t.key]?.has(i.id));
        if (added.length === 1) {
          const who = itemWho(added[0]);
          next.push({ id: `${t.key}-${added[0].id}`, type: t.key, title: `New ${t.singular}`, body: who ? `From ${who}` : "Just arrived." });
        } else if (added.length > 1) {
          next.push({ id: `${t.key}-${Date.now()}`, type: t.key, title: `${countLabel(t, added.length)} just arrived`, body: "Waiting for review." });
        }
      }
    }
    knownIds.current = current;
    if (next.length) setToasts((ts) => [...ts, ...next].slice(-4));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, loaded]);

  const closeToast = (id) => setToasts((ts) => ts.filter((t) => t.id !== id));
  if (!toasts.length) return null;
  return (
    <div className="fixed z-[60] bottom-4 right-4 left-4 sm:left-auto flex flex-col items-end gap-2.5 pointer-events-none" aria-live="polite">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          toast={t}
          onClose={() => closeToast(t.id)}
          onOpen={() => { closeToast(t.id); navigate(NOTIFICATION_TYPES.find((x) => x.key === t.type)?.to || "/admin"); }}
        />
      ))}
    </div>
  );
}

// The bell + "Waiting for you" dropdown. Rendered in the desktop top bar and
// the mobile header.
export default function NotificationBell({ pending, variant = "desktop" }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const { groups, totalPending, totalFresh } = useGroups(pending);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const go = (to) => { setOpen(false); navigate(to); };

  const onDark = variant === "mobile" || variant === "sidebar";

  return (
    <div ref={panelRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={`Notifications${totalFresh ? `, ${totalFresh} new` : ""}`}
          aria-expanded={open}
          className={`relative flex items-center justify-center w-9 h-9 rounded-full transition-colors ${onDark
            ? (totalFresh ? "bg-ochre-400 text-ledger-900 hover:bg-ochre-500" : "text-manila/75 hover:text-manila hover:bg-manila/10")
            : (totalFresh ? "bg-ledger-800 text-manila" : "bg-paper text-ink/70 hover:text-ink border border-ink/10")}`}
        >
          <Bell size={18} className={totalFresh ? "bell-ring" : ""} />
          {totalPending > 0 && (
            <span className={`absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 rounded-full text-[10.5px] font-bold font-nums flex items-center justify-center ring-2 ${onDark ? "ring-ledger-800" : "ring-manila"} ${totalFresh ? "bg-rust-500 text-white" : "bg-ink/40 text-white"}`}>
              {totalPending > 99 ? "99+" : totalPending}
            </span>
          )}
        </button>

        {open && (
          <div className={`absolute z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] bg-paper rounded-sm shadow-stamp border border-ink/10 ${variant === "sidebar" ? "left-0" : "right-0"}`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-ink/10">
              <p className="font-display text-base text-ink">Waiting for you</p>
              {totalFresh > 0 && (
                <button type="button" onClick={() => markAllSeen()} className="flex items-center gap-1 text-xs font-semibold text-jade-700 hover:underline">
                  <CheckCheck size={13} /> Mark all seen
                </button>
              )}
            </div>
            {groups.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink/60 text-center">You're all caught up.</p>
            ) : (
              <ul className="max-h-[60vh] overflow-y-auto divide-y divide-ink/[0.07]">
                {groups.map((g) => {
                  const tone = TONES[g.tone];
                  const Icon = g.icon;
                  return (
                    <li key={g.key}>
                      <button type="button" onClick={() => go(g.to)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-manila/40 transition-colors">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${tone.chip}`}><Icon size={15} /></span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-ink font-medium">{countLabel(g, g.items.length)} pending</span>
                          <span className="block text-xs text-ink/55">
                            {g.fresh.length ? `${g.fresh.length} new since you last checked` : "None new"}
                          </span>
                        </span>
                        {g.fresh.length > 0 && <span className="w-2 h-2 rounded-full bg-rust-500 flex-shrink-0" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
    </div>
  );
}
