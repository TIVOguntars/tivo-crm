import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useCallback } from "react";
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
  X,
  Search,
  AlertTriangle,
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
import { LeadDrawer } from "@/components/LeadDrawer";
import { BulkActionsBar, type BulkPatch } from "@/components/BulkActionsBar";
import { useCrmView } from "@/hooks/useCrmView";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import { cn } from "@/lib/utils";
import type { FiltersSearch } from "@/lib/filters";

/* ----------------------- Saved views ----------------------- */

const VIEWS = [
  "all",
  "mani",
  "jauni",
  "sodien",
  "bez_kontakta",
  "karstie",
  "konflikti",
] as const;
type View = (typeof VIEWS)[number];

const VIEW_LABELS: Record<View, string> = {
  all: "Visi",
  mani: "Mani",
  jauni: "Jauni",
  sodien: "Šodien",
  bez_kontakta: "Bez kontakta",
  karstie: "Karstie",
  konflikti: "Konflikti",
};

const leadiSearchSchema = z.object({
  seg: fallback(z.enum(VIEWS), "all").default("all"),
  status: fallback(z.array(z.string()), []).default([]),
  q: fallback(z.string().optional(), undefined),
  countries: fallback(z.array(z.string()), []).default([]),
  sources: fallback(z.array(z.string()), []).default([]),
  owners: fallback(z.array(z.string()), []).default([]),
  ppvs: fallback(z.array(z.string()), []).default([]),
  tags: fallback(z.array(z.string()), []).default([]),
});

export const Route = createFileRoute("/leadi")({
  validateSearch: zodValidator(leadiSearchSchema),
  component: LeadiPage,
});

/* ----------------------- Types & helpers ----------------------- */

type Row = Record<string, unknown>;
const PAGE_SIZE = 300;

interface Lead {
  lead_id: string;
  name: string;
  phone: string;
  email: string;
  country: string;
  secondary: string;
  source: string;
  status: string;
  owner: string;
  ppv: string;
  next_action: string;
  next_action_due: string | null;
  last_activity: string | null;
  tags: string[];
  created_at: string | null;
  unread_replies: number;
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
function initials(name: string): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "—";
}

const MS_MIN = 60_000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;

