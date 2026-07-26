import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { CHART, gbp, gbpAxis, niceTicks } from "@/lib/palette"

/** Rounded at the data end, square at the baseline. */
function roundedTopRect(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h))
  if (!rr) return `M${x},${y} h${w} v${h} h${-w} Z`
  return (
    `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} ` +
    `L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
  )
}

/**
 * One segment of a stack.
 *
 * The 2px separator is a gap in the surface, not a stroke — every segment gives
 * up 2px off its top except the one on top, which keeps its full height and
 * takes the rounded cap. Total stack height is therefore still true to the data.
 */
function StackSegment({ x, y, width, height, fill, payload, seriesKey }) {
  if (!height || height <= 0) return null

  const isTop = payload?.__top === seriesKey
  const gap = isTop ? 0 : 2
  const h = height - gap
  if (h <= 0) return null

  return <path d={roundedTopRect(x, y + gap, width, h, isTop ? 4 : 0)} fill={fill} />
}

function StackTooltip({ active, payload, label, colours }) {
  if (!active || !payload?.length) return null

  const entries = payload
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value)
  if (!entries.length) return null

  const total = entries.reduce((sum, p) => sum + p.value, 0)

  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 shadow-sm">
      <p className="text-xs font-medium text-foreground mb-1.5">{label}</p>
      <div className="space-y-1">
        {entries.map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: colours[p.dataKey] }}
            />
            <span className="text-muted-foreground mr-3">{p.dataKey}</span>
            <span className="ml-auto tabular-nums text-foreground">{gbp(p.value)}</span>
          </div>
        ))}
      </div>
      {entries.length > 1 && (
        <div className="mt-1.5 border-t border-border pt-1.5 flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">Total</span>
          <span className="ml-auto tabular-nums font-medium text-foreground">{gbp(total)}</span>
        </div>
      )}
    </div>
  )
}

/**
 * Pivot `[{bucket, category, total}]` into one row per bucket, tagging which
 * series sits on top of each stack so the segment shape can cap it correctly.
 */
function toStackRows(buckets, data, bucketKey, series, labelFor) {
  return buckets.map((bucket) => {
    const row = { __label: labelFor(bucket) }
    for (const d of data) {
      if (d[bucketKey] === bucket && series.includes(d.category)) {
        row[d.category] = (row[d.category] ?? 0) + d.total
      }
    }
    // Recharts stacks in element order, so the last series with a value is on top
    row.__top = [...series].reverse().find((c) => row[c] > 0) ?? null
    return row
  })
}

export default function SpendChart({
  buckets,
  data,
  bucketKey,
  labelFor,
  series,
  colours,
  height = 280,
}) {
  const rows = toStackRows(buckets, data, bucketKey, series, labelFor)
  const tallest = Math.max(
    0,
    ...rows.map((row) => series.reduce((sum, c) => sum + (row[c] ?? 0), 0))
  )
  const ticks = niceTicks(tallest)

  if (!rows.length || !series.length) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground"
        style={{ height }}
      >
        Nothing to chart for this period
      </div>
    )
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="32%">
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis
            dataKey="__label"
            tick={{ fill: CHART.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: CHART.grid }}
          />
          <YAxis
            tick={{ fill: CHART.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={gbpAxis}
            ticks={ticks}
            domain={[0, ticks[ticks.length - 1]]}
            width={56}
          />
          <Tooltip
            content={<StackTooltip colours={colours} />}
            cursor={{ fill: CHART.cursor }}
          />
          {series.map((category) => (
            <Bar
              key={category}
              dataKey={category}
              stackId="spend"
              fill={colours[category]}
              maxBarSize={24}
              isAnimationActive={false}
              activeBar={false}
              shape={(props) => <StackSegment {...props} seriesKey={category} />}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
