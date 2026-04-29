import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMemo, useRef, useCallback, useState } from "react";
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
import { useAnalyticsView } from "@/hooks/useAnalyticsView";

export const Route = createFileRoute("/darba-rinda")({
  component: DarbaRindaPage,
});

const COLUMNS: { key: string; label: string; widthClass?: string; wrap?: boolean; align?: "left" | "right" | "center" }[] = [
  { key: "full_name", label: "Vārds", widthClass: "w-[14%] min-w-[140px]", wrap: true },
  { key: "email", label: "Email", widthClass: "w-[17%] min-w-[180px]", wrap: true },
  { key: "phone_raw", label: "Telefons", widthClass: "w-[10%] min-w-[120px]" },
  { key: "tags", label: "Tagi", widthClass: "w-[10%] min-w-[110px]", wrap: true },
  { key: "current_status", label: "Statuss", widthClass: "w-[9%] min-w-[110px]" },
  { key: "priority", label: "Prior.", widthClass: "w-[5%] min-w-[60px]", align: "right" },
  { key: "__last_activity", label: "Pēdējā aktivitāte", widthClass: "w-[12%] min-w-[140px]", wrap: true },
  { key: "__next_step", label: "Nākamais solis", widthClass: "w-[10%] min-w-[120px]", wrap: true },
  { key: "__actions", label: "Darbības", widthClass: "w-[13%] min-w-[170px]" },
];

const SEARCH_KEYS = ["full_name", "email", "phone_raw"] as const;

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
  const status = row.current_status == null ? "" : String(row.current_status);
  if (ZERO_PRIORITY_STATUSES.has(status)) return 0;
  const score = Number(row.priority);
  return Number.isFinite(score) ? score : 0;
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
  if (lower === "offer" || lower === "piedāvājums" || lower === "send_offer") {
    return "Sūtīt piedāvājumu";
  }
  if (lower === "verify_contact" || lower === "verify" || lower === "check_contact") {
    return "Pārbaudīt kontaktu";
  }
  if (lower === "contact" || lower === "sazināties" || lower === "reach_out") {
    return "Sazināties";
  }
  return v;
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
    <div className="flex flex-nowrap items-center gap-0.5">
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-1.5"
        onClick={handleViewProfile}
        title="Skatīt profilu"
      >
        <Eye className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={comingSoon} title="E-pasts">
        <Mail className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={comingSoon} title="SMS">
        <MessageSquare className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={comingSoon} title="WhatsApp">
        <Send className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={comingSoon} title="Zvans">
        <Phone className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={comingSoon} title="Messenger">
        <MessageCircle className="h-3 w-3" />
      </Button>
    </div>
  );
}

