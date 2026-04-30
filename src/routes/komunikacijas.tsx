import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { useAnalyticsRpc } from "@/hooks/useAnalyticsRpc";
import { buildAnalyticsFilters } from "@/lib/filters";
import { ConversionsCards } from "@/components/ConversionsCards";

export const Route = createFileRoute("/komunikacijas")({
  component: KomunikācijasPage,
});

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("lv-LV").format(n);
}

function fmtPct(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = num(v);
  return `${n.toFixed(1)}%`;
}

const COLUMNS: Array<{ key: string; label: string; type: "text" | "num" | "pct" }> = [
  { key: "channel", label: "Kanāls", type: "text" },
  { key: "outbound_count", label: "Nosūtīti kopā", type: "num" },
  { key: "verified_outbound_count", label: "Nosūtīti (verificēti)", type: "num" },
  { key: "unverified_outbound_count", label: "Nav verificēti", type: "num" },
  { key: "delivered_count", label: "Piegādāti", type: "num" },
  { key: "failed_count", label: "Neizdevās", type: "num" },
  { key: "click_count", label: "Klikšķi", type: "num" },
  { key: "reply_count", label: "Atbildējuši", type: "num" },
  { key: "engagement_count", label: "Iesaistes", type: "num" },
  { key: "delivery_rate", label: "Piegādes %", type: "pct" },
  { key: "click_rate", label: "Klikšķu %", type: "pct" },
  { key: "reply_rate", label: "Atbildējušo %", type: "pct" },
  { key: "engagement_rate", label: "Iesaistes %", type: "pct" },
];

function KomunikācijasPage() {
  const search = Route.useSearch();
  const filters = useMemo(() => buildAnalyticsFilters(search), [search]);
  const channels = useAnalyticsRpc("get_channel_summary_v2", filters);

  const totals = useMemo(() => {
    const rows = channels.data?.rows ?? [];
    return rows.reduce(
      (acc, r) => ({
        outbound: acc.outbound + num(r.outbound_count),
        verified: acc.verified + num(r.verified_outbound_count),
        unverified: acc.unverified + num(r.unverified_outbound_count),
        delivered: acc.delivered + num(r.delivered_count),
        failed: acc.failed + num(r.failed_count),
        click: acc.click + num(r.click_count),
        engagement: acc.engagement + num(r.engagement_count),
        reply: acc.reply + num(r.reply_count),
      }),
      { outbound: 0, verified: 0, unverified: 0, delivered: 0, failed: 0, click: 0, engagement: 0, reply: 0 },
    );
  }, [channels.data]);

  const errorMsg =
    (channels.error as Error | null)?.message || channels.data?.error;
  const loading = channels.isLoading;

  const channelRows = channels.data?.rows ?? [];

  const deliveryRatePct =
    totals.outbound > 0
      ? `${((totals.delivered / totals.outbound) * 100).toFixed(1)}%`
      : "—";
  const clickRatePct =
    totals.delivered > 0
      ? `${((totals.click / totals.delivered) * 100).toFixed(1)}%`
      : "—";
  const replyRatePct =
    totals.delivered > 0
      ? `${((totals.reply / totals.delivered) * 100).toFixed(1)}%`
      : "—";
  const engagementRatePct =
    totals.delivered > 0
      ? `${((totals.engagement / totals.delivered) * 100).toFixed(1)}%`
      : "—";

  return (
    <>
      <PageHeader
        title="Komunikācijas"
        description="Komunikāciju aktivitātes un kanālu rezultāti."
      />

      {errorMsg && <ErrorState message={errorMsg} />}
      {!errorMsg && loading && <LoadingState />}

      {!errorMsg && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
            <StatCard
              label="Nosūtīti kopā"
              value={fmt(totals.outbound)}
            />
            <StatCard
              label="Nosūtīti (verificēti)"
              value={fmt(totals.verified)}
              hint="Resend / reconciliation"
            />
            <StatCard
              label="Nav verificēti"
              value={fmt(totals.unverified)}
              hint="Smartsheet-only vēsturiskie"
            />
            <StatCard label="Piegādāti" value={fmt(totals.delivered)} />
            <StatCard label="Neizdevās" value={fmt(totals.failed)} />
            <StatCard label="Klikšķi" value={fmt(totals.click)} />
            <StatCard label="Atbildes" value={fmt(totals.reply)} hint="Unikāli leadi" />
            <StatCard label="Iesaistes" value={fmt(totals.engagement)} />
            <StatCard label="Piegādes %" value={deliveryRatePct} />
            <StatCard label="Klikšķu %" value={clickRatePct} />
            <StatCard label="Atbilžu %" value={replyRatePct} />
            <StatCard label="Iesaistes %" value={engagementRatePct} />
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Verificēti = Resend dati vai Resend reconciliation. Nav verificēti =
            vēsturiskie Smartsheet-only emaili.
          </p>

          <ConversionsCards search={search} />

          <div className="mt-6 rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">
                Kanāli
              </h2>
            </div>
            {channelRows.length === 0 ? (
              <div className="p-4">
                <EmptyState />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      {COLUMNS.map((c) => (
                        <th
                          key={c.key}
                          className="px-4 py-2 text-left font-medium tracking-wide"
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {channelRows.map((row, i) => (
                      <tr
                        key={i}
                        className="border-t border-border hover:bg-secondary/30"
                      >
                        {COLUMNS.map((c) => {
                          const v = row[c.key];
                          let display: string;
                          if (v == null || v === "") {
                            display = "—";
                          } else if (c.type === "num") {
                            display = fmt(num(v));
                          } else if (c.type === "pct") {
                            display = fmtPct(v);
                          } else {
                            display = String(v);
                          }
                          return (
                            <td
                              key={c.key}
                              className="px-4 py-2 tabular-nums text-foreground"
                            >
                              {display}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}