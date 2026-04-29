import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { Eye, Mail, CheckCircle2 } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { SearchInput } from "@/components/SearchInput";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";

export const Route = createFileRoute("/leadi")({
  component: LeadiPage,
});

/* ---------------------------- Types ---------------------------- */

type Row = Record<string, unknown>;

interface QueueLead {
  lead_id: string;
  full_name: string;
  email: string;
  phone: string;
  status: string;
  priority: number;
  last_event_at: string | null;
  last_event_group: string | null;
  has_reply: boolean;
  first_outbound_at: string | null;
  ppv: string;
  tags: string[];
}

/* ----------------------- Constants ----------------------- */

const ZERO_PRIORITY_STATUSES = new Set([
  "Atcelts",
  "Atlikts",
  "Pabeigts",
  "Nekvalificējas",
  "Līgums",
]);

const FOLLOWUP_DAYS = 3;
const HIGH_PRIORITY_THRESHOLD = 70;
const MAX_PER_SECTION = 50;

const CONTACTED_STORAGE_KEY = "tivo_contacted_leads_v1";
const CONTACTED_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/* --------------------- Local "contacted" store --------------------- */

function readContacted(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CONTACTED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    const fresh: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && now - v < CONTACTED_TTL_MS) fresh[k] = v;
    }
    return fresh;
  } catch {
    return {};
  }
}

