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

/** The mirror, for a stack hanging below the zero line. */
function roundedBottomRect(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h))
  if (!rr) return `M${x},${y} h${w} v${h} h${-w} Z`
  return (
    `M${x},${y} L${x + w},${y} L${x + w},${y + h - rr} ` +
    `Q${x + w},${y + h} ${x + w - rr},${y + h} L${x + rr},${y + h} ` +
    `Q${x},${y + h} ${x},${y + h - rr} Z`
  )
}

/**
 * One segment of a stack.
 *
 * The 2px separator is a gap in the surface, not a stroke — every segment gives
 * up 2px on the side away from the baseline except the outermost one, which keeps
 * its full height and takes the rounded cap. Stack height is still true to the data.
 *
 * A segment can be negative: a category whose refunds beat its purchases in that
 * bucket hangs below zero. Bailing out on `height <= 0` used to drop those silently,
 * so the chart totalled more than the headline it sat under.
 */
function StackSegment({ x, y, width, height, fill, payload, seriesKey }) {
  const value = payload?.[seriesKey] ?? 0
  if (!value || !height) return null

  // Recharts reports a below-zero segment as a negative height in some paths and as
  // a positive one anchored at the zero line in others — normalise both.
  const top = height < 0 ? y + height : y
  const full = Math.abs(height)
  const below = value < 0

  const isEnd = below ? payload?.__bottom === seriesKey : payload?.__top === seriesKey
  const gap = isEnd ? 0 : 2
  const h = full - gap
  if (h <= 0) return null

  // The gap comes off the top going up, off the bottom going down
  return below ? (
    <path d={roundedBottomRect(x, top, width, h, isEnd ? 4 : 0)} fill={fill} />
  ) : (
    <path d={roundedTopRect(x, top + gap, width, h, isEnd ? 4 : 0)} fill={fill} />
  )
}

function StackTooltip({ active, payload, label, colours }) {
  if (!active || !payload?.length) return null

  // Biggest first by magnitude, so a refund is not stranded at the bottom of the list
  const entries = payload
    .filter((p) => p.value)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
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
    // Recharts stacks in element order, so the last series with a value is outermost.
    // Positive and negative stacks grow in opposite directions and each need their own.
    const outermost = [...series].reverse()
    row.__top = outermost.find((c) => row[c] > 0) ?? null
    row.__bottom = outermost.find((c) => row[c] < 0) ?? null
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
  // The two halves of a stack are measured separately: netting them first would
  // understate the top of a bucket that holds both a spend and a refund.
  const tallest = Math.max(
    0,
    ...rows.map((row) => series.reduce((sum, c) => sum + Math.max(row[c] ?? 0, 0), 0))
  )
  const deepest = Math.min(
    0,
    ...rows.map((row) => series.reduce((sum, c) => sum + Math.min(row[c] ?? 0, 0), 0))
  )
  const ticks = niceTicks(tallest, { min: deepest })

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
        {/*
          stackOffset="sign" is load-bearing: the default treats a stack as a running
          total, so a negative segment is drawn from the top of the positive stack back
          down over it rather than below zero. "sign" splits the stack at the baseline —
          spending up, refunds down.
        */}
        <BarChart
          data={rows}
          margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
          barCategoryGap="32%"
          stackOffset="sign"
        >
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
            domain={[ticks[0], ticks[ticks.length - 1]]}
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
