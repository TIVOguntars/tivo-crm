import { useMemo, useState } from "react";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import { LoadingState, ErrorState } from "@/components/DataState";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown>;
type Category = "all" | "communications" | "tasks" | "notes" | "system";

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "all", label: "Visi" },
  { key: "communications", label: "Komunikācijas" },
  { key: "tasks", label: "Uzdevumi" },
  { key: "notes", label: "Piezīmes" },
  { key: "system", label: "Sistēma" },
];

function s(v: unknown): string {
  return v == null ? "" : String(v);
}

function fmtDateTime(value: unknown): string {
  const str = s(value);
  if (!str) return "—";
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return new Intl.DateTimeFormat("lv-LV", {
    timeZone: "Europe/Riga",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function categoryOf(row: Row): Category {
  const t = s(row.activity_type).toLowerCase();
  if (t === "message" || t === "message_event") return "communications";
  if (t === "task") return "tasks";
  if (t === "note") return "notes";
  return "system";
}

function dotClass(cat: Category): string {
  switch (cat) {
    case "communications":
      return "bg-blue-500";
    case "tasks":
      return "bg-emerald-500";
    case "notes":
      return "bg-amber-500";
    default:
      return "bg-muted-foreground";
  }
}

function channelLabel(ch: string): string {
  const c = ch.toLowerCase();
  if (c === "email") return "E-pasts";
  if (c === "sms") return "SMS";
  if (c === "whatsapp") return "WhatsApp";
  if (c === "call" || c === "phone") return "Zvans";
  return ch;
}

export function UnifiedActivityTimeline({
  leadId,
  defaultCategory = "communications",
}: {
  leadId: string | null;
  defaultCategory?: Category;
}) {
  const [category, setCategory] = useState<Category>(defaultCategory);

  const query = leadId
    ? `lead_id=eq.${encodeURIComponent(leadId)}&order=timeline_at.desc&limit=50`
    : "";

  const q = useAnalyticsView("unified_activity_timeline", query);

  const rows = (q.data?.rows ?? []) as Row[];

  const filtered = useMemo(() => {
    if (category === "all") return rows;
    return rows.filter((r) => categoryOf(r) === category);
  }, [rows, category]);

  const counts = useMemo(() => {
    const c: Record<Category, number> = {
      all: rows.length,
      communications: 0,
      tasks: 0,
      notes: 0,
      system: 0,
    };
    for (const r of rows) c[categoryOf(r)] += 1;
    return c;
  }, [rows]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        {CATEGORIES.map((c) => {
          const active = category === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              <span>{c.label}</span>
              <span className={cn("text-[10px]", active ? "opacity-90" : "opacity-70")}>
                {counts[c.key]}
              </span>
            </button>
          );
        })}
      </div>

      {q.isLoading ? (
        <LoadingState />
      ) : q.data?.error ? (
        <ErrorState message={q.data.error} />
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
          Nav ierakstu šajā kategorijā.
        </div>
      ) : (
        <ol className="relative space-y-2 border-l border-border pl-4">
          {filtered.map((row, idx) => (
            <TimelineItem key={`${s(row.source_table)}:${s(row.id)}:${idx}`} row={row} />
          ))}
        </ol>
      )}
    </div>
  );
}

function TimelineItem({ row }: { row: Row }) {
  const cat = categoryOf(row);
  const title = s(row.title) || s(row.activity_subtype) || s(row.activity_type) || "—";
  const channel = s(row.channel);
  const direction = s(row.direction).toLowerCase();
  const status = s(row.status);
  const ts = fmtDateTime(row.timeline_at);
  const source = s(row.source_table);

  const dirBadge =
    direction === "inbound" || direction === "in"
      ? "Saņemts"
      : direction === "outbound" || direction === "out"
        ? "Nosūtīts"
        : "";

  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[21px] top-2 h-2.5 w-2.5 rounded-full ring-2 ring-background",
          dotClass(cat),
        )}
      />
      <div className="rounded-md border border-border bg-background px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono text-[10px] uppercase tracking-wide">{source}</span>
          {channel && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
              {channelLabel(channel)}
            </span>
          )}
          {dirBadge && <span className="text-[10px]">{dirBadge}</span>}
          {status && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{status}</span>
          )}
          <span className="ml-auto text-[10px]">{ts}</span>
        </div>
        <div className="mt-0.5 truncate text-sm font-medium text-foreground" title={title}>
          {title}
        </div>
      </div>
    </li>
  );
}

export default UnifiedActivityTimeline;