import { useCallback, useEffect, useState } from "react"
import { Check } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import useKeywordPreview from "@/hooks/useKeywordPreview"
import client from "@/api/client"

// The reserved category every spending query filters out. Picking it also sends a
// remembered keyword to the excluded list rather than to a category.
const EXCLUDED = "Excluded"

function names(merchants, limit = 3) {
  const shown = merchants.slice(0, limit).join(", ")
  const rest = merchants.length - limit
  return rest > 0 ? `${shown} +${rest} more` : shown
}

function money(value) {
  const sign = value < 0 ? "" : "+"
  return `${sign}£${Math.abs(value).toFixed(2)}`
}

function dateRange(first, last) {
  const format = (iso) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  if (!first) return null
  return first === last ? format(first) : `${format(first)} – ${format(last)}`
}

function MerchantCard({ entry, categories, onResolved }) {
  const options = entry.keyword_options ?? []
  const [category, setCategory] = useState("")
  const [addRule, setAddRule] = useState(true)
  const [keyword, setKeyword] = useState(options[0] ?? "")
  const [saving, setSaving] = useState(false)

  const preview = useKeywordPreview(addRule ? keyword : "", category || null)
  const others = (preview?.merchants ?? [])
    .filter((m) => m.merchant !== entry.merchant)
    .map((m) => m.merchant)
  // A keyword that misses the merchant it came from is a rule that never fires
  const missesOwnMerchant =
    preview && !preview.merchants.some((m) => m.merchant === entry.merchant)

  async function save() {
    if (!category) return
    setSaving(true)
    try {
      const { data } = await client.post("/transactions/review", {
        merchant: entry.merchant,
        category,
        add_rule: addRule,
        keyword: keyword.trim(),
      })
      const swept = data.also_matched
        ? ` and ${data.also_matched} more matching the new rule`
        : ""
      const outcome = category === EXCLUDED ? "excluded" : `categorised as ${category}`
      toast.success(`${data.updated} ${outcome}${swept}`)
      onResolved(entry.merchant, data.also_matched > 0)
    } catch (err) {
      toast.error(err.response?.data?.detail ?? "Could not save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-medium text-sm tracking-tight break-all">{entry.merchant}</span>
        <span className="text-sm tabular-nums text-foreground shrink-0">{money(entry.total)}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {entry.count} transaction{entry.count === 1 ? "" : "s"}
        {dateRange(entry.first_date, entry.last_date) && (
          <> · {dateRange(entry.first_date, entry.last_date)}</>
        )}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-56">
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
            <SelectItem value={EXCLUDED}>Exclude</SelectItem>
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={addRule}
            onChange={(e) => setAddRule(e.target.checked)}
            className="h-4 w-4 rounded border-input accent-foreground"
          />
          Remember
        </label>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onResolved(entry.merchant)}>
            Skip
          </Button>
          <Button size="sm" disabled={!category || saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {addRule && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="keyword"
              aria-label="Rule keyword"
              className="h-9 w-full max-w-md font-mono text-xs"
            />
            {options.length > 1 &&
              options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKeyword(option)}
                  className={cn(
                    "rounded-md border px-2 py-1 font-mono text-xs transition-colors",
                    keyword === option
                      ? "border-foreground/30 bg-secondary text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option}
                </button>
              ))}
          </div>

          {category && (
            <p className="text-xs text-muted-foreground">
              Future transactions containing{" "}
              <span className="font-mono text-foreground">{keyword.trim() || "…"}</span>{" "}
              {category === EXCLUDED
                ? "will be excluded from spending views automatically."
                : `will be categorised as ${category} automatically.`}
            </p>
          )}

          {missesOwnMerchant ? (
            <p className="text-xs text-destructive">
              Does not match {entry.merchant} — this rule would never fire.
            </p>
          ) : (
            others.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Also matches {others.length} other merchant
                {others.length === 1 ? "" : "s"} on file:{" "}
                <span className="text-foreground">{names(others)}</span>
                {preview.conflicts.length > 0 && (
                  <span className="text-destructive">
                    {" "}
                    — {names(preview.conflicts)} already categorised elsewhere
                  </span>
                )}
              </p>
            )
          )}
        </div>
      )}
    </div>
  )
}

export default function Review() {
  const [merchants, setMerchants] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [queue, cats] = await Promise.all([
        client.get("/transactions/review"),
        client.get("/categories"),
      ])
      setMerchants(queue.data.merchants)
      setCategories(cats.data.categories)
    } catch {
      toast.error("Could not load the review queue")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // A new rule can clear other merchants in the queue, so refetch when that happens
  // rather than leaving cards on screen that no longer have anything behind them.
  function handleResolved(merchant, sweptOthers) {
    if (sweptOthers) {
      load()
      return
    }
    setMerchants((current) => current.filter((m) => m.merchant !== merchant))
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Review</h1>
        {!loading && merchants.length > 0 && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {merchants.length} merchant{merchants.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Transactions no rule matched, grouped by merchant.
      </p>

      {loading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : merchants.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
          <Check className="h-5 w-5 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Nothing to review</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Every transaction has a category.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {merchants.map((entry) => (
            <MerchantCard
              key={entry.merchant}
              entry={entry}
              categories={categories}
              onResolved={handleResolved}
            />
          ))}
        </div>
      )}
    </div>
  )
}
