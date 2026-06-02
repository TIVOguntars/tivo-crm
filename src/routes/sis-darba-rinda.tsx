import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ExternalLink, Search, Info } from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tag, normalizeTags } from "@/components/ui/Tag";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useCrmView } from "@/hooks/useCrmView";
import { cn } from "@/lib/utils";
import { CHANNEL_LV, TASK_STATUS_LV, lv } from "@/lib/i18nLabels";
import {
  CrmClearFiltersButton,
  CrmDataBody,
  CrmDataCell,
  CrmDataRow,
  CrmDataTable,
  CrmDataTableFilterRow,
  CrmDataTableHeader,
  CrmDataTableLabelRow,
  CrmFilterCell,
  CrmFilterSelect,
  CrmSearchInput,
  CrmSortableHead,
  type CrmTableSort,
  type SortDir,
} from "@/components/crm/table/CrmDataTable";

/**
 * SIS system profile. A SIS task is a crm.tasks row whose assigned_user_id
 * equals this id. Frontend filter only — no backend / SIS logic here.
 */
const SIS_PROFILE_ID = "7db59c70-95b0-4b3b-814a-213630504aea";
const SIS_OWNER_LABEL = "SIS";

export const Route = createFileRoute("/sis-darba-rinda")({
  component: SisCentrsPage,
});

/* ============================ Generic helpers ============================ */

type Row = Record<string, unknown>;

function str(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function parseDate(v: unknown): number | null {
  if (v == null || v === "") return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}

function fmtDate(v: unknown): string {
  const t = parseDate(v);
  if (t == null) return "—";
  return new Intl.DateTimeFormat("lv-LV", {
    timeZone: "Europe/Riga",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(t))
    .replace(/\//g, ".");
}

function fmtDateTime(v: unknown): string {
  const t = parseDate(v);
  if (t == null) return "—";
  return new Intl.DateTimeFormat("lv-LV", {
    timeZone: "Europe/Riga",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(t))
    .replace(/\//g, ".");
}

function toTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((t) => String(t).trim()).filter(Boolean);
  if (typeof v === "string")
    return v
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
  return [];
}

function shortId(v: unknown): string {
  const s = str(v);
  return s ? s.slice(0, 8) : "—";
}

function isSameRigaDay(v: unknown): boolean {
  const t = parseDate(v);
  if (t == null) return false;
  const fmt = (d: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Riga" }).format(
      new Date(d),
    );
  return fmt(t) === fmt(Date.now());
}

/* ============================ Small UI bits ============================ */

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring",
        className,
      )}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-56 rounded-md border border-border bg-background pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

/* ----- Priority badge (label provided by backend, no calculation) -----
 * SIS palette: High/Augsta = red accent, Medium/Vidēja = orange, Low/Zema = neutral. */
const PRIORITY_TONE: Record<string, string> = {
  kritiska: "bg-[var(--tivo-red-soft)] text-[var(--tivo-red)]",
  augsta: "bg-[var(--tivo-red-soft)] text-[var(--tivo-red)]",
  vidēja: "bg-[var(--tivo-orange-soft)] text-[var(--tivo-orange)]",
  zema: "bg-muted text-muted-foreground",
};
function PriorityBadge({ label }: { label: string }) {
  if (!label) return <span className="text-muted-foreground/50">—</span>;
  const tone = PRIORITY_TONE[label.toLowerCase().trim()] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
        tone,
      )}
    >
      {label}
    </span>
  );
}

/* ----- Calm status badge (blue/gray) for SIS task status ----- */
function CalmStatusBadge({ status }: { status: string }) {
  if (!status) return <span className="text-muted-foreground/50">—</span>;
  const label = lv(TASK_STATUS_LV, status, status);
  const k = status.toLowerCase().trim();
  const done = k === "completed" || k === "done";
  const tone = done
    ? "bg-muted text-muted-foreground"
    : "bg-[var(--tivo-blue-soft)] text-[var(--tivo-blue)]";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
        tone,
      )}
    >
      {label}
    </span>
  );
}

