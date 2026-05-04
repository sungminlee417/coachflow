'use client'

import { roundMacro, formatDate } from '@/lib/utils'
import type { WeightLog } from '@/lib/types'

interface WeightChartProps {
  logs: WeightLog[]
}

// Simple SVG line chart. Pure render, no dependencies.
export function WeightChart({ logs }: WeightChartProps) {
  // Render oldest → newest left-to-right.
  const sorted = [...logs].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))

  if (sorted.length < 2) return null

  const weights = sorted.map(l => l.weight)
  const minWeight = Math.min(...weights)
  const maxWeight = Math.max(...weights)
  // Pad the y-range so the line never sits flat against the top/bottom.
  const range = Math.max(maxWeight - minWeight, 1)
  const yMin = minWeight - range * 0.15
  const yMax = maxWeight + range * 0.15

  // SVG viewBox dimensions (scales to container width).
  const width = 600
  const height = 140
  const padX = 8
  const padY = 12

  const xFor = (i: number) => {
    if (sorted.length === 1) return width / 2
    return padX + (i * (width - padX * 2)) / (sorted.length - 1)
  }
  const yFor = (w: number) => {
    const t = (w - yMin) / (yMax - yMin)
    return height - padY - t * (height - padY * 2)
  }

  const points = sorted.map((log, i) => ({
    x: xFor(i),
    y: yFor(log.weight),
    log,
  }))

  // Build a smooth path using monotone cubic interpolation (lightweight version).
  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ')

  // Closed area under the line for the gradient fill.
  const areaPath =
    `${linePath} L ${points[points.length - 1].x} ${height - padY} ` +
    `L ${points[0].x} ${height - padY} Z`

  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const delta = last.weight - first.weight
  const deltaSign = delta > 0 ? '+' : ''

  return (
    <div className="bg-slate-50 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Progress
        </p>
        <p className="text-xs text-slate-500 tabular-nums">
          {formatDate(first.recorded_at)} &rarr; {formatDate(last.recorded_at)}
          <span
            className={`ml-2 font-medium ${
              delta < 0 ? 'text-emerald-600' : delta > 0 ? 'text-red-600' : 'text-slate-400'
            }`}
          >
            {deltaSign}
            {roundMacro(delta)}
          </span>
        </p>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="w-full h-32"
          role="img"
          aria-label="Weight progress line chart"
        >
          <defs>
            <linearGradient id="weightChartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaPath} fill="url(#weightChartFill)" />

          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke="#4f46e5"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Dots */}
          {points.map((p, i) => {
            const isEdge = i === 0 || i === points.length - 1
            return (
              <circle
                key={p.log.id ?? i}
                cx={p.x}
                cy={p.y}
                r={isEdge ? 4 : 2.5}
                fill="white"
                stroke="#4f46e5"
                strokeWidth={isEdge ? 2 : 1.5}
                vectorEffect="non-scaling-stroke"
              >
                <title>
                  {formatDate(p.log.recorded_at)}: {roundMacro(p.log.weight)}
                </title>
              </circle>
            )
          })}
        </svg>

        {/* Min/max y-axis labels */}
        <div className="absolute top-0 left-0 right-0 flex justify-between text-[10px] text-slate-400 pointer-events-none">
          <span className="tabular-nums">{roundMacro(maxWeight)}</span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[10px] text-slate-400 pointer-events-none">
          <span className="tabular-nums">{roundMacro(minWeight)}</span>
        </div>
      </div>
    </div>
  )
}
