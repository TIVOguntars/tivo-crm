import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import {
  Phone,
  MessageCircle,
  Mail,
  CheckSquare,
  StickyNote,
  Plus,
  Upload,
  Bookmark,
  Filter,
  Columns3,
  ChevronDown,
  ChevronRight,
  X,
  Search,
  AlertTriangle,
  Zap,
  Star,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LoadingState, ErrorState } from "@/components/DataState";
import { LeadDrawer } from "@/components/LeadDrawer";
import { BulkActionsBar, type BulkPatch } from "@/components/BulkActionsBar";
import { useCrmView } from "@/hooks/useCrmView";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import { cn } from "@/lib/utils";
import type { FiltersSearch } from "@/lib/filters";

/* ----------------------- Saved views ----------------------- */

const VIEWS = [
  "all",
  "mani",
  "jauni",
  "sodien",
  "bez_kontakta",
  "karstie",
  "konflikti",
  "atbildeja",
  "gaida_atbildi",
  "aktiva_sazina",
  "nav_kontakta",
] as const;
type View = (typeof VIEWS)[number];

const VIEW_LABELS: Record<View, string> = {
  all: "Visi",
  mani: "Mani",
  jauni: "Jauni",
  sodien: "Šodien",
  bez_kontakta: "Bez kontakta",
  karstie: "Karstie",
  konflikti: "Konflikti",
  atbildeja: "Atbildēja",
  gaida_atbildi: "Gaida atbildi",
  aktiva_sazina: "Aktīva saziņa",
  nav_kontakta: "Nav kontakta",
};

const leadiSearchSchema = z.object({
  seg: fallback(z.enum(VIEWS), "all").default("all"),
  status: fallback(z.array(z.string()), []).default([]),
  q: fallback(z.string().optional(), undefined),
  countries: fallback(z.array(z.string()), []).default([]),
  sources: fallback(z.array(z.string()), []).default([]),
  owners: fallback(z.array(z.string()), []).default([]),
  ppvs: fallback(z.array(z.string()), []).default([]),
  tags: fallback(z.array(z.string()), []).default([]),
});

export const Route = createFileRoute("/leadi")({
  validateSearch: zodValidator(leadiSearchSchema),
  component: LeadiPage,
});

/* ----------------------- Types & helpers ----------------------- */

type Row = Record<string, unknown>;
const PAGE_SIZE = 300;

interface Lead {
  lead_id: string;
  name: string;
  phone: string;
  email: string;
  country: string;
  secondary: string;
  source: string;
  status: string;
  owner: string;
  ppv: string;
  next_action: string;
  next_action_due: string | null;
  last_activity: string | null;
  tags: string[];
  created_at: string | null;
  unread_replies: number;
  communication_state: string;
  communication_label: string;
  has_unread_reply: boolean;
  reply_count: number;
  last_reply_at: string | null;
  last_communication_at: string | null;
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  is_hot: boolean;
  priority_score: number;
}

function s(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}
function asTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((t) => String(t).trim()).filter(Boolean);
  if (v == null) return [];
  return String(v)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
function parseDate(v: unknown): number | null {
  if (v == null || v === "") return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}
function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v.trim(),
  );
}
function leadDisplayName(r: Row): string {
  const candidates = [
    s(r.display_name),
    s(r.full_name),
    s(r.name),
    s(r.object_name),
  ];
  for (const n of candidates) {
    if (n && !isUuidLike(n)) return n;
  }
  return "";
}
function initials(name: string): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "—";
}

const MS_MIN = 60_000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;

// Single shared grid template for header, queue separator and data rows.
// Columns: selection | priority | ppv | lead | tags | status | owner | next_action | last_activity | actions
// Tuned to fit within desktop viewport with no horizontal scroll.
const LEADS_GRID =
  "grid grid-cols-[32px_92px_64px_minmax(180px,1.3fr)_minmax(120px,1fr)_120px_130px_140px_140px_124px]";

function relativeTime(v: string | null): string {
  const t = parseDate(v);
  if (t == null) return "—";
  const diff = Date.now() - t;
  if (diff < 0) {
    const ahead = -diff;
    if (ahead < MS_HOUR) return `pēc ${Math.max(1, Math.round(ahead / MS_MIN))}m`;
    if (ahead < MS_DAY) return `pēc ${Math.round(ahead / MS_HOUR)}h`;
    return `pēc ${Math.round(ahead / MS_DAY)}d`;
  }
  if (diff < 5 * MS_MIN) return "tikko";
  if (diff < MS_HOUR) return `pirms ${Math.round(diff / MS_MIN)}m`;
  if (diff < 6 * MS_HOUR) return `pirms ${Math.round(diff / MS_HOUR)}h`;
  const now = new Date();
  const then = new Date(t);
  const sameDay =
    now.getFullYear() === then.getFullYear() &&
    now.getMonth() === then.getMonth() &&
    now.getDate() === then.getDate();
  if (sameDay) return "šodien";
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  const isYest =
    yest.getFullYear() === then.getFullYear() &&
    yest.getMonth() === then.getMonth() &&
    yest.getDate() === then.getDate();
  if (isYest) return "vakar";
  const days = Math.round(diff / MS_DAY);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}m`;
  return `${Math.round(days / 365)}g`;
}

/** Operational date format: DD.MM.YYYY (no time). */
function fmtDate(v: string | null): string {
  const t = parseDate(v);
  if (t == null) return "—";
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, "0")}.${String(
    d.getMonth() + 1,
  ).padStart(2, "0")}.${d.getFullYear()}`;
}

