import { Link } from "@tanstack/react-router";
import { BarChart3, Filter, MessageSquare, Users } from "lucide-react";

const items = [
  { to: "/", label: "Pārskats", icon: BarChart3, exact: true },
  { to: "/funnel", label: "Funnel", icon: Filter, exact: false },
  { to: "/komunikacijas", label: "Komunikācijas", icon: MessageSquare, exact: false },
  { to: "/leadi", label: "Leadi", icon: Users, exact: false },
] as const;

export function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BarChart3 className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">
            Analītika
          </span>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              activeProps={{
                className:
                  "bg-secondary text-foreground",
              }}
              inactiveProps={{
                className: "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
              }}
              className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}