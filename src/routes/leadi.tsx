import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import {
  Phone,
  MessageCircle,
  Mail,
  CheckSquare,
  StickyNote,
  Plus,
  Upload,
  Bookmark,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Layers,
  Eye,
  Star,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LoadingState, ErrorState } from "@/components/DataState";
import { BulkActionsBar, type BulkPatch } from "@/components/BulkActionsBar";
import { HeaderSlot } from "@/components/HeaderSlot";
import { CommStats, type CommBuckets } from "@/components/CommStats";
import { useCrmView } from "@/hooks/useCrmView";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  getViewPreference,
  saveViewPreference,
  type StoredFilter,
  type StoredSort,
} from "@/lib/viewPreferences.functions";
import { cn } from "@/lib/utils";
import { Tag, normalizeTags } from "@/components/ui/Tag";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  CrmPageActionsRow,
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
  CrmFilterSelect,
  CrmSearchInput,
  CrmSortableHead,
  type CrmTableSort,
  type SortDir,
} from "@/components/crm/table/CrmDataTable";
import {
  CHANNEL_DIRECTION_TONE,
  UNREAD_REPLY_TONE,
  detectChannel,
  directionFromTimestampSource,
} from "@/lib/channelTones";

/* ============================ URL search schema ============================ */

const filterRuleSchema = z.object({
  f: z.string(),
  op: z.string(),
  v: z.unknown().optional(),
});
const sortRuleSchema = z.object({
  f: z.string(),
  d: z.enum(["asc", "desc"]).default("desc"),
});

const leadiSearchSchema = z.object({
  view: fallback(z.string(), "all").default("all"),
  q: fallback(z.string().optional(), undefined),
  flt: fallback(z.array(filterRuleSchema), []).default([]),
  // gby: undefined = use default ["status"]; [] = explicit no grouping
  gby: fallback(z.array(z.string()).max(3).optional(), undefined),
  sort: fallback(z.array(sortRuleSchema), []).default([]),
  // legacy back-compat — read on first load only
  seg: fallback(z.string().optional(), undefined),
  status: fallback(z.array(z.string()), []).default([]),
  countries: fallback(z.array(z.string()), []).default([]),
  sources: fallback(z.array(z.string()), []).default([]),
  owners: fallback(z.array(z.string()), []).default([]),
  ppvs: fallback(z.array(z.string()), []).default([]),
  tags: fallback(z.array(z.string()), []).default([]),
});

type FilterRule = z.infer<typeof filterRuleSchema>;
type SortRule = z.infer<typeof sortRuleSchema>;

export const Route = createFileRoute("/leadi")({
  validateSearch: zodValidator(leadiSearchSchema),
  component: LeadiPage,
});

/* ============================ Types & helpers ============================ */

type Row = Record<string, unknown>;
const PAGE_SIZE = 2000;

interface Lead {
  lead_id: string;
  name: string;
  lead_number: string;
  external_id: string;
  company_name: string;
  phone: string;
  email: string;
  country: string;
  secondary: string;
  source: string;
  status: string;
  owner: string;
  ppv: string;
  ppv_user_code: string;
  ppv_name: string;
  owner_user_code: string;
  task_assigned_user_code: string;
  task_assigned_name: string;
  next_action: string;
  next_action_due: string | null; // effective_due_at
  next_action_due_date: string | null; // raw next_action_due_date (display only)
  last_activity: string | null;
  tags: string[];
  created_at: string | null;
  unread_replies: number;
  communication_state: string;
  communication_label: string;
  has_unread_reply: boolean;
  reply_count: number;
  click_count: number;
  last_reply_at: string | null;
  last_communication_at: string | null;
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  object_summary: string;
  /** Short free-text note from v3 (short_note). Display + search only. */
  short_note: string;
  /** True when v3 has a non-empty action_label for this lead. */
  has_task: boolean;
  /** Queue bucket sourced directly from backend (no frontend calc). */
  queue_bucket: string;
  queue_bucket_label: string;
  operational_bucket: string;
  needs_attention: boolean;
  priority_score: number | null;
  priority_stars: number | null;
  priority_label: string;
  priority_breakdown: string;
  priority_updated_at: string | null;
}

function s(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}
function asTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((t) => String(t).trim()).filter(Boolean);
  if (v == null) return [];
  return String(v)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
function parseDate(v: unknown): number | null {
  if (v == null || v === "") return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}

const MS_MIN = 60_000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;

/* UI-only tone mapping for v3 queue_bucket. No business logic — pure display. */
const QUEUE_BUCKET_TONE: Record<string, string> = {
  overdue: "bg-[var(--tivo-red-soft)] text-[var(--tivo-red)]",
  today: "bg-[var(--tivo-orange-soft)] text-[var(--tivo-orange)]",
  upcoming: "bg-[var(--tivo-blue-soft)] text-[var(--tivo-blue)]",
  scheduled: "bg-[var(--tivo-blue-soft)] text-[var(--tivo-blue)]",
  backlog: "bg-[var(--crm-muted)] text-[var(--crm-text-muted)]",
  done: "bg-[var(--tivo-green-soft)] text-[var(--tivo-green)]",
};
function queueBucketTone(bucket: string): string {
  const key = (bucket || "").toLowerCase();
  return QUEUE_BUCKET_TONE[key] ?? "bg-[var(--crm-muted)] text-[var(--crm-text-muted)]";
}

function fmtDate(v: string | null): string {
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

function fmtRelative(v: string | null): string {
  const t = parseDate(v);
  if (t == null) return "";
  const diff = Date.now() - t;
  if (diff < 0) return "tagad";
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "tagad";
  if (min < 60) return `pirms ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `pirms ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `pirms ${d} ${d === 1 ? "dienas" : "dienām"}`;
  const w = Math.floor(d / 7);
  if (w < 5) return `pirms ${w} ${w === 1 ? "nedēļas" : "nedēļām"}`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `pirms ${mo} ${mo === 1 ? "mēneša" : "mēnešiem"}`;
  const y = Math.floor(d / 365);
  return `pirms ${y} ${y === 1 ? "gada" : "gadiem"}`;
}

function isFutureDate(v: string | null): boolean {
  const t = parseDate(v);
  if (t == null) return false;
  return t > Date.now() + 5 * 60_000;
}

/* ----- Europe/Riga calendar helpers (next_action_date) ----- */

function rigaYmd(t: number): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Riga",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(t));
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}
function isRigaSameDay(a: number, b: number): boolean {
  const x = rigaYmd(a);
  const y = rigaYmd(b);
  return x.y === y.y && x.m === y.m && x.d === y.d;
}
/* ============================ Field catalog ============================ */

type FieldType =
  | "enum"
  | "tags"
  | "number"
  | "date"
  | "next_action_date"
  | "string";

type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  get: (l: Lead) => unknown;
};

