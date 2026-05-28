import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, ErrorState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tag, normalizeTags } from "@/components/ui/Tag";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { useCrmView } from "@/hooks/useCrmView";
import { cn } from "@/lib/utils";
import { getCrmColorToken, deadlineTone, toneClasses } from "@/lib/crmColors";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TaskActionsMenu } from "@/components/TaskActionsMenu";
import { TaskFormDialog } from "@/components/TaskFormDialog";
import { CompleteTaskModal } from "@/components/CompleteTaskModal";
import { CommStats, type CommBuckets } from "@/components/CommStats";
import { Plus } from "lucide-react";
import {
  CrmPageActionsRow,
  CrmBannerRow,
  CrmTableToolbar,
} from "@/components/crm/CrmLayout";
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
  CrmFilterInput,
  CrmFilterSelect,
  CrmSortableHead,
  type CrmTableSort,
  type SortDir,
} from "@/components/crm/table/CrmDataTable";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_ORDER = ["Jauns", "Nesasniedzams", "Piesaistīšana", "Kvalificēts"];
const mapStatus = (raw: string): string => {
  if (raw === "Atlikts" || raw === "Piedāvājums") return "Kvalificēts";
  return raw;
};
const statusSort = (label: string): number => {
  const i = STATUS_ORDER.indexOf(label);
  return i === -1 ? 99 : i;
};

