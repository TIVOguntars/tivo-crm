import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import { resolveDateRange, type FiltersSearch } from "@/lib/filters";
import { cn } from "@/lib/utils";

const REACHED = new Set([
  "Piesaistīšana",
  "Kvalificēts",
  "Pieprasījums",
  "Piedāvājums",
  "Līgums",
]);
const NOT_REACHED = "Nesasniedzams";

type Dim = "source" | "country" | "ppv_vards";
type SortKey = "label" | "total" | "reachedPct" | "notReachedPct";

const DIM_LABELS: Record<Dim, { label: string; columnHeader: string }> = {
  source: { label: "Avots", columnHeader: "Avots" },
  country: { label: "Valsts", columnHeader: "Valsts" },
  ppv_vards: { label: "PPV", columnHeader: "PPV" },
};

interface Row {
  label: string;
  total: number;
  reached: number;
  notReached: number;
  reachedPct: number;
  notReachedPct: number;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("lv-LV").format(n);
}

export function ReachabilityBreakdown({ search }: { search: FiltersSearch }) {
  const [dim, setDim] = useState<Dim>("source");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "total",
    dir: "desc",
  });

  const query = useMemo(() => {
    const { from, to } = resolveDateRange(search);
    const parts: string[] = [
      "select=source,country,ppv_vards,status",
      "limit=10000",
    ];
    if (from) parts.push(`lead_created_date=gte.${from}`);
    if (to) parts.push(`lead_created_date=lte.${to}`);
    if (search.countries.length > 0)
      parts.push(
        `country=in.(${search.countries.map(encodeURIComponent).join(",")})`,
      );
    if (search.sources.length > 0)
      parts.push(
        `source=in.(${search.sources.map(encodeURIComponent).join(",")})`,
      );
    if (search.owners.length > 0)
      parts.push(
        `owner=in.(${search.owners.map(encodeURIComponent).join(",")})`,
      );
    if (search.ppvs.length > 0)
      parts.push(
        `ppv_vards=in.(${search.ppvs.map(encodeURIComponent).join(",")})`,
      );
    return parts.join("&");
  }, [search]);

  // TODO: migrate this analytics page to analytics.get_dashboard_kpis()
  const { data, isLoading, error } = useAnalyticsView("leads_overview", query);

  const rows: Row[] = useMemo(() => {
    const records = (data?.rows ?? []) as Array<Record<string, unknown>>;
    const buckets = new Map<
      string,
      { total: number; reached: number; notReached: number }
    >();

    for (const r of records) {
      const raw = r[dim];
      const key =
        raw == null || String(raw).trim() === "" ? "—" : String(raw);
      const status = String(r.status ?? "");
      const b = buckets.get(key) ?? { total: 0, reached: 0, notReached: 0 };
      b.total += 1;
      if (REACHED.has(status)) b.reached += 1;
      else if (status === NOT_REACHED) b.notReached += 1;
      buckets.set(key, b);
    }

    return Array.from(buckets.entries()).map(([label, b]) => ({
      label,
      total: b.total,
      reached: b.reached,
      notReached: b.notReached,
      reachedPct: b.total > 0 ? (b.reached / b.total) * 100 : 0,
      notReachedPct: b.total > 0 ? (b.notReached / b.total) * 100 : 0,
    }));
  }, [data, dim]);

  const sorted = useMemo(() => {
    const out = [...rows];
    const mult = sort.dir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * mult;
      }
      return ((av as number) - (bv as number)) * mult;
    });
    return out;
  }, [rows, sort]);

  const errorMsg = (error as Error | null)?.message || data?.error;

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "label" ? "asc" : "desc" },
    );
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sort.key !== k) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return sort.dir === "asc" ? (
      <ArrowUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3" />
    );
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Sasniedzamība pēc avota / valsts / PPV
          </h2>
          <p className="text-xs text-muted-foreground">
            Identificē, kuras grupas rada nesasniedzamus leadus
          </p>
        </div>
        <div className="inline-flex rounded-md border border-border bg-background p-0.5">
          {(Object.keys(DIM_LABELS) as Dim[]).map((d) => (
            <button
              key={d}
              onClick={() => setDim(d)}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium transition-colors",
                dim === d
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {DIM_LABELS[d].label}
            </button>
          ))}
        </div>
      </div>

      {errorMsg && <ErrorState message={errorMsg} />}
      {!errorMsg && isLoading && <LoadingState />}
      {!errorMsg && !isLoading && sorted.length === 0 && <EmptyState />}

      {!errorMsg && !isLoading && sorted.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <SortableTh label={DIM_LABELS[dim].columnHeader} sortKey="label" current={sort} onClick={toggleSort} icon={<SortIcon k="label" />} />
                  <SortableTh label="Kopā" sortKey="total" current={sort} onClick={toggleSort} icon={<SortIcon k="total" />} align="right" />
                  <SortableTh label="Sasniegti %" sortKey="reachedPct" current={sort} onClick={toggleSort} icon={<SortIcon k="reachedPct" />} align="right" />
                  <SortableTh label="Nesasniedzami %" sortKey="notReachedPct" current={sort} onClick={toggleSort} icon={<SortIcon k="notReachedPct" />} align="right" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.label} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-2 text-foreground">{r.label}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-foreground">
                      {fmt(r.total)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <span className="text-foreground">{r.reachedPct.toFixed(1)}%</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({fmt(r.reached)})
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <span
                        className={cn(
                          "font-medium",
                          r.notReachedPct >= 50
                            ? "text-destructive"
                            : r.notReachedPct >= 25
                              ? "text-foreground"
                              : "text-muted-foreground",
                        )}
                      >
                        {r.notReachedPct.toFixed(1)}%
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({fmt(r.notReached)})
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            {sorted.length} grupas · ielādēti {fmt((data?.rows ?? []).length)} leadi
          </div>
        </div>
      )}
    </section>
  );
}

function SortableTh({
  label,
  sortKey,
  current,
  onClick,
  icon,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  current: { key: SortKey; dir: "asc" | "desc" };
  onClick: (k: SortKey) => void;
  icon: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "cursor-pointer select-none px-4 py-2 font-medium tracking-wide hover:text-foreground",
        align === "right" ? "text-right" : "text-left",
        current.key === sortKey && "text-foreground",
      )}
      onClick={() => onClick(sortKey)}
    >
      {label}
      {icon}
    </th>
  );
}