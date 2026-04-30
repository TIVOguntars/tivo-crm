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
import { isEndpointMissing } from "@/lib/endpointStatus";
import type { FiltersSearch } from "@/lib/filters";
import { cn } from "@/lib/utils";

/* ----------------------- Route + search params ----------------------- */

const SORT_KEYS = [
  "default",
  "ppv",
  "full_name",
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
  "ar_reakciju",
  "hot",
  "piedavajums",
  "ligumi",
] as const;
type Segment = (typeof SEGMENTS)[number];

const searchSchema = z.object({
  status: fallback(z.string().optional(), undefined),
  owner: fallback(z.string().optional(), undefined),
  ppv: fallback(z.string().optional(), undefined),
  qq: fallback(z.string().optional(), undefined),
  seg: fallback(z.enum(SEGMENTS), "all").default("all"),
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
  full_name: string;
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
}

const PAGE_SIZE = 500;

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

/* ----------------------- Segments ----------------------- */

const NEW_STATUSES = new Set(["Jauns", "Jauns lead", "Jauns leads"]);
const UNREACHABLE_STATUSES = new Set([
  "Nesasniedzams",
  "Nesasniegts",
  "Bounced",
  "Nederīgs e-pasts",
]);
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
    case "ar_reakciju":
      return Boolean(parseDate(lead.last_reply_at));
    case "hot":
      return lead.tags.some((t) => t.toLowerCase() === "hot");
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
  ar_reakciju: "Ar reakciju",
  hot: "Hot",
  piedavajums: "Piedāvājumi",
  ligumi: "Līgumi",
};

/* ----------------------- Expanded details ----------------------- */

