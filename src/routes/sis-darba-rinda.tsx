import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ExternalLink, Info, CalendarDays, X, Star } from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tag, normalizeTags } from "@/components/ui/Tag";
import { LoadingState, ErrorState } from "@/components/DataState";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCrmView } from "@/hooks/useCrmView";
import { useUserMap } from "@/hooks/useUsers";
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

function fmtTime(v: unknown): string {
  const t = parseDate(v);
  if (t == null) return "";
  return new Intl.DateTimeFormat("lv-LV", {
    timeZone: "Europe/Riga",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(t));
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

/* ----- Result normalization (display-only, no DB change) -----
 * Frontend mapping of outcome_code / latest_event_status into a small set
 * of canonical SIS communication results. Pure presentation. */
const RESULT_LV: Record<string, string> = {
  sent: "Nosūtīts",
  delivered: "Piegādāts",
  bounced: "Atgriezts",
  opened: "Atvērts",
  clicked: "Click",
  replied: "Atbildēts",
};
const RESULT_TONE: Record<string, string> = {
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  delivered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  bounced: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  opened: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300",
  clicked: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  replied: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
};
/** Canonical key from a raw result string, or "" when unmapped. */
function resultKey(raw: string): string {
  switch (raw.toLowerCase().trim()) {
    case "sent":
    case "send":
      return "sent";
    case "delivered":
    case "delivery":
      return "delivered";
    case "bounced":
    case "bounce":
    case "failed":
      return "bounced";
    case "opened":
    case "open":
      return "opened";
    case "clicked":
    case "click":
      return "clicked";
    case "replied":
    case "reply":
      return "replied";
    default:
      return "";
  }
}
/** Raw result source: outcome_code first, latest_event_status fallback. */
function rowResultRaw(r: Row): string {
  return str(r.outcome_code) || str(r.latest_event_status);
}
/** Display label for the normalized result (or raw passthrough). */
function rowResultLabel(r: Row): string {
  const raw = rowResultRaw(r);
  if (!raw) return "";
  const key = resultKey(raw);
  return key ? RESULT_LV[key] : raw;
}
function ResultBadge({ row }: { row: Row }) {
  const raw = rowResultRaw(row);
  if (!raw) return <span className="text-muted-foreground/50">—</span>;
  const key = resultKey(raw);
  const tone = key ? RESULT_TONE[key] : "bg-muted text-muted-foreground";
  const label = key ? RESULT_LV[key] : raw;
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

/* ----- Lead / direction display helpers (display-only) ----- */
function leadPrimary(r: Row): string {
  return str(r.lead_name) || str(r.full_name) || shortId(r.lead_id);
}
function leadSecondary(r: Row): string {
  const country = str(r.lead_country);
  const primary = str(r.lead_name) || str(r.full_name);
  const contact = str(r.contact_name);
  const showContact = !!contact && contact !== primary;
  if (showContact) {
    return country ? `${country} * ${contact}` : contact;
  }
  return country;
}
function directionLabel(r: Row): string {
  const raw = (str(r.direction) || str(r.communication_basis))
    .toLowerCase()
    .trim();
  if (raw === "outbound") return "Izejošs";
  if (raw === "inbound") return "Ienākošs";
  return "—";
}

/* ----- Task display helpers (display-only, no backend logic) ----- */

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Template key for a SIS task, taken from existing row data. */
function taskTemplate(r: Row): string {
  return str(r.action_label) || str(r.generator_rule_key);
}

/** Star count (0–3) derived from the prepared priority_score. */
function priorityStarCount(score: number | null): number {
  if (score == null) return 0;
  if (score >= 60) return 3;
  if (score >= 35) return 2;
  if (score > 0) return 1;
  return 0;
}

/** Stars row + numeric score row. No text labels. "—" when no value. */
function TaskPriorityCell({ row }: { row: Row }) {
  const score = numOrNull(row.priority_score);
  const hasValue = score != null || !!str(row.priority);
  if (!hasValue) return <span className="text-muted-foreground/50">—</span>;
  const stars = priorityStarCount(score);
  return (
    <div className="flex flex-col leading-tight">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Star
            key={i}
            className={cn(
              "h-3 w-3 shrink-0",
              i < stars
                ? "fill-[var(--tivo-orange)] text-[var(--tivo-orange)]"
                : "text-muted-foreground/30",
            )}
          />
        ))}
      </div>
      <span className="text-[12px] tabular-nums text-muted-foreground">
        {score != null ? score : "—"}
      </span>
    </div>
  );
}