function writeContacted(map: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CONTACTED_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

/* ----------------------- Helpers ----------------------- */

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

function effectivePriority(status: string, score: number): number {
  if (ZERO_PRIORITY_STATUSES.has(status)) return 0;
  return Number.isFinite(score) ? score : 0;
}

function parseDate(v: unknown): number | null {
  if (v == null || v === "") return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}

function formatRelative(v: string | null): string {
  const t = parseDate(v);
  if (t == null) return "—";
  const diff = Date.now() - t;
  if (diff < 0) return new Date(t).toLocaleDateString("lv-LV");
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "tikko";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `pirms ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `pirms ${d} d`;
  return new Date(t).toLocaleDateString("lv-LV");
}

function priorityBadgeClass(score: number): string {
  if (score >= 90) return "bg-destructive/15 text-destructive";
  if (score >= 70) return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  if (score >= 40) return "bg-secondary text-secondary-foreground";
  return "bg-muted text-muted-foreground";
}

/* ----------------------- Action buttons ----------------------- */

function ActionButtons({
  lead,
  onMarkContacted,
  contacted,
}: {
  lead: QueueLead;
  onMarkContacted: (id: string) => void;
  contacted: boolean;
}) {
  const navigate = useNavigate();

  const open = useCallback(() => {
    if (!lead.lead_id) {
      toast("Lead ID nav pieejams");
      return;
    }
    navigate({ to: "/lead/$leadId", params: { leadId: String(lead.lead_id) } });
  }, [lead.lead_id, navigate]);

  const sendEmail = useCallback(() => {
    if (!lead.email) {
      toast("Šim leadam nav e-pasta");
      return;
    }
    window.location.href = `mailto:${lead.email}`;
  }, [lead.email]);

  return (
    <div className="flex flex-nowrap items-center justify-end gap-1">
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2"
        onClick={open}
        title="Atvērt leadu"
      >
        <Eye className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        onClick={sendEmail}
        disabled={!lead.email}
        title={lead.email ? `E-pasts: ${lead.email}` : "Nav e-pasta"}
      >
        <Mail className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant={contacted ? "secondary" : "ghost"}
        className="h-7 px-2"
        onClick={() => onMarkContacted(lead.lead_id)}
        title="Atzīmēt kā sazināts"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/* ----------------------- Section component ----------------------- */

function SectionTable({
  title,
  description,
  leads,
  totalCount,
  contactedMap,
  onMarkContacted,
  emptyText,
}: {
  title: string;
  description: string;
  leads: QueueLead[];
  totalCount: number;
  contactedMap: Record<string, number>;
  onMarkContacted: (id: string) => void;
  emptyText: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {title}{" "}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({totalCount})
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {totalCount > MAX_PER_SECTION && (
          <span className="text-xs text-muted-foreground">
            Rāda pirmos {MAX_PER_SECTION}
          </span>
        )}
      </header>

      {leads.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Vārds</th>
                <th className="px-3 py-2 text-left font-medium">Email</th>
                <th className="px-3 py-2 text-left font-medium">Telefons</th>
                <th className="px-3 py-2 text-left font-medium">Pēd. aktivitāte</th>
                <th className="px-3 py-2 text-left font-medium">Statuss</th>
                <th className="px-3 py-2 text-right font-medium">Prioritāte</th>
                <th className="px-3 py-2 text-right font-medium">Darbības</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const isContacted = Boolean(contactedMap[lead.lead_id]);
                return (
                  <tr
                    key={lead.lead_id}
                    className={`border-t border-border hover:bg-secondary/30 ${
                      isContacted ? "opacity-60" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-medium text-foreground">
                      {lead.full_name || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      {lead.email ? (
                        <a
                          href={`mailto:${lead.email}`}
                          className="text-primary hover:underline"
                        >
                          {lead.email}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-foreground">
                      {lead.phone || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      <div>{formatRelative(lead.last_event_at)}</div>
                      {lead.last_event_group && (
                        <div className="text-xs text-muted-foreground">
                          {lead.last_event_group}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      {lead.status || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-semibold tabular-nums ${priorityBadgeClass(
                          lead.priority,
                        )}`}
                      >
                        {lead.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ActionButtons
                        lead={lead}
                        contacted={isContacted}
                        onMarkContacted={onMarkContacted}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ----------------------- Page ----------------------- */

function LeadiPage() {
  const search = Route.useSearch();
  const q = search.q ?? "";
  const selectedTags: string[] = (search.tags as string[] | undefined) ?? [];

  const priority = useAnalyticsView(
    "lead_priority_queue",
    "order=priority.desc.nullslast&limit=2000",
  );
  const engagement = useAnalyticsView(
    "lead_engagement_summary",
    "limit=5000",
  );
  const overview = useAnalyticsView(
    "leads_overview",
    "select=lead_id,ppv_vards,country,source,owner&limit=5000",
  );

  const errorMsg =
    (priority.error as Error | null)?.message ||
    priority.data?.error ||
    (engagement.error as Error | null)?.message ||
    engagement.data?.error;

  const loading = priority.isLoading || engagement.isLoading;

  const [contactedMap, setContactedMap] = useState<Record<string, number>>({});
  useEffect(() => {
    setContactedMap(readContacted());
  }, []);

  const handleMarkContacted = useCallback((leadId: string) => {
    if (!leadId) return;
    setContactedMap((prev) => {
      const next = { ...prev };
      if (next[leadId]) {
        delete next[leadId];
        toast("Atzīme noņemta");
      } else {
        next[leadId] = Date.now();
        toast.success("Atzīmēts kā sazināts");
      }
      writeContacted(next);
      return next;
    });
  }, []);

  /* Build merged lead map */
  const leads = useMemo<QueueLead[]>(() => {
    const priorityRows = (priority.data?.rows ?? []) as Row[];
    const engagementRows = (engagement.data?.rows ?? []) as Row[];
    const overviewRows = (overview.data?.rows ?? []) as Row[];

    const engById = new Map<string, Row>();
    for (const r of engagementRows) {
      const id = s(r.lead_id);
      if (id) engById.set(id, r);
    }
    const ovById = new Map<string, Row>();
    for (const r of overviewRows) {
      const id = s(r.lead_id);
      if (id) ovById.set(id, r);
    }

    return priorityRows
      .map((r) => {
        const id = s(r.lead_id);
        if (!id) return null;
        const eng = engById.get(id);
        const ov = ovById.get(id);
        const status = s(r.current_status);
        const score = Number(r.priority);
        return {
          lead_id: id,
          full_name: s(r.full_name),
          email: s(r.email),
          phone: s(r.phone_raw ?? r.phone_e164),
          status,
          priority: effectivePriority(status, score),
          last_event_at: eng ? (s(eng.last_event_at) || null) : (s(r.last_event_at) || null),
          last_event_group: eng ? (s(eng.last_event_group) || null) : null,
          has_reply: Boolean(eng?.has_reply),
          first_outbound_at: eng ? (s(eng.first_outbound_at) || null) : null,
          ppv: ov ? s(ov.ppv_vards) : "",
          tags: asTags(r.tags),
        } as QueueLead;
      })
      .filter((x): x is QueueLead => x !== null);
  }, [priority.data, engagement.data, overview.data]);

  /* Apply global search + tags filter */
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const sel = selectedTags.map((t) => t.toLowerCase());
    return leads.filter((l) => {
      if (sel.length > 0) {
        const lower = l.tags.map((t) => t.toLowerCase());
        if (lower.length !== sel.length) return false;
        if (!sel.every((t) => lower.includes(t))) return false;
      }
      if (needle) {
        const hay = `${l.full_name} ${l.email} ${l.phone}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [leads, q, selectedTags]);

  /* Sections */
  const sections = useMemo(() => {
    const now = Date.now();
    const followupCutoff = now - FOLLOWUP_DAYS * 24 * 60 * 60 * 1000;

    const replied = filtered
      .filter((l) => l.has_reply && parseDate(l.last_event_at) != null)
      .sort(
        (a, b) =>
          (parseDate(b.last_event_at) ?? 0) -
          (parseDate(a.last_event_at) ?? 0),
      );

    const followUp = filtered
      .filter((l) => {
        if (l.has_reply) return false;
        if (!l.first_outbound_at) return false;
        const last = parseDate(l.last_event_at);
        if (last == null) return false;
        return last < followupCutoff;
      })
      .sort(
        (a, b) =>
          (parseDate(a.last_event_at) ?? 0) -
          (parseDate(b.last_event_at) ?? 0),
      );

    const highPriority = filtered
      .filter((l) => l.priority >= HIGH_PRIORITY_THRESHOLD)
      .sort((a, b) => b.priority - a.priority);

    return { replied, followUp, highPriority };
  }, [filtered]);

  return (
    <>
      <PageHeader
        title="Leadi"
        description="Aktuāli darbi: leadi, kuriem nepieciešama uzmanība."
      >
        <SearchInput />
      </PageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Jāatbild"
          value={sections.replied.length}
          hint="Leadi, kuri ir atbildējuši"
        />
        <StatCard
          label="Follow-up"
          value={sections.followUp.length}
          hint={`Bez atbildes >${FOLLOWUP_DAYS} d`}
        />
        <StatCard
          label="Augsta prioritāte"
          value={sections.highPriority.length}
          hint={`Prioritāte ≥ ${HIGH_PRIORITY_THRESHOLD}`}
        />
      </div>

      {errorMsg && <ErrorState message={errorMsg} />}
      {!errorMsg && loading && <LoadingState />}

      {!errorMsg && !loading && (
        <div className="space-y-6">
          <SectionTable
            title="Jāatbild"
            description="Leadi ar atbildi — sākot ar jaunāko."
            leads={sections.replied.slice(0, MAX_PER_SECTION)}
            totalCount={sections.replied.length}
            contactedMap={contactedMap}
            onMarkContacted={handleMarkContacted}
            emptyText="Nav nesenu atbilžu"
          />
          <SectionTable
            title="Follow-up"
            description={`Bez atbildes, pēdējā aktivitāte vairāk kā ${FOLLOWUP_DAYS} dienas atpakaļ.`}
            leads={sections.followUp.slice(0, MAX_PER_SECTION)}
            totalCount={sections.followUp.length}
            contactedMap={contactedMap}
            onMarkContacted={handleMarkContacted}
            emptyText="Nav follow-up kandidātu"
          />
          <SectionTable
            title="Augsta prioritāte"
            description={`Leadi ar prioritātes rādītāju ≥ ${HIGH_PRIORITY_THRESHOLD}.`}
            leads={sections.highPriority.slice(0, MAX_PER_SECTION)}
            totalCount={sections.highPriority.length}
            contactedMap={contactedMap}
            onMarkContacted={handleMarkContacted}
            emptyText="Nav augstas prioritātes leadu"
          />

          {filtered.length === 0 && <EmptyState />}
        </div>
      )}
    </>
  );
}