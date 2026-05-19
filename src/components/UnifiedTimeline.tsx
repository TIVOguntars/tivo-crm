import { useMemo } from "react";
import {
  Activity,
  CheckSquare,
  Mail as MailIcon,
  MessageSquare,
  Phone as PhoneIcon,
  StickyNote,
  Workflow,
} from "lucide-react";

import { useCrmView } from "@/hooks/useCrmView";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { labelEventType, labelRecordSource } from "@/lib/timelineLabels";
import { COMM_STATUS_LV, lv } from "@/lib/i18nLabels";

type Row = Record<string, unknown>;

function s(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v : String(v);
}
function fmtDate(v: unknown): string {
  const t = s(v);
  if (!t) return "";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleString("lv-LV", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function iconFor(eventType: string, recordSource: string) {
  const e = eventType.toLowerCase();
  const r = recordSource.toLowerCase();
  if (e.includes("email") || e.includes("mail"))
    return <MailIcon className="h-3.5 w-3.5" />;
  if (e.includes("call") || e.includes("phone"))
    return <PhoneIcon className="h-3.5 w-3.5" />;
  if (e.includes("sms") || e.includes("whatsapp") || e.includes("chat"))
    return <MessageSquare className="h-3.5 w-3.5" />;
  if (r.includes("workflow") || e.includes("workflow"))
    return <Workflow className="h-3.5 w-3.5" />;
  if (r.includes("task") || e.includes("task"))
    return <CheckSquare className="h-3.5 w-3.5" />;
  if (r.includes("note") || e.includes("note"))
    return <StickyNote className="h-3.5 w-3.5" />;
  return <Activity className="h-3.5 w-3.5" />;
}

export interface UnifiedTimelineProps {
  leadId: string;
  /** Called when the view is unavailable/unreadable so the parent can show
   *  its own fallback timeline instead. */
  onUnavailable?: () => void;
}

/**
 * Read-only timeline backed by crm.v_unified_timeline. Renders nothing and
 * calls onUnavailable when the view returns an error so the parent can fall
 * back to its existing local timeline. Never throws — Lead 360 must not
 * hard-depend on this view.
 */
export function UnifiedTimeline({ leadId, onUnavailable }: UnifiedTimelineProps) {
  const q = useCrmView(
    "v_unified_timeline",
    `lead_id=eq.${leadId}&order=event_at.desc&limit=200`,
  );

  const rows = (q.data?.rows ?? []) as Row[];
  const err = (q.error as Error | null)?.message || q.data?.error;

  const items = useMemo(() => {
    return rows.map((r, i) => ({
      key: s(r.id) || `row:${i}`,
      eventAt: s(r.event_at) || s(r.timeline_created_at),
      recordSource: s(r.record_source),
      eventType: s(r.event_type),
      title: s(r.title),
      description: s(r.description),
      actor: s(r.actor_full_name) || s(r.actor_user_code),
      metadata:
        r.metadata && typeof r.metadata === "object"
          ? (r.metadata as Row)
          : null,
    }));
  }, [rows]);

  if (q.isLoading) {
    return (
      <div className="text-xs text-muted-foreground py-2">
        Ielādē vienoto laika joslu…
      </div>
    );
  }

  if (err) {
    onUnavailable?.();
    return null;
  }

  if (items.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-2">
        Vienotajā laika joslā nav ierakstu.
      </div>
    );
  }

  return (
    <ol className="relative space-y-2 max-h-[640px] overflow-auto pr-2">
      {items.map((it) => {
        const outcomeRaw = it.metadata
          ? s((it.metadata as Row).outcome_code)
          : "";
        const outcome = outcomeRaw
          ? lv(COMM_STATUS_LV, outcomeRaw, outcomeRaw)
          : "";
        const eventLabel =
          labelEventType(it.eventType) ||
          labelRecordSource(it.recordSource) ||
          "Notikums";
        const sourceLabel = labelRecordSource(it.recordSource);
        return (
          <li key={it.key}>
            <div className="group w-full text-left flex gap-3 rounded-md border border-l-4 border-l-muted-foreground/40 bg-muted/40 px-3 py-2">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background/80 text-muted-foreground">
                {iconFor(it.eventType, it.recordSource)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-medium">{eventLabel}</span>
                    {sourceLabel && (
                      <span className="inline-flex items-center rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {sourceLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {outcome && <StatusBadge status={outcome} />}
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {fmtDate(it.eventAt)}
                    </span>
                  </div>
                </div>
                {it.title && (
                  <div className="mt-0.5 text-sm font-medium truncate">
                    {it.title}
                  </div>
                )}
                {it.description && (
                  <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {it.description}
                  </div>
                )}
                {it.actor && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {it.actor}
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}