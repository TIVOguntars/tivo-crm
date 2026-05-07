import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCrmView } from "@/hooks/useCrmView";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/queue")({
  component: QueuePage,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState message={error.message} />
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Lapa nav atrasta</div>,
});

type Row = Record<string, unknown>;

const RIGA_TZ = "Europe/Riga";

function s(v: unknown): string {
  if (v == null) return "";
  return String(v);
}
function n(v: unknown): number {
  const x = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtDateTime(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("lv-LV", {
    timeZone: RIGA_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function isToday(v: unknown): boolean {
  if (!v) return false;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const fmt = (x: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: RIGA_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(x);
  return fmt(d) === fmt(now);
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "lv"),
  );
}

function QueueStatusBadge({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const isOverdue = value.toLowerCase().includes("kavēt");
  return (
    <Badge
      variant={isOverdue ? "destructive" : "secondary"}
      className={cn("font-medium", isOverdue && "bg-red-600 text-white")}
    >
      {value}
    </Badge>
  );
}

function ActionStatusBadge({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const isWaiting = value.toLowerCase().includes("gaida");
  return (
    <Badge variant={isWaiting ? "outline" : "secondary"}>{value}</Badge>
  );
}

function QueuePage() {
  const navigate = useNavigate();
  const view = useCrmView("next_action_queue_ui", "limit=500");
  const rows = (view.data?.rows ?? []) as Row[];

  const [actionType, setActionType] = useState<string>("all");
  const [workflow, setWorkflow] = useState<string>("all");
  const [bucket, setBucket] = useState<string>("all");
  const [leadStatus, setLeadStatus] = useState<string>("all");
  const [q, setQ] = useState<string>("");

  const actionTypes = useMemo(
    () => uniq(rows.map((r) => s(r.action_label))),
    [rows],
  );
  const workflows = useMemo(
    () => uniq(rows.map((r) => s(r.workflow_label))),
    [rows],
  );
  const leadStatuses = useMemo(
    () => uniq(rows.map((r) => s(r.legacy_lead_status))),
    [rows],
  );

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (actionType !== "all" && s(r.action_label) !== actionType) return false;
      if (workflow !== "all" && s(r.workflow_label) !== workflow) return false;
      if (bucket !== "all" && s(r.queue_bucket) !== bucket) return false;
      if (leadStatus !== "all" && s(r.legacy_lead_status) !== leadStatus)
        return false;
      if (qq) {
        const hay = `${s(r.full_name)} ${s(r.object_name)}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      const order: Record<string, number> = {
        overdue: 0,
        today: 1,
        next_24h: 2,
        upcoming: 3,
      };
      const aB = order[s(a.queue_bucket)] ?? 99;
      const bB = order[s(b.queue_bucket)] ?? 99;
      if (aB !== bB) return aB - bB;
      const aDue = a.due_at ? new Date(String(a.due_at)).getTime() : Infinity;
      const bDue = b.due_at ? new Date(String(b.due_at)).getTime() : Infinity;
      if (aDue !== bDue) return aDue - bDue;
      return n(b.priority_score) - n(a.priority_score);
    });
    return list;
  }, [rows, actionType, workflow, bucket, leadStatus, q]);

  const kpis = useMemo(() => {
    const c = { overdue: 0, today: 0, next_24h: 0, upcoming: 0 };
    for (const r of rows) {
      const b = s(r.queue_bucket);
      if (b in c) (c as Record<string, number>)[b]++;
    }
    return c;
  }, [rows]);

  const hasPriority = useMemo(
    () => rows.some((r) => n(r.priority_score) > 0),
    [rows],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <PageHeader
        title="Darba rinda"
        description="Nākamās darbības ar leadiem"
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Kavēti" value={kpis.overdue} tone="red" />
        <StatCard label="Šodien" value={kpis.today} tone="amber" />
        <StatCard label="Nākamās 24h" value={kpis.next_24h} tone="blue" />
        <StatCard label="Plānots" value={kpis.upcoming} tone="neutral" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Meklēt pēc lead vai objekta..."
          className="h-8 w-full sm:w-64"
        />
        <FilterSelect
          label="Darbības tips"
          value={actionType}
          options={actionTypes}
          onChange={setActionType}
        />
        <FilterSelect
          label="Workflow"
          value={workflow}
          options={workflows}
          onChange={setWorkflow}
        />
        <Select value={bucket} onValueChange={setBucket}>
          <SelectTrigger className="h-8 w-auto min-w-[160px] text-xs">
            <SelectValue placeholder="Laiks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Laiks: visi</SelectItem>
            <SelectItem value="overdue">Kavēti</SelectItem>
            <SelectItem value="today">Šodien</SelectItem>
            <SelectItem value="next_24h">Nākamās 24h</SelectItem>
            <SelectItem value="upcoming">Plānots</SelectItem>
          </SelectContent>
        </Select>
        <FilterSelect
          label="Lead statuss"
          value={leadStatus}
          options={leadStatuses}
          onChange={setLeadStatus}
        />
      </div>

      {view.isLoading ? (
        <LoadingState />
      ) : view.data?.error ? (
        <ErrorState message={view.data.error} />
      ) : filtered.length === 0 ? (
        <EmptyState label="Rindā nav ierakstu" />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {hasPriority && <TableHead className="h-9 w-16">Prioritāte</TableHead>}
                <TableHead className="h-9">Termiņš</TableHead>
                <TableHead className="h-9">Darbība</TableHead>
                <TableHead className="h-9">Lead</TableHead>
                <TableHead className="h-9">Objekts</TableHead>
                <TableHead className="h-9">Workflow</TableHead>
                <TableHead className="h-9">Lead statuss</TableHead>
                <TableHead className="h-9">Rindas statuss</TableHead>
                <TableHead className="h-9 text-right">Darbības</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r, i) => {
                const leadId = s(r.lead_id);
                return (
                  <TableRow
                    key={s(r.queue_id) || s(r.next_action_id) || i}
                    className="h-8"
                  >
                    {hasPriority && (
                      <TableCell className="py-1 font-medium tabular-nums">
                        {n(r.priority_score) || "—"}
                      </TableCell>
                    )}
                    <TableCell className="whitespace-nowrap py-1 text-xs">
                      {fmtDateTime(r.due_at)}
                    </TableCell>
                    <TableCell className="py-1">{s(r.action_label) || "—"}</TableCell>
                    <TableCell className="py-1">
                      {leadId ? (
                        <button
                          className="text-primary hover:underline"
                          onClick={() =>
                            navigate({
                              to: "/lead/$leadId",
                              params: { leadId },
                            })
                          }
                        >
                          {s(r.full_name) || "—"}
                        </button>
                      ) : (
                        s(r.full_name) || "—"
                      )}
                    </TableCell>
                    <TableCell className="py-1">{s(r.object_name) || "—"}</TableCell>
                    <TableCell className="py-1">{s(r.workflow_label) || "—"}</TableCell>
                    <TableCell className="py-1">{s(r.legacy_lead_status) || "—"}</TableCell>
                    <TableCell className="py-1">
                      <QueueBucketBadge
                        bucket={s(r.queue_bucket)}
                        label={s(r.queue_bucket_label) || s(r.queue_status)}
                      />
                    </TableCell>
                    <TableCell className="py-1 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            leadId &&
                            navigate({
                              to: "/lead/$leadId",
                              params: { leadId },
                            })
                          }
                        >
                          Atvērt
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-[160px] text-xs">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: visi</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