/* ----- Queue bucket badge ----- */
const QUEUE_BUCKET_LV: Record<string, string> = {
  overdue: "Kavēts",
  today: "Šodien",
  due_today: "Šodien",
  upcoming: "Gaidāms",
  future: "Gaidāms",
  scheduled: "Plānots",
  planned: "Plānots",
  no_due: "Bez termiņa",
  none: "Bez termiņa",
};
const QUEUE_BUCKET_TONE: Record<string, string> = {
  overdue: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  today: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  due_today: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
};
function QueueBucketBadge({ bucket }: { bucket: string }) {
  if (!bucket) return <span className="text-muted-foreground/50">—</span>;
  const key = bucket.toLowerCase().trim();
  const tone = QUEUE_BUCKET_TONE[key] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
        tone,
      )}
    >
      {lv(QUEUE_BUCKET_LV, bucket, bucket)}
    </span>
  );
}

/* ----- Channel + event-type badges ----- */
function ChannelBadge({ channel }: { channel: string }) {
  if (!channel) return <span className="text-muted-foreground/50">—</span>;
  return (
    <Badge variant="secondary" className="text-[11px] font-medium">
      {lv(CHANNEL_LV, channel, channel)}
    </Badge>
  );
}

/* Tracking statuses → LV badge labels + tones */
const EVENT_TYPE_LV: Record<string, string> = {
  sent: "Nosūtīts",
  send: "Nosūtīts",
  received: "Saņemts",
  receive: "Saņemts",
  delivered: "Piegādāts",
  delivery: "Piegādāts",
  opened: "Atvērts",
  open: "Atvērts",
  clicked: "Click",
  click: "Click",
  replied: "Atbildēts",
  reply: "Atbildēts",
  bounce: "Bounce",
  bounced: "Bounce",
  unsubscribe: "Unsubscribe",
  unsubscribed: "Unsubscribe",
};
const EVENT_TYPE_TONE: Record<string, string> = {
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  delivered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  opened: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300",
  clicked: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  replied: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  bounce: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  bounced: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  unsubscribe: "bg-muted text-muted-foreground",
};
function EventTypeBadge({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground/50">—</span>;
  const key = value.toLowerCase().trim();
  const tone = EVENT_TYPE_TONE[key] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
        tone,
      )}
    >
      {EVENT_TYPE_LV[key] ?? value}
    </span>
  );
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const s = (v ?? "").toString().trim();
    if (s) set.add(s);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "lv"));
}

/* ============================ Page shell ============================ */

