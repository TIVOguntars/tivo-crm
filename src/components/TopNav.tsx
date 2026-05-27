import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Briefcase,
  FileBarChart2,
  PieChart,
  Settings,
  Users as UsersIcon,
  ShieldCheck,
  ChevronDown,
  Home,
  ListChecks,
  Building2,
  Bot,
  ClipboardList,
  Mail,
  MessageSquare,
  ClipboardCheck,
  BarChart3,
  TrendingUp,
  Megaphone,
  Target,
  Tag,
  GitBranch,
  FileText,
  Zap,
  Plug,
  ShieldAlert,
  Bell,
  Cog,
  MessageCircle,
  UserRound,
} from "lucide-react";
import { LogoutButton } from "@/components/AuthGate";
import { OperatorPickerModal } from "@/components/operator/OperatorPicker";
import tivoLogo from "@/assets/tivo-logo.png";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Icon = typeof Home;
type NavItem = { to: string; label: string; icon: Icon };
type NavGroup = {
  label: string;
  icon: Icon;
  roles: readonly string[];
  items: readonly NavItem[];
};

const ALL_ROLES = ["admin", "manager", "agent", "viewer"] as const;
const STAFF = ["admin", "manager", "agent"] as const;
const MGMT = ["admin", "manager"] as const;
const ADMIN_ONLY = ["admin"] as const;

const groups: readonly NavGroup[] = [
  {
    label: "Sākums",
    icon: LayoutDashboard,
    roles: ALL_ROLES,
    items: [{ to: "/panelis", label: "Panelis", icon: Home }],
  },
  {
    label: "Darbs",
    icon: Briefcase,
    roles: STAFF,
    items: [
      { to: "/leadi", label: "Leadi", icon: UsersIcon },
      { to: "/objekti", label: "Objekti", icon: Building2 },
      { to: "/uzdevumi", label: "Uzdevumi", icon: ListChecks },
      { to: "/uzdevumi-sis", label: "Uzdevumi SIS", icon: ClipboardList },
      { to: "/sis-darba-rinda", label: "SIS darba rinda", icon: Bot },
      { to: "/e-pasti", label: "E-pasti", icon: Mail },
      { to: "/sarakstes", label: "Sarakstes", icon: MessageSquare },
      { to: "/import-review", label: "Import review", icon: ClipboardCheck },
    ],
  },
  {
    label: "Pārskati",
    icon: FileBarChart2,
    roles: MGMT,
    items: [
      { to: "/parskati/vadiba", label: "Vadības pārskats", icon: BarChart3 },
      { to: "/parskati/marketings", label: "Mārketinga pārskats", icon: Megaphone },
      { to: "/parskati/ppv", label: "PPV pārskats", icon: Target },
    ],
  },
  {
    label: "Analītika",
    icon: PieChart,
    roles: MGMT,
    items: [{ to: "/analitika", label: "Analītika", icon: TrendingUp }],
  },
  {
    label: "Iestatījumi",
    icon: Settings,
    roles: ADMIN_ONLY,
    items: [
      { to: "/iestatijumi/statusi", label: "Statusi", icon: Tag },
      { to: "/iestatijumi/workflows", label: "Workflows", icon: GitBranch },
      { to: "/iestatijumi/templates", label: "Templates", icon: FileText },
      { to: "/iestatijumi/automatizacijas", label: "Automatizācijas", icon: Zap },
      { to: "/iestatijumi/integracijas", label: "Integrācijas", icon: Plug },
      { to: "/iestatijumi/validacijas", label: "Validācijas", icon: ShieldAlert },
      { to: "/iestatijumi/pazinojumi", label: "Paziņojumi", icon: Bell },
      { to: "/iestatijumi/sis", label: "SIS iestatījumi", icon: Cog },
      { to: "/iestatijumi/komunikacijas", label: "Komunikāciju iestatījumi", icon: MessageCircle },
    ],
  },
  {
    label: "Lietotāji un lomas",
    icon: UsersIcon,
    roles: ADMIN_ONLY,
    items: [{ to: "/lietotaji", label: "Lietotāji un lomas", icon: UsersIcon }],
  },
  {
    label: "Audits",
    icon: ShieldCheck,
    roles: ADMIN_ONLY,
    items: [{ to: "/audits", label: "Audits", icon: ShieldCheck }],
  },
];

