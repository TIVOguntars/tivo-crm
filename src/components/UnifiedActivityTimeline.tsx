import { useMemo, useState } from "react";
import {
  Mail,
  MessageSquare,
  Phone,
  CheckSquare,
  StickyNote,
  RefreshCw,
  UserCog,
  Tag as TagIcon,
  Database,
  Cog,
  Download,
  FilePlus,
  Activity,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import { LoadingState, ErrorState } from "@/components/DataState";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown>;

export type TimelineCategory =
  | "all"
  | "communications"
  | "tasks"
  | "notes"
  | "system"
  | "imports"
  | "automation";

const CATEGORY_LABEL: Record<TimelineCategory, string> = {
  all: "Visi",
  communications: "Komunikācijas",
  tasks: "Uzdevumi",
  notes: "Piezīmes",
  system: "Sistēma",
  imports: "Imports",
  automation: "Automatizācija",
};

const COMMUNICATIONS = new Set(["message", "message_event"]);
const TASKS = new Set(["task", "action"]);
const NOTES = new Set(["note"]);
const SYSTEM = new Set([
  "create",
  "update",
  "status_change",
  "owner_change",
  "ppv_change",
  "tag_change",
  "audit",
  "activity",
]);
const IMPORTS = new Set(["import"]);
const AUTOMATION = new Set(["automation"]);

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

function categoryOf(row: Row): TimelineCategory {
  const t = s(row.activity_type).toLowerCase();
  if (COMMUNICATIONS.has(t)) return "communications";
  if (TASKS.has(t)) return "tasks";
  if (NOTES.has(t)) return "notes";
  if (IMPORTS.has(t)) return "imports";
  if (AUTOMATION.has(t)) return "automation";
  return "system";
}

function iconFor(row: Row): LucideIcon {
  const t = s(row.activity_type).toLowerCase();
  const ch = s(row.channel).toLowerCase();
  if (t === "message" || t === "message_event") {
    if (ch === "sms" || ch === "whatsapp") return MessageSquare;
    if (ch === "call" || ch === "phone") return Phone;
    return Mail;
  }
  if (TASKS.has(t)) return CheckSquare;
  if (NOTES.has(t)) return StickyNote;
  if (IMPORTS.has(t)) return Download;
  if (AUTOMATION.has(t)) return Cog;
  if (t === "status_change") return RefreshCw;
  if (t === "owner_change") return UserCog;
  if (t === "tag_change") return TagIcon;
  if (t === "create") return FilePlus;
  if (t === "update") return Activity;
  if (t === "audit") return Database;
  return Activity;
}

function dotClass(cat: TimelineCategory): string {
  switch (cat) {
    case "communications":
      return "bg-blue-500";
    case "tasks":
      return "bg-emerald-500";
    case "notes":
      return "bg-amber-500";
    case "imports":
      return "bg-sky-500";
    case "automation":
      return "bg-violet-500";
    default:
      return "bg-muted-foreground";
  }
}

function channelLabel(ch: string): string {
  const c = ch.toLowerCase();
  if (c === "email") return "Email";
  if (c === "sms") return "SMS";
  if (c === "whatsapp") return "WhatsApp";
  if (c === "call" || c === "phone") return "Zvans";
  return ch;
}

function dirLabel(dir: string): string {
  const d = dir.toLowerCase();
  if (d === "inbound" || d === "in") return "Inbound";
  if (d === "outbound" || d === "out") return "Outbound";
  return "";
}

function previewText(row: Row): string {
  const candidates = [
    row.preview,
    row.body_preview,
    row.summary,
    row.description,
    row.note,
  ];
  for (const c of candidates) {
    const v = s(c).trim();
    if (v) return v.replace(/\s+/g, " ").slice(0, 220);
  }
  const meta = row.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const m = meta as Row;
    for (const k of ["body_preview", "preview", "summary", "description"]) {
      const v = s(m[k]).trim();
      if (v) return v.replace(/\s+/g, " ").slice(0, 220);
    }
  }
  return "";
}

