import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import client from "@/api/client"

const STARTERS = [
  "How much did I spend last month?",
  "What did I spend on eating out this month?",
  "What are my biggest spending categories?",
  "How much have I spent on subscriptions?",
]

function LoadingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}

function ReferencedTransactions({ transactions }) {
  const [open, setOpen] = useState(false)
  if (!transactions?.length) return null

  return (
    <div className="mt-2 px-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
      >
        <span>{open ? "▾" : "▸"}</span>
        {transactions.length} transaction{transactions.length !== 1 ? "s" : ""} referenced
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-border overflow-hidden text-xs">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Merchant</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Amount</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Category</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{tx.date}</td>
                  <td className="px-3 py-2">{tx.merchant}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums font-medium", tx.amount < 0 ? "" : "text-emerald-600")}>
                    {tx.amount < 0 ? "-" : "+"}£{Math.abs(tx.amount).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{tx.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function Chat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  async function send(text) {
    const message = text ?? input.trim()
    if (!message || loading) return
    setInput("")

    const userMsg = { role: "user", content: message }
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    try {
      const { data } = await client.post("/chat", { message, history })
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          transactions_used: data.transactions_used,
          referenced_transactions: data.referenced_transactions ?? [],
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again.", transactions_used: 0, referenced_transactions: [] },
      ])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const hasMessages = messages.length > 0

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 3.5rem - 4rem)" }}>
      {/* Thread */}
      <div className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 pb-8">
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Ask about your spending</p>
              <p className="text-sm text-muted-foreground mt-1">Questions are answered using your imported statements.</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {STARTERS.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  className="text-sm text-muted-foreground h-auto py-1.5 px-3"
                  onClick={() => send(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto py-6 space-y-6">
            <div className="flex justify-end">
              <button
                onClick={() => setMessages([])}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear conversation
              </button>
            </div>

            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex flex-col gap-1",
                  msg.role === "user" ? "items-end" : "items-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-prose rounded-xl px-4 py-3 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-secondary text-foreground"
                      : "text-foreground"
                  )}
                >
                  {msg.content}
                </div>
                {msg.role === "assistant" && (
                  <ReferencedTransactions transactions={msg.referenced_transactions} />
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-start">
                <LoadingDots />
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}

        {!hasMessages && <div ref={bottomRef} />}
      </div>

      {/* Input bar */}
      <div className="border-t border-border pt-4">
        <div className="max-w-2xl mx-auto flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about your spending…"
            className="text-sm"
            disabled={loading}
          />
          <Button
            size="sm"
            onClick={() => send()}
            disabled={!input.trim() || loading}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}