function DarbaRindaPage() {
  const search = useSearch({ strict: false }) as { q?: string; tags?: string[] };
  const query = useMemo(
    () => "order=priority.desc.nullslast&limit=1000",
    [],
  );

  const { data, isLoading, error } = useAnalyticsView(
    "lead_priority_queue",
    query,
  );

  const rows = (data?.rows ?? []) as Array<Record<string, unknown>>;

  const q = search.q ?? "";

  const [activeOnly, setActiveOnly] = useState(true);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const pa = effectivePriority(a);
      const pb = effectivePriority(b);
      if (pb !== pa) return pb - pa;
      // Then by last_activity_at desc, nulls last
      const ta = parseTs(a.last_activity_at);
      const tb = parseTs(b.last_activity_at);
      if (ta == null && tb == null) return 0;
      if (ta == null) return 1;
      if (tb == null) return -1;
      return tb - ta;
    });
    return copy;
  }, [rows]);

  const filtered = useMemo(() => {
    const selectedTags = (search.tags ?? []) as string[];
    const needle = q.trim().toLowerCase();
    return sorted.filter((r) => {
      if (activeOnly) {
        const status = r.current_status == null ? "" : String(r.current_status);
        if (INACTIVE_STATUSES.has(status)) return false;
      }
      if (selectedTags.length > 0) {
        const v = r.tags;
        const rowTags: string[] = Array.isArray(v)
          ? v.map((t) => String(t).trim()).filter(Boolean)
          : v == null
            ? []
            : String(v)
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);
        const lower = rowTags.map((t) => t.toLowerCase());
        const sel = selectedTags.map((t) => t.toLowerCase());
        // EXACT SET match: same length, every selected tag present.
        if (lower.length !== sel.length) return false;
        const exact = sel.every((t) => lower.includes(t));
        if (!exact) return false;
      }
      if (needle) {
        return SEARCH_KEYS.some((k) => {
          const v = r[k];
          return v == null ? false : String(v).toLowerCase().includes(needle);
        });
      }
      return true;
    });
  }, [sorted, q, search.tags, activeOnly]);

  const groups = useMemo(() => {
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const result: { key: string; label: string; hint: string; rows: Array<Record<string, unknown>> }[] = [];

    for (const d of GROUP_DEFS) {
      const matched = filtered.filter((r) => d.test(effectivePriority(r)));

      if (d.key === "followup") {
        // Split Follow-up by last_outbound_at age (oldest first inside each).
        const ageDays = (r: Record<string, unknown>): number | null => {
          const ts = parseTs(r.last_outbound_at);
          if (ts == null) return null;
          return (now - ts) / DAY;
        };

        const today: Array<Record<string, unknown>> = [];
        const overdue: Array<Record<string, unknown>> = [];
        const old: Array<Record<string, unknown>> = [];
        const noDate: Array<Record<string, unknown>> = [];

        for (const r of matched) {
          const a = ageDays(r);
          if (a == null) {
            noDate.push(r);
          } else if (a > 14) {
            old.push(r);
          } else if (a > 5) {
            overdue.push(r);
          } else if (a >= 3) {
            today.push(r);
          } else {
            // <3 days — keep visible under "today" bucket so nothing is lost
            today.push(r);
          }
        }

        const byOldest = (a: Record<string, unknown>, b: Record<string, unknown>) => {
          const ta = parseTs(a.last_outbound_at) ?? Number.POSITIVE_INFINITY;
          const tb = parseTs(b.last_outbound_at) ?? Number.POSITIVE_INFINITY;
          return ta - tb; // oldest first
        };

        today.sort(byOldest);
        overdue.sort(byOldest);
        old.sort(byOldest);
        noDate.sort(byOldest);

        result.push({
          key: "followup_today",
          label: "Šodien jāseko",
          hint: "last_outbound_at 3–5 d atpakaļ",
          rows: today,
        });
        result.push({
          key: "followup_overdue",
          label: "Kavēts follow-up",
          hint: "last_outbound_at 6–14 d atpakaļ",
          rows: overdue,
        });
        result.push({
          key: "followup_old",
          label: "Vecie leadi",
          hint: "last_outbound_at > 14 d",
          rows: [...old, ...noDate],
        });
      } else {
        result.push({ key: d.key, label: d.label, hint: d.hint, rows: matched });
      }
    }

    return result;
  }, [filtered]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const scrollToGroup = useCallback((key: string) => {
    const container = scrollContainerRef.current;
    const row = groupRefs.current[key];
    if (!container || !row) return;
    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const headerOffset = container.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const delta = rowRect.top - containerRect.top - headerOffset;
    container.scrollBy({ top: delta, behavior: "smooth" });
  }, []);

  const errorMsg = (error as Error | null)?.message || data?.error;

  return (
    <>
      <PageHeader
        title="Leadi"
        description="Prioritārie leadi no analytics.lead_priority_queue"
      >
        <SearchInput />
      </PageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {groups.map((g) => (
          <StatCard
            key={g.key}
            label={g.label}
            value={g.rows.length}
            hint={g.hint}
            onClick={g.rows.length > 0 ? () => scrollToGroup(g.key) : undefined}
          />
        ))}
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
      </div>

      {errorMsg && <ErrorState message={errorMsg} />}
      {!errorMsg && isLoading && <LoadingState />}

      {!errorMsg && !isLoading && (
        rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm" style={{ maxHeight: "calc(100vh - 380px)" }}>
            <div ref={scrollContainerRef} className="flex-1 overflow-auto">
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 z-10 bg-muted text-xs uppercase text-muted-foreground shadow-sm">
                  <tr>
                    {COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        className={`px-2 py-2 font-medium tracking-wide ${
                          c.align === "right" ? "text-right" : "text-left"
                        } ${c.wrap ? "" : "whitespace-nowrap"} ${c.widthClass ?? ""}`}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <GroupRows
                      key={g.key}
                      label={g.label}
                      rows={g.rows}
                      headerRef={(el) => { groupRefs.current[g.key] = el; }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              Rāda {filtered.length} no {rows.length} ierakstiem, sakārtotus pēc prioritātes
            </div>
          </div>
        )
      )}
    </>
  );
}

function GroupRows({
  label,
  rows,
  headerRef,
}: {
  label: string;
  rows: Array<Record<string, unknown>>;
  headerRef?: (el: HTMLTableRowElement | null) => void;
}) {
  return (
    <>
      <tr ref={headerRef} className="border-t border-border bg-secondary/40">
        <td
          colSpan={COLUMNS.length}
          className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground"
        >
          {label}{" "}
          <span className="ml-1 text-muted-foreground normal-case">({rows.length})</span>
        </td>
      </tr>
      {rows.length === 0 ? (
        <tr className="border-t border-border">
          <td
            colSpan={COLUMNS.length}
            className="px-3 py-3 text-center text-xs text-muted-foreground"
          >
            Nav ierakstu
          </td>
        </tr>
      ) : (
        rows.map((row, i) => {
          const score = effectivePriority(row);
          const highlight =
            score === 100
              ? "bg-destructive/5"
              : score >= 80
                ? "bg-amber-500/5"
                : "";
          return (
            <tr
              key={i}
              className={`border-t border-border hover:bg-secondary/30 ${highlight}`}
            >
              {COLUMNS.map((c) => {
                const isScore = c.key === "priority";
                let content: ReactNode;
                if (c.key === "__actions") {
                  content = <ActionButtons row={row} />;
                } else if (c.key === "__last_activity") {
                  const ts = parseTs(row.last_activity_at);
                  const channel =
                    row.last_channel == null ? "" : String(row.last_channel);
                  const evType =
                    row.last_event_type == null
                      ? ""
                      : String(row.last_event_type);
                  const evGroup =
                    row.last_event_group == null
                      ? ""
                      : String(row.last_event_group);
                  if (ts == null && !channel && !evType && !evGroup) {
                    content = (
                      <span className="text-muted-foreground">—</span>
                    );
                  } else {
                    const label = describeEvent(channel, evType, evGroup);
                    content = (
                      <div className="flex flex-col leading-tight">
                        <span className="font-medium text-foreground">
                          {label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatRelative(ts)}
                        </span>
                      </div>
                    );
                  }
                } else if (c.key === "__next_step") {
                  const raw =
                    row.next_action == null ? "" : String(row.next_action);
                  const reason =
                    row.next_action_reason == null
                      ? ""
                      : String(row.next_action_reason);
                  const step = nextActionLabel(raw);
                  if (!step) {
                    content = (
                      <span className="text-xs text-muted-foreground">
                        Nav darbību
                      </span>
                    );
                  } else {
                    const tone =
                      step === "Atbildēt"
                        ? "bg-destructive/15 text-destructive"
                        : step === "Sekot (Follow-up)"
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                          : "bg-secondary text-secondary-foreground";
                    const badge = (
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tone}`}
                      >
                        {step}
                      </span>
                    );
                    content = (
                      <div className="flex flex-col gap-0.5 leading-tight">
                        {reason ? (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>{badge}</TooltipTrigger>
                              <TooltipContent side="top">
                                {reason}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          badge
                        )}
                        {reason && (
                          <span className="text-[10px] text-muted-foreground line-clamp-2">
                            {reason}
                          </span>
                        )}
                      </div>
                    );
                  }
                } else if (isScore) {
                  content = String(effectivePriority(row));
                } else {
                  const text = formatCell(row[c.key]);
                  content =
                    text === "" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      text
                    );
                }
                return (
                  <td
                    key={c.key}
                    className={`px-2 py-2 text-foreground ${
                      c.align === "right" ? "text-right" : "text-left"
                    } ${
                      c.wrap
                        ? "whitespace-normal break-words"
                        : "truncate"
                    } ${c.widthClass ?? ""} ${
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
                    {content}
                  </td>
                );
              })}
            </tr>
          );
        })
      )}
    </>
  );
}