import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import {
  Eye,
  Mail,
  MessageSquare,
  Phone,
  MessageCircle,
  Send,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { SearchInput } from "@/components/SearchInput";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useInfiniteAnalyticsView } from "@/hooks/useInfiniteAnalyticsView";
import { useAnalyticsRpc } from "@/hooks/useAnalyticsRpc";
import { useAnalyticsCount } from "@/hooks/useAnalyticsCount";

export const Route = createFileRoute("/darba-rinda")({
  component: DarbaRindaPage,
});

const COLUMNS: { key: string; label: string; widthClass?: string; wrap?: boolean; align?: "left" | "right" | "center" }[] = [
  { key: "full_name", label: "Vārds", widthClass: "w-[14%] min-w-[140px]", wrap: true },
  { key: "email", label: "Email", widthClass: "w-[17%] min-w-[180px]", wrap: true },
  { key: "phone", label: "Telefons", widthClass: "w-[10%] min-w-[120px]" },
  { key: "tags", label: "Tagi", widthClass: "w-[10%] min-w-[110px]", wrap: true },
  { key: "status", label: "Statuss", widthClass: "w-[9%] min-w-[110px]" },
  { key: "priority", label: "Prior.", widthClass: "w-[5%] min-w-[60px]", align: "right" },
  { key: "__last_activity", label: "Pēdējā aktivitāte", widthClass: "w-[12%] min-w-[140px]", wrap: true },
  { key: "__next_step", label: "Nākamais solis", widthClass: "w-[10%] min-w-[120px]", wrap: true },
  { key: "__actions", label: "Darbības", widthClass: "w-[13%] min-w-[170px]" },
];

const SEARCH_KEYS = ["full_name", "email", "phone"] as const;

const ZERO_PRIORITY_STATUSES = new Set([
  "Atcelts",
  "Atlikts",
  "Pabeigts",
  "Nekvalificējas",
  "Līgums",
]);

const INACTIVE_STATUSES = new Set([
  "Nesasniedzams",
  "Nekvalificējas",
  "Atcelts",
]);

const GROUP_DEFS: { key: string; label: string; hint: string; test: (s: number) => boolean }[] = [
  { key: "urgent", label: "Steidzami / jāatbild", hint: "priority = 100", test: (s) => s === 100 },
  { key: "offers", label: "Piedāvājumi", hint: "priority = 90", test: (s) => s === 90 },
  { key: "verify", label: "Pārbaudīt kontaktu", hint: "priority = 80", test: (s) => s === 80 },
  { key: "followup", label: "Follow-up", hint: "priority = 70", test: (s) => s === 70 },
  { key: "contact", label: "Sazināties", hint: "priority = 60", test: (s) => s === 60 },
  { key: "none", label: "Nav darbību", hint: "priority = 0", test: (s) => s === 0 },
];

function effectivePriority(row: Record<string, unknown>): number {
  const status = row.status == null ? "" : String(row.status);
  if (ZERO_PRIORITY_STATUSES.has(status)) return 0;
  const score = Number(row.priority);
  return Number.isFinite(score) ? score : 0;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "Jauns":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
    case "Piesaistīšana":
      return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
    case "Piedāvājums":
      return "bg-purple-500/15 text-purple-700 dark:text-purple-400";
    case "Līgums":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "Atcelts":
      return "bg-destructive/15 text-destructive";
    case "Nekvalificējas":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}

