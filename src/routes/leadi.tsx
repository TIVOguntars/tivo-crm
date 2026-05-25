import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
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
  Filter,
  Columns3,
  ChevronDown,
  ChevronRight,
  X,
  Search,
  AlertTriangle,
  Layers,
  ArrowUpDown,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
import { useUserMap } from "@/hooks/useUsers";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import { cn } from "@/lib/utils";
import { Tag, normalizeTags } from "@/components/ui/Tag";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PriorityCell } from "@/components/PriorityCell";
import { resolveResponsible } from "@/lib/responsibleResolver";
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
  display_lead_id: string;
  name: string;
  lead_number: string;
  company_name: string;
  phone: string;
  email: string;
  country: string;
  secondary: string;
  source: string;
  status: string;
  owner: string;
  ppv: string;
  ppv_user_id: string;
  next_action: string;
  next_action_due: string | null; // effective_due_at
  next_action_due_date: string | null; // raw next_action_due_date (display only)
  queue_bucket_label: string;
  queue_bucket: string;
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
  is_hot: boolean;
  priority_score: number;
  priority_label: string;
  responsible: string; // "SIS" | userId | "-"
  object_summary: string;
  /**
   * Quick notes column source.
   * field missing in current query/type — pending Supabase backfill of
   * crm.leads_list_display_v3 with `summary` column.
   */
  summary: string;
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
function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v.trim(),
  );
}
function leadDisplayName(r: Row): string {
  const candidates = [
    s(r.display_name),
    s(r.full_name),
    s(r.name),
    s(r.object_name),
  ];
  for (const n of candidates) {
    if (n && !isUuidLike(n)) return n;
  }
  return "";
}

const MS_MIN = 60_000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;

const LEADS_GRID =
  "grid grid-cols-[32px_92px_64px_minmax(180px,1.3fr)_minmax(120px,1fr)_120px_130px_140px_140px_124px]";

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
/** Bucket for next-action grouping. */
function nextActionBucket(due: string | null): string {
  const t = parseDate(due);
  if (t == null) return "Nav darbības";
  const now = Date.now();
  if (t < now && !isRigaSameDay(t, now)) return "Kavēts";
  if (isRigaSameDay(t, now)) return "Šodien";
  if (isRigaSameDay(t, now + MS_DAY)) return "Rīt";
  if (t <= now + 7 * MS_DAY) return "Nākamās 7 dienas";
  return "Vēlāk";
}
const NEXT_ACTION_BUCKET_ORDER = [
  "Kavēts",
  "Šodien",
  "Rīt",
  "Nākamās 7 dienas",
  "Vēlāk",
  "Nav darbības",
];

function priorityBucket(score: number): string {
  if (score >= 80) return "Karsts (80–100)";
  if (score >= 60) return "Augsta (60–79)";
  if (score >= 40) return "Vidēja (40–59)";
  if (score >= 20) return "Zema (20–39)";
  if (score >= 1) return "Auksts (1–19)";
  return "Nav (0)";
}
const PRIORITY_BUCKET_ORDER = [
  "Karsts (80–100)",
  "Augsta (60–79)",
  "Vidēja (40–59)",
  "Zema (20–39)",
  "Auksts (1–19)",
  "Nav (0)",
];

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
  {
    key: "ppv_user_id",
    label: "PPV (ID)",
    type: "enum",
    get: (l) => l.ppv_user_id,
  },
  { key: "country", label: "Valsts", type: "enum", get: (l) => l.country },
  { key: "tags", label: "Tagi", type: "tags", get: (l) => l.tags },
  {
    key: "priority_score",
    label: "Prioritātes punkti",
    type: "number",
    get: (l) => l.priority_score,
  },
  {
    key: "priority_label",
    label: "Prioritātes līmenis",
    type: "enum",
    get: (l) => l.priority_label,
  },
  {
    key: "queue_bucket",
    label: "Rindas grupa",
    type: "enum",
    get: (l) => l.queue_bucket,
  },
  {
    key: "communication_state",
    label: "Komunikācijas stāvoklis",
    type: "enum",
    get: (l) => l.communication_state,
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
    key: "karstie",
    label: "Karstie",
    predicate: (l) =>
      l.is_hot ||
      l.priority_score >= 60 ||
      l.tags.some((t) => /^(hot|karst)/i.test(t)),
  },
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
    get: (l) => l.owner || "Nepiešķirts",
  },
  { key: "ppv", label: "PPV", get: (l) => l.ppv || "Nav PPV" },
  {
    key: "country",
    label: "Valsts",
    get: (l) => l.country || "Nav norādīts",
  },
  {
    key: "priority_bucket",
    label: "Prioritātes grupa",
    get: (l) => priorityBucket(l.priority_score),
    order: PRIORITY_BUCKET_ORDER,
  },
  {
    key: "next_action_bucket",
    label: "Nākamās darbības datums",
    get: (l) => nextActionBucket(l.next_action_due),
    order: NEXT_ACTION_BUCKET_ORDER,
  },
];
const GROUP_FIELD_BY_KEY: Record<string, GroupFieldDef> = Object.fromEntries(
  GROUP_FIELDS.map((g) => [g.key, g]),
);

