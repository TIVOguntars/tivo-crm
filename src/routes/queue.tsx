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

function QueueBucketBadge({ bucket, label }: { bucket: string; label: string }) {
  const text = label || bucket;
  if (!text) return <span className="text-muted-foreground">—</span>;
  const tone =
    bucket === "overdue"
      ? "bg-red-600 text-white border-transparent"
      : bucket === "today"
        ? "bg-amber-500 text-white border-transparent"
        : bucket === "next_24h"
          ? "bg-blue-600 text-white border-transparent"
          : "";
  return (
    <Badge
      variant={bucket === "overdue" ? "destructive" : "secondary"}
      className={cn("font-medium", tone)}
    >
      {text}
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

function PriorityBadge({ label }: { label: string }) {
  if (!label) return <span className="text-muted-foreground">—</span>;
  const tone =
    label === "Augsta"
      ? "bg-red-600 text-white border-transparent"
      : label === "Normāla"
        ? "bg-orange-500 text-white border-transparent"
        : label === "Zema"
          ? "bg-muted text-muted-foreground border-transparent"
          : "";
  return <Badge className={cn("font-medium", tone)}>{label}</Badge>;
}

function QueuePage() {
  const navigate = useNavigate();
  const view = useCrmView("next_action_queue_ui", "limit=500");
  const rows = (view.data?.rows ?? []) as Row[];

  const [actionType, setActionType] = useState<string>("all");
  const [workflow, setWorkflow] = useState<string>("all");
  const [bucket, setBucket] = useState<string>("all");
  const [leadStatus, setLeadStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [owner, setOwner] = useState<string>("all");
  const [country, setCountry] = useState<string>("all");
  const [ppv, setPpv] = useState<string>("all");
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
  const owners = useMemo(
    () => uniq(rows.map((r) => s(r.action_owner_label))),
    [rows],
  );
  const countries = useMemo(
    () => uniq(rows.map((r) => s(r.country))),
    [rows],
  );
  const ppvs = useMemo(
    () => uniq(rows.map((r) => s(r.ppv_name))),
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
      if (priority !== "all" && s(r.priority_label) !== priority) return false;
      if (owner !== "all" && s(r.action_owner_label) !== owner) return false;
      if (country !== "all" && s(r.country) !== country) return false;
      if (ppv !== "all" && s(r.ppv_name) !== ppv) return false;
      if (qq) {
        const hay = `${s(r.full_name)} ${s(r.object_name)}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      const aSp = n(a.sort_priority);
      const bSp = n(b.sort_priority);
      if (aSp !== bSp) return bSp - aSp;
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
  }, [rows, actionType, workflow, bucket, leadStatus, priority, owner, country, ppv, q]);

  const kpis = useMemo(() => {
    const c = { overdue: 0, today: 0, next_24h: 0, upcoming: 0 };
    for (const r of rows) {
      const b = s(r.queue_bucket);
      if (b in c) (c as Record<string, number>)[b]++;
    }
    return c;
  }, [rows]);

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
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="h-8 w-auto min-w-[160px] text-xs">
            <SelectValue placeholder="Prioritāte" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Prioritāte: visi</SelectItem>
            <SelectItem value="Augsta">Augsta</SelectItem>
            <SelectItem value="Normāla">Normāla</SelectItem>
            <SelectItem value="Zema">Zema</SelectItem>
          </SelectContent>
        </Select>
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
        <FilterSelect
          label="Atbildīgais"
          value={owner}
          options={owners}
          onChange={setOwner}
        />
        <FilterSelect
          label="Valsts"
          value={country}
          options={countries}
          onChange={setCountry}
        />
        <FilterSelect
          label="PPV"
          value={ppv}
          options={ppvs}
          onChange={setPpv}
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
                <TableHead className="h-9 w-24">Prioritāte</TableHead>
                <TableHead className="h-9 w-16">Score</TableHead>
                <TableHead className="h-9">Termiņš</TableHead>
                <TableHead className="h-9">Darbība</TableHead>
                <TableHead className="h-9">Lead</TableHead>
                <TableHead className="h-9">Objekts</TableHead>
                <TableHead className="h-9">Workflow</TableHead>
                <TableHead className="h-9">Atbildīgais</TableHead>
                <TableHead className="h-9">Valsts</TableHead>
                <TableHead className="h-9">PPV</TableHead>
                <TableHead className="h-9">Lead statuss</TableHead>
                <TableHead className="h-9">Rindas statuss</TableHead>
                <TableHead className="h-9 text-right">Darbības</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r, i) => {
                const leadId = s(r.lead_id);
                const pLabel = s(r.priority_label);
                const isHigh = pLabel === "Augsta";
                return (
                  <TableRow
                    key={s(r.queue_id) || s(r.next_action_id) || i}
                    className={cn(
                      "h-8",
                      isHigh &&
                        "bg-red-50/70 hover:bg-red-100/70 dark:bg-red-950/20 dark:hover:bg-red-950/30",
                    )}
                  >
                    <TableCell className="py-1">
                      <PriorityBadge label={pLabel} />
                    </TableCell>
                    <TableCell className="py-1 tabular-nums text-xs">
                      {n(r.lead_priority_score) || "—"}
                    </TableCell>
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
                    <TableCell className="py-1">
                      {(() => {
                        const ol = s(r.action_owner_label);
                        if (!ol) return <span className="text-muted-foreground">—</span>;
                        if (ol === "SIS")
                          return (
                            <Badge variant="outline" className="font-medium">
                              SIS · auto
                            </Badge>
                          );
                        return ol;
                      })()}
                    </TableCell>
                    <TableCell className="py-1 text-xs">{s(r.country) || "—"}</TableCell>
                    <TableCell className="py-1 text-xs">{s(r.ppv_name) || "—"}</TableCell>
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
