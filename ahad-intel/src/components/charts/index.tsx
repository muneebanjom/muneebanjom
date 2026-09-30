'use client';

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatUsd } from '@/lib/utils';

/**
 * Chart kit.
 *
 * Colours come from the validated categorical palette in globals.css
 * (`--series-1…6`), assigned in fixed order and never cycled. Every chart ships
 * a hover tooltip and direct value labels, which is also the relief the palette
 * validator requires for the lower-contrast slots.
 */
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)'];

export interface Point { key: string; label: string; value: number; secondary?: number }

const axisProps = {
  stroke: 'var(--viz-grid)',
  tick: { fill: 'var(--viz-text-muted)', fontSize: 11 },
  tickLine: false,
} as const;

function TooltipBox({
  active, payload, label, suffix,
}: { active?: boolean; payload?: Array<{ name?: string; value?: number | string; color?: string }>; label?: string; suffix?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-pop">
      <p className="text-xs font-medium text-ink">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: entry.color }} />
          {entry.name ? `${entry.name}: ` : ''}
          <span className="font-semibold tabular-nums text-ink">{entry.value}{suffix ?? ''}</span>
        </p>
      ))}
    </div>
  );
}

export function BarSeries({
  data, suffix, height = 240, horizontal = false, colorIndex = 0,
}: { data: Point[]; suffix?: string; height?: number; horizontal?: boolean; colorIndex?: number }) {
  if (data.length === 0) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 16, bottom: 4, left: horizontal ? 8 : 0 }}>
        <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="2 4" vertical={!horizontal} horizontal={horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" {...axisProps} axisLine={false} />
            <YAxis type="category" dataKey="label" width={140} {...axisProps} axisLine={false} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" interval={0} angle={data.length > 6 ? -25 : 0} textAnchor={data.length > 6 ? 'end' : 'middle'} height={data.length > 6 ? 60 : 30} {...axisProps} axisLine={false} />
            <YAxis {...axisProps} axisLine={false} width={36} />
          </>
        )}
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.35 }} content={<TooltipBox suffix={suffix} />} />
        <Bar dataKey="value" name="Value" radius={[4, 4, 0, 0]} fill={SERIES[colorIndex % SERIES.length]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DistributionChart({ data, colorIndex = 0 }: { data: Point[]; colorIndex?: number }) {
  if (data.length === 0) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="label" {...axisProps} axisLine={false} />
        <YAxis {...axisProps} axisLine={false} width={32} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.35 }} content={<TooltipBox />} />
        <Bar dataKey="value" name="Leads" radius={[4, 4, 0, 0]} maxBarSize={56}>
          {data.map((_, i) => <Cell key={i} fill={SERIES[colorIndex % SERIES.length]} fillOpacity={0.45 + i * 0.12} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendChart({ data, height = 200 }: { data: Point[]; height?: number }) {
  if (data.length === 0) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.28} />
            <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="label" {...axisProps} axisLine={false} />
        <YAxis {...axisProps} axisLine={false} width={32} />
        <Tooltip content={<TooltipBox />} />
        <Area type="monotone" dataKey="value" name="Recommendations" stroke={SERIES[0]} strokeWidth={2} fill="url(#trendFill)" dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ConversionChart({ data }: { data: Point[] }) {
  if (data.length === 0) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 8 }}>
        <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="2 4" horizontal={false} />
        <XAxis type="number" unit="%" {...axisProps} axisLine={false} />
        <YAxis type="category" dataKey="label" width={150} {...axisProps} axisLine={false} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.35 }} content={<TooltipBox suffix="%" />} />
        <Bar dataKey="value" name="Engaged" radius={[0, 4, 4, 0]} fill={SERIES[2]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FunnelChart({ data }: { data: Array<{ label: string; count: number; conversion: number }> }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <ol className="space-y-2">
      {data.map((step, i) => (
        <li key={step.label} className="flex items-center gap-3">
          <span className="w-32 shrink-0 text-xs text-muted">{step.label}</span>
          <div className="h-6 flex-1 overflow-hidden rounded-lg bg-surface2">
            <div
              className="flex h-full items-center justify-end rounded-lg px-2"
              style={{ width: `${Math.max(3, (step.count / max) * 100)}%`, background: SERIES[i % SERIES.length], opacity: 0.85 }}
            >
              <span className="text-[11px] font-semibold tabular-nums text-white drop-shadow">{step.count}</span>
            </div>
          </div>
          <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{i === 0 ? '—' : `${step.conversion}%`}</span>
        </li>
      ))}
    </ol>
  );
}

export function RevenueChart({ data }: { data: Point[] }) {
  if (data.length === 0) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 8 }}>
        <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="2 4" horizontal={false} />
        <XAxis type="number" tickFormatter={(v: number) => formatUsd(v)} {...axisProps} axisLine={false} />
        <YAxis type="category" dataKey="label" width={190} {...axisProps} axisLine={false} />
        <Tooltip
          cursor={{ fill: 'var(--viz-grid)', opacity: 0.35 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-pop">
                <p className="text-xs font-medium text-ink">{label}</p>
                <p className="mt-0.5 text-xs font-semibold text-ink">{formatUsd(Number(payload[0].value))}</p>
              </div>
            ) : null}
        />
        <Bar dataKey="value" name="Pipeline" radius={[0, 4, 4, 0]} fill={SERIES[1]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DualTrend({
  data, seriesA, seriesB,
}: { data: Array<{ label: string; a: number; b: number }>; seriesA: string; seriesB: string }) {
  if (data.length === 0) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="label" {...axisProps} axisLine={false} />
        <YAxis {...axisProps} axisLine={false} width={32} />
        <Tooltip content={<TooltipBox />} />
        <Legend wrapperStyle={{ fontSize: 11, color: 'var(--viz-text-muted)' }} />
        <Line type="monotone" dataKey="a" name={seriesA} stroke={SERIES[0]} strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="b" name={seriesB} stroke={SERIES[1]} strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Accessible fallback: every chart can be read as a table. */
export function DataTable({ data, valueLabel, suffix }: { data: Point[]; valueLabel: string; suffix?: string }) {
  if (data.length === 0) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-muted hover:text-ink">View as table</summary>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th className="py-1.5 font-medium">Label</th>
            <th className="py-1.5 text-right font-medium">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key} className="border-b border-line/60 last:border-0">
              <td className="py-1.5 text-ink">{d.label}</td>
              <td className="py-1.5 text-right tabular-nums text-ink">{d.value}{suffix ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function ChartEmpty() {
  return (
    <div className="flex h-[180px] items-center justify-center rounded-xl border border-dashed border-line text-xs text-muted">
      Not enough data yet
    </div>
  );
}