const FIELDS: FieldDef[] = [
  { key: "status", label: "Statuss", type: "enum", get: (l) => l.status },
  { key: "owner", label: "Atbildīgais", type: "enum", get: (l) => l.owner },
  { key: "ppv", label: "PPV", type: "enum", get: (l) => l.ppv },
  { key: "country", label: "Valsts", type: "enum", get: (l) => l.country },
  { key: "tags", label: "Tagi", type: "tags", get: (l) => l.tags },
  {
    key: "communication_state",
    label: "Komunikācijas stāvoklis",
    type: "enum",
    get: (l) => l.communication_state,
  },
  {
    key: "priority_label",
    label: "Prioritāte",
    type: "enum",
    get: (l) => l.priority_label,
  },
  {
    key: "queue_bucket_label",
    label: "Queue",
    type: "enum",
    get: (l) => l.queue_bucket_label,
  },
  {
    key: "action_label",
    label: "Nākamā darbība",
    type: "string",
    get: (l) => l.next_action,
  },
  {
    key: "last_communication_at",
    label: "Pēdējā komunikācija",
    type: "date",
    get: (l) => l.last_communication_at,
  },
  {
    key: "created_at",
    label: "Izveidots",
    type: "date",
    get: (l) => l.created_at,
  },
  {
    key: "next_action_date",
    label: "Nākamās darbības datums",
    type: "next_action_date",
    get: (l) => l.next_action_due,
  },
];
const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(
  FIELDS.map((f) => [f.key, f]),
);

const OPERATORS_BY_TYPE: Record<FieldType, string[]> = {
  enum: ["is", "is_not", "is_any_of", "is_none_of", "is_empty", "is_not_empty"],
  string: ["is", "is_not", "is_empty", "is_not_empty"],
  tags: ["is_any_of", "contains_all", "is_none_of", "is_empty", "is_not_empty"],
  number: ["is", "is_not", "gt", "lt", "is_empty", "is_not_empty"],
  date: ["last_x_days", "before_x_days", "is_empty", "is_not_empty"],
  next_action_date: [
    "is_empty",
    "is_not_empty",
    "today",
    "overdue",
    "next_x_days",
    "before_date",
    "after_date",
    "between_dates",
  ],
};

const OP_LABELS: Record<string, string> = {
  is: "ir",
  is_not: "nav",
  is_any_of: "ir viens no",
  is_none_of: "nav neviens no",
  contains_all: "satur visus",
  is_empty: "ir tukšs",
  is_not_empty: "nav tukšs",
  gt: "lielāks par",
  lt: "mazāks par",
  last_x_days: "pēdējās X dienas",
  before_x_days: "pirms X dienām",
  today: "šodien",
  overdue: "kavēts",
  next_x_days: "nākamās X dienas",
  before_date: "pirms datuma",
  after_date: "pēc datuma",
  between_dates: "starp datumiem",
};

function evalRule(l: Lead, r: FilterRule): boolean {
  const def = FIELD_BY_KEY[r.f];
  if (!def) return true;
  const val = def.get(l);
  switch (r.op) {
    case "is":
      return s(val).toLowerCase() === s(r.v).toLowerCase();
    case "is_not":
      return s(val).toLowerCase() !== s(r.v).toLowerCase();
    case "is_any_of": {
      const arr = (Array.isArray(r.v) ? r.v : []).map((x) =>
        String(x).toLowerCase(),
      );
      if (def.type === "tags") {
        const tags = (val as string[]).map((t) => t.toLowerCase());
        return arr.some((x) => tags.includes(x));
      }
      return arr.includes(s(val).toLowerCase());
    }
    case "is_none_of": {
      const arr = (Array.isArray(r.v) ? r.v : []).map((x) =>
        String(x).toLowerCase(),
      );
      if (def.type === "tags") {
        const tags = (val as string[]).map((t) => t.toLowerCase());
        return !arr.some((x) => tags.includes(x));
      }
      return !arr.includes(s(val).toLowerCase());
    }
    case "contains_all": {
      const arr = (Array.isArray(r.v) ? r.v : []).map((x) =>
        String(x).toLowerCase(),
      );
      if (arr.length === 0) return true;
      if (def.type === "tags") {
        const tags = (val as string[]).map((t) => t.toLowerCase());
        return arr.every((x) => tags.includes(x));
      }
      return false;
    }
    case "is_empty":
      if (def.type === "tags") return (val as string[]).length === 0;
      if (def.type === "date" || def.type === "next_action_date")
        return parseDate(val) == null;
      if (def.type === "number") return val == null || val === 0;
      return s(val) === "";
    case "is_not_empty":
      if (def.type === "tags") return (val as string[]).length > 0;
      if (def.type === "date" || def.type === "next_action_date")
        return parseDate(val) != null;
      if (def.type === "number") return val != null && val !== 0;
      return s(val) !== "";
    case "gt":
      return Number(val) > Number(r.v);
    case "lt":
      return Number(val) < Number(r.v);
    case "last_x_days": {
      const t = parseDate(val);
      if (t == null) return false;
      const days = Number(r.v) || 0;
      return t >= Date.now() - days * MS_DAY && t <= Date.now();
    }
    case "before_x_days": {
      const t = parseDate(val);
      if (t == null) return false;
      const days = Number(r.v) || 0;
      return t < Date.now() - days * MS_DAY;
    }
    case "today": {
      const t = parseDate(val);
      return t != null && isRigaSameDay(t, Date.now());
    }
    case "overdue": {
      const t = parseDate(val);
      return t != null && t < Date.now() && !isRigaSameDay(t, Date.now());
    }
    case "next_x_days": {
      const t = parseDate(val);
      if (t == null) return false;
      const days = Number(r.v) || 0;
      return t >= Date.now() && t <= Date.now() + days * MS_DAY;
    }
    case "before_date": {
      const t = parseDate(val);
      const ref = parseDate(r.v);
      return t != null && ref != null && t < ref;
    }
    case "after_date": {
      const t = parseDate(val);
      const ref = parseDate(r.v);
      return t != null && ref != null && t > ref;
    }
    case "between_dates": {
      const t = parseDate(val);
      const v = (r.v ?? {}) as { from?: string; to?: string };
      const a = parseDate(v.from);
      const b = parseDate(v.to);
      return t != null && a != null && b != null && t >= a && t <= b;
    }
    default:
      return true;
  }
}

/* ============================ Saved views ============================ */

type SavedView = {
  key: string;
  label: string;
  predicate?: (l: Lead) => boolean;
};

const SAVED_VIEWS: SavedView[] = [
  { key: "all", label: "Visi leadi" },
  { key: "mani", label: "Mani leadi" }, // no auth ctx — pass-through
  {
    key: "gaida_atbildi",
    label: "Gaidu atbildi",
    predicate: (l) =>
      l.communication_state === "waiting" ||
      /gaida/i.test(l.communication_label),
  },
  {
    key: "bez_kontakta",
    label: "Bez kontakta",
    predicate: (l) =>
      l.communication_state === "no_contact" ||
      l.communication_label === "Nav kontakta",
  },
  {
    key: "atceltie",
    label: "Atceltie",
    predicate: (l) => /atcelt/i.test(l.status),
  },
];
const SAVED_VIEW_BY_KEY: Record<string, SavedView> = Object.fromEntries(
  SAVED_VIEWS.map((v) => [v.key, v]),
);

/* ============================ Group fields ============================ */