function formatCell(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/* ----- Last activity formatting ----- */

// "Saņemts/Nosūtīts/etc." + channel name in nominative.
const CHANNEL_NOMINATIVE: Record<string, string> = {
  email: "e-pasts",
  sms: "SMS",
  whatsapp: "WhatsApp ziņa",
  call: "zvans",
  messenger: "Messenger ziņa",
};

function describeEvent(channel: string, type: string, group: string): string {
  const t = type.toLowerCase();
  const ch = channel.toLowerCase();
  const g = group.toLowerCase();

  // Reply (any channel)
  if (g === "reply" || t === "reply" || t === "replied") {
    return "Saņemta atbilde";
  }

  const channelName = CHANNEL_NOMINATIVE[ch];

  // Outbound / send
  if (t === "sent" || g === "outbound_attempt") {
    if (channelName) return `Nosūtīts ${channelName}`;
    return "Nosūtīta ziņa";
  }
  if (t === "delivered") {
    if (channelName) return `Piegādāts ${channelName}`;
    return "Piegādāta ziņa";
  }
  if (t === "failed" || t === "bounce") {
    if (channelName) return `Neizdevās ${channelName}`;
    return "Neizdevās piegādāt";
  }
  if (t === "open") {
    if (channelName) return `Atvērts ${channelName}`;
    return "Atvērta ziņa";
  }
  if (t === "click") return "Klikšķis uz saites";

  // Calls
  if (ch === "call" || t.startsWith("call")) {
    if (t === "call_connected") return "Atbildēts zvans";
    if (t === "call_missed") return "Neatbildēts zvans";
    return "Zvans";
  }

  if (channelName) return channelName.charAt(0).toUpperCase() + channelName.slice(1);
  if (g) return "Aktivitāte";
  return "Aktivitāte";
}

function parseTs(v: unknown): number | null {
  if (v == null || v === "") return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Latvian relative time. Uses correct singular/plural per Latvian rules:
 *   1, 21, 31… → singular ("1 minūti", "1 stundu", "1 dienu")
 *   else       → plural ("2 minūtēm", "5 stundām", "10 dienām")
 */
function plural(n: number, singular: string, plural: string): string {
  // Latvian: numbers ending in 1 (but not 11) take singular form.
  const last = n % 10;
  const last2 = n % 100;
  const isSingular = last === 1 && last2 !== 11;
  return isSingular ? singular : plural;
}

function formatRelative(ts: number | null): string {
  if (ts == null) return "—";
  const diff = Date.now() - ts;
  if (diff < 0) return new Date(ts).toLocaleDateString("lv-LV");
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "tikko";
  if (min < 60) return `pirms ${min} ${plural(min, "minūtes", "minūtēm")}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `pirms ${h} ${plural(h, "stundas", "stundām")}`;
  const d = Math.floor(h / 24);
  if (d < 30) return `pirms ${d} ${plural(d, "dienas", "dienām")}`;
  return new Date(ts).toLocaleDateString("lv-LV");
}

/**
 * Map raw next_action string from analytics.lead_priority_queue
 * to a user-facing Latvian label. Frontend MUST NOT recompute logic.
 */
function nextActionLabel(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  const lower = v.toLowerCase();
  if (lower === "follow-up" || lower === "follow_up" || lower === "followup") {
    return "Sekot (Follow-up)";
  }
  if (lower === "reply" || lower === "atbildēt" || lower === "answer") {
    return "Atbildēt";
  }
  if (
    lower === "offer" ||
    lower === "piedāvājums" ||
    lower === "send_offer" ||
    lower === "follow_offer" ||
    lower === "sekot piedāvājumam"
  ) {
    return "Sekot piedāvājumam";
  }
  if (lower === "verify_contact" || lower === "verify" || lower === "check_contact") {
    return "Pārbaudīt kontaktu";
  }
  if (lower === "contact" || lower === "sazināties" || lower === "reach_out") {
    return "Sazināties";
  }
  return v;
}

/**
 * Resolve the primary CTA for a given next_action label:
 *  - target hash on the lead profile (which section to focus)
 *  - mailto compose for follow-up
 *  - visual variant
 */
type NextStepCta = {
  variant: "primary" | "default" | "outline";
  /** hash to append to /lead/$leadId, or null for no hash */
  focus: string | null;
  /** if set, opens mailto: instead of navigating */
  mailto?: { subject: string; body: string };
};

function ctaForStep(step: string): NextStepCta {
  switch (step) {
    case "Atbildēt":
      return { variant: "primary", focus: "communication" };
    case "Sekot piedāvājumam":
      return { variant: "default", focus: "offer" };
    case "Sekot (Follow-up)":
      return {
        variant: "default",
        focus: "communication",
        mailto: {
          subject: "Sveiki! Atgādinājums par mūsu piedāvājumu",
          body:
            "Sveiki!\n\nGribēju pārliecināties, vai esat saņēmuši mūsu iepriekšējo ziņu un vai jums ir kādi jautājumi par piedāvājumu.\n\nGaidu jūsu atbildi!\n\nAr cieņu,",
        },
      };
    case "Pārbaudīt kontaktu":
      return { variant: "default", focus: "contact" };
    case "Sazināties":
      return { variant: "default", focus: "communication" };
    default:
      return { variant: "outline", focus: null };
  }
}

function ActionButtons({ row }: { row: Record<string, unknown> }) {
  const leadId = row.lead_id ?? row.id;
  const navigate = useNavigate();
  const comingSoon = () => toast("Drīzumā");

  const handleViewProfile = () => {
    if (leadId == null) {
      toast("Lead ID nav pieejams");
      return;
    }
    navigate({ to: "/lead/$leadId", params: { leadId: String(leadId) } });
  };

  return (
    <div className="flex flex-nowrap items-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity">
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0 text-muted-foreground"
        onClick={handleViewProfile}
        title="Skatīt profilu"
      >
        <Eye className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground" onClick={comingSoon} title="E-pasts">
        <Mail className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground" onClick={comingSoon} title="SMS">
        <MessageSquare className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground" onClick={comingSoon} title="WhatsApp">
        <Send className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground" onClick={comingSoon} title="Zvans">
        <Phone className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground" onClick={comingSoon} title="Messenger">
        <MessageCircle className="h-3 w-3" />
      </Button>
    </div>
  );
}

function NextStepButton({
  row,
  step,
  reason,
}: {
  row: Record<string, unknown>;
  step: string;
  reason: string;
}) {
  const navigate = useNavigate();
  const leadId = row.lead_id ?? row.id;
  const cta = ctaForStep(step);

  const handleClick = () => {
    if (cta.mailto) {
      const email = row.email == null ? "" : String(row.email).trim();
      if (!email) {
        toast("Šim leadam nav e-pasta");
        return;
      }
      const params = new URLSearchParams({
        subject: cta.mailto.subject,
        body: cta.mailto.body,
      });
      window.location.href = `mailto:${email}?${params.toString()}`;
      return;
    }
    if (leadId == null) {
      toast("Lead ID nav pieejams");
      return;
    }
    navigate({
      to: "/lead/$leadId",
      params: { leadId: String(leadId) },
      hash: cta.focus ?? undefined,
    });
  };

  const variantClass =
    cta.variant === "primary"
      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
      : cta.variant === "default"
        ? "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border"
        : "bg-transparent text-muted-foreground hover:bg-secondary/40 border border-border";

  const button = (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-semibold transition-colors w-full ${variantClass}`}
    >
      {step}
    </button>
  );

  return (
    <div className="flex flex-col gap-0.5 leading-tight">
      {reason ? (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="top">{reason}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        button
      )}
      {reason && (
        <span className="text-[10px] text-muted-foreground line-clamp-2">
          {reason}
        </span>
      )}
    </div>
  );
}

