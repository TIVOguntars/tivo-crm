import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import { resolveDateRange, type FiltersSearch } from "@/lib/filters";
import { cn } from "@/lib/utils";

const NOT_REACHED = "Nesasniedzams";

type Dim = "country" | "ppv_vards" | "source_detailed";
type SortKey =
  | "label"
  | "notReached"
  | "shareOfTotalPct"
  | "shareOfDimPct";

const DIM_LABELS: Record<Dim, { label: string; columnHeader: string }> = {
  country: { label: "Valsts", columnHeader: "Valsts" },
  ppv_vards: { label: "PPV", columnHeader: "PPV" },
  source_detailed: { label: "Kanāls", columnHeader: "Kanāls" },
};

interface Row {
  label: string;
  total: number;
  notReached: number;
  shareOfTotalPct: number; // notReached / totalAllLeads * 100
  shareOfDimPct: number; // notReached / total within dim group * 100
}

function fmt(n: number): string {
  return new Intl.NumberFormat("lv-LV").format(n);
}

export function UnreachableBreakdown({ search }: { search: FiltersSearch }) {
  const [dim, setDim] = useState<Dim>("country");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "notReached",
    dir: "desc",
  });

  const query = useMemo(() => {
    const { from, to } = resolveDateRange(search);
    const parts: string[] = [
      "select=country,ppv_vards,source_detailed,status",
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

  const { rows, totalAll, totalNotReachedAll } = useMemo(() => {
    const records = (data?.rows ?? []) as Array<Record<string, unknown>>;
    const buckets = new Map<string, { total: number; notReached: number }>();
    let totalAllLeads = 0;
    let totalNotReached = 0;

    for (const r of records) {
      totalAllLeads += 1;
      const raw = r[dim];
      const key =
        raw == null || String(raw).trim() === "" ? "—" : String(raw);
      const status = String(r.status ?? "");
      const b = buckets.get(key) ?? { total: 0, notReached: 0 };
      b.total += 1;
      if (status === NOT_REACHED) {
        b.notReached += 1;
        totalNotReached += 1;
      }
      buckets.set(key, b);
    }

    const out: Row[] = Array.from(buckets.entries())
      .filter(([, b]) => b.notReached > 0)
      .map(([label, b]) => ({
        label,
        total: b.total,
        notReached: b.notReached,
        shareOfTotalPct:
          totalAllLeads > 0 ? (b.notReached / totalAllLeads) * 100 : 0,
        shareOfDimPct: b.total > 0 ? (b.notReached / b.total) * 100 : 0,
      }));

    return {
      rows: out,
      totalAll: totalAllLeads,
      totalNotReachedAll: totalNotReached,
    };
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
    if (sort.key !== k)
      return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return sort.dir === "asc" ? (
      <ArrowUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3" />
    );
  };

  const overallNotReachedPct =
    totalAll > 0 ? (totalNotReachedAll / totalAll) * 100 : 0;

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Nesasniedzamības analīze
          </h2>
          <p className="text-xs text-muted-foreground">
            Kāpēc leadi ir nesasniedzami — sadalījums pēc valsts, PPV un kanāla
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
        <>
          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <SummaryCard
              label="Kopā leadi"
              value={fmt(totalAll)}
            />
            <SummaryCard
              label="Nesasniedzami kopā"
              value={fmt(totalNotReachedAll)}
              accent="destructive"
            />
            <SummaryCard
              label="% no visiem"
              value={`${overallNotReachedPct.toFixed(1)}%`}
              accent="destructive"
            />
          </div>

          <div className="overflow-hidden rounded-md border border-border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <SortableTh
                      label={DIM_LABELS[dim].columnHeader}
                      sortKey="label"
                      current={sort}
                      onClick={toggleSort}
                      icon={<SortIcon k="label" />}
                    />
                    <SortableTh
                      label="Nesasniedzami"
                      sortKey="notReached"
                      current={sort}
                      onClick={toggleSort}
                      icon={<SortIcon k="notReached" />}
                      align="right"
                    />
                    <SortableTh
                      label="% no visiem leadiem"
                      sortKey="shareOfTotalPct"
                      current={sort}
                      onClick={toggleSort}
                      icon={<SortIcon k="shareOfTotalPct" />}
                      align="right"
                    />
                    <SortableTh
                      label="% grupas iekšienē"
                      sortKey="shareOfDimPct"
                      current={sort}
                      onClick={toggleSort}
                      icon={<SortIcon k="shareOfDimPct" />}
                      align="right"
                    />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr
                      key={r.label}
                      className="border-t border-border hover:bg-secondary/30"
                    >
                      <td className="px-4 py-2 text-foreground">{r.label}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-foreground">
                        {fmt(r.notReached)}
                        <span className="ml-2 text-xs text-muted-foreground">
                          / {fmt(r.total)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-foreground">
                        {r.shareOfTotalPct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        <span
                          className={cn(
                            "font-medium",
                            r.shareOfDimPct >= 50
                              ? "text-destructive"
                              : r.shareOfDimPct >= 25
                                ? "text-foreground"
                                : "text-muted-foreground",
                          )}
                        >
                          {r.shareOfDimPct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              {sorted.length} grupas · ielādēti {fmt(totalAll)} leadi
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "destructive";
}) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-lg font-semibold tabular-nums",
          accent === "destructive" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
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