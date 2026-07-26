import { useEffect, useState } from "react"
import { NavLink, Outlet, useLocation } from "react-router-dom"
import { cn } from "@/lib/utils"
import client from "@/api/client"

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/trends", label: "Trends" },
  { to: "/review", label: "Review" },
  { to: "/rules", label: "Rules" },
  { to: "/chat", label: "Chat" },
]

export default function Layout() {
  const location = useLocation()
  const [pending, setPending] = useState(0)

  // Re-checked on every navigation, so the badge settles after an import or a review
  useEffect(() => {
    client
      .get("/transactions/review")
      .then(({ data }) => setPending(data.total))
      .catch(() => setPending(0))
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between h-14">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Finance
          </span>
          <nav className="flex items-center gap-1">
            {links.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors",
                    isActive
                      ? "bg-secondary text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  )
                }
              >
                {label}
                {to === "/review" && pending > 0 && (
                  <span className="rounded bg-foreground px-1.5 text-[11px] font-medium leading-4 tabular-nums text-background">
                    {pending}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
