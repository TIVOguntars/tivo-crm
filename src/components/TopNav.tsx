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
} from "lucide-react";
import { LogoutButton } from "@/components/AuthGate";
import { ChangeOperatorButton } from "@/components/operator/OperatorPicker";
import tivoLogo from "@/assets/tivo-logo.png";
import { useCurrentRole, hasAccess, type Role } from "@/lib/roles";
import { HeaderSlotOutlet } from "@/components/HeaderSlot";
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
  roles: readonly Role[];
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

const triggerClass =
  "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap";

export function TopNav() {
  const role = useCurrentRole();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const visibleGroups = groups.filter((g) => hasAccess(role, g.roles));

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[96rem] items-center justify-between gap-6 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <img src={tivoLogo} alt="TIVO" className="h-7 w-auto" />
          <span className="text-sm font-semibold tracking-tight">CRM</span>
          <HeaderSlotOutlet className="ml-[50px] flex items-center" />
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto">
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

          <div className="ml-2 flex items-center gap-1 border-l border-border pl-2">
            <ChangeOperatorButton />
            <LogoutButton />
          </div>
        </nav>
      </div>
    </header>
  );
}
