import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { useCrmView } from "@/hooks/useCrmView";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createCrmProfile, updateCrmProfile } from "@/server/analytics";
import { toast } from "sonner";

export const Route = createFileRoute("/users")({
  component: UsersPage,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState message={error.message} />
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Lapa nav atrasta</div>,
});

type Row = Record<string, unknown>;

function s(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function fmtDate(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("lv-LV", {
    timeZone: "Europe/Riga",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

const STATUS_LV: Record<string, string> = {
  active: "Aktīvs",
  inactive: "Neaktīvs",
};

function statusLabel(raw: string): string {
  const key = raw.toLowerCase().trim();
  return STATUS_LV[key] ?? raw;
}

function StatusBadge({ status }: { status: string }) {
  const label = statusLabel(status);
  const isActive = status.toLowerCase().trim() === "active";
  return (
    <Badge
      variant="secondary"
      className={cn(
        "h-5 rounded px-1.5 py-0 text-[11px] font-medium leading-none border-transparent",
        isActive
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
          : "bg-slate-200 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200"
      )}
    >
      {label}
    </Badge>
  );
}

function UsersPage() {
  const view = useCrmView(
    "profiles",
    "select=id,full_name,email,user_code,is_active,status_key,created_at&order=full_name.asc&limit=1000",
    { all: true }
  );

  const rows = (view.data?.rows ?? []) as Row[];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (r: Row) => {
    setEditing(r);
    setOpen(true);
  };

  if (view.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Lietotāji" />
        <LoadingState label="Ielādē lietotājus..." />
      </div>
    );
  }

  if (view.error || view.data?.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Lietotāji" />
        <ErrorState
          message={view.error?.message ?? (view.data?.error || "Neizdevās ielādēt lietotājus")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Lietotāji">
        <Button onClick={openCreate}>Pievienot lietotāju</Button>
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState label="Lietotāji vēl nav pievienoti" />
      ) : (
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Vārds</TableHead>
                  <TableHead>E-pasts</TableHead>
                  <TableHead>Statuss</TableHead>
                  <TableHead>Izveidots</TableHead>
                  <TableHead className="text-right">Darbības</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const name = s(r.full_name) || "—";
                  const email = s(r.email) || "—";
                  const code = s(r.user_code) || "—";
                  const status = s(r.status_key);
                  const created = fmtDate(r.created_at);

                  return (
                    <TableRow key={s(r.id) || Math.random()}>
                      <TableCell className="font-mono text-xs">{code}</TableCell>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell className="text-muted-foreground">{email}</TableCell>
                      <TableCell>
                        {status ? <StatusBadge status={status} /> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{created}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                          Rediģēt
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <UserFormDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        existing={rows}
      />
    </div>
  );
}

function UserFormDialog({
  open,
  onOpenChange,
  editing,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Row | null;
  existing: Row[];
}) {
  const isEdit = !!editing;
  const editingId = isEdit ? s(editing!.id) : "";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [userCode, setUserCode] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever dialog opens
  const dialogKey = `${open ? "1" : "0"}:${editingId}`;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useStateReset(dialogKey, () => {
    setFullName(isEdit ? s(editing!.full_name) : "");
    setEmail(isEdit ? s(editing!.email) : "");
    setUserCode(isEdit ? s(editing!.user_code).toUpperCase() : "");
    setIsActive(isEdit ? editing!.is_active !== false : true);
    setError(null);
  });

  const queryClient = useQueryClient();
  const createFn = useServerFn(createCrmProfile);
  const updateFn = useServerFn(updateCrmProfile);

  const createMut = useMutation({
    mutationFn: (data: { full_name: string; email: string; user_code: string }) =>
      createFn({ data }),
    onSuccess: (res) => {
      if (res?.error) {
        setError(res.error);
        return;
      }
      toast.success("Lietotājs pievienots");
      queryClient.invalidateQueries({ queryKey: ["crm", "profiles"] });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Neizdevās saglabāt");
    },
  });

  const updateMut = useMutation({
    mutationFn: (data: {
      id: string;
      full_name: string;
      email: string;
      user_code: string;
      is_active: boolean;
    }) => updateFn({ data }),
    onSuccess: (res) => {
      if (res?.error) {
        setError(res.error);
        return;
      }
      toast.success("Lietotājs atjaunināts");
      queryClient.invalidateQueries({ queryKey: ["crm", "profiles"] });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Neizdevās saglabāt");
    },
  });

  const submitting = createMut.isPending || updateMut.isPending;

  const validate = (): string | null => {
    const name = fullName.trim();
    const mail = email.trim().toLowerCase();
    const code = userCode.trim().toUpperCase();
    if (!name) return "Vārds ir obligāts";
    if (!mail) return "E-pasts ir obligāts";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return "Nederīgs e-pasts";
    if (!code) return "ID ir obligāts";
    if (code.length > 5) return "ID maksimums 5 simboli";
    const codeTaken = existing.some(
      (r) => s(r.id) !== editingId && s(r.user_code).toUpperCase() === code,
    );
    if (codeTaken) return "Šāds ID jau eksistē";
    const emailTaken = existing.some(
      (r) => s(r.id) !== editingId && s(r.email).toLowerCase() === mail,
    );
    if (emailTaken) return "Šāds e-pasts jau eksistē";
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    const code = userCode.trim().toUpperCase();
    const mail = email.trim().toLowerCase();
    const name = fullName.trim();
    if (isEdit) {
      updateMut.mutate({
        id: editingId,
        full_name: name,
        email: mail,
        user_code: code,
        is_active: isActive,
      });
    } else {
      createMut.mutate({ full_name: name, email: mail, user_code: code });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Rediģēt lietotāju" : "Pievienot lietotāju"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Atjaunini lietotāja datus."
              : "Izveido jaunu CRM lietotāju."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Vārds</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={120}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-pasts</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user_code">ID</Label>
            <Input
              id="user_code"
              value={userCode}
              onChange={(e) =>
                setUserCode(e.target.value.toUpperCase().slice(0, 5))
              }
              maxLength={5}
              placeholder="GT"
              className="font-mono uppercase"
              required
            />
            <p className="text-xs text-muted-foreground">
              Maks. 5 simboli, lielie burti. Piemēri: GT, AR, EG, UC.
            </p>
          </div>
          {isEdit && (
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label htmlFor="is_active" className="cursor-pointer">
                  Aktīvs
                </Label>
              </div>
              <Switch
                id="is_active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Atcelt
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saglabā..." : "Saglabāt"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Tiny helper: re-run an effect when `key` changes.
function useStateReset(key: string, fn: () => void) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current !== key) {
      last.current = key;
      fn();
    }
  }, [key, fn]);
}
