import { useMemo } from "react";

import { StatCard } from "@/components/StatCard";
import { LoadingState, ErrorState } from "@/components/DataState";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import { resolveDateRange, type FiltersSearch } from "@/lib/filters";

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("lv-LV").format(Math.round(n));
}

/**
 * Konversijas — built from analytics.email_conversions.
 *
 * conversion = first reply after outbound email
 * fast_reply = reply within 24h
 * late_reply = reply after 24h
 *
 * Date filter is applied on `sent_at` (PostgREST query string).
 * Only the date range is used here; country/source/owner/PPV filters are
 * not present on this view.
 */
export function ConversionsCards({ search }: { search: FiltersSearch }) {
  const { from, to } = resolveDateRange(search);

  const query = useMemo(() => {
    const parts: string[] = ["select=is_converted,conversion_type,sent_at"];
    if (from) parts.push(`sent_at=gte.${from}T00:00:00Z`);
    if (to) parts.push(`sent_at=lte.${to}T23:59:59Z`);
    parts.push("limit=100000");
    return parts.join("&");
  }, [from, to]);

  // TODO: migrate this analytics page to analytics.get_dashboard_kpis()
  const { data, isLoading, error } = useAnalyticsView("email_conversions", query);

  const totals = useMemo(() => {
    const rows = (data?.rows ?? []) as Array<Record<string, unknown>>;
    let sent = 0;
    let conv = 0;
    let fast = 0;
    let late = 0;
    for (const r of rows) {
      sent += 1;
      conv += num(r.is_converted);
      const t = String(r.conversion_type ?? "");
      if (t === "fast_reply") fast += 1;
      else if (t === "late_reply") late += 1;
    }
    return { sent, conv, fast, late };
  }, [data]);

  const apiError = data?.error ?? null;
  const errorMsg =
    (error as Error | null)?.message || apiError || null;

  const convPct =
    totals.sent > 0
      ? `${((totals.conv / totals.sent) * 100).toFixed(1)}%`
      : "—";

  return (
    <section className="mt-6">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">Konversijas</h2>
        <p className="text-xs text-muted-foreground">
          Konversija = pirmā atbilde pēc nosūtītā e-pasta. Ātrā atbilde — 24h
          laikā. Vēlā atbilde — pēc 24h.
        </p>
      </div>

      {errorMsg ? (
        <ErrorState message={errorMsg} />
      ) : isLoading ? (
        <LoadingState />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          <StatCard label="Nosūtīti" value={fmt(totals.sent)} />
          <StatCard label="Konversijas" value={fmt(totals.conv)} />
          <StatCard label="Konversijas %" value={convPct} />
          <StatCard
            label="Ātrās atbildes"
            value={fmt(totals.fast)}
            hint="≤ 24h"
          />
          <StatCard
            label="Vēlās atbildes"
            value={fmt(totals.late)}
            hint="> 24h"
          />
        </div>
      )}
    </section>
  );
}