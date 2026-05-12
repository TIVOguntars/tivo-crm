import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  ClipboardCheck,
  Building2,
  ListChecks,
  MessageSquare,
  PieChart,
  Settings,
  ShieldCheck,
  Users as UsersIcon,
  UserCog,
  PencilLine,
  Inbox,
} from "lucide-react";
import { LogoutButton } from "@/components/AuthGate";
import tivoLogo from "@/assets/tivo-logo.png";
import { useCurrentRole, hasAccess, type Role } from "@/lib/roles";

type NavItem = {
  to: string;
  label: string;
  icon: typeof BarChart3;
  exact: boolean;
  roles: readonly Role[];
};

const items: readonly NavItem[] = [
  { to: "/import-review", label: "Importa pārskats", icon: ClipboardCheck, exact: false, roles: ["admin", "manager"] },
  { to: "/", label: "Pārskats", icon: BarChart3, exact: true, roles: ["admin", "manager", "agent", "viewer"] },
  { to: "/leadi", label: "Leadi", icon: UsersIcon, exact: false, roles: ["admin", "manager", "agent"] },
  { to: "/manual-corrections", label: "Korekcijas", icon: PencilLine, exact: false, roles: ["admin", "manager"] },
  { to: "/queue", label: "Uzdevumi", icon: ListChecks, exact: false, roles: ["admin", "manager", "agent"] },
  { to: "/objects", label: "Objekti", icon: Building2, exact: false, roles: ["admin", "manager", "agent"] },
  { to: "/komunikacijas", label: "Komunikācijas", icon: MessageSquare, exact: false, roles: ["admin", "manager", "agent"] },
  { to: "/ienakosas-zinas", label: "Ienākošās", icon: Inbox, exact: false, roles: ["admin", "manager", "agent"] },
  { to: "/analytics", label: "Analītika", icon: PieChart, exact: false, roles: ["admin", "manager"] },
  { to: "/settings", label: "Iestatījumi", icon: Settings, exact: false, roles: ["admin"] },
  { to: "/users", label: "Lietotāji", icon: UserCog, exact: false, roles: ["admin"] },
  { to: "/audit-log", label: "Audits", icon: ShieldCheck, exact: false, roles: ["admin"] },
];

export function TopNav() {
  const role = useCurrentRole();
  const visible = items.filter((i) => hasAccess(role, i.roles));
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[96rem] items-center justify-between gap-6 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <img src={tivoLogo} alt="TIVO" className="h-7 w-auto" />
          <span className="text-sm font-semibold tracking-tight">CRM</span>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {visible.map((item) => (
            <Link
              key={item.to}
              to={item.to as never}
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