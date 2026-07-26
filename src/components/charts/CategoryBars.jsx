import { gbp } from "@/lib/palette"

/**
 * The category breakdown, biggest first.
 *
 * This is also the chart's legend — every series carries its swatch, its name and
 * its amount here, so identity is never colour-alone and no separate legend box
 * has to repeat it. Bars are scaled to the largest category, not to the total,
 * because the comparison that matters is category-to-category.
 */
export default function CategoryBars({ categories, colours, total }) {
  if (!categories.length) {
    return (
      <p className="text-sm text-muted-foreground">No spending recorded for this period.</p>
    )
  }

  const largest = Math.max(...categories.map((c) => c.total))

  return (
    <ul className="space-y-2.5">
      {categories.map(({ category, total: amount, count }) => (
        <li key={category} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: colours[category] }}
            />
            <span className="truncate text-sm text-foreground">{category}</span>
          </div>

          <div className="h-2 rounded-[2px] bg-secondary">
            <div
              className="h-full rounded-[2px]"
              style={{
                width: `${Math.max((amount / largest) * 100, 1.5)}%`,
                background: colours[category],
              }}
            />
          </div>

          <div className="flex items-baseline gap-2 tabular-nums">
            <span className="text-sm text-foreground">{gbp(amount)}</span>
            <span className="w-9 text-right text-xs text-muted-foreground">
              {total > 0 ? `${Math.round((amount / total) * 100)}%` : "—"}
            </span>
            <span className="w-12 text-right text-xs text-muted-foreground">
              {typeof count === "number" ? `${count} ${count === 1 ? "txn" : "txns"}` : ""}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
