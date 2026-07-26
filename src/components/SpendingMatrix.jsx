import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function fmt(value) {
  if (!value) return "—"
  return `£${value.toFixed(2)}`
}

/**
 * The raw category × period grid.
 *
 * Kept behind a toggle rather than deleted: the charts answer "what did I spend
 * on" faster, but the grid is the only view that gives every cell exactly, and
 * it doubles as the WCAG-clean table twin of the chart beside it.
 */
export default function SpendingMatrix({ rowKey, rowLabel, rows, categories, data, incomeCategories = [] }) {
  const incomeSet = new Set(incomeCategories)

  const lookup = {}
  for (const d of data) {
    lookup[`${d[rowKey]}__${d.category}`] = d.total
  }

  const totals = {}
  for (const cat of categories) {
    totals[cat] = rows.reduce((sum, r) => sum + (lookup[`${r}__${cat}`] ?? 0), 0)
  }

  if (!rows.length) {
    return (
      <div className="rounded-md border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
        Nothing recorded for this period
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24 text-xs font-medium text-muted-foreground">
              {rowLabel}
            </TableHead>
            {categories.map((cat) => (
              <TableHead
                key={cat}
                className={`text-xs font-medium text-right ${incomeSet.has(cat) ? "text-emerald-600" : "text-muted-foreground"}`}
              >
                {cat}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row}>
              <TableCell className="text-sm text-muted-foreground font-medium">
                {rowLabel === "Month" ? MONTH_NAMES[row - 1] : `Wk ${row}`}
              </TableCell>
              {categories.map((cat) => {
                const val = lookup[`${row}__${cat}`]
                return (
                  <TableCell
                    key={cat}
                    className={`text-sm text-right tabular-nums ${val && incomeSet.has(cat) ? "text-emerald-600" : ""}`}
                  >
                    {fmt(val)}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
          <TableRow className="border-t-2 border-border bg-muted/30">
            <TableCell className="text-xs font-semibold text-muted-foreground">Total</TableCell>
            {categories.map((cat) => (
              <TableCell
                key={cat}
                className={`text-sm font-semibold text-right tabular-nums ${incomeSet.has(cat) ? "text-emerald-600" : ""}`}
              >
                {fmt(totals[cat])}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}