export const Route = createFileRoute("/uzdevumi")({
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

function fmtDate(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("lv-LV", {
    timeZone: RIGA_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function rigaDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: RIGA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

type DueState = "overdue" | "today" | "tomorrow" | "week" | "future" | "none";

function dueState(v: unknown): DueState {
  if (!v) return "none";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "none";
  const now = new Date();
  const dk = rigaDateKey(d);
  const today = rigaDateKey(now);
  const tomorrow = rigaDateKey(new Date(now.getTime() + 86400000));
  if (d.getTime() < now.getTime() && dk !== today) return "overdue";
  if (dk === today) return "today";
  if (dk === tomorrow) return "tomorrow";
  const diff = (d.getTime() - now.getTime()) / 86400000;
  if (diff <= 7) return "week";
  return "future";
}

function DueCell({ value }: { value: unknown }) {
  if (!value) return <span className="whitespace-nowrap text-muted-foreground">—</span>;
  const tone = deadlineTone({ dueAt: String(value) });
  const { text } = toneClasses(tone);
  const emphasis = tone === "red" || tone === "orange" ? "font-semibold" : "font-medium";
  return (
    <span className={cn("whitespace-nowrap tabular-nums", text, emphasis)}>
      {fmtDate(value)}
    </span>
  );
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "lv"),
  );
}

function PriorityBadge({ label }: { label: string }) {
  if (!label) return <span className="text-muted-foreground">—</span>;
  const { className } = getCrmColorToken("taskPriority", label);
  return (
    <Badge
      className={cn(
        "h-5 rounded px-1.5 py-0 text-[10px] font-medium leading-none border-transparent",
        className,
      )}
    >
      {label}
    </Badge>
  );
}

function taskPriorityLabel(raw: unknown): string {
  const v = s(raw).toLowerCase();
  if (!v) return "";
  if (v === "high" || v === "urgent" || v === "critical") return "Augsta";
  if (v === "normal" || v === "medium" || v === "default") return "Vidēja";
  if (v === "low") return "Zema";
  // Already a Latvian label?
  if (v === "augsta") return "Augsta";
  if (v === "normāla" || v === "normala" || v === "vidēja" || v === "videja") return "Vidēja";
  if (v === "zema") return "Zema";
  return s(raw);
}

function parseTags(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((t) => String(t).trim().toLowerCase())
      .filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function leadLabel(row: Row): string {
  return (
    s(row.full_name) ||
    s(row.name) ||
    s(row.object_name) ||
    "Bez vārda"
  );
}

function leadSecondary(row: Row): string {
  const parts = [s(row.country), s(row.ppv_email), s(row.ppv_phone)].filter(Boolean);
  return parts.join(" · ");
}

function TagsCell({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {normalizeTags(tags).map((t) => (
        <Tag key={t} label={t} />
      ))}
    </div>
  );
}

function OwnerBadge({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const v = value.toUpperCase();
  if (v === "—" || v === "NAV PIEŠĶIRTS" || v === "NAV PIESKIRTS")
    return <span className="text-muted-foreground">—</span>;
  const toneKey =
    v === "SIS" ? "muted"
    : v === "MO" ? "teal"
    : v === "UC" ? "green"
    : v === "CP" ? "orange"
    : "purple";
  const { bg, text } = toneClasses(toneKey);
  return (
    <Badge
      className={cn(
        "h-5 rounded px-1.5 py-0 text-[10px] font-semibold leading-none",
        "border-transparent",
        bg,
        text,
      )}
    >
      {value}
    </Badge>
  );
}

function MiniKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "blue" | "neutral";
}) {
  const toneKey =
    tone === "red" ? "red"
    : tone === "amber" ? "orange"
    : tone === "blue" ? "blue"
    : "navy";
  const { text } = toneClasses(toneKey);
  const valueTone = tone === "neutral" ? "text-foreground" : text;
  const bar =
    tone === "red" ? "bg-[var(--tivo-red)]"
    : tone === "amber" ? "bg-[var(--tivo-orange)]"
    : tone === "blue" ? "bg-[var(--tivo-blue)]"
    : "bg-border";
  return (
    <div className="relative rounded-md border border-border bg-card px-3 py-2 shadow-sm">
      <div className={cn("absolute inset-y-0 left-0 w-0.5 rounded-l-md", bar)} />
      <div className="flex items-baseline justify-between gap-2 pl-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className={cn("text-xl font-semibold tabular-nums leading-none", valueTone)}>
          {value}
        </span>
      </div>
    </div>
  );
}

function QueuePage() {
  const view = useCrmView("v_tasks_queue_ui_v2", undefined, { all: true });
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [completeTask, setCompleteTask] = useState<{
    taskId: string;
    leadId: string | null;
    taskType: string | null;
  } | null>(null);
  const rawRows = (view.data?.rows ?? []) as Row[];

  // Filter: only show human-action rows. Exclude system/automation rows
  // (action_owner_type === 'system', e.g. SIS smartsheet automation and
  // automation-only planned emails).
  const humanRows = useMemo(
    () =>
      rawRows.filter((r) => {
        const ownerType = s(r.action_owner_type).toLowerCase();
        if (ownerType === "system") return false;
        if (s(r.action_owner_label).toUpperCase() === "SIS") return false;
        return true;
      }),
    [rawRows],
  );

  // Per-lead enrichment from the v3 display contract: PPV + responsible user
  // codes/names and communication counts. Keyed by lead_number (no UUIDs).
  const v3View = useCrmView(
    "leads_list_display_v3",
    "select=lead_number,ppv_user_code,ppv_name,task_assigned_user_code,task_assigned_name,email_outbound_count,email_inbound_count,call_outbound_count,call_inbound_count,chat_outbound_count,chat_inbound_count",
    { all: true },
  );
  type V3Enrichment = {
    ppv_code: string;
    ppv_name: string;
    task_code: string;
    task_name: string;
    counts: CommBuckets;
  };
  const v3ByLeadNumber = useMemo(() => {
    const map = new Map<string, V3Enrichment>();
    const r = (v3View.data?.rows ?? []) as Row[];
    for (const row of r) {
      const ln = s(row.lead_number);
      if (!ln) continue;
      map.set(ln, {
        ppv_code: s(row.ppv_user_code),
        ppv_name: s(row.ppv_name),
        task_code: s(row.task_assigned_user_code),
        task_name: s(row.task_assigned_name),
        counts: {
          email: [n(row.email_outbound_count), n(row.email_inbound_count)],
          call: [n(row.call_outbound_count), n(row.call_inbound_count)],
          chat: [n(row.chat_outbound_count), n(row.chat_inbound_count)],
        },
      });
    }
    return map;
  }, [v3View.data]);

  const rows = useMemo<Row[]>(() => {
    return humanRows.map((r) => {
      const ln = s(r.lead_number);
      const e = ln ? v3ByLeadNumber.get(ln) : undefined;
      const base: Row = { ...r };
      // Task priority comes from crm.tasks.priority (already projected as
      // `priority` on v_tasks_queue_ui_v2). Never inherited from lead.
      const taskRaw = s(r.priority);
      base.task_priority_raw = taskRaw;
      base.task_priority_label = taskPriorityLabel(taskRaw);
      // Responsible / PPV come from the v3 contract — initials in code,
      // full name reserved for tooltip.
      base.task_executor_label = e?.task_code ?? "";
      base.task_executor_name = e?.task_name ?? "";
      base.ppv_label = e?.ppv_code ?? "";
      base.ppv_name_display = e?.ppv_name ?? "";
      return base;
    });
  }, [humanRows, v3ByLeadNumber]);

  const commCounts = useMemo(() => {
    const map = new Map<string, CommBuckets>();
    for (const [ln, e] of v3ByLeadNumber) map.set(ln, e.counts);
    return map;
  }, [v3ByLeadNumber]);


  const statusOptionsView = useCrmView(
    "lead_status_options",
    "select=value,label,sort_order&order=sort_order.asc",
    { all: true },
  );
  const ALLOWED_LEAD_STATUSES = [
    "Jauns",
    "Nesasniedzams",
    "Piesaistīšana",
    "Kvalificēts",
    "Nekvalificējas",
  ];
  const leadStatusOptions = useMemo(() => {
    const raw = (statusOptionsView.data?.rows ?? []) as Row[];
    const filtered = raw
      .map((o) => ({
        label: s(o.label) || s(o.value),
        sort_order: n(o.sort_order),
      }))
      .filter((o) => ALLOWED_LEAD_STATUSES.includes(o.label));
    if (filtered.length === 0) {
      return ALLOWED_LEAD_STATUSES.map((l, i) => ({ label: l, sort_order: i }));
    }
    return filtered.sort((a, b) => a.sort_order - b.sort_order);
  }, [statusOptionsView.data]);

  const [actionType, setActionType] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<string>("all");
  const [leadStatus, setLeadStatus] = useState<string>("all");
  const [taskPriority, setTaskPriority] = useState<string>("all");
  const [owner, setOwner] = useState<string>("all");
  const [country, setCountry] = useState<string>("all");
  const [ppv, setPpv] = useState<string>("all");
  const [tags, setTags] = useState<string[]>([]);
  const [q, setQ] = useState<string>("");
  const [source, setSource] = useState<"all" | "auto" | "manual">("all");
  const [sort, setSort] = useState<CrmTableSort>({ key: null, dir: "desc" });

  // Persist filters/sort to sessionStorage so returning from /lead/$id restores state.
  const filtersHydratedRef = useRef(false);
  useEffect(() => {
    if (filtersHydratedRef.current) return;
    filtersHydratedRef.current = true;
    try {
      const raw = sessionStorage.getItem("uzdevumi:lastSearch");
      if (!raw) return;
      const p = JSON.parse(raw) as Record<string, unknown>;
      if (typeof p.actionType === "string") setActionType(p.actionType);
      if (typeof p.dueFilter === "string") setDueFilter(p.dueFilter);
      if (typeof p.leadStatus === "string") setLeadStatus(p.leadStatus);
      if (typeof p.taskPriority === "string") setTaskPriority(p.taskPriority);
      if (typeof p.owner === "string") setOwner(p.owner);
      if (typeof p.country === "string") setCountry(p.country);
      if (typeof p.ppv === "string") setPpv(p.ppv);
      if (Array.isArray(p.tags)) setTags(p.tags.map(String));
      if (typeof p.q === "string") setQ(p.q);
      if (p.source === "all" || p.source === "auto" || p.source === "manual")
        setSource(p.source);
      if (
        p.sort &&
        typeof p.sort === "object" &&
        ((p.sort as { dir?: unknown }).dir === "asc" || (p.sort as { dir?: unknown }).dir === "desc")
      ) {
        const k = (p.sort as { key?: unknown }).key;
        setSort({
          key: typeof k === "string" ? k : null,
          dir: (p.sort as { dir: "asc" | "desc" }).dir,
        });
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (!filtersHydratedRef.current) return;
    try {
      sessionStorage.setItem(
        "uzdevumi:lastSearch",
        JSON.stringify({
          actionType,
          dueFilter,
          leadStatus,
          taskPriority,
          owner,
          country,
          ppv,
          tags,
          q,
          source,
          sort,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [actionType, dueFilter, leadStatus, taskPriority, owner, country, ppv, tags, q, source, sort]);

  const handleSort = (key: string, dir: SortDir) => {
    if (dir === null) setSort({ key: null, dir: "asc" });
    else setSort({ key, dir });
  };

  const actionTypes = useMemo(
    () => uniq(rows.map((r) => s(r.action_label))),
    [rows],
  );
  const leadStatuses = useMemo(
    () => leadStatusOptions.map((o) => o.label),
    [leadStatusOptions],
  );
  const owners = useMemo(
    () => uniq(rows.map((r) => s(r.task_executor_label))),
    [rows],
  );
  const taskPriorities = useMemo(
    () => uniq(rows.map((r) => s(r.task_priority_label))),
    [rows],
  );
  const countries = useMemo(
    () => uniq(rows.map((r) => s(r.country))),
    [rows],
  );
  const ppvs = useMemo(
    () => uniq(rows.map((r) => s(r.ppv_label))),
    [rows],
  );
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const t of parseTags(r.tags)) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "lv"));
  }, [rows]);

  const matchRow = (
    r: Row,
    skip: { due?: boolean; leadStatus?: boolean; source?: boolean } = {},
  ): boolean => {
    const qq = q.trim().toLowerCase();
    if (actionType !== "all" && s(r.action_label) !== actionType) return false;
    if (!skip.due && dueFilter !== "all" && s(r.due_filter_key) !== dueFilter)
      return false;
    if (!skip.source && source !== "all") {
      const isAuto = s(r.task_source) === "daily_planned_task_generator";
      if (source === "auto" && !isAuto) return false;
      if (source === "manual" && isAuto) return false;
    }
    if (
      !skip.leadStatus &&
      leadStatus !== "all" &&
      mapStatus(s(r.lead_status)) !== leadStatus
    )
      return false;
    if (taskPriority !== "all" && s(r.task_priority_label) !== taskPriority)
      return false;
    if (owner !== "all" && s(r.task_executor_label) !== owner) return false;
    if (country !== "all" && s(r.country) !== country) return false;
    if (ppv !== "all" && s(r.ppv_label) !== ppv) return false;
    if (tags.length > 0) {
      const rowTags = parseTags(r.tags);
      if (rowTags.length !== tags.length) return false;
      for (const t of tags) {
        if (!rowTags.includes(t)) return false;
      }
    }
    if (qq) {
      const hay = `${leadLabel(r)} ${s(r.object_name)}`.toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    return true;
  };

  const filtered = useMemo(() => {
    const list = rows.filter((r) => matchRow(r));
    list.sort((a, b) => {
      if (sort.key) {
        const dir = sort.dir === "asc" ? 1 : -1;
        const av = sortValue(a, sort.key as SortKey);
        const bv = sortValue(b, sort.key as SortKey);
        if (typeof av === "number" && typeof bv === "number") {
          if (av !== bv) return (av - bv) * dir;
        } else {
          const as = String(av ?? "");
          const bs = String(bv ?? "");
          const cmp = as.localeCompare(bs, "lv");
          if (cmp !== 0) return cmp * dir;
        }
      }
      const aDueRaw = a.effective_due_at ?? a.due_at;
      const bDueRaw = b.effective_due_at ?? b.due_at;
      const aDue = aDueRaw ? new Date(String(aDueRaw)).getTime() : Infinity;
      const bDue = bDueRaw ? new Date(String(bDueRaw)).getTime() : Infinity;
      if (aDue !== bDue) return aDue - bDue;
      return 0;
    });
    return list;
  }, [rows, actionType, dueFilter, leadStatus, taskPriority, owner, country, ppv, tags, q, source, sort]);

  // Derive chip definitions from data
  const dueChips = useMemo(() => {
    const map = new Map<string, { key: string; label: string; sort: number }>();
    for (const r of rows) {
      const k = s(r.due_filter_key);
      if (!k) continue;
      if (!map.has(k))
        map.set(k, { key: k, label: s(r.due_filter_label) || k, sort: n(r.due_filter_sort) });
    }
    return Array.from(map.values()).sort((a, b) => a.sort - b.sort);
  }, [rows]);

  const leadStatusChips = useMemo(() => {
    const exclude = new Set(["Nekvalificējas", "Atcelts", "Atkārtojas"]);
    const map = new Map<string, { label: string; sort: number }>();
    for (const r of rows) {
      if (r.show_in_status_quick_filter === false) continue;
      const l = mapStatus(s(r.lead_status));
      if (!l || exclude.has(l)) continue;
      if (!map.has(l)) map.set(l, { label: l, sort: statusSort(l) });
    }
    for (const l of STATUS_ORDER) {
      if (!map.has(l)) map.set(l, { label: l, sort: statusSort(l) });
    }
    return Array.from(map.values())
      .filter((x) => STATUS_ORDER.includes(x.label))
      .sort((a, b) => a.sort - b.sort);
  }, [rows]);

  const dueCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of rows) {
      if (!matchRow(r, { due: true })) continue;
      const k = s(r.due_filter_key);
      if (!k) continue;
      c.set(k, (c.get(k) ?? 0) + 1);
    }
    return c;
  }, [rows, actionType, leadStatus, taskPriority, owner, country, ppv, tags, q]);

  const leadStatusCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of rows) {
      if (!matchRow(r, { leadStatus: true })) continue;
      const l = mapStatus(s(r.lead_status));
      if (!l) continue;
      c.set(l, (c.get(l) ?? 0) + 1);
    }
    return c;
  }, [rows, actionType, dueFilter, taskPriority, owner, country, ppv, tags, q]);

  const hasActiveFilters =
    actionType !== "all" ||
    dueFilter !== "all" ||
    leadStatus !== "all" ||
    taskPriority !== "all" ||
    owner !== "all" ||
    country !== "all" ||
    ppv !== "all" ||
    tags.length > 0 ||
    q.trim() !== "" ||
    source !== "all" ||
    sort.key !== null;

  const clearAllFilters = () => {
    setActionType("all");
    setDueFilter("all");
    setLeadStatus("all");
    setTaskPriority("all");
    setOwner("all");
    setCountry("all");
    setPpv("all");
    setTags([]);
    setQ("");
    setSource("all");
    setSort({ key: null, dir: "asc" });
  };

  const sourceCounts = useMemo(() => {
    let auto = 0;
    let manual = 0;
    for (const r of rows) {
      if (!matchRow(r, { source: true })) continue;
      if (s(r.task_source) === "daily_planned_task_generator") auto += 1;
      else manual += 1;
    }
    return { all: auto + manual, auto, manual };
  }, [rows, actionType, dueFilter, leadStatus, taskPriority, owner, country, ppv, tags, q]);

  return (
    <TooltipProvider delayDuration={200}>
    <div
      className="mx-auto flex max-w-7xl flex-col px-4 py-6 sm:px-6"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      <PageHeader
        title="Uzdevumi"
        description="Nākamās darbības ar leadiem"
      />
      <CrmPageActionsRow>
        <Button size="sm" onClick={() => setTaskDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Uzdevums
        </Button>
      </CrmPageActionsRow>

      <CrmBannerRow>
        {[
          ...dueChips.map((c) => (
            <FilterCard
              key={`due-${c.key}`}
              label={c.label}
              count={dueCounts.get(c.key) ?? 0}
              active={dueFilter === c.key}
              onClick={() => setDueFilter(dueFilter === c.key ? "all" : c.key)}
            />
          )),
          ...leadStatusChips.map((c) => (
            <FilterCard
              key={`s-${c.label}`}
              label={c.label}
              count={leadStatusCounts.get(c.label) ?? 0}
              active={leadStatus === c.label}
              onClick={() => setLeadStatus(leadStatus === c.label ? "all" : c.label)}
            />
          )),
        ]}
      </CrmBannerRow>

      <CrmTableToolbar>
        {([
          { key: "all", label: "Visi", count: sourceCounts.all },
          { key: "auto", label: "Auto", count: sourceCounts.auto },
          { key: "manual", label: "Manuāli", count: sourceCounts.manual },
        ] as const).map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setSource(c.key)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
              source === c.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            <span>{c.label}</span>
            <span
              className={cn(
                "tabular-nums",
                source === c.key ? "opacity-90" : "opacity-70",
              )}
            >
              {c.count}
            </span>
          </button>
        ))}
      </CrmTableToolbar>

      {view.isLoading ? (
        <LoadingState />
      ) : view.data?.error ? (
        <ErrorState message={view.data.error} />
      ) : (
        <CrmDataTable
          className="min-h-0 flex-1"
          maxHeight="100%"
          sort={sort}
          onSortChange={handleSort}
        >
          <CrmDataTableHeader>
            <CrmDataTableLabelRow>
              <CrmSortableHead sortKey="ppv" label="PPV" style={{ width: 72 }} />
              <CrmSortableHead sortKey="lead" label="Vārds Uzvārds / VAL" style={{ width: "auto" }} />
              <CrmSortableHead sortKey="tags" label="Tagi" style={{ width: "1%", whiteSpace: "nowrap" }} />
              <CrmSortableHead sortKey="leadStatus" label="Statuss" style={{ width: "1%", whiteSpace: "nowrap" }} />
              <CrmSortableHead sortKey="owner" label="Atbildīgais" style={{ width: 110 }} />
              <CrmSortableHead sortKey="due" label="Termiņš" style={{ width: 120 }} />
              <CrmSortableHead sortKey="priority" label="Prioritāte" style={{ width: "1%", whiteSpace: "nowrap" }} />
              <CrmSortableHead sortKey="action" label="Darbība" style={{ width: "auto" }} />
              <CrmSortableHead label="Darbības" align="right" style={{ width: 80 }} />
            </CrmDataTableLabelRow>
            <CrmDataTableFilterRow>
              <CrmFilterCell>
                <CrmFilterSelect
                  value={ppv === "all" ? "" : ppv}
                  onValueChange={(v) => setPpv(v || "all")}
                  options={ppvs.map((o) => ({ value: o, label: o }))}
                />
              </CrmFilterCell>
              <CrmFilterCell>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--tivo-navy)] opacity-60" />
                  <CrmFilterInput
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Meklēt leadu vai objektu..."
                    className="pl-7"
                  />
                </div>
              </CrmFilterCell>
              <CrmFilterCell>
                <TagsMultiSelect value={tags} onChange={setTags} options={allTags} />
              </CrmFilterCell>
              <CrmFilterCell>
                <CrmFilterSelect
                  value={leadStatus === "all" ? "" : leadStatus}
                  onValueChange={(v) => setLeadStatus(v || "all")}
                  options={leadStatuses.map((o) => ({ value: o, label: o }))}
                />
              </CrmFilterCell>
              <CrmFilterCell>
                <CrmFilterSelect
                  value={owner === "all" ? "" : owner}
                  onValueChange={(v) => setOwner(v || "all")}
                  options={owners.map((o) => ({ value: o, label: o }))}
                />
              </CrmFilterCell>
              <CrmFilterCell>
                <CrmFilterSelect
                  value={dueFilter === "all" ? "" : dueFilter}
                  onValueChange={(v) => setDueFilter(v || "all")}
                  options={dueChips.map((c) => ({ value: c.key, label: c.label }))}
                />
              </CrmFilterCell>
              <CrmFilterCell>
                <CrmFilterSelect
                  value={taskPriority === "all" ? "" : taskPriority}
                  onValueChange={(v) => setTaskPriority(v || "all")}
                  options={taskPriorities.map((o) => ({ value: o, label: o }))}
                />
              </CrmFilterCell>
              <CrmFilterCell>
                <CrmFilterSelect
                  value={actionType === "all" ? "" : actionType}
                  onValueChange={(v) => setActionType(v || "all")}
                  options={actionTypes.map((o) => ({ value: o, label: o }))}
                />
              </CrmFilterCell>
              <CrmFilterCell align="right">
                <CrmClearFiltersButton active={hasActiveFilters} onClick={clearAllFilters} />
              </CrmFilterCell>
            </CrmDataTableFilterRow>
          </CrmDataTableHeader>
          <CrmDataBody>
            {filtered.length === 0 ? (
              <CrmDataRow>
                <CrmDataCell colSpan={9} align="center" className="text-muted-foreground">
                  {hasActiveFilters
                    ? "Nav ierakstu, kas atbilst filtriem."
                    : "Rindā nav ierakstu"}
                </CrmDataCell>
              </CrmDataRow>
            ) : (
              filtered.map((r, i) => {
                const leadId = s(r.lead_id);
                const tLabel = s(r.task_priority_label);
                const rowTags = parseTags(r.tags);
                const taskId = s(r.id);
                const isTask =
                  s(r.action_source).toLowerCase() === "task" &&
                  UUID_RE.test(taskId);
                return (
                  <CrmDataRow
                    key={s(r.id) || s(r.queue_id) || s(r.next_action_id) || i}
                    className={cn(isTask && "cursor-pointer")}
                    onClick={
                      isTask
                        ? () =>
                            setCompleteTask({
                              taskId,
                              leadId: leadId || null,
                              taskType: s(r.task_type) || null,
                            })
                        : undefined
                    }
                  >
                    <CrmDataCell className="text-muted-foreground">
                      {s(r.ppv_label) ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default">{s(r.ppv_label)}</span>
                          </TooltipTrigger>
                          {s(r.ppv_name_display) && (
                            <TooltipContent>{s(r.ppv_name_display)}</TooltipContent>
                          )}
                        </Tooltip>
                      ) : (
                        "—"
                      )}
                    </CrmDataCell>
                    <CrmDataCell className="align-top">
                      {leadId ? (
                        <Link
                          to="/lead/$leadId"
                          params={{ leadId }}
                          onClick={(e) => {
                            e.stopPropagation();
                            try {
                              sessionStorage.setItem("lead360:returnTo", "/uzdevumi");
                            } catch {
                              /* ignore */
                            }
                          }}
                          className="block text-left text-primary/90 hover:underline"
                        >
                          <div className="line-clamp-1 font-medium">{leadLabel(r)}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                            {s(r.country) && (
                              <span className="uppercase tracking-wide">{s(r.country)}</span>
                            )}
                            <CommStats counts={commCounts.get(s(r.lead_number))} />
                          </div>
                        </Link>
                      ) : (
                        <div>
                          <div className="line-clamp-1">{leadLabel(r)}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                            {s(r.country) && (
                              <span className="uppercase tracking-wide">{s(r.country)}</span>
                            )}
                            <CommStats counts={commCounts.get(s(r.lead_number))} />
                          </div>
                        </div>
                      )}
                    </CrmDataCell>
                    <CrmDataCell>
                      <TagsCell tags={rowTags} />
                    </CrmDataCell>
                    <CrmDataCell>
                      <StatusBadge status={mapStatus(s(r.lead_status))} />
                    </CrmDataCell>
                    <CrmDataCell>
                      {s(r.task_executor_label) ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <OwnerBadge value={s(r.task_executor_label)} />
                            </span>
                          </TooltipTrigger>
                          {s(r.task_executor_name) && (
                            <TooltipContent>{s(r.task_executor_name)}</TooltipContent>
                          )}
                        </Tooltip>
                      ) : (
                        <OwnerBadge value="" />
                      )}
                    </CrmDataCell>
                    <CrmDataCell>
                      <DueCell value={r.effective_due_at ?? r.due_at} />
                    </CrmDataCell>
                    <CrmDataCell>
                      <PriorityBadge label={tLabel} />
                    </CrmDataCell>
                    <CrmDataCell className="align-top">
                      {(() => {
                        const isAuto = s(r.task_source) === "daily_planned_task_generator";
                        const gen = s(r.generated_for_date);
                        return (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold">
                                {s(r.action_label) || "—"}
                              </span>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "h-4 rounded px-1 text-[9px] font-semibold uppercase leading-none tracking-wide",
                                  isAuto
                                    ? "border-[var(--tivo-purple-border)] bg-[var(--tivo-purple-soft)] text-[var(--tivo-purple)]"
                                    : "border-border bg-[var(--crm-muted)] text-[var(--crm-text-muted)]",
                                )}
                              >
                                {isAuto ? "Auto" : "Manual"}
                              </Badge>
                            </div>
                            {isAuto && gen ? (
                              <span className="text-[12px] text-muted-foreground">
                                Ģenerēts: {fmtDate(gen)}
                              </span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </CrmDataCell>
                    <CrmDataCell align="right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {isTask ? (
                          <TaskActionsMenu
                            taskId={taskId}
                            currentDueIso={s(r.effective_due_at ?? r.due_at) || null}
                            leadId={leadId || null}
                            taskType={s(r.task_type) || null}
                            onChanged={() => {
                              view.refetch();
                            }}
                          />
                        ) : null}
                      </div>
                    </CrmDataCell>
                  </CrmDataRow>
                );
              })
            )}
          </CrmDataBody>
        </CrmDataTable>
      )}

      <TaskFormDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        onCreated={() => {
          view.refetch();
        }}
      />

      {completeTask ? (
        <CompleteTaskModal
          open={true}
          onOpenChange={(o) => {
            if (!o) setCompleteTask(null);
          }}
          taskId={completeTask.taskId}
          leadId={completeTask.leadId}
          taskType={completeTask.taskType}
          onCompleted={() => {
            view.refetch();
            setCompleteTask(null);
          }}
        />
      ) : null}
    </div>
    </TooltipProvider>
  );
}

