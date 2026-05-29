import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Phone,
  Mail,
  MessageCircle,
  Plus,
  Mail as MailIcon,
  Phone as PhoneIcon,
  MessageSquare,
  Activity,
  StickyNote,
  CheckSquare,
  ArrowDownLeft,
  ArrowUpRight,
  Reply,
  Forward,
  X,
  Pencil,
  MoreVertical,
} from "lucide-react";

import { LoadingState, ErrorState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { CompleteActionModal } from "@/components/CompleteActionModal";
import { TaskActionsMenu } from "@/components/TaskActionsMenu";

import { LeadEditPanel } from "@/components/lead/LeadEditPanel";
import { ManualActivityDialog } from "@/components/lead/ManualActivityDialog";
import type { ManualActivityPrefill } from "@/components/lead/ManualActivityDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RequirePermission } from "@/components/auth/RequirePermission";
import DOMPurify from "isomorphic-dompurify";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { useCrmRpc } from "@/hooks/useCrmRpc";
import { useCrmView } from "@/hooks/useCrmView";
import { HeaderSlot } from "@/components/HeaderSlot";
import { TaskFormDialog } from "@/components/TaskFormDialog";
import { WorkflowChainStrip } from "@/components/WorkflowChainStrip";
import { WorkflowPlanCard } from "@/components/WorkflowPlanCard";
import {
  groupTasksByWorkflowInstance,
  groupTasksByWorkflowGroup,
  type WorkflowTaskRow,
} from "@/lib/workflow";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callCrmRpc } from "@/server/analytics";
import { COMM_STATUS_LV, QUEUE_STATUS_LV, lv } from "@/lib/i18nLabels";
import { getActivityStyle } from "@/lib/activityStyles";
import {
  classifyLocal,
  filterLocalTimeline,
  type DateFilter,
  type TypeFilter,
} from "@/lib/timelineFilters";
import { TimelineFilters } from "@/components/timeline/TimelineFilters";

export const Route = createFileRoute("/lead/$leadId")({
  component: LeadProfilePage,
});

/* -------------------------- helpers -------------------------- */

const NA = "Nav datu";
type Row = Record<string, unknown>;

function asArray(v: unknown): Row[] {
  if (Array.isArray(v)) return v as Row[];
  if (v && typeof v === "object") return [v as Row];
  return [];
}
function asObject(v: unknown): Row | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Row;
  return null;
}
function str(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v : String(v);
}
function fmt(v: unknown): string {
  const s = str(v).trim();
  return s === "" ? NA : s;
}
function fmtDate(v: unknown): string {
  if (v == null || v === "") return NA;
  const d = new Date(str(v));
  if (Number.isNaN(d.getTime())) return str(v);
  return d.toLocaleString("lv-LV", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtBool(v: unknown): string {
  if (v == null || v === "") return NA;
  if (typeof v === "boolean") return v ? "Jā" : "Nē";
  const s = str(v).trim().toLowerCase();
  if (["true", "t", "1", "yes", "ja", "jā"].includes(s)) return "Jā";
  if (["false", "f", "0", "no", "ne", "nē"].includes(s)) return "Nē";
  return str(v);
}
function fmtMoney(v: unknown): string {
  if (v == null || v === "") return NA;
  const n = Number(v);
  if (Number.isNaN(n)) return str(v);
  return n.toLocaleString("lv-LV", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}
function pick(row: Row | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}
function section(profile: Row | null, ...keys: string[]): Row[] {
  if (!profile) return [];
  for (const k of keys) {
    if (profile[k] !== undefined) return asArray(profile[k]);
  }
  return [];
}
function sectionObject(profile: Row | null, ...keys: string[]): Row | null {
  if (!profile) return null;
  for (const k of keys) {
    if (profile[k] !== undefined) {
      const arr = asArray(profile[k]);
      if (arr.length > 0) return arr[0];
      return asObject(profile[k]);
    }
  }
  return null;
}

/* -------------------------- UI primitives -------------------------- */

function Empty({ label = NA }: { label?: string }) {
  return <div className="text-sm text-muted-foreground py-3">{label}</div>;
}

/* Strip HTML and decode entities for safe plain-text snippet rendering. */
function htmlToPreviewText(input: string): string {
  if (!input) return "";
  let out = input;
  out = out.replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  out = out.replace(/<!--[\s\S]*?-->/g, " ");
  out = out.replace(/<![^>]*>/g, " ");
  out = out.replace(/<\/?[a-z][^>]*>/gi, " ");
  out = out
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => {
      try { return String.fromCodePoint(Number(d)); } catch { return ""; }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; }
    });
  return out.replace(/\s+/g, " ").trim();
}
function cleanPreview(raw: unknown): string {
  let v = htmlToPreviewText(typeof raw === "string" ? raw : str(raw));
  if (/<html|<head|<body|<style|<\/?[a-z]+/i.test(v)) {
    v = htmlToPreviewText(v);
  }
  return v;
}

/* Map known automation template keys to short human labels. */
const TEMPLATE_LABEL_MAP: Record<string, string> = {
  email_getestimate_1: "getestimate 1",
  email_getestimate_2: "getestimate 2",
  email_getestimate_3: "getestimate 3",
  email_getestimate_4: "getestimate 4",
  email_transition_to_sketch: "transition to sketch",
  email_sketch_1: "sketch 1",
  email_sketch_2: "sketch 2",
  email_sketch_3: "sketch 3",
  email_sketch_4: "sketch 4",
};
const ALLOWED_AUTOMATION_KEYS: ReadonlyArray<string> = Object.keys(
  TEMPLATE_LABEL_MAP,
);
function templateLabelFor(key: string): string {
  return TEMPLATE_LABEL_MAP[key] ?? key;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function normalizeTemplateKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/^e_mail_/, "email_");
}
/* Resolve a known template label from a list of candidate strings.
 * UUID-shaped values are ignored (those are template_version_id, not keys).
 * Returns "" if no candidate matches a known template. */
function resolveTemplateLabel(...candidates: unknown[]): string {
  for (const c of candidates) {
    const s = typeof c === "string" ? c : c == null ? "" : String(c);
    const t = s.trim();
    if (!t || UUID_RE.test(t)) continue;
    const norm = normalizeTemplateKey(t);
    if (TEMPLATE_LABEL_MAP[norm]) return TEMPLATE_LABEL_MAP[norm];
  }
  return "";
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground break-words">{value}</span>
    </div>
  );
}

