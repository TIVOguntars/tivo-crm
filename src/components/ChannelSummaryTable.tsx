import { useMemo } from "react";

import { useAnalyticsRpc } from "@/hooks/useAnalyticsRpc";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import type { FiltersSearch } from "@/lib/filters";
import { buildAnalyticsFilters } from "@/lib/filters";

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat("lv-LV").format(Math.round(n));
}

function fmtPct(v: unknown): string {
  const n = num(v);
  if (!Number.isFinite(n) || n === 0) return "—";
  // RPC may return 0–1 fraction or 0–100 already; normalize.
  const pct = n <= 1 ? n * 100 : n;
  return `${pct.toFixed(1)}%`;
}

export function ChannelSummaryTable({ search }: { search: FiltersSearch }) {
  const filters = useMemo(() => buildAnalyticsFilters(search), [search]);
  const { data, isLoading, error } = useAnalyticsRpc(
    "get_channel_summary",
    filters,
  );

  const rows = useMemo(() => {
    let raw = (data?.rows ?? []) as Array<Record<string, unknown>>;
    if (
      raw.length === 1 &&
      raw[0] &&
      typeof raw[0] === "object" &&
      Array.isArray((raw[0] as Record<string, unknown>).data)
    ) {
      raw = (raw[0] as { data: Array<Record<string, unknown>> }).data;
    }
    return raw.map((r) => ({
      channel: String(r.channel ?? "—"),
      verified: num(r.verified_outbound_count),
      unverified: num(r.unverified_outbound_count),
      delivered: num(r.delivered_count),
      failed: num(r.failed_count),
      engagement: num(r.engagement_count),
      reply: num(r.reply_count),
      delivery_rate: r.delivery_rate,
      engagement_rate: r.engagement_rate,
      reply_rate: r.reply_rate,
    }));
  }, [data]);

  const apiError = data?.error ?? null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-foreground">
        Kanālu kopsavilkums
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Sūtījumi, piegāde, klikšķi un atbildes pa kanāliem.
      </p>

      {error || apiError ? (
        <ErrorState message={String(apiError ?? error)} />
      ) : isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-2 py-2 font-medium">Kanāls</th>
                <th className="px-2 py-2 text-right font-medium">
                  Nosūtīti (verificēti)
                </th>
                <th className="px-2 py-2 text-right font-medium">
                  Nav verificēti
                </th>
                <th className="px-2 py-2 text-right font-medium">Piegādāti</th>
                <th className="px-2 py-2 text-right font-medium">Neizdevās</th>
                <th className="px-2 py-2 text-right font-medium">Klikšķi</th>
                <th className="px-2 py-2 text-right font-medium">Atbildējuši</th>
                <th className="px-2 py-2 text-right font-medium">Piegādes %</th>
                <th className="px-2 py-2 text-right font-medium">Klikšķu %</th>
                <th className="px-2 py-2 text-right font-medium">Atbildējušo %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.channel}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="px-2 py-2 font-medium text-foreground">
                    {r.channel}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmtInt(r.verified)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                    {fmtInt(r.unverified)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmtInt(r.delivered)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                    {fmtInt(r.failed)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmtInt(r.engagement)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmtInt(r.reply)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmtPct(r.delivery_rate)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmtPct(r.engagement_rate)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmtPct(r.reply_rate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}