/** Operational date+time when SLA-critical or manually scheduled. */
function fmtDateTime(v: string | null): string {
  const t = parseDate(v);
  if (t == null) return "—";
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, "0")}.${String(
    d.getMonth() + 1,
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

function isSameDay(t: number, now = Date.now()): boolean {
  const a = new Date(t);
  const b = new Date(now);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/* ----------------------- Status badge ----------------------- */

function statusTone(status: string): string {
  const k = status.toLowerCase();
  if (!k) return "bg-muted text-muted-foreground border-transparent";
  if (k.includes("jauns"))
    return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30";
  if (k.includes("līgum") || k.includes("ligum") || k.includes("won") || k.includes("contract"))
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  if (k.includes("piedāvāj") || k.includes("piedavaj") || k.includes("pieprasīj") || k.includes("pieprasij"))
    return "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30";
  if (k.includes("sarunās") || k.includes("sarunas") || k.includes("aktīv") || k.includes("aktiv"))
    return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  if (k.includes("nesasn") || k.includes("bounce") || k.includes("nederīg") || k.includes("zaud"))
    return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";
  if (k.includes("konflikt"))
    return "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30";
  return "bg-secondary text-secondary-foreground border-transparent";
}

function StatusBadge({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-flex h-4 items-center rounded-sm px-1 text-[10.5px] font-medium leading-none",
        statusTone(value),
      )}
    >
      {value}
    </span>
  );
}

/** PRIORITĀTE column — stars + muted score. */
function PriorityCell({ score }: { score: number }) {
  const stars = Math.max(0, Math.min(5, Math.round(score / 20)));
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-flex items-center text-amber-500/90 dark:text-amber-400/80"
        aria-label={`Prioritāte ${stars} no 5`}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={cn(
              "h-2.5 w-2.5",
              i < stars
                ? "fill-current"
                : "text-muted-foreground/25 fill-transparent",
            )}
            strokeWidth={1.5}
          />
        ))}
      </span>
      <span className="text-[10px] tabular-nums text-muted-foreground/70">
        {score || 0}
      </span>
    </div>
  );
}

type CommBuckets = {
  call: [number, number];
  email: [number, number];
  chat: [number, number];
};

