import { useEffect, useMemo, useState, useCallback } from "react"
import { Link } from "react-router-dom"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import UploadButton from "@/components/UploadButton"
import SpendingMatrix from "@/components/SpendingMatrix"
import TransactionsTable from "@/components/TransactionsTable"
import SpendChart from "@/components/charts/SpendChart"
import CategoryBars from "@/components/charts/CategoryBars"
import { RAMP, OTHER, assignColours, gbp } from "@/lib/palette"
import client from "@/api/client"

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

// Anything past the last ramp step folds in here rather than inventing a colour
const OTHER_LABEL = "Other"

const EMPTY_SUMMARY = {
  spent: 0,
  income: 0,
  previous: { month: 0, year: 0, spent: 0 },
  categories: [],
  uncategorised_spend: 0,
  counts: { transactions: 0, excluded: 0, uncategorised: 0 },
}

/**
 * The verdict: what this month cost, whether that is more or less than last
 * month, and where most of it went. Everything else on the page is detail.
 */
function Verdict({ summary, year, month, loading }) {
  if (loading) {
    return (
      <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end mb-8">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-12 w-48" />
        </div>
        <Skeleton className="h-12 w-64" />
      </div>
    )
  }

  const { spent, income, previous, categories, counts } = summary
  const top = categories[0]
  const delta = spent - previous.spent
  // A month with nothing in it hasn't "spent 100% less" — it has no answer to give
  const hasData = counts.transactions > 0
  const hasPrevious = hasData && previous.spent > 0
  const share = hasPrevious ? Math.round(Math.abs(delta / previous.spent) * 100) : 0
  const down = delta < 0

  if (!hasData) {
    return (
      <div className="mb-8">
        <p className="text-sm text-muted-foreground">
          {MONTH_FULL[month - 1]} {year}
        </p>
        <p className="mt-2 text-2xl font-medium tracking-tight text-muted-foreground">
          No transactions
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Import a statement for this month, or pick another period above.
        </p>
      </div>
    )
  }

  return (
    <div className="mb-8">
      <div className="grid gap-x-10 gap-y-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <p className="text-sm text-muted-foreground">
            {MONTH_FULL[month - 1]} {year}
          </p>
          <p className="mt-1 text-5xl font-semibold tracking-tight text-foreground">
            {gbp(spent)}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            spent
            {income > 0 && (
              <>
                {" · "}
                <span className="text-emerald-600 tabular-nums">{gbp(income)}</span> in
              </>
            )}
          </p>
        </div>

        <div className="flex gap-10">
          <div>
            <p className="text-xs text-muted-foreground">
              vs {MONTH_NAMES[previous.month - 1]}
            </p>
            {hasPrevious ? (
              <>
                {/* The arrow carries the direction; colour only reinforces it */}
                <p
                  className={`mt-1 text-lg font-medium tabular-nums ${down ? "text-emerald-600" : "text-foreground"}`}
                >
                  {/* Absolute: the arrow already says which way */}
                  {down ? "↓" : "↑"} {gbp(Math.abs(delta))}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {share}% {down ? "less" : "more"}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No data</p>
            )}
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Largest</p>
            {top ? (
              <>
                <p className="mt-1 text-lg font-medium text-foreground">{top.category}</p>
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  {gbp(top.total)} · {spent > 0 ? Math.round((top.total / spent) * 100) : 0}%
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">—</p>
            )}
          </div>
        </div>
      </div>

      {counts.uncategorised > 0 && (
        // The amount matters as much as the count: it is money the headline above
        // does not yet include, so the figure is understated until these are filed.
        <p className="mt-5 text-xs text-muted-foreground">
          {counts.uncategorised} transaction{counts.uncategorised === 1 ? "" : "s"}
          {summary.uncategorised_spend > 0 && ` worth ${gbp(summary.uncategorised_spend)}`}
          {" "}not counted above —{" "}
          <Link to="/review" className="underline underline-offset-2 hover:text-foreground">
            review them
          </Link>
        </p>
      )}
    </div>
  )
}

