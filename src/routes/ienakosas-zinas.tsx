import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Reply, Forward, X, Paperclip, ExternalLink } from "lucide-react";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import { fetchPublicTable } from "@/server/analytics";
import { buildAnalyticsFilters } from "@/lib/filters";
import type { FiltersSearch } from "@/lib/filters";

export const Route = createFileRoute("/ienakosas-zinas")({
  component: InboxPage,
});

const INBOUND_EVENT_TYPES = [
  "replied",
  "inbound_received",
  "clicked",
  "call_answered",
  "call_completed",
] as const;

const EVENT_TYPE_LV: Record<string, string> = {
  replied: "Atbilde",
  inbound_received: "Saņemts",
  clicked: "Klikšķis",
  call_answered: "Atbildēts zvans",
  call_completed: "Pabeigts zvans",
};

const CHANNEL_LV: Record<string, string> = {
  email: "E-pasts",
  sms: "SMS",
  call: "Zvans",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
};

function fmtDate(value: unknown): string {
  if (value == null || value === "") return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("lv-LV", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function snippet(text: unknown, limit = 120): string {
  if (text == null) return "";
  const s = String(text).replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > limit ? `${s.slice(0, limit)}…` : s;
}

type EventRow = Record<string, unknown> & {
  id?: string | number;
  event_type?: string;
  event_timestamp?: string;
  communication_id?: string;
  communications?: Record<string, unknown> | null;
};

type LeadRow = Record<string, unknown>;

function InboxPage() {
  const search = useSearch({ strict: false }) as FiltersSearch & {
    channel?: string;
    eventType?: string;
    status?: string;
  };
  const navigate = useNavigate();
  const filters = useMemo(() => buildAnalyticsFilters(search), [search]);

  const channelFilter = search.channel ?? "all";
  const eventTypeFilter = search.eventType ?? "all";
  const statusFilter = search.status ?? "all";

  const setLocal = (key: "channel" | "eventType" | "status", value: string) => {
    navigate({
      to: ".",
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        [key]: value === "all" ? undefined : value,
      })) as never,
      replace: true,
    });
  };

  // Build PostgREST query for communication_events
  const eventsQueryStr = useMemo(() => {
    const parts: string[] = [];
    parts.push(
      `select=id,event_type,event_timestamp,communication_id,raw_payload,communications(id,lead_id,direction,channel,subject,from_address,mailbox,to_address,current_status,sent_at,received_at,created_at,html_body,text_body,metadata)`,
    );
    parts.push(`event_type=in.(${INBOUND_EVENT_TYPES.join(",")})`);
    if (eventTypeFilter !== "all" && INBOUND_EVENT_TYPES.includes(eventTypeFilter as never)) {
      // Override the in() filter with the more specific selection
      parts[parts.length - 1] = `event_type=eq.${eventTypeFilter}`;
    }
    if (filters.p_from) parts.push(`event_timestamp=gte.${filters.p_from}`);
    if (filters.p_to) parts.push(`event_timestamp=lte.${filters.p_to}T23:59:59`);
    parts.push(`order=event_timestamp.desc.nullslast`);
    parts.push(`limit=500`);
    return parts.join("&");
  }, [filters.p_from, filters.p_to, eventTypeFilter]);

  const eventsQ = useQuery({
    queryKey: ["inbox-events", eventsQueryStr],
    queryFn: () =>
      fetchPublicTable({
        data: { table: "communication_events", query: eventsQueryStr },
      }),
    staleTime: 30_000,
  });

  const allEvents = (eventsQ.data?.rows ?? []) as EventRow[];

  // Distinct lead_ids referenced by these events
  const leadIds = useMemo(() => {
    const set = new Set<string>();
    for (const ev of allEvents) {
      const lid = (ev.communications as Record<string, unknown> | null)?.lead_id;
      if (lid != null && String(lid).trim() !== "") set.add(String(lid));
    }
    return Array.from(set);
  }, [allEvents]);

  // Batch fetch leads_overview for those IDs
  const leadsQuery = leadIds.length
    ? `lead_id=in.(${leadIds.map((id) => `"${id}"`).join(",")})&limit=${leadIds.length}`
    : "";
  const leadsQ = useAnalyticsView("leads_overview", leadsQuery);

  const leadsById = useMemo(() => {
    const map = new Map<string, LeadRow>();
    const rows = (leadsQ.data?.rows ?? []) as LeadRow[];
    for (const r of rows) {
      const id = r.lead_id ?? r.id;
      if (id != null) map.set(String(id), r);
    }
    return map;
  }, [leadsQ.data]);

  // Apply filter options
  const ppvSet = useMemo(
    () => new Set((search.ppvs ?? []).map((s) => s.toLowerCase())),
    [search.ppvs],
  );
  const countrySet = useMemo(
    () => new Set((search.countries ?? []).map((s) => s.toLowerCase())),
    [search.countries],
  );
  const sourceSet = useMemo(
    () => new Set((search.sources ?? []).map((s) => s.toLowerCase())),
    [search.sources],
  );
  const ownerSet = useMemo(
    () => new Set((search.owners ?? []).map((s) => s.toLowerCase())),
    [search.owners],
  );

  const enriched = useMemo(() => {
    return allEvents
      .map((ev) => {
        const comm = (ev.communications as Record<string, unknown> | null) ?? null;
        const leadId = comm?.lead_id != null ? String(comm.lead_id) : "";
        const lead = leadId ? leadsById.get(leadId) ?? null : null;
        return { ev, comm, lead, leadId };
      })
      .filter(({ ev, comm, lead }) => {
        // Hide emails with no body AND no attachments
        const ch = String(comm?.channel ?? "").toLowerCase();
        const isEmail = ch.includes("email") || ch.includes("mail") || ch.includes("past");
        if (isEmail) {
          const body =
            String((comm?.text_body as string | null) ?? "").trim() ||
            String((comm?.html_body as string | null) ?? "").trim();
          if (!body) {
            const meta = (comm?.metadata ?? null) as Record<string, unknown> | null;
            const rawAtt = meta?.attachment_names ?? meta?.attachments ?? meta?.attachment_filenames;
            let count = 0;
            let arr: unknown = rawAtt;
            if (typeof arr === "string") {
              try { arr = JSON.parse(arr); } catch { arr = null; }
            }
            if (Array.isArray(arr)) count = arr.length;
            if (count === 0) return false;
          }
        }
        if (channelFilter !== "all") {
          if (String(comm?.channel ?? "").toLowerCase() !== channelFilter) return false;
        }
        if (statusFilter !== "all") {
          if (String(lead?.current_status ?? lead?.status ?? "") !== statusFilter)
            return false;
        }
        if (ppvSet.size > 0) {
          const v = String(lead?.ppv_vards ?? lead?.ppv ?? "").toLowerCase();
          if (!ppvSet.has(v)) return false;
        }
        if (countrySet.size > 0) {
          const v = String(lead?.country ?? "").toLowerCase();
          if (!countrySet.has(v)) return false;
        }
        if (sourceSet.size > 0) {
          const v = String(lead?.source ?? "").toLowerCase();
          if (!sourceSet.has(v)) return false;
        }
        if (ownerSet.size > 0) {
          const v = String(lead?.owner ?? "").toLowerCase();
          if (!ownerSet.has(v)) return false;
        }
        // ev unused in this guard, silence linter:
        void ev;
        return true;
      });
  }, [
    allEvents,
    leadsById,
    channelFilter,
    statusFilter,
    ppvSet,
    countrySet,
    sourceSet,
    ownerSet,
  ]);

  // Build status options from loaded leads
  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of leadsById.values()) {
      const s = l.current_status ?? l.status;
      if (s != null && String(s).trim() !== "") set.add(String(s));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "lv"));
  }, [leadsById]);

  // Channel options from loaded events
  const channelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const ev of allEvents) {
      const c = (ev.communications as Record<string, unknown> | null)?.channel;
      if (c != null && String(c).trim() !== "") set.add(String(c).toLowerCase());
    }
    return Array.from(set).sort();
  }, [allEvents]);

  const [selected, setSelected] = useState<{
    leadId: string;
    comm: Record<string, unknown> | null;
  } | null>(null);

  const eventsError =
    (eventsQ.error as Error | null)?.message || eventsQ.data?.error;
  const loading = eventsQ.isLoading || (leadIds.length > 0 && leadsQ.isLoading);

  return (
    <>
      <PageHeader
        title="Ienākošās ziņas"
        description="Leadi, kuriem izvēlētajā periodā bija ienākošā vai atbildes aktivitāte."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <LocalSelect
          label="Kanāls"
          value={channelFilter}
          options={[
            { value: "all", label: "Visi" },
            ...channelOptions.map((c) => ({
              value: c,
              label: CHANNEL_LV[c] ?? c,
            })),
          ]}
          onChange={(v) => setLocal("channel", v)}
        />
        <LocalSelect
          label="Notikuma tips"
          value={eventTypeFilter}
          options={[
            { value: "all", label: "Visi" },
            ...INBOUND_EVENT_TYPES.map((t) => ({
              value: t,
              label: EVENT_TYPE_LV[t] ?? t,
            })),
          ]}
          onChange={(v) => setLocal("eventType", v)}
        />
        <LocalSelect
          label="Lead statuss"
          value={statusFilter}
          options={[
            { value: "all", label: "Visi" },
            ...statusOptions.map((s) => ({ value: s, label: s })),
          ]}
          onChange={(v) => setLocal("status", v)}
        />
      </div>

      {eventsError && <ErrorState message={eventsError} />}
      {!eventsError && loading && <LoadingState />}

      {!eventsError && !loading && (
        enriched.length === 0 ? (
          <EmptyState label="Nav ienākošo ziņu izvēlētajā periodā" />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Datums</th>
                    <th className="px-3 py-2 text-left font-medium">Vārds</th>
                    <th className="px-3 py-2 text-left font-medium">Email</th>
                    <th className="px-3 py-2 text-left font-medium">Telefons</th>
                    <th className="px-3 py-2 text-left font-medium">Kanāls</th>
                    <th className="px-3 py-2 text-left font-medium">Notikums</th>
                    <th className="px-3 py-2 text-left font-medium">Temats</th>
                    <th className="px-3 py-2 text-left font-medium">Fragments</th>
                    <th className="px-3 py-2 text-left font-medium">Statuss</th>
                    <th className="px-3 py-2 text-left font-medium">PPV</th>
                    <th className="px-3 py-2 text-left font-medium">Atbildīgais</th>
                  </tr>
                </thead>
                <tbody>
                  {enriched.map(({ ev, comm, lead, leadId }, i) => {
                    const eventType = String(ev.event_type ?? "");
                    const channel = String(comm?.channel ?? "").toLowerCase();
                    const subject = (comm?.subject as string | null) ?? "";
                    const body =
                      (comm?.text_body as string | null) ??
                      (comm?.html_body as string | null) ??
                      "";
                    return (
                      <tr
                        key={String(ev.id ?? i)}
                        onClick={() =>
                          setSelected({
                            leadId,
                            comm: comm as Record<string, unknown> | null,
                          })
                        }
                        className="cursor-pointer border-t border-border hover:bg-secondary/40"
                      >
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-foreground">
                          {fmtDate(ev.event_timestamp)}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {String(lead?.full_name ?? lead?.name ?? "—")}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {String(lead?.email ?? "—")}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {String(lead?.phone_raw ?? lead?.phone ?? "—")}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="secondary" className="text-[11px]">
                            {CHANNEL_LV[channel] ?? channel ?? "—"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Badge className="text-[11px]">
                            {EVENT_TYPE_LV[eventType] ?? eventType}
                          </Badge>
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2 text-foreground" title={subject}>
                          {subject || "—"}
                        </td>
                        <td className="max-w-[260px] truncate px-3 py-2 text-muted-foreground" title={snippet(body, 400)}>
                          {snippet(body) || "—"}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {String(lead?.current_status ?? lead?.status ?? "—")}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {String(lead?.ppv_vards ?? lead?.ppv ?? "—")}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {String(lead?.owner ?? "—")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              Rāda {enriched.length} ierakstu
            </div>
          </div>
        )
      )}

      <EmailViewerModal
        open={selected !== null}
        onClose={() => setSelected(null)}
        leadId={selected?.leadId ?? null}
        comm={selected?.comm ?? null}
      />
    </>
  );
}

function LocalSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ---------------------- Lead Detail Drawer ---------------------- */

function LeadDetailDrawer({
  open,
  onClose,
  leadId,
  selectedComm,
}: {
  open: boolean;
  onClose: () => void;
  leadId: string | null;
  selectedComm: Record<string, unknown> | null;
}) {
  const overviewQ = useAnalyticsView(
    "leads_overview",
    leadId ? `lead_id=eq.${encodeURIComponent(leadId)}&limit=1` : "",
  );
  const lead = ((overviewQ.data?.rows ?? [])[0] ?? null) as Record<string, unknown> | null;

  const commsQuery = leadId
    ? `lead_id=eq.${encodeURIComponent(leadId)}&select=id,direction,channel,subject,from_address,mailbox,to_address,current_status,sent_at,received_at,created_at,text_body,html_body,metadata&order=sent_at.desc.nullslast,received_at.desc.nullslast,created_at.desc.nullslast&limit=200`
    : "";
  const commsQ = useQuery({
    queryKey: ["lead-comms-drawer", leadId, commsQuery],
    queryFn: () =>
      fetchPublicTable({
        data: { table: "communications", query: commsQuery },
      }),
    enabled: !!leadId,
    staleTime: 30_000,
  });
  const comms = (commsQ.data?.rows ?? []) as Array<Record<string, unknown>>;

  const selectedSubject = (selectedComm?.subject as string | null) ?? "";
  const selectedBody =
    (selectedComm?.text_body as string | null) ??
    (selectedComm?.html_body as string | null) ??
    "";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Lead detaļas</SheetTitle>
        </SheetHeader>

        {!leadId ? (
          <div className="mt-4 text-sm text-muted-foreground">Nav izvēlēta lead.</div>
        ) : overviewQ.isLoading ? (
          <div className="mt-4">
            <LoadingState />
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {/* 1. Lead info */}
            <section className="rounded-lg border border-border bg-card p-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Lead informācija
              </h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <DLine label="Vārds" value={lead?.full_name ?? lead?.name} />
                <DLine label="Statuss" value={lead?.current_status ?? lead?.status} />
                <DLine label="Email" value={lead?.email} />
                <DLine label="Telefons" value={lead?.phone_raw ?? lead?.phone} />
                <DLine label="Valsts" value={lead?.country} />
                <DLine label="Avots" value={lead?.source} />
                <DLine label="PPV" value={lead?.ppv_vards ?? lead?.ppv} />
                <DLine label="Atbildīgais" value={lead?.owner} />
              </dl>
              <div className="mt-3">
                <Button asChild size="sm" variant="outline">
                  <a href={`/lead/${leadId}`}>Atvērt pilnu lead profilu</a>
                </Button>
              </div>
            </section>

            {/* 3. Selected message */}
            {selectedComm && (
              <section className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-primary">
                  Izvēlētā ziņa
                </h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <DLine label="Temats" value={selectedSubject} />
                  <DLine label="Kanāls" value={selectedComm.channel} />
                  <DLine label="No" value={selectedComm.from_address} />
                  <DLine label="Mailbox" value={selectedComm.mailbox} />
                  <DLine label="Statuss" value={selectedComm.current_status} />
                  <DLine
                    label="Datums"
                    value={fmtDate(
                      selectedComm.sent_at ?? selectedComm.received_at ?? selectedComm.created_at,
                    )}
                  />
                </dl>
                {selectedBody && (
                  <div className="mt-3">
                    <div className="mb-1 text-[11px] uppercase text-muted-foreground">Saturs</div>
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-2 text-xs leading-relaxed text-foreground">
                      {snippet(selectedBody, 4000)}
                    </pre>
                  </div>
                )}
              </section>
            )}

            {/* 2. Full timeline */}
            <section className="rounded-lg border border-border bg-card p-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Komunikāciju vēsture ({comms.length})
              </h3>
              {commsQ.isLoading ? (
                <LoadingState />
              ) : comms.length === 0 ? (
                <div className="text-xs italic text-muted-foreground">Nav ierakstu</div>
              ) : (
                <ol className="space-y-2">
                  {comms.map((c, i) => {
                    const ts = c.sent_at ?? c.received_at ?? c.created_at;
                    const ch = String(c.channel ?? "").toLowerCase();
                    const subj = (c.subject as string | null) ?? "";
                    const dir = String(c.direction ?? "");
                    return (
                      <li
                        key={String(c.id ?? i)}
                        className="flex gap-3 border-b border-border/60 pb-2 last:border-0"
                      >
                        <div className="w-32 shrink-0 text-xs tabular-nums text-muted-foreground">
                          {fmtDate(ts)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <Badge variant="secondary" className="text-[10px]">
                              {CHANNEL_LV[ch] ?? ch}
                            </Badge>
                            <span className="text-muted-foreground">
                              {dir === "inbound" ? "Ienākošs" : dir === "outbound" ? "Izejošs" : dir}
                            </span>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-foreground">
                              {String(c.current_status ?? "—")}
                            </span>
                          </div>
                          {subj && (
                            <div className="mt-0.5 text-sm font-medium text-foreground">
                              {subj}
                            </div>
                          )}
                          {(() => {
                            const body =
                              (c.text_body as string | null) ??
                              (c.html_body as string | null) ??
                              "";
                            return body ? (
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {snippet(body, 160)}
                              </div>
                            ) : null;
                          })()}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DLine({ label, value }: { label: string; value: unknown }) {
  const v =
    value == null || String(value).trim() === ""
      ? "—"
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <dt className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 truncate font-medium text-foreground" title={v}>
        {v}
      </dd>
    </div>
  );
}