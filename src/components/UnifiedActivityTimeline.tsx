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
  ArrowDownLeft,
  ArrowUpRight,
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function fmtDayDivider(value: unknown): string {
  const str = s(value);
  if (!str) return "—";
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return new Intl.DateTimeFormat("lv-LV", {
    timeZone: "Europe/Riga",
    weekday: "short",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

function dayKey(value: unknown): string {
  const str = s(value);
  if (!str) return "";
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Riga",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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
    if (v) return v.replace(/\s+/g, " ");
  }
  const meta = row.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const m = meta as Row;
    for (const k of ["body_preview", "preview", "summary", "description"]) {
      const v = s(m[k]).trim();
      if (v) return v.replace(/\s+/g, " ");
    }
  }
  return "";
}

const SUBJECT_PREFIX_RE = /^\s*(?:re|fw|fwd|sv|aw|antw|wg|tr)\s*(?:\[\d+\])?\s*:\s*/i;
function normalizeSubject(title: string): string {
  let t = title.trim();
  // strip repeated prefixes (e.g. "Sv: RE: Foo")
  for (let i = 0; i < 6; i++) {
    const next = t.replace(SUBJECT_PREFIX_RE, "");
    if (next === t) break;
    t = next;
  }
  return t.replace(/\s+/g, " ").trim().toLowerCase();
}

function isEmailRow(row: Row): boolean {
  const t = s(row.activity_type).toLowerCase();
  if (!COMMUNICATIONS.has(t)) return false;
  const ch = s(row.channel).toLowerCase();
  return ch === "email" || ch === "" /* tolerate missing channel for email_event */;
}

type ThreadUnit = { kind: "thread"; key: string; messages: Row[] };
type SingleUnit = { kind: "single"; key: string; row: Row };
type Unit = ThreadUnit | SingleUnit;

function buildUnits(rows: Row[]): Unit[] {
  // rows are desc by timeline_at. Group emails by normalized subject; first
  // occurrence in iteration = latest message → defines the thread's slot.
  const threadIdx = new Map<string, number>();
  const units: Unit[] = [];
  rows.forEach((row, idx) => {
    if (!isEmailRow(row)) {
      units.push({ kind: "single", key: `s:${s(row.source_table)}:${s(row.id)}:${idx}`, row });
      return;
    }
    const subject = s(row.title) || s(row.activity_subtype) || "";
    const norm = normalizeSubject(subject);
    if (!norm) {
      units.push({ kind: "single", key: `s:${s(row.source_table)}:${s(row.id)}:${idx}`, row });
      return;
    }
    const tk = `t:${norm}`;
    let pos = threadIdx.get(tk);
    if (pos == null) {
      pos = units.length;
      threadIdx.set(tk, pos);
      units.push({ kind: "thread", key: tk, messages: [row] });
    } else {
      (units[pos] as ThreadUnit).messages.push(row);
    }
  });
  // Collapse single-message threads back to single units to avoid noise.
  return units.map((u) =>
    u.kind === "thread" && u.messages.length === 1
      ? { kind: "single", key: `s:${s(u.messages[0].source_table)}:${s(u.messages[0].id)}`, row: u.messages[0] }
      : u,
  );
}

function unitTimestamp(u: Unit): unknown {
  if (u.kind === "single") return u.row.timeline_at;
  // messages are inserted desc; first one is newest
  return u.messages[0]?.timeline_at;
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
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const query = leadId
    ? `lead_id=eq.${encodeURIComponent(leadId)}&order=timeline_at.desc&limit=${limit}`
    : "";

  const q = useAnalyticsView("unified_activity_timeline", query, {
    enabled: !!leadId,
  });

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

  const units = useMemo(() => buildUnits(filtered), [filtered]);

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
        <ol className="relative border-l border-border pl-4">
          {units.map((u, idx) => {
            const ts = unitTimestamp(u);
            const dk = dayKey(ts);
            const prevDk = idx > 0 ? dayKey(unitTimestamp(units[idx - 1])) : "";
            const showDivider = dk !== prevDk;
            return (
              <div key={u.key}>
                {showDivider && (
                  <li className="relative -ml-4 list-none pl-4 pt-3 first:pt-0">
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                      {fmtDayDivider(ts)}
                    </div>
                  </li>
                )}
                {u.kind === "single" ? (
                  <TimelineItem
                    row={u.row}
                    selected={selectedKey === u.key}
                    onSelect={() =>
                      setSelectedKey((cur) => (cur === u.key ? null : u.key))
                    }
                  />
                ) : (
                  <ThreadItem
                    unit={u}
                    selectedKey={selectedKey}
                    onSelect={(k) =>
                      setSelectedKey((cur) => (cur === k ? null : k))
                    }
                  />
                )}
              </div>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function ThreadItem({
  unit,
  selectedKey,
  onSelect,
}: {
  unit: ThreadUnit;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // unit.messages are in desc order (newest first). Latest = [0].
  const latest = unit.messages[0];
  const cat = categoryOf(latest);
  const count = unit.messages.length;
  const inbound = unit.messages.filter((m) =>
    ["inbound", "in"].includes(s(m.direction).toLowerCase()),
  ).length;
  const outbound = count - inbound;
  const hasInboundLatest = ["inbound", "in"].includes(
    s(latest.direction).toLowerCase(),
  );
  const subject =
    s(latest.title) || s(latest.activity_subtype) || "—";
  // Strip subject prefix for thread title
  const threadTitle = subject.replace(SUBJECT_PREFIX_RE, "").trim() || subject;
  const ts = fmtDateTime(latest.timeline_at);
  const preview = previewText(latest);

  // Chronological (oldest → newest) inside thread
  const ordered = [...unit.messages].reverse();

  return (
    <li className="relative py-0.5">
      <span
        className={cn(
          "absolute -left-[19px] top-2.5 h-2 w-2 rounded-full ring-2 ring-background",
          dotClass(cat),
        )}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className={cn(
          "cursor-pointer rounded-md border px-2.5 py-1.5 transition-colors",
          hasInboundLatest && !open
            ? "border-blue-500/30 bg-blue-500/5"
            : open
              ? "border-border bg-accent/30"
              : "border-transparent hover:bg-accent/20",
        )}
      >
        <div className="flex items-start gap-2">
          {open ? (
            <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <div
                className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
                title={threadTitle}
              >
                {threadTitle}
              </div>
              <span
                className={cn(
                  "inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-medium tabular-nums",
                  hasInboundLatest
                    ? "bg-blue-500 text-white"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {ts}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted-foreground/80">
              <span className="inline-flex items-center gap-0.5">
                <ArrowDownLeft className="h-3 w-3" /> {inbound}
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-0.5">
                <ArrowUpRight className="h-3 w-3" /> {outbound}
              </span>
              <span>·</span>
              <span>Email</span>
            </div>
            {!open && preview && (
              <div className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
                {preview}
              </div>
            )}
          </div>
        </div>
      </div>

      {open && (
        <ol className="mt-1 ml-3 space-y-0.5 border-l border-border/60 pl-3">
          {ordered.map((row, idx) => {
            const k = `${unit.key}:${s(row.id)}:${idx}`;
            return (
              <TimelineItem
                key={k}
                row={row}
                selected={selectedKey === k}
                onSelect={() => onSelect(k)}
                compact
              />
            );
          })}
        </ol>
      )}
    </li>
  );
}

function TimelineItem({
  row,
  selected,
  onSelect,
  compact = false,
}: {
  row: Row;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  const [showMeta, setShowMeta] = useState(false);
  const cat = categoryOf(row);
  const Icon = iconFor(row);
  const title =
    s(row.title) || s(row.activity_subtype) || s(row.activity_type) || "—";
  const channel = s(row.channel);
  const direction = dirLabel(s(row.direction));
  const status = s(row.status);
  const ts = fmtDateTime(row.timeline_at);
  const preview = previewText(row);
  const hasMeta =
    row.metadata != null &&
    typeof row.metadata === "object" &&
    Object.keys(row.metadata as Row).length > 0;

  return (
    <li className="relative py-0.5">
      {!compact && (
        <span
          className={cn(
            "absolute -left-[19px] top-2.5 h-2 w-2 rounded-full ring-2 ring-background",
            dotClass(cat),
          )}
        />
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          "cursor-pointer rounded-md border px-2.5 py-1.5 transition-colors",
          selected
            ? "border-border bg-accent/40"
            : "border-transparent hover:bg-accent/20",
        )}
      >
        <div className="flex items-start gap-2">
          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <div
                className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
                title={title}
              >
                {title}
              </div>
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {ts}
              </span>
            </div>
            {(direction || channel || status) && (
              <div className="flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted-foreground/80">
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
                    <span>{status}</span>
                  </>
                )}
              </div>
            )}
            {preview && (
              <div
                className={cn(
                  "mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground",
                  !selected && "line-clamp-2",
                )}
              >
                {preview}
              </div>
            )}
            {selected && hasMeta && (
              <div className="mt-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMeta((o) => !o);
                  }}
                  className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/60 hover:text-muted-foreground"
                >
                  {showMeta ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  Metadata
                </button>
                {showMeta && (
                  <pre className="mt-1 max-h-60 overflow-auto rounded border border-border bg-muted/30 p-2 text-[10px] leading-snug text-foreground">
                    {JSON.stringify(row.metadata, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export default UnifiedActivityTimeline;