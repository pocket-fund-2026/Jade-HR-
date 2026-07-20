import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatHoursMins } from "../lib/format.js";

// OT hours already reads as ochre everywhere else in the app (StatCard
// accents, StampBadge "ot"/"pending") — a trend of the same measure keeps
// that hue, not a new one.
const OCHRE = "#C97C2E";
const SURFACE = "#FAF7F0";
const GRID = "rgba(27, 27, 24, 0.08)";
const AXIS_TEXT = "rgba(27, 27, 24, 0.4)";

function niceMax(max) {
  if (max <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (max <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-paper border border-ink/10 rounded-sm shadow-stamp px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-ink/70">{point.label}</p>
      <p className="font-nums text-ink font-semibold text-base mt-0.5 flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-0.5 bg-ochre-500" />
        {formatHoursMins(point.ot_hours)} OT
      </p>
    </div>
  );
}

export default function OtTrendChart({ data }) {
  const total = data.reduce((sum, d) => sum + d.ot_hours, 0);
  const latest = data[data.length - 1];

  return (
    <div className="bg-paper rounded-sm shadow-card p-6 border-t-4 border-ochre-500 mb-8">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ochre-700">OT Hours</p>
          <p className="text-xs text-ink/70 mt-0.5">Last 6 pay periods</p>
        </div>
        {total > 0 && (
          <p className="font-display text-2xl text-ink leading-none">
            {formatHoursMins(latest.ot_hours)}
            <span className="text-sm text-ink/70 ml-1.5 font-sans">this period</span>
          </p>
        )}
      </div>

      {total === 0 ? (
        <p className="text-sm text-ink/65 mt-6">Not enough history yet — this fills in as pay periods close.</p>
      ) : (
        <div className="h-[180px] mt-4 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: AXIS_TEXT, fontSize: 11 }} dy={8} />
              <YAxis
                domain={[0, niceMax(Math.max(...data.map((d) => d.ot_hours)))]}
                ticks={[0, niceMax(Math.max(...data.map((d) => d.ot_hours))) / 2, niceMax(Math.max(...data.map((d) => d.ot_hours)))]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                width={32}
              />
              <Tooltip content={<TrendTooltip />} cursor={{ stroke: "rgba(27,27,24,0.2)", strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="ot_hours"
                stroke={OCHRE}
                strokeWidth={2}
                fill={OCHRE}
                fillOpacity={0.1}
                dot={{ r: 4, fill: OCHRE, stroke: SURFACE, strokeWidth: 2 }}
                activeDot={{ r: 6, fill: OCHRE, stroke: SURFACE, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
