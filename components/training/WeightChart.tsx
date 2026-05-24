'use client'

import { memo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { roundMacro, formatDate } from '@/lib/utils'
import { useTheme } from '@/lib/theme'
import type { WeightLog, WeightUnit } from '@/lib/types'

// Recharts takes hex values for stroke/fill, not CSS variables — its
// SVG attribute pipeline serializes the prop, so `var(--…)` never
// resolves. We pick the right hex up-front based on the active theme.
const CHART_PALETTE = {
  light: {
    grid: '#e2e8f0', /* slate-200 */
    tick: '#94a3b8', /* slate-400 */
    dotFill: '#ffffff',
    goalLabel: '#047857', /* emerald-700 */
  },
  dark: {
    grid: '#334155', /* slate-700 */
    tick: '#64748b', /* slate-500 */
    dotFill: '#0f172a', /* slate-900 — matches surface so the dot reads as "punched out" */
    goalLabel: '#6ee7b7', /* emerald-300 */
  },
} as const

interface WeightChartProps {
  logs: WeightLog[]
  weightUnit?: WeightUnit
  /** Optional body-weight goal. Renders as a dashed horizontal line
   *  across the chart so the trainee can see how close they are. */
  goal?: number | null
  /** Optional program-start anchor. When set, faint dashed vertical
   *  lines mark each weekly boundary inside the visible date range and
   *  a "W1 / W2 …" label sits at the top of each line. */
  programStart?: string | null
}

interface ChartPoint {
  ts: number
  weight: number
  recorded_at: string
}

// Recharts tooltip payload type — keep it loose; library types change across versions.
interface TooltipPayloadEntry {
  payload?: ChartPoint
}

interface TooltipProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  unit: WeightUnit
}

function ChartTooltip({ active, payload, unit }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0]?.payload
  if (!point) return null
  return (
    <div className="bg-slate-900 text-white text-xs font-medium rounded-md px-2.5 py-1.5 shadow-lg whitespace-nowrap tabular-nums">
      <div>
        {roundMacro(point.weight)} <span className="font-normal text-faint">{unit}</span>
      </div>
      <div className="text-[10px] text-faint font-normal">
        {formatDate(point.recorded_at)}
      </div>
    </div>
  )
}

