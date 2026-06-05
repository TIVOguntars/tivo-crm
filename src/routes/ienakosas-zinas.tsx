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
import DOMPurify from "isomorphic-dompurify";
import { useCrmView } from "@/hooks/useCrmView";
import { fetchCrmView } from "@/lib/analytics";
import { buildAnalyticsFilters } from "@/lib/filters";
import type { FiltersSearch } from "@/lib/filters";
import { CHANNEL_LV, lv } from "@/lib/i18nLabels";
import { labelEventType } from "@/lib/timelineLabels";

export const Route = createFileRoute("/ienakosas-zinas")({
  component: InboxPage,
});


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
  const statusFilter = search.status ?? "all";

  const setLocal = (key: "channel" | "status", value: string) => {
    navigate({
      to: ".",
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        [key]: value === "all" ? undefined : value,
      })) as never,
      replace: true,
    });
  };

  // Build PostgREST query for crm.communications (inbound only).
  // Replaces former public.communication_events read (permission denied;
  // events table is not exposed via the CRM API layer).
  const commsQueryStr = useMemo(() => {
    const parts: string[] = [
      "select=*",
      "direction=eq.inbound",
    ];
    if (filters.p_from) parts.push(`created_at=gte.${filters.p_from}`);
    if (filters.p_to) parts.push(`created_at=lte.${filters.p_to}T23:59:59`);
    parts.push("order=created_at.desc.nullslast");
    parts.push("limit=500");
    return parts.join("&");
  }, [filters.p_from, filters.p_to]);

  const eventsQ = useQuery({
    queryKey: ["inbox-comms", commsQueryStr],
    queryFn: () =>
      fetchCrmView({
        data: { view: "communications", query: commsQueryStr },
      }),
    staleTime: 30_000,
  });

  // Flatten each crm.communications row into { ev, comm } shape used below.
  // Most rich fields (from_address, to_address, html_body, text_body,
  // metadata, current_status, sent_at/received_at) live inside raw_payload.
  const allEvents = useMemo<EventRow[]>(() => {
    const rows = (eventsQ.data?.rows ?? []) as Array<Record<string, unknown>>;
    return rows.map((r) => {
      const rp = (r.raw_payload ?? {}) as Record<string, unknown>;
      const comm = {
        id: r.id,
        lead_id: r.lead_id ?? rp.lead_id,
        direction: r.direction ?? rp.direction,
        channel: r.channel ?? rp.channel,
        subject: r.subject ?? rp.subject,
        from_address: rp.from_address ?? null,
        to_address: rp.to_address ?? null,
        current_status: rp.current_status ?? r.status ?? null,
        sent_at: rp.sent_at ?? null,
        received_at: rp.received_at ?? null,
        created_at: r.created_at,
        html_body: rp.html_body ?? null,
        text_body: rp.text_body ?? r.body ?? null,
        body_format: rp.body_format ?? null,
        body_fallback: r.body ?? null,
        metadata: rp.metadata ?? null,
      } as Record<string, unknown>;
      return {
        id: r.id,
        event_type: "inbound_received",
        event_timestamp: (rp.received_at as string | null) ?? (r.created_at as string | null),
        communication_id: r.id as string | undefined,
        communications: comm,
      } as EventRow;
    });
  }, [eventsQ.data]);

  // Distinct lead_ids referenced by these events
  const leadIds = useMemo(() => {
    const set = new Set<string>();
    for (const ev of allEvents) {
      const lid = (ev.communications as Record<string, unknown> | null)?.lead_id;
      if (lid != null && String(lid).trim() !== "") set.add(String(lid));
    }
    return Array.from(set);
  }, [allEvents]);

  // Step 1: map UUID lead_ids → lead_number via crm.leads (v3 is keyed by lead_number).
  const leadNumberMapQuery = leadIds.length
    ? `select=id,lead_number&id=in.(${leadIds.map((id) => `"${id}"`).join(",")})&limit=${leadIds.length}`
    : "";
  const leadNumberMapQ = useCrmView("leads", leadNumberMapQuery);
  const numberByLeadId = useMemo(() => {
    const m = new Map<string, string>();
    const rows = (leadNumberMapQ.data?.rows ?? []) as Array<Record<string, unknown>>;
    for (const r of rows) {
      const id = r.id != null ? String(r.id) : "";
      const num = r.lead_number != null ? String(r.lead_number) : "";
      if (id && num) m.set(id, num);
    }
    return m;
  }, [leadNumberMapQ.data]);

  // Step 2: fetch v3 display rows by lead_number.
  const leadNumbers = useMemo(
    () => Array.from(new Set(numberByLeadId.values())),
    [numberByLeadId],
  );
  const leadsQuery = leadNumbers.length
    ? `lead_number=in.(${leadNumbers.map((n) => `"${n}"`).join(",")})&limit=${leadNumbers.length}`
    : "";
  const leadsQ = useCrmView(
    "leads_list_display_v3",
    leadsQuery,
  );

  const leadsById = useMemo(() => {
    const map = new Map<string, LeadRow>();
    const rows = (leadsQ.data?.rows ?? []) as LeadRow[];
    const numberToId = new Map<string, string>();
    for (const [id, num] of numberByLeadId.entries()) numberToId.set(num, id);
    for (const r of rows) {
      const num = r.lead_number != null ? String(r.lead_number) : "";
      const id = numberToId.get(num);
      if (id) map.set(id, r);
    }
    return map;
  }, [leadsQ.data, numberByLeadId]);

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
          if (String(lead?.status ?? "") !== statusFilter)
            return false;
        }
        if (ppvSet.size > 0) {
          const v = String(lead?.ppv_user_code ?? "").toLowerCase();
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
  ]);

  // Build status options from loaded leads
  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of leadsById.values()) {
      const s = l.status;
      if (s != null && String(s).trim() !== "") set.add(String(s));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "lv"));
  }, [leadsById]);

  // Channel options from loaded communications
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
              label: lv(CHANNEL_LV, c, c),
            })),
          ]}
          onChange={(v) => setLocal("channel", v)}
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
                    <th className="px-3 py-2 text-left font-medium">E-pasts</th>
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
                          {String(
                            lead?.full_name ??
                              lead?.display_name ??
                              (leadId ? `Lead #${leadId}` : "—"),
                          )}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {String(lead?.email_normalized ?? "—")}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {String(lead?.phone_e164 ?? "—")}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="secondary" className="text-[11px]">
                            {lv(CHANNEL_LV, channel, channel || "—")}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Badge className="text-[11px]">
                            {labelEventType(eventType) || eventType}
                          </Badge>
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2 text-foreground" title={subject}>
                          {subject || "—"}
                        </td>
                        <td className="max-w-[260px] truncate px-3 py-2 text-muted-foreground" title={snippet(body, 400)}>
                          {snippet(body) || "—"}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {String(lead?.status ?? "—")}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {(() => {
                            const code = String(lead?.ppv_user_code ?? "");
                            const name = String(lead?.ppv_name ?? "");
                            return code ? (
                              <span title={name || code}>{code}</span>
                            ) : (
                              "—"
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {(() => {
                            const code = String(lead?.task_assigned_user_code ?? "");
                            const name = String(lead?.task_assigned_name ?? "");
                            return code ? (
                              <span title={name || code}>{code}</span>
                            ) : (
                              "—"
                            );
                          })()}
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

/* ---------------------- Email Viewer Modal (read-only) ---------------------- */

function getAttachments(comm: Record<string, unknown> | null): string[] {
  if (!comm) return [];
  const meta = (comm.metadata ?? null) as Record<string, unknown> | null;
  if (!meta) return [];
  let raw: unknown =
    meta.attachment_names ?? meta.attachments ?? meta.attachment_filenames ?? null;
  if (typeof raw === "string") {
    const s = raw;
    try { raw = JSON.parse(s); } catch { return [s]; }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => {
      if (typeof a === "string") return a;
      if (a && typeof a === "object") {
        const o = a as Record<string, unknown>;
        return String(o.filename ?? o.name ?? o.file ?? "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

function EmailViewerModal({
  open,
  onClose,
  leadId,
  comm,
}: {
  open: boolean;
  onClose: () => void;
  leadId: string | null;
  comm: Record<string, unknown> | null;
}) {
  if (!comm && !open) return null;

  const subject = (comm?.subject as string | null) ?? "";
  const fromAddress = (comm?.from_address as string | null) ?? "";
  const toAddress = (() => {
    const t = comm?.to_address;
    if (Array.isArray(t)) return t.join(", ");
    if (t == null) return "";
    return String(t);
  })();
  const meta = (comm?.metadata ?? null) as Record<string, unknown> | null;
  const mailbox = meta && typeof meta.mailbox === "string" ? meta.mailbox : "";
  const date = fmtDate(
    (comm?.sent_at as string | null) ??
      (comm?.received_at as string | null) ??
      (comm?.created_at as string | null),
  );
  const html = (comm?.html_body as string | null) ?? "";
  const text = (comm?.text_body as string | null) ?? "";
  const bodyFormat = (comm?.body_format as string | null) ?? null;
  const fallback = (comm?.body_fallback as string | null) ?? "";
  const useHtml = bodyFormat === "html" && !!html;
  const sanitizedHtml = useHtml
    ? DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
    : "";
  const plainText = text || fallback;
  const attachments = getAttachments(comm);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] w-full max-w-3xl overflow-hidden p-0 sm:rounded-lg">
        <DialogHeader className="space-y-2 border-b border-border bg-muted/30 px-5 py-4">
          <DialogTitle className="pr-8 text-base font-semibold">
            {subject || "(bez temata)"}
          </DialogTitle>
          <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {fromAddress && (
              <>
                <dt className="uppercase tracking-wide">No</dt>
                <dd className="truncate font-medium text-foreground">{fromAddress}</dd>
              </>
            )}
            {(toAddress || mailbox) && (
              <>
                <dt className="uppercase tracking-wide">Saņēmējs</dt>
                <dd className="truncate font-medium text-foreground">
                  {toAddress || mailbox}
                </dd>
              </>
            )}
            <dt className="uppercase tracking-wide">Datums</dt>
            <dd className="font-medium text-foreground tabular-nums">{date}</dd>
          </dl>
          {attachments.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
              {attachments.map((a, i) => (
                <Badge key={i} variant="secondary" className="text-[11px] font-normal">
                  {a}
                </Badge>
              ))}
            </div>
          )}
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {useHtml ? (
            <div
              className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground [&_a]:text-primary [&_img]:max-w-full"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : plainText ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
              {plainText}
            </pre>
          ) : (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              Šai ziņai nav satura.
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-border bg-muted/30 px-5 py-3 sm:justify-between">
          <div>
            {leadId && (
              <Button asChild size="sm" variant="ghost">
                <a href={`/lead/${leadId}`} className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Atvērt lead
                </a>
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled title="Drīzumā">
              <Forward className="h-3.5 w-3.5" />
              Pārsūtīt
            </Button>
            <Button size="sm" variant="default" disabled title="Drīzumā">
              <Reply className="h-3.5 w-3.5" />
              Atbildēt
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
              Aizvērt
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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