import { useMemo } from "react";
import { useCrmView } from "@/hooks/useCrmView";

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}
const fmt = (n: number) => new Intl.NumberFormat("lv-LV").format(n);

function cleanLabel(s: string | null | undefined): string {
  if (!s) return "—";
  const t = s.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t)) return "—";
  if (/@/.test(t)) return t.split("@")[0];
  return t;
}

const STATUS_ORDER = [
  "Jauns",
  "Piesaistīšana",
  "Piedāvājums",
  "Līgums",
  "Atlikts",
  "Atkārtojas",
  "Nesasniedzams",
  "Nekvalificējas",
  "Atcelts",
];

const QUEUE_BUCKET_LABELS: Record<string, string> = {
  overdue: "Nokavēti",
  due_today: "Šodien",
  planned: "Plānoti",
  automated: "Automatizēti",
  upcoming: "Drīzumā",
};

type Kpis = {
  funnel?: Array<Record<string, unknown>>;
  team_workload?: Array<Record<string, unknown>>;
};

export default function AnalyticsGrid({
  kpis,
  totalLeads,
}: {
  kpis: Kpis;
  totalLeads: number;
}) {
  const queueQ = useCrmView(
    "next_action_queue_display_enriched",
    "select=ppv_name,country,queue_bucket,priority_label,lead_status_label",
    { all: true },
  );
  const queueRows = (queueQ.data?.rows ?? []) as Array<Record<string, unknown>>;

  const ppvDist = useMemo(() => aggregateBy(queueRows, "ppv_name"), [queueRows]);
  const countryDist = useMemo(() => aggregateBy(queueRows, "country"), [queueRows]);
  const bucketDist = useMemo(
    () =>
      aggregateBy(queueRows, "queue_bucket").map((r) => ({
        ...r,
        label: QUEUE_BUCKET_LABELS[r.label] ?? r.label,
      })),
    [queueRows],
  );

  const funnelRows = useMemo(() => {
    const rows = (kpis.funnel ?? []).map((r) => ({
      status: String(r.status ?? "—"),
      count: num(r.lead_count),
    }));
    rows.sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a.status);
      const bi = STATUS_ORDER.indexOf(b.status);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return b.count - a.count;
    });
    return rows;
  }, [kpis.funnel]);

  const team = (kpis.team_workload ?? []) as Array<Record<string, unknown>>;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {funnelRows.length > 0 && (
        <Card title="Pārdošanas funnel" subtitle="Leadi pa statusiem">
          <FunnelBars rows={funnelRows} total={totalLeads || funnelRows.reduce((s, r) => s + r.count, 0)} />
        </Card>
      )}
      {ppvDist.length > 0 && (
        <Card title="PPV slodze" subtitle="Aktīvie leadi pa pārstāvjiem">
          <BarList rows={ppvDist.slice(0, 8)} />
        </Card>
      )}
      {countryDist.length > 0 && (
        <Card title="Valstu sadalījums" subtitle="Aktīvie leadi pa valstīm">
          <BarList rows={countryDist.slice(0, 8)} />
        </Card>
      )}
      {bucketDist.length > 0 && (
        <Card title="Darba rinda" subtitle="Sadalījums pēc termiņa">
          <BarList rows={bucketDist} />
        </Card>
      )}
      {team.length > 0 && (
        <Card title="Komandas slodze" subtitle="Atvērti uzdevumi un leadi">
          <Leaderboard rows={team} />
        </Card>
      )}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-border bg-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function FunnelBars({
  rows,
  total,
}: {
  rows: Array<{ status: string; count: number }>;
  total: number;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const widthPct = (r.count / max) * 100;
        const sharePct = total > 0 ? (r.count / total) * 100 : 0;
        return (
          <li key={r.status}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-foreground">{r.status}</span>
              <span className="tabular-nums text-muted-foreground">
                {fmt(r.count)}
                <span className="ml-2 text-xs">({sharePct.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary/80" style={{ width: `${widthPct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function aggregateBy(
  rows: Array<Record<string, unknown>>,
  key: string,
): Array<{ label: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const raw = r[key];
    const label = cleanLabel(raw == null ? null : String(raw));
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .filter((r) => r.label !== "—" || r.count > 0)
    .sort((a, b) => b.count - a.count);
}

function BarList({ rows }: { rows: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const widthPct = (r.count / max) * 100;
        const share = total > 0 ? (r.count / total) * 100 : 0;
        return (
          <li key={r.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-foreground">{r.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {fmt(r.count)}
                <span className="ml-2 text-xs">({share.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-foreground/60" style={{ width: `${widthPct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Leaderboard({ rows }: { rows: Array<Record<string, unknown>> }) {
  const items = rows
    .map((r) => ({
      code: cleanLabel(String(r.user_code ?? "")) || "—",
      open: num(r.open_tasks_count),
      high: num(r.high_priority_open_tasks_count),
      leads: num(r.assigned_leads_count),
    }))
    .sort((a, b) => b.open + b.leads - (a.open + a.leads))
    .slice(0, 8);

  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">Nav komandas datu.</p>;

  return (
    <ul className="divide-y divide-border">
      {items.map((it) => (
        <li key={it.code} className="flex items-center justify-between gap-3 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
              {it.code.slice(0, 2).toUpperCase()}
            </span>
            <span className="truncate text-sm text-foreground">{it.code}</span>
          </div>
          <div className="flex items-center gap-4 text-sm tabular-nums">
            <Stat label="Leadi" value={it.leads} />
            <Stat label="Uzdevumi" value={it.open} />
            <Stat label="Augsta" value={it.high} warn={it.high > 0} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span
        className={
          warn && value > 0
            ? "font-semibold text-amber-600 dark:text-amber-500"
            : "font-medium text-foreground"
        }
      >
        {fmt(value)}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}