function CommStats({
  counts,
  hasUnread,
}: {
  counts: CommBuckets | undefined;
  hasUnread: boolean;
}) {
  if (!counts) return <span className="text-muted-foreground/40">—</span>;
  const items = (
    [
      { icon: "📞", label: "Zvani", out: counts.call[0], inn: counts.call[1] },
      { icon: "✉️", label: "E-pasti", out: counts.email[0], inn: counts.email[1] },
      { icon: "💬", label: "Ziņas", out: counts.chat[0], inn: counts.chat[1] },
    ] as const
  ).filter((it) => it.out > 0 || it.inn > 0);
  if (items.length === 0) return <span className="text-muted-foreground/40">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 align-middle tabular-nums">
      {items.map((it) => {
        return (
          <span
            key={it.label}
            className={cn(
              "inline-flex items-center gap-0.5 leading-none",
              hasUnread && it.inn > 0
                ? "text-blue-600/90 dark:text-blue-300/90"
                : "text-muted-foreground/80",
            )}
          >
            <span className="text-[10px]">{it.icon}</span>
            <span className="text-[10.5px]">
              {it.out}
              <span className="opacity-50">/</span>
              {it.inn}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/* ----------------------- Filter chip popover ----------------------- */

function FilterChip({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      options.filter((o) =>
        q ? o.toLowerCase().includes(q.toLowerCase()) : true,
      ),
    [options, q],
  );
  const toggle = (opt: string) => {
    if (value.includes(opt)) onChange(value.filter((v) => v !== opt));
    else onChange([...value, opt]);
  };
  const active = value.length > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors",
            active
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-border bg-background text-foreground hover:bg-muted/50",
          )}
        >
          <span className="font-medium">{label}</span>
          {active && (
            <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {value.length}
            </span>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Meklēt: ${label.toLowerCase()}`}
              className="h-7 w-full rounded border border-input bg-background pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              Nav rezultātu
            </div>
          ) : (
            filtered.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs hover:bg-muted/50"
              >
                <Checkbox
                  checked={value.includes(opt)}
                  onCheckedChange={() => toggle(opt)}
                  className="h-3.5 w-3.5"
                />
                <span className="truncate text-foreground">{opt}</span>
              </label>
            ))
          )}
        </div>
        {active && (
          <div className="border-t border-border p-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-full justify-center text-xs"
              onClick={() => onChange([])}
            >
              Notīrīt
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ----------------------- Page ----------------------- */

function LeadiPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const seg: View = (search.seg as View) ?? "all";
  const q = (search.q ?? "").trim().toLowerCase();
  const fStatus = (search.status ?? []) as string[];
  const fOwners = (search.owners ?? []) as string[];
  const fPpvs = (search.ppvs ?? []) as string[];
  const fCountries = (search.countries ?? []) as string[];
  const fTags = (search.tags ?? []) as string[];

  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Optimistic per-row patches keyed by lead_id; applied after server data
  // resolves, so drawer mutations reflect immediately without table reload.
  const [patches, setPatches] = useState<Record<string, Partial<Lead>>>({});

  // Persisted queue collapse state
  const [collapsedQueues, setCollapsedQueues] = useState<Record<string, boolean>>(
    () => {
      if (typeof window === "undefined") return {};
      try {
        const raw = window.localStorage.getItem("leadi.collapsedQueues");
        return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
      } catch {
        return {};
      }
    },
  );
  const toggleQueue = useCallback((id: string) => {
    setCollapsedQueues((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem(
          "leadi.collapsedQueues",
          JSON.stringify(next),
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Auto-next mode (default on for unread queue)
  const [autoNext, setAutoNext] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const v = window.localStorage.getItem("leadi.autoNext");
      return v == null ? true : v === "1";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("leadi.autoNext", autoNext ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [autoNext]);

  // Keyboard navigation cursor (index into the visible flat list)
  const [activeIdx, setActiveIdx] = useState<number>(-1);

  const overviewQuery = useMemo(
    () =>
      ["select=*", "order=created_at.desc.nullslast", `limit=${PAGE_SIZE}`].join(
        "&",
      ),
    [],
  );

  const overview = useCrmView(
    "next_action_queue_display_enriched",
    overviewQuery,
  );
  const filterOptions = useAnalyticsView("filter_options", "limit=1");

  // Per-lead communication counters (📞 / ✉️ / 💬 outbound/inbound).
  // Aggregated from crm.communications since the enriched queue view
  // does not expose channel-level counts.
  const commsStats = useCrmView(
    "communications",
    "select=lead_id,channel,direction,status&limit=20000",
  );
  const commCounts = useMemo(() => {
    const map = new Map<
      string,
      { call: [number, number]; email: [number, number]; chat: [number, number] }
    >();
    const rows = (commsStats.data?.rows ?? []) as Row[];
    for (const r of rows) {
      const lid = s(r.lead_id);
      if (!lid) continue;
      const st = s(r.status).toLowerCase();
      if (st && !["sent", "delivered", "replied"].includes(st)) continue;
      const ch = s(r.channel).toLowerCase();
      const dir = s(r.direction).toLowerCase();
      let bucket: "call" | "email" | "chat" | null = null;
      if (ch === "call" || ch.includes("phone") || ch.includes("zvan")) bucket = "call";
      else if (ch.includes("mail") || ch.includes("past")) bucket = "email";
      else if (
        ch === "sms" ||
        ch.includes("whats") ||
        ch.includes("messeng") ||
        ch.includes("chat") ||
        ch.includes("telegram")
      )
        bucket = "chat";
      if (!bucket) continue;
      const isInbound = dir === "inbound" || dir === "in";
      const isOutbound = dir === "outbound" || dir === "out";
      if (!isInbound && !isOutbound) continue;
      const cur =
        map.get(lid) ??
        { call: [0, 0] as [number, number], email: [0, 0] as [number, number], chat: [0, 0] as [number, number] };
      const slot = isOutbound ? 0 : 1;
      cur[bucket][slot] += 1;
      map.set(lid, cur);
    }
    return map;
  }, [commsStats.data]);

  const errorMsg =
    (overview.error as Error | null)?.message || overview.data?.error;
  const loading = overview.isLoading;

  const leads = useMemo<Lead[]>(() => {
    const rows = (overview.data?.rows ?? []) as Row[];
    return rows
      .map((r) => {
        const id = s(r.lead_id);
        if (!id) return null;
        const phone = s(
          r.phone_e164 || r.telefons_e164 || r.telefons_raw || r.phone_raw,
        );
        const email = s(r.email_normalized || r.email);
        const country = s(r.country);
        const secondary = phone || email || country;
        const next_action_due =
          s(r.effective_due_at) || s(r.visible_action_due_at) || null;
        const next_action =
          s(r.action_label) ||
          s(r.nakama_darbiba) ||
          s(r.visible_action) ||
          s(r.next_action);
        const last_activity =
          s(r.last_contact_date) ||
          s(r.last_communication_at) ||
          s(r.updated_at) ||
          null;
        const has_unread_reply =
          r.has_unread_reply === true || r.has_unread_reply === "true";
        const reply_count = Number(r.reply_count ?? 0) || 0;
        const communication_state = s(r.communication_state).toLowerCase();
        const tagsArr = asTags(r.tags);
        const statusStr = s(r.lead_status_label || r.status);
        return {
          lead_id: id,
          name: leadDisplayName(r),
          phone,
          email,
          country,
          secondary,
          source: s(r.source),
          status: statusStr,
          owner: s(r.action_owner_label),
          ppv: s(r.ppv_name || r.ppv_vards),
          next_action,
          next_action_due,
          last_activity,
          tags: tagsArr,
          created_at: s(r.created_at) || null,
          unread_replies:
            Number(r.unread_replies ?? r.unread_count ?? reply_count) || 0,
          communication_state,
          communication_label: s(r.communication_label),
          has_unread_reply,
          reply_count,
          last_reply_at: s(r.last_reply_at) || null,
          last_communication_at: s(r.last_communication_at) || null,
          last_outbound_at: s(r.last_outbound_at) || null,
          last_inbound_at: s(r.last_inbound_at) || null,
          is_hot:
            tagsArr.some((t) => /^(hot|karst)/i.test(t)) ||
            /karst/i.test(statusStr),
          priority_score: Number(r.priority_score ?? r.priority ?? 0) || 0,
        } as Lead;
      })
      .filter((x): x is Lead => x !== null);
  }, [overview.data]);

  // Apply optimistic patches on top of server data
  const leadsPatched = useMemo(() => {
    if (Object.keys(patches).length === 0) return leads;
    return leads.map((l) =>
      patches[l.lead_id] ? { ...l, ...patches[l.lead_id] } : l,
    );
  }, [leads, patches]);

  const options = useMemo(() => {
    const fo = (filterOptions.data?.rows ?? [])[0] as Row | undefined;
    const fromArr = (v: unknown) =>
      Array.isArray(v) ? v.map(String).filter(Boolean) : [];
    const dedupe = (arr: string[]) =>
      Array.from(new Set(arr.filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "lv"),
      );
    return {
      statuses: dedupe(
        fromArr(fo?.statuses).length
          ? fromArr(fo?.statuses)
          : leadsPatched.map((l) => l.status),
      ),
      countries: dedupe(
        fromArr(fo?.countries).length
          ? fromArr(fo?.countries)
          : leadsPatched.map((l) => l.country),
      ),
      owners: dedupe(
        fromArr(fo?.owners).length
          ? fromArr(fo?.owners)
          : leadsPatched.map((l) => l.owner),
      ),
      ppvs: dedupe(
        fromArr(fo?.ppvs).length ? fromArr(fo?.ppvs) : leads.map((l) => l.ppv),
      ),
      tags: dedupe(leadsPatched.flatMap((l) => l.tags)),
    };
  }, [filterOptions.data, leads, leadsPatched]);

  const filtered = useMemo(() => {
    const tagsLower = fTags.map((t) => t.toLowerCase());
    return leadsPatched.filter((l) => {
      if (fStatus.length && !fStatus.includes(l.status)) return false;
      if (fOwners.length && !fOwners.includes(l.owner)) return false;
      if (fPpvs.length && !fPpvs.includes(l.ppv)) return false;
      if (fCountries.length && !fCountries.includes(l.country)) return false;
      if (tagsLower.length) {
        const lower = l.tags.map((t) => t.toLowerCase());
        if (!tagsLower.every((t) => lower.includes(t))) return false;
      }
      // segments
      switch (seg) {
        case "all":
          break;
        case "mani":
          // No identity context — treat as no filter rather than fake data
          break;
        case "jauni":
          if (!/jauns/i.test(l.status)) return false;
          break;
        case "sodien": {
          const t = parseDate(l.created_at);
          if (t == null || !isSameDay(t)) return false;
          break;
        }
        case "bez_kontakta":
          if (parseDate(l.last_activity) != null) return false;
          break;
        case "karstie":
          if (
            !l.tags.some((t) => /^(hot|karst)/i.test(t)) &&
            !/karst/i.test(l.status)
          )
            return false;
          break;
        case "konflikti":
          if (
            !l.tags.some((t) => /konflikt/i.test(t)) &&
            !/konflikt/i.test(l.status)
          )
            return false;
          break;
        case "atbildeja":
          if (!l.has_unread_reply) return false;
          break;
        case "gaida_atbildi":
          if (l.communication_state !== "waiting") return false;
          break;
        case "aktiva_sazina":
          if (l.communication_state !== "active") return false;
          break;
        case "nav_kontakta":
          if (l.communication_state !== "no_contact") return false;
          break;
      }
      if (q) {
        const hay =
          `${l.name} ${l.email} ${l.phone} ${l.next_action}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leadsPatched, fStatus, fOwners, fPpvs, fCountries, fTags, seg, q]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      // 1. unread reply first
      if (a.has_unread_reply !== b.has_unread_reply)
        return a.has_unread_reply ? -1 : 1;
      // 2. overdue effective_due_at
      const now = Date.now();
      const aDue = parseDate(a.next_action_due);
      const bDue = parseDate(b.next_action_due);
      const aOver = aDue != null && aDue < now;
      const bOver = bDue != null && bDue < now;
      if (aOver !== bOver) return aOver ? -1 : 1;
      if (aOver && bOver) return (aDue ?? 0) - (bDue ?? 0);
      // 3. hot / high priority
      if (a.is_hot !== b.is_hot) return a.is_hot ? -1 : 1;
      if (a.priority_score !== b.priority_score)
        return b.priority_score - a.priority_score;
      // 4. waiting response
      const aWait = a.communication_state === "waiting";
      const bWait = b.communication_state === "waiting";
      if (aWait !== bWait) return aWait ? -1 : 1;
      // future due
      if (aDue !== bDue) {
        if (aDue == null) return 1;
        if (bDue == null) return -1;
        return aDue - bDue;
      }
      // 5. newest activity
      const aL =
        parseDate(a.last_communication_at) ?? parseDate(a.last_activity) ?? 0;
      const bL =
        parseDate(b.last_communication_at) ?? parseDate(b.last_activity) ?? 0;
      return bL - aL;
    });
    return copy;
  }, [filtered]);

  /* ----------------------- Queue grouping ----------------------- */
  type QueueId =
    | "unread"
    | "overdue"
    | "waiting"
    | "active"
    | "no_contact"
    | "other";
  const QUEUE_DEFS: {
    id: QueueId;
    label: string;
    accent: string;
    dot: string;
    defaultCollapsed: boolean;
  }[] = [
    {
      id: "unread",
      label: "Nepieciešama reakcija",
      accent: "border-l-blue-500/70",
      dot: "bg-blue-500",
      defaultCollapsed: false,
    },
    {
      id: "overdue",
      label: "Kavēti",
      accent: "border-l-rose-500/70",
      dot: "bg-rose-500",
      defaultCollapsed: false,
    },
    {
      id: "waiting",
      label: "Gaidām klientu",
      accent: "border-l-amber-500/70",
      dot: "bg-amber-500",
      defaultCollapsed: false,
    },
    {
      id: "active",
      label: "Aktīvi",
      accent: "border-l-emerald-500/60",
      dot: "bg-emerald-500",
      defaultCollapsed: true,
    },
    {
      id: "no_contact",
      label: "Bez kontakta",
      accent: "border-l-muted-foreground/40",
      dot: "bg-muted-foreground/60",
      defaultCollapsed: true,
    },
    {
      id: "other",
      label: "Citi",
      accent: "border-l-border",
      dot: "bg-muted-foreground/40",
      defaultCollapsed: true,
    },
  ];

  const queues = useMemo(() => {
    const buckets: Record<QueueId, Lead[]> = {
      unread: [],
      overdue: [],
      waiting: [],
      active: [],
      no_contact: [],
      other: [],
    };
    const now = Date.now();
    for (const l of sorted) {
      if (l.has_unread_reply) {
        buckets.unread.push(l);
        continue;
      }
      const dueT = parseDate(l.next_action_due);
      if (dueT != null && dueT < now) {
        buckets.overdue.push(l);
        continue;
      }
      if (l.communication_state === "waiting") {
        buckets.waiting.push(l);
        continue;
      }
      if (l.communication_state === "active") {
        buckets.active.push(l);
        continue;
      }
      if (l.communication_state === "no_contact") {
        buckets.no_contact.push(l);
        continue;
      }
      buckets.other.push(l);
    }
    return buckets;
  }, [sorted]);

  // Per-queue operational metrics
  type QueueMetrics = {
    count: number;
    breach: number;
    avgWaitMin: number;
  };
  const queueMetrics = useMemo<Record<string, QueueMetrics>>(() => {
    const now = Date.now();
    const out: Record<string, QueueMetrics> = {};
    (Object.keys(queues) as Array<keyof typeof queues>).forEach((qid) => {
      const items = queues[qid];
      let breach = 0;
      let waitSum = 0;
      let waitN = 0;
      for (const l of items) {
        // SLA reference: unread → time since last reply; overdue → time past due;
        // waiting → since last outbound; others → since last activity.
        let waitMs = 0;
        if (qid === "unread") {
          const t =
            parseDate(l.last_reply_at) ??
            parseDate(l.last_inbound_at) ??
            parseDate(l.last_communication_at) ??
            parseDate(l.created_at);
          if (t != null) waitMs = Math.max(0, now - t);
          if (waitMs > 4 * MS_HOUR) breach += 1;
        } else if (qid === "overdue") {
          const t = parseDate(l.next_action_due);
          if (t != null) waitMs = Math.max(0, now - t);
          if (waitMs > 7 * MS_DAY) breach += 1;
        } else if (qid === "waiting") {
          const t =
            parseDate(l.last_outbound_at) ??
            parseDate(l.last_communication_at);
          if (t != null) waitMs = Math.max(0, now - t);
          if (waitMs > 3 * MS_DAY) breach += 1;
        } else {
          const t =
            parseDate(l.last_communication_at) ??
            parseDate(l.last_activity) ??
            parseDate(l.created_at);
          if (t != null) waitMs = Math.max(0, now - t);
        }
        if (waitMs > 0) {
          waitSum += waitMs;
          waitN += 1;
        }
      }
      out[qid as string] = {
        count: items.length,
        breach,
        avgWaitMin: waitN ? Math.round(waitSum / waitN / MS_MIN) : 0,
      };
    });
    return out;
  }, [queues]);

  // Flat visible row order (respects collapse) — drives keyboard nav and auto-next
  const visibleRows = useMemo<Lead[]>(() => {
    const out: Lead[] = [];
    for (const q of QUEUE_DEFS) {
      const items = queues[q.id];
      if (items.length === 0) continue;
      const collapsed = collapsedQueues[q.id] ?? q.defaultCollapsed;
      if (collapsed) continue;
      out.push(...items);
    }
    return out;
  }, [queues, collapsedQueues]);

  // Map lead_id → its queue id (for auto-next)
  const leadQueueMap = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    (Object.keys(queues) as Array<keyof typeof queues>).forEach((qid) => {
      queues[qid].forEach((l) => {
        m[l.lead_id] = qid as string;
      });
    });
    return m;
  }, [queues]);

  const setSearch = useCallback(
    (patch: Record<string, unknown>) => {
      navigate({
        to: "/leadi",
        search: ((prev: Record<string, unknown>) => ({ ...prev, ...patch })) as never,
        replace: true,
      });
    },
    [navigate],
  );

  const clearFilters = () =>
    setSearch({
      seg: undefined,
      status: [],
      countries: [],
      owners: [],
      ppvs: [],
      tags: [],
      q: undefined,
    });

  const hasAnyFilter =
    seg !== "all" ||
    fStatus.length > 0 ||
    fOwners.length > 0 ||
    fPpvs.length > 0 ||
    fCountries.length > 0 ||
    fTags.length > 0 ||
    !!q;

  const allVisibleSelected =
    sorted.length > 0 && sorted.every((l) => selected.has(l.lead_id));
  const toggleAll = () => {
    if (allVisibleSelected) {
      const next = new Set(selected);
      sorted.forEach((l) => next.delete(l.lead_id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      sorted.forEach((l) => next.add(l.lead_id));
      setSelected(next);
    }
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const clearSelected = () => setSelected(new Set());

  const patchLead = useCallback((id: string, patch: Partial<Lead>) => {
    setPatches((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const bumpActivity = useCallback(
    (id: string) => patchLead(id, { last_activity: new Date().toISOString() }),
    [patchLead],
  );

  const openLead = useCallback(
    (id: string) => {
      setDrawerLeadId(id);
      setDrawerOpen(true);
      const idx = visibleRows.findIndex((l) => l.lead_id === id);
      if (idx >= 0) setActiveIdx(idx);
    },
    [visibleRows],
  );

  // Auto-next: after a workflow action completes inside the drawer,
  // advance to the next lead in the same queue (or close if none left).
  const handleActionCompleted = useCallback(
    (leadId: string) => {
      bumpActivity(leadId);
      if (!autoNext) return;
      const qid = leadQueueMap[leadId];
      if (!qid) return;
      const peers = (queues as Record<string, Lead[]>)[qid] ?? [];
      const i = peers.findIndex((l) => l.lead_id === leadId);
      const next = peers[i + 1] ?? peers.find((l) => l.lead_id !== leadId);
      if (next) {
        openLead(next.lead_id);
      } else {
        setDrawerOpen(false);
      }
    },
    [autoNext, leadQueueMap, queues, openLead, bumpActivity],
  );

  // Keyboard workflow
  const phoneRef = useRef<string>("");
  const emailRef = useRef<string>("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        if (drawerOpen) {
          setDrawerOpen(false);
          e.preventDefault();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        if (visibleRows.length === 0) return;
        setActiveIdx((i) => Math.min(visibleRows.length - 1, i + 1));
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowUp") {
        if (visibleRows.length === 0) return;
        setActiveIdx((i) => (i <= 0 ? 0 : i - 1));
        e.preventDefault();
        return;
      }
      if (e.key === "Enter") {
        const row = visibleRows[activeIdx];
        if (row) {
          openLead(row.lead_id);
          e.preventDefault();
        }
        return;
      }
      const row = visibleRows[activeIdx];
      if (!row) return;
      const k = e.key.toLowerCase();
      if (k === "w" && row.phone) {
        window.open(
          `https://wa.me/${row.phone.replace(/[^0-9]/g, "")}`,
          "_blank",
        );
        bumpActivity(row.lead_id);
        e.preventDefault();
      } else if (k === "e" && row.email) {
        window.location.href = `mailto:${row.email}`;
        bumpActivity(row.lead_id);
        e.preventDefault();
      } else if (k === "c" && row.phone) {
        window.location.href = `tel:${row.phone}`;
        bumpActivity(row.lead_id);
        e.preventDefault();
      } else if (k === "t" || k === "r" || k === "s" || k === "a") {
        // T = task, R = reply, S = status, A = assign — open drawer
        openLead(row.lead_id);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIdx, visibleRows, drawerOpen, openLead, bumpActivity]);
  // suppress unused-ref lint
  void phoneRef;
  void emailRef;

  const patchMany = useCallback(
    (ids: string[], patch: BulkPatch) => {
      setPatches((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          next[id] = { ...next[id], ...(patch as Partial<Lead>) };
        });
        return next;
      });
    },
    [],
  );

  const rollbackMany = useCallback(
    (ids: string[], previous: Record<string, BulkPatch>) => {
      setPatches((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          const p = previous[id];
          if (!p) return;
          next[id] = { ...next[id], ...(p as Partial<Lead>) };
        });
        return next;
      });
    },
    [],
  );

  const currentStatusMap = useMemo(() => {
    const m: Record<string, string> = {};
    leadsPatched.forEach((l) => (m[l.lead_id] = l.status));
    return m;
  }, [leadsPatched]);

  return (
    <TooltipProvider delayDuration={150}>
      {/* Page header */}
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Leadi
          </h1>
          <p className="text-xs text-muted-foreground">
            Operacionālā leadu darba vide
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <label
            className={cn(
              "inline-flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-md border px-2 text-xs transition-colors",
              autoNext
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border bg-background text-foreground hover:bg-muted/50",
            )}
            title="Pēc darbības atvērt nākamo leadu šajā rindā"
          >
            <input
              type="checkbox"
              checked={autoNext}
              onChange={(e) => setAutoNext(e.target.checked)}
              className="sr-only"
            />
            <Zap className={cn("h-3.5 w-3.5", autoNext && "text-primary")} />
            <span>Auto-next</span>
          </label>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
            <Bookmark className="h-3.5 w-3.5" />
            Saglabāt skatu
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
            <Upload className="h-3.5 w-3.5" />
            Importēt
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Jauns leads
          </Button>
        </div>
      </header>

      {/* Sticky operational bar */}
      <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          {/* Saved views */}
          <div className="flex flex-wrap items-center gap-1">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setSearch({ seg: v === "all" ? undefined : v })}
                className={cn(
                  "h-7 rounded-md border px-2.5 text-xs transition-colors",
                  seg === v
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted/50",
                )}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          <div className="mx-1 h-5 w-px bg-border" aria-hidden />

          {/* Search */}
          <div className="relative min-w-[260px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search.q ?? ""}
              onChange={(e) => setSearch({ q: e.target.value || undefined })}
              placeholder="Meklēt pēc vārda, telefona, email vai objekta"
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <FilterChip
              label="Statuss"
              options={options.statuses}
              value={fStatus}
              onChange={(v) => setSearch({ status: v })}
            />
            <FilterChip
              label="Atbildīgais"
              options={options.owners}
              value={fOwners}
              onChange={(v) => setSearch({ owners: v })}
            />
            <FilterChip
              label="PPV"
              options={options.ppvs}
              value={fPpvs}
              onChange={(v) => setSearch({ ppvs: v })}
            />
            <FilterChip
              label="Valsts"
              options={options.countries}
              value={fCountries}
              onChange={(v) => setSearch({ countries: v })}
            />
            <FilterChip
              label="Tags"
              options={options.tags}
              value={fTags}
              onChange={(v) => setSearch({ tags: v })}
            />
            {hasAnyFilter && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-xs"
                onClick={clearFilters}
              >
                <X className="h-3 w-3" />
                Notīrīt
              </Button>
            )}
          </div>

          {selected.size === 0 && (
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
              >
                <Columns3 className="h-3.5 w-3.5" />
                Kolonnas
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <BulkActionsBar
          selectedIds={Array.from(selected)}
          options={{
            statuses: options.statuses,
            owners: options.owners,
            ppvs: options.ppvs,
          }}
          currentStatus={currentStatusMap}
          onClear={clearSelected}
          onPatchMany={patchMany}
          onRollbackMany={rollbackMany}
        />
      )}

      {errorMsg && <ErrorState message={errorMsg} />}
      {!errorMsg && loading && <LoadingState />}

      {!errorMsg && !loading && (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="text-sm font-medium text-foreground">
                Nav atrastu leadu
              </div>
              {hasAnyFilter && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={clearFilters}
                >
                  Notīrīt filtrus
                </Button>
              )}
            </div>
          ) : (
            <div className="max-h-[calc(100vh-220px)] overflow-y-auto overflow-x-hidden">
              <div role="table" className={cn("w-full text-xs")}> 
                <div
                  role="rowgroup"
                  className="sticky top-0 z-10 bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur"
                >
                  <div role="row" className={cn(LEADS_GRID, "border-b border-border")}>
                    <div role="columnheader" className="px-1.5 py-2 flex items-center">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={toggleAll}
                        className="h-3.5 w-3.5"
                      />
                    </div>
                    <div role="columnheader" className="px-1.5 py-2 font-medium">Prioritāte</div>
                    <div role="columnheader" className="px-1.5 py-2 font-medium">PPV</div>
                    <div role="columnheader" className="px-1.5 py-2 font-medium">Lead</div>
                    <div role="columnheader" className="px-1.5 py-2 font-medium">Tagi</div>
                    <div role="columnheader" className="px-1.5 py-2 font-medium">Statuss</div>
                    <div role="columnheader" className="px-1.5 py-2 font-medium">Atbildīgais</div>
                    <div role="columnheader" className="px-1.5 py-2 font-medium">Nākamā darbība</div>
                    <div role="columnheader" className="px-1.5 py-2 font-medium">Pēdējā aktivitāte</div>
                    <div role="columnheader" className="px-1.5 py-2 text-right font-medium" aria-label="Darbības" />
                  </div>
                </div>
                <div role="rowgroup">
                  {QUEUE_DEFS.flatMap((q) => {
                    const items = queues[q.id];
                    if (items.length === 0) return [];
                    const collapsed =
                      collapsedQueues[q.id] ?? q.defaultCollapsed;
                    const header = (
                      <div
                        key={`qh-${q.id}`}
                        role="row"
                        className={cn(LEADS_GRID, "group/qh border-t border-border/40")}
                      >
                        <div role="cell" style={{ gridColumn: "1 / -1" }} className="p-0">
                          <div className="flex items-center justify-between gap-3 px-3 py-0.5 text-[10.5px] leading-none text-muted-foreground/80">
                            <button
                              type="button"
                              onClick={() => toggleQueue(q.id)}
                              className="inline-flex items-center gap-1.5 text-left transition-colors hover:text-foreground"
                              aria-label={
                                collapsed ? "Izvērst rindu" : "Sakļaut rindu"
                              }
                            >
                              {collapsed ? (
                                <ChevronRight className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                              <span className="text-[10.5px] font-semibold tracking-tight text-foreground/70">
                                {q.label}
                              </span>
                              <span className="tabular-nums opacity-70">
                                {queueMetrics[q.id]?.count ?? items.length}
                              </span>
                            </button>
                            <div className="flex items-center gap-3">
                              <div className="hidden items-center gap-2 sm:flex">
                                {(queueMetrics[q.id]?.breach ?? 0) > 0 && (
                                  <span title="Pārkāpts SLA">
                                    {queueMetrics[q.id]!.breach} SLA breach
                                  </span>
                                )}
                                {(queueMetrics[q.id]?.breach ?? 0) > 0 &&
                                  (queueMetrics[q.id]?.avgWaitMin ?? 0) > 0 && (
                                    <span aria-hidden>•</span>
                                  )}
                                {(queueMetrics[q.id]?.avgWaitMin ?? 0) > 0 && (
                                  <span title={avgLabel(q.id)}>
                                    avg{" "}
                                    {formatWait(queueMetrics[q.id]!.avgWaitMin)}
                                  </span>
                                )}
                              </div>
                              <div
                                className="flex items-center gap-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/qh:opacity-100"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openLead(items[0].lead_id)
                                      }
                                      className="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground"
                                      aria-label="Atvērt pirmo"
                                    >
                                      <ChevronRight className="h-3 w-3" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    Atvērt pirmo
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = new Set(selected);
                                        items.forEach((l) =>
                                          next.add(l.lead_id),
                                        );
                                        setSelected(next);
                                      }}
                                      className="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground"
                                      aria-label="Atlasīt visus"
                                    >
                                      <CheckSquare className="h-3 w-3" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    Atlasīt visus
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                    if (collapsed) return [header];
                    const rows = items.map((l) => {
                    const isSel = selected.has(l.lead_id);
                    const isActive = drawerOpen && drawerLeadId === l.lead_id;
                    const dueT = parseDate(l.next_action_due);
                    const isOverdue = dueT != null && dueT < Date.now();
                    const isHot = l.tags.some((t) =>
                      /^(hot|karst)/i.test(t),
                    );
                    const hasUnread = l.has_unread_reply;
                    const noContact = !parseDate(l.last_activity);
                    // Priority cascade: unread > overdue > hot > no-contact
                    const accentClass = hasUnread
                      ? "before:bg-blue-500/80"
                      : isOverdue
                        ? "before:bg-rose-500/70"
                        : isHot
                          ? "before:bg-orange-500/70"
                          : noContact
                            ? "before:bg-muted-foreground/30"
                            : "before:bg-transparent";
                    // Communication activity label
                    const commLabel = l.has_unread_reply
                      ? "Atbildēja"
                      : l.communication_state === "waiting"
                        ? "Gaida atbildi"
                        : l.communication_state === "active"
                          ? "Aktīva saziņa"
                          : l.communication_state === "event_only"
                            ? "Ir notikums"
                            : l.communication_state === "no_contact"
                              ? "Nav kontakta"
                              : null;
                    const commTimeSrc = l.has_unread_reply
                      ? l.last_reply_at
                      : l.last_communication_at || l.last_activity || l.created_at;
                    const isCursor =
                      visibleRows[activeIdx]?.lead_id === l.lead_id;
                    return (
                      <div
                        key={l.lead_id}
                        role="row"
                        onClick={() => openLead(l.lead_id)}
                        className={cn(
                          LEADS_GRID,
                          "group relative cursor-pointer border-b border-border/30 transition-colors",
                          "before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:content-['']",
                          accentClass,
                          isActive
                            ? "bg-primary/[0.06] shadow-[inset_3px_0_0_hsl(var(--primary))]"
                            : isSel
                              ? "bg-primary/[0.04]"
                              : "hover:bg-muted/30",
                          isCursor &&
                            !isActive &&
                            "ring-1 ring-inset ring-primary/40",
                        )}
                      >
                        <div
                          role="cell"
                          className="px-1.5 py-1 flex items-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSel}
                            onCheckedChange={() => toggleOne(l.lead_id)}
                            className="h-3.5 w-3.5"
                          />
                        </div>
                        {/* PRIORITĀTE */}
                        <div role="cell" className="min-w-0 px-1.5 py-1 flex items-center">
                          <PriorityCell score={l.priority_score} />
                        </div>
                        {/* PPV */}
                        <div role="cell" className="min-w-0 px-1.5 py-1 text-foreground flex items-center">
                          <span className="truncate">
                            {l.ppv || (
                              <span className="text-muted-foreground/60">—</span>
                            )}
                          </span>
                        </div>
                        {/* LEAD */}
                        <div role="cell" className="min-w-0 px-1.5 py-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold leading-tight text-foreground">
                              {l.name || (
                                <span className="font-normal italic text-muted-foreground">
                                  Neidentificēts leads
                                </span>
                              )}
                            </span>
                            {hasUnread && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"
                                    aria-label="Ir neatbildēta klienta atbilde"
                                  />
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  Ir neatbildēta klienta atbilde
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground/80 tabular-nums">
                            <span className="text-muted-foreground/70">
                              {l.country || "—"}
                            </span>
                            <span className="mx-1 opacity-40">•</span>
                            <CommStats counts={commCounts.get(l.lead_id)} hasUnread={hasUnread} />
                          </div>
                        </div>
                        {/* TAGI */}
                        <div role="cell" className="min-w-0 px-1.5 py-1 flex items-center">
                          {l.tags.length === 0 ? (
                            <span className="text-muted-foreground/50">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-0.5">
                              {l.tags.slice(0, 3).map((t) => (
                                <span
                                  key={t}
                                  className={cn(
                                    "inline-flex h-3.5 items-center rounded-sm px-1 text-[10px] lowercase leading-none",
                                    /^(hot|karst)/i.test(t)
                                      ? "text-rose-600/75 dark:text-rose-300/75 ring-1 ring-inset ring-rose-500/15"
                                      : "text-muted-foreground/65 ring-1 ring-inset ring-border/50",
                                  )}
                                >
                                  {t}
                                </span>
                              ))}
                              {l.tags.length > 3 && (
                                <span className="text-[10px] text-muted-foreground/55 tabular-nums">
                                  +{l.tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {/* STATUSS */}
                        <div role="cell" className="min-w-0 px-1.5 py-1 flex items-center">
                          <StatusBadge value={l.status} />
                        </div>
                        {/* ATBILDĪGAIS */}
                        <div role="cell" className="min-w-0 px-1.5 py-1 flex items-center">
                          {l.owner ? (
                            <span className="truncate text-foreground text-[11.5px] font-medium tabular-nums">
                              {l.owner}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </div>
                        {/* NĀKAMĀ DARBĪBA */}
                        <div role="cell" className="min-w-0 px-1.5 py-1">
                          <div className="flex flex-col leading-tight">
                            <span
                              className={cn(
                                "truncate text-[11.5px]",
                                isOverdue
                                  ? "font-medium text-rose-700 dark:text-rose-300"
                                  : l.next_action
                                    ? "text-foreground"
                                    : "text-muted-foreground/60",
                              )}
                            >
                              {l.next_action || "Nav darbības"}
                            </span>
                            {l.next_action_due && (
                              <span
                                className={cn(
                                  "text-[10px] tabular-nums",
                                  isOverdue
                                    ? "text-rose-600/85 dark:text-rose-300/85"
                                    : "text-muted-foreground/65",
                                )}
                              >
                                {isOverdue
                                  ? fmtDateTime(l.next_action_due)
                                  : fmtDate(l.next_action_due)}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* PĒDĒJĀ AKTIVITĀTE */}
                        <div role="cell" className="min-w-0 px-1.5 py-1">
                          <div className="flex flex-col leading-tight">
                            <span
                              className={cn(
                                "truncate text-[11.5px]",
                                l.has_unread_reply
                                  ? "text-blue-600/90 dark:text-blue-300/90 font-medium"
                                  : "text-muted-foreground/85",
                              )}
                            >
                              {commLabel ?? "Nav kontakta"}
                            </span>
                            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                              {fmtDate(commTimeSrc)}
                            </span>
                          </div>
                        </div>
                        <div
                          role="cell"
                          className="min-w-0 px-1.5 py-1 flex items-center justify-end"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-70 hover:opacity-100">
                            <RowAction
                              icon={<Phone className="h-3.5 w-3.5" />}
                              label="Zvanīt"
                              href={l.phone ? `tel:${l.phone}` : undefined}
                              onActivate={() => bumpActivity(l.lead_id)}
                            />
                            <RowAction
                              icon={<MessageCircle className="h-3.5 w-3.5" />}
                              label="WhatsApp"
                              href={
                                l.phone
                                  ? `https://wa.me/${l.phone.replace(/[^0-9]/g, "")}`
                                  : undefined
                              }
                              onActivate={() => bumpActivity(l.lead_id)}
                            />
                            <RowAction
                              icon={<Mail className="h-3.5 w-3.5" />}
                              label="E-pasts"
                              href={l.email ? `mailto:${l.email}` : undefined}
                              onActivate={() => bumpActivity(l.lead_id)}
                            />
                            <RowAction
                              icon={<CheckSquare className="h-3.5 w-3.5" />}
                              label="Uzdevums"
                              onClick={() => openLead(l.lead_id)}
                            />
                            <RowAction
                              icon={<StickyNote className="h-3.5 w-3.5" />}
                              label="Piezīme"
                              onClick={() => openLead(l.lead_id)}
                            />
                          </div>
                        </div>
                      </div>
                    );
                    });
                    return [header, ...rows];
                  })}
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>
              Rāda {sorted.length} no {leads.length}
            </span>
            <span>Sagrupēts pa operacionālajām rindām</span>
          </div>
        </div>
      )}

      <LeadDrawer
        leadId={drawerLeadId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onPatch={patchLead}
        onActionCompleted={handleActionCompleted}
      />
    </TooltipProvider>
  );
}

function RowAction({
  icon,
  label,
  href,
  onClick,
  onActivate,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  onActivate?: () => void;
}) {
  const disabled = !href && !onClick;
  const className = cn(
    "inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-muted-foreground transition-colors",
    disabled
      ? "cursor-not-allowed opacity-40"
      : "hover:border-border hover:bg-background hover:text-foreground",
  );
  const content = href ? (
    <a
      href={href}
      className={className}
      aria-label={label}
      onClick={() => onActivate?.()}
    >
      {icon}
    </a>
  ) : (
    <button
      type="button"
      onClick={() => {
        onActivate?.();
        onClick?.();
      }}
      disabled={disabled}
      className={className}
      aria-label={label}
    >
      {icon}
    </button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function formatWait(min: number): string {
  if (min < 1) return "<1m";
  if (min < 60) return `${min}m`;
  const h = min / 60;
  if (h < 24) return h < 10 ? `${h.toFixed(1)}h` : `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 10) return `${d.toFixed(1)}d`;
  return `${Math.round(d)}d`;
}

function avgLabel(qid: string): string {
  switch (qid) {
    case "unread":
      return "Vidējais nelasītu atbilžu vecums";
    case "overdue":
      return "Vidējais kavējums";
    case "waiting":
      return "Vidējais gaidīšanas laiks";
    default:
      return "Vidējais aktivitātes vecums";
  }
}

