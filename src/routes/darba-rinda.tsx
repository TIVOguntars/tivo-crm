import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { Eye } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { SearchInput } from "@/components/SearchInput";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import type { FiltersSearch } from "@/lib/filters";

/* ----------------------- Route + search params ----------------------- */

const SEGMENTS = [
  "all",
  "jauni",
  "nesasniedzami",
  "ar_reakciju",
  "hot",
  "nokaveti",
  "pieprasijums_piedavajums",
  "ligumi",
] as const;
type Segment = (typeof SEGMENTS)[number];

const leadiSearchSchema = z.object({
  status: fallback(z.string().optional(), undefined),
  seg: fallback(z.enum(SEGMENTS), "all").default("all"),
});

export const Route = createFileRoute("/darba-rinda")({
  validateSearch: zodValidator(leadiSearchSchema),
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

function dueClass(due: string | null): string {
  const t = parseDate(due);
  if (t == null) return "text-muted-foreground";
  const diff = t - Date.now();
  if (diff < 0) return "text-destructive font-medium";
  if (diff < MS_DAY * 2) return "text-amber-600 dark:text-amber-400 font-medium";
  return "text-foreground";
}

/* ----------------------- Segments ----------------------- */

const NEW_STATUSES = new Set(["Jauns", "Jauns lead", "Jauns leads"]);
const UNREACHABLE_STATUSES = new Set([
  "Nesasniedzams",
  "Nesasniegts",
  "Bounced",
  "Nederīgs e-pasts",
]);
const REQUEST_OFFER_STATUSES = new Set([
  "Pieprasījums",
  "Piedāvājums",
  "Pieprasijums",
  "Piedavajums",
]);
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
    case "nokaveti": {
      const t = parseDate(lead.next_action_due_date);
      return t != null && t < Date.now();
    }
    case "pieprasijums_piedavajums":
      return REQUEST_OFFER_STATUSES.has(lead.status);
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
  nokaveti: "Nokavēti termiņi",
  pieprasijums_piedavajums: "Pieprasījums / Piedāvājums",
  ligumi: "Līgumi",
};

/* ----------------------- Filter dropdown ----------------------- */

function MultiSelect({
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
  const selected = new Set(value);
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select
        multiple
        value={value}
        onChange={(e) => {
          const next = Array.from(e.target.selectedOptions).map((o) => o.value);
          onChange(next);
        }}
        className="h-20 min-w-[140px] rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
            {selected.has(opt) ? " ✓" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ----------------------- Page ----------------------- */

function DarbaRindaPage() {
  const search = Route.useSearch() as FiltersSearch & { status?: string; seg: Segment };
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
      "select=lead_id,full_name,email,phone_raw,phone_e164,country,source,status,owner,ppv_vards,next_action,next_action_due_date,last_contact_date,automation_step,automation_date,tags,lead_created_at",
      "order=lead_created_at.desc.nullslast",
      `limit=${PAGE_SIZE}`,
    ].join("&");
  }, []);

  const overview = useAnalyticsView("leads_overview", overviewQuery);
  const filterOptions = useAnalyticsView("filter_options", "limit=1");

  const errorMsg =
    (overview.error as Error | null)?.message || overview.data?.error;
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

  /* Sort: due asc nullslast → last_contact_date asc → lead_created_at desc */
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const aDue = parseDate(a.next_action_due_date);
      const bDue = parseDate(b.next_action_due_date);
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
        description="Darba saraksts: visi leadi ar termiņiem un kontaktiem."
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
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              seg === sg
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-secondary/40"
            }`}
          >
            {SEGMENT_LABELS[sg]}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="mb-4 rounded-lg border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Statuss</span>
            <select
              value={selectedStatus ?? ""}
              onChange={(e) => setStatus(e.target.value || undefined)}
              className="h-8 min-w-[160px] rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Visi</option>
              {options.statuses.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </label>

          <MultiSelect
            label="Atbildīgais"
            options={options.owners}
            value={selectedOwners}
            onChange={(v) => setMulti("owners", v)}
          />
          <MultiSelect
            label="PPV"
            options={options.ppvs}
            value={selectedPpvs}
            onChange={(v) => setMulti("ppvs", v)}
          />
          <MultiSelect
            label="Valsts"
            options={options.countries}
            value={selectedCountries}
            onChange={(v) => setMulti("countries", v)}
          />
          <MultiSelect
            label="Avots"
            options={options.sources}
            value={selectedSources}
            onChange={(v) => setMulti("sources", v)}
          />
          <MultiSelect
            label="Tags"
            options={options.tags}
            value={selectedTags}
            onChange={(v) => setMulti("tags", v)}
          />

          {hasAnyFilter && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={clearFilters}
            >
              Notīrīt filtrus
            </Button>
          )}
        </div>
      </div>

      {errorMsg && <ErrorState message={errorMsg} />}
      {!errorMsg && loading && <LoadingState />}

      {!errorMsg && !loading && (
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
                Kārtots pēc termiņa, tad pēdējās saziņas, tad izveides datuma.
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1400px] text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Vārds / Uzvārds</th>
                    <th className="px-3 py-2 text-left font-medium">Email</th>
                    <th className="px-3 py-2 text-left font-medium">Telefons</th>
                    <th className="px-3 py-2 text-left font-medium">Valsts</th>
                    <th className="px-3 py-2 text-left font-medium">Avots</th>
                    <th className="px-3 py-2 text-left font-medium">Statuss</th>
                    <th className="px-3 py-2 text-left font-medium">Atbildīgais</th>
                    <th className="px-3 py-2 text-left font-medium">PPV</th>
                    <th className="px-3 py-2 text-left font-medium">Nākamā darbība</th>
                    <th className="px-3 py-2 text-left font-medium">Termiņš</th>
                    <th className="px-3 py-2 text-left font-medium">Pēdējā saziņa</th>
                    <th className="px-3 py-2 text-left font-medium">Automatizācija</th>
                    <th className="px-3 py-2 text-left font-medium">Aut. datums</th>
                    <th className="px-3 py-2 text-left font-medium">Tags</th>
                    <th className="px-3 py-2 text-right font-medium" aria-label="Darbības" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((lead) => (
                    <tr
                      key={lead.lead_id}
                      className="border-t border-border hover:bg-secondary/30"
                    >
                      <td className="px-3 py-2 font-medium text-foreground">
                        {lead.full_name || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {lead.email ? (
                          <a
                            href={`mailto:${lead.email}`}
                            className="text-primary hover:underline"
                          >
                            {lead.email}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-foreground">
                        {lead.phone || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {lead.country || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {lead.source || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {lead.status || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {lead.owner || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {lead.ppv || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {lead.next_action || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-2 tabular-nums ${dueClass(lead.next_action_due_date)}`}
                      >
                        {fmtDate(lead.next_action_due_date)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-foreground">
                        {fmtDateTime(lead.last_contact_date)}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {lead.automation_step || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-foreground">
                        {fmtDate(lead.automation_date)}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {lead.tags.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {lead.tags.map((t) => (
                              <span
                                key={t}
                                className={`rounded-full px-2 py-0.5 text-[11px] ${
                                  t.toLowerCase() === "hot"
                                    ? "bg-destructive/15 text-destructive"
                                    : "bg-secondary text-secondary-foreground"
                                }`}
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          to="/lead/$leadId"
                          params={{ leadId: lead.lead_id }}
                          className="inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary/50"
                          title="Atvērt leadu"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}