type GroupFieldDef = {
  key: string;
  label: string;
  get: (l: Lead) => string;
  order?: string[];
};
const GROUP_FIELDS: GroupFieldDef[] = [
  { key: "status", label: "Statuss", get: (l) => l.status || "Bez statusa" },
  {
    key: "owner",
    label: "Atbildīgais",
    get: (l) => l.owner || l.owner_user_code || "Nepiešķirts",
  },
  { key: "ppv", label: "PPV", get: (l) => l.ppv || l.ppv_user_code || "Nav PPV" },
  {
    key: "priority_label",
    label: "Prioritāte",
    get: (l) => l.priority_label || "Bez prioritātes",
  },
  {
    key: "queue_bucket_label",
    label: "Queue",
    get: (l) => l.queue_bucket_label || "Nav rindas",
  },
];
const GROUP_FIELD_BY_KEY: Record<string, GroupFieldDef> = Object.fromEntries(
  GROUP_FIELDS.map((g) => [g.key, g]),
);

/* ============================ Sort fields ============================ */

const SORT_FIELDS: { key: string; label: string; get: (l: Lead) => unknown }[] =
  [
    {
      key: "last_communication_at",
      label: "Pēdējā komunikācija",
      get: (l) => parseDate(l.last_communication_at) ?? 0,
    },
    {
      key: "created_at",
      label: "Izveidots",
      get: (l) => parseDate(l.created_at) ?? 0,
    },
    {
      key: "effective_due_at",
      label: "Nākamās darbības datums",
      get: (l) => parseDate(l.next_action_due) ?? Number.MAX_SAFE_INTEGER,
    },
    {
      key: "next_action_due_date",
      label: "Nākamās darbības datums (raw)",
      get: (l) =>
        parseDate(l.next_action_due_date ?? l.next_action_due) ??
        Number.MAX_SAFE_INTEGER,
    },
    { key: "status", label: "Statuss", get: (l) => l.status },
    { key: "owner", label: "Atbildīgais", get: (l) => l.owner },
    { key: "ppv", label: "PPV", get: (l) => l.ppv },
    { key: "country", label: "Valsts", get: (l) => l.country },
    { key: "lead", label: "Lead", get: (l) => l.name || l.company_name || "" },
    { key: "tags", label: "Tagi", get: (l) => (l.tags ?? []).join(", ") },
    {
      key: "priority_score",
      label: "Prioritāte (score)",
      get: (l) => (l.priority_score == null ? -1 : l.priority_score),
    },
    {
      key: "queue_bucket_label",
      label: "Queue",
      get: (l) => l.queue_bucket_label,
    },
  ];
const SORT_BY_KEY: Record<string, (typeof SORT_FIELDS)[number]> =
  Object.fromEntries(SORT_FIELDS.map((f) => [f.key, f]));

const DEFAULT_SORT: SortRule[] = [
  { f: "last_communication_at", d: "desc" },
  { f: "created_at", d: "desc" },
];

function compareLeads(a: Lead, b: Lead, sort: SortRule[]): number {
  const rules = sort.length > 0 ? sort : DEFAULT_SORT;
  for (const r of rules) {
    const def = SORT_BY_KEY[r.f];
    if (!def) continue;
    const av = def.get(a);
    const bv = def.get(b);
    let cmp = 0;
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = String(av ?? "").localeCompare(String(bv ?? ""), "lv");
    if (cmp !== 0) return r.d === "desc" ? -cmp : cmp;
  }
  return 0;
}

/* ============================ Page ============================ */

function LeadiPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const setSearch = useCallback(
    (patch: Record<string, unknown>) => {
      navigate({
        to: "/leadi",
        search: ((prev: Record<string, unknown>) => ({
          ...prev,
          ...patch,
        })) as never,
        replace: true,
      });
    },
    [navigate],
  );

  /* ---- legacy URL migration: seg/status/countries/owners/ppvs/tags → flt + view ---- */
  const migrationDoneRef = useRef(false);
  useEffect(() => {
    if (migrationDoneRef.current) return;
    migrationDoneRef.current = true;
    const legacyHas =
      !!search.seg ||
      (search.status?.length ?? 0) > 0 ||
      (search.countries?.length ?? 0) > 0 ||
      (search.owners?.length ?? 0) > 0 ||
      (search.ppvs?.length ?? 0) > 0 ||
      (search.tags?.length ?? 0) > 0;
    if (!legacyHas) return;
    const segMap: Record<string, string> = {
      bez_kontakta: "bez_kontakta",
      karstie: "karstie",
      gaida_atbildi: "gaida_atbildi",
      atceltie: "atceltie",
      mani: "mani",
    };
    const view = search.seg ? segMap[search.seg] ?? "all" : search.view;
    const flt: FilterRule[] = [...(search.flt ?? [])];
    if (search.status?.length)
      flt.push({ f: "status", op: "is_any_of", v: search.status });
    if (search.countries?.length)
      flt.push({ f: "country", op: "is_any_of", v: search.countries });
    if (search.owners?.length)
      flt.push({ f: "owner", op: "is_any_of", v: search.owners });
    if (search.ppvs?.length)
      flt.push({ f: "ppv", op: "is_any_of", v: search.ppvs });
    if (search.tags?.length)
      flt.push({ f: "tags", op: "is_any_of", v: search.tags });
    setSearch({
      view,
      flt,
      seg: undefined,
      status: [],
      countries: [],
      sources: [],
      owners: [],
      ppvs: [],
      tags: [],
    });
  }, [search, setSearch]);

  /* ---- persist & restore filters/grouping/sorting via crm.user_view_preferences ----
   * No localStorage. Per-operator server-side persistence (view_key = "leads_list").
   * Only filters / sorting / grouping are persisted — never the session-only
   * "Check" column or collapsed/expanded group state. */
  const VIEW_KEY = "leads_list";
  const { operatorId } = useCurrentUser();
  const loadPrefs = useServerFn(getViewPreference);
  const savePrefs = useServerFn(saveViewPreference);
  const prefsRestoredRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prefsRestoredRef.current) return;
    if (!operatorId) return;
    let cancelled = false;
    const urlIsFresh =
      (search.view ?? "all") === "all" &&
      (search.flt?.length ?? 0) === 0 &&
      (search.sort?.length ?? 0) === 0 &&
      search.gby === undefined &&
      !search.q;
    (async () => {
      try {
        const pref = await loadPrefs({ data: { viewKey: VIEW_KEY, operatorId } });
        if (cancelled) return;
        if (pref && urlIsFresh) {
          const patch: Record<string, unknown> = {};
          if (Array.isArray(pref.filters) && pref.filters.length > 0)
            patch.flt = pref.filters;
          if (Array.isArray(pref.sorting) && pref.sorting.length > 0)
            patch.sort = pref.sorting;
          if (Array.isArray(pref.grouping)) patch.gby = pref.grouping;
          if (Object.keys(patch).length > 0) setSearch(patch);
        }
      } catch {
        /* ignore — fail open with empty defaults */
      } finally {
        if (!cancelled) prefsRestoredRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [operatorId, search, setSearch, loadPrefs]);

  useEffect(() => {
    if (!prefsRestoredRef.current) return;
    if (!operatorId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const filters = (search.flt ?? []) as StoredFilter[];
    const sorting = (search.sort ?? []) as StoredSort[];
    // gby === undefined means the default grouping (["status"]) is in effect.
    const grouping = (search.gby ?? ["status"]) as string[];
    saveTimerRef.current = setTimeout(() => {
      savePrefs({
        data: { viewKey: VIEW_KEY, operatorId, filters, sorting, grouping },
      }).catch(() => {
        /* ignore */
      });
    }, 600);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [search.flt, search.sort, search.gby, operatorId, savePrefs]);

  const view = search.view ?? "all";
  const q = (search.q ?? "").trim().toLowerCase();
  const flt: FilterRule[] = (search.flt ?? []) as FilterRule[];
  // search.gby === undefined → default ["status"]; [] → user explicitly chose no grouping
  const gby: string[] = search.gby ?? ["status"];
  const sort: SortRule[] = (search.sort ?? []) as SortRule[];

  const [drawerLeadId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [patches, setPatches] = useState<Record<string, Partial<Lead>>>({});

  /* ---- collapsed group state (session-only; groups open by default, never persisted) ---- */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleCollapsed = useCallback((path: string) => {
    setCollapsed((prev) => ({ ...prev, [path]: !prev[path] }));
  }, []);

  /* ---- data ---- */
  const overviewQuery = useMemo(
    () =>
      ["select=*", "order=created_at.desc.nullslast", `limit=${PAGE_SIZE}`].join(
        "&",
      ),
    [],
  );
  const overview = useCrmView("leads_list_display_v3", overviewQuery);
  const filterOptions = useAnalyticsView("filter_options", "limit=1");

  const commCounts = useMemo(() => {
    const map = new Map<string, CommBuckets>();
    const rows = (overview.data?.rows ?? []) as Row[];
    for (const r of rows) {
      const ln = s(r.lead_number);
      if (!ln) continue;
      map.set(ln, {
        email: [
          Number(r.email_outbound_count) || 0,
          Number(r.email_inbound_count) || 0,
        ],
        call: [
          Number(r.call_outbound_count) || 0,
          Number(r.call_inbound_count) || 0,
        ],
        chat: [
          Number(r.chat_outbound_count) || 0,
          Number(r.chat_inbound_count) || 0,
        ],
      });
    }
    return map;
  }, [overview.data]);

  const errorMsg =
    (overview.error as Error | null)?.message || overview.data?.error;
  const loading = overview.isLoading;

  const leads = useMemo<Lead[]>(() => {
    const rows = (overview.data?.rows ?? []) as Row[];
    return rows
      .map((r) => {
        const lead_number = s(r.lead_number);
        if (!lead_number) return null;
        // UUID stays internal (RPC payloads, navigation). Never rendered.
        const id = s(r.lead_id);
        if (!id) return null;
        const phone = s(
          r.phone_e164,
        );
        const email = s(r.email_normalized);
        const country = s(r.country);
        const secondary = phone || email || country;
        const next_action_due = s(r.effective_due_at) || null;
        const next_action = s(r.action_label);
        const last_activity = s(r.last_communication_at) || null;
        const has_unread_reply =
          r.has_unread_reply === true || r.has_unread_reply === "true";
        const reply_count = Number(r.reply_count ?? 0) || 0;
        const communication_state = s(r.communication_state);
        const tagsArr = asTags(r.tags);
        const statusStr = s(r.status);
        const ppv_name = s(r.ppv_name);
        const ppv_user_code = s(r.ppv_user_code);
        const task_assigned_user_code = s(r.task_assigned_user_code);
        const task_assigned_name = s(r.task_assigned_name);
        const has_task =
          r.has_task === true || r.has_task === "true";
        return {
          lead_id: id,
          name: s(r.display_name),
          lead_number,
          external_id: s(r.external_id),
          company_name: s(r.company_name),
          phone,
          email,
          country,
          secondary,
          source: s(r.source),
          status: statusStr,
          owner: task_assigned_name,
          ppv: ppv_name,
          ppv_name,
          ppv_user_code,
          owner_user_code: task_assigned_user_code,
          task_assigned_user_code,
          task_assigned_name,
          next_action,
          next_action_due,
          next_action_due_date: s(r.next_action_due_date) || null,
          last_activity,
          tags: tagsArr,
          created_at: s(r.created_at) || null,
          unread_replies: reply_count,
          communication_state,
          communication_label: s(r.communication_label),
          has_unread_reply,
          reply_count,
          click_count: Number(r.click_count ?? 0) || 0,
          last_reply_at: s(r.last_reply_at) || null,
          last_communication_at: s(r.last_communication_at) || null,
          last_outbound_at: s(r.last_outbound_at) || null,
          last_inbound_at: s(r.last_inbound_at) || null,
          object_summary: s(r.object_summary),
          short_note: s(r.short_note),
          has_task,
          queue_bucket: s(r.queue_bucket),
          queue_bucket_label: s(r.queue_bucket_label),
          operational_bucket: s(r.operational_bucket),
          needs_attention: r.needs_attention as boolean,
          priority_score: r.priority_score as number | null,
          priority_stars: r.priority_stars as number | null,
          priority_label: s(r.priority_label),
          priority_breakdown: s(r.priority_breakdown),
          priority_updated_at: s(r.priority_updated_at) || null,
        } satisfies Lead;
      })
      .filter((x): x is Lead => x !== null);
  }, [overview.data]);

  const leadsPatched = useMemo(() => {
    if (Object.keys(patches).length === 0) return leads;
    return leads.map((l) =>
      patches[l.lead_id] ? { ...l, ...patches[l.lead_id] } : l,
    );
  }, [leads, patches]);

  const options = useMemo(() => {
    const fo = (filterOptions.data?.rows ?? [])[0] as Row | undefined;
    const fromArr = (v: unknown) =>
      Array.isArray(v) ? v.map(String).filter(Boolean) : [];
    const dedupe = (arr: string[]) =>
      Array.from(new Set(arr.filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "lv"),
      );
    return {
      status: dedupe(
        fromArr(fo?.statuses).length
          ? fromArr(fo?.statuses)
          : leadsPatched.map((l) => l.status),
      ),
      country: dedupe(
        fromArr(fo?.countries).length
          ? fromArr(fo?.countries)
          : leadsPatched.map((l) => l.country),
      ),
      owner: dedupe(
        fromArr(fo?.task_assignees).length
          ? fromArr(fo?.task_assignees)
          : leadsPatched.map((l) => l.owner),
      ),
      ppv: dedupe(
        fromArr(fo?.ppvs).length
          ? fromArr(fo?.ppvs)
          : leadsPatched.map((l) => l.ppv),
      ),
      tags: dedupe(leadsPatched.flatMap((l) => l.tags)),
      communication_state: dedupe(
        leadsPatched.map((l) => l.communication_state),
      ),
      action_label: dedupe(leadsPatched.map((l) => l.next_action)),
      priority_label: dedupe(leadsPatched.map((l) => l.priority_label)),
      queue_bucket_label: dedupe(
        leadsPatched.map((l) => l.queue_bucket_label),
      ),
    } as Record<string, string[]>;
  }, [filterOptions.data, leadsPatched]);

  /* ---- filter pipeline: saved view + advanced rules + search ---- */
  const filtered = useMemo(() => {
    const sv = SAVED_VIEW_BY_KEY[view];
    const pred = sv?.predicate;
    return leadsPatched.filter((l) => {
      if (pred && !pred(l)) return false;
      for (const r of flt) if (!evalRule(l, r)) return false;
      if (q) {
        const hay =
          `${l.name} ${l.company_name} ${l.lead_number} ${l.email} ${l.phone} ${l.next_action} ${l.country}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leadsPatched, view, flt, q]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => compareLeads(a, b, sort));
    return copy;
  }, [filtered, sort]);

  /* ---- group tree ---- */
  type GroupNode = {
    key: string;
    label: string;
    path: string;
    depth: number;
    rows: Lead[];
    children?: GroupNode[];
  };
  const groupTree = useMemo<GroupNode[]>(() => {
    function build(rows: Lead[], levels: string[], pathPrefix: string): GroupNode[] {
      if (levels.length === 0) {
        return [
          {
            key: "_leaf",
            label: "",
            path: pathPrefix,
            depth: 0,
            rows,
          },
        ];
      }
      const [head, ...rest] = levels;
      const def = GROUP_FIELD_BY_KEY[head];
      if (!def) return build(rows, rest, pathPrefix);
      const buckets = new Map<string, Lead[]>();
      for (const l of rows) {
        const k = def.get(l) || "—";
        const arr = buckets.get(k) ?? [];
        arr.push(l);
        buckets.set(k, arr);
      }
      const keys = Array.from(buckets.keys());
      if (def.order) {
        const idx = (k: string) => {
          const i = def.order!.indexOf(k);
          return i < 0 ? def.order!.length : i;
        };
        keys.sort((a, b) => idx(a) - idx(b));
      } else {
        keys.sort((a, b) => a.localeCompare(b, "lv"));
      }
      return keys.map((k) => {
        const path = pathPrefix ? `${pathPrefix}>${head}=${k}` : `${head}=${k}`;
        const childRows = buckets.get(k)!;
        const node: GroupNode = {
          key: k,
          label: `${def.label}: ${k}`,
          path,
          depth: pathPrefix.split(">").filter(Boolean).length,
          rows: childRows,
        };
        if (rest.length > 0) node.children = build(childRows, rest, path);
        return node;
      });
    }
    return build(sorted, gby, "");
  }, [sorted, gby]);

  /* ---- selection / bulk ---- */
  const allVisibleSelected =
    sorted.length > 0 && sorted.every((l) => selected.has(l.lead_id));
  const toggleAll = () => {
    if (allVisibleSelected) {
      const next = new Set(selected);
      sorted.forEach((l) => next.delete(l.lead_id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      sorted.forEach((l) => next.add(l.lead_id));
      setSelected(next);
    }
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const clearSelected = () => setSelected(new Set());

  const patchLead = useCallback((id: string, patch: Partial<Lead>) => {
    setPatches((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);
  const bumpActivity = useCallback(
    (id: string) => patchLead(id, { last_activity: new Date().toISOString() }),
    [patchLead],
  );
  const openLead = useCallback(
    (id: string) => {
      try {
        sessionStorage.setItem("leadi:lastSearch", JSON.stringify(search));
      } catch {
        /* ignore */
      }
      navigate({ to: "/lead/$leadId", params: { leadId: id } });
    },
    [navigate, search],
  );
  void drawerLeadId;
  void drawerOpen;
  useEffect(() => {
    setDrawerOpen(false);
  }, []);

  const patchMany = useCallback((ids: string[], patch: BulkPatch) => {
    setPatches((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        next[id] = { ...next[id], ...(patch as Partial<Lead>) };
      });
      return next;
    });
  }, []);
  const rollbackMany = useCallback(
    (ids: string[], previous: Record<string, BulkPatch>) => {
      setPatches((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          const p = previous[id];
          if (!p) return;
          next[id] = { ...next[id], ...(p as Partial<Lead>) };
        });
        return next;
      });
    },
    [],
  );

  const currentStatusMap = useMemo(() => {
    const m: Record<string, string> = {};
    leadsPatched.forEach((l) => (m[l.lead_id] = l.status));
    return m;
  }, [leadsPatched]);

  /* ---- toolbar handlers ---- */
  const setView = (v: string) => setSearch({ view: v });
  const setFlt = (next: FilterRule[]) => setSearch({ flt: next });
  const setGby = (next: string[]) => setSearch({ gby: next });
  const setSort = (next: SortRule[]) => setSearch({ sort: next });

  const clearAll = () =>
    setSearch({
      view: "all",
      flt: [],
      gby: [],
      sort: [],
      q: undefined,
    });

  const hasActive =
    view !== "all" || flt.length > 0 || !!q || (search.gby && search.gby.length > 0) || (search.sort ?? []).length > 0;

  /* ---- per-column filter helpers (table 2nd header row) ---- */
  const colFilterValue = (key: string): string => {
    const r = flt.find((x) => x.f === key && x.op === "is_any_of");
    if (!r) return "";
    const v = r.v as unknown;
    if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : "";
    return "";
  };
  const setColFilter = (key: string, value: string) => {
    const others = flt.filter((x) => !(x.f === key && x.op === "is_any_of"));
    if (!value) {
      setFlt(others);
      return;
    }
    setFlt([...others, { f: key, op: "is_any_of", v: [value] }]);
  };
  const anyColFilterActive =
    flt.length > 0 || !!q || view !== "all";

  /* ---- click-to-sort helpers ---- */
  const sortDirOf = (key: string): "asc" | "desc" | null => {
    const r = sort.find((s) => s.f === key);
    return r ? r.d : null;
  };
  const cycleSort = (key: string) => {
    const cur = sortDirOf(key);
    if (cur === null) setSort([{ f: key, d: "asc" }]);
    else if (cur === "asc") setSort([{ f: key, d: "desc" }]);
    else setSort([]);
  };

  /* Bridge legacy SortRule[] state to CrmDataTable CrmTableSort */
  const tableSort: CrmTableSort =
    sort.length > 0
      ? { key: sort[0].f, dir: sort[0].d }
      : { key: null, dir: "asc" };
  const handleTableSort = (key: string, dir: SortDir) => {
    if (dir === null) setSort([]);
    else setSort([{ f: key, d: dir }]);
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    function walk(nodes: GroupNode[]) {
      for (const n of nodes) {
        if (n.key !== "_leaf") next[n.path] = true;
        if (n.children) walk(n.children);
      }
    }
    walk(groupTree);
    setCollapsed(next);
  };
  const expandAll = () => {
    setCollapsed({});
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className="mx-auto flex w-full max-w-[1600px] flex-col px-4 sm:px-6"
        style={{ height: "calc(100vh - 4rem)" }}
      >
      <HeaderSlot>
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">
            Leadi
          </h1>
          <p className="text-[11px] text-muted-foreground">Analītiskā leadu darba vide</p>
        </div>
      </HeaderSlot>
      <CrmPageActionsRow>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          <Bookmark className="h-3.5 w-3.5" />
          Saglabāt skatu
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          <Upload className="h-3.5 w-3.5" />
          Importēt
        </Button>
        <Button size="sm" className="h-8 gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Jauns leads
        </Button>
      </CrmPageActionsRow>

      <CrmTableToolbar
        groupSlot={<SavedViewSelector value={view} onChange={setView} />}
      >
        <GroupByControl
          value={gby}
          onChange={setGby}
          onCollapseAll={collapseAll}
          onExpandAll={expandAll}
        />
      </CrmTableToolbar>

      {selected.size > 0 && (
        <BulkActionsBar
          selectedIds={Array.from(selected)}
          options={{
            statuses: options.status,
            owners: options.owner,
            ppvs: options.ppv,
          }}
          currentStatus={currentStatusMap}
          onClear={clearSelected}
          onPatchMany={patchMany}
          onRollbackMany={rollbackMany}
        />
      )}

      {errorMsg && <ErrorState message={errorMsg} />}
      {!errorMsg && loading && <LoadingState />}

      {!errorMsg && !loading && (
        sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-border bg-card py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-sm font-medium text-foreground">
              Nav atrastu leadu
            </div>
            {hasActive && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={clearAll}
              >
                Notīrīt filtrus
              </Button>
            )}
          </div>
        ) : (
          <CrmDataTable
            className="min-h-0 flex-1"
            maxHeight="100%"
            sort={tableSort}
            onSortChange={handleTableSort}
          >
            <CrmDataTableHeader>
              <CrmDataTableLabelRow>
                <CrmSortableHead label={
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleAll}
                    className="h-3.5 w-3.5"
                    aria-label="Atzīmēt visus"
                  />
                } style={{ width: 36 }} />
                <CrmSortableHead sortKey="ppv" label="PPV" style={{ width: 72 }} />
                <CrmSortableHead sortKey="lead" label="Lead" style={{ width: "auto" }} />
                <CrmSortableHead sortKey="tags" label="Tagi" style={{ width: "1%", whiteSpace: "nowrap" }} />
                <CrmSortableHead sortKey="status" label="Statuss" style={{ width: "1%", whiteSpace: "nowrap" }} />
                <CrmSortableHead sortKey="owner" label="Atbildīgais" style={{ width: 110 }} />
                <CrmSortableHead sortKey="effective_due_at" label="Uzdevums" style={{ width: 140 }} />
                <CrmSortableHead sortKey="last_communication_at" label="Aktivitāte" style={{ width: 160 }} />
                <CrmSortableHead sortKey="priority_score" label="Prioritāte" style={{ width: 110 }} />
                <CrmSortableHead label="Darbības" align="right" style={{ width: 124 }} />
              </CrmDataTableLabelRow>
              <CrmDataTableFilterRow>
                <CrmFilterCell />
                <CrmFilterCell>
                  <CrmFilterSelect
                    value={colFilterValue("ppv")}
                    onValueChange={(v) => setColFilter("ppv", v)}
                    options={options.ppv.map((o) => ({ value: o, label: o }))}
                  />
                </CrmFilterCell>
                <CrmFilterCell>
                  <CrmSearchInput
                    value={search.q ?? ""}
                    onChange={(e) =>
                      setSearch({ q: e.target.value || undefined })
                    }
                    placeholder="Meklēt…"
                  />
                </CrmFilterCell>
                <CrmFilterCell>
                  <CrmFilterSelect
                    value={colFilterValue("tags")}
                    onValueChange={(v) => setColFilter("tags", v)}
                    options={options.tags.map((o) => ({ value: o, label: o }))}
                  />
                </CrmFilterCell>
                <CrmFilterCell>
                  <CrmFilterSelect
                    value={colFilterValue("status")}
                    onValueChange={(v) => setColFilter("status", v)}
                    options={options.status.map((o) => ({ value: o, label: o }))}
                  />
                </CrmFilterCell>
                <CrmFilterCell>
                  <CrmFilterSelect
                    value={colFilterValue("owner")}
                    onValueChange={(v) => setColFilter("owner", v)}
                    options={options.owner.map((o) => ({ value: o, label: o }))}
                  />
                </CrmFilterCell>
                <CrmFilterCell>
                  <CrmFilterSelect
                    value={colFilterValue("action_label")}
                    onValueChange={(v) => setColFilter("action_label", v)}
                    options={options.action_label.map((o) => ({ value: o, label: o }))}
                  />
                </CrmFilterCell>
                <CrmFilterCell>
                  <CrmFilterSelect
                    value={colFilterValue("communication_state")}
                    onValueChange={(v) => setColFilter("communication_state", v)}
                    options={options.communication_state.map((o) => ({ value: o, label: o }))}
                  />
                </CrmFilterCell>
                <CrmFilterCell>
                  <CrmFilterSelect
                    value={colFilterValue("priority_label")}
                    onValueChange={(v) => setColFilter("priority_label", v)}
                    options={options.priority_label.map((o) => ({ value: o, label: o }))}
                  />
                </CrmFilterCell>
                <CrmFilterCell align="right">
                  <CrmClearFiltersButton
                    active={anyColFilterActive}
                    onClick={clearAll}
                  />
                </CrmFilterCell>
              </CrmDataTableFilterRow>
            </CrmDataTableHeader>
            <CrmDataBody>
              <GroupRenderer
                nodes={groupTree}
                collapsed={collapsed}
                toggle={toggleCollapsed}
                selected={selected}
                toggleOne={toggleOne}
                openLead={openLead}
                bumpActivity={bumpActivity}
                commCounts={commCounts}
              />
            </CrmDataBody>
          </CrmDataTable>
        )
      )}
      </div>
    </TooltipProvider>
  );
}

/* ============================ Group renderer ============================ */

type GroupNode = {
  key: string;
  label: string;
  path: string;
  depth: number;
  rows: Lead[];
  children?: GroupNode[];
};

function GroupRenderer({
  nodes,
  collapsed,
  toggle,
  selected,
  toggleOne,
  openLead,
  bumpActivity,
  commCounts,
}: {
  nodes: GroupNode[];
  collapsed: Record<string, boolean>;
  toggle: (path: string) => void;
  selected: Set<string>;
  toggleOne: (id: string) => void;
  openLead: (id: string) => void;
  bumpActivity: (id: string) => void;
  commCounts: Map<string, CommBuckets>;
}) {
  return (
    <>
      {nodes.flatMap((n) => {
        if (n.key === "_leaf") {
          return n.rows.map((l) => (
            <LeadRow
              key={l.lead_id}
              l={l}
              isSel={selected.has(l.lead_id)}
              toggleOne={toggleOne}
              openLead={openLead}
              bumpActivity={bumpActivity}
              commCounts={commCounts}
            />
          ));
        }
        const isCollapsed = !!collapsed[n.path];
        const header = (
          <CrmDataRow
            key={`gh-${n.path}`}
            className="bg-[var(--tivo-navy-soft)]/40 hover:bg-[var(--tivo-navy-soft)]"
          >
            <CrmDataCell colSpan={10} className="p-0">
              <button
                type="button"
                onClick={() => toggle(n.path)}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[12px]"
                style={{ paddingLeft: 12 + n.depth * 16 }}
                aria-label={isCollapsed ? "Izvērst grupu" : "Sakļaut grupu"}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                <span className="font-semibold tracking-tight text-foreground/80">
                  {n.label}
                </span>
                <span className="ml-1 tabular-nums text-muted-foreground/70">
                  {n.rows.length}
                </span>
              </button>
            </CrmDataCell>
          </CrmDataRow>
        );
        if (isCollapsed) return [header];
        const children = n.children ? (
          <GroupRenderer
            key={`gc-${n.path}`}
            nodes={n.children}
            collapsed={collapsed}
            toggle={toggle}
            selected={selected}
            toggleOne={toggleOne}
            openLead={openLead}
            bumpActivity={bumpActivity}
            commCounts={commCounts}
          />
        ) : (
          <GroupRenderer
            key={`gc-${n.path}`}
            nodes={[
              {
                key: "_leaf",
                label: "",
                path: n.path + ">_leaf",
                depth: n.depth + 1,
                rows: n.rows,
              },
            ]}
            collapsed={collapsed}
            toggle={toggle}
            selected={selected}
            toggleOne={toggleOne}
            openLead={openLead}
            bumpActivity={bumpActivity}
            commCounts={commCounts}
          />
        );
        return [header, children];
      })}
    </>
  );
}

/* ============================ LeadRow ============================ */

function LeadRow({
  l,
  isSel,
  toggleOne,
  openLead,
  bumpActivity,
  commCounts,
}: {
  l: Lead;
  isSel: boolean;
  toggleOne: (id: string) => void;
  openLead: (id: string) => void;
  bumpActivity: (id: string) => void;
  commCounts: Map<string, CommBuckets>;
}) {
  const dueT = parseDate(l.next_action_due);
  const isOverdue = dueT != null && dueT < Date.now();
  const isHot = l.tags.some((t) => /^(hot|karst)/i.test(t));
  const hasUnread = l.has_unread_reply;
  const noContact = !parseDate(l.last_activity);
  const accentClass = hasUnread
    ? "before:bg-[var(--tivo-blue)]"
    : isOverdue
      ? "before:bg-[var(--tivo-red)]"
      : isHot
        ? "before:bg-[var(--tivo-orange)]"
        : noContact
          ? "before:bg-muted-foreground/30"
          : "before:bg-transparent";
  const commLabel =
    l.communication_label ||
    (l.communication_state === "unread"
      ? "Atbildēja"
      : l.communication_state === "waiting"
        ? "Gaida atbildi"
        : l.communication_state === "active"
          ? "Aktīva saziņa"
          : l.communication_state === "event_only"
            ? "Ir notikums"
            : l.communication_state === "no_contact"
              ? "Nav kontakta"
              : "");
  return (
    <CrmDataRow
      onClick={() => openLead(l.lead_id)}
      className={cn(
        "group relative cursor-pointer",
        "before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:content-['']",
        accentClass,
        isSel && "bg-[var(--tivo-navy-soft)]",
      )}
    >
      <CrmDataCell onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isSel}
          onCheckedChange={() => toggleOne(l.lead_id)}
          className="h-3.5 w-3.5"
        />
      </CrmDataCell>
      <CrmDataCell>
        <span
          className="truncate font-mono text-[12px] tabular-nums text-foreground/90"
          title={l.ppv_name || l.ppv_user_code || "-"}
        >
          {l.ppv_user_code || (
            <span className="text-muted-foreground/60">-</span>
          )}
        </span>
      </CrmDataCell>
      <CrmDataCell className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold leading-tight text-foreground">
            {l.name || (
              <span className="font-normal italic text-muted-foreground">
                Neidentificēts leads
              </span>
            )}
          </span>
          {hasUnread && (
            <span
              className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--tivo-blue)]"
              aria-label="Ir neatbildēta klienta atbilde"
            />
          )}
        </div>
        <div className="truncate text-[12px] text-muted-foreground/80 tabular-nums">
          <span className="text-muted-foreground/70">{l.country || "—"}</span>
          <span className="mx-1 opacity-40">•</span>
          <CommStats counts={commCounts.get(l.lead_id)} hasUnread={hasUnread} />
        </div>
      </CrmDataCell>
      <CrmDataCell>
        {l.tags.length === 0 ? (
          <span className="text-muted-foreground/50">—</span>
        ) : (
          <div className="flex flex-wrap gap-0.5">
            {normalizeTags(l.tags).slice(0, 3).map((t) => (
              <Tag key={t} tag={t} />
            ))}
            {l.tags.length > 3 && (
              <span className="text-[12px] text-muted-foreground/60 tabular-nums">
                +{l.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </CrmDataCell>
      <CrmDataCell>
        <div className="flex min-w-0 flex-col gap-0.5">
          <StatusBadge status={l.status} />
          <div className="flex items-center gap-1">
            <span
              className={cn(
                "inline-flex max-w-full truncate rounded px-1 py-[1px] text-[11px] font-medium",
                queueBucketTone(l.queue_bucket),
              )}
              title={l.queue_bucket_label || "Nav rindas"}
            >
              {l.queue_bucket_label || "Nav rindas"}
            </span>
            {l.needs_attention && (
              <AlertTriangle
                className="h-3 w-3 shrink-0 text-[var(--tivo-orange)]"
                aria-label="Vajadzīga uzmanība"
              />
            )}
          </div>
        </div>
      </CrmDataCell>
      <CrmDataCell>
        {l.owner_user_code ? (
          <span
            className="truncate font-mono text-[12px] tabular-nums text-foreground/90"
            title={l.owner || l.owner_user_code}
          >
            {l.owner_user_code}
          </span>
        ) : (
          <span className="text-muted-foreground/50">-</span>
        )}
      </CrmDataCell>
      <CrmDataCell>
        <div className="flex flex-col leading-tight">
          <span
            className={cn(
              "truncate text-[13px] font-medium",
              l.has_task && l.next_action
                ? "text-foreground"
                : "text-muted-foreground/60",
            )}
          >
            {l.has_task ? l.next_action || "-" : "-"}
          </span>
          {l.has_task && l.next_action_due && (
            <span
              className={cn(
                "truncate text-[12px] tabular-nums",
                isOverdue
                  ? "text-[var(--tivo-red)]"
                  : "text-muted-foreground/70",
              )}
            >
              {fmtDate(l.next_action_due)}
            </span>
          )}
        </div>
      </CrmDataCell>
      <CrmDataCell>
        {(() => {
          let bestDate: string | null = null;
          let src: "reply" | "inbound" | "outbound" | "communication" | null =
            null;
          if (l.last_reply_at) {
            bestDate = l.last_reply_at;
            src = "reply";
          } else if (l.last_inbound_at) {
            bestDate = l.last_inbound_at;
            src = "inbound";
          } else if (l.last_outbound_at) {
            bestDate = l.last_outbound_at;
            src = "outbound";
          } else if (l.last_communication_at) {
            bestDate = l.last_communication_at;
            src = "communication";
          }
          const channel = detectChannel(commLabel);
          const direction = directionFromTimestampSource(src);
          const tone = CHANNEL_DIRECTION_TONE[channel][direction];
          return (
            <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                {commLabel ? (
                  <span
                    className={cn(
                      "inline-flex max-w-full truncate rounded px-1.5 py-[1px] text-[12px] font-medium",
                      tone,
                    )}
                    title={commLabel}
                  >
                    {commLabel}
                  </span>
                ) : (
                  <span className="text-muted-foreground/60 text-[12px]">—</span>
                )}
                {l.has_unread_reply && (
                  <span
                    className={cn(
                      "inline-flex items-center rounded px-1.5 py-[1px] text-[11px] font-semibold",
                      UNREAD_REPLY_TONE,
                    )}
                  >
                    Jauna atbilde
                  </span>
                )}
              </div>
              {bestDate && !isFutureDate(bestDate) && (
                <span className="truncate text-[12px] text-muted-foreground/70 tabular-nums">
                  {fmtRelative(bestDate)}
                </span>
              )}
            </div>
          );
        })()}
      </CrmDataCell>
      <CrmDataCell>
        {(() => {
          const stars = l.priority_stars ?? 0;
          const tooltipLines = [
            l.priority_label || "Bez prioritātes",
            l.priority_breakdown,
            l.priority_updated_at
              ? `Atjaunots ${fmtRelative(l.priority_updated_at)}`
              : "",
          ]
            .filter(Boolean)
            .join("\n");
          return (
            <div
              className="flex min-w-0 flex-col leading-tight"
              title={tooltipLines}
            >
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "h-3 w-3",
                      i < stars
                        ? "fill-[var(--tivo-orange)] text-[var(--tivo-orange)]"
                        : "text-muted-foreground/30",
                    )}
                  />
                ))}
              </div>
              {(l.priority_label || l.priority_score != null) && (
                <span className="truncate text-[12px] text-muted-foreground/70 tabular-nums">
                  {l.priority_label || ""}
                  {l.priority_label && l.priority_score != null ? " · " : ""}
                  {l.priority_score != null ? l.priority_score : ""}
                </span>
              )}
            </div>
          );
        })()}
      </CrmDataCell>
      <CrmDataCell align="right" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-70 hover:opacity-100">
          <RowAction
            icon={<Phone className="h-3.5 w-3.5" />}
            label="Zvanīt"
            href={l.phone ? `tel:${l.phone}` : undefined}
            onActivate={() => bumpActivity(l.lead_id)}
          />
          <RowAction
            icon={<MessageCircle className="h-3.5 w-3.5" />}
            label="WhatsApp"
            href={
              l.phone
                ? `https://wa.me/${l.phone.replace(/[^0-9]/g, "")}`
                : undefined
            }
            onActivate={() => bumpActivity(l.lead_id)}
          />
          <RowAction
            icon={<Mail className="h-3.5 w-3.5" />}
            label="E-pasts"
            href={l.email ? `mailto:${l.email}` : undefined}
            onActivate={() => bumpActivity(l.lead_id)}
          />
          <RowAction
            icon={<CheckSquare className="h-3.5 w-3.5" />}
            label="Uzdevums"
            onClick={() => openLead(l.lead_id)}
          />
          <RowAction
            icon={<StickyNote className="h-3.5 w-3.5" />}
            label="Piezīme"
            onClick={() => openLead(l.lead_id)}
          />
        </div>
      </CrmDataCell>
    </CrmDataRow>
  );
}

function RowAction({
  icon,
  label,
  href,
  onClick,
  onActivate,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  onActivate?: () => void;
}) {
  const disabled = !href && !onClick;
  const className = cn(
    "inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-muted-foreground transition-colors",
    disabled
      ? "cursor-not-allowed opacity-40"
      : "hover:border-border hover:bg-background hover:text-foreground",
  );
  const content = href ? (
    <a
      href={href}
      className={className}
      aria-label={label}
      onClick={() => onActivate?.()}
    >
      {icon}
    </a>
  ) : (
    <button
      type="button"
      onClick={() => {
        onActivate?.();
        onClick?.();
      }}
      disabled={disabled}
      className={className}
      aria-label={label}
    >
      {icon}
    </button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/* ============================ Saved view selector ============================ */

function SavedViewSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const current = SAVED_VIEW_BY_KEY[value] ?? SAVED_VIEWS[0];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-muted/50"
        >
          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-foreground">{current.label}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {SAVED_VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => onChange(v.key)}
            className={cn(
              "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-muted/60",
              v.key === value && "bg-muted/40 font-medium text-foreground",
            )}
          >
            <span>{v.label}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function MultiSelectInline({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      options.filter((o) =>
        q ? o.toLowerCase().includes(q.toLowerCase()) : true,
      ),
    [options, q],
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-7 w-full truncate rounded border border-input bg-background px-2 text-left text-xs"
        >
          {value.length === 0
            ? "Izvēlies vērtības"
            : value.length <= 2
              ? value.join(", ")
              : `${value.length} izvēlēti`}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="border-b border-border p-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Meklēt..."
            className="h-7 w-full rounded border border-input bg-background px-2 text-xs"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs text-muted-foreground">
              Nav opciju
            </div>
          ) : (
            filtered.map((o) => {
              const checked = value.includes(o);
              return (
                <label
                  key={o}
                  className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs hover:bg-muted/50"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() =>
                      onChange(
                        checked ? value.filter((v) => v !== o) : [...value, o],
                      )
                    }
                    className="h-3.5 w-3.5"
                  />
                  <span className="truncate">{o}</span>
                </label>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ============================ Group by control ============================ */

function GroupByControl({
  value,
  onChange,
  onCollapseAll,
  onExpandAll,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
}) {
  const labels = value
    .map((k) => GROUP_FIELD_BY_KEY[k]?.label ?? k)
    .join(" › ");
  const display = value.length === 0 ? "Bez grupēšanas" : labels;
  const setLevel = (i: number, k: string) => {
    const next = value.slice();
    if (k === "_none") {
      next.splice(i, 1);
    } else {
      next[i] = k;
    }
    onChange(next);
  };
  const addLevel = () => {
    if (value.length >= 3) return;
    const used = new Set(value);
    const fallbackField = GROUP_FIELDS.find((g) => !used.has(g.key));
    if (!fallbackField) return;
    onChange([...value, fallbackField.key]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 max-w-[260px] items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium",
            value.length > 0
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-border bg-background text-foreground hover:bg-muted/50",
          )}
        >
          <Layers className="h-3.5 w-3.5" />
          <span className="text-muted-foreground">Grupēt:</span>
          <span className="truncate text-foreground">{display}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] p-2">
        <div className="space-y-1.5">
          {value.length === 0 && (
            <div className="px-1 py-1 text-[11px] text-muted-foreground">
              Bez grupēšanas
            </div>
          )}
          {value.map((k, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium uppercase text-muted-foreground">
                L{i + 1}
              </span>
              <select
                value={k}
                onChange={(e) => setLevel(i, e.target.value)}
                className="h-7 flex-1 rounded border border-input bg-background px-1.5 text-xs"
              >
                {GROUP_FIELDS.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
                <option value="_none">— noņemt līmeni —</option>
              </select>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={addLevel}
              disabled={value.length >= 3}
            >
              <Plus className="h-3.5 w-3.5" />
              Pievienot līmeni
            </Button>
            {value.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => onChange([])}
              >
                Bez grupēšanas
              </Button>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={onExpandAll}
            >
              Izvērst
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={onCollapseAll}
            >
              Sakļaut
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
