import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { useCrmView } from "@/hooks/useCrmView";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
    "select=id,full_name,email,status_key,created_at&order=full_name.asc&limit=1000",
    { all: true }
  );

  const rows = (view.data?.rows ?? []) as Row[];

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
      <PageHeader title="Lietotāji" />

      {rows.length === 0 ? (
        <EmptyState label="Lietotāji vēl nav pievienoti" />
      ) : (
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vārds</TableHead>
                  <TableHead>E-pasts</TableHead>
                  <TableHead>Telefons</TableHead>
                  <TableHead>Statuss</TableHead>
                  <TableHead>Izveidots</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const name = s(r.full_name) || "—";
                  const email = s(r.email) || "—";
                  const phone = s(r.phone) || "—";
                  const status = s(r.status_key);
                  const created = fmtDate(r.created_at);

                  return (
                    <TableRow key={s(r.id) || Math.random()}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell className="text-muted-foreground">{email}</TableCell>
                      <TableCell className="text-muted-foreground">{phone}</TableCell>
                      <TableCell>
                        {status ? <StatusBadge status={status} /> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{created}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