/* ============================ Sort fields ============================ */

const SORT_FIELDS: { key: string; label: string; get: (l: Lead) => unknown }[] =
  [
    { key: "priority_score", label: "Prioritāte", get: (l) => l.priority_score },
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
    {
      key: "ppv_user_id",
      label: "PPV (ID)",
      get: (l) => l.ppv_user_id,
    },
    { key: "country", label: "Valsts", get: (l) => l.country },
  ];
const SORT_BY_KEY: Record<string, (typeof SORT_FIELDS)[number]> =
  Object.fromEntries(SORT_FIELDS.map((f) => [f.key, f]));

const DEFAULT_SORT: SortRule[] = [
  { f: "priority_score", d: "desc" },
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

/* ============================ Components: Priority/Comm ============================ */

/* ============================ Page ============================ */

function LeadiPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { resolve: resolveUserName } = useUserMap();

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

  /* ---- persist & restore session filters/grouping/sort/view ---- */
  const sessionStorageKey = "leadi:session:v1";
  const restoreDoneRef = useRef(false);
  useEffect(() => {
    if (restoreDoneRef.current) return;
    restoreDoneRef.current = true;
    if (typeof window === "undefined") return;
    const urlIsFresh =
      (search.view ?? "all") === "all" &&
      (search.flt?.length ?? 0) === 0 &&
      (search.sort?.length ?? 0) === 0 &&
      search.gby === undefined &&
      !search.q;
    if (!urlIsFresh) return;
    try {
      const raw = window.localStorage.getItem(sessionStorageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        view?: string;
        flt?: FilterRule[];
        gby?: string[];
        sort?: SortRule[];
        q?: string;
      };
      const patch: Record<string, unknown> = {};
      if (saved.view && saved.view !== "all") patch.view = saved.view;
      if (saved.flt && saved.flt.length > 0) patch.flt = saved.flt;
      if (Array.isArray(saved.gby)) patch.gby = saved.gby;
      if (saved.sort && saved.sort.length > 0) patch.sort = saved.sort;
      if (saved.q) patch.q = saved.q;
      if (Object.keys(patch).length > 0) setSearch(patch);
    } catch {
      /* ignore */
    }
  }, [search, setSearch]);

  useEffect(() => {
    if (!restoreDoneRef.current) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        sessionStorageKey,
        JSON.stringify({
          view: search.view,
          flt: search.flt,
          gby: search.gby,
          sort: search.sort,
          q: search.q,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [search.view, search.flt, search.gby, search.sort, search.q]);

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

  /* ---- collapsed group state ---- */
  const collapseStorageKey = "leadi:collapsed:v1";
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(collapseStorageKey);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const toggleCollapsed = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [path]: !prev[path] };
      try {
        window.localStorage.setItem(collapseStorageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
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

  /* ---- crm.v_next_action_queue: source for "Atbildīgais" column ---- */
  const queueView = useCrmView(
    "v_next_action_queue",
    "select=lead_id,action_type,assigned_user_id,workflow_name,step_name,communication_label,communication_state,queue_status,queue_bucket,priority_label&limit=20000",
    { all: true },
  );
  type QueueFacts = {
    action_type: string;
    assigned_user_id: string;
    queue_bucket: string;
    priority_label: string;
    communication_label: string;
  };
  const queueByLead = useMemo(() => {
    const map = new Map<string, QueueFacts>();
    const rows = (queueView.data?.rows ?? []) as Row[];
    for (const r of rows) {
      const lid = s(r.lead_id);
      if (!lid || map.has(lid)) continue;
      map.set(lid, {
        action_type: s(r.action_type),
        assigned_user_id: s(r.assigned_user_id),
        queue_bucket: s(r.queue_bucket),
        priority_label: s(r.priority_label),
        communication_label: s(r.communication_label),
      });
    }
    return map;
  }, [queueView.data]);

  type LeadFacts = {
    status: string;
    ppv_user_id: string;
    contact_id: string;
  };
  const crmLeadFactsById = useMemo(() => {
    const map = new Map<string, LeadFacts>();
    const rows = (overview.data?.rows ?? []) as Row[];
    for (const r of rows) {
      const lid = s(r.lead_id);
      if (!lid) continue;
      map.set(lid, {
        status: s(r.status),
        ppv_user_id: s(r.ppv_user_id),
        contact_id: s(r.contact_id),
      });
    }
    return map;
  }, [overview.data]);

  const reitingsView = useAnalyticsView(
    "lead_reitings_preview",
    "select=lead_id,reitings&limit=20000",
  );
  const reitingsByLead = useMemo(() => {
    const map = new Map<string, number>();
    const rows = (reitingsView.data?.rows ?? []) as Row[];
    for (const r of rows) {
      const lid = s(r.lead_id);
      if (!lid) continue;
      const v = Number(r.reitings);
      if (Number.isFinite(v)) map.set(lid, v);
    }
    return map;
  }, [reitingsView.data]);

  // Priority is sourced from crm.lead_priority_scoring_v2.
  const scoringView = useCrmView(
    "lead_priority_scoring_v2",
    "select=lead_id,priority_score,priority_label,recommended_status,raw_priority_score,has_hot_tag,inbound_count,replied_count&limit=20000",
    { all: true },
  );
  const scoringByLead = useMemo(() => {
    const map = new Map<
      string,
      { score: number; label: string; recommended: string }
    >();
    const rows = (scoringView.data?.rows ?? []) as Row[];
    for (const r of rows) {
      const lid = s(r.lead_id);
      if (!lid) continue;
      map.set(lid, {
        score: Number(r.priority_score ?? 0) || 0,
        label: s(r.priority_label) || "Zema",
        recommended: s(r.recommended_status),
      });
    }
    return map;
  }, [scoringView.data]);

  const commCounts = useMemo(() => {
    const map = new Map<string, CommBuckets>();
    const rows = (overview.data?.rows ?? []) as Row[];
    for (const r of rows) {
      const lid = s(r.lead_id) || s(r.id);
      if (!lid) continue;
      map.set(lid, {
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
        const id = s(r.lead_id) || s(r.id);
        if (!id) return null;
        const phone = s(
          r.phone_e164 || r.telefons_e164 || r.telefons_raw || r.phone_raw,
        );
        const email = s(r.email_normalized || r.email);
        const country = s(r.country);
        const secondary = phone || email || country;
        const next_action_due =
          s(r.effective_due_at) || s(r.visible_action_due_at) || null;
        const next_action = s(r.action_label);
        const queue_bucket_label = s(r.queue_bucket_label);
        const last_activity =
          s(r.last_contact_date) ||
          s(r.last_communication_at) ||
          s(r.updated_at) ||
          null;
        const has_unread_reply =
          r.has_unread_reply === true || r.has_unread_reply === "true";
        const reply_count = Number(r.reply_count ?? 0) || 0;
        const communication_state = s(r.communication_state).toLowerCase();
        const tagsArr = asTags(r.tags);
        const facts = crmLeadFactsById.get(id);
        const statusStr =
          s(facts?.status) || s(r.lead_status_label || r.status);
        const isTerminal = /atcelt|nekvalific|pabeigt/i.test(statusStr);
        const scoring = scoringByLead.get(id);
        const rowPriority = Number(r.priority_score);
        const ratingPriority =
          reitingsByLead.get(id) ??
          reitingsByLead.get(s(r.external_id)) ??
          0;
        const fallbackPriority =
          Number.isFinite(rowPriority) && rowPriority > 0
            ? rowPriority
            : ratingPriority;
        const priorityScore = isTerminal
          ? 0
          : scoring
            ? scoring.score
            : fallbackPriority;
        const queueFacts = queueByLead.get(id);
        const priorityLabelRaw =
          s(r.priority_label) || s(queueFacts?.priority_label);
        const responsible = resolveResponsible(
          queueFacts?.action_type,
          queueFacts?.assigned_user_id,
        );
        const queueBucketRaw =
          s(r.queue_bucket) || s(queueFacts?.queue_bucket);
        return {
          lead_id: id,
          display_lead_id: id,
          name: leadDisplayName(r),
          lead_number: s(r.lead_number),
          company_name: s(r.company_name),
          phone,
          email,
          country,
          secondary,
          source: s(r.source),
          status: statusStr,
          owner: (() => {
            // Single owner = PPV (per v2 model).
            const uid = s(facts?.ppv_user_id);
            return uid ? resolveUserName(uid) || "" : "";
          })(),
          ppv: (() => {
            const uid = s(facts?.ppv_user_id);
            return uid ? resolveUserName(uid) || "" : "";
          })(),
          ppv_user_id: s(facts?.ppv_user_id),
          next_action: s(r.next_action) || next_action,
          next_action_due,
          next_action_due_date: s(r.next_action_due_date) || null,
          queue_bucket_label,
          queue_bucket: queueBucketRaw,
          last_activity,
          tags: tagsArr,
          created_at: s(r.created_at) || null,
          unread_replies:
            Number(r.unread_replies ?? r.unread_count ?? reply_count) || 0,
          communication_state,
          communication_label:
            s(r.communication_label) || s(queueFacts?.communication_label),
          has_unread_reply,
          reply_count,
          click_count: Number(r.click_count ?? 0) || 0,
          last_reply_at: s(r.last_reply_at) || null,
          last_communication_at: s(r.last_communication_at) || null,
          last_outbound_at: s(r.last_outbound_at) || null,
          last_inbound_at: s(r.last_inbound_at) || null,
          is_hot:
            tagsArr.some((t) => /^(hot|karst)/i.test(t)) ||
            /karst/i.test(statusStr),
          priority_score: priorityScore,
          priority_label: priorityLabelRaw,
          responsible,
          object_summary: s(r.object_summary),
          // field missing in current query/type — pending Supabase backfill
          summary: "",
        } as Lead;
      })
      .filter((x): x is Lead => x !== null);
  }, [
    overview.data,
    reitingsByLead,
    crmLeadFactsById,
    scoringByLead,
    queueByLead,
    resolveUserName,
  ]);

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
        fromArr(fo?.owners).length
          ? fromArr(fo?.owners)
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
          `${l.name} ${l.email} ${l.phone} ${l.next_action} ${l.country}`.toLowerCase();
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
    try {
      window.localStorage.setItem(collapseStorageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const expandAll = () => {
    setCollapsed({});
    try {
      window.localStorage.removeItem(collapseStorageKey);
    } catch {
      /* ignore */
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <HeaderSlot>
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">
            Leadi
          </h1>
          <p className="text-[11px] text-muted-foreground">Analītiskā leadu darba vide</p>
        </div>
      </HeaderSlot>
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div />
        <div className="flex items-center gap-1.5">
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
        </div>
      </header>

      {/* Toolbar */}
      <div className="sticky top-0 z-20 -mx-4 mb-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <SavedViewSelector value={view} onChange={setView} />

          <div className="mx-1 h-5 w-px bg-border" aria-hidden />

          <FilterBuilder
            rules={flt}
            options={options}
            onChange={setFlt}
          />

          <GroupByControl
            value={gby}
            onChange={setGby}
            onCollapseAll={collapseAll}
            onExpandAll={expandAll}
          />

          <SortControl value={sort} onChange={setSort} />

          <div className="relative ml-1 min-w-[220px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search.q ?? ""}
              onChange={(e) => setSearch({ q: e.target.value || undefined })}
              placeholder="Meklēt pēc vārda, telefona, email"
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {selected.size === 0 && (
            <div className="ml-auto flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled
                      className="h-8 gap-1.5 text-xs opacity-60"
                    >
                      <Columns3 className="h-3.5 w-3.5" />
                      Kolonnas
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">Drīzumā</TooltipContent>
              </Tooltip>
              {hasActive && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1 px-2 text-xs"
                  onClick={clearAll}
                >
                  <X className="h-3.5 w-3.5" />
                  Notīrīt visu
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Active chips */}
        {(flt.length > 0 || q || view !== "all") && (
          <ActiveFilterChips
            view={view}
            onClearView={() => setView("all")}
            rules={flt}
            onRemoveRule={(i) => setFlt(flt.filter((_, idx) => idx !== i))}
            q={q}
            onClearQ={() => setSearch({ q: undefined })}
          />
        )}
      </div>

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
        <div className="overflow-hidden rounded-md border border-border bg-card">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
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
            <div className="max-h-[calc(100vh-220px)] overflow-y-auto overflow-x-hidden">
              <div role="table" className={cn("w-full text-xs")}>
                <div
                  role="rowgroup"
                  className="sticky top-0 z-10 bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur"
                >
                  <div role="row" className={cn(LEADS_GRID, "border-b border-border")}>
                    <div role="columnheader" className="px-1.5 py-2 flex items-center">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={toggleAll}
                        className="h-3.5 w-3.5"
                      />
                    </div>
                    <div role="columnheader" className="px-1.5 py-2 font-medium">Prioritāte</div>
                    <div role="columnheader" className="px-1.5 py-2 font-medium">PPV</div>
                    <div role="columnheader" className="px-1.5 py-2 font-medium">Lead</div>
                    <div role="columnheader" className="px-1.5 py-2 font-medium">Tagi</div>
                    <div role="columnheader" className="px-1.5 py-2 font-medium">Statuss</div>
                    <div role="columnheader" className="px-1.5 py-2 font-medium">Atbildīgais</div>
                    <div role="columnheader" className="px-1.5 py-2 font-medium">Nākamais</div>
                    <div role="columnheader" className="px-1.5 py-2 font-medium">Aktivitāte</div>
                    <div role="columnheader" className="px-1.5 py-2 text-right font-medium" aria-label="Darbības" />
                  </div>
                </div>
                <div role="rowgroup">
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
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>
              Rāda {sorted.length} no {leads.length}
            </span>
            <span>
              {gby.length > 0
                ? `Grupēts: ${gby.map((k) => GROUP_FIELD_BY_KEY[k]?.label ?? k).join(" › ")}`
                : "Bez grupēšanas"}
            </span>
          </div>
        </div>
      )}
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
          <div
            key={`gh-${n.path}`}
            role="row"
            className={cn(LEADS_GRID, "border-t border-border/40 bg-muted/30")}
          >
            <div role="cell" style={{ gridColumn: "1 / -1" }} className="p-0">
              <button
                type="button"
                onClick={() => toggle(n.path)}
                className="flex w-full items-center gap-1.5 px-3 py-1 text-left text-[11px] hover:bg-muted/50"
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
            </div>
          </div>
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
    ? "before:bg-blue-500/80"
    : isOverdue
      ? "before:bg-rose-500/70"
      : isHot
        ? "before:bg-orange-500/70"
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
  const commTimeSrc = l.last_reply_at || l.last_communication_at;
  return (
    <div
      role="row"
      onClick={() => openLead(l.lead_id)}
      className={cn(
        LEADS_GRID,
        "group relative cursor-pointer border-b border-border/30 transition-colors",
        "before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:content-['']",
        accentClass,
        isSel ? "bg-primary/[0.04]" : "hover:bg-muted/30",
      )}
    >
      <div
        role="cell"
        className="px-1.5 py-1 flex items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={isSel}
          onCheckedChange={() => toggleOne(l.lead_id)}
          className="h-3.5 w-3.5"
        />
      </div>
      <div role="cell" className="min-w-0 px-1.5 py-1 flex items-center">
        <PriorityCell score={l.priority_score} />
      </div>
      <div role="cell" className="min-w-0 px-1.5 py-1 text-foreground flex items-center">
        <span className="truncate">
          {l.ppv || <span className="text-muted-foreground/60">—</span>}
        </span>
      </div>
      <div role="cell" className="min-w-0 px-1.5 py-1">
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
              className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"
              aria-label="Ir neatbildēta klienta atbilde"
            />
          )}
        </div>
        <div className="truncate text-[11px] text-muted-foreground/80 tabular-nums">
          <span className="text-muted-foreground/70">{l.country || "—"}</span>
          <span className="mx-1 opacity-40">•</span>
          <CommStats counts={commCounts.get(l.lead_id)} hasUnread={hasUnread} />
        </div>
      </div>
      <div role="cell" className="min-w-0 px-1.5 py-1 flex items-center">
        {l.tags.length === 0 ? (
          <span className="text-muted-foreground/50">—</span>
        ) : (
          <div className="flex flex-wrap gap-0.5">
            {normalizeTags(l.tags).slice(0, 3).map((t) => (
              <Tag key={t} tag={t} />
            ))}
            {l.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground/55 tabular-nums">
                +{l.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
      <div role="cell" className="min-w-0 px-1.5 py-1 flex items-center">
        <StatusBadge status={l.status} />
      </div>
      <div role="cell" className="min-w-0 px-1.5 py-1 flex items-center">
        {l.owner ? (
          <span className="truncate text-foreground text-[11.5px] font-medium tabular-nums">
            {l.owner}
          </span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </div>
      <div role="cell" className="min-w-0 px-1.5 py-1">
        <div className="flex flex-col leading-tight">
          <span
            className={cn(
              "truncate text-[11.5px] font-medium",
              l.next_action ? "text-foreground" : "text-muted-foreground/60",
            )}
          >
            {l.next_action || "Nav darbības"}
          </span>
          {l.next_action_due && (
            <span
              className={cn(
                "truncate text-[10px] tabular-nums",
                isOverdue
                  ? "text-rose-600 dark:text-rose-300"
                  : "text-muted-foreground/70",
              )}
            >
              {fmtDate(l.next_action_due)}
            </span>
          )}
        </div>
      </div>
      <div role="cell" className="min-w-0 px-1.5 py-1">
        <div className="flex flex-col leading-tight">
          <span
            className={cn(
              "truncate text-[11.5px]",
              l.communication_state === "unread"
                ? "font-medium text-emerald-600 dark:text-emerald-400"
                : l.communication_state === "waiting"
                  ? "text-orange-600 dark:text-orange-400"
                  : l.communication_state === "no_contact"
                    ? "text-muted-foreground/60"
                    : "text-foreground",
            )}
          >
            {commLabel || "—"}
          </span>
          {commTimeSrc && !isFutureDate(commTimeSrc) && (
            <span className="truncate text-[10px] text-muted-foreground/60">
              {fmtRelative(commTimeSrc)}
            </span>
          )}
        </div>
      </div>
      <div
        role="cell"
        className="min-w-0 px-1.5 py-1 flex items-center justify-end"
        onClick={(e) => e.stopPropagation()}
      >
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
      </div>
    </div>
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

/* ============================ Filter builder ============================ */

function FilterBuilder({
  rules,
  options,
  onChange,
}: {
  rules: FilterRule[];
  options: Record<string, string[]>;
  onChange: (next: FilterRule[]) => void;
}) {
  const add = () => {
    onChange([...rules, { f: "status", op: "is_any_of", v: [] }]);
  };
  const update = (i: number, patch: Partial<FilterRule>) => {
    const next = rules.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(rules.filter((_, idx) => idx !== i));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium",
            rules.length > 0
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-border bg-background text-foreground hover:bg-muted/50",
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          <span>Filtri</span>
          {rules.length > 0 && (
            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {rules.length}
            </span>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[560px] p-2">
        <div className="space-y-1.5">
          {rules.length === 0 && (
            <div className="px-1 py-2 text-xs text-muted-foreground">
              Nav aktīvu filtru.
            </div>
          )}
          {rules.map((r, i) => (
            <FilterRuleRow
              key={i}
              rule={r}
              options={options}
              onChange={(p) => update(i, p)}
              onRemove={() => remove(i)}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={add}>
            <Plus className="h-3.5 w-3.5" />
            Pievienot filtru
          </Button>
          {rules.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => onChange([])}
            >
              Notīrīt
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterRuleRow({
  rule,
  options,
  onChange,
  onRemove,
}: {
  rule: FilterRule;
  options: Record<string, string[]>;
  onChange: (patch: Partial<FilterRule>) => void;
  onRemove: () => void;
}) {
  const def = FIELD_BY_KEY[rule.f] ?? FIELDS[0];
  const ops = OPERATORS_BY_TYPE[def.type];
  const fieldOptions = options[def.key] ?? [];

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={rule.f}
        onChange={(e) => {
          const f = e.target.value;
          const t = FIELD_BY_KEY[f].type;
          onChange({ f, op: OPERATORS_BY_TYPE[t][0], v: undefined });
        }}
        className="h-7 rounded border border-input bg-background px-1.5 text-xs"
      >
        {FIELDS.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>
      <select
        value={rule.op}
        onChange={(e) => onChange({ op: e.target.value, v: undefined })}
        className="h-7 rounded border border-input bg-background px-1.5 text-xs"
      >
        {ops.map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op] ?? op}
          </option>
        ))}
      </select>
      <div className="min-w-0 flex-1">
        <FilterValueInput
          rule={rule}
          fieldOptions={fieldOptions}
          onChange={(v) => onChange({ v })}
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Noņemt filtru"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function FilterValueInput({
  rule,
  fieldOptions,
  onChange,
}: {
  rule: FilterRule;
  fieldOptions: string[];
  onChange: (v: unknown) => void;
}) {
  const def = FIELD_BY_KEY[rule.f];
  const op = rule.op;

  if (op === "is_empty" || op === "is_not_empty") {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  if (op === "today" || op === "overdue") {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  if (op === "next_x_days" || op === "last_x_days" || op === "before_x_days") {
    return (
      <input
        type="number"
        min={1}
        value={(rule.v as number) ?? ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        placeholder="Dienas"
        className="h-7 w-full rounded border border-input bg-background px-2 text-xs"
      />
    );
  }
  if (op === "before_date" || op === "after_date") {
    const d = rule.v ? new Date(String(rule.v)) : undefined;
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-7 w-full rounded border border-input bg-background px-2 text-left text-xs"
          >
            {d ? fmtDate(d.toISOString()) : "Izvēlies datumu"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={d}
            onSelect={(x) => onChange(x ? x.toISOString() : undefined)}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    );
  }
  if (op === "between_dates") {
    const v = (rule.v ?? {}) as { from?: string; to?: string };
    const from = v.from ? new Date(v.from) : undefined;
    const to = v.to ? new Date(v.to) : undefined;
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-7 w-full rounded border border-input bg-background px-2 text-left text-xs"
          >
            {from && to
              ? `${fmtDate(from.toISOString())} → ${fmtDate(to.toISOString())}`
              : "Izvēlies periodu"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="range"
            selected={{ from, to }}
            onSelect={(r) =>
              onChange({
                from: r?.from ? r.from.toISOString() : undefined,
                to: r?.to ? r.to.toISOString() : undefined,
              })
            }
            numberOfMonths={2}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    );
  }
  if (op === "gt" || op === "lt" || (def?.type === "number" && (op === "is" || op === "is_not"))) {
    return (
      <input
        type="number"
        value={(rule.v as number) ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-7 w-full rounded border border-input bg-background px-2 text-xs"
      />
    );
  }
  if (op === "is_any_of" || op === "is_none_of" || op === "contains_all") {
    const cur = Array.isArray(rule.v) ? (rule.v as string[]) : [];
    return (
      <MultiSelectInline
        options={fieldOptions}
        value={cur}
        onChange={onChange}
      />
    );
  }
  // single text/enum
  if (fieldOptions.length > 0) {
    return (
      <select
        value={(rule.v as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-full rounded border border-input bg-background px-2 text-xs"
      >
        <option value="">—</option>
        {fieldOptions.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="text"
      value={(rule.v as string) ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-full rounded border border-input bg-background px-2 text-xs"
    />
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

/* ============================ Sort control ============================ */

function SortControl({
  value,
  onChange,
}: {
  value: SortRule[];
  onChange: (v: SortRule[]) => void;
}) {
  const display =
    value.length === 0
      ? "Prioritāte ↓"
      : value
          .map((r) => {
            const lbl = SORT_BY_KEY[r.f]?.label ?? r.f;
            return `${lbl} ${r.d === "desc" ? "↓" : "↑"}`;
          })
          .join(", ");
  const update = (i: number, patch: Partial<SortRule>) => {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const add = () =>
    onChange([
      ...value,
      {
        f: SORT_FIELDS.find((f) => !value.some((v) => v.f === f.key))?.key ??
          SORT_FIELDS[0].key,
        d: "desc",
      },
    ]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
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
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span className="text-muted-foreground">Kārtot:</span>
          <span className="truncate text-foreground">{display}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <div className="space-y-1.5">
          {value.length === 0 && (
            <div className="rounded bg-muted/30 px-2 py-2 text-[11px] text-muted-foreground">
              Noklusētais: Prioritāte ↓ → Pēdējā komunikācija ↓ → Izveidots ↓
            </div>
          )}
          {value.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <select
                value={r.f}
                onChange={(e) => update(i, { f: e.target.value })}
                className="h-7 flex-1 rounded border border-input bg-background px-1.5 text-xs"
              >
                {SORT_FIELDS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => update(i, { d: r.d === "desc" ? "asc" : "desc" })}
                className="inline-flex h-7 w-7 items-center justify-center rounded border border-input hover:bg-muted/50"
                aria-label="Pārslēgt virzienu"
              >
                {r.d === "desc" ? (
                  <ArrowDown className="h-3.5 w-3.5" />
                ) : (
                  <ArrowUp className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Noņemt"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={add}>
            <Plus className="h-3.5 w-3.5" />
            Pievienot kārtošanu
          </Button>
          {value.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => onChange([])}
            >
              Atjaunot noklusēto
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ============================ Active filter chips ============================ */

function ActiveFilterChips({
  view,
  onClearView,
  rules,
  onRemoveRule,
  q,
  onClearQ,
}: {
  view: string;
  onClearView: () => void;
  rules: FilterRule[];
  onRemoveRule: (i: number) => void;
  q: string;
  onClearQ: () => void;
}) {
  const sv = SAVED_VIEW_BY_KEY[view];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {view !== "all" && sv && (
        <Chip label={`Skats: ${sv.label}`} onRemove={onClearView} />
      )}
      {q && <Chip label={`Meklēšana: "${q}"`} onRemove={onClearQ} />}
      {rules.map((r, i) => {
        const def = FIELD_BY_KEY[r.f];
        const opLbl = OP_LABELS[r.op] ?? r.op;
        let val = "";
        if (Array.isArray(r.v)) val = (r.v as string[]).join(", ");
        else if (typeof r.v === "object" && r.v) {
          const vv = r.v as { from?: string; to?: string };
          val = `${vv.from ? fmtDate(vv.from) : ""} → ${vv.to ? fmtDate(vv.to) : ""}`;
        } else if (r.v != null) val = String(r.v);
        return (
          <Chip
            key={i}
            label={`${def?.label ?? r.f} ${opLbl}${val ? `: ${val}` : ""}`}
            onRemove={() => onRemoveRule(i)}
          />
        );
      })}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full border border-border bg-muted/40 pl-2 pr-1 text-[11px] text-foreground">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
        aria-label="Noņemt"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
