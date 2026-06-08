import { NavLink, Outlet } from "react-router-dom"
import { cn } from "@/lib/utils"

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/trends", label: "Trends" },
  { to: "/chat", label: "Chat" },
]

export default function Layout() {
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
                    "px-3 py-1.5 rounded-md text-sm transition-colors",
                    isActive
                      ? "bg-secondary text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  )
                }
              >
                {label}
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
