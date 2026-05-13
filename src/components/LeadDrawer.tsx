import { useState, lazy, Suspense, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Phone,
  MessageCircle,
  Mail,
  CheckSquare,
  StickyNote,
  CalendarClock,
  User,
  Globe2,
  MoreHorizontal,
  Save,
  Send,
  Combine,
  ChevronDown,
  Sparkles,
  X,
  Hash,
  Flame,
  Plus,
  Zap,
  CircleDot,
  Circle,
  CheckCircle2,
  Clock,
  ShieldCheck,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { fetchCrmView } from "@/server/analytics";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Tag, normalizeTags } from "@/components/ui/Tag";
import { LoadingState } from "@/components/DataState";
import { CompleteActionModal } from "@/components/CompleteActionModal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const LeadCommunicationTimeline = lazy(() =>
  import("@/components/LeadCommunicationTimeline").then((m) => ({
    default: m.LeadCommunicationTimeline,
  })),
);
const LeadActionHistory = lazy(() =>
  import("@/components/LeadActionHistory").then((m) => ({
    default: m.LeadActionHistory,
  })),
);
const LeadProjects = lazy(() =>
  import("@/components/LeadProjects").then((m) => ({
    default: m.LeadProjects,
  })),
);
const UnifiedActivityTimeline = lazy(() =>
  import("@/components/UnifiedActivityTimeline").then((m) => ({
    default: m.UnifiedActivityTimeline,
  })),
);

/* ----------------------------- helpers ----------------------------- */

type Row = Record<string, unknown>;

function s(v: unknown): string {
  if (v == null) return "";
  return String(v);
}
function b(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "t" || v === "1";
  return !!v;
}
function parseTags(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((t) => String(t).trim()).filter(Boolean);
  return String(value).split(",").map((t) => t.trim()).filter(Boolean);
}
function parseDate(v: unknown): number | null {
  if (v == null || v === "") return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}
const MS_MIN = 60_000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;
function relativeTime(v: unknown): string {
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
  if (
    yest.getFullYear() === then.getFullYear() &&
    yest.getMonth() === then.getMonth() &&
    yest.getDate() === then.getDate()
  )
    return "vakar";
  const days = Math.round(diff / MS_DAY);
  if (days < 30) return `pirms ${days}d`;
  if (days < 365) return `pirms ${Math.round(days / 30)}mēn`;
  return `pirms ${Math.round(days / 365)}g`;
}
function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
}
function leadDisplayName(row: Row, leadId: string | null): string {
  const n = s(row.name) || s(row.object_name) || s(row.display_name);
  if (n && !isUuidLike(n)) return n;
  return leadId ? `Leads #${leadId.slice(0, 6)}` : "—";
}
function initials(name: string): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "—";
}

const COUNTRY_FLAGS: Record<string, string> = {
  lv: "🇱🇻", latvia: "🇱🇻", latvija: "🇱🇻",
  lt: "🇱🇹", lithuania: "🇱🇹", lietuva: "🇱🇹",
  ee: "🇪🇪", estonia: "🇪🇪", igaunija: "🇪🇪",
  de: "🇩🇪", germany: "🇩🇪", vācija: "🇩🇪", vacija: "🇩🇪",
  pl: "🇵🇱", poland: "🇵🇱", polija: "🇵🇱",
  fi: "🇫🇮", finland: "🇫🇮", somija: "🇫🇮",
  se: "🇸🇪", sweden: "🇸🇪", zviedrija: "🇸🇪",
  no: "🇳🇴", norway: "🇳🇴", norvēģija: "🇳🇴",
  dk: "🇩🇰", denmark: "🇩🇰", dānija: "🇩🇰",
  uk: "🇬🇧", gb: "🇬🇧", "united kingdom": "🇬🇧", lielbritānija: "🇬🇧",
  us: "🇺🇸", usa: "🇺🇸", "united states": "🇺🇸",
  ru: "🇷🇺", russia: "🇷🇺",
  ua: "🇺🇦", ukraine: "🇺🇦", ukraina: "🇺🇦",
  fr: "🇫🇷", france: "🇫🇷", francija: "🇫🇷",
  es: "🇪🇸", spain: "🇪🇸", spānija: "🇪🇸",
  it: "🇮🇹", italy: "🇮🇹", itālija: "🇮🇹",
  nl: "🇳🇱", netherlands: "🇳🇱",
  be: "🇧🇪", belgium: "🇧🇪",
  ie: "🇮🇪", ireland: "🇮🇪",
  no_country: "",
};
function countryFlag(country: string): string {
  if (!country) return "";
  const key = country.trim().toLowerCase();
  if (COUNTRY_FLAGS[key]) return COUNTRY_FLAGS[key];
  if (/^[a-z]{2}$/.test(key)) {
    const code = key.toUpperCase();
    return String.fromCodePoint(
      0x1f1e6 + code.charCodeAt(0) - 65,
      0x1f1e6 + code.charCodeAt(1) - 65,
    );
  }
  return "";
}

/* ----------------------------- component ----------------------------- */

