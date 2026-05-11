import { Link } from "@tanstack/react-router";
import { BarChart3, Filter, ListChecks, MessageSquare } from "lucide-react";
import { LogoutButton } from "@/components/AuthGate";
import tivoLogo from "@/assets/tivo-logo.png";

const items = [
  { to: "/", label: "Pārskats", icon: BarChart3, exact: true },
  { to: "/queue", label: "Darba rinda", icon: ListChecks, exact: false },
  { to: "/funnel", label: "Funnel", icon: Filter, exact: false },
  { to: "/komunikacijas", label: "Komunikācijas", icon: MessageSquare, exact: false },
] as const;

export function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <img src={tivoLogo} alt="TIVO" className="h-7 w-auto" />
          <span className="text-sm font-semibold tracking-tight">CRM</span>
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
          <div className="ml-2 border-l border-border pl-2">
            <LogoutButton />
          </div>
        </nav>
      </div>
    </header>
  );
}