function SisCentrsPage() {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="uzdevumi" className="w-full">
        <TabsList>
          <TabsTrigger value="uzdevumi">Uzdevumi</TabsTrigger>
          <TabsTrigger value="komunikacija">Komunikācija</TabsTrigger>
        </TabsList>
        <TabsContent value="uzdevumi">
          <UzdevumiTab />
        </TabsContent>
        <TabsContent value="komunikacija">
          <KomunikacijaTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================ TAB 1: Uzdevumi ============================ */

function UzdevumiTab() {
  const navigate = useNavigate();
  const query = useCrmView("v_tasks_queue_ui_v2", undefined, { all: true });
  const allRows = (query.data?.rows ?? []) as Row[];
  // Strict SIS filter: only tasks assigned to the SIS system profile.
  const rows = useMemo(
    () => allRows.filter((r) => str(r.assigned_user_id) === SIS_PROFILE_ID),
    [allRows],
  );
  const errorMsg = (query.error as Error | null)?.message || query.data?.error;
  const loading = query.isLoading;

  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fTaskType, setFTaskType] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fDue, setFDue] = useState("");
  const [fSource, setFSource] = useState("");
  const [detail, setDetail] = useState<Row | null>(null);

  const options = useMemo(
    () => ({
      status: uniqueSorted(rows.map((r) => str(r.task_status))),
      taskType: uniqueSorted(rows.map((r) => str(r.task_type))),
      priority: uniqueSorted(rows.map((r) => str(r.priority_label))),
      source: uniqueSorted(rows.map((r) => str(r.task_source))),
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (fStatus && str(r.task_status) !== fStatus) return false;
      if (fTaskType && str(r.task_type) !== fTaskType) return false;
      if (fPriority && str(r.priority_label) !== fPriority) return false;
      if (fSource && str(r.task_source) !== fSource) return false;
      if (fDue === "overdue" && str(r.queue_bucket).toLowerCase() !== "overdue")
        return false;
      if (fDue === "today" && !isSameRigaDay(r.effective_due_at ?? r.due_at))
        return false;
      if (q) {
        const hay = [
          r.full_name,
          r.lead_number,
          r.object_name,
          r.country,
          r.action_label,
          r.tags,
          r.task_status,
          r.task_type,
        ]
          .map((v) => str(v).toLowerCase())
          .join(" ");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, fStatus, fTaskType, fPriority, fSource, fDue]);

  // Counters — visual only, from already-loaded rows. No business logic.
  const counters = useMemo(() => {
    let overdue = 0;
    let waiting = 0;
    let high = 0;
    for (const r of rows) {
      const bucket = str(r.queue_bucket).toLowerCase();
      const pr = str(r.priority).toLowerCase();
      const prLabel = str(r.priority_label).toLowerCase();
      const ts = str(r.task_status).toLowerCase();
      if (bucket === "overdue") overdue += 1;
      if (ts === "planned" || ts === "pending" || ts === "open" || ts === "scheduled")
        waiting += 1;
      if (pr === "high" || pr === "urgent" || prLabel === "augsta" || prLabel === "kritiska")
        high += 1;
    }
    return { total: rows.length, overdue, waiting, high };
  }, [rows]);

  const openLead = (leadId: unknown) => {
    const id = str(leadId);
    if (id) navigate({ to: "/lead/$leadId", params: { leadId: id } });
  };

  if (errorMsg) return <ErrorState message="Neizdevās ielādēt SIS uzdevumus." />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Visi SIS uzdevumi" value={counters.total} tone="blue" />
        <StatCard label="Gaida izpildi" value={counters.waiting} tone="amber" />
        <StatCard label="Nokavēti" value={counters.overdue} tone="red" />
        <StatCard label="Augsta prioritāte" value={counters.high} tone="orange" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Meklēt uzdevumus..." />
        <FilterSelect value={fStatus} onChange={setFStatus} options={options.status} placeholder="Statuss" />
        <FilterSelect value={fPriority} onChange={setFPriority} options={options.priority} placeholder="Prioritāte" />
        <FilterSelect
          value={fDue}
          onChange={setFDue}
          options={["overdue", "today"]}
          placeholder="Termiņš"
        />
        <FilterSelect value={fTaskType} onChange={setFTaskType} options={options.taskType} placeholder="Task Type" />
        <FilterSelect value={fSource} onChange={setFSource} options={options.source} placeholder="Avots" />
      </div>

      {loading ? (
        <LoadingState label="Ielādē SIS uzdevumus..." />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <EmptyState label="Nav SIS uzdevumu." />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Darbība</th>
                <th className="px-3 py-2 text-left font-medium">Statuss</th>
                <th className="px-3 py-2 text-left font-medium">Termiņš</th>
                <th className="px-3 py-2 text-left font-medium">Prioritāte</th>
                <th className="px-3 py-2 text-left font-medium">Lead</th>
                <th className="px-3 py-2 text-left font-medium">Valsts</th>
                <th className="px-3 py-2 text-left font-medium">Tagi</th>
                <th className="px-3 py-2 text-left font-medium">Atbildīgais</th>
                <th className="px-3 py-2 text-left font-medium">Avots</th>
                <th className="px-3 py-2 text-right font-medium">Darbības</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const dueT = parseDate(r.effective_due_at ?? r.due_at);
                const overdue = str(r.queue_bucket).toLowerCase() === "overdue";
                const tags = normalizeTags(toTags(r.tags));
                const leadName = str(r.full_name);
                const leadNumber = str(r.lead_number);
                return (
                  <tr
                    key={str(r.id) || i}
                    className="cursor-pointer border-t border-border hover:bg-secondary/30"
                    onClick={() => setDetail(r)}
                  >
                    <td className="px-3 py-2 font-medium text-foreground">
                      {str(r.action_label) || str(r.task_type) || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <CalmStatusBadge status={str(r.task_status)} />
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 tabular-nums",
                        overdue ? "text-[var(--tivo-red)]" : "text-muted-foreground",
                      )}
                    >
                      {dueT != null ? fmtDate(r.effective_due_at ?? r.due_at) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <PriorityBadge label={str(r.priority_label)} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col leading-tight">
                        <span className="font-medium text-foreground">
                          {leadName || <span className="italic text-muted-foreground">—</span>}
                        </span>
                        {leadNumber && (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {leadNumber}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{str(r.country) || "—"}</td>
                    <td className="px-3 py-2">
                      {tags.length === 0 ? (
                        <span className="text-muted-foreground/50">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-0.5">
                          {tags.slice(0, 2).map((t) => (
                            <Tag key={t} tag={t} />
                          ))}
                          {tags.length > 2 && (
                            <span className="text-[12px] text-muted-foreground/60">+{tags.length - 2}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary" className="text-[11px] font-medium">
                        {SIS_OWNER_LABEL}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {str(r.task_source) || "—"}
                    </td>
                    <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setDetail(r)}
                        >
                          Detaļas
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => openLead(r.lead_id)}
                        >
                          <ExternalLink className="mr-1 h-3 w-3" />
                          Atvērt Lead
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TaskDetailDrawer row={detail} onClose={() => setDetail(null)} onOpenLead={openLead} />
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/60 py-2">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground break-words">{value ?? "—"}</span>
    </div>
  );
}

function TaskDetailDrawer({
  row,
  onClose,
  onOpenLead,
}: {
  row: Row | null;
  onClose: () => void;
  onOpenLead: (leadId: unknown) => void;
}) {
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{row ? str(row.full_name) || "SIS uzdevums" : "SIS uzdevums"}</SheetTitle>
          <SheetDescription>{row ? str(row.action_label) : ""}</SheetDescription>
        </SheetHeader>
        {row && (
          <div className="mt-4">
            <DetailField label="Darbība" value={str(row.action_label) || "—"} />
            <DetailField label="Task Type" value={str(row.task_type) || "—"} />
            <DetailField label="Statuss" value={<CalmStatusBadge status={str(row.task_status)} />} />
            <DetailField label="Prioritāte" value={<PriorityBadge label={str(row.priority_label)} />} />
            <DetailField label="Termiņš" value={fmtDateTime(row.effective_due_at ?? row.due_at)} />
            <DetailField label="Atbildīgais" value={SIS_OWNER_LABEL} />
            <DetailField label="Avots" value={str(row.task_source) || "—"} />
            <DetailField label="Lead numurs" value={str(row.lead_number) || "—"} />
            <DetailField label="Lead" value={str(row.full_name) || "—"} />
            <DetailField label="Objekts" value={str(row.object_name) || "—"} />
            <DetailField label="Valsts" value={str(row.country) || "—"} />
            <DetailField label="Lead Status" value={<StatusBadge status={str(row.lead_status) || null} />} />
            <Button className="mt-4 w-full" onClick={() => onOpenLead(row.lead_id)}>
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Atvērt Lead
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ============================ TAB 2: Komunikācija ============================ */

function KomunikacijaTab() {
  const navigate = useNavigate();
  // Displayed rows come solely from the prepared Supabase view
  // crm.v_sis_communication_history. No frontend tasks+activities join.
  const history = useCrmView(
    "v_sis_communication_history",
    "order=activity_at.desc",
    { all: true },
  );
  // communication_events is kept ONLY to enrich the detail-drawer event
  // timeline (by lead_id). It never decides which rows are shown.
  const events = useCrmView(
    "communication_events",
    "select=id,event_type,event_status,created_at,provider_message_id,metadata,lead_id,channel",
    { all: true },
  );

  const rows = (history.data?.rows ?? []) as Row[];
  const eventRows = (events.data?.rows ?? []) as Row[];

  const errorMsg =
    (history.error as Error | null)?.message || history.data?.error;
  const loading = history.isLoading;

  const [search, setSearch] = useState("");
  const [fChannel, setFChannel] = useState("");
  const [fEventType, setFEventType] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fLead, setFLead] = useState("");
  const [fContact, setFContact] = useState("");
  const [detail, setDetail] = useState<Row | null>(null);

  const eventByLead = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const e of eventRows) {
      const key = str(e.lead_id);
      if (!key) continue;
      const list = m.get(key) ?? [];
      list.push(e);
      m.set(key, list);
    }
    return m;
  }, [eventRows]);

  // Per-row badge values, read directly from the view columns.
  const rowEventType = (r: Row) =>
    str(r.latest_event_type) || str(r.activity_type);
  const rowStatus = (r: Row) =>
    str(r.latest_event_status) || str(r.outcome_code);

  const options = useMemo(
    () => ({
      channel: uniqueSorted(rows.map((r) => str(r.channel))),
      eventType: uniqueSorted(rows.map((r) => rowEventType(r))),
      status: uniqueSorted(rows.map((r) => rowStatus(r))),
      lead: uniqueSorted(rows.map((r) => shortId(r.lead_id))),
      contact: uniqueSorted(rows.map((r) => shortId(r.contact_id))),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (fChannel && str(r.channel) !== fChannel) return false;
      if (fEventType && rowEventType(r) !== fEventType) return false;
      if (fStatus && rowStatus(r) !== fStatus) return false;
      if (fLead && shortId(r.lead_id) !== fLead) return false;
      if (fContact && shortId(r.contact_id) !== fContact) return false;
      if (q) {
        const hay = [r.subject, r.summary, r.channel, r.activity_type, r.provider_message_id]
          .map((v) => str(v).toLowerCase())
          .join(" ");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, fChannel, fEventType, fStatus, fLead, fContact]);

  // Counters — visual only.
  const counters = useMemo(() => {
    let sent = 0;
    let opened = 0;
    let clicked = 0;
    let replied = 0;
    // Count from view rows only — no global communication_events.
    for (const r of rows) {
      const et = str(r.latest_event_type).toLowerCase().trim();
      const oc = str(r.outcome_code).toLowerCase().trim();
      if (et === "sent" || et === "send" || oc === "sent" || oc === "send") sent += 1;
      if (et === "opened" || et === "open") opened += 1;
      if (et === "clicked" || et === "click") clicked += 1;
      if (et === "replied" || et === "reply" || oc === "replied") replied += 1;
    }
    return { sent, opened, clicked, replied };
  }, [rows]);

  const openLead = (leadId: unknown) => {
    const id = str(leadId);
    if (id) navigate({ to: "/lead/$leadId", params: { leadId: id } });
  };

  if (errorMsg) return <ErrorState message="Neizdevās ielādēt SIS komunikāciju." />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Nosūtīts" value={counters.sent} tone="blue" />
        <StatCard label="Atvērts" value={counters.opened} tone="purple" />
        <StatCard label="Click" value={counters.clicked} tone="amber" />
        <StatCard label="Atbildēts" value={counters.replied} tone="orange" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Meklēt komunikāciju..." />
        <FilterSelect value={fChannel} onChange={setFChannel} options={options.channel} placeholder="Kanāls" />
        <FilterSelect value={fEventType} onChange={setFEventType} options={options.eventType} placeholder="Event Type" />
        <FilterSelect value={fStatus} onChange={setFStatus} options={options.status} placeholder="Statuss" />
        <FilterSelect value={fLead} onChange={setFLead} options={options.lead} placeholder="Lead" />
        <FilterSelect value={fContact} onChange={setFContact} options={options.contact} placeholder="Kontakts" />
      </div>

      {loading ? (
        <LoadingState label="Ielādē SIS komunikāciju..." />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <EmptyState label="Nav SIS komunikācijas ierakstu." />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Datums</th>
                <th className="px-3 py-2 text-left font-medium">Lead</th>
                <th className="px-3 py-2 text-left font-medium">Kontakts</th>
                <th className="px-3 py-2 text-left font-medium">Kanāls</th>
                <th className="px-3 py-2 text-left font-medium">Virziens</th>
                <th className="px-3 py-2 text-left font-medium">Subject / Summary</th>
                <th className="px-3 py-2 text-left font-medium">Statuss</th>
                <th className="px-3 py-2 text-left font-medium">Event Type</th>
                <th className="px-3 py-2 text-left font-medium">Provider Message ID</th>
                <th className="px-3 py-2 text-left font-medium">Rezultāts</th>
                <th className="px-3 py-2 text-right font-medium">Darbības</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                return (
                  <tr
                    key={str(r.activity_id) || i}
                    className="cursor-pointer border-t border-border hover:bg-secondary/30"
                    onClick={() => setDetail(r)}
                  >
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {fmtDateTime(r.activity_at ?? r.created_at)}
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px] text-foreground/80" title={str(r.lead_id)}>
                      {shortId(r.lead_id)}
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px] text-foreground/80" title={str(r.contact_id)}>
                      {shortId(r.contact_id)}
                    </td>
                    <td className="px-3 py-2">
                      <ChannelBadge channel={str(r.channel)} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {"—"}
                    </td>
                    <td className="px-3 py-2 max-w-[260px] truncate text-foreground" title={str(r.subject) || str(r.summary)}>
                      {str(r.subject) || str(r.summary) || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {rowStatus(r) ? <EventTypeBadge value={rowStatus(r)} /> : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <EventTypeBadge value={rowEventType(r)} />
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground" title={str(r.provider_message_id)}>
                      {str(r.provider_message_id) ? str(r.provider_message_id).slice(0, 18) : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{str(r.outcome_code) || "—"}</td>
                    <td className="px-3 py-2 text-right" onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setDetail(r)}>
                          Detaļas
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => openLead(r.lead_id)}>
                          <ExternalLink className="mr-1 h-3 w-3" />
                          Atvērt Lead
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CommDetailDrawer
        row={detail}
        events={detail ? (eventByLead.get(str(detail.lead_id)) ?? []) : []}
        onClose={() => setDetail(null)}
        onOpenLead={openLead}
      />
    </div>
  );
}

function CommDetailDrawer({
  row,
  events,
  onClose,
  onOpenLead,
}: {
  row: Row | null;
  events: Row[];
  onClose: () => void;
  onOpenLead: (leadId: unknown) => void;
}) {
  const timeline = [...events].sort(
    (a, b) => (parseDate(b.created_at) ?? 0) - (parseDate(a.created_at) ?? 0),
  );
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{row ? str(row.subject) || str(row.summary) || "Komunikācija" : "Komunikācija"}</SheetTitle>
          <SheetDescription>{row ? fmtDateTime(row.activity_at ?? row.created_at) : ""}</SheetDescription>
        </SheetHeader>
        {row && (
          <div className="mt-4">
            <DetailField label="Kanāls" value={<ChannelBadge channel={str(row.channel)} />} />
            <DetailField label="Aktivitātes tips" value={str(row.activity_type) || "—"} />
            <DetailField label="Subject" value={str(row.subject) || "—"} />
            <DetailField label="Summary" value={str(row.summary) || "—"} />
            <DetailField label="Rezultāts" value={str(row.outcome_code) || "—"} />
            <DetailField label="Komunikācijas bāze" value={str(row.communication_basis) || "—"} />
            <DetailField label="Provider Message ID" value={str(row.provider_message_id) || "—"} />
            <DetailField label="Lead ID" value={str(row.lead_id) || "—"} />
            <DetailField label="Kontakts" value={str(row.contact_id) || "—"} />

            {timeline.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                  Notikumu vēsture
                </p>
                <div className="space-y-2">
                  {timeline.map((e, i) => (
                    <div
                      key={str(e.id) || i}
                      className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1.5"
                    >
                      <EventTypeBadge value={str(e.event_type)} />
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {fmtDateTime(e.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {timeline.length === 0 && (
              <div className="mt-4 flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                Nav pieejamu notikumu šim ierakstam.
              </div>
            )}

            <Button className="mt-4 w-full" onClick={() => onOpenLead(row.lead_id)}>
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Atvērt Lead
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
