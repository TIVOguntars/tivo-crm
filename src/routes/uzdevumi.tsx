import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, Star, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, ErrorState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tag, normalizeTags } from "@/components/ui/Tag";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useCrmView } from "@/hooks/useCrmView";
import { useUserMap } from "@/hooks/useUsers";
import { cn } from "@/lib/utils";
import { TaskActionsMenu } from "@/components/TaskActionsMenu";
import { TaskFormDialog } from "@/components/TaskFormDialog";
import { CompleteTaskModal } from "@/components/CompleteTaskModal";
import { CommStats, type CommBuckets } from "@/components/CommStats";
import { Plus } from "lucide-react";

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
  const state = dueState(value);
  const tone =
    state === "overdue"
      ? "text-red-600 dark:text-red-400 font-semibold"
      : state === "today"
        ? "text-orange-600 dark:text-orange-400 font-semibold"
        : state === "tomorrow"
          ? "text-blue-600 dark:text-blue-400 font-semibold"
          : state === "week"
            ? "text-foreground font-medium"
            : state === "future"
              ? "text-muted-foreground"
              : "text-muted-foreground";
  return <span className={cn("whitespace-nowrap tabular-nums", tone)}>{fmtDate(value)}</span>;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "lv"),
  );
}

function PriorityBadge({ label }: { label: string }) {
  if (!label) return <span className="text-muted-foreground">—</span>;
  const tone =
    label === "Augsta"
      ? "bg-orange-500 text-white border-transparent"
      : label === "Vidēja"
        ? "bg-blue-200 text-blue-900 border-transparent"
        : label === "Zema"
          ? "bg-slate-200 text-slate-700 border-transparent"
          : "";
  return (
    <Badge
      className={cn(
        "h-5 rounded px-1.5 py-0 text-[10px] font-medium leading-none",
        tone,
      )}
    >
      {label}
    </Badge>
  );
}