export interface UnifiedActivityTimelineProps {
  leadId: string | null;
  defaultCategory?: TimelineCategory;
  /** Which filter pills to show. Defaults to all 7. */
  categories?: TimelineCategory[];
  /** Row limit. Default 100. */
  limit?: number;
}

const DEFAULT_CATEGORIES: TimelineCategory[] = [
  "all",
  "communications",
  "tasks",
  "notes",
  "system",
  "imports",
  "automation",
];

export function UnifiedActivityTimeline({
  leadId,
  defaultCategory = "all",
  categories = DEFAULT_CATEGORIES,
  limit = 100,
}: UnifiedActivityTimelineProps) {
  const [category, setCategory] = useState<TimelineCategory>(defaultCategory);

  const query = leadId
    ? `lead_id=eq.${encodeURIComponent(leadId)}&order=timeline_at.desc&limit=${limit}`
    : "";

  const q = useAnalyticsView("unified_activity_timeline", query);

  const rows = (q.data?.rows ?? []) as Row[];

  const counts = useMemo(() => {
    const c: Record<TimelineCategory, number> = {
      all: rows.length,
      communications: 0,
      tasks: 0,
      notes: 0,
      system: 0,
      imports: 0,
      automation: 0,
    };
    for (const r of rows) c[categoryOf(r)] += 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    if (category === "all") return rows;
    return rows.filter((r) => categoryOf(r) === category);
  }, [rows, category]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        {categories.map((c) => {
          const active = category === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              <span>{CATEGORY_LABEL[c]}</span>
              <span className={cn("text-[10px]", active ? "opacity-90" : "opacity-70")}>
                {counts[c]}
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
        <ol className="relative space-y-1.5 border-l border-border pl-4">
          {filtered.map((row, idx) => (
            <TimelineItem
              key={`${s(row.source_table)}:${s(row.id)}:${idx}`}
              row={row}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function TimelineItem({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const cat = categoryOf(row);
  const Icon = iconFor(row);
  const title =
    s(row.title) || s(row.activity_subtype) || s(row.activity_type) || "—";
  const channel = s(row.channel);
  const direction = dirLabel(s(row.direction));
  const status = s(row.status);
  const ts = fmtDateTime(row.timeline_at);
  const source = s(row.source_table);
  const preview = previewText(row);
  const hasMeta =
    row.metadata != null &&
    typeof row.metadata === "object" &&
    Object.keys(row.metadata as Row).length > 0;

  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[21px] top-2.5 h-2.5 w-2.5 rounded-full ring-2 ring-background",
          dotClass(cat),
        )}
      />
      <div className="rounded-md border border-border bg-background px-3 py-2">
        <div className="flex items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {direction && <span>{direction}</span>}
              {channel && (
                <>
                  {direction && <span>·</span>}
                  <span>{channelLabel(channel)}</span>
                </>
              )}
              {status && (
                <>
                  <span>·</span>
                  <span className="rounded bg-muted px-1 py-0.5 text-[10px]">
                    {status}
                  </span>
                </>
              )}
              <span className="ml-auto text-[10px]">{ts}</span>
            </div>
            <div
              className="truncate text-sm font-medium text-foreground"
              title={title}
            >
              {title}
            </div>
            {preview && (
              <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {preview}
              </div>
            )}
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {source || s(row.activity_type)}
              </span>
              {hasMeta && (
                <button
                  type="button"
                  onClick={() => setOpen((o) => !o)}
                  className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  {open ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  Metadata
                </button>
              )}
            </div>
            {open && hasMeta && (
              <pre className="mt-1.5 max-h-60 overflow-auto rounded border border-border bg-muted/30 p-2 text-[10px] leading-snug text-foreground">
                {JSON.stringify(row.metadata, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export default UnifiedActivityTimeline;