/** Lead primary name for a task row. */
function taskLeadPrimary(r: Row): string {
  return str(r.full_name) || str(r.lead_number);
}
/** Secondary line: country, plus contact name only when it differs from lead. */
function taskLeadSecondary(r: Row): string {
  const country = str(r.country);
  const primary = str(r.full_name);
  const contact = str(r.contact_name);
  const showContact = !!contact && contact !== primary;
  if (showContact) return country ? `${country} · ${contact}` : contact;
  return country;
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
  const query = useCrmView(
    "v_tasks_queue_ui_v2",
    `assigned_user_id=eq.${SIS_PROFILE_ID}`,
    { all: true },
  );
  const allRows = (query.data?.rows ?? []) as Row[];
  // Strict SIS filter: only tasks assigned to the SIS system profile.
  const rows = useMemo(
    () => allRows.filter((r) => str(r.assigned_user_id) === SIS_PROFILE_ID),
    [allRows],
  );
  const errorMsg = (query.error as Error | null)?.message || query.data?.error;
  const loading = query.isLoading;

  // Reference lookup only: resolve ppv_user_id (uuid) → user code/name.
  // Does not change the task data source (v_tasks_queue_ui_v2).
  const { resolveCode: resolvePpvCode, resolve: resolvePpvName } = useUserMap();

  const [search, setSearch] = useState("");
  const [fTemplate, setFTemplate] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fPpv, setFPpv] = useState("");
  const [fTag, setFTag] = useState("");
  const [fLeadStatus, setFLeadStatus] = useState("");
  const [fDue, setFDue] = useState("");
  const [sort, setSort] = useState<CrmTableSort>({ key: null, dir: "asc" });
  const [detail, setDetail] = useState<Row | null>(null);

  const handleSort = (key: string, dir: SortDir) => {
    if (dir === null) setSort({ key: null, dir: "asc" });
    else setSort({ key, dir });
  };

  const options = useMemo(
    () => ({
      template: uniqueSorted(rows.map((r) => taskTemplate(r))),
      priority: uniqueSorted(rows.map((r) => str(r.priority_label))),
      ppv: uniqueSorted(rows.map((r) => resolvePpvCode(str(r.ppv_user_id)))),
      tag: uniqueSorted(rows.flatMap((r) => toTags(r.tags))),
      leadStatus: uniqueSorted(rows.map((r) => str(r.lead_status))),
    }),
    [rows, resolvePpvCode],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (fTemplate && taskTemplate(r) !== fTemplate) return false;
      if (fPriority && str(r.priority_label) !== fPriority) return false;
      if (fPpv && resolvePpvCode(str(r.ppv_user_id)) !== fPpv) return false;
      if (fTag && !toTags(r.tags).includes(fTag)) return false;
      if (fLeadStatus && str(r.lead_status) !== fLeadStatus) return false;
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
          taskTemplate(r),
          r.tags,
          r.lead_status,
        ]
          .map((v) => str(v).toLowerCase())
          .join(" ");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sort.key) {
      const dir = sort.dir === "asc" ? 1 : -1;
      const val = (r: Row): string | number => {
        switch (sort.key) {
          case "template":
            return taskTemplate(r).toLowerCase();
          case "priority":
            return numOrNull(r.priority_score) ?? -1;
          case "ppv":
            return resolvePpvCode(str(r.ppv_user_id)).toLowerCase();
          case "status":
            return str(r.lead_status).toLowerCase();
          case "lead":
            return taskLeadPrimary(r).toLowerCase();
          case "due":
            return parseDate(r.effective_due_at ?? r.due_at) ?? 0;
          default:
            return "";
        }
      };
      list.sort((a, b) => {
        const av = val(a);
        const bv = val(b);
        if (typeof av === "number" && typeof bv === "number")
          return (av - bv) * dir;
        return String(av).localeCompare(String(bv), "lv") * dir;
      });
    }
    return list;
  }, [
    rows,
    search,
    fTemplate,
    fPriority,
    fPpv,
    fTag,
    fLeadStatus,
    fDue,
    sort,
    resolvePpvCode,
  ]);

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

  const hasActiveFilters =
    !!search ||
    !!fTemplate ||
    !!fPriority ||
    !!fPpv ||
    !!fTag ||
    !!fLeadStatus ||
    !!fDue;
  const clearAllFilters = () => {
    setSearch("");
    setFTemplate("");
    setFPriority("");
    setFPpv("");
    setFTag("");
    setFLeadStatus("");
    setFDue("");
  };

  const openLead = (leadId: unknown) => {
    const id = str(leadId);
    if (id) {
      try {
        sessionStorage.setItem("lead360:returnTo", "/sis-darba-rinda");
      } catch {
        /* ignore */
      }
      navigate({ to: "/lead/$leadId", params: { leadId: id } });
    }
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

      {loading ? (
        <LoadingState label="Ielādē SIS uzdevumus..." />
      ) : (
        <CrmDataTable sort={sort} onSortChange={handleSort}>
          <CrmDataTableHeader>
            <CrmDataTableLabelRow>
              <CrmSortableHead sortKey="template" label="Template" style={{ width: 160 }} />
              <CrmSortableHead sortKey="priority" label="Prioritāte" style={{ width: 84 }} />
              <CrmSortableHead sortKey="ppv" label="PPV" style={{ width: 72 }} />
              <CrmSortableHead label="Tagi" style={{ width: 150 }} />
              <CrmSortableHead sortKey="status" label="Lead statuss" style={{ width: 130 }} />
              <CrmSortableHead sortKey="lead" label="Lead" style={{ width: "auto" }} />
              <CrmSortableHead label="Atbildīgais" style={{ width: 110 }} />
              <CrmSortableHead sortKey="due" label="Termiņš" style={{ width: 116 }} />
              <CrmSortableHead label="Darbības" align="right" style={{ width: 72 }} />
            </CrmDataTableLabelRow>
            <CrmDataTableFilterRow>
              <CrmFilterCell>
                <CrmFilterSelect
                  value={fTemplate}
                  onValueChange={setFTemplate}
                  options={options.template.map((o) => ({ value: o, label: o }))}
                  placeholder="Template"
                />
              </CrmFilterCell>
              <CrmFilterCell>
                <CrmFilterSelect
                  value={fPriority}
                  onValueChange={setFPriority}
                  options={options.priority.map((o) => ({ value: o, label: o }))}
                  placeholder="Prioritāte"
                />
              </CrmFilterCell>
              <CrmFilterCell>
                <CrmFilterSelect
                  value={fPpv}
                  onValueChange={setFPpv}
                  options={options.ppv.map((o) => ({ value: o, label: o }))}
                  placeholder="PPV"
                />
              </CrmFilterCell>
              <CrmFilterCell>
                <CrmFilterSelect
                  value={fTag}
                  onValueChange={setFTag}
                  options={options.tag.map((o) => ({ value: o, label: o }))}
                  placeholder="Tagi"
                />
              </CrmFilterCell>
              <CrmFilterCell>
                <CrmFilterSelect
                  value={fLeadStatus}
                  onValueChange={setFLeadStatus}
                  options={options.leadStatus.map((o) => ({ value: o, label: o }))}
                  placeholder="Statuss"
                />
              </CrmFilterCell>
              <CrmFilterCell>
                <CrmSearchInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Meklēt uzdevumus..."
                />
              </CrmFilterCell>
              <CrmFilterCell />
              <CrmFilterCell>
                <CrmFilterSelect
                  value={fDue}
                  onValueChange={setFDue}
                  options={[
                    { value: "overdue", label: "Kavēts" },
                    { value: "today", label: "Šodien" },
                  ]}
                  placeholder="Termiņš"
                />
              </CrmFilterCell>
              <CrmFilterCell align="right">
                <CrmClearFiltersButton
                  active={hasActiveFilters}
                  onClick={clearAllFilters}
                />
              </CrmFilterCell>
            </CrmDataTableFilterRow>
          </CrmDataTableHeader>
          <CrmDataBody>
            {filtered.length === 0 ? (
              <CrmDataRow>
                <CrmDataCell colSpan={9} align="center" className="text-muted-foreground">
                  {hasActiveFilters
                    ? "Nav uzdevumu, kas atbilst filtriem."
                    : "Nav SIS uzdevumu."}
                </CrmDataCell>
              </CrmDataRow>
            ) : (
              filtered.map((r, i) => {
                const overdue = str(r.queue_bucket).toLowerCase() === "overdue";
                const tags = normalizeTags(toTags(r.tags));
                const ppvCode = resolvePpvCode(str(r.ppv_user_id));
                const ppvName = resolvePpvName(str(r.ppv_user_id));
                const secondary = taskLeadSecondary(r);
                return (
                  <CrmDataRow
                    key={str(r.id) || i}
                    className="cursor-pointer"
                    onClick={() => setDetail(r)}
                  >
                    <CrmDataCell className="align-top font-medium text-foreground">
                      {taskTemplate(r) || "—"}
                    </CrmDataCell>
                    <CrmDataCell className="align-top">
                      <TaskPriorityCell row={r} />
                    </CrmDataCell>
                    <CrmDataCell
                      className="align-top text-muted-foreground"
                      title={ppvName || ppvCode || undefined}
                    >
                      {ppvCode || <span className="text-muted-foreground/50">—</span>}
                    </CrmDataCell>
                    <CrmDataCell className="align-top">
                      {tags.length === 0 ? (
                        <span className="text-muted-foreground/50">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-0.5">
                          {tags.slice(0, 2).map((t) => (
                            <Tag key={t} tag={t} />
                          ))}
                          {tags.length > 2 && (
                            <span className="text-[12px] text-muted-foreground/60">
                              +{tags.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </CrmDataCell>
                    <CrmDataCell className="align-top">
                      <StatusBadge status={str(r.lead_status) || null} />
                    </CrmDataCell>
                    <CrmDataCell className="align-top">
                      <div className="flex flex-col leading-tight">
                        <span className="font-medium text-foreground">
                          {taskLeadPrimary(r) || (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </span>
                        {secondary && (
                          <span className="mt-0.5 text-[12px] text-muted-foreground">
                            {secondary}
                          </span>
                        )}
                      </div>
                    </CrmDataCell>
                    <CrmDataCell className="align-top">
                      <Badge variant="secondary" className="text-[11px] font-medium">
                        {SIS_OWNER_LABEL} / Sistēma
                      </Badge>
                    </CrmDataCell>
                    <CrmDataCell
                      className={cn(
                        "align-top tabular-nums",
                        overdue
                          ? "text-[var(--tivo-red)]"
                          : "text-muted-foreground",
                      )}
                    >
                      {fmtDate(r.effective_due_at ?? r.due_at)}
                    </CrmDataCell>
                    <CrmDataCell align="right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Detaļas"
                          aria-label="Detaļas"
                          onClick={() => setDetail(r)}
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Atvērt Lead"
                          aria-label="Atvērt Lead"
                          onClick={() => openLead(r.lead_id)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </CrmDataCell>
                  </CrmDataRow>
                );
              })
            )}
          </CrmDataBody>
        </CrmDataTable>
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
  const [fLead, setFLead] = useState("");
  const [fResult, setFResult] = useState("");
  const [datePreset, setDatePreset] = useState<"" | "7" | "14" | "month">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<CrmTableSort>({ key: null, dir: "desc" });
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

  const handleSort = (key: string, dir: SortDir) => {
    if (dir === null) setSort({ key: null, dir: "desc" });
    else setSort({ key, dir });
  };

  // Date range bounds (ms) derived from quick preset or custom inputs.
  // Custom inputs (No/Līdz) take priority over presets. activity_at only.
  const dateRange = useMemo<{ min: number | null; max: number | null } | null>(
    () => {
      if (dateFrom || dateTo) {
        const min = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
        const max = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
        return { min, max };
      }
      if (datePreset) {
        const now = Date.now();
        const d = new Date();
        if (datePreset === "7") d.setDate(d.getDate() - 7);
        else if (datePreset === "14") d.setDate(d.getDate() - 14);
        else if (datePreset === "month") d.setMonth(d.getMonth() - 1);
        return { min: d.getTime(), max: now };
      }
      return null;
    },
    [datePreset, dateFrom, dateTo],
  );
  const pickPreset = (p: "7" | "14" | "month") => {
    setDateFrom("");
    setDateTo("");
    setDatePreset((prev) => (prev === p ? "" : p));
  };

  // Filter option lists — derived from already-loaded view rows only.
  const options = useMemo(
    () => ({
      channel: uniqueSorted(rows.map((r) => str(r.channel))),
      result: uniqueSorted(rows.map((r) => rowResultLabel(r))),
      lead: uniqueSorted(rows.map((r) => leadPrimary(r))),
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (fChannel && str(r.channel) !== fChannel) return false;
      if (fResult && rowResultLabel(r) !== fResult) return false;
      if (fLead && leadPrimary(r) !== fLead) return false;
      if (dateRange) {
        const t = parseDate(r.activity_at ?? r.created_at);
        if (t == null) return false;
        if (dateRange.min != null && t < dateRange.min) return false;
        if (dateRange.max != null && t > dateRange.max) return false;
      }
      if (q) {
        const hay = [
          r.subject,
          r.summary,
          leadPrimary(r),
          r.channel,
          r.outcome_code,
          r.latest_event_status,
        ]
          .map((v) => str(v).toLowerCase())
          .join(" ");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sort.key) {
      const dir = sort.dir === "asc" ? 1 : -1;
      const val = (r: Row): string | number => {
        switch (sort.key) {
          case "date":
            return parseDate(r.activity_at ?? r.created_at) ?? 0;
          case "lead":
            return leadPrimary(r).toLowerCase();
          case "channel":
            return lv(CHANNEL_LV, str(r.channel), str(r.channel)).toLowerCase();
          case "subject":
            return (str(r.subject) || str(r.summary)).toLowerCase();
          case "result":
            return rowResultLabel(r).toLowerCase();
          default:
            return "";
        }
      };
      list.sort((a, b) => {
        const av = val(a);
        const bv = val(b);
        if (typeof av === "number" && typeof bv === "number")
          return (av - bv) * dir;
        return String(av).localeCompare(String(bv), "lv") * dir;
      });
    }
    return list;
  }, [rows, search, fChannel, fResult, fLead, dateRange, sort]);

  // KPI counters — visual only, normalized from view rows.
  const counters = useMemo(() => {
    let sent = 0;
    let delivered = 0;
    let opened = 0;
    let clicked = 0;
    let replied = 0;
    for (const r of rows) {
      switch (resultKey(rowResultRaw(r))) {
        case "sent":
          sent += 1;
          break;
        case "delivered":
          delivered += 1;
          break;
        case "opened":
          opened += 1;
          break;
        case "clicked":
          clicked += 1;
          break;
        case "replied":
          replied += 1;
          break;
      }
    }
    return { sent, delivered, opened, clicked, replied };
  }, [rows]);

  const hasDateFilter = !!datePreset || !!dateFrom || !!dateTo;
  const hasActiveFilters =
    !!search || !!fChannel || !!fResult || !!fLead || hasDateFilter;
  const clearAllFilters = () => {
    setSearch("");
    setFChannel("");
    setFResult("");
    setFLead("");
    setDatePreset("");
    setDateFrom("");
    setDateTo("");
  };

  const openLead = (leadId: unknown) => {
    const id = str(leadId);
    if (id) navigate({ to: "/lead/$leadId", params: { leadId: id } });
  };

  if (errorMsg) return <ErrorState message="Neizdevās ielādēt SIS komunikāciju." />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
        <StatCard label="Nosūtīts" value={counters.sent} tone="blue" />
        <StatCard label="Piegādāts" value={counters.delivered} tone="blue" />
        <StatCard label="Atvērts" value={counters.opened} tone="purple" />
        <StatCard label="Click" value={counters.clicked} tone="amber" />
        <StatCard label="Atbildēts" value={counters.replied} tone="orange" />
      </div>

      {loading ? (
        <LoadingState label="Ielādē SIS komunikāciju..." />
      ) : (
        <CrmDataTable sort={sort} onSortChange={handleSort}>
          <CrmDataTableHeader>
            <CrmDataTableLabelRow>
              <CrmSortableHead sortKey="date" label="Datums" style={{ width: 112 }} />
              <CrmSortableHead sortKey="lead" label="Lead" style={{ width: 220 }} />
              <CrmSortableHead sortKey="channel" label="Kanāls" style={{ width: 120 }} />
              <CrmSortableHead sortKey="subject" label="Subject / Summary" style={{ width: "auto" }} />
              <CrmSortableHead sortKey="result" label="Rezultāts" style={{ width: 120 }} />
              <CrmSortableHead label="Darbības" align="right" style={{ width: 72 }} />
            </CrmDataTableLabelRow>
            <CrmDataTableFilterRow>
              <CrmFilterCell>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "crm-filter-control justify-between gap-1",
                        hasDateFilter && "font-medium text-foreground",
                      )}
                      title="Filtrēt pēc datuma"
                    >
                      <span className="flex items-center gap-1 truncate">
                        <CalendarDays className="h-3 w-3 shrink-0" />
                        {datePreset === "7"
                          ? "7 dienas"
                          : datePreset === "14"
                            ? "14 dienas"
                            : datePreset === "month"
                              ? "Mēnesis"
                              : dateFrom || dateTo
                                ? "Pielāgots"
                                : "Datums"}
                      </span>
                      {hasDateFilter && (
                        <X
                          className="h-3 w-3 shrink-0 opacity-60 hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDatePreset("");
                            setDateFrom("");
                            setDateTo("");
                          }}
                        />
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { v: "7", l: "7 dienas" },
                          { v: "14", l: "14 dienas" },
                          { v: "month", l: "Mēnesis" },
                        ] as const
                      ).map((o) => (
                        <Button
                          key={o.v}
                          type="button"
                          variant={datePreset === o.v ? "default" : "outline"}
                          size="sm"
                          className="h-7 px-2.5 text-xs"
                          onClick={() => pickPreset(o.v)}
                        >
                          {o.l}
                        </Button>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="w-10">No</span>
                        <input
                          type="date"
                          value={dateFrom}
                          max={dateTo || undefined}
                          onChange={(e) => {
                            setDatePreset("");
                            setDateFrom(e.target.value);
                          }}
                          className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-xs"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="w-10">Līdz</span>
                        <input
                          type="date"
                          value={dateTo}
                          min={dateFrom || undefined}
                          onChange={(e) => {
                            setDatePreset("");
                            setDateTo(e.target.value);
                          }}
                          className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-xs"
                        />
                      </label>
                    </div>
                    {hasDateFilter && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-full text-xs"
                        onClick={() => {
                          setDatePreset("");
                          setDateFrom("");
                          setDateTo("");
                        }}
                      >
                        Notīrīt datumu
                      </Button>
                    )}
                  </PopoverContent>
                </Popover>
              </CrmFilterCell>
              <CrmFilterCell>
                <CrmFilterSelect
                  value={fLead}
                  onValueChange={setFLead}
                  options={options.lead.map((o) => ({ value: o, label: o }))}
                  placeholder="Lead"
                />
              </CrmFilterCell>
              <CrmFilterCell>
                <CrmFilterSelect
                  value={fChannel}
                  onValueChange={setFChannel}
                  options={options.channel.map((o) => ({
                    value: o,
                    label: lv(CHANNEL_LV, o, o),
                  }))}
                  placeholder="Kanāls"
                />
              </CrmFilterCell>
              <CrmFilterCell>
                <CrmSearchInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Meklēt komunikāciju..."
                />
              </CrmFilterCell>
              <CrmFilterCell>
                <CrmFilterSelect
                  value={fResult}
                  onValueChange={setFResult}
                  options={options.result.map((o) => ({ value: o, label: o }))}
                  placeholder="Rezultāts"
                />
              </CrmFilterCell>
              <CrmFilterCell align="right">
                <CrmClearFiltersButton
                  active={hasActiveFilters}
                  onClick={clearAllFilters}
                />
              </CrmFilterCell>
            </CrmDataTableFilterRow>
          </CrmDataTableHeader>
          <CrmDataBody>
            {filtered.length === 0 ? (
              <CrmDataRow>
                <CrmDataCell colSpan={6} align="center" className="text-muted-foreground">
                  {hasActiveFilters
                    ? "Nav ierakstu, kas atbilst filtriem."
                    : "Nav SIS komunikācijas ierakstu."}
                </CrmDataCell>
              </CrmDataRow>
            ) : (
              filtered.map((r, i) => (
                <CrmDataRow
                  key={str(r.activity_id) || i}
                  className="cursor-pointer"
                  onClick={() => setDetail(r)}
                >
                  <CrmDataCell className="tabular-nums align-top text-muted-foreground">
                    <div className="flex flex-col leading-tight">
                      <span className="text-foreground">
                        {fmtDate(r.activity_at ?? r.created_at)}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        {fmtTime(r.activity_at ?? r.created_at)}
                      </span>
                    </div>
                  </CrmDataCell>
                  <CrmDataCell className="align-top">
                    <div className="flex flex-col leading-tight">
                      <span className="font-medium text-foreground">
                        {leadPrimary(r)}
                      </span>
                      {leadSecondary(r) && (
                        <span className="mt-0.5 text-[12px] text-muted-foreground">
                          {leadSecondary(r)}
                        </span>
                      )}
                    </div>
                  </CrmDataCell>
                  <CrmDataCell className="align-top">
                    <div className="flex flex-col gap-0.5 leading-tight">
                      <ChannelBadge channel={str(r.channel)} />
                      <span className="text-[12px] text-muted-foreground">
                        {directionLabel(r)}
                      </span>
                    </div>
                  </CrmDataCell>
                  <CrmDataCell
                    className="align-top text-foreground"
                    title={str(r.subject) || str(r.summary)}
                  >
                    <span className="line-clamp-2">
                      {str(r.subject) || str(r.summary) || "—"}
                    </span>
                  </CrmDataCell>
                  <CrmDataCell>
                    <ResultBadge row={r} />
                  </CrmDataCell>
                  <CrmDataCell align="right" onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Detaļas"
                        aria-label="Detaļas"
                        onClick={() => setDetail(r)}
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Atvērt Lead"
                        aria-label="Atvērt Lead"
                        onClick={() => openLead(r.lead_id)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </CrmDataCell>
                </CrmDataRow>
              ))
            )}
          </CrmDataBody>
        </CrmDataTable>
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