function HeadCell({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <th
      className={cn(
        "crm-table-header-cell text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

function FilterCell({ children }: { children?: React.ReactNode }) {
  return <th className="crm-table-filter-cell">{children}</th>;
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "rounded px-1 text-[10px] tabular-nums",
          active ? "bg-primary/20 text-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function FilterCard({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group relative flex h-[68px] w-full flex-col justify-between rounded-lg border bg-card px-3 py-2 text-left shadow-sm transition-colors",
        active
          ? "border-primary/60 bg-primary/10 ring-2 ring-primary/30"
          : "border-border hover:bg-muted/60",
      )}
    >
      <span
        className={cn(
          "line-clamp-2 text-[11px] font-medium uppercase tracking-wide",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "self-end text-2xl font-semibold tabular-nums leading-none",
          active ? "text-primary" : "text-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}

type SortKey =
  | "priority"
  | "due"
  | "owner"
  | "action"
  | "lead"
  | "ppv"
  | "country"
  | "tags"
  | "leadStatus";

function sortValue(r: Row, key: SortKey): string | number {
  switch (key) {
    case "priority":
      return s(r.task_priority_label).toLowerCase();
    case "due": {
      const v = r.effective_due_at ?? r.due_at;
      return v ? new Date(String(v)).getTime() : 0;
    }
    case "owner":
      return s(r.task_executor_label).toLowerCase();
    case "action":
      return s(r.action_label).toLowerCase();
    case "lead":
      return leadLabel(r).toLowerCase();
    case "ppv":
      return s(r.ppv_label).toLowerCase();
    case "country":
      return s(r.country).toLowerCase();
    case "tags":
      return parseTags(r.tags).join(",");
    case "leadStatus": {
      return mapStatus(s(r.lead_status)).toLowerCase();
    }
  }
}

function SortButton({
  label,
  k,
  sort,
  onClick,
  ariaLabel,
}: {
  label?: string;
  k: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" } | null;
  onClick: (k: SortKey) => void;
  ariaLabel?: string;
}) {
  const active = sort?.key === k;
  const Icon = !active ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      aria-label={ariaLabel || label}
      onClick={() => onClick(k)}
      className={cn(
        "crm-sort-trigger transition-colors",
        active ? "opacity-100" : "opacity-90",
      )}
    >
      {label && <span>{label}</span>}
      <Icon
        className={cn("h-3 w-3", !active && "opacity-50")}
        strokeWidth={2.25}
      />
    </button>
  );
}

function FilterPill({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  const active = value !== "all";
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          "h-7 w-auto min-w-0 gap-1 rounded-full border px-2.5 text-[11px]",
          active
            ? "border-primary/40 bg-primary/10 text-foreground"
            : "border-border bg-background text-muted-foreground",
        )}
      >
        <span className="font-medium">{label}</span>
        {active && <span className="text-foreground">: {value}</span>}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Visi</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.v} value={o.v}>
            {o.l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function HeaderSelect({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-6 w-full min-w-0 px-1.5 text-[11px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

function HeaderOptionsSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="crm-filter-control">
        <SelectValue placeholder="Visi" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Visi</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TagsMultiSelect({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: string[];
}) {
  const label =
    value.length === 0
      ? "Visi"
      : value.length === 1
        ? value[0]
        : `${value.length} izvēlēti`;
  const toggle = (t: string) => {
    if (value.includes(t)) onChange(value.filter((x) => x !== t));
    else onChange([...value, t]);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="crm-filter-control justify-between gap-1"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto">
        {value.length > 0 && (
          <>
            <DropdownMenuItem onSelect={() => onChange([])} className="text-[11px]">
              Notīrīt
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o}
            checked={value.includes(o)}
            onCheckedChange={() => toggle(o)}
            onSelect={(e) => e.preventDefault()}
            className="text-[11px]"
          >
            {o}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

