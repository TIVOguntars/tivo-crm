import { useMemo } from "react";

import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { useAnalyticsRpc } from "@/hooks/useAnalyticsRpc";
import { buildAnalyticsFilters, type FiltersSearch } from "@/lib/filters";

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("lv-LV").format(n);
}

const CHANNEL_LABELS: Record<string, string> = {
  email: "E-pasts",
  sms: "SMS",
  whatsapp: "WhatsApp",
  call: "Zvani",
  messenger: "Messenger",
};

type ChannelRow = {
  channel: string;
  sent: number;
  delivered: number;
  clicked: number;
  replied: number;
};

type StepDef = {
  key: keyof Omit<ChannelRow, "channel">;
  label: string;
  /** Which value to use as denominator for percentage. */
  base: "sent" | "delivered";
};

const STEPS: StepDef[] = [
  { key: "sent", label: "Sent", base: "sent" },
  { key: "delivered", label: "Delivered", base: "sent" },
  { key: "clicked", label: "Clicked", base: "delivered" },
  { key: "replied", label: "Replied", base: "delivered" },
];

export function CommunicationFunnel({ search }: { search: FiltersSearch }) {
  const filters = useMemo(() => {
    const base = buildAnalyticsFilters(search);
    return { ...base, p_channels: null as string[] | null };
  }, [search]);

  const query = useAnalyticsRpc("get_communication_funnel", filters);

  const channels: ChannelRow[] = useMemo(() => {
    const rows = query.data?.rows ?? [];
    return rows.map((r) => ({
      channel: String(r.channel ?? "—"),
      sent: num(r.sent),
      delivered: num(r.delivered),
      clicked: num(r.clicked),
      replied: num(r.replied),
    }));
  }, [query.data]);

  const error = (query.error as Error | null)?.message || query.data?.error;

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">
          Komunikācijas funnel
        </h2>
        <p className="text-xs text-muted-foreground">
          Šis ir cohort funnel: tas rāda, kas notika ar ziņojumiem, kas nosūtīti
          izvēlētajā periodā.
        </p>
      </div>

      {error && <ErrorState message={error} />}
      {!error && query.isLoading && <LoadingState />}
      {!error && !query.isLoading && channels.length === 0 && <EmptyState />}
      {!error && !query.isLoading && channels.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {channels.map((c) => (
            <ChannelCard key={c.channel} row={c} />
          ))}
        </div>
      )}
    </section>
  );
}

function ChannelCard({ row }: { row: ChannelRow }) {
  const label = CHANNEL_LABELS[row.channel] ?? row.channel;

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <span className="text-xs text-muted-foreground">
          {fmt(row.sent)} sūtīti
        </span>
      </div>
      <div className="space-y-3">
        {STEPS.map((step) => {
          const value = row[step.key];
          const denom = row[step.base];
          const pct =
            step.key === "sent"
              ? 100
              : denom > 0
                ? (value / denom) * 100
                : 0;
          const showPct = step.key !== "sent";
          return (
            <div key={step.key}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{step.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {fmt(value)}
                  {showPct && (
                    <span className="ml-2 text-xs">({pct.toFixed(1)}%)</span>
                  )}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}