export function LeadDrawer({
  leadId,
  open,
  onOpenChange,
  onActionCompleted,
  onPatch,
}: {
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActionCompleted?: (leadId: string) => void;
  onPatch?: (leadId: string, patch: Record<string, unknown>) => void;
}) {
  // Source 1: priority queue display (status, owner, ppv, tags, priority,
  // next action, communication summary). Returns empty if the lead has no
  // queued action — that's fine, header still renders from source 2.
  const queueQ = useQuery({
    queryKey: ["crm", "queue_for_lead", leadId ?? ""],
    queryFn: () =>
      fetchCrmView({
        data: {
          view: "next_action_queue_display_enriched",
          query: `lead_id=eq.${encodeURIComponent(leadId ?? "")}&order=sort_priority.asc&limit=1`,
        },
      }),
    enabled: open && !!leadId,
    staleTime: 30_000,
  });

  // Source 2: lead + embedded contact (raw phone/email, validation, line type,
  // raw_data payload, source). Always available for any lead.
  const leadQ = useQuery({
    queryKey: ["crm", "lead_with_contact", leadId ?? ""],
    queryFn: () =>
      fetchCrmView({
        data: {
          view: "leads",
          query:
            `or=(id.eq.${encodeURIComponent(leadId ?? "")},external_id.eq.${encodeURIComponent(leadId ?? "")})` +
            `&select=id,status,source,external_source,external_id,contact_id,raw_data,created_at,updated_at,owner_user_id,ppv_user_id,contacts(id,full_name,email_raw,email_normalized,phone_raw,phone_e164,phone_validated,phone_line_type)` +
            `&limit=1`,
        },
      }),
    enabled: open && !!leadId,
    staleTime: 30_000,
  });

  // Resolve canonical crm.leads.id (handles cases where the drawer was opened
  // with an external_id / queue id). All downstream crm.* queries MUST use
  // this id, never the raw `leadId` prop.
  const canonicalLeadId =
    s((leadQ.data?.rows?.[0] as Row | undefined)?.id) || leadId || "";

  // Source 3: communication summary (counts, last activity) straight from
  // crm.lead_communication_summary. This is the SOLE source of KPI numbers.
  const summaryQ = useQuery({
    queryKey: ["crm", "lead_communication_summary", canonicalLeadId],
    queryFn: () =>
      fetchCrmView({
        data: {
          view: "lead_communication_summary",
          query: `lead_id=eq.${encodeURIComponent(canonicalLeadId)}&limit=1`,
        },
      }),
    enabled: open && !!canonicalLeadId,
    staleTime: 30_000,
  });

  // Source 4: per-channel counts derived from crm.communications.
  // Aggregated client-side (limit 200 covers all realistic per-lead volume).
  const commsQ = useQuery({
    queryKey: ["crm", "communications_kpi", canonicalLeadId],
    queryFn: () =>
      fetchCrmView({
        data: {
          view: "communications",
          query: `lead_id=eq.${encodeURIComponent(canonicalLeadId)}&select=channel,direction&limit=500`,
        },
      }),
    enabled: open && !!canonicalLeadId,
    staleTime: 30_000,
  });

  const channelCounts = useMemo(() => {
    const rows = (commsQ.data?.rows ?? []) as Row[];
    const out = { call: 0, email: 0, sms: 0, whatsapp: 0, inbound: 0, outbound: 0 };
    for (const r of rows) {
      const ch = s(r.channel).toLowerCase();
      const dir = s(r.direction).toLowerCase();
      if (ch === "call" || ch === "phone") out.call += 1;
      else if (ch === "email") out.email += 1;
      else if (ch === "sms") out.sms += 1;
      else if (ch === "whatsapp") out.whatsapp += 1;
      if (dir.startsWith("in")) out.inbound += 1;
      else if (dir.startsWith("out")) out.outbound += 1;
    }
    return out;
  }, [commsQ.data]);

  const row: Row = useMemo(() => {
    const q = (queueQ.data?.rows?.[0] as Row | undefined) ?? {};
    const l = (leadQ.data?.rows?.[0] as Row | undefined) ?? {};
    const c = (l.contacts as Row | undefined) ?? {};
    const raw = (l.raw_data as Row | undefined) ?? {};
    const sum = (summaryQ.data?.rows?.[0] as Row | undefined) ?? {};
    return {
      // identity
      lead_id: s(l.id) || s(q.lead_id) || leadId || "",
      name:
        s(q.full_name) ||
        s(c.full_name) ||
        s(raw.full_name) ||
        s(q.display_name) ||
        "",
      country: s(q.country) || s(raw.valsts) || "",
      tags: q.tags ?? raw.tags ?? null,
      // status — CANONICAL source is crm.leads.status only.
      // No queue / raw_data / cached fallback.
      lead_status_label: s(l.status),
      visible_action_owner:
        s(q.action_owner_label) || s(raw.atbildigais) || "",
      ppv_name: s(q.ppv_name) || s(raw.ppv_vards) || "",
      priority_score: q.lead_priority_score ?? null,
      priority_label: s(q.priority_label),
      // contact — CANONICAL source is crm.contacts only.
      // Validation badges depend on these exact values (no fallback).
      phone_e164: s(c.phone_e164),
      phone_raw: s(c.phone_raw),
      phone_validated: c.phone_validated ?? null,
      phone_line_type: s(c.phone_line_type),
      email_normalized: s(c.email_normalized),
      email_raw: s(c.email_raw),
      // next action
      visible_action: s(q.action_label),
      visible_action_due_at: s(q.effective_due_at) || s(q.due_at),
      visible_action_is_human: s(q.action_owner_type) === "user",
      system_action_label: s(q.automatizacija),
      system_due_date: s(q.automatizacijas_datums),
      // communication summary — CANONICAL: crm.lead_communication_summary
      last_communication_at: s(sum.last_communication_at),
      last_inbound_at: s(sum.last_inbound_at),
      last_outbound_at: s(sum.last_outbound_at),
      last_reply_at: s(sum.last_reply_at),
      reply_count: sum.reply_count ?? 0,
      click_count: sum.click_count ?? 0,
      communication_count: sum.communication_count ?? 0,
      has_unread_reply: sum.has_unread_reply ?? null,
      communication_state: s(sum.communication_state),
      communication_label: s(sum.communication_label),
      // audit
      source: s(l.source) || s(raw.source),
      import_source: s(l.external_source),
      lead_created_at: s(l.created_at) || s(raw.created_at),
      created_at: s(l.created_at),
      raw_data: raw,
    };
  }, [queueQ.data, leadQ.data, summaryQ.data, leadId]);

  const loading = queueQ.isLoading || leadQ.isLoading;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:w-[95vw] md:max-w-[1280px] xl:max-w-[1400px]"
      >
        <DrawerBody
          row={row}
          leadId={canonicalLeadId || leadId}
          channelCounts={channelCounts}
          loading={loading}
          onActionCompleted={onActionCompleted}
          onPatch={onPatch}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  row,
  leadId,
  channelCounts,
  loading,
  onActionCompleted,
  onPatch,
  onClose,
}: {
  row: Row;
  leadId: string | null;
  channelCounts: { call: number; email: number; sms: number; whatsapp: number; inbound: number; outbound: number };
  loading: boolean;
  onActionCompleted?: (leadId: string) => void;
  onPatch?: (leadId: string, patch: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [completeOpen, setCompleteOpen] = useState(false);
  const [localPatch, setLocalPatch] = useState<Record<string, unknown>>({});
  const applyPatch = (patch: Record<string, unknown>) => {
    setLocalPatch((prev) => ({ ...prev, ...patch }));
    if (realLeadId && onPatch) onPatch(realLeadId, patch);
  };

  const realLeadId = s(row.lead_id) || leadId;
  const displayName = leadDisplayName(row, realLeadId);
  const status = s(localPatch.status ?? row.lead_status_label);
  const owner = s(localPatch.owner ?? row.visible_action_owner);
  const ppv = s(localPatch.ppv ?? row.ppv_name);
  const country = s(row.country);
  const tags = parseTags(row.tags);
  const phoneE164 = s(row.telefons_e164) || s(row.phone_e164);
  const phoneRaw = s(row.phone_raw);
  const phone = phoneE164 || phoneRaw;
  const email = s(row.email_normalized);
  const emailRaw = s(row.email_raw);
  const phoneValidated = b(row.phone_validated);
  const phoneLineType = s(row.phone_line_type);
  const source = s(row.source);
  const importSource = s(row.import_source) || s(row.lead_source);

  const visibleAction = s(row.visible_action);
  const visibleDue = s(row.visible_action_due_at);
  const isHumanPrimary = b(row.visible_action_is_human);
  const sisLabel = s(row.system_action_label);
  const sisDue = s(row.system_due_date);

  const lastContact =
    s(row.last_contact_date) ||
    s(row.last_communication_at) ||
    s(row.last_inbound_at);
  const replyCount = Number(row.reply_count ?? 0);
  const clickCount = Number(row.click_count ?? 0);
  const inboundCount = channelCounts.inbound;
  const fmtCount = (n: number) => (n > 0 ? String(n) : "—");

  const waPhone = phone.replace(/[^0-9]/g, "");
  const priorityScore = Number(row.priority_score ?? row.priority ?? 0);
  const priorityLabel = s(row.priority_label);
  const shortLeadId = realLeadId ? realLeadId.slice(0, 8) : "";
  const flag = countryFlag(country);

  return (
    <TooltipProvider delayDuration={150}>
      {/* ============== ENTERPRISE HEADER ============== */}
      <SheetHeader className="shrink-0 space-y-0 border-b border-border bg-card px-4 py-2 text-left shadow-sm">
        {loading ? (
          <HeaderSkeleton />
        ) : (
        <div className="flex items-center gap-3">
          {/* LEFT — identity */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
              {initials(displayName)}
            </span>
            <SheetTitle className="truncate text-[14px] font-semibold leading-tight text-foreground">
              {displayName}
            </SheetTitle>
            {flag && (
              <span className="inline-flex shrink-0 items-center text-base leading-none" title={country}>
                {flag}
              </span>
            )}
            {!flag && country && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                <Globe2 className="h-3 w-3" />
                {country}
              </span>
            )}
            {shortLeadId && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-border/60 bg-muted/40 px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                <Hash className="h-2.5 w-2.5" />
                {shortLeadId}
              </span>
            )}
            {status && <StatusBadge status={status} />}
            {priorityScore > 0 && (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                  priorityScore >= 90
                    ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                    : priorityScore >= 70
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      : "bg-muted text-muted-foreground",
                )}
                title={priorityLabel || `Prioritāte ${priorityScore}`}
              >
                <Flame className="h-2.5 w-2.5" />
                {priorityScore}
              </span>
            )}
          </div>

          {/* CENTER — secondary (owner/ppv) and tertiary (tags) — visually demoted */}
          <div className="hidden min-w-0 flex-[1.1] items-center justify-center gap-2 md:flex">
            {owner && (
              <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
                <User className="h-3 w-3" />
                <span className="truncate">{owner}</span>
              </span>
            )}
            {ppv && (
              <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground/80">
                <Sparkles className="h-3 w-3" />
                {ppv}
              </span>
            )}
            {normalizeTags(tags).length > 0 && (
              <div className="flex items-center gap-0.5 overflow-hidden opacity-70">
                {normalizeTags(tags).slice(0, 2).map((t) => (
                  <Tag key={t} label={t} />
                ))}
                {tags.length > 2 && (
                  <span className="text-[10px] text-muted-foreground">+{tags.length - 2}</span>
                )}
              </div>
            )}
          </div>

          {/* RIGHT — actions */}
          <div className="flex shrink-0 items-center gap-0.5">
            <IconBtn icon={<Phone className="h-3.5 w-3.5" />} label="Zvanīt" href={phone ? `tel:${phone}` : undefined} />
            <IconBtn icon={<MessageCircle className="h-3.5 w-3.5" />} label="WhatsApp" href={waPhone ? `https://wa.me/${waPhone}` : undefined} />
            <IconBtn icon={<Mail className="h-3.5 w-3.5" />} label="E-pasts" href={email ? `mailto:${email}` : undefined} />
            <IconBtn icon={<CheckSquare className="h-3.5 w-3.5" />} label="Uzdevums" onClick={() => setCompleteOpen(true)} disabled={!realLeadId} />
            <IconBtn icon={<StickyNote className="h-3.5 w-3.5" />} label="Piezīme" onClick={() => undefined} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Vairāk"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem>Pievienot tagu</DropdownMenuItem>
                <DropdownMenuItem>Mainīt atbildīgo</DropdownMenuItem>
                <DropdownMenuItem>Pārcelt termiņu</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">Apvienot ar...</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="mx-1 h-5 w-px bg-border" />
            <IconBtn icon={<X className="h-3.5 w-3.5" />} label="Aizvērt" onClick={onClose} />
          </div>
        </div>
        )}

        {/* mobile center row */}
        {!loading && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 md:hidden">
          {owner && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <User className="h-3 w-3" />
              {owner}
            </span>
          )}
          {ppv && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              {ppv}
            </span>
          )}
          {normalizeTags(tags).slice(0, 4).map((t) => (
            <Tag key={t} label={t} />
          ))}
        </div>
        )}
        {!loading && (
          <div className="mt-1 font-mono text-[10px] text-muted-foreground/80">
            Active CRM lead_id: {realLeadId || "—"}
          </div>
        )}
      </SheetHeader>

      {/* ============== KPI STRIP ============== */}
      <div className="shrink-0 border-b border-border bg-background">
        <div className="flex items-stretch divide-x divide-border/60 overflow-x-auto px-2">
          <KpiCell label="Zvani" value={fmtCount(channelCounts.call)} />
          <KpiCell label="E-pasti" value={fmtCount(channelCounts.email)} />
          <KpiCell label="SMS" value={fmtCount(channelCounts.sms)} />
          <KpiCell label="WhatsApp" value={fmtCount(channelCounts.whatsapp)} />
          <KpiCell label="Ienākošie" value={fmtCount(inboundCount)} accent={inboundCount > 0 ? "green" : undefined} />
          <KpiCell label="Atbildes" value={fmtCount(replyCount)} accent={replyCount > 0 ? "green" : undefined} />
          <KpiCell label="Klikšķi" value={fmtCount(clickCount)} />
          <KpiCell label="Pēd. aktivitāte" value={lastContact ? relativeTime(lastContact) : "—"} />
          <KpiCell label="Atvērts" value={relativeTime(row.lead_created_at ?? row.created_at)} />
        </div>
      </div>

      {/* ============== SCROLLABLE CONTENT ============== */}
      <div id="lead-drawer-scroll" className="flex-1 overflow-y-auto bg-muted/20">
        <Tabs defaultValue="overview" className="flex h-full w-full flex-col">
          <TabsList className="sticky top-0 z-10 mx-auto mt-2 flex h-8 w-fit shrink-0 items-center justify-start gap-0.5 rounded-md bg-card p-0.5 shadow-sm">
            <TabsTrigger value="overview" className="h-7 px-2.5 text-[11px]">Pārskats</TabsTrigger>
            <TabsTrigger value="comms" className="h-7 px-2.5 text-[11px]">Komunikācija</TabsTrigger>
            <TabsTrigger value="tasks" className="h-7 px-2.5 text-[11px]">Uzdevumi</TabsTrigger>
            <TabsTrigger value="objects" className="h-7 px-2.5 text-[11px]">Objekti</TabsTrigger>
            <TabsTrigger value="history" className="h-7 px-2.5 text-[11px]">Vēsture</TabsTrigger>
            <TabsTrigger value="audit" className="h-7 px-2.5 text-[11px]">Audit</TabsTrigger>
          </TabsList>

          <div className="mx-auto w-full max-w-[1400px] px-4 py-3 md:px-5 md:py-4">
            {/* ============== OVERVIEW TAB ============== */}
            <TabsContent value="overview" className="m-0 outline-none">
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 lg:grid-cols-[1.4fr_1fr]">
                {/* LEFT — contact-centric summary */}
                <div className="space-y-4">
                  <SecondarySection id="contact" title="Kontaktdati" hint="Validated">
                    {loading ? (
                      <ContactSkeleton />
                    ) : (
                      <ContactGrid
                        phoneE164={phoneE164}
                        phoneRaw={phoneRaw}
                        phoneValidated={phoneValidated}
                        phoneLineType={phoneLineType}
                        email={email}
                        emailRaw={emailRaw}
                      />
                    )}
                  </SecondarySection>

                  <SecondarySection id="meta" title="Tagi · Avots · Piezīmes" hint="Context">
                    <div className="rounded-sm border border-border/60 bg-card">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0 px-2.5 py-1.5 text-[11px]">
                        <InlineKv label="Avots" value={source} dense />
                        <InlineKv label="Imports" value={importSource} dense />
                        <InlineKv label="Atbildīgais" value={owner} dense />
                        <InlineKv label="PPV" value={ppv} dense />
                      </div>
                      {normalizeTags(tags).length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 border-t border-border/40 px-2.5 py-1.5">
                          {normalizeTags(tags).map((t) => <Tag key={t} label={t} />)}
                        </div>
                      )}
                      <div className="border-t border-border/40 px-2.5 py-1.5 text-[11px] text-muted-foreground/70 italic">
                        Piezīmes vēl nav pievienotas.
                      </div>
                    </div>
                  </SecondarySection>

                  <SecondarySection id="next-actions-overview" title="Nākamās darbības" hint="Operational">
                    <NextActionsBlock
                      visibleAction={visibleAction}
                      visibleDue={visibleDue}
                      isHumanPrimary={isHumanPrimary}
                      sisLabel={sisLabel}
                      sisDue={sisDue}
                      onComplete={() => setCompleteOpen(true)}
                    />
                  </SecondarySection>

                  <SecondarySection id="recent" title="Pēdējā aktivitāte" hint="Recent">
                    <div className="rounded-sm border border-border/60 bg-card px-3 py-2">
                      <Suspense fallback={<div className="py-2"><LoadingState /></div>}>
                        <LeadCommunicationTimeline leadId={realLeadId} />
                      </Suspense>
                    </div>
                  </SecondarySection>
                </div>

                {/* RIGHT — KPI / object snapshot / automation */}
                <div className="space-y-4">
                  <SecondarySection id="kpi" title="KPI kopsavilkums" hint="Snapshot">
                    <div className="grid grid-cols-2 gap-1.5">
                      <MiniKpi label="Zvani" value={fmtCount(channelCounts.call)} />
                      <MiniKpi label="E-pasti" value={fmtCount(channelCounts.email)} />
                      <MiniKpi label="SMS" value={fmtCount(channelCounts.sms)} />
                      <MiniKpi label="WhatsApp" value={fmtCount(channelCounts.whatsapp)} />
                      <MiniKpi label="Atbildes" value={fmtCount(replyCount)} accent={replyCount > 0 ? "green" : undefined} />
                      <MiniKpi label="Pēd. akt." value={lastContact ? relativeTime(lastContact) : "—"} />
                    </div>
                  </SecondarySection>

                  <SecondarySection id="current-object" title="Pašreizējais objekts" hint="Primary">
                    <div className="rounded-sm border border-border/60 bg-card">
                      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-2.5 py-1.5">
                        <span className="truncate text-[12px] font-semibold text-foreground">
                          {s((row.raw_data as Row | undefined)?.objekts) || s(row.object_name) || displayName}
                        </span>
                        {flag && <span className="text-base leading-none">{flag}</span>}
                        {status && <StatusBadge status={status} />}
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0 px-2.5 py-1.5">
                        <InlineKv label="Zeme" value={s((row.raw_data as Row | undefined)?.forma_zeme)} dense />
                        <InlineKv label="Projekts" value={s((row.raw_data as Row | undefined)?.forma_projekts)} dense />
                        <InlineKv label="Termiņš" value={s((row.raw_data as Row | undefined)?.termins)} dense />
                        <InlineKv label="Plānota būvniecība" value={s((row.raw_data as Row | undefined)?.planota_buvniecība_text) || s((row.raw_data as Row | undefined)?.planota_buvnieciba_text)} dense />
                      </div>
                      <div className="border-t border-border/40 px-2.5 py-2">
                        <MilestoneTrack row={row} />
                      </div>
                    </div>
                  </SecondarySection>

                  <SecondarySection id="automation" title="Automatizācija" hint="System">
                    {sisLabel ? (
                      <div className="flex items-start gap-2 rounded-sm border border-border/60 border-l-2 border-l-violet-500/60 bg-violet-500/5 px-2.5 py-1.5">
                        <Zap className="mt-0.5 h-3 w-3 shrink-0 text-violet-500" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11.5px] font-medium text-foreground">{sisLabel}</div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            SIS{sisDue ? ` · ${relativeTime(sisDue)}` : ""}
                          </div>
                        </div>
                        <span className="shrink-0 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                          Auto
                        </span>
                      </div>
                    ) : (
                      <div className="rounded-sm border border-dashed border-border/60 bg-card/50 px-2.5 py-2 text-center text-[11px] text-muted-foreground">
                        Aktīvas automatizācijas nav.
                      </div>
                    )}
                  </SecondarySection>
                </div>
              </div>
            </TabsContent>

            {/* ============== COMMUNICATIONS TAB ============== */}
            <TabsContent value="comms" className="m-0 outline-none">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                {/* LEFT — communication feed */}
                <div className="rounded-md border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Vienota komunikācijas plūsma — e-pasti, SMS, WhatsApp, zvani, piezīmes</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-6 gap-1 text-[11px]">
                        <Send className="h-3 w-3" /> Sūtīt
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 gap-1 text-[11px]">
                        <StickyNote className="h-3 w-3" /> Piezīme
                      </Button>
                    </div>
                  </div>
                  <div className="relative">
                    <div className="pointer-events-none absolute left-[19px] top-0 bottom-0 w-px bg-border/60" />
                    <div className="px-3 py-2">
                      <Suspense fallback={<div className="py-3"><LoadingState /></div>}>
                        <LeadCommunicationTimeline leadId={realLeadId} />
                      </Suspense>
                    </div>
                  </div>
                </div>

                {/* RIGHT — sticky operational sidebar */}
                <aside className="space-y-2 lg:sticky lg:top-12 lg:self-start lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:pr-1">
                  <SecondarySection id="comms-contact" title="Kontakts" hint="crm.contacts">
                    {loading ? (
                      <ContactSkeleton />
                    ) : (
                      <ContactGrid
                        phoneE164={phoneE164}
                        phoneRaw={phoneRaw}
                        phoneValidated={phoneValidated}
                        phoneLineType={phoneLineType}
                        email={email}
                        emailRaw={emailRaw}
                      />
                    )}
                  </SecondarySection>

                  <SecondarySection id="comms-quick" title="Ātrās darbības" hint="Operational">
                    <div className="grid grid-cols-2 gap-1 rounded-sm border border-border/60 bg-card p-1.5">
                      <Button size="sm" variant="outline" className="h-7 justify-start gap-1.5 px-2 text-[11px]" asChild={!!phone} disabled={!phone}>
                        {phone ? <a href={`tel:${phone}`}><Phone className="h-3 w-3" />Zvanīt</a> : <span><Phone className="h-3 w-3" />Zvanīt</span>}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 justify-start gap-1.5 px-2 text-[11px]" asChild={!!waPhone} disabled={!waPhone}>
                        {waPhone ? <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer"><MessageCircle className="h-3 w-3" />WhatsApp</a> : <span><MessageCircle className="h-3 w-3" />WhatsApp</span>}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 justify-start gap-1.5 px-2 text-[11px]" asChild={!!email} disabled={!email}>
                        {email ? <a href={`mailto:${email}`}><Mail className="h-3 w-3" />E-pasts</a> : <span><Mail className="h-3 w-3" />E-pasts</span>}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 justify-start gap-1.5 px-2 text-[11px]" onClick={() => setCompleteOpen(true)} disabled={!realLeadId}>
                        <CheckSquare className="h-3 w-3" />Pabeigt
                      </Button>
                    </div>
                  </SecondarySection>

                  <SecondarySection id="comms-next" title="Nākamā darbība" hint="Operational">
                    <NextActionsBlock
                      visibleAction={visibleAction}
                      visibleDue={visibleDue}
                      isHumanPrimary={isHumanPrimary}
                      sisLabel={sisLabel}
                      sisDue={sisDue}
                      onComplete={() => setCompleteOpen(true)}
                    />
                  </SecondarySection>

                  <SecondarySection id="comms-kpi" title="KPI kopsavilkums" hint="crm.communications">
                    <div className="rounded-sm border border-border/60 bg-card">
                      <div className="grid grid-cols-2 gap-1 p-1.5">
                        <MiniKpi label="Zvani" value={fmtCount(channelCounts.call)} />
                        <MiniKpi label="E-pasti" value={fmtCount(channelCounts.email)} />
                        <MiniKpi label="SMS" value={fmtCount(channelCounts.sms)} />
                        <MiniKpi label="WhatsApp" value={fmtCount(channelCounts.whatsapp)} />
                        <MiniKpi label="Ienākošie" value={fmtCount(inboundCount)} accent={inboundCount > 0 ? "green" : undefined} />
                        <MiniKpi label="Atbildes" value={fmtCount(replyCount)} accent={replyCount > 0 ? "green" : undefined} />
                      </div>
                      <div className="grid grid-cols-1 gap-x-3 gap-y-0 border-t border-border/40 px-2.5 py-1.5 text-[11px]">
                        <InlineKv
                          label="Pēd. aktivitāte"
                          value={lastContact ? relativeTime(lastContact) : ""}
                          dense
                        />
                        <InlineKv label="Atbildīgais" value={owner} dense />
                        <InlineKv label="PPV" value={ppv} dense />
                      </div>
                    </div>
                  </SecondarySection>
                </aside>
              </div>
            </TabsContent>

            {/* ============== TASKS TAB ============== */}
            <TabsContent value="tasks" className="m-0 outline-none">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SecondarySection id="tasks-active" title="Aktīvi uzdevumi" hint="Overdue · Today · Planned">
                  <NextActionsBlock
                    visibleAction={visibleAction}
                    visibleDue={visibleDue}
                    isHumanPrimary={isHumanPrimary}
                    sisLabel={sisLabel}
                    sisDue={sisDue}
                    onComplete={() => setCompleteOpen(true)}
                  />
                </SecondarySection>
                <SecondarySection id="tasks-done" title="Pabeigtie uzdevumi" hint="Completed">
                  <div className="rounded-sm border border-border/60 bg-card px-3 py-2">
                    <Suspense fallback={<div className="py-2"><LoadingState /></div>}>
                      <LeadActionHistory leadId={realLeadId} />
                    </Suspense>
                  </div>
                </SecondarySection>
              </div>
            </TabsContent>

            {/* ============== OBJECTS TAB ============== */}
            <TabsContent value="objects" className="m-0 outline-none space-y-4">
              <SecondarySection id="objects-milestones" title="Projekta virzība" hint="Milestones">
                <div className="rounded-sm border border-border/60 bg-card px-3 py-2">
                  <MilestoneTrack row={row} />
                </div>
              </SecondarySection>
              <SecondarySection id="objects-list" title="Objekti / Projekti" hint="All">
                <Suspense fallback={<LoadingState label="Ielādē projektus…" />}>
                  <LeadProjects leadId={realLeadId} />
                </Suspense>
              </SecondarySection>
            </TabsContent>

            {/* ============== HISTORY TAB ============== */}
            <TabsContent value="history" className="m-0 outline-none">
              <SecondarySection id="history" title="Biznesa vēsture" hint="All activity">
                <div className="rounded-sm border border-border/60 bg-card px-3 py-2">
                  <Suspense fallback={<div className="py-2"><LoadingState /></div>}>
                    <UnifiedActivityTimeline
                      leadId={realLeadId}
                      defaultCategory="all"
                      limit={100}
                    />
                  </Suspense>
                </div>
              </SecondarySection>
            </TabsContent>

            {/* ============== AUDIT TAB ============== */}
            <TabsContent value="audit" className="m-0 outline-none">
              <SecondarySection id="audit" title="Raw · Imports · Konflikti" hint="Admin">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.2fr]">
                  <div className="rounded-sm border border-border/50 bg-card">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0 px-2.5 py-1.5 text-[11px]">
                      <InlineKv label="Avots" value={source} dense />
                      <InlineKv label="Imports" value={importSource} dense />
                      <InlineKv label="Konflikti" value="" dense />
                      <InlineKv label="Sesija" value="" dense />
                      <InlineKv label="Audits" value="" dense />
                      <InlineKv label="Lead ID" value={realLeadId ?? ""} mono dense />
                    </div>
                  </div>
                  <div className="rounded-sm border border-dashed border-border/60 bg-card/50 px-2.5 py-1.5 font-mono text-[10.5px] leading-snug text-muted-foreground">
                    <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                      <ShieldCheck className="h-3 w-3" />
                      Raw payload
                    </div>
                    {row.raw_data && Object.keys(row.raw_data as Row).length > 0 ? (
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-muted-foreground/80">
                        {JSON.stringify(row.raw_data, null, 2).slice(0, 4000)}
                      </pre>
                    ) : (
                      <div className="text-muted-foreground/60">// nav pieejams</div>
                    )}
                  </div>
                </div>
              </SecondarySection>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* ============== STICKY BOTTOM BAR ============== */}
      <footer className="flex shrink-0 items-center gap-1 border-t border-border bg-card/80 px-3 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-card/70">
        <Button size="sm" className="h-7 gap-1 text-xs">
          <Save className="h-3.5 w-3.5" />
          Saglabāt
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
              Mainīt statusu
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {["Jauns", "Sarunās", "Pieprasījums", "Piedāvājums", "Līgums", "Nesasniedzams", "Zaudēts"].map((st) => (
              <DropdownMenuItem key={st} onSelect={() => applyPatch({ status: st })}>{st}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setCompleteOpen(true)} disabled={!realLeadId}>
          <CheckSquare className="h-3.5 w-3.5" />
          Uzdevums
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs">
          <Send className="h-3.5 w-3.5" />
          Sūtīt ziņu
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground">
            <Combine className="h-3.5 w-3.5" />
            Merge
          </Button>
        </div>
      </footer>

      <CompleteActionModal
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        leadId={realLeadId}
        defaultOwner={owner}
        isHumanPrimary={isHumanPrimary}
        visibleAction={visibleAction}
        onCompleted={() => {
          if (realLeadId && onActionCompleted) onActionCompleted(realLeadId);
        }}
      />
    </TooltipProvider>
  );
}

