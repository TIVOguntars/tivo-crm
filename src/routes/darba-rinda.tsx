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
  { key: "priority_score", label: "Prior.", widthClass: "w-[5%] min-w-[60px]", align: "right" },
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
  { key: "urgent", label: "Steidzami / PPV", hint: "priority ≥ 90", test: (s) => s >= 90 },
  { key: "high", label: "Augsta prioritāte", hint: "70 ≤ priority < 90", test: (s) => s >= 70 && s < 90 },
  { key: "medium", label: "Vidēja prioritāte", hint: "40 ≤ priority < 70", test: (s) => s >= 40 && s < 70 },
  { key: "low", label: "Zema prioritāte", hint: "0 < priority < 40", test: (s) => s > 0 && s < 40 },
  { key: "none", label: "Nav darbību", hint: "priority = 0", test: (s) => s === 0 },
];

function effectivePriority(row: Record<string, unknown>): number {
  const status = row.current_status == null ? "" : String(row.current_status);
  if (ZERO_PRIORITY_STATUSES.has(status)) return 0;
  const score = Number(row.priority_score);
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

function formatRelative(ts: number | null): string {
  if (ts == null) return "—";
  const diff = Date.now() - ts;
  if (diff < 0) return new Date(ts).toLocaleDateString("lv-LV");
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "tikko";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} days ago`;
  return new Date(ts).toLocaleDateString("lv-LV");
}

interface EngagementInfo {
  last_event_at: string | null;
  last_channel: string;
  last_event_type: string;
  last_event_group: string;
  has_reply: boolean;
  first_outbound_at: string | null;
}

const RECENT_REPLY_DAYS = 7;
const FOLLOWUP_DAYS = 3;

/**
 * Rule-based next step for a lead. NOT AI.
 * Order matters: reply > follow-up > status-driven defaults.
 */
function computeNextStep(
  status: string,
  eng: EngagementInfo | undefined,
): string {
  const now = Date.now();

  // 1. Recent reply → must answer
  if (eng?.has_reply) {
    const lastTs = parseTs(eng.last_event_at);
    if (
      lastTs != null &&
      now - lastTs <= RECENT_REPLY_DAYS * 24 * 60 * 60 * 1000
    ) {
      return "Atbildēt";
    }
  }

  // 2. No reply, last outbound > 3d → follow up
  if (eng && !eng.has_reply && eng.first_outbound_at) {
    const lastTs = parseTs(eng.last_event_at);
    if (
      lastTs != null &&
      now - lastTs > FOLLOWUP_DAYS * 24 * 60 * 60 * 1000
    ) {
      return "Follow-up";
    }
  }

  // 3. Status-driven defaults
  if (status === "Piedāvājums") return "Sekot piedāvājumam";
  if (status === "Jauns") return "Sazināties";

  return "—";
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
    () => "order=priority_score.desc.nullslast&limit=1000",
    [],
  );

  const { data, isLoading, error } = useAnalyticsView(
    "lead_priority_queue",
    query,
  );

  const engagement = useAnalyticsView(
    "lead_engagement_summary",
    "limit=5000",
  );

  const engagementById = useMemo(() => {
    const map = new Map<string, EngagementInfo>();
    const erows = (engagement.data?.rows ?? []) as Array<Record<string, unknown>>;
    for (const r of erows) {
      const id = r.lead_id == null ? "" : String(r.lead_id);
      if (!id) continue;
      map.set(id, {
        last_event_at:
          r.last_event_at == null ? null : String(r.last_event_at),
        last_channel: r.last_channel == null ? "" : String(r.last_channel),
        last_event_type:
          r.last_event_type == null ? "" : String(r.last_event_type),
        last_event_group:
          r.last_event_group == null ? "" : String(r.last_event_group),
        has_reply: Boolean(r.has_reply),
        first_outbound_at:
          r.first_outbound_at == null ? null : String(r.first_outbound_at),
      });
    }
    return map;
  }, [engagement.data]);

  const rows = (data?.rows ?? []) as Array<Record<string, unknown>>;

  const q = search.q ?? "";

  const [activeOnly, setActiveOnly] = useState(true);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => effectivePriority(b) - effectivePriority(a));
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
    return GROUP_DEFS.map((d) => ({
      ...d,
      rows: filtered.filter((r) => d.test(effectivePriority(r))),
    }));
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
        title="Darba rinda"
        description="Prioritārie leadi no analytics.lead_priority_queue"
      >
        <SearchInput />
      </PageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                      engagementById={engagementById}
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
  engagementById,
  headerRef,
}: {
  label: string;
  rows: Array<Record<string, unknown>>;
  engagementById: Map<string, EngagementInfo>;
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
                const isScore = c.key === "priority_score";
                let content: ReactNode;
                if (c.key === "__actions") {
                  content = <ActionButtons row={row} />;
                } else if (c.key === "__last_activity") {
                  const id = row.lead_id == null ? "" : String(row.lead_id);
                  const eng = id ? engagementById.get(id) : undefined;
                  const ts = parseTs(eng?.last_event_at ?? row.last_event_at);
                  if (ts == null && !eng) {
                    content = (
                      <span className="text-muted-foreground">—</span>
                    );
                  } else {
                    const label = describeEvent(
                      eng?.last_channel ?? "",
                      eng?.last_event_type ?? "",
                      eng?.last_event_group ?? "",
                    );
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
                  const id = row.lead_id == null ? "" : String(row.lead_id);
                  const eng = id ? engagementById.get(id) : undefined;
                  const status =
                    row.current_status == null ? "" : String(row.current_status);
                  const step = computeNextStep(status, eng);
                  if (step === "—") {
                    content = <span className="text-muted-foreground">—</span>;
                  } else {
                    const tone =
                      step === "Atbildēt"
                        ? "bg-destructive/15 text-destructive"
                        : step === "Follow-up"
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                          : "bg-secondary text-secondary-foreground";
                    content = (
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tone}`}
                      >
                        {step}
                      </span>
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