function Panel({
  title,
  count,
  action,
  children,
  className = "",
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`shadow-sm ${className}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {typeof count === "number" && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {count}
            </span>
          )}
        </div>
        {action}
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

function channelIcon(channel: string) {
  const c = channel.toLowerCase();
  if (c.includes("mail")) return <MailIcon className="h-3.5 w-3.5" />;
  if (c.includes("phone") || c.includes("call"))
    return <PhoneIcon className="h-3.5 w-3.5" />;
  if (c.includes("whats") || c.includes("sms") || c.includes("chat"))
    return <MessageSquare className="h-3.5 w-3.5" />;
  return <Activity className="h-3.5 w-3.5" />;
}

/* -------------------------- page -------------------------- */

function LeadProfilePage() {
  const navigate = useNavigate();
  const goBackToList = () => {
    let returnTo: string | null = null;
    try {
      returnTo = sessionStorage.getItem("lead360:returnTo");
      if (returnTo) sessionStorage.removeItem("lead360:returnTo");
    } catch {
      /* ignore */
    }
    if (returnTo === "/uzdevumi") {
      navigate({ to: "/uzdevumi" });
      return;
    }
    let prev: Record<string, unknown> | null = null;
    try {
      const raw = sessionStorage.getItem("leadi:lastSearch");
      if (raw) prev = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    navigate({ to: "/leadi", search: (prev ?? {}) as never });
  };
  const { leadId } = Route.useParams();
  const q = useCrmRpc("get_lead_360_profile", { p_lead_id: leadId }, !!leadId);
  const [showRaw, setShowRaw] = useState(false);
  // Derive lead_number from the RPC profile so we can join the v3 display view.
  // v3 is keyed by lead_number (no UUID column).
  const leadNumberForV3 = (() => {
    const rawProfile = q.data?.rows?.[0] ?? null;
    const prof =
      rawProfile && typeof rawProfile === "object" && "profile" in rawProfile
        ? (rawProfile as { profile: unknown }).profile
        : rawProfile;
    const lead =
      prof && typeof prof === "object"
        ? (prof as Record<string, unknown>).lead ??
          (prof as Record<string, unknown>).lead_header ??
          (prof as Record<string, unknown>).header ??
          prof
        : null;
    const ln =
      lead && typeof lead === "object"
        ? (lead as Record<string, unknown>).lead_number
        : null;
    return ln != null ? String(ln) : "";
  })();
  const v3DisplayQ = useCrmView(
    "leads_list_display_v3",
    `lead_number=eq.${encodeURIComponent(leadNumberForV3 || "__none__")}&limit=1`,
  );
  const v3Row = ((v3DisplayQ.data?.rows ?? []) as Row[])[0] ?? null;
  const commPayloadsQ = useCrmView(
    "communications",
    `select=id,raw_payload&lead_id=eq.${leadId}&channel=eq.email`,
    { all: true },
  );
  const plannedActionsQ = useCrmView(
    "v_lead_planned_actions",
    `select=source,id,lead_id,kind,status,scheduled_for,title,metadata&lead_id=eq.${leadId}&order=scheduled_for.asc.nullslast`,
  );
  // Workflow chain: load tasks belonging to any workflow_instance for this lead.
  const workflowTasksQ = useCrmView(
    "tasks",
    `select=id,lead_id,workflow_instance_id,task_type,title,status,due_at,completed_at,assigned_user_id,metadata&lead_id=eq.${leadId}&workflow_instance_id=not.is.null&order=due_at.asc.nullslast`,
    { all: true },
  );
  // Phase 2b.2d — real per-step crm.tasks linked by metadata.workflow_group_id.
  // Pull all 3 step types for this lead; group client-side.
  const workflowPlanTasksQ = useCrmView(
    "tasks",
    `select=id,lead_id,workflow_instance_id,task_type,title,status,due_at,completed_at,assigned_user_id,metadata&lead_id=eq.${leadId}&task_type=in.(draw_sketches,estimate,prepare_offer)&order=due_at.asc.nullslast`,
    { all: true },
  );
  // Manual + system activities (crm.activities). Additive — folded into the
  // primary Activities list so manual entries (note/call/meeting) are visible
  // without restoring the supplemental unified timeline block.
  const activitiesQ = useCrmView(
    "activities",
    `select=id,lead_id,activity_type,activity_at,summary,performed_by_user_id,metadata,outcome_code&lead_id=eq.${leadId}&order=activity_at.desc`,
    { all: true },
  );
  const rpcError = (q.error as Error | null)?.message || q.data?.error;
  const raw = q.data?.rows?.[0] ?? null;
  const profile: Row | null = (() => {
    if (!raw) return null;
    if (typeof raw === "object" && "profile" in raw && raw.profile) {
      return asObject(raw.profile);
    }
    return raw as Row;
  })();

  const header =
    sectionObject(profile, "lead", "lead_header", "header") ?? profile;
  const legacyContext = sectionObject(profile, "legacy_context");
  const people = section(profile, "people");
  const companies = section(profile, "companies");
  const objects = section(profile, "objects");
  const notes = section(profile, "notes");
  const communications = section(profile, "communications", "comms");
  const tasks = section(profile, "tasks");
  const completedTasks = useMemo(
    () =>
      tasks.filter((t) => {
        const s = str(pick(t, "status")).toLowerCase();
        return s === "completed" || s === "cancelled" || s === "skipped";
      }),
    [tasks],
  );

  const primaryContact =
    people.find((p) => pick(p, "is_primary", "is_primary_contact") === true) ??
    people[0] ??
    null;
  const primaryData = primaryContact
    ? asObject(primaryContact.person) ?? primaryContact
    : null;

  const primaryEmail = str(pick(primaryData, "email_normalized", "email"));
  const primaryPhoneE164 = str(pick(primaryData, "phone_e164"));
  const primaryPhoneRaw = str(pick(primaryData, "phone_raw", "phone"));
  const primaryPhone = primaryPhoneE164 || primaryPhoneRaw;
  const waNumber = primaryPhoneE164.replace(/[^\d]/g, "");

  // PPV/Responsible labels come from the v3 display contract (codes + names).
  // ppvUserId is kept only as an internal value passed to LeadEditPanel's
  // assignment editor (RPC payload), never rendered as text.
  const ppvUserId = str(pick(header, "ppv_user_id"));
  const ppvCode = str(pick(v3Row, "ppv_user_code"));
  const ppvName = str(pick(v3Row, "ppv_name"));
  const ppvLabel = ppvCode || "Nav piešķirts";
  const ppvTooltip = ppvName || ppvCode || "Nav piešķirts";
  const responsibleCode = str(pick(v3Row, "task_assigned_user_code"));
  const responsibleName = str(pick(v3Row, "task_assigned_name"));
  const ownerLabel = responsibleCode || ppvLabel;
  const ownerTooltip = responsibleName || responsibleCode || ppvTooltip;
  // v3-sourced operational signals (no frontend calculation).
  const queueBucketLabel = str(pick(v3Row, "queue_bucket_label"));
  const needsAttention = pick(v3Row, "needs_attention") === true;
  const commState = str(pick(v3Row, "communication_state"));
  const commLabel = str(pick(v3Row, "communication_label"));
  const hasUnreadReply = pick(v3Row, "has_unread_reply") === true;
  const leadTitle =
    str(pick(primaryData, "full_name")) ||
    str(pick(header, "full_name")) ||
    str(pick(header, "summary")) ||
    str(pick(header, "id", "lead_id")) ||
    NA;
  const leadSource =
    str(pick(header, "source", "lead_source")) ||
    str(pick(header, "source_detail")) ||
    NA;
  const leadCountry =
    str(pick(primaryData, "country")) ||
    str(pick(header, "country")) ||
    "";
  const leadRegisteredAt =
    pick(header, "registered_at", "created_at") ?? null;
  const leadStatus = str(pick(header, "status", "lead_status"));
  const leadTags = (() => {
    const t = pick(header, "tags");
    if (!t) return "";
    if (Array.isArray(t)) return t.map(str).filter(Boolean).join(", ");
    return str(t);
  })();

  const commStats = useMemo(() => {
    const r = v3Row;
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    return {
      phone: {
        outbound: num(r?.call_outbound_count),
        inbound: num(r?.call_inbound_count),
      },
      email: {
        outbound: num(r?.email_outbound_count),
        inbound: num(r?.email_inbound_count),
      },
      chat: {
        outbound: num(r?.chat_outbound_count),
        inbound: num(r?.chat_inbound_count),
      },
    };
  }, [v3Row]);

  const lastActivityAt = useMemo(() => {
    const candidates: number[] = [];
    const pushFrom = (rows: Row[], ...keys: string[]) => {
      for (const r of rows) {
        const v = pick(r, ...keys);
        if (v) {
          const t = new Date(str(v)).getTime();
          if (!Number.isNaN(t)) candidates.push(t);
        }
      }
    };
    // Match the Activities list source exactly (communications + notes).
    pushFrom(communications, "created_at", "occurred_at", "sent_at");
    pushFrom(notes, "created_at", "updated_at");
    if (!candidates.length) return null;
    return new Date(Math.max(...candidates)).toISOString();
  }, [communications, notes]);

  type TLItem = {
    key: string;
    kind: "comm" | "note" | "task" | "activity";
    ts: number;
    raw: Row;
  };
  const rawPayloadById = useMemo(() => {
    const map = new Map<string, Row>();
    const rows = (commPayloadsQ.data?.rows ?? []) as Row[];
    for (const row of rows) {
      const id = str(row.id);
      const rp = row.raw_payload;
      if (id && rp && typeof rp === "object") {
        map.set(id, rp as Row);
      }
    }
    return map;
  }, [commPayloadsQ.data]);
  const timeline = useMemo<TLItem[]>(() => {
    const items: TLItem[] = [];
    communications.forEach((c, i) => {
      const id = str(pick(c, "id", "communication_id"));
      const rp = id ? rawPayloadById.get(id) : undefined;
      const tsStr =
        (rp && str(pick(rp, "sent_at"))) ||
        str(pick(c, "sent_at", "occurred_at", "created_at"));
      const ts = new Date(tsStr).getTime() || 0;
      items.push({
        key: `c:${id || i}`,
        kind: "comm",
        ts,
        raw: c,
      });
    });
    notes.forEach((n, i) => {
      // Hide system-generated task mirror notes (cancellation/completion/
      // status-change). Operator-written manual notes are always kept.
      const nMeta =
        n && typeof (n as Row).metadata === "object" && (n as Row).metadata
          ? ((n as Row).metadata as Row)
          : undefined;
      const nSource = str(pick(n, "source") ?? pick(nMeta, "source")).toLowerCase();
      const isManualNote = nSource === "manual" || nSource === "operator";
      if (!isManualNote) {
        const linkedTaskId = str(pick(n, "task_id") ?? pick(nMeta, "task_id"));
        const nType = str(pick(n, "note_type", "type")).toLowerCase();
        const SYSTEM_NOTE_TYPES = new Set([
          "task_cancelled",
          "task_completed",
          "task_skipped",
          "task_rescheduled",
          "task_created",
          "status_change",
          "system",
        ]);
        const haystack = [
          str(pick(n, "content", "body", "text")),
          str(pick(n, "title", "subject")),
        ]
          .join(" ")
          .toLowerCase()
          .trim();
        const looksLikeSystemMirror =
          /\btask\s+(cancelled|completed|skipped|rescheduled|created)\b/.test(haystack) ||
          /\b(uzdevums\s+(atcelts|pabeigts|izlaists))\b/.test(haystack) ||
          /^cancelled\b/.test(haystack) ||
          /^atcelts\b/.test(haystack);
        if (linkedTaskId || SYSTEM_NOTE_TYPES.has(nType) || looksLikeSystemMirror) {
          return;
        }
      }
      const ts =
        new Date(str(pick(n, "created_at", "updated_at"))).getTime() || 0;
      items.push({
        key: `n:${str(pick(n, "id", "note_id")) || i}`,
        kind: "note",
        ts,
        raw: n,
      });
    });
    completedTasks.forEach((t, i) => {
      const tsStr = str(
        pick(t, "completed_at", "updated_at", "created_at"),
      );
      const ts = new Date(tsStr).getTime() || 0;
      items.push({
        key: `t:${str(pick(t, "id", "task_id")) || i}`,
        kind: "task",
        ts,
        raw: t,
      });
    });
    // Fold crm.activities rows in. Skip types already represented by other
    // sources (tasks/communications) to avoid duplicate entries.
    const activityRows = (activitiesQ.data?.rows ?? []) as Row[];
    // System (non-manual) activity types that mirror task rows. When a task
    // for the same task_id already exists in completedTasks, the activity
    // is a duplicate and must be hidden in favor of the canonical task row.
    const TASK_MIRROR_TYPES = new Set([
      "estimate",
      "draw_sketches",
      "prepare_offer",
      "task_completed",
      "task_created",
      "task_cancelled",
      "task_skipped",
      "task_rescheduled",
      "status_change",
    ]);
    activityRows.forEach((a, i) => {
      const at = str(pick(a, "activity_type")).toLowerCase();
      const aMeta =
        a && typeof a.metadata === "object" && a.metadata
          ? (a.metadata as Row)
          : undefined;
      const isManual =
        str(pick(aMeta, "source")).toLowerCase() === "manual";
      // Manual activities are always visible.
      if (!isManual) {
        // Skip activities linked to a communication — the comm is shown.
        if (str(pick(a, "communication_id"))) return;
        // Any non-manual crm.activities row linked to a task is a mirror
        // of that task's lifecycle (created/completed). The task row is
        // the canonical operator-visible item — hide the mirror.
        if (str(pick(a, "task_id"))) return;
        // Fallback for task-mirror activity_types without task_id.
        if (TASK_MIRROR_TYPES.has(at)) return;
      }
      const ts =
        new Date(str(pick(a, "activity_at", "created_at"))).getTime() || 0;
      items.push({
        key: `a:${str(pick(a, "id")) || i}`,
        kind: "activity",
        ts,
        raw: a,
      });
    });
    return items.sort((a, b) => b.ts - a.ts);
  }, [communications, notes, rawPayloadById, completedTasks, activitiesQ.data]);

  const [openItem, setOpenItem] = useState<TLItem | null>(null);
  const [completeTaskId, setCompleteTaskId] = useState<string | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [manualActivityOpen, setManualActivityOpen] = useState(false);
  const [manualActivityPrefill, setManualActivityPrefill] =
    useState<ManualActivityPrefill | undefined>(undefined);

  function openFollowUpDialog(prefill: ManualActivityPrefill) {
    setManualActivityPrefill(prefill);
    setManualActivityOpen(true);
  }

  type QuickAction = {
    label: string;
    onSelect: () => void;
    disabled?: boolean;
  };

  function QuickActionsMenu({ actions }: { actions: QuickAction[] }) {
    if (actions.length === 0) return null;
    return (
      <div
        className="ml-1 shrink-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              aria-label="Darbības"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {actions.map((a, i) => (
              <DropdownMenuItem
                key={i}
                disabled={a.disabled}
                onSelect={(e) => {
                  e.preventDefault();
                  if (!a.disabled) a.onSelect();
                }}
              >
                {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
  const [tlType, setTlType] = useState<TypeFilter>("all");
  const [tlDate, setTlDate] = useState<DateFilter>("all");
  const filteredTimeline = useMemo(
    () => filterLocalTimeline(timeline, { type: tlType, date: tlDate }),
    [timeline, tlType, tlDate],
  );
  const isTimelineFiltered = tlType !== "all" || tlDate !== "all";
  

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 space-y-4">
      <HeaderSlot>
        <Button variant="ghost" size="sm" onClick={goBackToList} className="h-8 px-2">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Atpakaļ uz sarakstu
        </Button>
      </HeaderSlot>
      {q.isLoading && <LoadingState label="Ielādē lead profilu..." />}
      {!q.isLoading && rpcError && <ErrorState message={rpcError} />}
      {!q.isLoading && !rpcError && !profile && <Empty label="Lead profils nav atrasts." />}

      {!q.isLoading && !rpcError && profile && (
        <>
          {/* Sticky operator header */}
          <Card className="sticky top-2 z-20 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/95">
            <CardContent className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-base font-semibold truncate">
                      {leadTitle}
                    </h1>
                    <StatusBadge status={leadStatus} />
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    {leadCountry && (
                      <>
                        <span className="font-medium text-foreground">
                          {leadCountry}
                        </span>
                        <span>•</span>
                      </>
                    )}
                    <span title="Zvani izejošie / ienākošie">
                      📞 {commStats.phone.outbound}/{commStats.phone.inbound}
                    </span>
                    <span title="E-pasti izejošie / ienākošie">
                      ✉️ {commStats.email.outbound}/{commStats.email.inbound}
                    </span>
                    <span title="WhatsApp / SMS izejošie / ienākošie">
                      💬 {commStats.chat.outbound}/{commStats.chat.inbound}
                    </span>
                  </div>
                </div>
                <div className="hidden md:flex items-center text-xs text-muted-foreground ml-6">
                  <div className="flex flex-col">
                    <span className="text-foreground mx-[10px]">PPV</span>
                    <span className="text-foreground mx-[10px] font-medium" title={ppvTooltip}>
                      {ppvLabel}
                    </span>
                  </div>
                  <div className="flex flex-col ml-4">
                    <span className="text-foreground mx-[10px]">Atbildīgais</span>
                    <span className="text-foreground mx-[10px] font-medium" title={ownerTooltip}>
                      {ownerLabel}
                    </span>
                  </div>
                  <div className="flex flex-col ml-4">
                    <span className="text-foreground mx-[10px]">Pēdējā aktivitāte</span>
                    <span className="text-foreground mx-[10px]">{lastActivityAt ? fmtDate(lastActivityAt) : "Nav aktivitāšu"}</span>
                  </div>
                  {(queueBucketLabel || needsAttention) && (
                    <div className="flex flex-col ml-4">
                      <span className="text-foreground mx-[10px]">Rinda</span>
                      <span className="text-foreground mx-[10px] font-medium">
                        {queueBucketLabel || "—"}
                        {needsAttention ? " · ⚠" : ""}
                      </span>
                    </div>
                  )}
                  {(commLabel || hasUnreadReply) && (
                    <div className="flex flex-col ml-4">
                      <span className="text-foreground mx-[10px]">Komunikācija</span>
                      <span className="text-foreground mx-[10px] font-medium" title={commState || undefined}>
                        {commLabel || commState || "—"}
                        {hasUnreadReply ? " · 📩" : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <Button
                    asChild={!!primaryPhone}
                    size="icon"
                    variant="outline"
                    disabled={!primaryPhone}
                    title={primaryPhone ? `Zvanīt: ${primaryPhone}` : "Zvanīt"}
                    aria-label="Zvanīt"
                    className="h-8 w-8"
                  >
                    {primaryPhone ? (
                      <a href={`tel:${primaryPhone}`} aria-label="Zvanīt">
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <Phone className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    asChild={!!primaryEmail}
                    size="icon"
                    variant="outline"
                    disabled={!primaryEmail}
                    title={primaryEmail ? `E-pasts: ${primaryEmail}` : "E-pasts"}
                    aria-label="E-pasts"
                    className="h-8 w-8"
                  >
                    {primaryEmail ? (
                      <a href={`mailto:${primaryEmail}`} aria-label="E-pasts">
                        <Mail className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <Mail className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    asChild={!!primaryPhone}
                    size="icon"
                    variant="outline"
                    disabled={!primaryPhone}
                    title={primaryPhone ? `SMS: ${primaryPhone}` : "SMS"}
                    aria-label="SMS"
                    className="h-8 w-8"
                  >
                    {primaryPhone ? (
                      <a href={`sms:${primaryPhone}`} aria-label="SMS">
                        <MessageSquare className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <MessageSquare className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    asChild={!!waNumber}
                    size="icon"
                    variant="outline"
                    disabled={!waNumber}
                    title={waNumber ? `WhatsApp: +${waNumber}` : "WhatsApp"}
                    aria-label="WhatsApp"
                    className="h-8 w-8"
                  >
                    {waNumber ? (
                      <a
                        href={`https://wa.me/${waNumber}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="WhatsApp"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <MessageCircle className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled
                    title="Piezīme"
                    aria-label="Piezīme"
                    className="h-8 w-8"
                  >
                    <StickyNote className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    title="Uzdevums"
                    aria-label="Uzdevums"
                    className="h-8 w-8"
                    onClick={() => setTaskDialogOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <RequirePermission perm="leads.edit">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => setEditPanelOpen(true)}
                      title="Rediģēt leadu"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Rediģēt
                    </Button>
                  </RequirePermission>
                  <RequirePermission perm="leads.activity.create">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => setManualActivityOpen(true)}
                      title="Pievienot darbību"
                    >
                      <Activity className="h-3.5 w-3.5" />
                      Pievienot darbību
                    </Button>
                  </RequirePermission>
                </div>
              </div>
            </CardContent>
          </Card>

          <LeadEditPanel
            open={editPanelOpen}
            onOpenChange={setEditPanelOpen}
            leadId={leadId}
            currentStatus={leadStatus}
            currentOwnerId={ppvUserId || null}
            currentPpvId={ppvUserId || null}
          />

          <ManualActivityDialog
            open={manualActivityOpen}
            onOpenChange={(o) => {
              setManualActivityOpen(o);
              if (!o) setManualActivityPrefill(undefined);
            }}
            leadId={leadId}
            prefill={manualActivityPrefill}
          />

          {/* Two-column workspace */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {/* LEFT */}
            <div className="space-y-4 xl:col-span-1">
              {/* Kontakts */}
              <Panel title="Kontakts" count={people.length}>
                {people.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="space-y-3">
                    {primaryContact && (
                      <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                        <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-primary">
                          Primārais kontakts
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            <Field label="Vārds" value={fmt(pick(primaryData, "full_name", "name"))} />
                          </div>
                          <div className="sm:col-span-2">
                            <Field label="E-pasts" value={fmt(primaryEmail)} />
                          </div>
                          <Field label="Telefons" value={fmt(primaryPhoneRaw)} />
                          <Field label="E.164" value={fmt(primaryPhoneE164)} />
                          <Field label="Komunikācijas statuss" value={fmt(pick(primaryContact, "communication_status"))} />
                          <Field label="Tagi" value={fmt(leadTags)} />
                        </div>
                        <div className="mt-3 border-t pt-2">
                          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Pamatdati
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <Field label="Avots" value={fmt(leadSource)} />
                            <Field label="Reģistrēts" value={fmtDate(leadRegisteredAt)} />
                          </div>
                        </div>
                      </div>
                    )}

                    {people.length > 1 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-left text-[10px] uppercase text-muted-foreground">
                              <th className="py-1.5 pr-2">Vārds</th>
                              <th className="py-1.5 pr-2">Kontakts</th>
                              <th className="py-1.5 pr-2">Loma</th>
                            </tr>
                          </thead>
                          <tbody>
                            {people.map((p, i) => {
                              if (p === primaryContact) return null;
                              const personData = asObject(p.person) ?? p;
                              return (
                                <tr
                                  key={String(pick(p, "id", "person_id") ?? pick(personData, "id", "person_id") ?? i)}
                                  className="border-b last:border-0"
                                >
                                  <td className="py-1.5 pr-2">{fmt(pick(personData, "full_name", "name"))}</td>
                                  <td className="py-1.5 pr-2 text-muted-foreground">
                                    {fmt(pick(personData, "email_normalized", "email", "phone_e164", "phone_raw"))}
                                  </td>
                                  <td className="py-1.5 pr-2">{fmt(pick(p, "role"))}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </Panel>

              {/* Uzņēmumi */}
              <Panel title="Uzņēmumi" count={companies.length}>
                {companies.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left text-[10px] uppercase text-muted-foreground">
                          <th className="py-1.5 pr-2">Uzņēmums</th>
                          <th className="py-1.5 pr-2">Loma</th>
                          <th className="py-1.5 pr-2">Primārais</th>
                        </tr>
                      </thead>
                      <tbody>
                        {companies.map((c, i) => {
                          const companyData = asObject(c.company) ?? c;
                          return (
                            <tr
                              key={String(pick(c, "id", "company_id") ?? pick(companyData, "id", "company_id") ?? i)}
                              className="border-b last:border-0"
                            >
                              <td className="py-1.5 pr-2">
                                <div className="font-medium">{fmt(pick(companyData, "company_name", "name"))}</div>
                                <div className="text-muted-foreground text-[10px]">
                                  {[pick(companyData, "city"), pick(companyData, "country")]
                                    .filter(Boolean)
                                    .map(str)
                                    .join(", ") || NA}
                                </div>
                              </td>
                              <td className="py-1.5 pr-2">{fmt(pick(c, "relationship_role", "role"))}</td>
                              <td className="py-1.5 pr-2">{fmtBool(pick(c, "is_primary_company", "is_primary"))}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              {/* Objekti */}
              <Panel title="Objekti" count={objects.length || (legacyContext ? 1 : 0)}>
                {objects.length === 0 && legacyContext ? (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                    <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-primary">
                      Primārais objekts
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <Field label="Objekts" value={fmt(pick(legacyContext, "objekts"))} />
                      </div>
                      <Field label="Forma zeme" value={fmt(pick(legacyContext, "forma_zeme"))} />
                      <Field label="Forma projekts" value={fmt(pick(legacyContext, "forma_projekts"))} />
                      <div className="col-span-2">
                        <Field label="Plānotā būvniecība" value={fmt(pick(legacyContext, "planota_buvnieciba_text"))} />
                      </div>
                      <Field label="Tagi" value={fmt(pick(legacyContext, "tags"))} />
                      <Field label="Valsts" value={fmt(pick(legacyContext, "valsts"))} />
                    </div>
                  </div>
                ) : objects.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="space-y-2">
                    {objects.map((o, i) => {
                      const objectData = asObject(o.object) ?? o;
                      return (
                        <div
                          key={String(pick(o, "id", "object_id") ?? pick(objectData, "id", "object_id") ?? i)}
                          className="rounded-md border bg-card p-3"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="font-medium text-sm truncate">
                              {fmt(pick(objectData, "object_name", "name"))}
                            </div>
                            <StatusBadge status={str(pick(objectData, "sales_status"))} />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Field label="Tips" value={fmt(pick(objectData, "object_type"))} />
                            <Field label="Zeme" value={fmt(pick(objectData, "land_status"))} />
                            <Field label="Projekts" value={fmt(pick(objectData, "project_status"))} />
                            <Field label="Budžets" value={fmtMoney(pick(objectData, "budget_amount"))} />
                            <div className="col-span-2">
                              <Field label="Adrese" value={fmt(pick(objectData, "address"))} />
                            </div>
                            <Field label="Aplēstā vērtība" value={fmtMoney(pick(objectData, "estimated_value"))} />
                            <Field label="Primārais" value={fmtBool(pick(o, "is_primary_object", "is_primary"))} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </div>

            {/* RIGHT */}
            <div className="space-y-4 xl:col-span-2">
              {/* Workflow chains (Phase 2b.2b) */}
              {(() => {
                const rows = (workflowTasksQ.data?.rows ?? []) as unknown as WorkflowTaskRow[];
                if (!rows.length) return null;
                const groups = groupTasksByWorkflowInstance(rows);
                if (groups.size === 0) return null;
                return (
                  <div className="space-y-3">
                    {Array.from(groups.entries()).map(([wfId, tasks]) => (
                      <WorkflowChainStrip
                        key={wfId}
                        tasks={tasks}
                        title="Workflow"
                      />
                    ))}
                  </div>
                );
              })()}
              {/* Workflow plan cards (Phase 2b.2d) — 3 real tasks grouped by
                  metadata.workflow_group_id render as one process. */}
              {(() => {
                const rows = (workflowPlanTasksQ.data?.rows ?? []) as unknown as WorkflowTaskRow[];
                const groups = groupTasksByWorkflowGroup(rows);
                if (groups.size === 0) return null;
                return (
                  <div className="space-y-3">
                    {Array.from(groups.entries()).map(([gid, tasks]) => (
                      <WorkflowPlanCard key={gid} tasks={tasks} />
                    ))}
                  </div>
                );
              })()}
              {/* Uzdevumi un plānotās darbības (unified future-work block) */}
              {(() => {
                type PlannedItem = {
                  key: string;
                  source: string;
                  taskId?: string;
                  taskType?: string;
                  title: string;
                  subtitle?: string;
                  responsible: string;
                  scheduledIso: string;
                  scheduledLabel: string;
                  status: string;
                };
                const plannedRows = (plannedActionsQ.data?.rows ?? []) as Row[];
                const items: PlannedItem[] = [];
                plannedRows.forEach((r, i) => {
                  const source = str(r.source);
                  const id = str(r.id) || String(i);
                  const rawStatus = str(r.status);
                  // Hide cancelled/completed/skipped rows — they belong in
                  // the Activities/history block, not active planned work.
                  const statusLower = rawStatus.toLowerCase();
                  if (
                    statusLower === "cancelled" ||
                    statusLower === "completed" ||
                    statusLower === "skipped"
                  ) {
                    return;
                  }
                  // Legacy automation email queue removed — those planned items
                  // are now managed exclusively through SIS tasks.
                  if (source === "queue") return;
                  const scheduledIso = str(r.scheduled_for);
                  if (source === "task") {
                    const taskType = str(r.kind).toLowerCase();
                    const meta =
                      r.metadata && typeof r.metadata === "object"
                        ? (r.metadata as Row)
                        : undefined;
                    const followUpLabel = meta ? str(meta.follow_up_label_lv) : "";
                    const TASK_TYPE_LV_SHORT: Record<string, string> = {
                      call: "Zvanīt",
                      zoom: "Tikšanās",
                      manual_email: "E-pasts",
                      automatic_email: "E-pasts",
                      automatic_reply_email: "E-pasts",
                      manual_sms: "SMS",
                      automatic_sms: "SMS",
                      manual_whatsapp: "WhatsApp",
                      automatic_whatsapp: "WhatsApp",
                      estimate: "Tāmēšana",
                      draw_sketches: "Skiču zīmēšana",
                      prepare_offer: "Piedāvājuma sagatavošana",
                    };
                    const typeLabel = TASK_TYPE_LV_SHORT[taskType] || "";
                    const rawTitle = str(r.title);
                    const title =
                      followUpLabel ||
                      (rawTitle && rawTitle !== NA ? rawTitle : "") ||
                      typeLabel ||
                      fmt(r.kind);
                    const subtitle =
                      typeLabel && title !== typeLabel ? typeLabel : undefined;
                    items.push({
                      key: `t:${id}`,
                      source,
                      taskId: id,
                      title,
                      subtitle,
                      taskType,
                      responsible: "",
                      scheduledIso,
                      scheduledLabel: fmtDate(scheduledIso),
                      status: rawStatus,
                    });
                    return;
                  }
                  items.push({
                    key: `${source}:${id}`,
                    source,
                    title: fmt(r.title) !== NA ? fmt(r.title) : fmt(r.kind),
                    subtitle: undefined,
                    responsible: "",
                    scheduledIso,
                    scheduledLabel: fmtDate(scheduledIso),
                    status: rawStatus,
                  });
                });
                return (
                  <Panel title="Uzdevumi un plānotās darbības" count={items.length}>
                    {plannedActionsQ.isLoading && items.length === 0 ? (
                      <Empty label="Ielādē..." />
                    ) : items.length === 0 ? (
                      <Empty />
                    ) : (
                      <ul className="divide-y">
                        {items.map((it) => {
                          const clickable =
                            (it.source === "task" && !!it.taskId);
                          const rowBody = (
                            <div className="flex items-start justify-between gap-3 py-2 w-full">
                              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background/80 text-muted-foreground">
                                {it.source === "task" ? (
                                  (() => {
                                    const tt = (it.taskType || "").toLowerCase();
                                    if (tt === "call") return <PhoneIcon className="h-3.5 w-3.5" />;
                                    if (tt.includes("mail")) return <Mail className="h-3.5 w-3.5" />;
                                    if (tt.includes("sms") || tt.includes("whatsapp")) return <MessageSquare className="h-3.5 w-3.5" />;
                                    if (tt === "zoom") return <Activity className="h-3.5 w-3.5" />;
                                    return <CheckSquare className="h-3.5 w-3.5" />;
                                  })()
                                ) : (
                                  <Activity className="h-3.5 w-3.5" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1 text-left">
                                <div className="text-sm truncate">{it.title}</div>
                                {it.subtitle && (
                                  <div className="text-xs text-muted-foreground truncate">
                                    {it.subtitle}
                                  </div>
                                )}
                              </div>
                              {it.responsible && (
                                <div className="text-xs text-foreground/80 whitespace-nowrap pt-0.5">
                                  {it.responsible}
                                </div>
                              )}
                              <div className="flex flex-col items-end gap-0.5 whitespace-nowrap">
                                <StatusBadge status={it.status} />
                                <div className="text-[11px] text-muted-foreground tabular-nums">
                                  {it.scheduledLabel}
                                </div>
                              </div>
                              {it.source === "task" && it.taskId && (
                                <div onClick={(e) => e.stopPropagation()}>
                                   <TaskActionsMenu
                                    taskId={it.taskId}
                                    currentDueIso={it.scheduledIso}
                                    leadId={leadId}
                                    onChanged={() => {
                                      plannedActionsQ.refetch();
                                      q.refetch();
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          );
                          const itemClasses = "group w-full text-left flex rounded-md border border-l-4 border-l-muted-foreground/40 bg-muted/50 px-3 py-2 transition-colors hover:brightness-95 dark:hover:brightness-110";
                          return (
                            <li key={it.key}>
                              {clickable ? (
                                <button
                                  type="button"
                                  className={itemClasses}
                                  onClick={() => {
                                    if (it.source === "task") setCompleteTaskId(it.taskId!);
                                  }}
                                >
                                  {rowBody}
                                </button>
                              ) : (
                                <div className={itemClasses}>
                                  {rowBody}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Panel>
                );
              })()}

              {/* Aktivitātes */}
              <Panel
                title="Aktivitātes"
                count={
                  isTimelineFiltered ? filteredTimeline.length : timeline.length
                }
                action={
                  <div className="flex items-center gap-2">
                    {isTimelineFiltered && (
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        no {timeline.length}
                      </span>
                    )}
                    <TimelineFilters
                      type={tlType}
                      date={tlDate}
                      onTypeChange={setTlType}
                      onDateChange={setTlDate}
                    />
                  </div>
                }
              >
                {/* PRIMARY: existing local timeline — communications, notes,
                    completed tasks, workflow completion items, automation,
                    audit events. Always rendered. */}
                {filteredTimeline.length === 0 ? (
                  <Empty
                    label={
                      isTimelineFiltered
                        ? "Nav ierakstu izvēlētajiem filtriem."
                        : undefined
                    }
                  />
                ) : (
                  <ol className="relative space-y-2 max-h-[640px] overflow-auto pr-2">
                    {filteredTimeline.map((it) => {
                      const r = it.raw;
                      const isNote = it.kind === "note";
                      const isTask = it.kind === "task";
                      if (isTask) {
                        const taskType = str(pick(r, "task_type")) || "task";
                        const taskStatus = str(pick(r, "status"));
                        const taskTitle =
                          str(pick(r, "title")) || fmt(taskType);
                        const outcomeCode = str(pick(r, "outcome_code"));
                        const tMeta =
                          r && typeof r.metadata === "object" && r.metadata
                            ? (r.metadata as Row)
                            : undefined;
                        const completionNotes = tMeta
                          ? str(pick(tMeta, "completion_notes", "notes"))
                          : "";
                        const tDate = pick(
                          r,
                          "completed_at",
                          "updated_at",
                          "created_at",
                        );
                        const styleT = getActivityStyle(classifyLocal(it));
                        const bgT = styleT.bg;
                        const accentT = styleT.accent;
                        const tt = taskType.toLowerCase();
                        const TASK_TYPE_SHORT_LV: Record<string, string> = {
                          call: "Zvanīt",
                          zoom: "Tikšanās",
                          manual_email: "E-pasts",
                          automatic_email: "E-pasts",
                          automatic_reply_email: "E-pasts",
                          manual_sms: "SMS",
                          automatic_sms: "SMS",
                          manual_whatsapp: "WhatsApp",
                          automatic_whatsapp: "WhatsApp",
                          estimate: "Tāmēšana",
                          draw_sketches: "Skiču zīmēšana",
                          prepare_offer: "Piedāvājuma sagatavošana",
                        };
                        const taskTypeLabelShort =
                          TASK_TYPE_SHORT_LV[tt] || "";
                        const taskIcon = tt.includes("call")
                          ? <PhoneIcon className="h-3.5 w-3.5" />
                          : tt.includes("email") || tt.includes("mail")
                            ? <MailIcon className="h-3.5 w-3.5" />
                            : <CheckSquare className="h-3.5 w-3.5" />;
                        return (
                          <li key={it.key}>
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => setOpenItem(it)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setOpenItem(it);
                                }
                              }}
                              className={`group w-full text-left flex gap-3 rounded-md border border-l-4 ${accentT} ${bgT} px-3 py-2 transition-colors hover:brightness-95 dark:hover:brightness-110 cursor-pointer`}
                            >
                              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background/80 text-muted-foreground">
                                {taskIcon}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <span className="font-medium">Uzdevums</span>
                                    {taskTypeLabelShort && (
                                      <span className="inline-flex items-center rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                        {taskTypeLabelShort}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <StatusBadge status={taskStatus} mapKind="task" />
                                    <span className="text-[11px] text-muted-foreground tabular-nums">
                                      {fmtDate(tDate)}
                                    </span>
                                  </div>
                                </div>
                                <div className="mt-0.5 text-sm font-medium truncate">
                                  {taskTitle}
                                </div>
                                {outcomeCode && (
                                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                                    Iznākums: <span className="font-medium">{lv(COMM_STATUS_LV, outcomeCode, outcomeCode)}</span>
                                  </div>
                                )}
                                {completionNotes && (
                                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground whitespace-pre-wrap">
                                    {completionNotes}
                                  </div>
                                )}
                              </div>
                              <QuickActionsMenu
                                actions={(() => {
                                  const taskId = str(pick(r, "id", "task_id"));
                                  const isCompleted =
                                    taskStatus.toLowerCase() === "completed";
                                  const list: QuickAction[] = [];
                                  if (taskId && !isCompleted) {
                                    list.push({
                                      label: "Pabeigt",
                                      onSelect: () => setCompleteTaskId(taskId),
                                    });
                                  }
                                  list.push({
                                    label: "Atvērt",
                                    onSelect: () => setOpenItem(it),
                                  });
                                  list.push({
                                    label: "Rediģēt lead",
                                    onSelect: () => setEditPanelOpen(true),
                                  });
                                  return list;
                                })()}
                              />
                            </div>
                          </li>
                        );
                      }
                      if (it.kind === "activity") {
                        const at = str(pick(r, "activity_type")).toLowerCase();
                        const ACTIVITY_LV: Record<string, string> = {
                          note: "Piezīme",
                          call: "Zvans",
                          meeting: "Tikšanās",
                          sms: "SMS",
                          whatsapp: "WhatsApp",
                          email: "E-pasts",
                          zoom: "Zoom",
                          other: "Cits",
                          estimate: "Tāmēšana",
                          draw_sketches: "Skiču zīmēšana",
                          prepare_offer: "Piedāvājuma sagatavošana",
                          task_completed: "Uzdevums pabeigts",
                          task_created: "Uzdevums izveidots",
                          status_change: "Statusa maiņa",
                          manual_update: "Manuāls ieraksts",
                        };
                        const typeLabel = ACTIVITY_LV[at] || "Darbība";
                        const aMeta =
                          r && typeof r.metadata === "object" && r.metadata
                            ? (r.metadata as Row)
                            : undefined;
                        const isManual =
                          str(pick(aMeta, "source")).toLowerCase() === "manual";
                        const aSummary = str(pick(r, "summary"));
                        const aOutcome = aMeta
                          ? str(pick(aMeta, "manual_outcome_text"))
                          : "";
                        const aDate = pick(r, "activity_at", "created_at");
                        const aActorLabel = str(pick(aMeta, "actor_label", "performed_by_label"));
                        const styleA = getActivityStyle(classifyLocal(it));
                        const actIcon =
                          at === "call" ? (
                            <PhoneIcon className="h-3.5 w-3.5" />
                          ) : at === "note" ? (
                            <StickyNote className="h-3.5 w-3.5" />
                          ) : at === "meeting" ? (
                            <CheckSquare className="h-3.5 w-3.5" />
                          ) : (
                            <Activity className="h-3.5 w-3.5" />
                          );
                        const emptyFallback = isManual
                          ? "Nav piezīmes"
                          : typeLabel;
                        return (
                          <li key={it.key}>
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => setOpenItem(it)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setOpenItem(it);
                                }
                              }}
                              className={`group w-full text-left flex gap-3 rounded-md border border-l-4 ${styleA.accent} ${styleA.bg} px-3 py-2 transition-colors hover:brightness-95 dark:hover:brightness-110 cursor-pointer`}
                            >
                              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background/80 text-muted-foreground">
                                {actIcon}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <span className="font-medium">
                                      {typeLabel}
                                    </span>
                                    {isManual && (
                                      <span className="inline-flex items-center rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                        Manuāli
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[11px] text-muted-foreground tabular-nums">
                                    {fmtDate(aDate)}
                                  </span>
                                </div>
                                <div className="mt-0.5 text-sm font-medium whitespace-pre-wrap break-words">
                                  {aSummary || emptyFallback}
                                </div>
                                {aOutcome && (
                                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                                    Iznākums:{" "}
                                    <span className="font-medium">
                                      {aOutcome}
                                    </span>
                                  </div>
                                )}
                                {aActorLabel && (
                                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                                    {aActorLabel}
                                  </div>
                                )}
                              </div>
                              <QuickActionsMenu
                                actions={(() => {
                                  const list: QuickAction[] = [];
                                  if (isManual && at === "call") {
                                    list.push({
                                      label: primaryPhone
                                        ? "Atzvanīt"
                                        : "Atzvanīt (nav tālruņa)",
                                      disabled: !primaryPhone,
                                      onSelect: () => {
                                        if (primaryPhone) {
                                          window.location.href = `tel:${primaryPhone}`;
                                        }
                                      },
                                    });
                                    list.push({
                                      label: "Izveidot follow-up",
                                      onSelect: () =>
                                        openFollowUpDialog({
                                          openFollowUp: true,
                                          followUpType: "call_follow_up",
                                          followUpAssigneeFromCurrent: true,
                                        }),
                                    });
                                  }
                                  list.push({
                                    label: "Atvērt",
                                    onSelect: () => setOpenItem(it),
                                  });
                                  list.push({
                                    label: "Rediģēt lead",
                                    onSelect: () => setEditPanelOpen(true),
                                  });
                                  return list;
                                })()}
                              />
                            </div>
                          </li>
                        );
                      }
                      const ch = str(pick(r, "channel")).toLowerCase();
                      const dir = str(pick(r, "direction")).toLowerCase();
                      const inbound = dir.includes("in");
                      const activityId = !isNote ? str(pick(r, "id", "communication_id")) : "";
                      const rp = !isNote && activityId ? rawPayloadById.get(activityId) : undefined;
                      const isEmail = ch.includes("mail");
                      const provider = !isNote ? str(pick(r, "provider")) : "";
                      const isSmartsheetNote = provider === "smartsheet_note";
                      const rpMeta =
                        rp && typeof rp.metadata === "object" && rp.metadata
                          ? (rp.metadata as Row)
                          : undefined;
                      const subject = isNote
                        ? str(pick(r, "note_type")) || "Piezīme"
                        : isEmail
                          ? (str(pick(r, "subject")) ||
                              (rp && (str(pick(rp, "automation_step")) || str(pick(rp, "template_key")))) ||
                              "E-pasts")
                          : fmt(pick(r, "subject"));
                      const preview = isNote
                        ? str(pick(r, "content", "body"))
                        : isEmail
                          ? (str(pick(r, "body", "preview", "body_preview", "summary")) ||
                              (rpMeta && str(pick(rpMeta, "smartsheet_comment_text"))) ||
                              (rp && str(pick(rp, "text_body", "html_body"))) ||
                              "")
                          : str(pick(r, "preview", "body_preview", "summary"));
                      const dateValue = isNote
                        ? pick(r, "created_at", "updated_at")
                        : isEmail
                          ? ((rp && pick(rp, "sent_at")) ||
                              pick(r, "sent_at", "occurred_at", "created_at"))
                          : pick(r, "created_at", "occurred_at", "sent_at", "updated_at");
                      const statusValue = isNote
                        ? ""
                        : (rp && str(pick(rp, "current_status"))) ||
                            str(pick(r, "status", "current_status"));
                      // Resolve template label. raw_payload.template_key is
                      // often a UUID (template_version_id); prefer the
                      // automation_step text and ignore UUID-shaped values.
                      const rMeta = !isNote && r && typeof r.metadata === "object" && r.metadata
                        ? (r.metadata as Row)
                        : undefined;
                      const tplLabel = !isNote && isEmail
                        ? resolveTemplateLabel(
                            rp && pick(rp, "automation_step"),
                            rpMeta && pick(rpMeta, "automation_step"),
                            rMeta && pick(rMeta, "automation_step"),
                            pick(r, "automation_step"),
                            rp && pick(rp, "template_key"),
                            rpMeta && pick(rpMeta, "template_key"),
                            rMeta && pick(rMeta, "template_key"),
                            pick(r, "template_key"),
                          )
                        : "";
                      // bg by kind/channel — centralized in activityStyles
                      const _style = getActivityStyle(classifyLocal(it));
                      const bg = _style.bg;
                      const accent = _style.accent;
                      return (
                        <li key={it.key}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setOpenItem(it)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setOpenItem(it);
                              }
                            }}
                            className={`group w-full text-left flex gap-3 rounded-md border border-l-4 ${accent} ${bg} px-3 py-2 transition-colors hover:brightness-95 dark:hover:brightness-110 cursor-pointer`}
                          >
                            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background/80 text-muted-foreground">
                              {isNote ? <StickyNote className="h-3.5 w-3.5" /> : channelIcon(ch)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 text-xs">
                                  <span className="font-medium capitalize">
                                    {isNote ? "Piezīme" : fmt(ch)}
                                  </span>
                                  {!isNote && dir && (
                                    <span className="inline-flex items-center gap-0.5 rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                      {inbound ? (
                                        <>
                                          <ArrowDownLeft className="h-3 w-3" /> Ienākošs
                                        </>
                                      ) : (
                                        <>
                                          <ArrowUpRight className="h-3 w-3" /> Izejošs
                                        </>
                                      )}
                                    </span>
                                  )}
                                  {isEmail && tplLabel && (
                                    <span
                                      title={tplLabel}
                                      className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                                    >
                                      {tplLabel}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {!isNote && (
                                    <StatusBadge status={statusValue} mapKind="comm" />
                                  )}
                                  <span className="text-[11px] text-muted-foreground tabular-nums">
                                    {fmtDate(dateValue)}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-0.5 text-sm font-medium truncate">{subject}</div>
                              {isSmartsheetNote && (
                                <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                  Importēta piezīme no Smartsheet
                                </div>
                              )}
                              <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground whitespace-pre-wrap">
                                {cleanPreview(preview) || "Nav teksta priekšskatījuma"}
                              </div>
                            </div>
                            <QuickActionsMenu
                              actions={(() => {
                                const list: QuickAction[] = [];
                                if (isEmail) {
                                  list.push({
                                    label: "Atvērt e-pastu",
                                    onSelect: () => setOpenItem(it),
                                  });
                                  list.push({
                                    label: "Izveidot follow-up",
                                    onSelect: () =>
                                      openFollowUpDialog({
                                        openFollowUp: true,
                                        followUpType: "info_follow_up",
                                        followUpAssigneeFromCurrent: true,
                                      }),
                                  });
                                } else {
                                  list.push({
                                    label: "Atvērt",
                                    onSelect: () => setOpenItem(it),
                                  });
                                }
                                list.push({
                                  label: "Rediģēt lead",
                                  onSelect: () => setEditPanelOpen(true),
                                });
                                return list;
                              })()}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Panel>
            </div>
          </div>

          {/* Technical raw preview — last, collapsed by default */}
          <Card className="shadow-sm">
            <CardHeader className="px-4 py-3 border-b">
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <CardTitle className="text-sm font-medium">Tehniskais skats</CardTitle>
                {showRaw ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </CardHeader>
            {showRaw && (
              <CardContent className="p-4">
                <pre className="max-h-[480px] overflow-auto rounded-md border bg-muted p-3 text-xs">
                  {JSON.stringify(profile, null, 2)}
                </pre>
              </CardContent>
            )}
          </Card>

          {/* Activity detail modal */}
          <Dialog open={!!openItem} onOpenChange={(o) => !o && setOpenItem(null)}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0">
              {openItem && openItem.kind === "task" && (() => {
                const r = openItem.raw;
                const taskType = str(pick(r, "task_type")) || "task";
                const TASK_TYPE_LV: Record<string, string> = {
                  estimate: "Tāmēšana",
                  draw_sketches: "Skiču zīmēšana",
                  prepare_offer: "Piedāvājuma sagatavošana",
                  call: "Zvans",
                  zoom: "Zoom",
                  manual_email: "E-pasts (manuāls)",
                  automatic_email: "E-pasts (automātisks)",
                  automatic_reply_email: "Atbildes e-pasts",
                  manual_sms: "SMS (manuāls)",
                  automatic_sms: "SMS (automātisks)",
                  manual_whatsapp: "WhatsApp (manuāls)",
                  automatic_whatsapp: "WhatsApp (automātisks)",
                  call_follow_up: "Atzvanīt",
                  meeting_follow_up: "Tikšanās turpinājums",
                  info_follow_up: "Nosūtīt informāciju",
                  general_follow_up: "Cits follow-up",
                };
                const taskTypeLabel = TASK_TYPE_LV[taskType.toLowerCase()] || fmt(taskType);
                const taskStatus = str(pick(r, "status"));
                const taskTitle = str(pick(r, "title")) || taskTypeLabel;
                const outcomeCode = str(pick(r, "outcome_code"));
                const tDate = pick(r, "completed_at", "updated_at", "created_at");
                const tMeta =
                  r && typeof r.metadata === "object" && r.metadata
                    ? (r.metadata as Row)
                    : undefined;
                const completionNotes = tMeta
                  ? str(pick(tMeta, "completion_notes", "notes"))
                  : "";
                const summary = tMeta ? str(pick(tMeta, "summary")) : "";
                const reason = tMeta ? str(pick(tMeta, "reason")) : "";
                const relationType = tMeta ? str(pick(tMeta, "relation_type")) : "";
                const taskId = str(pick(r, "id", "task_id"));
                const completedAtTs = tDate
                  ? new Date(str(tDate)).getTime() || 0
                  : 0;
                const preTaskNotes = taskId
                  ? notes.filter((n) => {
                      const nMeta =
                        n && typeof n.metadata === "object" && n.metadata
                          ? (n.metadata as Row)
                          : undefined;
                      const linkedId = nMeta
                        ? str(pick(nMeta, "task_id", "related_task_id"))
                        : "";
                      if (linkedId !== taskId) return false;
                      const nTs =
                        new Date(
                          str(pick(n, "created_at", "updated_at")),
                        ).getTime() || 0;
                      return completedAtTs ? nTs < completedAtTs : true;
                    })
                  : [];
                return (
                  <>
                    <div className="sticky top-0 z-20 shrink-0 overflow-visible border-b bg-background p-6 pb-3 pr-16">
                      <DialogHeader className="overflow-visible">
                        <div className="flex items-center justify-end w-full gap-4">
                          <DialogClose asChild>
                            <Button size="icon" variant="ghost" aria-label="Aizvērt" className="h-8 w-8 shrink-0">
                              <X className="h-4 w-4" />
                            </Button>
                          </DialogClose>
                        </div>
                        <DialogTitle className="flex min-w-0 items-center gap-2 text-base mt-2">
                          <CheckSquare className="h-4 w-4 shrink-0" />
                          <span className="truncate">{taskTitle}</span>
                        </DialogTitle>
                      </DialogHeader>
                      <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
                        <Field label="Tips" value={taskTypeLabel} />
                        <Field label="Statuss" value={<StatusBadge status={taskStatus} mapKind="task" />} />
                        <Field label="Datums" value={fmtDate(tDate)} />
                        {outcomeCode && (
                          <Field label="Iznākums" value={lv(COMM_STATUS_LV, outcomeCode, outcomeCode)} />
                        )}
                        {reason && <Field label="Iemesls" value={reason} />}
                        {relationType && (
                          <Field label="Saistība" value={fmt(relationType)} />
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto p-6 pt-3 space-y-4">
                      {preTaskNotes.length > 0 && (
                        <section>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                            Piezīmes pirms uzdevuma
                          </div>
                          <ol className="space-y-2">
                            {preTaskNotes.map((n, i) => (
                              <li
                                key={str(pick(n, "id", "note_id")) || `pre:${i}`}
                                className="rounded-md border bg-muted/20 p-3 text-sm whitespace-pre-wrap"
                              >
                                {str(pick(n, "content", "body"))}
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  {fmtDate(pick(n, "created_at", "updated_at"))}
                                </div>
                              </li>
                            ))}
                          </ol>
                        </section>
                      )}
                      {completionNotes && (
                        <section>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                            Piezīmes uzdevuma izpildē
                          </div>
                          <pre className="whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm text-foreground">
                            {completionNotes}
                          </pre>
                        </section>
                      )}
                      {summary && (
                        <section>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                            Kopsavilkums
                          </div>
                          <div className="rounded-md border bg-muted/20 p-3 text-sm whitespace-pre-wrap">
                            {summary}
                          </div>
                        </section>
                      )}
                    </div>
                  </>
                );
              })()}
              {openItem && openItem.kind === "activity" && (() => {
                const r = openItem.raw;
                const at = str(pick(r, "activity_type")).toLowerCase();
                const ACTIVITY_LV: Record<string, string> = {
                  note: "Piezīme",
                  call: "Zvans",
                  meeting: "Tikšanās",
                  sms: "SMS",
                  whatsapp: "WhatsApp",
                  email: "E-pasts",
                  zoom: "Zoom",
                  other: "Cits",
                  estimate: "Tāmēšana",
                  draw_sketches: "Skiču zīmēšana",
                  prepare_offer: "Piedāvājuma sagatavošana",
                  task_completed: "Uzdevums pabeigts",
                  task_created: "Uzdevums izveidots",
                  status_change: "Statusa maiņa",
                  manual_update: "Manuāls ieraksts",
                };
                const typeLabel = ACTIVITY_LV[at] || "Darbība";
                const aMeta =
                  r && typeof r.metadata === "object" && r.metadata
                    ? (r.metadata as Row)
                    : undefined;
                const isManual =
                  str(pick(aMeta, "source")).toLowerCase() === "manual";
                const aSummary = str(pick(r, "summary"));
                const aOutcome = aMeta
                  ? str(pick(aMeta, "manual_outcome_text"))
                  : "";
                const aDate = pick(r, "activity_at", "created_at");
                const aActorLabel = str(pick(aMeta, "actor_label", "performed_by_label"));
                const emptyFallback = isManual ? "Nav piezīmes" : typeLabel;
                return (
                  <>
                    <div className="sticky top-0 z-20 shrink-0 overflow-visible border-b bg-background p-6 pb-3 pr-16 relative">
                      <DialogHeader className="overflow-visible">
                        <DialogClose asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Aizvērt"
                            className="absolute right-4 top-4 h-8 w-8 shrink-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </DialogClose>
                        <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
                          <Activity className="h-4 w-4 shrink-0" />
                          <span className="truncate">{typeLabel}</span>
                          {isManual && (
                            <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              Manuāli
                            </span>
                          )}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
                        <Field label="Veids" value={typeLabel} />
                        <Field label="Datums" value={fmtDate(aDate)} />
                        {aActorLabel && (
                          <Field label="Izpildīja" value={aActorLabel} />
                        )}
                        {aOutcome && (
                          <Field label="Iznākums" value={aOutcome} />
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto p-6 pt-3">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                        Apraksts
                      </div>
                      <pre className="whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm text-foreground">
                        {aSummary || emptyFallback}
                      </pre>
                    </div>
                  </>
                );
              })()}
              {openItem && openItem.kind !== "task" && openItem.kind !== "activity" && (() => {
                const r = openItem.raw;
                const isNote = openItem.kind === "note";
                const ch = str(pick(r, "channel"));
                const dir = str(pick(r, "direction"));
                const activityId = str(pick(r, "id", "communication_id"));
                const rp = !isNote && activityId ? rawPayloadById.get(activityId) : undefined;
                const isEmail = ch.toLowerCase().includes("mail");
                const rpMeta =
                  rp && typeof rp.metadata === "object" && rp.metadata
                    ? (rp.metadata as Row)
                    : undefined;
                const subject = isNote
                  ? str(pick(r, "note_type")) || "Piezīme"
                  : isEmail
                    ? (str(pick(r, "subject")) ||
                        (rp && (str(pick(rp, "automation_step")) || str(pick(rp, "template_key")))) ||
                          "E-pasts")
                    : fmt(pick(r, "subject"));
                const dateValue = isNote
                  ? pick(r, "created_at", "updated_at")
                  : isEmail
                    ? ((rp && pick(rp, "sent_at")) || pick(r, "sent_at", "created_at"))
                    : pick(r, "created_at", "occurred_at", "sent_at", "updated_at");
                const statusValue = isNote
                  ? ""
                  : (rp && str(pick(rp, "current_status"))) ||
                      str(pick(r, "status", "current_status"));
                const provider = !isNote ? str(pick(r, "provider")) : "";
                const toAddress = rp ? str(pick(rp, "to_address")) : "";
                const templateKey = rp ? str(pick(rp, "template_key")) : "";
                const automationStep = rp ? str(pick(rp, "automation_step")) : "";
                const importedAt = !isNote ? str(pick(r, "created_at")) : "";
                const payloadHtml = rp
                  ? str(pick(rp, "html_body", "html", "body_html", "content_html"))
                  : "";
                const inlineHtml = str(pick(r, "body_html", "html", "html_body", "content_html"));
                const htmlBody = payloadHtml || inlineHtml;
                const smartsheetText = rpMeta ? str(pick(rpMeta, "smartsheet_comment_text")) : "";
                const payloadText = rp ? str(pick(rp, "text_body")) : "";
                const textBody =
                  (isEmail
                    ? str(pick(r, "body"))
                    : str(pick(r, "body_text", "body", "content", "preview", "body_preview", "summary"))) ||
                  smartsheetText ||
                  payloadText ||
                  (isEmail ? "" : str(pick(r, "body_text", "preview", "body_preview", "summary")));
                const bodyLooksHtml = !!htmlBody || /<[a-z][\s\S]*>/i.test(textBody);
                const rawForRender = htmlBody || textBody || str(pick(r, "subject"));
                const body = rawForRender || "";
                const replyTo =
                  dir.toLowerCase().includes("in")
                    ? str(pick(r, "from_address", "sender", "email")) || (rp ? str(pick(rp, "from_address", "sender", "email")) : "") || primaryEmail
                    : toAddress || primaryEmail;
                const buildMailto = (mode: "reply" | "forward") => {
                  const prefix = mode === "reply" ? "RE: " : "FW: ";
                  const needsPrefix = !new RegExp(`^${prefix.trim()}`, "i").test(subject.trim());
                  const params = new URLSearchParams();
                  params.set("subject", `${needsPrefix ? prefix : ""}${subject || "(bez temata)"}`);
                  if (body) {
                    params.set(
                      "body",
                      `\n\n--- ${mode === "reply" ? "Sākotnējā ziņa" : "Pārsūtītā ziņa"} ---\nDatums: ${fmtDate(dateValue)}\nTēma: ${subject}\n\n${body.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "").trim()}`,
                    );
                  }
                  return `mailto:${encodeURIComponent(mode === "reply" ? replyTo : "")}?${params.toString().replace(/\+/g, "%20")}`;
                };
                const handleReply = () => {
                  if (!replyTo) {
                    toast.warning("Nav atrasta saņēmēja e-pasta adrese atbildei.");
                    return;
                  }
                  window.location.href = buildMailto("reply");
                };
                const handleForward = () => {
                  window.location.href = buildMailto("forward");
                };
                if (!isNote && ch.toLowerCase() === "email" && !htmlBody) {
                  console.warn(
                    "No HTML body found for email activity",
                    activityId,
                    rp ? Object.keys(rp) : [],
                    Object.keys(r),
                  );
                }
                const safeHtml = bodyLooksHtml && body
                  ? DOMPurify.sanitize(body, {
                      USE_PROFILES: { html: true },
                      ADD_ATTR: ["target", "rel"],
                    })
                  : "";
                return (
                  <>
                    <div className="sticky top-0 z-20 shrink-0 overflow-visible border-b bg-background p-6 pb-3 pr-16">
                      <DialogHeader className="overflow-visible">
                        <div className="flex items-center justify-between w-full gap-4">
                          <div className="flex items-center gap-2">
                            {!isNote && isEmail && (
                              <>
                                <Button
                                  size="sm"
                                  className="bg-[#95B3D7] text-white border border-[#7a9bc4] hover:bg-[#7a9bc4]"
                                  onClick={handleReply}
                                  disabled={!replyTo}
                                >
                                  <Reply className="h-3.5 w-3.5 mr-1" />
                                  Atbildēt
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-[#95B3D7] text-white border border-[#7a9bc4] hover:bg-[#7a9bc4]"
                                  onClick={handleForward}
                                >
                                  <Forward className="h-3.5 w-3.5 mr-1" />
                                  Pārsūtīt
                                </Button>
                              </>
                            )}
                          </div>
                          <DialogClose asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Aizvērt"
                              className="h-8 w-8 shrink-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </DialogClose>
                        </div>
                        <DialogTitle className="flex min-w-0 items-center gap-2 text-base mt-2">
                          {isNote ? <StickyNote className="h-4 w-4 shrink-0" /> : channelIcon(ch)}
                          <span className="truncate">{subject}</span>
                        </DialogTitle>
                      </DialogHeader>
                      <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
                      {!isNote && <Field label="Kanāls" value={fmt(ch)} />}
                      {!isNote && <Field label="Virziens" value={fmt(dir)} />}
                      {!isNote && (
                        <Field
                          label="Statuss"
                          value={<StatusBadge status={statusValue} mapKind="comm" />}
                        />
                      )}
                      {!isNote && <Field label="Sniedzējs" value={fmt(provider)} />}
                      <Field label="Datums" value={fmtDate(dateValue)} />
                      {!isNote && toAddress && <Field label="Saņēmējs" value={toAddress} />}
                      {!isNote && templateKey && <Field label="Veidne" value={templateKey} />}
                      {!isNote && automationStep && (
                        <Field label="Automatizācijas solis" value={automationStep} />
                      )}
                      {!isNote && importedAt && (
                        <Field label="Imports" value={fmtDate(importedAt)} />
                      )}
                      {isNote && (
                        <Field label="Tips" value={fmt(pick(r, "note_type"))} />
                      )}
                      </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto p-6 pt-3">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                        Saturs
                      </div>
                      {body ? (
                        bodyLooksHtml ? (
                          <div
                            className="prose prose-sm max-w-none rounded-md border bg-muted/20 p-3 text-sm [&_a]:text-primary [&_a]:underline"
                            dangerouslySetInnerHTML={{ __html: safeHtml }}
                          />
                        ) : (
                          <pre className="whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm text-foreground">
                            {body}
                          </pre>
                        )
                      ) : (
                        <div className="text-sm text-muted-foreground">Nav satura.</div>
                      )}
                    </div>
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>

          <CompleteActionModal
            open={!!completeTaskId}
            onOpenChange={(o) => !o && setCompleteTaskId(null)}
            leadId={leadId}
            taskId={completeTaskId}
            defaultOwner=""
            isHumanPrimary={false}
            visibleAction=""
            onCompleted={() => {
              setCompleteTaskId(null);
              plannedActionsQ.refetch();
            }}
          />

          <TaskFormDialog
            leadId={leadId}
            open={taskDialogOpen}
            onOpenChange={setTaskDialogOpen}
            defaultOwnerLabel={
              ppvLabel !== "Nav piešķirts" ? ppvLabel : undefined
            }
            leadContext={{
              leadName: leadTitle,
              country: leadCountry,
              primaryEmail,
              primaryPhone,
              ppvEmail: undefined,
              referenceCode:
                str(pick(header, "reference_code")) || undefined,
              serverFolderUrl: undefined,
            }}
            onCreated={() => {
              q.refetch();
              plannedActionsQ.refetch();
            }}
          />
        </>
      )}
    </div>
  );
}

/* -------------------------- Planned queue edit dialog -------------------------- */

function PlannedQueueEditDialog({
  open,
  queueRow,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  queueRow: Row | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const initialKey = str(queueRow?.template_key);
  const initialIso = str(queueRow?.scheduled_for);

  const [templateKey, setTemplateKey] = useState<string>(initialKey);
  const [whenLocal, setWhenLocal] = useState<string>(toLocalInputValue(initialIso));
  const [saving, setSaving] = useState(false);

  // Reset state whenever a different queue row is opened
  const rowId = str(queueRow?.id);
  useEffect(() => {
    setTemplateKey(initialKey);
    setWhenLocal(toLocalInputValue(initialIso));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId]);

  const queueId = str(queueRow?.id);
  const canSave = !!queueId && !!templateKey && !!whenLocal && !saving;

  async function handleSave() {
    if (!queueId) return;
    setSaving(true);
    try {
      const newIso = fromLocalInputValue(whenLocal);
      const templateChanged = templateKey && templateKey !== initialKey;
      const dateChanged = newIso && newIso !== initialIso;

      if (templateChanged) {
        const res = await callCrmRpc({
          data: {
            fn: "queue_item_edit",
            params: {
              p_id: queueId,
              p_subject: str(queueRow?.subject),
              p_body: str(queueRow?.body),
              p_recipient: str(queueRow?.recipient),
              p_template_key: templateKey,
            },
          },
        });
        if (res.error) throw new Error(res.error);
      }
      if (dateChanged) {
        const res = await callCrmRpc({
          data: {
            fn: "queue_item_reschedule",
            params: { p_id: queueId, p_when: newIso },
          },
        });
        if (res.error) throw new Error(res.error);
      }
      if (!templateChanged && !dateChanged) {
        toast.info("Nav izmaiņu");
        setSaving(false);
        return;
      }
      toast.success("Saglabāts");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Neizdevās saglabāt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rediģēt automātisko e-pastu</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="queue-edit-template">Šablons</Label>
            <Select value={templateKey} onValueChange={setTemplateKey}>
              <SelectTrigger id="queue-edit-template">
                <SelectValue placeholder="Izvēlies šablonu" />
              </SelectTrigger>
              <SelectContent>
                {ALLOWED_AUTOMATION_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {templateLabelFor(k)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="queue-edit-when">Plānotais laiks</Label>
            <Input
              id="queue-edit-when"
              type="datetime-local"
              value={whenLocal}
              onChange={(e) => setWhenLocal(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Manuāla maiņa apiet 80/dienā limitu (apzināta lietotāja darbība).
            </p>
          </div>
        </div>
        <DialogHeader className="pt-2">
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={saving}>
                Atcelt
              </Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={!canSave}>
              {saving ? "Saglabā..." : "Saglabāt"}
            </Button>
          </div>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