function DarbaRindaPage() {
  const search = useSearch({ strict: false }) as { q?: string; tags?: string[] };

  const q = (search.q ?? "").trim();
  const selectedTags = (search.tags ?? []) as string[];

  const [activeOnly, setActiveOnly] = useState(true);
  // KPI card filter: drives server-side query (no client-side group filtering).
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);

  // Build the PostgREST query string from current filters. Server-side only.
  // Sorting: priority desc, last_activity_at desc (both nulls last).
  const baseQuery = useMemo(() => {
    const parts: string[] = [
      "order=priority.desc.nullslast,last_activity_at.desc.nullslast",
    ];

    // KPI filter -> server filter
    if (kpiFilter === "urgent") parts.push("priority=eq.100");
    else if (kpiFilter === "offers") parts.push("priority=eq.90");
    else if (kpiFilter === "verify") parts.push("priority=eq.80");
    else if (kpiFilter === "contact") parts.push("priority=eq.60");
    else if (kpiFilter === "none") parts.push("priority=eq.0");
    else if (kpiFilter === "followup_today")
      parts.push(
        `follow_up_bucket=eq.${encodeURIComponent("Šodien jāseko")}`,
      );
    else if (kpiFilter === "followup_overdue")
      parts.push(
        `follow_up_bucket=eq.${encodeURIComponent("Kavēts follow-up")}`,
      );
    else if (kpiFilter === "followup_old")
      parts.push(
        `follow_up_bucket=eq.${encodeURIComponent("Vecie leadi")}`,
      );

    // "Tikai aktīvie leadi" -> exclude inactive statuses
    if (activeOnly) {
      parts.push(
        `status=not.in.(${[...INACTIVE_STATUSES]
          .map((s) => encodeURIComponent(s))
          .join(",")})`,
      );
    }

    // Free-text search across name/email/phone (server-side ilike)
    if (q) {
      const needle = `*${q.replace(/[(),]/g, "")}*`;
      const enc = encodeURIComponent(needle);
      parts.push(
        `or=(full_name.ilike.${enc},email.ilike.${enc},phone.ilike.${enc})`,
      );
    }

    // Tags (text column, comma-separated). Use ilike per selected tag.
    for (const t of selectedTags) {
      const enc = encodeURIComponent(`*${t}*`);
      parts.push(`tags=ilike.${enc}`);
    }

    return parts.join("&");
  }, [kpiFilter, activeOnly, q, selectedTags]);

  const {
    data,
    error,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteAnalyticsView("lead_priority_queue", baseQuery, 100);

  // Flatten loaded pages into a single ordered list.
  const rows = useMemo(() => {
    const out: Array<Record<string, unknown>> = [];
    for (const p of data?.pages ?? []) {
      for (const r of p.rows) out.push(r as Record<string, unknown>);
    }
    return out;
  }, [data]);

  const total = data?.pages?.[0]?.total ?? null;

  // Follow-up KPI cards source: dedicated RPC analytics.get_follow_up_counts.
  // ALWAYS reflects the full dataset — independent of UI filters,
  // "Tikai aktīvie leadi" toggle, pagination, or table grouping.
  const { data: bucketAgg } = useAnalyticsRpc("get_follow_up_counts", {});

  const followupCounts = useMemo(() => {
    const map: Record<string, number> = {
      "Šodien jāseko": 0,
      "Kavēts follow-up": 0,
      "Vecie leadi": 0,
    };
    const aggRows = (bucketAgg?.rows ?? []) as Array<Record<string, unknown>>;
    for (const r of aggRows) {
      // Accept either { follow_up_bucket, count } or { bucket, count } shapes.
      const bucket =
        (r.follow_up_bucket ?? r.bucket ?? "") == null
          ? ""
          : String(r.follow_up_bucket ?? r.bucket ?? "").trim();
      const count =
        Number(r.lead_count ?? r.count ?? r.total ?? 0) || 0;
      if (bucket in map) map[bucket] = count;
    }
    return map;
  }, [bucketAgg]);

  // KPI card definitions (display + total + filter key)
  const KPI_CARDS: { key: string; label: string; hint: string; total: number | null }[] = [
    { key: "urgent", label: "Steidzami / jāatbild", hint: "priority = 100", total: null },
    { key: "offers", label: "Piedāvājumi", hint: "priority = 90", total: null },
    { key: "verify", label: "Pārbaudīt kontaktu", hint: "priority = 80", total: null },
    { key: "followup_today", label: "Šodien jāseko", hint: 'follow_up_bucket = "Šodien jāseko"', total: followupCounts["Šodien jāseko"] },
    { key: "followup_overdue", label: "Kavēts follow-up", hint: 'follow_up_bucket = "Kavēts follow-up"', total: followupCounts["Kavēts follow-up"] },
    { key: "followup_old", label: "Vecie leadi", hint: 'follow_up_bucket = "Vecie leadi"', total: followupCounts["Vecie leadi"] },
    { key: "contact", label: "Sazināties", hint: "priority = 60", total: null },
    { key: "none", label: "Nav darbību", hint: "priority = 0", total: null },
  ];

  // ---------- Virtualized infinite-scroll table ----------
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 8,
  });

  // Trigger fetchNextPage when within ~3 rows of the bottom of the rendered list.
  useEffect(() => {
    const items = virtualizer.getVirtualItems();
    if (!items.length) return;
    const lastIdx = items[items.length - 1].index;
    if (lastIdx >= rows.length - 3 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [
    virtualizer.getVirtualItems(),
    rows.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    virtualizer,
  ]);

  const errorMsg =
    (error as Error | null)?.message || data?.pages?.[0]?.error || null;

  return (
    <>
      <PageHeader
        title="Leadi"
        description="Prioritārie leadi no analytics.lead_priority_queue"
      >
        <SearchInput />
      </PageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {KPI_CARDS.map((c) => {
          // KPI counts are NEVER derived from the (paginated) table — they come
          // either from the dedicated RPC (follow-up buckets) or from a
          // server-side count query keyed on the card's own filter (priority).
          const isActive = kpiFilter === c.key;
          const handleClick = () => {
            setKpiFilter(isActive ? null : c.key);
            // Reset scroll to top when filter changes.
            scrollRef.current?.scrollTo({ top: 0 });
          };
          return (
            <StatCard
              key={c.key}
              label={c.label}
              value={c.total ?? "—"}
              hint={c.hint}
              onClick={handleClick}
              active={isActive}
            />
          );
        })}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <Switch
          id="active-only"
          checked={activeOnly}
          onCheckedChange={setActiveOnly}
        />
        <Label htmlFor="active-only" className="text-sm cursor-pointer">
          Tikai aktīvie leadi
        </Label>
        <span className="text-xs text-muted-foreground">
          Slēpj: Nesasniedzams, Nekvalificējas, Atcelts
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground tabular-nums">
            Kopā:{" "}
            <span className="font-medium text-foreground">
              {total ?? "—"}
            </span>{" "}
            leadi
          </span>
          {kpiFilter && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Aktīvs filtrs:{" "}
                <span className="font-medium text-foreground">
                  {KPI_CARDS.find((c) => c.key === kpiFilter)?.label ??
                    kpiFilter}
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                onClick={() => {
                  setKpiFilter(null);
                  scrollRef.current?.scrollTo({ top: 0 });
                }}
              >
                Atiestatīt filtrus
              </Button>
            </div>
          )}
        </div>
      </div>

      {errorMsg && <ErrorState message={errorMsg} />}
      {!errorMsg && isLoading && <LoadingState />}

      {!errorMsg && !isLoading && (
        rows.length === 0 ? (
          <EmptyState />
        ) : (
          <VirtualLeadList
            rows={rows}
            scrollRef={scrollRef}
            virtualizer={virtualizer}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={!!hasNextPage}
            total={total}
          />
        )
      )}
    </>
  );
}

