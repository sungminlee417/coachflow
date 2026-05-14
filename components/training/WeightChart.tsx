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
import type { WeightLog, WeightUnit } from '@/lib/types'

interface WeightChartProps {
  logs: WeightLog[]
  weightUnit?: WeightUnit
  /** Optional body-weight goal. Renders as a dashed horizontal line
   *  across the chart so the trainee can see how close they are. */
  goal?: number | null
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
        {roundMacro(point.weight)} <span className="font-normal text-slate-300">{unit}</span>
      </div>
      <div className="text-[10px] text-slate-300 font-normal">
        {formatDate(point.recorded_at)}
      </div>
    </div>
  )
}

function WeightChartInner({ logs, weightUnit = 'lbs', goal }: WeightChartProps) {
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

  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const delta = last.weight - first.weight
  const deltaSign = delta > 0 ? '+' : ''
  const trendingDown = delta < 0
  const trendingUp = delta > 0
  const avg = weights.reduce((s, w) => s + w, 0) / weights.length

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 min-w-0">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Progress
          </p>
          <p className="text-xs text-slate-500 tabular-nums mt-1">
            {formatDate(first.recorded_at)} – {formatDate(last.recorded_at)}
          </p>
        </div>
        <div
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold tabular-nums border ${
            trendingDown
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : trendingUp
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-slate-50 text-slate-600 border-slate-200'
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
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 4" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={ts =>
                new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              }
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
              minTickGap={32}
            />
            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={v => `${roundMacro(v as number)}`}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              cursor={{ stroke: '#94a3b8', strokeDasharray: '2 3' }}
              content={<ChartTooltip unit={weightUnit} />}
            />
            <Area
              type="monotone"
              dataKey="weight"
              stroke="#4f46e5"
              strokeWidth={2.5}
              fill="url(#weightChartFill)"
              dot={{ r: 3, stroke: '#4f46e5', strokeWidth: 2, fill: '#fff' }}
              activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2, fill: '#4f46e5' }}
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
                  fill: '#047857',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-100">
        {[
          { label: 'Lowest', value: minWeight },
          { label: 'Average', value: avg },
          { label: 'Highest', value: maxWeight },
        ].map(s => (
          <div key={s.label} className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              {s.label}
            </p>
            <p className="text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
              {roundMacro(s.value)}
              <span className="text-slate-400 font-normal text-[10px] ml-1">{weightUnit}</span>
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