function WeightChartInner({
  logs,
  weightUnit = 'lbs',
  goal,
  programStart,
}: WeightChartProps) {
  const { resolved } = useTheme()
  const palette = CHART_PALETTE[resolved]
  const sorted = [...logs].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  if (sorted.length < 2) return null

  // Use the timestamp as the x value so dates with gaps space proportionally
  // instead of evenly. recharts with `type="number"` + scale="time" handles this.
  const data: ChartPoint[] = sorted.map(l => ({
    ts: new Date(l.recorded_at).getTime(),
    weight: l.weight,
    recorded_at: l.recorded_at,
  }))

  const weights = sorted.map(l => l.weight)
  const minWeight = Math.min(...weights)
  const maxWeight = Math.max(...weights)
  const range = Math.max(maxWeight - minWeight, 1)
  const yMin = Math.floor(minWeight - range * 0.15)
  const yMax = Math.ceil(maxWeight + range * 0.15)

  // Compute weekly boundary timestamps that fall inside the visible
  // date window. Each boundary becomes a faint dashed vertical line
  // labeled "W2", "W3", etc. — W1 is the start itself, which we skip
  // to avoid a label hugging the chart's left edge. Capped at 26 weeks
  // so a year-long timeline doesn't render 52 overlapping lines.
  //
  // `everyN` thins the LABELS (not the lines) once the boundaries
  // would crowd. Phones can fit ~10 readable labels across the chart;
  // beyond that we keep all the lines (visual rhythm) but only label
  // every 2nd / 4th / etc. The lines themselves still mark every week
  // so the eye can still count.
  const weekMarkers: { ts: number; week: number; showLabel: boolean }[] = []
  if (programStart) {
    const startMs = new Date(programStart).getTime()
    const firstMs = data[0].ts
    const lastMs = data[data.length - 1].ts
    if (Number.isFinite(startMs)) {
      const WEEK_MS = 7 * 86400_000
      const candidates: { ts: number; week: number }[] = []
      for (let week = 2; week <= 27; week++) {
        const ts = startMs + (week - 1) * WEEK_MS
        if (ts < firstMs) continue
        if (ts > lastMs) break
        candidates.push({ ts, week })
      }
      const everyN = candidates.length > 16 ? 4 : candidates.length > 8 ? 2 : 1
      for (const c of candidates) {
        weekMarkers.push({ ...c, showLabel: c.week % everyN === 0 || everyN === 1 })
      }
    }
  }

  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const delta = last.weight - first.weight
  const deltaSign = delta > 0 ? '+' : ''
  const trendingDown = delta < 0
  const trendingUp = delta > 0
  const avg = weights.reduce((s, w) => s + w, 0) / weights.length

  return (
    <div className="bg-surface rounded-2xl border border-line p-4 sm:p-5 min-w-0">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-subtle">
            Progress
          </p>
          <p className="text-xs text-muted tabular-nums mt-1">
            {formatDate(first.recorded_at)} – {formatDate(last.recorded_at)}
          </p>
        </div>
        <div
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold tabular-nums border ${
 trendingDown
 ? 'bg-emerald-soft text-emerald-fg border-emerald-line '
 : trendingUp
 ? 'bg-red-soft text-red-fg border-red-line '
 : 'bg-elevated text-muted border-line '
 }`}
        >
          <span aria-hidden>{trendingDown ? '↓' : trendingUp ? '↑' : '→'}</span>
          {deltaSign}
          {roundMacro(delta)} {weightUnit}
        </div>
      </div>

      <div className="h-56 sm:h-64 w-full -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="weightChartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={palette.grid} strokeDasharray="3 4" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={ts =>
                new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              }
              tick={{ fill: palette.tick, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: palette.grid }}
              minTickGap={32}
            />
            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={v => `${roundMacro(v as number)}`}
              tick={{ fill: palette.tick, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              cursor={{ stroke: palette.tick, strokeDasharray: '2 3' }}
              content={<ChartTooltip unit={weightUnit} />}
            />
            <Area
              type="monotone"
              dataKey="weight"
              stroke="#4f46e5"
              strokeWidth={2.5}
              fill="url(#weightChartFill)"
              dot={{ r: 3, stroke: '#4f46e5', strokeWidth: 2, fill: palette.dotFill }}
              activeDot={{ r: 5, stroke: palette.dotFill, strokeWidth: 2, fill: '#4f46e5' }}
              isAnimationActive={false}
            />
            {goal != null && Number.isFinite(goal) && goal > 0 && (
              <ReferenceLine
                y={goal}
                stroke="#10b981"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `Goal · ${roundMacro(goal)} ${weightUnit}`,
                  position: 'insideTopRight',
                  fill: palette.goalLabel,
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
            )}
            {weekMarkers.map(m => (
              <ReferenceLine
                key={m.ts}
                x={m.ts}
                stroke={palette.grid}
                strokeDasharray="2 4"
                strokeWidth={1}
                label={
                  m.showLabel
                    ? {
                        value: `W${m.week}`,
                        position: 'insideTopLeft',
                        fill: palette.tick,
                        fontSize: 9,
                        fontWeight: 600,
                      }
                    : undefined
                }
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-line-subtle">
        {[
          { label: 'Lowest', value: minWeight },
          { label: 'Average', value: avg },
          { label: 'Highest', value: maxWeight },
        ].map(s => (
          <div key={s.label} className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-subtle">
              {s.label}
            </p>
            <p className="text-sm font-semibold text-foreground tabular-nums mt-0.5">
              {roundMacro(s.value)}
              <span className="text-subtle font-normal text-[10px] ml-1">{weightUnit}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// Recharts is expensive to re-render — wrap in memo so parent state changes
// (e.g. switching dashboard tabs, opening modals) don't trigger a chart
// rebuild when the props haven't actually moved.
export const WeightChart = memo(WeightChartInner)