/* ----------------------------- subcomponents ----------------------------- */

function IconBtn({
  icon, label, href, onClick, disabled,
}: {
  icon: React.ReactNode; label: string; href?: string; onClick?: () => void; disabled?: boolean;
}) {
  const isDisabled = disabled || (!href && !onClick);
  const cls = cn(
    "inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors",
    isDisabled ? "cursor-not-allowed opacity-40" : "hover:bg-muted hover:text-foreground",
  );
  const inner = href && !isDisabled ? (
    <a href={href} className={cls} aria-label={label}>{icon}</a>
  ) : (
    <button type="button" onClick={onClick} disabled={isDisabled} className={cls} aria-label={label}>{icon}</button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function PrimarySection({
  title, subtitle, className, children,
}: { title: string; subtitle?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("scroll-mt-4", className)}>
      <header className="mb-1.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.07em] text-foreground">
          {title}
        </h2>
        {subtitle && (
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">
            {subtitle}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

function SecondarySection({
  id, title, hint, className, children,
}: { id?: string; title: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id ? `lead-section-${id}` : undefined} className={cn("scroll-mt-4", className)}>
      <header className="mb-1 flex items-baseline justify-between gap-3 border-b border-border/40 pb-0.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {title}
        </h3>
        {hint && (
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50">
            {hint}
          </span>
        )}
      </header>
      <div>{children}</div>
    </section>
  );
}

function KpiCell({
  label, value, accent,
}: { label: string; value: React.ReactNode; accent?: "green" | "amber" | "rose" }) {
  const accentCls =
    accent === "green" ? "text-emerald-600 dark:text-emerald-400" :
    accent === "amber" ? "text-amber-600 dark:text-amber-400" :
    accent === "rose" ? "text-rose-600 dark:text-rose-400" :
    "text-foreground";
  return (
    <div className="flex min-w-[92px] flex-1 flex-col justify-center px-2.5 py-1.5">
      <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-0 text-[12px] font-semibold tabular-nums leading-tight", accentCls)}>
        {value}
      </div>
    </div>
  );
}

function MiniKpi({
  label, value, accent,
}: { label: string; value: React.ReactNode; accent?: "green" | "amber" | "rose" }) {
  const accentCls =
    accent === "green" ? "text-emerald-600 dark:text-emerald-400" :
    accent === "amber" ? "text-amber-600 dark:text-amber-400" :
    accent === "rose" ? "text-rose-600 dark:text-rose-400" :
    "text-foreground";
  return (
    <div className="rounded-sm border border-border/60 bg-card px-2 py-1.5">
      <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-[13px] font-semibold tabular-nums leading-tight", accentCls)}>
        {value}
      </div>
    </div>
  );
}

function InlineKv({
  label, value, mono, dense,
}: { label: string; value: string; mono?: boolean; dense?: boolean }) {
  const v = value?.trim() || "";
  const muted = !v;
  return (
    <div className={cn("flex items-baseline gap-1.5 min-w-0", dense ? "py-0.5" : "py-0.5")}>
      <span className="shrink-0 text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground/80">
        {label}
      </span>
      <span className={cn(
        "truncate text-[11.5px] font-medium",
        mono && "font-mono text-[10.5px]",
        muted ? "text-muted-foreground/60" : "text-foreground",
      )}>
        {v || "—"}
      </span>
    </div>
  );
}

/* ---- Milestone tracker ---- */

type Milestone = { key: string; label: string; field: string; terminal?: boolean };
const MILESTONES: Milestone[] = [
  { key: "request", label: "Pieprasījums", field: "request_at" },
  { key: "offer", label: "Piedāvājums", field: "offer_sent_at" },
  { key: "contract", label: "Līgums", field: "contract_signed_at" },
  { key: "cancel", label: "Atcelts", field: "cancelled_at", terminal: true },
  { key: "done", label: "Pabeigts", field: "completed_at", terminal: true },
];

function MilestoneTrack({ row }: { row: Row }) {
  // derive active milestone roughly by status
  const status = s(row.lead_status_label).toLowerCase();
  let activeIdx = -1;
  if (status.includes("pieprasījum") || status.includes("jauns")) activeIdx = 0;
  else if (status.includes("piedāvājum")) activeIdx = 1;
  else if (status.includes("līgum")) activeIdx = 2;
  else if (status.includes("atcelt")) activeIdx = 3;
  else if (status.includes("pabeig")) activeIdx = 4;

  return (
    <div className="flex items-center gap-0">
      {MILESTONES.map((m, i) => {
        const date = s((row as Row)[m.field]);
        const completed = !!date || (activeIdx >= 0 && i < activeIdx);
        const active = i === activeIdx;
        const isLast = i === MILESTONES.length - 1;
        const Icon = completed ? CheckCircle2 : active ? CircleDot : Circle;
        const tone = m.terminal && active ? (m.key === "cancel" ? "rose" : "emerald") : completed ? "emerald" : active ? "primary" : "muted";
        const iconCls =
          tone === "emerald" ? "text-emerald-500" :
          tone === "rose" ? "text-rose-500" :
          tone === "primary" ? "text-primary" : "text-muted-foreground/50";
        const lineCls = completed ? "bg-emerald-500/40" : "bg-border/60";
        return (
          <div key={m.key} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-0.5">
              <Icon className={cn("h-3.5 w-3.5", iconCls)} />
              <span className={cn(
                "text-[9.5px] font-medium leading-none whitespace-nowrap",
                completed || active ? "text-foreground" : "text-muted-foreground/60"
              )}>
                {m.label}
              </span>
              <span className="text-[9px] tabular-nums text-muted-foreground/70 leading-none">
                {date ? relativeTime(date) : "—"}
              </span>
            </div>
            {!isLast && <div className={cn("mx-1 h-px flex-1", lineCls)} />}
          </div>
        );
      })}
    </div>
  );
}

/* ---- Next actions ---- */

function NextActionsBlock({
  visibleAction, visibleDue, isHumanPrimary, sisLabel, sisDue, onComplete,
}: {
  visibleAction: string;
  visibleDue: string;
  isHumanPrimary: boolean;
  sisLabel: string;
  sisDue: string;
  onComplete: () => void;
}) {
  const dueT = parseDate(visibleDue);
  const overdue = dueT != null && dueT < Date.now();
  const today = dueT != null && new Date(dueT).toDateString() === new Date().toDateString();

  const tone = overdue ? "rose" : today ? "amber" : "neutral";
  const toneCls =
    tone === "rose" ? "border-l-rose-500 bg-rose-500/5" :
    tone === "amber" ? "border-l-amber-500 bg-amber-500/5" :
    "border-l-border bg-card";
  const badgeCls =
    tone === "rose" ? "bg-rose-500/15 text-rose-700 dark:text-rose-300" :
    tone === "amber" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" :
    "bg-muted text-muted-foreground";

  return (
    <ul className="space-y-1">
      {visibleAction ? (
        <li className={cn("flex items-start gap-2 rounded-sm border border-border border-l-2 px-2.5 py-1.5", toneCls)}>
          <button
            type="button"
            onClick={onComplete}
            className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border text-transparent hover:border-primary hover:text-primary"
            aria-label="Pabeigt"
          >
            <CheckSquare className="h-3 w-3" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-medium text-foreground">{visibleAction}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0 text-[10.5px] text-muted-foreground">
              {visibleDue && (
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="h-2.5 w-2.5" />
                  {relativeTime(visibleDue)}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <User className="h-2.5 w-2.5" />
                {isHumanPrimary ? "Cilvēks" : "Auto"}
              </span>
            </div>
          </div>
          <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold", badgeCls)}>
            {overdue ? "Nokavēts" : today ? "Šodien" : "Plānots"}
          </span>
        </li>
      ) : (
        <li className="rounded-sm border border-dashed border-border/60 bg-card/50 px-2.5 py-1.5 text-center text-[11px] text-muted-foreground">
          Nav plānotu darbību
        </li>
      )}

      {sisLabel && (
        <li className="flex items-start gap-2 rounded-sm border border-border/50 border-l-2 border-l-violet-500/60 bg-violet-500/5 px-2.5 py-1.5">
          <Zap className="mt-0.5 h-3 w-3 shrink-0 text-violet-500" />
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] font-medium text-foreground">{sisLabel}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              SIS automātika{sisDue ? ` · ${relativeTime(sisDue)}` : ""}
            </div>
          </div>
          <span className="shrink-0 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
            Auto
          </span>
        </li>
      )}

      <li>
        <button
          type="button"
          className="inline-flex h-7 w-full items-center justify-center gap-1 rounded border border-dashed border-border/60 bg-transparent text-[11px] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          Pievienot uzdevumu
        </button>
      </li>
    </ul>
  );
}

/* ---- Contact grid ---- */

function ContactGrid({
  phoneE164, phoneRaw, phoneValidated, phoneLineType, email, emailRaw,
}: {
  phoneE164: string;
  phoneRaw: string;
  phoneValidated: boolean;
  phoneLineType: string;
  email: string;
  emailRaw: string;
}) {
  const phonePrimary = phoneE164 || phoneRaw;
  const phoneChips: Array<{ label: string; tone: "emerald" | "amber" | "rose" | "neutral" }> = [];
  if (phoneE164) phoneChips.push({ label: "E.164", tone: "emerald" });
  else if (phoneRaw) phoneChips.push({ label: "raw", tone: "amber" });
  if (phoneValidated) phoneChips.push({ label: "validated", tone: "emerald" });
  else if (phonePrimary) phoneChips.push({ label: "unverified", tone: "neutral" });
  if (phoneLineType) phoneChips.push({ label: phoneLineType, tone: "neutral" });

  const emailChips: Array<{ label: string; tone: "emerald" | "amber" | "rose" | "neutral" }> = [];
  if (email) emailChips.push({ label: "normalized", tone: "emerald" });
  else if (emailRaw) emailChips.push({ label: "raw", tone: "amber" });

  return (
    <div className="rounded-sm border border-border/60 bg-card">
      <ContactRow
        icon={<Phone className="h-3 w-3" />}
        label="Telefons"
        value={phonePrimary}
        sub={phoneE164 && phoneRaw && phoneE164 !== phoneRaw ? phoneRaw : undefined}
        chips={phoneChips}
        actions={phonePrimary ? [
          { href: `tel:${phonePrimary}`, icon: <Phone className="h-3 w-3" />, label: "Zvanīt" },
          { href: `https://wa.me/${phonePrimary.replace(/[^0-9]/g, "")}`, icon: <MessageCircle className="h-3 w-3" />, label: "WhatsApp" },
        ] : []}
      />
      <ContactRow
        icon={<Mail className="h-3 w-3" />}
        label="E-pasts"
        value={email || emailRaw}
        sub={email && emailRaw && email !== emailRaw ? emailRaw : undefined}
        chips={emailChips}
        actions={(email || emailRaw) ? [
          { href: `mailto:${email || emailRaw}`, icon: <Mail className="h-3 w-3" />, label: "Sūtīt" },
        ] : []}
      />
      <ContactRow
        icon={<ShieldCheck className="h-3 w-3" />}
        label="Opt-in / GDPR"
        value=""
        chips={[]}
        actions={[]}
      />
      <ContactRow
        icon={<MessageCircle className="h-3 w-3" />}
        label="WhatsApp"
        value=""
        chips={[{ label: "nav pārbaudīts", tone: "neutral" }]}
        actions={[]}
      />
    </div>
  );
}

function ContactRow({
  icon, label, value, sub, chips, actions,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  chips?: Array<{ label: string; tone: "emerald" | "amber" | "rose" | "neutral" }>;
  actions?: Array<{ href: string; icon: React.ReactNode; label: string }>;
}) {
  const muted = !value;
  return (
    <div className="flex items-center gap-2 border-b border-border/40 px-2.5 py-1.5 last:border-b-0">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {chips?.map((c, i) => (
            <span key={i} className={cn(
              "inline-flex items-center rounded px-1 text-[9px] font-medium leading-tight",
              c.tone === "emerald" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
              c.tone === "amber" && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
              c.tone === "rose" && "bg-rose-500/10 text-rose-700 dark:text-rose-400",
              c.tone === "neutral" && "bg-muted text-muted-foreground",
            )}>
              {c.label}
            </span>
          ))}
        </div>
        <div className={cn("truncate text-[12px] font-medium", muted ? "text-muted-foreground/60" : "text-foreground")}>
          {value || "—"}
        </div>
        {sub && <div className="truncate text-[10px] text-muted-foreground">{sub}</div>}
      </div>
      {actions && actions.length > 0 && (
        <div className="flex shrink-0 items-center gap-0.5">
          {actions.map((a, i) => (
            <a
              key={i}
              href={a.href}
              aria-label={a.label}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {a.icon}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- Loading skeletons ---- */

function HeaderSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Skeleton className="h-7 w-7 rounded-full" />
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3.5 w-12" />
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-3.5 w-10" />
      </div>
      <div className="hidden flex-[1.1] items-center justify-center gap-2 md:flex">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-3.5 w-16" />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-7 rounded" />
        ))}
      </div>
    </div>
  );
}

function ContactSkeleton() {
  return (
    <div className="rounded-sm border border-border/60 bg-card">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-2 border-b border-border/40 px-2.5 py-1.5 last:border-b-0">
          <Skeleton className="h-5 w-5 rounded" />
          <div className="min-w-0 flex-1 space-y-1">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-5 w-12" />
        </div>
      ))}
    </div>
  );
}
