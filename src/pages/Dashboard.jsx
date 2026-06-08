import { useEffect, useState, useCallback } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import UploadButton from "@/components/UploadButton"
import client from "@/api/client"

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

const YEARS = [2024, 2025, 2026]

function fmt(value) {
  if (!value) return "—"
  return `£${value.toFixed(2)}`
}

function TableSkeleton({ rows = 5, cols = 8 }) {
  return (
    <div className="space-y-2 mt-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

function SpendingTable({ rowKey, rowLabel, rows, categories, data, loading, incomeCategories = [] }) {
  if (loading) return <TableSkeleton />

  const incomeSet = new Set(incomeCategories)

  const lookup = {}
  for (const d of data) {
    lookup[`${d[rowKey]}__${d.category}`] = d.total
  }

  const totals = {}
  for (const cat of categories) {
    totals[cat] = rows.reduce((sum, r) => sum + (lookup[`${r}__${cat}`] ?? 0), 0)
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border mt-4">
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

function TransactionsTable({ year, month, loading: parentLoading, refreshKey }) {
  const [txns, setTxns] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)

  const fetchTxns = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await client.get("/transactions/list", {
        params: { year, month, page, page_size: 50 },
      })
      setTxns(data.transactions)
      setTotal(data.total)
      setPages(data.pages)
    } finally {
      setLoading(false)
    }
  }, [year, month, page, refreshKey])

  useEffect(() => { setPage(1) }, [year, month])
  useEffect(() => { fetchTxns() }, [fetchTxns])

  if (loading || parentLoading) return <TableSkeleton rows={8} cols={4} />

  return (
    <div className="mt-4 space-y-3">
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-medium text-muted-foreground">Date</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Merchant</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground text-right">Amount</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Direction</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Category</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {txns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              txns.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">{tx.date}</TableCell>
                  <TableCell className="text-sm">{tx.merchant}</TableCell>
                  <TableCell className="text-sm text-right tabular-nums font-medium">
                    £{Math.abs(tx.amount).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium ${tx.amount < 0 ? "text-muted-foreground" : "text-emerald-600"}`}>
                      {tx.amount < 0 ? "out" : "in"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{tx.category || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{total} transactions</span>
          <div className="flex items-center gap-3">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="hover:text-foreground disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <span>Page {page} of {pages}</span>
            <button
              disabled={page === pages}
              onClick={() => setPage((p) => p + 1)}
              className="hover:text-foreground disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [refreshKey, setRefreshKey] = useState(0)

  const [weekly, setWeekly] = useState({ weeks: [], categories: [], data: [], income_categories: [] })
  const [monthly, setMonthly] = useState({ months: [], categories: [], data: [], income_categories: [] })
  const [weeklyLoading, setWeeklyLoading] = useState(true)
  const [monthlyLoading, setMonthlyLoading] = useState(true)

  const fetchWeekly = useCallback(async () => {
    setWeeklyLoading(true)
    try {
      const { data } = await client.get("/transactions/weekly", {
        params: { year, month },
      })
      setWeekly(data)
    } finally {
      setWeeklyLoading(false)
    }
  }, [year, month])

  const fetchMonthly = useCallback(async () => {
    setMonthlyLoading(true)
    try {
      const { data } = await client.get("/transactions/monthly", {
        params: { year },
      })
      setMonthly(data)
    } finally {
      setMonthlyLoading(false)
    }
  }, [year])

  useEffect(() => { fetchWeekly() }, [fetchWeekly])
  useEffect(() => { fetchMonthly() }, [fetchMonthly])

  function handleUploadSuccess() {
    fetchWeekly()
    fetchMonthly()
    setRefreshKey((k) => k + 1)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Spending</h1>
        <UploadButton onSuccess={handleUploadSuccess} />
      </div>

      {/* Shared selectors */}
      <div className="flex gap-3 mb-4">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
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

      <Tabs defaultValue="weekly">
        <TabsList className="h-9">
          <TabsTrigger value="weekly" className="text-sm">Weekly</TabsTrigger>
          <TabsTrigger value="monthly" className="text-sm">Monthly</TabsTrigger>
          <TabsTrigger value="transactions" className="text-sm">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="weekly">
          <SpendingTable
            rowKey="week"
            rowLabel="Week"
            rows={weekly.weeks}
            categories={weekly.categories}
            data={weekly.data}
            loading={weeklyLoading}
            incomeCategories={weekly.income_categories}
          />
        </TabsContent>

        <TabsContent value="monthly">
          <SpendingTable
            rowKey="month"
            rowLabel="Month"
            rows={monthly.months}
            categories={monthly.categories}
            data={monthly.data}
            loading={monthlyLoading}
            incomeCategories={monthly.income_categories}
          />
        </TabsContent>

        <TabsContent value="transactions">
          <TransactionsTable
            year={year}
            month={month}
            loading={false}
            refreshKey={refreshKey}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