/** Per-route page title + subtitle shown in the global header. */
const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  "/panelis": { title: "Panelis", subtitle: "Lietotāja darba pārskats" },
  "/leadi": { title: "Leadi", subtitle: "Analītiskā leadu darba vide" },
  "/objekti": { title: "Objekti", subtitle: "Objektu pārvaldība" },
  "/uzdevumi": { title: "Uzdevumi", subtitle: "Aktīvie un plānotie uzdevumi" },
  "/uzdevumi-sis": { title: "Uzdevumi SIS", subtitle: "SIS ģenerētie uzdevumi" },
  "/sis-darba-rinda": { title: "SIS darba rinda", subtitle: "Automātiskā darba rinda" },
  "/e-pasti": { title: "E-pasti", subtitle: "Ienākošā un izejošā e-pasta plūsma" },
  "/sarakstes": { title: "Sarakstes", subtitle: "Klientu sarakstes vēsture" },
  "/import-review": { title: "Import review", subtitle: "Importēto datu pārskats" },
  "/parskati/vadiba": { title: "Vadības pārskats", subtitle: "Augstā līmeņa rādītāji" },
  "/parskati/marketings": { title: "Mārketinga pārskats", subtitle: "Kampaņu efektivitāte" },
  "/parskati/ppv": { title: "PPV pārskats", subtitle: "PPV plūsmas analīze" },
  "/analitika": { title: "Analītika", subtitle: "Detalizēta datu analītika" },
  "/iestatijumi/statusi": { title: "Statusi", subtitle: "Statusu konfigurācija" },
  "/iestatijumi/workflows": { title: "Workflows", subtitle: "Darbplūsmu konfigurācija" },
  "/iestatijumi/templates": { title: "Templates", subtitle: "Veidņu pārvaldība" },
  "/iestatijumi/automatizacijas": { title: "Automatizācijas", subtitle: "Automātiskās darbības" },
  "/iestatijumi/integracijas": { title: "Integrācijas", subtitle: "Ārējās integrācijas" },
  "/iestatijumi/validacijas": { title: "Validācijas", subtitle: "Datu validācijas noteikumi" },
  "/iestatijumi/pazinojumi": { title: "Paziņojumi", subtitle: "Paziņojumu iestatījumi" },
  "/iestatijumi/sis": { title: "SIS iestatījumi", subtitle: "SIS konfigurācija" },
  "/iestatijumi/komunikacijas": { title: "Komunikāciju iestatījumi", subtitle: "Kanālu konfigurācija" },
  "/lietotaji": { title: "Lietotāji un lomas", subtitle: "Piekļuves pārvaldība" },
  "/audits": { title: "Audits", subtitle: "Sistēmas audita pieraksti" },
};

function resolvePageTitle(pathname: string): { title: string; subtitle: string } {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith("/lead/")) {
    return { title: "Leada 360° profils", subtitle: "Pilna leada darba vide" };
  }
  // Longest-prefix match for nested routes.
  let best: { title: string; subtitle: string } | null = null;
  let bestLen = 0;
  for (const [key, val] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(key + "/") && key.length > bestLen) {
      best = val;
      bestLen = key.length;
    }
  }
  return best ?? { title: "CRM", subtitle: "TIVO darba vide" };
}

const triggerClass =
  "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap";

export function TopNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile, stored, roleKeys, isAdmin, isReady } = useCurrentUser();
  // Fail closed: hide role-gated groups until roles are loaded server-side.
  const visibleGroups = isReady
    ? groups.filter(
        (g) => isAdmin || g.roles.some((r) => roleKeys.includes(r)),
      )
    : [];
  const [operatorOpen, setOperatorOpen] = useState(false);
  const userCode =
    (profile?.user_code && profile.user_code.trim()) ||
    (stored?.full_name ? "" : "");
  const codeLabel = userCode || "—";
  const page = resolvePageTitle(pathname);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[96rem] items-center px-4 sm:px-6">
        <Link
          to="/panelis"
          className="flex items-center gap-2 rounded-md transition-opacity hover:opacity-80"
          aria-label="Uz sākumlapu"
        >
          <img src={tivoLogo} alt="TIVO" className="h-7 w-auto" />
          <span className="text-sm font-semibold tracking-tight">CRM</span>
        </Link>
        <div className="ml-[50px] flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold text-foreground">
            {page.title}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {page.subtitle}
          </span>
        </div>
        <nav className="ml-auto flex items-center gap-1 overflow-x-auto">
          {visibleGroups.map((group) => {
            const groupActive = group.items.some(
              (i) => pathname === i.to || pathname.startsWith(i.to + "/"),
            );

            if (group.items.length === 1) {
              const item = group.items[0];
              const isActive =
                pathname === item.to || pathname.startsWith(item.to + "/");
              return (
                <Link
                  key={group.label}
                  to={item.to as never}
                  className={`${triggerClass} ${
                    isActive
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}
                >
                  <group.icon className="h-4 w-4" />
                  {group.label}
                </Link>
              );
            }

            return (
              <DropdownMenu key={group.label}>
                <DropdownMenuTrigger
                  className={`${triggerClass} ${
                    groupActive
                      ? "bg-secondary text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}
                >
                  <group.icon className="h-4 w-4" />
                  {group.label}
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[260px] p-1.5">
                  {group.items.map((item) => {
                    const isActive =
                      pathname === item.to || pathname.startsWith(item.to + "/");
                    return (
                      <DropdownMenuItem key={item.to} asChild>
                        <Link
                          to={item.to as never}
                          className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors cursor-pointer ${
                            isActive
                              ? "bg-secondary text-foreground font-medium"
                              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground focus:bg-secondary/60 focus:text-foreground"
                          }`}
                        >
                          <item.icon className="h-4 w-4" />
                          <span className="flex-1">{item.label}</span>
                          {isActive && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}

        </nav>
        <button
          type="button"
          onClick={() => setOperatorOpen(true)}
          title="Mainīt operatoru"
          className="ml-[30px] inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-foreground">
            <UserRound className="h-3.5 w-3.5" />
          </span>
          <span className="font-mono text-xs text-foreground">{codeLabel}</span>
        </button>
        <div className="ml-[30px]">
          <LogoutButton />
        </div>
        {operatorOpen && (
          <OperatorPickerModal open={operatorOpen} onOpenChange={setOperatorOpen} />
        )}
      </div>
    </header>
  );
}