function ExpandedDetails({ lead }: { lead: Lead }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
      <DetailItem label="Avots" value={lead.source} />
      <DetailItem label="Iemesls" value={lead.next_action_reason} />
      <DetailItem label="Pēdējais notikums" value={lead.last_event_type} />
      <DetailItem label="Notikuma grupa" value={lead.last_event_group} />
      <DetailItem label="Pēdējais kanāls" value={lead.last_channel} />
      <DetailItem
        label="Pēdējā izejošā"
        value={lead.last_outbound_at ? fmtDateTime(lead.last_outbound_at) : ""}
      />
      <DetailItem
        label="Pēdējā atbilde"
        value={lead.last_reply_at ? fmtDateTime(lead.last_reply_at) : ""}
      />
      <DetailItem
        label="Plānotais būvniecības datums"
        value={lead.planned_build_date ? fmtDate(lead.planned_build_date) : ""}
      />
      <DetailItem label="Follow-up bucket" value={lead.follow_up_bucket} />
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
    sort?: SortKey;
    dir?: "asc" | "desc";
  };
  const navigate = useNavigate();

  const q = (search.qq ?? "").trim().toLowerCase();
  const selectedStatus = search.status;
  const selectedOwner = search.owner;
  const selectedPpv = search.ppv;
  const selectedCountry = (search.countries ?? [])[0];
  const selectedSource = (search.sources ?? [])[0];
  const range: DateRangePreset = (search.range as DateRangePreset) ?? "all";
  const seg: Segment = search.seg ?? "all";
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

  /* Primary datasource: analytics.lead_priority_queue. */
  const overviewQuery = useMemo(
    () =>
      [
        "select=*",
        "order=reitings.desc.nullslast,last_activity_at.desc.nullslast",
        `limit=${PAGE_SIZE}`,
      ].join("&"),
    [],
  );

  const overview = useAnalyticsView("lead_priority_queue", overviewQuery);

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
          full_name: s(r.full_name),
          email: s(r.email),
          phone: s(r.phone),
          country: s(r.country),
          source: s(r.source),
          status: s(r.status),
          owner: s(r.owner),
          ppv: s(r.ppv_vards),
          next_action: s(r.next_action),
          next_action_reason: s(r.next_action_reason),
          tags: asTags(r.tags),
          rating: parseRating(r.reitings),
          last_activity_at: s(r.last_activity_at) || null,
          last_event_type: s(r.last_event_type),
          last_event_group: s(r.last_event_group),
          last_channel: s(r.last_channel),
          last_outbound_at: s(r.last_outbound_at) || null,
          last_reply_at: s(r.last_reply_at) || null,
          planned_build_date: s(r.planned_build_date) || null,
          follow_up_bucket: s(r.follow_up_bucket),
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
      if (selectedOwner && l.owner !== selectedOwner) return false;
      if (selectedPpv && l.ppv !== selectedPpv) return false;
      if (selectedCountry && l.country !== selectedCountry) return false;
      if (selectedSource && l.source !== selectedSource) return false;
      if (fromTs != null || toTs != null) {
        const t = parseDate(l.last_activity_at);
        if (t == null) return false;
        if (fromTs != null && t < fromTs) return false;
        if (toTs != null && t > toTs) return false;
      }
      if (!passesSegment(l, seg)) return false;
      if (q) {
        const hay = `${l.full_name} ${l.email} ${l.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    leads,
    selectedStatus,
    selectedOwner,
    selectedPpv,
    selectedCountry,
    selectedSource,
    seg,
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
        case "full_name":
          return cmpString(a.full_name, b.full_name) * dirMul;
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
      seg: undefined,
      countries: [],
      sources: [],
      range: undefined,
      from: undefined,
      to: undefined,
    });

  const hasAnyFilter =
    !!selectedStatus ||
    !!selectedOwner ||
    !!selectedPpv ||
    !!selectedCountry ||
    !!selectedSource ||
    range !== "all" ||
    !!q ||
    seg !== "all";

  return (
    <>
      <PageHeader
        title="Leadi"
        description="Darba saraksts pēc lead_priority_queue (reitings DESC)"
      />

      {/* Quick segments */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {SEGMENTS.map((sg) => (
          <button
            key={sg}
            type="button"
            onClick={() => setSegment(sg)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              seg === sg
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
            )}
          >
            {SEGMENT_LABELS[sg]}
          </button>
        ))}
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

        <select
          value={selectedPpv ?? ""}
          onChange={(e) => updateSearch({ ppv: e.target.value || undefined })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Visi PPV</option>
          {options.ppvs.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          value={selectedCountry ?? ""}
          onChange={(e) =>
            updateSearch({ countries: e.target.value ? [e.target.value] : [] })
          }
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Visas valstis</option>
          {options.countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={selectedStatus ?? ""}
          onChange={(e) => updateSearch({ status: e.target.value || undefined })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Visi statusi</option>
          {options.statuses.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>

        <select
          value={selectedSource ?? ""}
          onChange={(e) =>
            updateSearch({ sources: e.target.value ? [e.target.value] : [] })
          }
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Visi avoti</option>
          {options.sources.map((s2) => (
            <option key={s2} value={s2}>
              {s2}
            </option>
          ))}
        </select>

        <select
          value={selectedOwner ?? ""}
          onChange={(e) => updateSearch({ owner: e.target.value || undefined })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Visi atbildīgie</option>
          {options.owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <select
          value={range}
          onChange={(e) =>
            updateSearch({
              range: e.target.value === "all" ? undefined : e.target.value,
            })
          }
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">Visi datumi</option>
          <option value="today">Šodien</option>
          <option value="yesterday">Vakar</option>
          <option value="7d">Pēdējās 7 dienas</option>
          <option value="30d">Pēdējās 30 dienas</option>
          <option value="this_month">Šis mēnesis</option>
        </select>

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
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-[1200px] text-xs">
            <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-6 px-2 py-1.5" aria-label="Izvērst" />
                <SortHeader label="PPV" k="ppv" active={sortKey} dir={sortDir} onSort={handleSort} align="center" />
                <SortHeader label="Vārds" k="full_name" active={sortKey} dir={sortDir} onSort={handleSort} />
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
                        <td className="max-w-[180px] truncate px-2 py-1.5 font-medium text-foreground">
                          {lead.full_name || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="max-w-[200px] truncate px-2 py-1.5">
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
                        <td className="max-w-[160px] px-2 py-1.5">
                          {lead.tags.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {lead.tags.map((t) => (
                                <span
                                  key={t}
                                  className={cn(
                                    "rounded px-1.5 py-0.5 text-[10px]",
                                    t.toLowerCase() === "hot"
                                      ? "bg-destructive/15 text-destructive"
                                      : "bg-secondary text-secondary-foreground",
                                  )}
                                >
                                  {t}
                                </span>
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
                        <td className="px-2 py-1.5 text-center tabular-nums text-foreground">
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
                        <td className="max-w-[220px] px-2 py-1.5">
                          <div className="truncate text-foreground">
                            {lead.next_action || (
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
                          {fmtDateTime(lead.last_activity_at)}
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
                            Atvērt Lead 360
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
      )}
    </>
  );
}
