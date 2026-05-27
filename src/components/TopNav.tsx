import { Link, useRouterState } from "@tanstack/react-router";
import {
  ListChecks,
  Users as UsersIcon,
} from "lucide-react";
import { LogoutButton } from "@/components/AuthGate";
import { ChangeOperatorButton } from "@/components/operator/OperatorPicker";
import tivoLogo from "@/assets/tivo-logo.png";
import { useCurrentRole, hasAccess, type Role } from "@/lib/roles";
import { HeaderSlotOutlet } from "@/components/HeaderSlot";

type NavItem = {
  to: string;
  label: string;
  icon: typeof ListChecks;
  exact: boolean;
  roles: readonly Role[];
};

const navItems: readonly NavItem[] = [
  { to: "/leadi", label: "Leadi", icon: UsersIcon, exact: false, roles: ["admin", "manager", "agent"] },
  { to: "/uzdevumi", label: "Uzdevumi", icon: ListChecks, exact: false, roles: ["admin", "manager", "agent"] },
];

export function TopNav() {
  const role = useCurrentRole();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const visible = navItems.filter((i) => hasAccess(role, i.roles));
  void pathname;

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
          {visible.map((item) => (
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

          <div className="ml-2 flex items-center gap-1 border-l border-border pl-2">
            <ChangeOperatorButton />
            <LogoutButton />
          </div>
        </nav>
      </div>
    </header>
  );
}