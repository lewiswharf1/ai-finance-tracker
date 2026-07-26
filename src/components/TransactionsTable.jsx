import { useEffect, useMemo, useState, useCallback } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import client from "@/api/client"
import { gbp } from "@/lib/palette"

// Radix will not take "" as an item value, so the two synthetic filters and the
// "send it back to review" choice travel under sentinels.
const ALL = "__all__"
const UNCATEGORISED = "__uncategorised__"
const EXCLUDED = "Excluded"

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
})

function formatDay(iso) {
  const [y, m, d] = iso.split("-").map(Number)
  return dayFormat.format(new Date(y, m - 1, d))
}

/** Consecutive rows sharing a date become one day block — the date stops repeating. */
function groupByDay(transactions) {
  const days = []
  for (const tx of transactions) {
    const last = days[days.length - 1]
    if (last && last.date === tx.date) {
      last.transactions.push(tx)
    } else {
      days.push({ date: tx.date, transactions: [tx] })
    }
  }
  return days.map((day) => ({
    ...day,
    out: day.transactions.reduce((sum, tx) => sum + (tx.amount < 0 ? -tx.amount : 0), 0),
  }))
}

function CategoryCell({ tx, categories, onChange }) {
  const [saving, setSaving] = useState(false)

  async function handle(value) {
    const category = value === UNCATEGORISED ? "" : value
    if (category === (tx.category || "")) return

    setSaving(true)
    try {
      const { data } = await client.patch(`/transactions/${tx.id}`, { category })
      onChange(data)
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not update category")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Select value={tx.category || UNCATEGORISED} onValueChange={handle} disabled={saving}>
      <SelectTrigger
        className={`h-7 w-full border-transparent bg-transparent px-2 text-sm shadow-none hover:border-border focus:border-border ${
          tx.category ? "" : "text-muted-foreground"
        }`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNCATEGORISED}>Needs review</SelectItem>
        {categories.map((category) => (
          <SelectItem key={category} value={category}>{category}</SelectItem>
        ))}
        <SelectItem value={EXCLUDED}>{EXCLUDED}</SelectItem>
      </SelectContent>
    </Select>
  )
}

export default function TransactionsTable({ year, month, categories, refreshKey }) {
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState(ALL)
  const [page, setPage] = useState(1)

  const [txns, setTxns] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)

  // Debounced so a five-letter merchant is one request, not five
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => { setPage(1) }, [year, month, query, filter])

  const fetchTxns = useCallback(async () => {
    if (!year) return // the dashboard is still resolving which month to open on
    setLoading(true)
    try {
      const { data } = await client.get("/transactions/list", {
        params: {
          year,
          month,
          page,
          page_size: 50,
          merchant: query || undefined,
          category: filter === ALL || filter === UNCATEGORISED ? undefined : filter,
          uncategorised: filter === UNCATEGORISED || undefined,
        },
      })
      setTxns(data.transactions)
      setTotal(data.total)
      setPages(data.pages)
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [year, month, page, query, filter, refreshKey])

  useEffect(() => { fetchTxns() }, [fetchTxns])

  function handleCategoryChange(updated) {
    // A row that no longer belongs under the active filter leaves immediately;
    // refetching instead would scroll the list out from under the click.
    const stillMatches =
      filter === ALL
        ? updated.category !== EXCLUDED
        : filter === UNCATEGORISED
          ? !updated.category
          : updated.category === filter

    if (stillMatches) {
      setTxns((rows) => rows.map((tx) => (tx.id === updated.id ? updated : tx)))
    } else {
      setTxns((rows) => rows.filter((tx) => tx.id !== updated.id))
      setTotal((n) => Math.max(0, n - 1))
    }
  }

  const days = useMemo(() => groupByDay(txns), [txns])

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search merchants"
          className="h-8 w-56 text-sm"
        />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            <SelectItem value={UNCATEGORISED}>Needs review</SelectItem>
            <SelectItem value={EXCLUDED}>{EXCLUDED}</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>{category}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground tabular-nums">
          {loaded ? `${total} ${total === 1 ? "transaction" : "transactions"}` : ""}
        </span>
      </div>

      {filter === EXCLUDED && (
        <p className="text-xs text-muted-foreground">
          Excluded transactions are left out of every total and chart. This is the only
          place they are visible — worth a look if a keyword is claiming more than you meant.
        </p>
      )}

      {loading && !loaded ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : days.length === 0 ? (
        <div className="rounded-md border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No transactions match this filter
        </div>
      ) : (
        // Held at reduced opacity while refetching rather than flashing a skeleton
        <div className={`rounded-md border border-border ${loading ? "opacity-60" : ""} transition-opacity`}>
          {days.map((day, i) => (
            <div key={day.date} className={i > 0 ? "border-t border-border" : ""}>
              <div className="flex items-baseline justify-between bg-muted/40 px-4 py-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {formatDay(day.date)}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {day.out > 0 ? gbp(day.out) : ""}
                </span>
              </div>
              {day.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="grid grid-cols-[1fr_6rem_11rem] items-center gap-3 border-t border-border/60 px-4 py-1.5"
                >
                  <span className="truncate text-sm" title={tx.merchant}>{tx.merchant}</span>
                  <span
                    className={`text-right text-sm tabular-nums ${
                      tx.amount < 0 ? "text-foreground" : "text-emerald-600"
                    }`}
                  >
                    {gbp(tx.amount, { sign: true })}
                  </span>
                  <CategoryCell tx={tx} categories={categories} onChange={handleCategoryChange} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-end gap-3 text-xs text-muted-foreground">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="hover:text-foreground disabled:opacity-40 transition-colors"
          >
            Previous
          </button>
          <span className="tabular-nums">Page {page} of {pages}</span>
          <button
            disabled={page === pages}
            onClick={() => setPage((p) => p + 1)}
            className="hover:text-foreground disabled:opacity-40 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
