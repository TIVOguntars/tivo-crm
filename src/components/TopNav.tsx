import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  ClipboardCheck,
  Building2,
  ListChecks,
  MessageSquare,
  PieChart,
  Settings,
  ShieldCheck,
  // Users icon removed with /leadi page
  UserCog,
  PencilLine,
  Inbox,
  Briefcase,
  ChevronDown,
} from "lucide-react";
import { LogoutButton } from "@/components/AuthGate";
import tivoLogo from "@/assets/tivo-logo.png";
import { useCurrentRole, hasAccess, type Role } from "@/lib/roles";
import { HeaderSlotOutlet } from "@/components/HeaderSlot";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = {
  to: string;
  label: string;
  icon: typeof BarChart3;
  exact: boolean;
  roles: readonly Role[];
};

const primaryItems: readonly NavItem[] = [
  { to: "/", label: "Pārskats", icon: BarChart3, exact: true, roles: ["admin", "manager", "agent", "viewer"] },
  { to: "/analytics", label: "Analītika", icon: PieChart, exact: false, roles: ["admin", "manager"] },
  { to: "/settings", label: "Iestatījumi", icon: Settings, exact: false, roles: ["admin"] },
  { to: "/users", label: "Lietotāji", icon: UserCog, exact: false, roles: ["admin"] },
  { to: "/audit-log", label: "Audits", icon: ShieldCheck, exact: false, roles: ["admin"] },
];

const darbsItems: readonly NavItem[] = [
  { to: "/objects", label: "Objekti", icon: Building2, exact: false, roles: ["admin", "manager", "agent"] },
  { to: "/queue", label: "Uzdevumi", icon: ListChecks, exact: false, roles: ["admin", "manager", "agent"] },
  { to: "/komunikacijas", label: "Komunikācijas", icon: MessageSquare, exact: false, roles: ["admin", "manager", "agent"] },
  { to: "/ienakosas-zinas", label: "Ienākošās", icon: Inbox, exact: false, roles: ["admin", "manager", "agent"] },
  { to: "/import-review", label: "Importi", icon: ClipboardCheck, exact: false, roles: ["admin", "manager"] },
  { to: "/manual-corrections", label: "Korekcijas", icon: PencilLine, exact: false, roles: ["admin", "manager"] },
];

const adminDarbsRoutes = new Set(["/import-review", "/manual-corrections"]);

export function TopNav() {
  const role = useCurrentRole();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const visiblePrimary = primaryItems.filter((i) => hasAccess(role, i.roles));
  const visibleDarbs = darbsItems.filter((i) => hasAccess(role, i.roles));
  const darbsActive = visibleDarbs.some((i) => pathname.startsWith(i.to));

  const linkClass =
    "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[96rem] items-center justify-between gap-6 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <img src={tivoLogo} alt="TIVO" className="h-7 w-auto" />
          <span className="text-sm font-semibold tracking-tight">CRM</span>
          <HeaderSlotOutlet className="ml-[50px] flex items-center" />
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: "bg-secondary text-foreground" }}
            inactiveProps={{
              className: "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
            }}
            className={linkClass}
          >
            <BarChart3 className="h-4 w-4" />
            Pārskats
          </Link>

          {visibleDarbs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={`${linkClass} ${
                  darbsActive
                    ? "bg-secondary text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                <Briefcase className="h-4 w-4" />
                Darbs
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[260px] p-1.5">
                {(() => {
                  const operational = visibleDarbs.filter((i) => !adminDarbsRoutes.has(i.to));
                  const admin = visibleDarbs.filter((i) => adminDarbsRoutes.has(i.to));
                  const renderItem = (item: NavItem, opts?: { subtle?: boolean }) => {
                    const isActive =
                      pathname === item.to || pathname.startsWith(item.to + "/");
                    const subtle = opts?.subtle && !isActive;
                    return (
                      <DropdownMenuItem key={item.to} asChild>
                        <Link
                          to={item.to as never}
                          className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors cursor-pointer ${
                            isActive
                              ? "bg-secondary text-foreground font-medium"
                              : subtle
                              ? "text-muted-foreground/70 hover:bg-secondary/50 hover:text-foreground focus:bg-secondary/50 focus:text-foreground"
                              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground focus:bg-secondary/60 focus:text-foreground"
                          }`}
                        >
                          <item.icon
                            className={`h-4 w-4 ${
                              isActive ? "text-foreground" : subtle ? "opacity-70" : ""
                            }`}
                          />
                          <span className="flex-1">{item.label}</span>
                          {isActive && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        </Link>
                      </DropdownMenuItem>
                    );
                  };
                  return (
                    <>
                      {operational.map((i) => renderItem(i))}
                      {operational.length > 0 && admin.length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          <div className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                            Admin
                          </div>
                        </>
                      )}
                      {admin.map((i) => renderItem(i, { subtle: true }))}
                    </>
                  );
                })()}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {visiblePrimary
            .filter((i) => i.to !== "/")
            .map((item) => (
              <Link
                key={item.to}
                to={item.to as never}
                activeOptions={{ exact: item.exact }}
                activeProps={{ className: "bg-secondary text-foreground" }}
                inactiveProps={{
                  className:
                    "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                }}
                className={linkClass}
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