function relativeTime(v: string | null): string {
  const t = parseDate(v);
  if (t == null) return "—";
  const diff = Date.now() - t;
  if (diff < 0) {
    const ahead = -diff;
    if (ahead < MS_HOUR) return `pēc ${Math.max(1, Math.round(ahead / MS_MIN))}m`;
    if (ahead < MS_DAY) return `pēc ${Math.round(ahead / MS_HOUR)}h`;
    return `pēc ${Math.round(ahead / MS_DAY)}d`;
  }
  if (diff < 5 * MS_MIN) return "tikko";
  if (diff < MS_HOUR) return `pirms ${Math.round(diff / MS_MIN)}m`;
  if (diff < 6 * MS_HOUR) return `pirms ${Math.round(diff / MS_HOUR)}h`;
  const now = new Date();
  const then = new Date(t);
  const sameDay =
    now.getFullYear() === then.getFullYear() &&
    now.getMonth() === then.getMonth() &&
    now.getDate() === then.getDate();
  if (sameDay) return "šodien";
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  const isYest =
    yest.getFullYear() === then.getFullYear() &&
    yest.getMonth() === then.getMonth() &&
    yest.getDate() === then.getDate();
  if (isYest) return "vakar";
  const days = Math.round(diff / MS_DAY);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mēn`;
  return `${Math.round(days / 365)}g`;
}

function isSameDay(t: number, now = Date.now()): boolean {
  const a = new Date(t);
  const b = new Date(now);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/* ----------------------- Status badge ----------------------- */

function statusTone(status: string): string {
  const k = status.toLowerCase();
  if (!k) return "bg-muted text-muted-foreground border-transparent";
  if (k.includes("jauns"))
    return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30";
  if (k.includes("līgum") || k.includes("ligum") || k.includes("won") || k.includes("contract"))
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  if (k.includes("piedāvāj") || k.includes("piedavaj") || k.includes("pieprasīj") || k.includes("pieprasij"))
    return "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30";
  if (k.includes("sarunās") || k.includes("sarunas") || k.includes("aktīv") || k.includes("aktiv"))
    return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  if (k.includes("nesasn") || k.includes("bounce") || k.includes("nederīg") || k.includes("zaud"))
    return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";
  if (k.includes("konflikt"))
    return "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30";
  return "bg-secondary text-secondary-foreground border-transparent";
}

function StatusBadge({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded border px-1.5 text-[11px] font-medium leading-none",
        statusTone(value),
      )}
    >
      {value}
    </span>
  );
}

/* ----------------------- Filter chip popover ----------------------- */

function FilterChip({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
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
  const toggle = (opt: string) => {
    if (value.includes(opt)) onChange(value.filter((v) => v !== opt));
    else onChange([...value, opt]);
  };
  const active = value.length > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors",
            active
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-border bg-background text-foreground hover:bg-muted/50",
          )}
        >
          <span className="font-medium">{label}</span>
          {active && (
            <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {value.length}
            </span>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Meklēt: ${label.toLowerCase()}`}
              className="h-7 w-full rounded border border-input bg-background pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              Nav rezultātu
            </div>
          ) : (
            filtered.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs hover:bg-muted/50"
              >
                <Checkbox
                  checked={value.includes(opt)}
                  onCheckedChange={() => toggle(opt)}
                  className="h-3.5 w-3.5"
                />
                <span className="truncate text-foreground">{opt}</span>
              </label>
            ))
          )}
        </div>
        {active && (
          <div className="border-t border-border p-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-full justify-center text-xs"
              onClick={() => onChange([])}
            >
              Notīrīt
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ----------------------- Page ----------------------- */

function LeadiPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const seg: View = (search.seg as View) ?? "all";
  const q = (search.q ?? "").trim().toLowerCase();
  const fStatus = (search.status ?? []) as string[];
  const fOwners = (search.owners ?? []) as string[];
  const fPpvs = (search.ppvs ?? []) as string[];
  const fCountries = (search.countries ?? []) as string[];
  const fTags = (search.tags ?? []) as string[];

  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Optimistic per-row patches keyed by lead_id; applied after server data
  // resolves, so drawer mutations reflect immediately without table reload.
  const [patches, setPatches] = useState<Record<string, Partial<Lead>>>({});

  const overviewQuery = useMemo(
    () =>
      ["select=*", "order=created_at.desc.nullslast", `limit=${PAGE_SIZE}`].join(
        "&",
      ),
    [],
  );

  const overview = useCrmView(
    "next_action_queue_display_enriched",
    overviewQuery,
  );
  const filterOptions = useAnalyticsView("filter_options", "limit=1");

  const errorMsg =
    (overview.error as Error | null)?.message || overview.data?.error;
  const loading = overview.isLoading;

  const leads = useMemo<Lead[]>(() => {
    const rows = (overview.data?.rows ?? []) as Row[];
    return rows
      .map((r) => {
        const id = s(r.lead_id);
        if (!id) return null;
        const phone = s(
          r.phone_e164 || r.telefons_e164 || r.telefons_raw || r.phone_raw,
        );
        const email = s(r.email_normalized || r.email);
        const country = s(r.country);
        const secondary = phone || email || country;
        const next_action_due =
          s(r.effective_due_at) || s(r.visible_action_due_at) || null;
        const next_action =
          s(r.action_label) ||
          s(r.nakama_darbiba) ||
          s(r.visible_action) ||
          s(r.next_action);
        const last_activity =
          s(r.last_contact_date) ||
          s(r.last_communication_at) ||
          s(r.updated_at) ||
          null;
        return {
          lead_id: id,
          name: leadDisplayName(r),
          phone,
          email,
          country,
          secondary,
          source: s(r.source),
          status: s(r.lead_status_label || r.status),
          owner: s(r.visible_action_owner || r.owner),
          ppv: s(r.ppv_name || r.ppv_vards),
          next_action,
          next_action_due,
          last_activity,
          tags: asTags(r.tags),
          created_at: s(r.created_at) || null,
          unread_replies: Number(r.unread_replies ?? r.unread_count ?? 0) || 0,
        } as Lead;
      })
      .filter((x): x is Lead => x !== null);
  }, [overview.data]);

  // Apply optimistic patches on top of server data
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
      statuses: dedupe(
        fromArr(fo?.statuses).length
          ? fromArr(fo?.statuses)
          : leadsPatched.map((l) => l.status),
      ),
      countries: dedupe(
        fromArr(fo?.countries).length
          ? fromArr(fo?.countries)
          : leadsPatched.map((l) => l.country),
      ),
      owners: dedupe(
        fromArr(fo?.owners).length
          ? fromArr(fo?.owners)
          : leadsPatched.map((l) => l.owner),
      ),
      ppvs: dedupe(
        fromArr(fo?.ppvs).length ? fromArr(fo?.ppvs) : leads.map((l) => l.ppv),
      ),
      tags: dedupe(leadsPatched.flatMap((l) => l.tags)),
    };
  }, [filterOptions.data, leads, leadsPatched]);

  const filtered = useMemo(() => {
    const tagsLower = fTags.map((t) => t.toLowerCase());
    return leadsPatched.filter((l) => {
      if (fStatus.length && !fStatus.includes(l.status)) return false;
      if (fOwners.length && !fOwners.includes(l.owner)) return false;
      if (fPpvs.length && !fPpvs.includes(l.ppv)) return false;
      if (fCountries.length && !fCountries.includes(l.country)) return false;
      if (tagsLower.length) {
        const lower = l.tags.map((t) => t.toLowerCase());
        if (!tagsLower.every((t) => lower.includes(t))) return false;
      }
      // segments
      switch (seg) {
        case "all":
          break;
        case "mani":
          // No identity context — treat as no filter rather than fake data
          break;
        case "jauni":
          if (!/jauns/i.test(l.status)) return false;
          break;
        case "sodien": {
          const t = parseDate(l.created_at);
          if (t == null || !isSameDay(t)) return false;
          break;
        }
        case "bez_kontakta":
          if (parseDate(l.last_activity) != null) return false;
          break;
        case "karstie":
          if (
            !l.tags.some((t) => /^(hot|karst)/i.test(t)) &&
            !/karst/i.test(l.status)
          )
            return false;
          break;
        case "konflikti":
          if (
            !l.tags.some((t) => /konflikt/i.test(t)) &&
            !/konflikt/i.test(l.status)
          )
            return false;
          break;
      }
      if (q) {
        const hay =
          `${l.name} ${l.email} ${l.phone} ${l.next_action}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leadsPatched, fStatus, fOwners, fPpvs, fCountries, fTags, seg, q]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const aDue = parseDate(a.next_action_due);
      const bDue = parseDate(b.next_action_due);
      if (aDue !== bDue) {
        if (aDue == null) return 1;
        if (bDue == null) return -1;
        return aDue - bDue;
      }
      const aL = parseDate(a.last_activity) ?? 0;
      const bL = parseDate(b.last_activity) ?? 0;
      return bL - aL;
    });
    return copy;
  }, [filtered]);

  const setSearch = useCallback(
    (patch: Record<string, unknown>) => {
      navigate({
        to: "/leadi",
        search: ((prev: Record<string, unknown>) => ({ ...prev, ...patch })) as never,
        replace: true,
      });
    },
    [navigate],
  );

  const clearFilters = () =>
    setSearch({
      seg: undefined,
      status: [],
      countries: [],
      owners: [],
      ppvs: [],
      tags: [],
      q: undefined,
    });

  const hasAnyFilter =
    seg !== "all" ||
    fStatus.length > 0 ||
    fOwners.length > 0 ||
    fPpvs.length > 0 ||
    fCountries.length > 0 ||
    fTags.length > 0 ||
    !!q;

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

  const openLead = (id: string) => {
    setDrawerLeadId(id);
    setDrawerOpen(true);
  };

  const patchLead = useCallback((id: string, patch: Partial<Lead>) => {
    setPatches((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const patchMany = useCallback(
    (ids: string[], patch: BulkPatch) => {
      setPatches((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          next[id] = { ...next[id], ...(patch as Partial<Lead>) };
        });
        return next;
      });
    },
    [],
  );

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

  const bumpActivity = useCallback(
    (id: string) => patchLead(id, { last_activity: new Date().toISOString() }),
    [patchLead],
  );

  return (
    <TooltipProvider delayDuration={150}>
      {/* Page header */}
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Leadi
          </h1>
          <p className="text-xs text-muted-foreground">
            Operacionālā leadu darba vide
          </p>
        </div>
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

      {/* Sticky operational bar */}
      <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          {/* Saved views */}
          <div className="flex flex-wrap items-center gap-1">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setSearch({ seg: v === "all" ? undefined : v })}
                className={cn(
                  "h-7 rounded-md border px-2.5 text-xs transition-colors",
                  seg === v
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted/50",
                )}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          <div className="mx-1 h-5 w-px bg-border" aria-hidden />

          {/* Search */}
          <div className="relative min-w-[260px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search.q ?? ""}
              onChange={(e) => setSearch({ q: e.target.value || undefined })}
              placeholder="Meklēt pēc vārda, telefona, email vai objekta"
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <FilterChip
              label="Statuss"
              options={options.statuses}
              value={fStatus}
              onChange={(v) => setSearch({ status: v })}
            />
            <FilterChip
              label="Atbildīgais"
              options={options.owners}
              value={fOwners}
              onChange={(v) => setSearch({ owners: v })}
            />
            <FilterChip
              label="PPV"
              options={options.ppvs}
              value={fPpvs}
              onChange={(v) => setSearch({ ppvs: v })}
            />
            <FilterChip
              label="Valsts"
              options={options.countries}
              value={fCountries}
              onChange={(v) => setSearch({ countries: v })}
            />
            <FilterChip
              label="Tags"
              options={options.tags}
              value={fTags}
              onChange={(v) => setSearch({ tags: v })}
            />
            {hasAnyFilter && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-xs"
                onClick={clearFilters}
              >
                <X className="h-3 w-3" />
                Notīrīt
              </Button>
            )}
          </div>

          {selected.size === 0 && (
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
              >
                <Columns3 className="h-3.5 w-3.5" />
                Kolonnas
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <BulkActionsBar
          selectedIds={Array.from(selected)}
          options={{
            statuses: options.statuses,
            owners: options.owners,
            ppvs: options.ppvs,
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
              {hasAnyFilter && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={clearFilters}
                >
                  Notīrīt filtrus
                </Button>
              )}
            </div>
          ) : (
            <div className="max-h-[calc(100vh-220px)] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <tr className="border-b border-border">
                    <th className="w-8 px-2 py-2">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={toggleAll}
                        className="h-3.5 w-3.5"
                      />
                    </th>
                    <th className="px-2 py-2 text-left font-medium">Lead</th>
                    <th className="px-2 py-2 text-left font-medium">Statuss</th>
                    <th className="px-2 py-2 text-left font-medium">
                      Atbildīgais
                    </th>
                    <th className="px-2 py-2 text-left font-medium">PPV</th>
                    <th className="px-2 py-2 text-left font-medium">
                      Nākamā darbība
                    </th>
                    <th className="px-2 py-2 text-left font-medium">
                      Pēdējā aktivitāte
                    </th>
                    <th className="px-2 py-2 text-left font-medium">Tags</th>
                    <th
                      className="w-[120px] px-2 py-2 text-right font-medium"
                      aria-label="Darbības"
                    />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((l) => {
                    const isSel = selected.has(l.lead_id);
                    const isActive = drawerOpen && drawerLeadId === l.lead_id;
                    const dueT = parseDate(l.next_action_due);
                    const isOverdue = dueT != null && dueT < Date.now();
                    const isHot = l.tags.some((t) =>
                      /^(hot|karst)/i.test(t),
                    );
                    const hasUnread = l.unread_replies > 0;
                    const noContact = !parseDate(l.last_activity);
                    // Priority cascade: overdue > hot > unread > no-contact
                    const accentClass = isOverdue
                      ? "before:bg-rose-500/70"
                      : isHot
                        ? "before:bg-orange-500/70"
                        : hasUnread
                          ? "before:bg-blue-500/70"
                          : noContact
                            ? "before:bg-muted-foreground/30"
                            : "before:bg-transparent";
                    return (
                      <tr
                        key={l.lead_id}
                        onClick={() => openLead(l.lead_id)}
                        className={cn(
                          "group relative cursor-pointer border-b border-border/30 transition-colors",
                          "before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:content-['']",
                          accentClass,
                          isActive
                            ? "bg-primary/[0.06] shadow-[inset_3px_0_0_hsl(var(--primary))]"
                            : isSel
                              ? "bg-primary/[0.04]"
                              : "hover:bg-muted/30",
                        )}
                      >
                        <td
                          className="px-2 py-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSel}
                            onCheckedChange={() => toggleOne(l.lead_id)}
                            className="h-3.5 w-3.5"
                          />
                        </td>
                        <td className="max-w-[260px] px-2 py-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold leading-tight text-foreground">
                              {l.name || (
                                <span className="font-normal italic text-muted-foreground">
                                  Neidentificēts leads
                                </span>
                              )}
                            </span>
                            {hasUnread && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"
                                    aria-label="Nelasīta atbilde"
                                  />
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  Nelasītas atbildes: {l.unread_replies}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {l.secondary || "—"}
                          </div>
                        </td>
                        <td className="px-2 py-1">
                          <StatusBadge value={l.status} />
                        </td>
                        <td className="px-2 py-1">
                          {l.owner ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">
                                {initials(l.owner)}
                              </span>
                              <span className="truncate text-foreground">
                                {l.owner}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-foreground">
                          {l.ppv || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="max-w-[280px] px-2 py-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "truncate",
                                isOverdue
                                  ? "font-medium text-rose-700 dark:text-rose-300"
                                  : l.next_action
                                    ? "text-foreground"
                                    : "text-muted-foreground",
                              )}
                            >
                              {l.next_action || "Nav darbības"}
                            </span>
                            {l.next_action_due && (
                              <span
                                className={cn(
                                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                                  (() => {
                                    const t = parseDate(l.next_action_due);
                                    if (t == null)
                                      return "bg-muted text-muted-foreground";
                                    const diff = t - Date.now();
                                    if (diff < 0)
                                      return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
                                    if (diff < 2 * MS_DAY)
                                      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
                                    return "bg-muted text-muted-foreground";
                                  })(),
                                )}
                              >
                                {relativeTime(l.next_action_due)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1 text-muted-foreground">
                          {relativeTime(l.last_activity)}
                        </td>
                        <td className="max-w-[180px] px-2 py-1">
                          {l.tags.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {l.tags.slice(0, 3).map((t) => (
                                <span
                                  key={t}
                                  className={cn(
                                    "inline-flex h-4 items-center rounded px-1 text-[10px] lowercase",
                                    /^(hot|karst)/i.test(t)
                                      ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                                      : "bg-muted text-muted-foreground",
                                  )}
                                >
                                  {t}
                                </span>
                              ))}
                              {l.tags.length > 3 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{l.tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td
                          className="px-2 py-1 text-right"
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>
              Rāda {sorted.length} no {leads.length}
            </span>
            <span>Kārtots pēc termiņa, tad pēdējās aktivitātes</span>
          </div>
        </div>
      )}

      <LeadDrawer
        leadId={drawerLeadId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onPatch={patchLead}
      />
    </TooltipProvider>
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

