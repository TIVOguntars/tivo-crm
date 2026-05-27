import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { UserRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearStoredOperator,
  displayName,
  listAssignableUsers,
  setStoredOperator,
  type AssignableUser,
} from "@/lib/users";
import {
  notifyOperatorChanged,
  useCurrentUser,
} from "@/hooks/useCurrentUser";

/**
 * Blocking modal that forces the operator to pick their crm.profiles row
 * after the shared password gate. Beta-only operator identity — NOT auth.
 */
export function OperatorPickerGate({ children }: { children: ReactNode }) {
  const { operatorId } = useCurrentUser();
  if (!operatorId) {
    return <OperatorPickerModal mandatory />;
  }
  return <>{children}</>;
}

export function OperatorPickerModal({
  mandatory = false,
  open: controlledOpen,
  onOpenChange,
}: {
  mandatory?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(true);
  const open = controlledOpen ?? (mandatory ? true : internalOpen);
  const setOpen = (next: boolean) => {
    if (mandatory) return;
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  };

  const [q, setQ] = useState("");
  const [pickingId, setPickingId] = useState<string | null>(null);

  const usersQ = useQuery({
    queryKey: ["crm", "assignable_users"],
    queryFn: listAssignableUsers,
    staleTime: 5 * 60_000,
  });

  const users: AssignableUser[] = usersQ.data ?? [];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => {
      const hay = [u.full_name, u.email, u.user_code]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [users, q]);

  async function selectOperator(u: AssignableUser) {
    setPickingId(u.id);
    try {
      setStoredOperator(u);
      notifyOperatorChanged();
      await qc.invalidateQueries({ queryKey: ["crm"] });
      setOpen(false);
    } finally {
      setPickingId(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && mandatory) return;
        setOpen(o);
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => {
          if (mandatory) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (mandatory) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Izvēlies operatoru</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Šī izvēle palīdz piesaistīt uzdevumus tev. Tā nav autentifikācija — slēgtam beta lietojumam.
        </p>
        <div className="space-y-2">
          <Input
            placeholder="Meklēt vārdu, e-pastu vai kodu…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            {usersQ.isLoading ? (
              <div className="p-3 text-xs text-muted-foreground">Ielādē…</div>
            ) : filtered.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">
                Nav atrasti aktīvi operatori.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => void selectOperator(u)}
                      disabled={pickingId !== null}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-secondary disabled:opacity-60"
                    >
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-[10px] font-medium text-foreground">
                        {(u.user_code || displayName(u).slice(0, 2)).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">
                          {displayName(u)}
                        </span>
                        {u.email && u.email !== displayName(u) && (
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {u.email}
                          </span>
                        )}
                      </span>
                      {pickingId === u.id && (
                        <span className="text-[11px] text-muted-foreground">
                          Saglabā…
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Small inline trigger to switch operator from the top nav. */
export function ChangeOperatorButton() {
  const { stored } = useCurrentUser();
  const [open, setOpen] = useState(false);

  const label = stored?.full_name
    ? stored.full_name
    : "Nav operatora";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex max-w-[14rem] items-center gap-1.5 truncate rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        title="Mainīt operatoru"
      >
        <UserRound className="h-3.5 w-3.5" />
        <span className="truncate">{label}</span>
      </button>
      {open && (
        <OperatorPickerModal
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}

/** Convenience: dev-only "log out" of the operator selection. */
export function clearOperatorAndReload() {
  clearStoredOperator();
  notifyOperatorChanged();
  if (typeof window !== "undefined") window.location.reload();
}

/** Suppress unused warning when only `Button` is imported via barrel later. */
export { Button };