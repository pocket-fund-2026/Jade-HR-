import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import CareersNav from "../../components/CareersNav.jsx";
import StatCard from "../../components/StatCard.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { formatDateTime, utcToDate } from "../../lib/careers.js";

const JADE = "#2F7A5E";
const RUST = "#C05A3F";
const GRID = "rgba(27, 27, 24, 0.08)";
const AXIS_TEXT = "rgba(27, 27, 24, 0.45)";
const PERIODS = [
  { key: 30, label: "30 days" },
  { key: 90, label: "90 days" },
  { key: 0, label: "All time" },
];

function Card({ title, sub, children, className = "" }) {
  return (
    <div className={`bg-paper rounded-sm shadow-card p-6 ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/60">{title}</p>
      {sub && <p className="text-xs text-ink/55 mt-0.5">{sub}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function WeekTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-paper border border-ink/10 rounded-sm shadow-stamp px-3 py-2 text-xs">
      <p className="uppercase tracking-wider text-ink/60">Week of {p.label}</p>
      <p className="font-nums text-ink mt-1">{p.kept} kept · {p.auto_rejected} auto-rejected</p>
    </div>
  );
}

function eventText(e) {
  if (e.type === "status") return `${e.from_status || "—"} →`;
  if (e.type === "applied") return "Applied";
  return e.detail || e.type;
}

export default function CareersDashboard() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    api
      .get("/api/careers/stats", { params: { days } })
      .then(({ data }) => setData(data))
      .catch(() => setError("Could not load hiring stats from the careers service."));
  }, [days]);

  const weekly = (data?.weekly || []).map((w) => ({
    label: new Date(w.week_start).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    kept: w.n - (w.auto_rejected || 0),
    auto_rejected: w.auto_rejected || 0,
  }));
  const funnelMax = Math.max(1, ...(data?.funnel || []).map((f) => f.count));
  const verdicts = data?.byVerdict || {};
  const verdictTotal = Object.values(verdicts).reduce((s, n) => s + n, 0) || 1;

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl text-ink">Careers — Hiring Dashboard</h2>
          <p className="text-xs text-ink/70 mt-0.5">Applications from the JADE Careers site, screened automatically on arrival</p>
        </div>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setDays(p.key)}
              className={`px-3 py-1.5 rounded-sm text-xs font-semibold border ${
                days === p.key ? "bg-ink text-manila border-ink" : "bg-paper border-ink/15 text-ink/70 hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <CareersNav />

      {error && <p className="text-sm text-rust-500 mb-4">{error}</p>}
      {!data ? (
        !error && <p className="text-ink/70 text-sm"><span className="t-shimmer" data-text="Loading…">Loading…</span></p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
            <StatCard label="Applications" value={data.total} />
            <StatCard label="Awaiting review" value={data.awaiting} sub="status New" accent="text-ochre-700" />
            <StatCard label="Strong fits" value={verdicts.shortlist || 0} sub="cleared screening" accent="text-jade-600" />
            <StatCard label="Interviewing" value={data.byStatus.Interviewing || 0} />
            <StatCard label="Offered / Hired" value={(data.byStatus.Offered || 0) + (data.byStatus.Hired || 0)} accent="text-jade-600" />
            <StatCard label="Auto-rejected" value={data.byStatus["Auto-Rejected"] || 0} sub="kept, not notified" accent="text-rust-500" />
          </div>

          <div className="grid lg:grid-cols-2 gap-5 mb-5">
            <Card title="Hiring funnel" sub="Applicants at or past each stage">
              <div className="space-y-2.5">
                {data.funnel.map((f) => (
                  <Link
                    key={f.stage}
                    to={`/admin/careers/applicants?status=${encodeURIComponent(f.stage)}`}
                    className="flex items-center gap-3 group"
                  >
                    <span className="w-40 text-xs text-ink/70 group-hover:text-ink">{f.stage}</span>
                    <span className="flex-1 h-5 bg-manila/60 rounded-sm overflow-hidden">
                      <span className="block h-full bg-jade-500" style={{ width: `${(f.count / funnelMax) * 100}%` }} />
                    </span>
                    <span className="w-10 text-right font-nums text-sm text-ink">{f.count}</span>
                  </Link>
                ))}
              </div>
              {data.avgDaysToOffer != null && (
                <p className="text-xs text-ink/60 mt-4">Average {data.avgDaysToOffer} days from application to offer.</p>
              )}
            </Card>

            <Card title="Applications per week" sub="Last 12 weeks">
              {weekly.length === 0 ? (
                <p className="text-sm text-ink/60">No applications in the last 12 weeks.</p>
              ) : (
                <div className="h-[200px] -ml-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weekly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} />
                      <Tooltip content={<WeekTooltip />} cursor={{ fill: "rgba(27,27,24,0.04)" }} />
                      <Bar dataKey="kept" stackId="a" fill={JADE} />
                      <Bar dataKey="auto_rejected" stackId="a" fill={RUST} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="flex gap-4 text-[11px] text-ink/60 mt-2">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: JADE }} />Kept</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: RUST }} />Auto-rejected</span>
              </div>
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-5 mb-5">
            <Card title="Upcoming interviews">
              {data.upcoming.length === 0 ? (
                <p className="text-sm text-ink/60">Nothing scheduled.</p>
              ) : (
                <ul className="divide-y divide-ink/[0.06]">
                  {data.upcoming.map((i) => (
                    <li key={i.id} className="py-2">
                      <Link to={`/admin/careers/applicants/${i.application_id}`} className="text-sm text-ink font-medium hover:underline">{i.full_name}</Link>
                      <p className="text-xs text-ink/60">{i.round} · {i.job_title}</p>
                      <p className="text-xs font-nums text-ink/70">{formatDateTime(i.scheduled_at)}{i.interviewer ? ` · ${i.interviewer}` : ""}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Feedback pending" sub="Interviews past their time, still marked Scheduled">
              {data.pendingFeedback.length === 0 ? (
                <p className="text-sm text-ink/60">All caught up.</p>
              ) : (
                <ul className="divide-y divide-ink/[0.06]">
                  {data.pendingFeedback.map((i) => (
                    <li key={i.id} className="py-2">
                      <Link to={`/admin/careers/applicants/${i.application_id}`} className="text-sm text-ink font-medium hover:underline">{i.full_name}</Link>
                      <p className="text-xs text-ink/60">{i.round} · {formatDateTime(i.scheduled_at)}{i.interviewer ? ` · ${i.interviewer}` : ""}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Screening outcome">
              <div className="space-y-2.5">
                {[
                  ["shortlist", "Strong fit", "bg-jade-500"],
                  ["review", "Needs review", "bg-ochre-500"],
                  ["reject", "Fails brief", "bg-rust-400"],
                ].map(([key, label, color]) => (
                  <Link key={key} to={`/admin/careers/applicants?verdict=${key}`} className="block group">
                    <div className="flex justify-between text-xs text-ink/70 group-hover:text-ink">
                      <span>{label}</span>
                      <span className="font-nums">{verdicts[key] || 0}</span>
                    </div>
                    <span className="block h-2 bg-manila/60 rounded-sm mt-1 overflow-hidden">
                      <span className={`block h-full ${color}`} style={{ width: `${((verdicts[key] || 0) / verdictTotal) * 100}%` }} />
                    </span>
                  </Link>
                ))}
              </div>
              <p className="text-[11px] text-ink/55 mt-4">
                Designers: institute + portfolio. Retail and fashion consultants: atelier / haute couture experience.{" "}
                <Link to="/admin/careers/screening" className="underline">Edit rules</Link>
              </p>
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-5">
            <Card title="By role" className="lg:col-span-2 !p-0">
              <div className="overflow-x-auto -mt-4">
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-left">
                    <tr className="border-b-2 border-ink/10 text-[11px] uppercase tracking-wider text-ink/60">
                      <th className="px-5 py-2.5 font-semibold">Role</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Total</th>
                      <th className="px-3 py-2.5 font-semibold text-right">New</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Strong fit</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Interviewing</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Offered</th>
                      <th className="px-5 py-2.5 font-semibold text-right">Auto-rej.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.map((j) => (
                      <tr key={j.id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/30">
                        <td className="px-5 py-2.5">
                          <Link to={`/admin/careers/applicants?job_id=${j.id}`} className="text-ink font-medium hover:underline">{j.title}</Link>
                          <span className="block text-[11px] text-ink/55">{j.department}{j.is_active ? "" : " · closed"}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-nums">{j.total}</td>
                        <td className="px-3 py-2.5 text-right font-nums">{j.new_count || 0}</td>
                        <td className="px-3 py-2.5 text-right font-nums text-jade-600">{j.strong || 0}</td>
                        <td className="px-3 py-2.5 text-right font-nums">{j.interviewing || 0}</td>
                        <td className="px-3 py-2.5 text-right font-nums">{j.offered || 0}</td>
                        <td className="px-5 py-2.5 text-right font-nums text-rust-500">{j.auto_rejected || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="space-y-5">
              <Card title="Where applicants come from">
                <ul className="space-y-1.5">
                  {data.sources.map((s) => (
                    <li key={s.source} className="flex justify-between text-sm">
                      <span className="text-ink/80 truncate pr-3">{s.source}</span>
                      <span className="font-nums text-ink/70">{s.n}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="Recent activity">
                {data.recent.length === 0 ? (
                  <p className="text-sm text-ink/60">No activity logged yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.recent.map((e) => (
                      <li key={e.id} className="text-xs">
                        <Link to={`/admin/careers/applicants/${e.application_id}`} className="text-ink font-medium hover:underline">{e.full_name}</Link>{" "}
                        <span className="text-ink/70">{eventText(e)}</span>
                        {e.type === "status" && e.to_status && <> <StampBadge status={e.to_status.toLowerCase()}>{e.to_status}</StampBadge></>}
                        <span className="block text-ink/50 font-nums">{e.actor} · {formatDateTime(utcToDate(e.created_at))}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
