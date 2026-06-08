import { useEffect, useState } from "react"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import client from "@/api/client"

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

const chartStyle = {
  fontSize: 12,
  fontFamily: "inherit",
}

const axisStyle = {
  fill: "hsl(240 3.8% 46.1%)",
  fontSize: 11,
  fontFamily: "inherit",
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 shadow-sm text-xs">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: £{Number(p.value).toFixed(2)}
        </p>
      ))}
    </div>
  )
}

export default function Trends() {
  const [raw, setRaw] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client.get("/transactions/trends")
      .then(({ data }) => setRaw(data.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-10">
        <div>
          <Skeleton className="h-5 w-40 mb-4" />
          <Skeleton className="h-[400px] w-full" />
        </div>
        <div>
          <Skeleton className="h-5 w-40 mb-4" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    )
  }

  // Weekly line chart data — one point per ISO week
  const lineData = raw.map((d) => ({
    label: `W${d.week} '${String(d.year).slice(2)}`,
    total: d.total,
  }))

  // Monthly stacked bar — aggregate from raw (which is weekly) by year+month
  const monthMap = {}
  for (const d of raw) {
    const key = `${d.year}-${String(d.month).padStart(2, "0")}`
    if (!monthMap[key]) monthMap[key] = { label: `${MONTH_NAMES[d.month - 1]} '${String(d.year).slice(2)}`, total: 0 }
    monthMap[key].total += d.total
  }
  const barData = Object.values(monthMap)

  return (
    <div>
      <h1 className="text-lg font-semibold tracking-tight mb-8">Trends</h1>

      <div className="space-y-12">
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-4">Weekly spend</h2>
          <div style={{ height: 400 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData} style={chartStyle}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 5.9% 90%)" />
                <XAxis
                  dataKey="label"
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(240 5.9% 90%)" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `£${v}`}
                  width={60}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total"
                  stroke="hsl(240 5.9% 10%)"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-4">Monthly spend</h2>
          <div style={{ height: 400 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} style={chartStyle}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 5.9% 90%)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(240 5.9% 90%)" }}
                />
                <YAxis
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `£${v}`}
                  width={60}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" name="Total" fill="#4e79a7" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  )
}