function PriorityStars({ label, score }: { label: string; score: number }) {
  // Map lead priority_score (0..90) to 1..5 stars.
  let count = 0;
  if (score > 0) {
    if (score >= 72) count = 5;
    else if (score >= 54) count = 4;
    else if (score >= 36) count = 3;
    else if (score >= 18) count = 2;
    else count = 1;
  } else if (label === "Augsta") count = 5;
  else if (label === "Normāla" || label === "Vidēja") count = 3;
  else if (label === "Zema") count = 1;
  if (count === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-0.5" title={`${label}${score ? ` · ${score}` : ""}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-3 w-3",
            i <= count
              ? "fill-amber-500 text-amber-500"
              : "fill-transparent text-muted-foreground/40",
          )}
          strokeWidth={2}
        />
      ))}
    </div>
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
  const tone =
    v === "SIS"
      ? "bg-slate-200 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200"
      : v === "MO"
        ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
        : v === "UC"
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
          : v === "CP"
            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
            : "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200";
  return (
    <Badge
      className={cn(
        "h-5 rounded px-1.5 py-0 text-[10px] font-semibold leading-none",
        "border-transparent",
        tone,
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
  const valueTone =
    tone === "red"
      ? "text-red-600 dark:text-red-400"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-400"
        : tone === "blue"
          ? "text-blue-600 dark:text-blue-400"
          : "text-foreground";
  const bar =
    tone === "red"
      ? "bg-red-500"
      : tone === "amber"
        ? "bg-amber-500"
        : tone === "blue"
          ? "bg-blue-500"
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
  const view = useCrmView("v_tasks_queue_ui", undefined, { all: true });
  const { resolve: resolveUserName } = useUserMap();
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

  // Priority is sourced from crm.lead_priority_scoring_v2.
  // Merge by lead_id and override priority_score / priority_label / recommended_status.
  const scoringView = useCrmView(
    "lead_priority_scoring_v2",
    "select=lead_id,priority_score,priority_label,recommended_status,raw_priority_score,has_hot_tag,inbound_count,replied_count",
    { all: true },
  );
  const scoringByLead = useMemo(() => {
    const map = new Map<string, Row>();
    const r = (scoringView.data?.rows ?? []) as Row[];
    for (const row of r) {
      const lid = s(row.lead_id);
      if (lid) map.set(lid, row);
    }
    return map;
  }, [scoringView.data]);

  // Per-task priority — sourced from crm.tasks.priority. Workflow tasks
  // each carry their own priority; never inherit from sibling tasks or lead.
  const tasksView = useCrmView(
    "tasks",
    "select=id,priority,assigned_user_id,created_by_user_id,metadata",
    { all: true },
  );
  const taskById = useMemo(() => {
    const map = new Map<string, Row>();
    const r = (tasksView.data?.rows ?? []) as Row[];
    for (const row of r) {
      const id = s(row.id);
      if (id) map.set(id, row);
    }
    return map;
  }, [tasksView.data]);

  const rows = useMemo<Row[]>(() => {
    return humanRows.map((r) => {
      const tk = taskById.get(s(r.id));
      const taskRaw = s(tk?.priority);
      const meta =
        tk?.metadata && typeof tk.metadata === "object" && !Array.isArray(tk.metadata)
          ? (tk.metadata as Record<string, unknown>)
          : null;
      const assignedUid = s(tk?.assigned_user_id);
      const resolvedAssignee = assignedUid ? resolveUserName(assignedUid) : "";
      const rawOwner =
        s(r.action_owner_label) ||
        (meta && typeof meta.owner_code === "string" ? (meta.owner_code as string) : "");
      const looksUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(assignedUid);
      const ownerFromTask =
        resolvedAssignee ||
        resolveUserName(rawOwner) ||
        rawOwner ||
        (looksUuid ? "" : assignedUid);
      const createdByUid = s(tk?.created_by_user_id);
      const createdByName = createdByUid ? resolveUserName(createdByUid) : "";
      const sc = scoringByLead.get(s(r.lead_id));
      const base: Row = sc
        ? {
            ...r,
            priority_score: sc.priority_score ?? 0,
            priority_label: sc.priority_label ?? "Zema",
            recommended_status: sc.recommended_status ?? null,
            raw_priority_score: sc.raw_priority_score ?? null,
            has_hot_tag: sc.has_hot_tag ?? null,
            inbound_count: sc.inbound_count ?? null,
            replied_count: sc.replied_count ?? null,
          }
        : { ...r };
      // Per request: task priority is derived from lead priority_score.
      //  >=70 → Augsta, 30..<70 → Vidēja, <30 → Zema.
      const leadScore = n(base.priority_score);
      const derivedTaskLabel =
        leadScore >= 70 ? "Augsta" : leadScore >= 30 ? "Vidēja" : "Zema";
      base.task_priority_raw = taskRaw;
      base.task_priority_label = derivedTaskLabel;
      base.action_owner_label = ownerFromTask;
      base.created_by_user_id = createdByUid || null;
      base.created_by_name = createdByName || (createdByUid || "");
      // Resolve PPV code (e.g. "MO"/"UC") to a real user name when possible.
      const ppvRaw = s(r.ppv_name);
      base.ppv_name = resolveUserName(ppvRaw) || ppvRaw;
      return base;
    });
  }, [humanRows, scoringByLead, taskById, resolveUserName]);


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
  const [priority, setPriority] = useState<string>("all");
  const [taskPriority, setTaskPriority] = useState<string>("all");
  const [owner, setOwner] = useState<string>("all");
  const [country, setCountry] = useState<string>("all");
  const [ppv, setPpv] = useState<string>("all");
  const [tags, setTags] = useState<string[]>([]);
  const [q, setQ] = useState<string>("");
  const [source, setSource] = useState<"all" | "auto" | "manual">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

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
      if (typeof p.priority === "string") setPriority(p.priority);
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
        (p.sort as { key?: unknown }).key &&
        ((p.sort as { dir?: unknown }).dir === "asc" || (p.sort as { dir?: unknown }).dir === "desc")
      ) {
        setSort(p.sort as { key: SortKey; dir: "asc" | "desc" });
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
          priority,
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
  }, [actionType, dueFilter, leadStatus, priority, taskPriority, owner, country, ppv, tags, q, source, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "desc" };
      if (cur.dir === "desc") return { key, dir: "asc" };
      return null;
    });
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
    () => uniq(rows.map((r) => s(r.action_owner_label))),
    [rows],
  );
  const priorities = useMemo(
    () => uniq(rows.map((r) => s(r.priority_label))),
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
    () => uniq(rows.map((r) => s(r.ppv_name))),
    [rows],
  );
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const t of parseTags(r.tags)) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "lv"));
  }, [rows]);

  const matchRow = (
    r: Row,
    skip: { due?: boolean; priority?: boolean; leadStatus?: boolean; source?: boolean } = {},
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
      mapStatus(s(r.legacy_lead_status)) !== leadStatus
    )
      return false;
    if (!skip.priority && priority !== "all" && s(r.priority_label) !== priority)
      return false;
    if (taskPriority !== "all" && s(r.task_priority_label) !== taskPriority)
      return false;
    if (owner !== "all" && s(r.action_owner_label) !== owner) return false;
    if (country !== "all" && s(r.country) !== country) return false;
    if (ppv !== "all" && s(r.ppv_name) !== ppv) return false;
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
      if (sort) {
        const dir = sort.dir === "asc" ? 1 : -1;
        const av = sortValue(a, sort.key);
        const bv = sortValue(b, sort.key);
        if (typeof av === "number" && typeof bv === "number") {
          if (av !== bv) return (av - bv) * dir;
        } else {
          const as = String(av ?? "");
          const bs = String(bv ?? "");
          const cmp = as.localeCompare(bs, "lv");
          if (cmp !== 0) return cmp * dir;
        }
      }
      const aSp = n(a.sort_priority);
      const bSp = n(b.sort_priority);
      if (aSp !== bSp) return bSp - aSp;
      const order: Record<string, number> = {
        overdue: 0,
        today: 1,
        tomorrow: 2,
        next_24h: 2,
        this_week: 3,
        upcoming: 4,
        planned: 5,
      };
      const aB = order[s(a.queue_bucket)] ?? 99;
      const bB = order[s(b.queue_bucket)] ?? 99;
      if (aB !== bB) return aB - bB;
      const aDueRaw = a.effective_due_at ?? a.due_at;
      const bDueRaw = b.effective_due_at ?? b.due_at;
      const aDue = aDueRaw ? new Date(String(aDueRaw)).getTime() : Infinity;
      const bDue = bDueRaw ? new Date(String(bDueRaw)).getTime() : Infinity;
      if (aDue !== bDue) return aDue - bDue;
      return n(b.priority_score) - n(a.priority_score);
    });
    return list;
  }, [rows, actionType, dueFilter, leadStatus, priority, owner, country, ppv, tags, q, source, sort]);

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

  const priorityChips = useMemo(() => {
    const allow = ["Augsta", "Normāla", "Zema"];
    const map = new Map<string, { label: string; sort: number }>();
    for (const r of rows) {
      const l = s(r.priority_label);
      if (!allow.includes(l)) continue;
      if (!map.has(l)) map.set(l, { label: l, sort: n(r.priority_filter_sort) });
    }
    for (const l of allow) if (!map.has(l)) map.set(l, { label: l, sort: 99 });
    return Array.from(map.values()).sort((a, b) => a.sort - b.sort);
  }, [rows]);

  const leadStatusChips = useMemo(() => {
    const exclude = new Set(["Nekvalificējas", "Atcelts", "Atkārtojas"]);
    const map = new Map<string, { label: string; sort: number }>();
    for (const r of rows) {
      if (r.show_in_status_quick_filter === false) continue;
      const l = mapStatus(s(r.legacy_lead_status));
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
  }, [rows, actionType, leadStatus, priority, owner, country, ppv, tags, q]);

  const priorityCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of rows) {
      if (!matchRow(r, { priority: true })) continue;
      const l = s(r.priority_label);
      if (!l) continue;
      c.set(l, (c.get(l) ?? 0) + 1);
    }
    return c;
  }, [rows, actionType, dueFilter, leadStatus, owner, country, ppv, tags, q]);

  const leadStatusCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of rows) {
      if (!matchRow(r, { leadStatus: true })) continue;
      const l = mapStatus(s(r.legacy_lead_status));
      if (!l) continue;
      c.set(l, (c.get(l) ?? 0) + 1);
    }
    return c;
  }, [rows, actionType, dueFilter, priority, owner, country, ppv, tags, q]);

  const hasActiveFilters =
    actionType !== "all" ||
    dueFilter !== "all" ||
    leadStatus !== "all" ||
    priority !== "all" ||
    taskPriority !== "all" ||
    owner !== "all" ||
    country !== "all" ||
    ppv !== "all" ||
    tags.length > 0 ||
    q.trim() !== "" ||
    source !== "all" ||
    sort !== null;

  const clearAllFilters = () => {
    setActionType("all");
    setDueFilter("all");
    setLeadStatus("all");
    setPriority("all");
    setTaskPriority("all");
    setOwner("all");
    setCountry("all");
    setPpv("all");
    setTags([]);
    setQ("");
    setSource("all");
    setSort(null);
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
  }, [rows, actionType, dueFilter, leadStatus, priority, owner, country, ppv, tags, q]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <PageHeader
        title="Uzdevumi"
        description="Nākamās darbības ar leadiem"
      >
        <Button size="sm" onClick={() => setTaskDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Uzdevums
        </Button>
      </PageHeader>

      <div className="mb-2 grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {dueChips.map((c) => (
          <FilterCard
            key={c.key}
            label={c.label}
            count={dueCounts.get(c.key) ?? 0}
            active={dueFilter === c.key}
            onClick={() => setDueFilter(dueFilter === c.key ? "all" : c.key)}
          />
        ))}
      </div>
      <div className="mb-3 grid w-full grid-cols-1 gap-2 lg:grid-cols-7">
        <div className="grid grid-cols-3 gap-2 lg:col-span-3 lg:border-r lg:border-border lg:pr-2">
          {priorityChips.map((c) => (
            <FilterCard
              key={`p-${c.label}`}
              label={c.label}
              count={priorityCounts.get(c.label) ?? 0}
              active={priority === c.label}
              onClick={() => setPriority(priority === c.label ? "all" : c.label)}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:col-span-4">
          {leadStatusChips.map((c) => (
            <FilterCard
              key={`s-${c.label}`}
              label={c.label}
              count={leadStatusCounts.get(c.label) ?? 0}
              active={leadStatus === c.label}
              onClick={() => setLeadStatus(leadStatus === c.label ? "all" : c.label)}
            />
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
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
      </div>

      {view.isLoading ? (
        <LoadingState />
      ) : view.data?.error ? (
        <ErrorState message={view.data.error} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="relative w-full overflow-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:bg-muted/95 supports-[backdrop-filter]:[&_tr]:bg-muted/85">
              <tr className="sticky top-0 z-20 border-b border-border/70 backdrop-blur shadow-[0_1px_0_0_hsl(var(--border))]">
                <HeadCell className="w-[100px]">
                  <SortButton label="Lead prioritāte" k="leadPriority" sort={sort} onClick={toggleSort} />
                </HeadCell>
                <HeadCell className="text-muted-foreground/70">
                  <SortButton label="PPV" k="ppv" sort={sort} onClick={toggleSort} />
                </HeadCell>
                <HeadCell className="w-[200px]">
                  <SortButton label="Vārds Uzvārds / VAL" k="lead" sort={sort} onClick={toggleSort} />
                </HeadCell>
                <HeadCell className="w-[120px]">
                  <SortButton label="Tagi" k="tags" sort={sort} onClick={toggleSort} />
                </HeadCell>
                <HeadCell className="text-muted-foreground/70">
                  <SortButton label="Statuss" k="leadStatus" sort={sort} onClick={toggleSort} />
                </HeadCell>
                <HeadCell className="w-[64px]">
                  <SortButton label="Atbildīgais" k="owner" sort={sort} onClick={toggleSort} />
                </HeadCell>
                <HeadCell className="w-[100px]">
                  <SortButton label="Termiņš" k="due" sort={sort} onClick={toggleSort} />
                </HeadCell>
                <HeadCell className="w-[88px]">
                  <SortButton label="Prioritāte" k="priority" sort={sort} onClick={toggleSort} />
                </HeadCell>
                <HeadCell>
                  <SortButton label="Darbība" k="action" sort={sort} onClick={toggleSort} />
                </HeadCell>
                <HeadCell className="w-[80px] text-right">Darbības</HeadCell>
              </tr>
              <tr className="sticky top-8 z-20 border-b-2 border-border bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
                <FilterCell>
                  <HeaderOptionsSelect value={priority} onChange={setPriority} options={priorities} />
                </FilterCell>
                <FilterCell>
                  <HeaderOptionsSelect value={ppv} onChange={setPpv} options={ppvs} />
                </FilterCell>
                <FilterCell>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Meklēt leadu vai objektu..."
                      className="h-7 w-full rounded-md border border-input bg-white pl-6 pr-2 text-[11px] font-normal leading-none text-slate-900 placeholder:font-normal placeholder:text-slate-500 dark:bg-white dark:text-slate-900 dark:placeholder:text-slate-500"
                    />
                  </div>
                </FilterCell>
                <FilterCell>
                  <TagsMultiSelect value={tags} onChange={setTags} options={allTags} />
                </FilterCell>
                <FilterCell>
                  <HeaderOptionsSelect value={leadStatus} onChange={setLeadStatus} options={leadStatuses} />
                </FilterCell>
                <FilterCell>
                  <HeaderOptionsSelect value={owner} onChange={setOwner} options={owners} />
                </FilterCell>
                <FilterCell>
                  <Select value={dueFilter} onValueChange={setDueFilter}>
                    <SelectTrigger className="h-7 w-full min-w-0 rounded-md border border-input bg-white px-2 text-[11px] font-normal leading-none text-slate-900 dark:bg-white dark:text-slate-900">
                      <SelectValue placeholder="Visi" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Visi</SelectItem>
                      {dueChips.map((c) => (
                        <SelectItem key={c.key} value={c.key}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterCell>
                <FilterCell>
                  <HeaderOptionsSelect value={taskPriority} onChange={setTaskPriority} options={taskPriorities} />
                </FilterCell>
                <FilterCell>
                  <HeaderOptionsSelect value={actionType} onChange={setActionType} options={actionTypes} />
                </FilterCell>
                <FilterCell>
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="inline-flex h-7 w-full items-center justify-center gap-1 rounded-md border border-input bg-white px-2 text-[11px] font-normal leading-none text-slate-700 transition-colors hover:bg-slate-50 dark:bg-white dark:text-slate-700 dark:hover:bg-slate-100"
                      title="Notīrīt visus filtrus"
                    >
                      <X className="h-3 w-3" />
                      <span>Notīrīt</span>
                    </button>
                  ) : null}
                </FilterCell>
              </tr>
            </thead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                    {hasActiveFilters
                      ? "Nav ierakstu, kas atbilst filtriem."
                      : "Rindā nav ierakstu"}
                  </TableCell>
                </TableRow>
              ) : filtered.map((r, i) => {
                const leadId = s(r.lead_id);
                const pLabel = s(r.priority_label);
                const tLabel = s(r.task_priority_label);
                const isHigh = pLabel === "Augsta";
                const tags = parseTags(r.tags);
                const score = n(r.priority_score);
                const taskId = s(r.id);
                const isTask =
                  s(r.action_source).toLowerCase() === "task" &&
                  UUID_RE.test(taskId);
                return (
                  <TableRow
                    key={s(r.id) || s(r.queue_id) || s(r.next_action_id) || i}
                    className={cn(
                      "text-xs",
                      isTask && "cursor-pointer",
                      isHigh &&
                        "bg-red-50/70 hover:bg-red-100/70 dark:bg-red-950/20 dark:hover:bg-red-950/30",
                    )}
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
                    {/* 1. Lead prioritāte */}
                    <TableCell className="py-3">
                      <PriorityStars label={pLabel} score={score} />
                    </TableCell>
                    {/* 2. PPV */}
                    <TableCell className="py-3 text-muted-foreground">{s(r.ppv_name) || "—"}</TableCell>
                    {/* 3. Vārds Uzvārds / VAL */}
                    <TableCell className="py-3 align-top">
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
                          className="block max-w-[200px] text-left text-primary/90 hover:underline"
                        >
                          <div className="line-clamp-1 font-medium">{leadLabel(r)}</div>
                          {s(r.country) && (
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {s(r.country)}
                            </div>
                          )}
                        </Link>
                      ) : (
                        <div className="max-w-[200px]">
                          <div className="line-clamp-1">{leadLabel(r)}</div>
                          {s(r.country) && (
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {s(r.country)}
                            </div>
                          )}
                        </div>
                      )}
                    </TableCell>
                    {/* 4. Tagi */}
                    <TableCell className="py-3">
                      <TagsCell tags={tags} />
                    </TableCell>
                    {/* 6. Statuss */}
                    <TableCell className="py-3">
                      <StatusBadge status={mapStatus(s(r.legacy_lead_status))} />
                    </TableCell>
                    {/* 7. Atbildīgais */}
                    <TableCell className="py-3">
                      <OwnerBadge value={s(r.action_owner_label)} />
                    </TableCell>
                    {/* 8. Termiņš */}
                    <TableCell className="py-3">
                      <DueCell value={r.effective_due_at ?? r.due_at} />
                    </TableCell>
                    {/* 9. Prioritāte (uzdevuma) */}
                    <TableCell className="py-3">
                      <PriorityBadge label={tLabel} />
                    </TableCell>
                    {/* 10. Darbība */}
                    <TableCell className="py-3 align-top">
                      {(() => {
                        const isAuto = s(r.task_source) === "daily_planned_task_generator";
                        const gen = s(r.generated_for_date);
                        const createdBy = s(r.created_by_name);
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
                                    ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                                    : "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
                                )}
                              >
                                {isAuto ? "Auto" : createdBy || "Manual"}
                              </Badge>
                            </div>
                            {isAuto && gen ? (
                              <span className="text-[10px] text-muted-foreground">
                                Ģenerēts: {fmtDate(gen)}
                              </span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </TableCell>
                    {/* 11. Darbības */}
                    <TableCell className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
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
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </table>
          </div>
        </div>
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
        "h-8 px-2 text-left align-middle text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

function FilterCell({ children }: { children?: React.ReactNode }) {
  return <th className="px-1 pb-1 pt-0 align-middle">{children}</th>;
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
  | "score"
  | "due"
  | "owner"
  | "action"
  | "lead"
  | "ppv"
  | "country"
  | "tags"
  | "leadStatus"
  | "leadPriority";

function sortValue(r: Row, key: SortKey): string | number {
  switch (key) {
    case "priority":
      return s(r.task_priority_label).toLowerCase();
    case "score":
      return n(r.priority_score);
    case "leadPriority":
      return n(r.sort_priority);
    case "due": {
      const v = r.effective_due_at ?? r.due_at;
      return v ? new Date(String(v)).getTime() : 0;
    }
    case "owner":
      return s(r.action_owner_label).toLowerCase();
    case "action":
      return s(r.action_label).toLowerCase();
    case "lead":
      return leadLabel(r).toLowerCase();
    case "ppv":
      return s(r.ppv_name).toLowerCase();
    case "country":
      return s(r.country).toLowerCase();
    case "tags":
      return parseTags(r.tags).join(",");
    case "leadStatus": {
      return mapStatus(s(r.legacy_lead_status)).toLowerCase();
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
        "inline-flex items-center gap-1 rounded px-0.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
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
      <SelectTrigger className="h-7 w-full min-w-0 rounded-md border border-input bg-white px-2 text-[11px] font-normal leading-none text-slate-900 dark:bg-white dark:text-slate-900">
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
          className="inline-flex h-7 w-full min-w-0 items-center justify-between gap-1 rounded-md border border-input bg-white px-2 text-[11px] font-normal leading-none text-slate-900 dark:bg-white dark:text-slate-900"
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

