import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Search,
  X,
} from "lucide-react";
import { resolveDateRange, type DateRangePreset } from "@/lib/filters";

import { PageHeader } from "@/components/PageHeader";
import { LoadingState, EmptyState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import { useCrmView } from "@/hooks/useCrmView";
import { isEndpointMissing } from "@/lib/endpointStatus";
import type { FiltersSearch } from "@/lib/filters";
import { cn } from "@/lib/utils";
import { Tag, normalizeTags } from "@/components/ui/Tag";

/* ----------------------- Route + search params ----------------------- */

const SORT_KEYS = [
  "default",
  "ppv",
  "display_name",
  "status",
  "rating",
  "email",
  "phone",
  "country",
  "owner",
  "next_action",
  "last_activity_at",
  "tags",
] as const;
type SortKey = (typeof SORT_KEYS)[number];

const SEGMENTS = [
  "all",
  "jauni",
  "nesasniedzami",
  "piesaistisana",
  "piedavajums",
  "ligumi",
] as const;
type Segment = (typeof SEGMENTS)[number];

const RATING_BUCKETS = ["all", "90_100", "75_90", "50_75", "20_50", "0_20"] as const;
type RatingBucket = (typeof RATING_BUCKETS)[number];

const searchSchema = z.object({
  status: fallback(z.string().optional(), undefined),
  owner: fallback(z.string().optional(), undefined),
  ppv: fallback(z.string().optional(), undefined),
  qq: fallback(z.string().optional(), undefined),
  seg: fallback(z.enum(SEGMENTS), "all").default("all"),
  rb: fallback(z.enum(RATING_BUCKETS), "all").default("all"),
  sort: fallback(z.enum(SORT_KEYS), "default").default("default"),
  dir: fallback(z.enum(["asc", "desc"]), "desc").default("desc"),
});

export const Route = createFileRoute("/darba-rinda")({
  validateSearch: zodValidator(searchSchema),
  component: DarbaRindaPage,
});

/* ---------------------------- Types ---------------------------- */

type Row = Record<string, unknown>;

interface Lead {
  lead_id: string;
  display_name: string;
  email: string;
  phone: string;
  country: string;
  source: string;
  status: string;
  owner: string;
  ppv: string;
  next_action: string;
  next_action_reason: string;
  tags: string[];
  rating: number | null;
  last_activity_at: string | null;
  last_event_type: string;
  last_event_group: string;
  last_channel: string;
  last_outbound_at: string | null;
  last_reply_at: string | null;
  planned_build_date: string | null;
  follow_up_bucket: string;
  next_action_due_date: string | null;
}

const PAGE_SIZE = 1000;

/* ----------------------- Helpers ----------------------- */

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

function leadDisplayName(row: Row, leadId: string): string {
  return s(row.name) || s(row.object_name) || (leadId ? `Lead #${leadId}` : "");
}

function parseDate(v: unknown): number | null {
  if (v == null || v === "") return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}

function parseRating(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtDate(v: string | null): string {
  const t = parseDate(v);
  if (t == null) return "—";
  return new Date(t).toLocaleDateString("lv-LV");
}

function fmtDateTime(v: string | null): string {
  const t = parseDate(v);
  if (t == null) return "—";
  return new Date(t).toLocaleString("lv-LV", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadgeClass(status: string): string {
  const k = status.toLowerCase().trim();
  if (!k) return "bg-muted text-muted-foreground";
  if (k.startsWith("jauns"))
    return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
  if (
    k.startsWith("nesasniedz") ||
    k.startsWith("nesasniegts") ||
    k.includes("bounce") ||
    k.includes("nederīg")
  )
    return "bg-muted text-muted-foreground";
  if (k.startsWith("piesaist"))
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (k.startsWith("nekvalific"))
    return "bg-destructive/15 text-destructive";
  if (k.startsWith("piedāv") || k.startsWith("piedav"))
    return "bg-purple-500/15 text-purple-700 dark:text-purple-300";
  if (k.startsWith("līgum") || k.startsWith("ligum") || k.includes("contract"))
    return "bg-emerald-700/20 text-emerald-800 dark:text-emerald-200";
  return "bg-secondary text-secondary-foreground";
}

function nextActionBadgeClass(action: string): string {
  const k = action.toLowerCase().trim();
  if (!k || k.startsWith("nav")) return "bg-muted text-muted-foreground";
  if (k.includes("zvan") || k.includes("call"))
    return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
  if (k.includes("epast") || k.includes("e-past") || k.includes("email") || k.includes("rakst"))
    return "bg-purple-500/15 text-purple-700 dark:text-purple-300";
  if (k.includes("piedāv") || k.includes("piedav") || k.includes("offer"))
    return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  if (k.includes("tikš") || k.includes("meet"))
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (k.includes("līgum") || k.includes("ligum") || k.includes("contract"))
    return "bg-emerald-700/20 text-emerald-800 dark:text-emerald-200";
  if (k.includes("atgādin") || k.includes("follow"))
    return "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300";
  if (k.includes("atcel") || k.includes("noraid"))
    return "bg-destructive/15 text-destructive";
  return "bg-secondary text-secondary-foreground";
}

/* ----------------------- Segments ----------------------- */

const NEW_STATUSES = new Set(["Jauns", "Jauns lead", "Jauns leads"]);
const UNREACHABLE_STATUSES = new Set([
  "Nesasniedzams",
  "Nesasniegts",
  "Bounced",
  "Nederīgs e-pasts",
]);
const ATTRACTION_STATUSES = new Set(["Piesaistīšana", "Piesaistisana"]);
const OFFER_STATUSES = new Set(["Piedāvājums", "Piedavajums"]);
const CONTRACT_STATUSES = new Set(["Līgums", "Ligums", "Contract"]);

function passesSegment(lead: Lead, seg: Segment): boolean {
  switch (seg) {
    case "all":
      return true;
    case "jauni":
      return NEW_STATUSES.has(lead.status);
    case "nesasniedzami":
      return UNREACHABLE_STATUSES.has(lead.status);
    case "piesaistisana":
      return ATTRACTION_STATUSES.has(lead.status);
    case "piedavajums":
      return OFFER_STATUSES.has(lead.status);
    case "ligumi":
      return CONTRACT_STATUSES.has(lead.status);
  }
}

const SEGMENT_LABELS: Record<Segment, string> = {
  all: "Visi",
  jauni: "Jauni",
  nesasniedzami: "Nesasniedzami",
  piesaistisana: "Piesaistīšana",
  piedavajums: "Piedāvājumi",
  ligumi: "Līgumi",
};

function passesRatingBucket(lead: Lead, rb: RatingBucket): boolean {
  if (rb === "all") return true;
  const r = lead.rating;
  if (r == null) return false;
  switch (rb) {
    case "90_100": return r >= 90 && r <= 100;
    case "75_90":  return r >= 75 && r < 90;
    case "50_75":  return r >= 50 && r < 75;
    case "20_50":  return r >= 20 && r < 50;
    case "0_20":   return r >= 0 && r < 20;
  }
}

const RATING_BANNERS: ReadonlyArray<{
  key: Exclude<RatingBucket, "all">;
  label: string;
  cls: string;
}> = [
  { key: "90_100", label: "90–100", cls: "border-emerald-500/30 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100" },
  { key: "75_90",  label: "75–90",  cls: "border-lime-500/30 bg-lime-500/15 text-lime-900 dark:text-lime-100" },
  { key: "50_75",  label: "50–75",  cls: "border-amber-500/30 bg-amber-500/15 text-amber-900 dark:text-amber-100" },
  { key: "20_50",  label: "20–50",  cls: "border-orange-500/30 bg-orange-500/15 text-orange-900 dark:text-orange-100" },
  { key: "0_20",   label: "0–20",   cls: "border-red-500/30 bg-red-500/15 text-red-900 dark:text-red-100" },
];

const STATUS_BANNERS: ReadonlyArray<{
  key: Exclude<Segment, "all">;
  label: string;
  cls: string;
}> = [
  { key: "jauni",          label: "Jauni",          cls: "border-blue-500/30 bg-blue-500/15 text-blue-900 dark:text-blue-100" },
  { key: "nesasniedzami",  label: "Nesasniedzami",  cls: "border-zinc-500/30 bg-zinc-500/15 text-zinc-900 dark:text-zinc-100" },
  { key: "piesaistisana",  label: "Piesaistīšana",  cls: "border-cyan-500/30 bg-cyan-500/15 text-cyan-900 dark:text-cyan-100" },
  { key: "piedavajums",    label: "Piedāvājums",    cls: "border-purple-500/30 bg-purple-500/15 text-purple-900 dark:text-purple-100" },
  { key: "ligumi",         label: "Līgums",         cls: "border-emerald-500/30 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100" },
];

/* ----------------------- Expanded details ----------------------- */

const EVENT_TYPE_LV: Record<string, string> = {
  outbound_attempt: "Izejošs mēģinājums",
  outbound: "Izejošs",
  sent: "Nosūtīts",
  delivered: "Piegādāts",
  opened: "Atvērts",
  clicked: "Klikšķis",
  replied: "Atbildēts",
  reply: "Atbildēts",
  inbound_received: "Saņemta atbilde",
  inbound: "Ienākošs",
  bounced: "Atgriezts",
  failed: "Neizdevās",
  complained: "Sūdzība",
  suppressed: "Bloķēts",
  call: "Zvans",
  call_attempt: "Zvana mēģinājums",
  note: "Piezīme",
  status_change: "Statusa maiņa",
};

function humanizeEvent(value: string): string {
  const key = value.trim().toLowerCase();
  if (!key) return "";
  if (EVENT_TYPE_LV[key]) return EVENT_TYPE_LV[key];
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ExpandedDetails({ lead }: { lead: Lead }) {
  const nextActionValue = lead.next_action
    ? lead.next_action_due_date
      ? `${lead.next_action} — ${fmtDate(lead.next_action_due_date)}`
      : lead.next_action
    : "";
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
      <DetailItem label="Lead avots" value={lead.source} />
      <DetailItem label="Pēdējais kanāls" value={lead.last_channel} />
      <DetailItem
        label="Pēdējā aktivitāte"
        value={lead.last_event_type ? humanizeEvent(lead.last_event_type) : ""}
      />
      <DetailItem
        label="Pēdējais nosūtītais"
        value={lead.last_outbound_at ? fmtDateTime(lead.last_outbound_at) : ""}
      />
      <DetailItem
        label="Pēdējā atbilde"
        value={lead.last_reply_at ? fmtDateTime(lead.last_reply_at) : ""}
      />
      <DetailItem label="Nākamā darbība" value={nextActionValue} />
      <DetailItem
        label="Būvniecības laiks"
        value={lead.planned_build_date ? fmtDate(lead.planned_build_date) : ""}
      />
      <DetailItem label="Papildus info" value={lead.next_action_reason} />
    </dl>
  );
}

function DetailItem({
  label,
  value,
  node,
  mono,
}: {
  label: string;
  value?: string;
  node?: React.ReactNode;
  mono?: boolean;
}) {
  const hasNode = node !== undefined;
  const empty = hasNode ? node == null : !value;
  return (
    <div className="flex gap-2">
      <dt className="w-44 flex-none text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 flex-1",
          empty ? "text-muted-foreground" : "text-foreground",
          mono && "font-mono text-[11px]",
        )}
      >
        {empty ? "—" : hasNode ? node : value}
      </dd>
    </div>
  );
}

/* ----------------------- Page ----------------------- */

function SortHeader({
  label,
  k,
  active,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  k: SortKey;
  active: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right" | "center";
}) {
  const isActive = active === k;
  const Icon = !isActive ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <th
      className={cn(
        "select-none px-2 py-1.5 font-medium",
        align === "right"
          ? "text-right"
          : align === "center"
            ? "text-center"
            : "text-left",
      )}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          isActive ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="h-3 w-3 opacity-70" />
      </button>
    </th>
  );
}

function DarbaRindaPage() {
  const search = Route.useSearch() as FiltersSearch & {
    status?: string;
    owner?: string;
    ppv?: string;
    qq?: string;
    seg: Segment;
    rb?: RatingBucket;
    sort?: SortKey;
    dir?: "asc" | "desc";
  };
  const navigate = useNavigate();

  const q = (search.qq ?? search.q ?? "").trim().toLowerCase();
  const selectedStatus = search.status;
  const selectedOwners = (search.owners ?? []).concat(
    search.owner ? [search.owner] : [],
  );
  const selectedPpvs = (search.ppvs ?? []).concat(
    search.ppv ? [search.ppv] : [],
  );
  const selectedCountries = search.countries ?? [];
  const selectedSources = search.sources ?? [];
  const selectedTags = (search.tags ?? []).map((t) => t.toLowerCase());
  const range: DateRangePreset = (search.range as DateRangePreset) ?? "all";
  const seg: Segment = search.seg ?? "all";
  const rb: RatingBucket = search.rb ?? "all";
  const sortKey: SortKey = (search.sort as SortKey) ?? "default";
  const sortDir: "asc" | "desc" = (search.dir as "asc" | "desc") ?? "desc";

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* Primary datasource: crm.next_action_queue_display_enriched.
     Migrated from analytics.lead_priority_queue (schema permission denied). */
  const overviewQuery = useMemo(
    () =>
      [
        "select=*",
        "order=last_activity_at.desc.nullslast",
        `limit=${PAGE_SIZE}`,
      ].join("&"),
    [],
  );

  const overview = useCrmView(
    "next_action_queue_display_enriched",
    overviewQuery,
  );

  const rawError =
    (overview.error as Error | null)?.message || overview.data?.error;
  const friendlyError = rawError
    ? isEndpointMissing(rawError)
      ? "Datu skats vēl tiek sagatavots."
      : "Datus pašlaik nevar ielādēt. Mēģiniet vēlāk."
    : null;
  const loading = overview.isLoading;

  const leads = useMemo<Lead[]>(() => {
    const rows = (overview.data?.rows ?? []) as Row[];
    return rows
      .map((r) => {
        const id = s(r.lead_id);
        if (!id) return null;
        return {
          lead_id: id,
          display_name: leadDisplayName(r, id),
          email: s(r.email_normalized || r.email),
          phone: s(
            r.telefons_e164 ||
              r.telefons_raw ||
              r.phone_e164 ||
              r.phone_raw ||
              r.phone,
          ),
          country: s(r.country),
          source: s(r.source),
          status: s(r.lead_status_label || r.status),
          owner: s(r.visible_action_owner || r.owner),
          ppv: s(r.ppv_name || r.ppv_vards),
          next_action: s(r.visible_action || r.next_action),
          next_action_reason: s(r.next_action_reason),
          tags: asTags(r.tags),
          rating: parseRating(r.reitings ?? r.rating),
          last_activity_at: s(r.last_activity_at) || null,
          last_event_type: s(r.last_event_type),
          last_event_group: s(r.last_event_group),
          last_channel: s(r.last_channel),
          last_outbound_at: s(r.last_outbound_at) || null,
          last_reply_at: s(r.last_reply_at) || null,
          planned_build_date: s(r.planned_build_date) || null,
          follow_up_bucket: s(r.follow_up_bucket),
          next_action_due_date:
            s(r.visible_action_due_at || r.next_action_due_date) || null,
        } as Lead;
      })
      .filter((x): x is Lead => x !== null);
  }, [overview.data]);

  /* Distinct options derived from dataset. */
  const options = useMemo(() => {
    const dedupe = (arr: string[]) =>
      Array.from(new Set(arr.filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "lv"),
      );
    return {
      statuses: dedupe(leads.map((l) => l.status)),
      owners: dedupe(leads.map((l) => l.owner)),
      ppvs: dedupe(leads.map((l) => l.ppv)),
      countries: dedupe(leads.map((l) => l.country)),
      sources: dedupe(leads.map((l) => l.source)),
    };
  }, [leads]);

  const filtered = useMemo(() => {
    const { from, to } = resolveDateRange(search);
    const fromTs = from ? new Date(from + "T00:00:00").getTime() : null;
    const toTs = to ? new Date(to + "T23:59:59").getTime() : null;
    return leads.filter((l) => {
      if (selectedStatus && l.status !== selectedStatus) return false;
      if (selectedOwners.length && !selectedOwners.includes(l.owner))
        return false;
      if (selectedPpvs.length && !selectedPpvs.includes(l.ppv)) return false;
      if (selectedCountries.length && !selectedCountries.includes(l.country))
        return false;
      if (selectedSources.length && !selectedSources.includes(l.source))
        return false;
      if (selectedTags.length) {
        const lower = l.tags.map((t) => t.toLowerCase());
        if (!selectedTags.every((t) => lower.includes(t))) return false;
      }
      if (fromTs != null || toTs != null) {
        const t = parseDate(l.last_activity_at);
        if (t == null) return false;
        if (fromTs != null && t < fromTs) return false;
        if (toTs != null && t > toTs) return false;
      }
      if (!passesSegment(l, seg)) return false;
      if (!passesRatingBucket(l, rb)) return false;
      if (q) {
        const hay = `${l.display_name} ${l.email} ${l.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    leads,
    selectedStatus,
    selectedOwners,
    selectedPpvs,
    selectedCountries,
    selectedSources,
    selectedTags,
    seg,
    rb,
    q,
    search,
  ]);

  /* Default sort: rating DESC → last_activity DESC. */
  const sorted = useMemo(() => {
    const copy = [...filtered];

    const cmpString = (a: string, b: string) => a.localeCompare(b, "lv");
    const cmpNumNullable = (a: number | null, b: number | null) => {
      if (a === b) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return a - b;
    };

    const defaultChain = (a: Lead, b: Lead): number => {
      const aR = a.rating;
      const bR = b.rating;
      if (aR !== bR) {
        if (aR == null) return 1;
        if (bR == null) return -1;
        return bR - aR; // DESC
      }
      const aLast = parseDate(a.last_activity_at);
      const bLast = parseDate(b.last_activity_at);
      if (aLast !== bLast) {
        if (aLast == null) return 1;
        if (bLast == null) return -1;
        return bLast - aLast;
      }
      return 0;
    };

    const dirMul = sortDir === "asc" ? 1 : -1;

    const keyCmp = (a: Lead, b: Lead): number => {
      switch (sortKey) {
        case "default":
          return defaultChain(a, b);
        case "rating":
          return cmpNumNullable(a.rating, b.rating) * dirMul;
        case "last_activity_at":
          return (
            cmpNumNullable(
              parseDate(a.last_activity_at),
              parseDate(b.last_activity_at),
            ) * dirMul
          );
        case "ppv":
          return cmpString(a.ppv, b.ppv) * dirMul;
        case "display_name":
          return cmpString(a.display_name, b.display_name) * dirMul;
        case "status":
          return cmpString(a.status, b.status) * dirMul;
        case "email":
          return cmpString(a.email, b.email) * dirMul;
        case "phone":
          return cmpString(a.phone, b.phone) * dirMul;
        case "country":
          return cmpString(a.country, b.country) * dirMul;
        case "owner":
          return cmpString(a.owner, b.owner) * dirMul;
        case "next_action":
          return cmpString(a.next_action, b.next_action) * dirMul;
        case "tags":
          return cmpString(a.tags.join(","), b.tags.join(",")) * dirMul;
      }
    };

    copy.sort((a, b) => {
      const primary = keyCmp(a, b);
      if (primary !== 0) return primary;
      return sortKey === "default" ? 0 : defaultChain(a, b);
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const updateSearch = (patch: Record<string, unknown>) => {
    navigate({
      to: "/darba-rinda",
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        ...patch,
      })) as never,
      replace: true,
    });
  };

  const setSegment = (next: Segment) =>
    updateSearch({ seg: next === "all" ? undefined : next });

  const setRatingBucket = (next: RatingBucket) =>
    updateSearch({ rb: next === "all" ? undefined : next });

  const handleSort = (k: SortKey) => {
    if (k === "default") {
      updateSearch({ sort: undefined, dir: undefined });
      return;
    }
    if (sortKey === k) {
      const nextDir = sortDir === "asc" ? "desc" : "asc";
      updateSearch({ sort: k, dir: nextDir });
    } else {
      const dirDefault: "asc" | "desc" =
        k === "rating" || k === "last_activity_at" ? "desc" : "asc";
      updateSearch({ sort: k, dir: dirDefault });
    }
  };

  const clearFilters = () =>
    updateSearch({
      status: undefined,
      owner: undefined,
      ppv: undefined,
      qq: undefined,
      q: undefined,
      seg: undefined,
      rb: undefined,
      countries: [],
      sources: [],
      owners: [],
      ppvs: [],
      tags: [],
      range: undefined,
      from: undefined,
      to: undefined,
    });

  const hasAnyFilter =
    !!selectedStatus ||
    selectedOwners.length > 0 ||
    selectedPpvs.length > 0 ||
    selectedCountries.length > 0 ||
    selectedSources.length > 0 ||
    selectedTags.length > 0 ||
    range !== "all" ||
    !!q ||
    seg !== "all" ||
    rb !== "all";

  return (
    <>
      <PageHeader
        title="Leadi"
        description="Darba saraksts pēc lead_priority_queue (reitings DESC)"
      />

      {/* Quick segments */}
      {/* Rating banners */}
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {RATING_BANNERS.map((b) => {
          const count = leads.filter((l) => passesRatingBucket(l, b.key)).length;
          const active = rb === b.key;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => setRatingBucket(active ? "all" : b.key)}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-all",
                b.cls,
                active
                  ? "ring-2 ring-offset-1 ring-offset-background ring-foreground/40 shadow-sm"
                  : "hover:brightness-105",
              )}
            >
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide opacity-80">
                  Reitings
                </div>
                <div className="text-sm font-semibold">{b.label}</div>
              </div>
              <div className="text-lg font-bold tabular-nums">{count}</div>
            </button>
          );
        })}
      </div>

      {/* Status banners */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {STATUS_BANNERS.map((b) => {
          const count = leads.filter((l) => passesSegment(l, b.key)).length;
          const active = seg === b.key;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => setSegment(active ? "all" : b.key)}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-all",
                b.cls,
                active
                  ? "ring-2 ring-offset-1 ring-offset-background ring-foreground/40 shadow-sm"
                  : "hover:brightness-105",
              )}
            >
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide opacity-80">
                  Statuss
                </div>
                <div className="text-sm font-semibold">{b.label}</div>
              </div>
              <div className="text-lg font-bold tabular-nums">{count}</div>
            </button>
          );
        })}
      </div>

      {/* Filter bar: PPV, Valsts, Statuss, Avots, Atbildīgais, Datums */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search.qq ?? ""}
            onChange={(e) => updateSearch({ qq: e.target.value || undefined })}
            placeholder="Meklēt vārds, e-pasts, telefons..."
            className="h-8 w-64 rounded-md border border-input bg-background pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {hasAnyFilter && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-xs"
            onClick={clearFilters}
          >
            <X className="h-3.5 w-3.5" />
            Notīrīt
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {sorted.length} leadi
        </span>
      </div>

      {friendlyError && (
        <div className="mb-3 rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          {friendlyError}
        </div>
      )}
      {!friendlyError && loading && <LoadingState />}

      {!friendlyError && !loading && (
        <div className="rounded-md border border-border bg-card">
          <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
          <table className="w-full table-fixed text-[11px]">
            <colgroup>
              <col style={{ width: "24px" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "70px" }} />
            </colgroup>
            <thead className="sticky top-0 z-10 border-b border-border bg-secondary text-[11px] uppercase tracking-wide text-secondary-foreground shadow-sm">
              <tr>
                <th className="w-6 px-2 py-1.5" aria-label="Izvērst" />
                <SortHeader label="PPV" k="ppv" active={sortKey} dir={sortDir} onSort={handleSort} align="center" />
                <SortHeader label="Vārds / Uzvārds" k="display_name" active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Email" k="email" active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Tags" k="tags" active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Telefons" k="phone" active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Valsts" k="country" active={sortKey} dir={sortDir} onSort={handleSort} align="center" />
                <SortHeader label="Statuss" k="status" active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Reitings" k="rating" active={sortKey} dir={sortDir} onSort={handleSort} align="center" />
                <SortHeader label="Atbildīgais" k="owner" active={sortKey} dir={sortDir} onSort={handleSort} align="center" />
                <SortHeader label="Nākamā darbība" k="next_action" active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Pēdējā saziņa" k="last_activity_at" active={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="px-2 py-1.5 text-right font-medium" aria-label="Darbības" />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-8">
                    <EmptyState />
                  </td>
                </tr>
              ) : (
                sorted.map((lead) => {
                  const isOpen = expanded.has(lead.lead_id);
                  return (
                    <Fragment key={lead.lead_id}>
                      <tr
                        onClick={() => toggleExpand(lead.lead_id)}
                        className={cn(
                          "cursor-pointer border-b border-border/60 hover:bg-secondary/30",
                          isOpen && "bg-secondary/20",
                        )}
                      >
                        <td className="px-2 py-1.5 align-middle text-muted-foreground">
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center text-foreground">
                          {lead.ppv || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-1.5 py-1.5 font-medium text-foreground">
                          {lead.display_name ? (
                            <span className="line-clamp-2 break-words leading-tight">
                              {lead.display_name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="truncate px-1.5 py-1.5">
                          {lead.email ? (
                            <a
                              href={`mailto:${lead.email}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-primary hover:underline"
                            >
                              {lead.email}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-1.5 py-1.5">
                          {lead.tags.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {normalizeTags(lead.tags).map((t) => (
                                <Tag key={t} label={t} />
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums text-foreground">
                          {lead.phone || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center text-foreground">
                          {lead.country || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {lead.status ? (
                            <span
                              className={cn(
                                "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                                statusBadgeClass(lead.status),
                              )}
                            >
                              {lead.status}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-1 py-1.5 text-center tabular-nums text-[10px] text-foreground">
                          {lead.rating != null ? (
                            lead.rating
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center text-foreground">
                          {lead.owner || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-1.5 py-1.5">
                          <div className="truncate text-foreground">
                            {lead.next_action ? (
                              <span
                                className={cn(
                                  "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                                  nextActionBadgeClass(lead.next_action),
                                )}
                              >
                                {lead.next_action}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                          {lead.follow_up_bucket && (
                            <div className="text-[11px] text-muted-foreground">
                              {lead.follow_up_bucket}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                          {(() => {
                            const t = parseDate(lead.last_activity_at);
                            if (t == null) return "—";
                            const d = new Date(t);
                            return (
                              <div className="leading-tight">
                                <div>{d.toLocaleDateString("lv-LV")}</div>
                                <div className="text-[10px]">
                                  {d.toLocaleTimeString("lv-LV", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td
                          className="px-2 py-1.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link
                            to="/lead/$leadId"
                            params={{ leadId: lead.lead_id }}
                            className="inline-flex items-center rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-secondary/50"
                          >
                            Atvērt
                          </Link>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-border bg-muted/20">
                          <td />
                          <td colSpan={12} className="p-3">
                            <ExpandedDetails lead={lead} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </>
  );
}