// Grid template matching the original COLUMNS widths.
// Each column maps to one fr based on its previous percentage,
// with min-width preserved via `minmax()`.
const GRID_TEMPLATE =
  "minmax(140px,14fr) minmax(180px,17fr) minmax(120px,10fr) minmax(110px,10fr) minmax(110px,9fr) minmax(60px,5fr) minmax(140px,12fr) minmax(120px,10fr) minmax(170px,13fr)";

function renderCell(c: (typeof COLUMNS)[number], row: Record<string, unknown>): ReactNode {
  if (c.key === "__actions") return <ActionButtons row={row} />;
  if (c.key === "__last_activity") {
    const ts = parseTs(row.last_activity_at);
    const channel = row.last_channel == null ? "" : String(row.last_channel);
    const evType = row.last_event_type == null ? "" : String(row.last_event_type);
    const evGroup = row.last_event_group == null ? "" : String(row.last_event_group);
    if (ts == null && !channel && !evType && !evGroup) {
      return <span className="text-muted-foreground">—</span>;
    }
    const label = describeEvent(channel, evType, evGroup);
    return (
      <div className="flex flex-col leading-tight">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{formatRelative(ts)}</span>
      </div>
    );
  }
  if (c.key === "__next_step") {
    const raw = row.next_action == null ? "" : String(row.next_action);
    const reason =
      row.next_action_reason == null ? "" : String(row.next_action_reason);
    const step = nextActionLabel(raw);
    if (!step) {
      return <span className="text-xs text-muted-foreground">Nav darbību</span>;
    }
    return <NextStepButton row={row} step={step} reason={reason} />;
  }
  if (c.key === "priority") return String(effectivePriority(row));
  if (c.key === "phone") {
    const text = formatCell(row.phone);
    if (text === "") return "";
    return (
      <a
        href={`tel:${text.replace(/\s+/g, "")}`}
        className="text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {text}
      </a>
    );
  }
  if (c.key === "status") {
    const text = formatCell(row.status);
    if (text === "") {
      return (
        <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
          Nav statusa
        </span>
      );
    }
    return (
      <span
        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(text)}`}
      >
        {text}
      </span>
    );
  }
  const text = formatCell(row[c.key]);
  return text === "" ? <span className="text-muted-foreground">—</span> : text;
}

function LeadRow({ row }: { row: Record<string, unknown> }) {
  const score = effectivePriority(row);
  const highlight =
    score === 100
      ? "bg-destructive/5"
      : score >= 80
        ? "bg-amber-500/5"
        : "";
  return (
    <div
      className={`grid items-center border-t border-border text-sm hover:bg-secondary/30 ${highlight}`}
      style={{ gridTemplateColumns: GRID_TEMPLATE }}
    >
      {COLUMNS.map((c) => {
        const isScore = c.key === "priority";
        return (
          <div
            key={c.key}
            className={`px-2 py-2 text-foreground ${
              c.align === "right" ? "text-right" : "text-left"
            } ${c.wrap ? "whitespace-normal break-words" : "truncate"} ${
              isScore ? "font-semibold tabular-nums" : ""
            }`}
            title={
              c.key !== "__actions" &&
              c.key !== "__last_activity" &&
              c.key !== "__next_step" &&
              !c.wrap
                ? formatCell(row[c.key])
                : undefined
            }
          >
            {renderCell(c, row)}
          </div>
        );
      })}
    </div>
  );
}

function VirtualLeadList({
  rows,
  scrollRef,
  virtualizer,
  isFetchingNextPage,
  hasNextPage,
  total,
}: {
  rows: Array<Record<string, unknown>>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  total: number | null;
}) {
  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      style={{ maxHeight: "calc(100vh - 380px)" }}
    >
      {/* Sticky column header */}
      <div
        className="grid border-b border-border bg-muted text-xs uppercase text-muted-foreground"
        style={{ gridTemplateColumns: GRID_TEMPLATE }}
      >
        {COLUMNS.map((c) => (
          <div
            key={c.key}
            className={`px-2 py-2 font-medium tracking-wide ${
              c.align === "right" ? "text-right" : "text-left"
            } ${c.wrap ? "" : "whitespace-nowrap"}`}
          >
            {c.label}
          </div>
        ))}
      </div>

      {/* Virtualized scroll body */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div style={{ height: totalSize, position: "relative" }}>
          {items.map((vi) => {
            const row = rows[vi.index];
            if (!row) return null;
            return (
              <div
                key={vi.key}
                ref={virtualizer.measureElement}
                data-index={vi.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <LeadRow row={row} />
              </div>
            );
          })}
        </div>
        {/* Bottom loading / end-of-list indicator */}
        <div className="flex items-center justify-center px-4 py-3 text-xs text-muted-foreground">
          {isFetchingNextPage ? (
            <span>Ielādē vēl...</span>
          ) : hasNextPage ? (
            <span>Ritini, lai ielādētu vairāk</span>
          ) : total != null ? (
            <span>
              Visi {total} leadi ielādēti
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}