import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  Flame,
  Mail,
  MapPin,
  Phone,
  Tag as TagIcon,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { SearchInput } from "@/components/SearchInput";
import { LoadingState, EmptyState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import { isEndpointMissing } from "@/lib/endpointStatus";
import type { FiltersSearch } from "@/lib/filters";
import { cn } from "@/lib/utils";

/* ----------------------- Route + search params ----------------------- */

const SEGMENTS = [
  "all",
  "jauni",
  "nesasniedzami",
  "ar_reakciju",
  "hot",
  "nokaveti",
  "piedavajums",
  "ligumi",
] as const;
type Segment = (typeof SEGMENTS)[number];

const searchSchema = z.object({
  status: fallback(z.string().optional(), undefined),
  seg: fallback(z.enum(SEGMENTS), "all").default("all"),
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
  next_action_due_date: string | null;
  last_contact_date: string | null;
  automation_step: string;
  automation_date: string | null;
  tags: string[];
  lead_created_at: string | null;
  cancel_reason: string;
  rating: string;
}

const PAGE_SIZE = 200;

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

const MS_DAY = 24 * 60 * 60 * 1000;

/* ----------------------- Status colors ----------------------- */

type StatusTone = {
  cls: string;
};

function statusTone(status: string): StatusTone {
  const k = status.toLowerCase().trim();
  if (!k) return { cls: "bg-muted text-muted-foreground" };
  if (k.startsWith("jauns"))
    return { cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" };
  if (
    k.startsWith("nesasniedz") ||
    k.startsWith("nesasniegts") ||
    k.includes("bounce") ||
    k.includes("nederīg")
  )
    return { cls: "bg-muted text-muted-foreground" };
  if (k.startsWith("piesaist"))
    return {
      cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    };
  if (k.startsWith("nekvalific"))
    return { cls: "bg-destructive/15 text-destructive" };
  if (k.startsWith("piedāv") || k.startsWith("piedav"))
    return {
      cls: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
    };
  if (k.startsWith("līgum") || k.startsWith("ligum") || k.includes("contract"))
    return {
      cls: "bg-emerald-700/20 text-emerald-800 dark:text-emerald-200",
    };
  return { cls: "bg-secondary text-secondary-foreground" };
}

function isOverdue(due: string | null): boolean {
  const t = parseDate(due);
  return t != null && t < Date.now();
}

function isSoon(due: string | null): boolean {
  const t = parseDate(due);
  if (t == null) return false;
  const diff = t - Date.now();
  return diff >= 0 && diff < MS_DAY * 2;
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
      return Boolean(parseDate(lead.last_contact_date));
    case "hot":
      return lead.tags.some((t) => t.toLowerCase() === "hot");
    case "nokaveti":
      return isOverdue(lead.next_action_due_date);
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
  nokaveti: "Nokavēti",
  piedavajums: "Piedāvājumi",
  ligumi: "Līgumi",
};

/* ----------------------- Multi-select popover ----------------------- */

function MultiPopover({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = new Set(value);
  const summary =
    value.length === 0
      ? label
      : value.length === 1
        ? `${label}: ${value[0]}`
        : `${label} (${value.length})`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 text-xs font-normal",
            value.length > 0 && "border-primary text-foreground",
          )}
        >
          <span className="max-w-[160px] truncate">{summary}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-medium">{label}</span>
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Notīrīt
            </button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {options.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nav opciju
            </div>
          ) : (
            options.map((opt) => {
              const checked = selected.has(opt);
              return (
                <label
                  key={opt}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-secondary/60"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(c) => {
                      const next = new Set(selected);
                      if (c) next.add(opt);
                      else next.delete(opt);
                      onChange(Array.from(next));
                    }}
                  />
                  <span className="truncate">{opt}</span>
                </label>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ----------------------- Single status select popover ----------------------- */

function StatusPopover({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 text-xs font-normal",
            value && "border-primary text-foreground",
          )}
        >
          <span className="max-w-[160px] truncate">
            {value ? `Statuss: ${value}` : "Statuss"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-medium">Statuss</span>
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Notīrīt
            </button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt === value ? undefined : opt);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs hover:bg-secondary/60",
                opt === value && "bg-secondary/60 font-medium",
              )}
            >
              <span className="truncate">{opt}</span>
              {opt === value && <span className="text-primary">✓</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ----------------------- Lead row ----------------------- */

function LeadRow({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const tone = statusTone(lead.status);
  const overdue = isOverdue(lead.next_action_due_date);
  const soon = isSoon(lead.next_action_due_date);
  const hot = lead.tags.some((t) => t.toLowerCase() === "hot");

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="group flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-secondary/30 sm:flex-row sm:items-start sm:gap-4">
        {/* Left: expand toggle + identity */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 min-w-0 items-start gap-3 text-left"
          aria-expanded={open}
        >
          <span className="mt-1 inline-flex h-5 w-5 flex-none items-center justify-center rounded text-muted-foreground group-hover:text-foreground">
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            {/* Main line */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-foreground">
                {lead.full_name || "—"}
              </span>
              {lead.status && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    tone.cls,
                  )}
                >
                  {lead.status}
                </span>
              )}
              {hot && (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
                  <Flame className="h-3 w-3" />
                  Hot
                </span>
              )}
              {overdue && (
                <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
                  Nokavēts
                </span>
              )}
            </div>

            {/* Second line */}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {lead.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  <a
                    href={`mailto:${lead.email}`}
                    onClick={(e) => e.stopPropagation()}
                    className="truncate hover:text-foreground hover:underline"
                  >
                    {lead.email}
                  </a>
                </span>
              )}
              {lead.phone && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Phone className="h-3 w-3" />
                  {lead.phone}
                </span>
              )}
              {lead.country && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {lead.country}
                </span>
              )}
              {lead.source && (
                <span className="inline-flex items-center gap-1">
                  <TagIcon className="h-3 w-3" />
                  {lead.source}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Right side: meta */}
        <div className="flex flex-none flex-col items-start gap-1 text-xs sm:items-end">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
            {lead.owner && (
              <span>
                <span className="text-muted-foreground/70">Atb.:</span>{" "}
                <span className="text-foreground">{lead.owner}</span>
              </span>
            )}
            {lead.ppv && (
              <span>
                <span className="text-muted-foreground/70">PPV:</span>{" "}
                <span className="text-foreground">{lead.ppv}</span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {lead.next_action && (
              <span className="text-foreground">{lead.next_action}</span>
            )}
            <span
              className={cn(
                "tabular-nums",
                overdue
                  ? "font-medium text-destructive"
                  : soon
                    ? "font-medium text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground",
              )}
            >
              {fmtDate(lead.next_action_due_date)}
            </span>
          </div>
          <Link
            to="/lead/$leadId"
            params={{ leadId: lead.lead_id }}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-secondary/50"
            title="Atvērt Lead 360"
          >
            <Eye className="h-3 w-3" />
            Atvērt Lead 360
          </Link>
        </div>
      </div>

      {/* Expanded details */}
      {open && (
        <div className="border-t border-border bg-muted/20 px-4 py-3">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Automatizācija" value={lead.automation_step} />
            <Detail
              label="Automatizācijas datums"
              value={fmtDate(lead.automation_date)}
              raw={lead.automation_date}
            />
            <Detail
              label="Pēdējā saziņa"
              value={fmtDateTime(lead.last_contact_date)}
              raw={lead.last_contact_date}
            />
            <Detail label="Atcelšanas iemesls" value={lead.cancel_reason} />
            <Detail label="Reitings" value={lead.rating} />
            <div>
              <dt className="text-muted-foreground">Tags</dt>
              <dd className="mt-0.5">
                {lead.tags.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {lead.tags.map((t) => (
                      <span
                        key={t}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px]",
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
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  raw,
}: {
  label: string;
  value: string;
  raw?: string | null;
}) {
  const empty = !value || value === "—" || (raw !== undefined && !raw);
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-0.5",
          empty ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {empty ? "—" : value}
      </dd>
    </div>
  );
}

/* ----------------------- Page ----------------------- */

function DarbaRindaPage() {
  const search = Route.useSearch() as FiltersSearch & {
    status?: string;
    seg: Segment;
  };
  const navigate = useNavigate();

  const q = (search.q ?? "").trim().toLowerCase();
  const selectedCountries = search.countries ?? [];
  const selectedSources = search.sources ?? [];
  const selectedOwners = search.owners ?? [];
  const selectedPpvs = search.ppvs ?? [];
  const selectedTags = search.tags ?? [];
  const selectedStatus = search.status;
  const seg: Segment = search.seg ?? "all";

  /* Pull a wide page of overview rows; client-side filters/sort. */
  const overviewQuery = useMemo(() => {
    return [
      "select=*",
      "order=lead_created_at.desc.nullslast",
      `limit=${PAGE_SIZE}`,
    ].join("&");
  }, []);

  const overview = useAnalyticsView("leads_overview", overviewQuery);
  const filterOptions = useAnalyticsView("filter_options", "limit=1");

  const rawError =
    (overview.error as Error | null)?.message || overview.data?.error;
  const friendlyError = rawError
    ? isEndpointMissing(rawError)
      ? "Datu skats vēl tiek sagatavots."
      : "Datus pašlaik nevar ielādēt. Mēģiniet vēlāk."
    : null;
  const loading = overview.isLoading;

  /* Map rows to typed leads */
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
          phone: s(r.phone_raw || r.phone_e164),
          country: s(r.country),
          source: s(r.source),
          status: s(r.status),
          owner: s(r.owner),
          ppv: s(r.ppv_vards),
          next_action: s(r.next_action),
          next_action_due_date: s(r.next_action_due_date) || null,
          last_contact_date: s(r.last_contact_date) || null,
          automation_step: s(r.automation_step),
          automation_date: s(r.automation_date) || null,
          tags: asTags(r.tags),
          lead_created_at: s(r.lead_created_at) || null,
          cancel_reason: s(
            r.cancel_reason ?? r.cancellation_reason ?? r.atcelšanas_iemesls,
          ),
          rating: s(r.rating ?? r.lead_rating ?? r.reitings),
        } as Lead;
      })
      .filter((x): x is Lead => x !== null);
  }, [overview.data]);

  /* Filter options from the dataset itself (fallback for filter_options). */
  const options = useMemo(() => {
    const fo = (filterOptions.data?.rows ?? [])[0] as Row | undefined;

    const fromArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.map(String).filter(Boolean) : [];

    const dedupe = (arr: string[]) =>
      Array.from(new Set(arr.filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "lv"),
      );

    return {
      statuses: dedupe(
        fromArray(fo?.statuses).length > 0
          ? fromArray(fo?.statuses)
          : leads.map((l) => l.status),
      ),
      countries: dedupe(
        fromArray(fo?.countries).length > 0
          ? fromArray(fo?.countries)
          : leads.map((l) => l.country),
      ),
      sources: dedupe(
        fromArray(fo?.sources).length > 0
          ? fromArray(fo?.sources)
          : leads.map((l) => l.source),
      ),
      owners: dedupe(
        fromArray(fo?.owners).length > 0
          ? fromArray(fo?.owners)
          : leads.map((l) => l.owner),
      ),
      ppvs: dedupe(
        fromArray(fo?.ppvs).length > 0
          ? fromArray(fo?.ppvs)
          : leads.map((l) => l.ppv),
      ),
      tags: dedupe(leads.flatMap((l) => l.tags)),
    };
  }, [filterOptions.data, leads]);

  /* Apply filters + segment + search */
  const filtered = useMemo(() => {
    const tagSel = selectedTags.map((t) => t.toLowerCase());

    return leads.filter((l) => {
      if (selectedStatus && l.status !== selectedStatus) return false;
      if (selectedCountries.length && !selectedCountries.includes(l.country))
        return false;
      if (selectedSources.length && !selectedSources.includes(l.source))
        return false;
      if (selectedOwners.length && !selectedOwners.includes(l.owner))
        return false;
      if (selectedPpvs.length && !selectedPpvs.includes(l.ppv)) return false;

      if (tagSel.length) {
        const lower = l.tags.map((t) => t.toLowerCase());
        if (!tagSel.every((t) => lower.includes(t))) return false;
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
    selectedCountries,
    selectedSources,
    selectedOwners,
    selectedPpvs,
    selectedTags,
    seg,
    q,
  ]);

  /* Sort: overdue first → due asc nullslast → last_contact_date asc → lead_created_at desc */
  const sorted = useMemo(() => {
    const copy = [...filtered];
    const now = Date.now();
    copy.sort((a, b) => {
      const aDue = parseDate(a.next_action_due_date);
      const bDue = parseDate(b.next_action_due_date);
      const aOver = aDue != null && aDue < now ? 1 : 0;
      const bOver = bDue != null && bDue < now ? 1 : 0;
      if (aOver !== bOver) return bOver - aOver;

      if (aDue !== bDue) {
        if (aDue == null) return 1;
        if (bDue == null) return -1;
        if (aDue !== bDue) return aDue - bDue;
      }
      const aLast = parseDate(a.last_contact_date);
      const bLast = parseDate(b.last_contact_date);
      if (aLast !== bLast) {
        if (aLast == null) return 1;
        if (bLast == null) return -1;
        if (aLast !== bLast) return aLast - bLast;
      }
      const aCreated = parseDate(a.lead_created_at) ?? 0;
      const bCreated = parseDate(b.lead_created_at) ?? 0;
      return bCreated - aCreated;
    });
    return copy;
  }, [filtered]);

  const setSegment = (next: Segment) => {
    navigate({
      to: "/darba-rinda",
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        seg: next === "all" ? undefined : next,
      })) as never,
      replace: true,
    });
  };

  const setStatus = (next: string | undefined) => {
    navigate({
      to: "/darba-rinda",
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        status: next || undefined,
      })) as never,
      replace: true,
    });
  };

  const setMulti = (
    key: "countries" | "sources" | "owners" | "ppvs" | "tags",
    value: string[],
  ) => {
    navigate({
      to: "/darba-rinda",
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        [key]: value.length ? value : [],
      })) as never,
      replace: true,
    });
  };

  const clearFilters = () => {
    navigate({
      to: "/darba-rinda",
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        status: undefined,
        countries: [],
        sources: [],
        owners: [],
        ppvs: [],
        tags: [],
        seg: undefined,
        q: undefined,
      })) as never,
      replace: true,
    });
  };

  const hasAnyFilter =
    !!selectedStatus ||
    selectedCountries.length > 0 ||
    selectedSources.length > 0 ||
    selectedOwners.length > 0 ||
    selectedPpvs.length > 0 ||
    selectedTags.length > 0 ||
    seg !== "all" ||
    !!q;

  return (
    <>
      <PageHeader
        title="Leadi"
        description="Darba saraksts no Supabase datiem"
      >
        <SearchInput />
      </PageHeader>

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

      {/* Compact filter toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusPopover
          options={options.statuses}
          value={selectedStatus}
          onChange={setStatus}
        />
        <MultiPopover
          label="Atbildīgais"
          options={options.owners}
          value={selectedOwners}
          onChange={(v) => setMulti("owners", v)}
        />
        <MultiPopover
          label="PPV"
          options={options.ppvs}
          value={selectedPpvs}
          onChange={(v) => setMulti("ppvs", v)}
        />
        <MultiPopover
          label="Valsts"
          options={options.countries}
          value={selectedCountries}
          onChange={(v) => setMulti("countries", v)}
        />
        <MultiPopover
          label="Avots"
          options={options.sources}
          value={selectedSources}
          onChange={(v) => setMulti("sources", v)}
        />
        <MultiPopover
          label="Tags"
          options={options.tags}
          value={selectedTags}
          onChange={(v) => setMulti("tags", v)}
        />
        {hasAnyFilter && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-xs"
            onClick={clearFilters}
          >
            <X className="h-3.5 w-3.5" />
            Notīrīt filtrus
          </Button>
        )}
      </div>

      {friendlyError && (
        <div className="mb-3 rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          {friendlyError}
        </div>
      )}
      {!friendlyError && loading && <LoadingState />}

      {!friendlyError && !loading && (
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Leadi{" "}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  ({sorted.length})
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Vispirms nokavētie, tad pēc termiņa, pēdējās saziņas un izveides.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              Rāda pirmos {PAGE_SIZE}
            </span>
          </header>

          {sorted.length === 0 ? (
            <div className="p-8">
              <EmptyState />
            </div>
          ) : (
            <div>
              {sorted.map((lead) => (
                <LeadRow key={lead.lead_id} lead={lead} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
