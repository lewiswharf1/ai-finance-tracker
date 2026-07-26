import { useEffect, useState } from "react"
import { Plus, X } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import client from "@/api/client"

// Excluded keywords live outside the category list, but are edited the same way,
// so they get a pseudo-entry in the sidebar.
const EXCLUDED = "__excluded__"

function KeywordEditor({ keywords, onAdd, onRemove, placeholder }) {
  const [draft, setDraft] = useState("")

  function submit(e) {
    e.preventDefault()
    const keyword = draft.trim().toLowerCase()
    if (!keyword) return
    if (keywords.includes(keyword)) {
      toast.error(`"${keyword}" is already listed`)
      return
    }
    onAdd(keyword)
    setDraft("")
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {keywords.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No keywords yet — transactions can still be assigned by hand in Review.
          </p>
        )}
        {keywords.map((keyword) => (
          <Badge key={keyword} variant="secondary" className="gap-1 py-1 font-mono font-normal">
            {keyword}
            <button
              type="button"
              onClick={() => onRemove(keyword)}
              className="rounded-sm text-muted-foreground transition-colors hover:text-foreground"
              aria-label={`Remove ${keyword}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="h-9 max-w-xs font-mono text-xs"
        />
        <Button type="submit" variant="outline" size="sm" disabled={!draft.trim()}>
          Add
        </Button>
      </form>
    </div>
  )
}

export default function Rules() {
  const [config, setConfig] = useState(null)
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [renaming, setRenaming] = useState(false)
  const [renameTo, setRenameTo] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [moveTo, setMoveTo] = useState("")

  useEffect(() => {
    client
      .get("/api/rules")
      .then(({ data }) => {
        setConfig(data)
        setSelected((current) => current ?? data.categories[0] ?? null)
      })
      .catch(() => toast.error("Could not load rules"))
  }, [])

  async function request(fn, successMessage) {
    setBusy(true)
    try {
      const { data } = await fn()
      setConfig(data)
      if (successMessage) toast.success(successMessage(data))
      return data
    } catch (err) {
      toast.error(err.response?.data?.detail ?? "Could not save")
      return null
    } finally {
      setBusy(false)
    }
  }

  function saveConfig(next) {
    const merged = { ...config, ...next }
    return request(() =>
      client.put("/api/rules", {
        categories: merged.categories,
        income_categories: merged.income_categories,
        excluded: merged.excluded,
        rules: merged.rules,
      })
    )
  }

  async function addCategory(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const data = await request(
      () => client.post("/api/rules/categories", { name }),
      () => `${name} added`
    )
    if (data) {
      setSelected(name)
      setNewName("")
      setAdding(false)
    }
  }

  async function renameCategory(e) {
    e.preventDefault()
    const name = renameTo.trim()
    if (!name || name === selected) {
      setRenaming(false)
      return
    }
    const data = await request(
      () => client.post(`/api/rules/categories/${encodeURIComponent(selected)}/rename`, { new_name: name }),
      (d) =>
        d.migrated
          ? `Renamed to ${name} · ${d.migrated} transactions updated`
          : `Renamed to ${name}`
    )
    if (data) {
      setSelected(name)
      setRenaming(false)
    }
  }

  async function deleteCategory() {
    const query = moveTo ? `?move_to=${encodeURIComponent(moveTo)}` : ""
    const data = await request(
      () => client.delete(`/api/rules/categories/${encodeURIComponent(selected)}${query}`),
      (d) =>
        d.migrated
          ? `${selected} deleted · ${d.migrated} transactions moved to ${moveTo}`
          : `${selected} deleted`
    )
    if (data) {
      setDeleting(false)
      setMoveTo("")
      setSelected(data.categories[0] ?? null)
    }
  }

  if (!config) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const isExcluded = selected === EXCLUDED
  const keywords = isExcluded ? config.excluded : config.rules[selected] ?? []
  const count = config.counts?.[selected] ?? 0
  const isIncome = config.income_categories.includes(selected)

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Rules</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Keywords are matched against the merchant name. The longest match wins, so order
            does not matter.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus /> Category
        </Button>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[14rem_1fr]">
        <nav className="space-y-0.5">
          {config.categories.map((category) => (
            <button
              key={category}
              onClick={() => {
                setSelected(category)
                setRenaming(false)
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                selected === category
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              )}
            >
              <span className="truncate">{category}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {config.counts?.[category] ?? 0}
              </span>
            </button>
          ))}

          <div className="pt-2">
            <button
              onClick={() => {
                setSelected(EXCLUDED)
                setRenaming(false)
              }}
              className={cn(
                "flex w-full items-center rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                isExcluded
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              )}
            >
              Excluded
            </button>
          </div>
        </nav>

        <div className="rounded-lg border border-border p-6">
          {isExcluded ? (
            <>
              <h2 className="text-sm font-semibold tracking-tight">Excluded</h2>
              <p className="mt-1 mb-5 text-sm text-muted-foreground">
                Merchants containing these keywords are left out of every spending view.
                Checked before any category rule.
              </p>
              <KeywordEditor
                keywords={config.excluded}
                placeholder="round up"
                onAdd={(keyword) => saveConfig({ excluded: [...config.excluded, keyword] })}
                onRemove={(keyword) =>
                  saveConfig({ excluded: config.excluded.filter((k) => k !== keyword) })
                }
              />
            </>
          ) : selected ? (
            <>
              <div className="flex items-start justify-between gap-4">
                {renaming ? (
                  <form onSubmit={renameCategory} className="flex gap-2">
                    <Input
                      autoFocus
                      value={renameTo}
                      onChange={(e) => setRenameTo(e.target.value)}
                      onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
                      className="h-8 w-48"
                    />
                    <Button type="submit" size="sm" disabled={busy}>
                      Save
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setRenaming(false)}>
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold tracking-tight">{selected}</h2>
                    {isIncome && <Badge variant="outline">Income</Badge>}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {!renaming && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRenameTo(selected)
                        setRenaming(true)
                      }}
                    >
                      Rename
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setMoveTo("")
                      setDeleting(true)
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <p className="mt-1 mb-5 text-sm text-muted-foreground">
                {count} transaction{count === 1 ? "" : "s"}
              </p>

              <KeywordEditor
                keywords={keywords}
                placeholder="tesco"
                onAdd={(keyword) =>
                  saveConfig({
                    rules: { ...config.rules, [selected]: [...keywords, keyword] },
                  })
                }
                onRemove={(keyword) =>
                  saveConfig({
                    rules: {
                      ...config.rules,
                      [selected]: keywords.filter((k) => k !== keyword),
                    },
                  })
                }
              />

              <label className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={isIncome}
                  disabled={busy}
                  onChange={(e) =>
                    saveConfig({
                      income_categories: e.target.checked
                        ? [...config.income_categories, selected]
                        : config.income_categories.filter((c) => c !== selected),
                    })
                  }
                  className="h-4 w-4 rounded border-input accent-foreground"
                />
                Income category — money coming in, excluded from spending totals
              </label>
            </>
          ) : null}
        </div>
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
            <DialogDescription>
              Keywords can be added once it exists, or picked up from the Review tab.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addCategory} className="flex flex-col gap-4">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Holidays"
            />
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !newName.trim()}>
                Add category
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {selected}?</DialogTitle>
            <DialogDescription>
              {count > 0
                ? `${count} transaction${count === 1 ? "" : "s"} use this category. Choose where they should go.`
                : "This category has no transactions. Its keywords will be removed too."}
            </DialogDescription>
          </DialogHeader>

          {count > 0 && (
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger>
                <SelectValue placeholder="Move them to…" />
              </SelectTrigger>
              <SelectContent>
                {config.categories
                  .filter((c) => c !== selected)
                  .map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || (count > 0 && !moveTo)}
              onClick={deleteCategory}
            >
              {count > 0 ? "Delete & move" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