function ChartPanel({ chart, colours, breakdown, total, caption }) {
  return (
    <div className="space-y-8">
      <div>
        <p className="mb-3 text-sm font-medium text-muted-foreground">{caption}</p>
        <SpendChart {...chart} colours={colours} />
      </div>
      <div>
        <p className="mb-4 text-sm font-medium text-muted-foreground">By category</p>
        <CategoryBars categories={breakdown} colours={colours} total={total} />
      </div>
    </div>
  )
}

export default function Dashboard() {
  // Both start empty and are filled from /periods, so the page opens on real data
  const [period, setPeriod] = useState(null)
  const [years, setYears] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [asTable, setAsTable] = useState(false)
  const [tab, setTab] = useState("weekly")

  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [weekly, setWeekly] = useState({ weeks: [], categories: [], data: [], income_categories: [] })
  const [monthly, setMonthly] = useState({ months: [], categories: [], data: [], income_categories: [] })
  const [allCategories, setAllCategories] = useState([])
  const [loading, setLoading] = useState(true)

  const year = period?.year
  const month = period?.month

  /** Land on the newest month on file; fall back to today when nothing is imported. */
  const fetchPeriods = useCallback(async (jump) => {
    const now = new Date()
    const fallback = { year: now.getFullYear(), month: now.getMonth() + 1 }
    try {
      const { data } = await client.get("/transactions/periods")
      setYears(data.years.length ? data.years : [fallback.year])
      if (jump) setPeriod(data.latest ?? fallback)
    } catch {
      setYears([fallback.year])
      if (jump) setPeriod(fallback)
    }
  }, [])

  const fetchMonthScoped = useCallback(async () => {
    if (!year) return
    setLoading(true)
    try {
      const [summaryRes, weeklyRes] = await Promise.all([
        client.get("/transactions/summary", { params: { year, month } }),
        client.get("/transactions/weekly", { params: { year, month } }),
      ])
      setSummary(summaryRes.data)
      setWeekly(weeklyRes.data)
    } finally {
      setLoading(false)
    }
  }, [year, month, refreshKey])

  const fetchYearScoped = useCallback(async () => {
    if (!year) return
    const { data } = await client.get("/transactions/monthly", { params: { year } })
    setMonthly(data)
  }, [year, refreshKey])

  // The category list for inline editing — rules.json is the only source of truth
  const fetchCategories = useCallback(async () => {
    const { data } = await client.get("/api/rules")
    setAllCategories(data.categories)
  }, [refreshKey])

  useEffect(() => { fetchPeriods(true) }, [fetchPeriods])
  useEffect(() => { fetchMonthScoped() }, [fetchMonthScoped])
  useEffect(() => { fetchYearScoped() }, [fetchYearScoped])
  useEffect(() => { fetchCategories() }, [fetchCategories])

  const incomeCategories = weekly.income_categories.length
    ? weekly.income_categories
    : monthly.income_categories

  /**
   * One colour assignment for the whole page, ordered by the selected month's
   * spend and extended with anything that only appears elsewhere in the year.
   * Switching tabs or toggling the table never repaints a category.
   */
  const { colours, order } = useMemo(() => {
    const income = new Set(incomeCategories)
    const ordered = summary.categories.map((c) => c.category)

    const yearTotals = {}
    for (const d of monthly.data) {
      if (income.has(d.category)) continue
      yearTotals[d.category] = (yearTotals[d.category] ?? 0) + d.total
    }
    for (const category of Object.keys(yearTotals).sort((a, b) => yearTotals[b] - yearTotals[a])) {
      if (!ordered.includes(category)) ordered.push(category)
    }

    const visible = ordered.slice(0, RAMP.length)
    return { colours: { ...assignColours(visible, incomeCategories), [OTHER_LABEL]: OTHER }, order: ordered }
  }, [summary.categories, monthly.data, incomeCategories])

  const visible = useMemo(() => new Set(order.slice(0, RAMP.length)), [order])

  /** Spending rows only, with the ramp's overflow folded into one "Other" series. */
  const prepare = useCallback(
    (data) => {
      const income = new Set(incomeCategories)
      const spending = data
        .filter((d) => !income.has(d.category))
        .map((d) => (visible.has(d.category) ? d : { ...d, category: OTHER_LABEL }))

      const present = new Set(spending.map((d) => d.category))
      const series = [...order.filter((c) => present.has(c) && visible.has(c))]
      if (present.has(OTHER_LABEL)) series.push(OTHER_LABEL)

      return { spending, series }
    },
    [incomeCategories, visible, order]
  )

  const weeklyChart = useMemo(() => {
    const { spending, series } = prepare(weekly.data)
    return {
      series,
      buckets: weekly.weeks,
      data: spending,
      bucketKey: "week",
      labelFor: (w) => `Wk ${w}`,
    }
  }, [weekly, prepare])

  const { monthlyChart, yearBreakdown, yearTotal } = useMemo(() => {
    const { spending, series } = prepare(monthly.data)
    const breakdown = series
      .map((category) => ({
        category,
        total: spending
          .filter((d) => d.category === category)
          .reduce((sum, d) => sum + d.total, 0),
        // /monthly aggregates amounts, not row counts — better blank than wrong
        count: null,
      }))
      .sort((a, b) => b.total - a.total)

    return {
      monthlyChart: {
        series,
        buckets: monthly.months,
        data: spending,
        bucketKey: "month",
        labelFor: (m) => MONTH_NAMES[m - 1],
      },
      yearBreakdown: breakdown,
      yearTotal: breakdown.reduce((sum, c) => sum + c.total, 0),
    }
  }, [monthly, prepare])

  function handleUploadSuccess() {
    // Jump to whatever the new statement covers — that is what you came to look at
    fetchPeriods(true)
    setRefreshKey((k) => k + 1)
  }

  const toggle = (
    <div className="flex rounded-md border border-border p-0.5">
      {[
        ["Chart", false],
        ["Table", true],
      ].map(([label, value]) => (
        <button
          key={label}
          onClick={() => setAsTable(value)}
          className={`rounded-[3px] px-2.5 py-1 text-xs transition-colors ${
            asTable === value
              ? "bg-secondary font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Spending</h1>
        <UploadButton onSuccess={handleUploadSuccess} />
      </div>

      {/* One filter row, scoping everything below it */}
      <div className="flex gap-3 mb-8">
        <Select
          value={year ? String(year) : ""}
          onValueChange={(v) => setPeriod((p) => ({ ...p, year: Number(v) }))}
        >
          <SelectTrigger className="w-28 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={month ? String(month) : ""}
          onValueChange={(v) => setPeriod((p) => ({ ...p, month: Number(v) }))}
        >
          <SelectTrigger className="w-28 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTH_NAMES.map((name, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Verdict summary={summary} year={year} month={month} loading={loading} />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between gap-3">
          <TabsList className="h-9">
            <TabsTrigger value="weekly" className="text-sm">Weekly</TabsTrigger>
            <TabsTrigger value="monthly" className="text-sm">Monthly</TabsTrigger>
            <TabsTrigger value="transactions" className="text-sm">Transactions</TabsTrigger>
          </TabsList>
          {tab !== "transactions" && toggle}
        </div>

        <TabsContent value="weekly" className="mt-6">
          {asTable ? (
            <SpendingMatrix
              rowKey="week"
              rowLabel="Week"
              rows={weekly.weeks}
              categories={weekly.categories}
              data={weekly.data}
              incomeCategories={weekly.income_categories}
            />
          ) : (
            <ChartPanel
              caption={`Spend by week — ${MONTH_FULL[month - 1]}`}
              chart={weeklyChart}
              colours={colours}
              breakdown={summary.categories}
              total={summary.spent}
            />
          )}
        </TabsContent>

        <TabsContent value="monthly" className="mt-6">
          {asTable ? (
            <SpendingMatrix
              rowKey="month"
              rowLabel="Month"
              rows={monthly.months}
              categories={monthly.categories}
              data={monthly.data}
              incomeCategories={monthly.income_categories}
            />
          ) : (
            <ChartPanel
              caption={`Spend by month — ${year}`}
              chart={monthlyChart}
              colours={colours}
              breakdown={yearBreakdown}
              total={yearTotal}
            />
          )}
        </TabsContent>

        <TabsContent value="transactions">
          <TransactionsTable
            year={year}
            month={month}
            categories={allCategories}
            refreshKey={refreshKey}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
