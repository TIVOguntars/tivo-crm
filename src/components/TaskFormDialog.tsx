import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Mail,
  Reply,
  Phone,
  Video,
  MessageSquare,
  MessageCircle,
  AlertTriangle,
  Info,
  LayoutGrid,
  FolderOpen,
  ExternalLink,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { callCrmRpc } from "@/server/analytics";
import { useCrmView } from "@/hooks/useCrmView";
import { useTaskTypes } from "@/hooks/useTaskTypes";
import {
  taskMetaSchemas,
  type TaskTypeKey,
  type TaskTypeRow,
  type RelativeAnchorKind,
  type RelativeUnit,
  type RelatedActivityRef,
} from "@/lib/taskTypes";

type Priority = "low" | "normal" | "high";

// TODO: source from crm.profiles.user_code (active users) instead of hardcoding.
const OWNER_OPTIONS = ["UC", "MO", "BJ", "EG", "AR", "GT", "SIS"] as const;
type OwnerCode = (typeof OWNER_OPTIONS)[number];
const AUTO_OWNER: OwnerCode = "SIS";

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "high", label: "Augsts" },
  { value: "normal", label: "Vidējs" },
  { value: "low", label: "Zems" },
];
function normalizePriority(v: string | null | undefined): Priority | null {
  return v === "high" || v === "normal" || v === "low" ? v : null;
}
function country3(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^[A-Za-z]{3}$/.test(t)) return t.toUpperCase();
  return t.slice(0, 3).toUpperCase();
}

export interface TaskFormLeadContext {
  leadName?: string;
  country?: string;
  primaryEmail?: string;
  primaryPhone?: string;
  ppvEmail?: string;
  referenceCode?: string;
  serverFolderUrl?: string;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  mail: Mail,
  reply: Reply,
  phone: Phone,
  video: Video,
  "message-square": MessageSquare,
  "message-circle": MessageCircle,
};

function TypeIcon({ keyName, className }: { keyName: string | null; className?: string }) {
  const Cmp = (keyName && ICONS[keyName]) || Mail;
  return <Cmp className={className ?? "h-3.5 w-3.5"} />;
}

function defaultDueLocal(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function s(v: unknown): string {
  return v == null ? "" : String(v);
}

type LeadRow = Record<string, unknown>;
type CommRow = Record<string, unknown>;
type TaskRow = Record<string, unknown>;

// ----- relative scheduling helpers -----
function unitToMinutes(amount: number, unit: RelativeUnit): number {
  if (unit === "minutes") return amount;
  if (unit === "hours") return amount * 60;
  return amount * 60 * 24;
}

function computeRelativeDue(
  anchorIso: string,
  direction: "before" | "after",
  amount: number,
  unit: RelativeUnit,
): string | null {
  const t = Date.parse(anchorIso);
  if (Number.isNaN(t)) return null;
  const sign = direction === "before" ? -1 : 1;
  const ms = sign * unitToMinutes(amount, unit) * 60_000;
  return new Date(t + ms).toISOString();
}

// ============================================================

export function TaskFormDialog({
  leadId,
  open,
  onOpenChange,
  onCreated,
  defaultOwnerLabel,
  leadContext,
}: {
  leadId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  defaultOwnerLabel?: string;
  leadContext?: TaskFormLeadContext;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const tt = useTaskTypes();

  // form state
  const [taskType, setTaskType] = useState<TaskTypeKey>("call");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [ownerCode, setOwnerCode] = useState<OwnerCode>("UC");

  // type-specific metadata fields (kept loose; serialized per type)
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [subjectRef, setSubjectRef] = useState("[{{Reference_code}}]");
  const [body, setBody] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [signatureKey, setSignatureKey] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [agenda, setAgenda] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<string>("30");
  const [replyToCommunicationId, setReplyToCommunicationId] = useState("");

  // workflow plan (Phase 2b.2c — parent_with_steps on prepare_offer)
  const [serverFolderUrl, setServerFolderUrl] = useState("");
  type PlanStep = {
    step: number;
    task_type: "draw_sketches" | "estimate" | "prepare_offer";
    label: string;
    enabled: boolean;
    owner_id: OwnerCode;
    due_at: string; // datetime-local
  };
  const defaultPlan = (): PlanStep[] => [
    { step: 1, task_type: "draw_sketches", label: "Zīmēt skices", enabled: true, owner_id: "UC", due_at: "" },
    { step: 2, task_type: "estimate", label: "Tāmēšana", enabled: true, owner_id: "UC", due_at: "" },
    { step: 3, task_type: "prepare_offer", label: "Piedāvājuma sagatavošana", enabled: true, owner_id: "UC", due_at: "" },
  ];
  const [planSteps, setPlanSteps] = useState<PlanStep[]>(defaultPlan);

  // scheduling
  const [scheduleMode, setScheduleMode] = useState<"absolute" | "relative">("absolute");
  const [dueLocal, setDueLocal] = useState<string>(defaultDueLocal());
  const [relDirection, setRelDirection] = useState<"before" | "after">("after");
  const [relAmount, setRelAmount] = useState<string>("1");
  const [relUnit, setRelUnit] = useState<RelativeUnit>("hours");
  const [relAnchorKind, setRelAnchorKind] = useState<RelativeAnchorKind>("task");
  const [relAnchorId, setRelAnchorId] = useState<string>("");
  const [relAnchorEvent, setRelAnchorEvent] = useState<string>("due_at");
  const [relDynamicRecalc, setRelDynamicRecalc] = useState(true);
  const [relCancelWithAnchor, setRelCancelWithAnchor] = useState(true);

  // related activities (metadata only)
  const [relatedIds, setRelatedIds] = useState<Record<string, RelatedActivityRef>>({});

  // lead picker (only when leadId not provided)
  const [leadQuery, setLeadQuery] = useState("");
  const [pickedLeadId, setPickedLeadId] = useState<string>("");
  const [pickedLeadLabel, setPickedLeadLabel] = useState<string>("");

  const needsPicker = !leadId;
  const trimmedQuery = leadQuery.trim();
  const leadSearchQuery = useMemo(() => {
    if (!needsPicker || trimmedQuery.length < 2) return undefined;
    const escaped = trimmedQuery.replace(/[%,()*]/g, " ").trim();
    if (!escaped) return undefined;
    const pattern = `*${escaped}*`;
    const or = [
      `display_name.ilike.${pattern}`,
      `contact_full_name.ilike.${pattern}`,
      `email_normalized.ilike.${pattern}`,
    ].join(",");
    return `select=lead_id,display_name,contact_full_name,email_normalized&or=(${or})&limit=10`;
  }, [needsPicker, trimmedQuery]);
  const leadsResult = useCrmView("leads_list_display", leadSearchQuery);
  const leadResults: LeadRow[] = needsPicker && leadSearchQuery
    ? ((leadsResult.data?.rows ?? []) as LeadRow[])
    : [];

  const effectiveLeadId = leadId ?? pickedLeadId;

  // outbound emails for this lead (reply target + related)
  const outboundEmailsQuery = effectiveLeadId
    ? `select=id,subject,sent_at,created_at,direction,channel&lead_id=eq.${effectiveLeadId}&channel=eq.email&direction=eq.outbound&order=created_at.desc&limit=50`
    : undefined;
  const outboundEmails = useCrmView("communications", outboundEmailsQuery);
  const outboundEmailRows = (outboundEmails.data?.rows ?? []) as CommRow[];

  // recent tasks for this lead (anchor picker)
  const recentTasksQuery = effectiveLeadId
    ? `select=id,title,task_type,due_at,completed_at,status&lead_id=eq.${effectiveLeadId}&order=due_at.desc.nullslast&limit=50`
    : undefined;
  const recentTasks = useCrmView("tasks", recentTasksQuery);
  const recentTaskRows = (recentTasks.data?.rows ?? []) as TaskRow[];

  // anchor task lookup for approval detection
  const anchorTask: TaskRow | undefined = useMemo(() => {
    if (relAnchorKind !== "task" || !relAnchorId) return undefined;
    return recentTaskRows.find((r) => s(r.id) === relAnchorId);
  }, [relAnchorKind, relAnchorId, recentTaskRows]);

  // Reset whenever dialog opens, and choose a sensible default type
  useEffect(() => {
    if (!open) return;
    const first = tt.rows[0]?.type_key as TaskTypeKey | undefined;
    setTaskType((first ?? "call") as TaskTypeKey);
    setTitle("");
    setDescription("");
    setPriority("normal");
    setOwnerCode("UC");
    setRecipient("");
    setSubject("");
    setSubjectRef("[{{Reference_code}}]");
    setBody("");
    setTemplateKey("");
    setSignatureKey("");
    setReplyToEmail(leadContext?.ppvEmail ?? "");
    setPhoneE164("");
    setAgenda("");
    setMeetingUrl("");
    setDurationMinutes("30");
    setReplyToCommunicationId("");
    setStartWorkflow(false);
    setServerFolderUrl(leadContext?.serverFolderUrl ?? "");
    setScheduleMode("absolute");
    setDueLocal(defaultDueLocal());
    setRelDirection("after");
    setRelAmount("1");
    setRelUnit("hours");
    setRelAnchorKind("task");
    setRelAnchorId("");
    setRelAnchorEvent("due_at");
    setRelDynamicRecalc(true);
    setRelCancelWithAnchor(true);
    setRelatedIds({});
    setLeadQuery("");
    setPickedLeadId("");
    setPickedLeadLabel("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const currentTypeRow: TaskTypeRow | undefined = tt.get(taskType);

  // Auto-fill recipient + phone + owner when type or lead context changes.
  useEffect(() => {
    if (!open || !currentTypeRow) return;
    const ch = currentTypeRow.channel;
    if (ch === "email") {
      // Reset to email default when switching into an email-channel type
      setRecipient(leadContext?.primaryEmail ?? "");
    } else if (ch === "sms" || ch === "whatsapp") {
      // Reset to phone default — previous email value must not leak in
      setRecipient(leadContext?.primaryPhone ?? "");
    } else if (ch === "call") {
      if (!phoneE164 && leadContext?.primaryPhone) setPhoneE164(leadContext.primaryPhone);
      setRecipient("");
    } else {
      setRecipient("");
    }
    // SIS for automatic, otherwise leave current pick (default UC on reset).
    if (currentTypeRow.mode === "automatic") {
      setOwnerCode(AUTO_OWNER);
    } else if (ownerCode === AUTO_OWNER) {
      setOwnerCode("UC");
    }
    // Default priority: prefer task type default, else high for call/zoom, else normal.
    const fromType = normalizePriority(currentTypeRow.default_priority);
    if (fromType) {
      setPriority(fromType);
    } else if (ch === "call" || currentTypeRow.channel === "zoom") {
      setPriority("high");
    } else {
      setPriority("normal");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskType, currentTypeRow?.channel, currentTypeRow?.mode, leadContext?.primaryEmail, leadContext?.primaryPhone]);

  // anchor-event options based on kind
  const anchorEventOptions = useMemo(() => {
    if (relAnchorKind === "task") return [
      { value: "due_at", label: "Termiņš (due_at)" },
      { value: "completed_at", label: "Pabeigts (completed_at)" },
    ];
    if (relAnchorKind === "communication") return [
      { value: "sent_at", label: "Nosūtīts (sent_at)" },
      { value: "received_at", label: "Saņemts (received_at)" },
    ];
    return [{ value: "occurred_at", label: "Notikuma laiks" }];
  }, [relAnchorKind]);

  // Approval banner detection: anchor is call/zoom task AND new task mode = automatic
  const triggersApproval = useMemo(() => {
    if (scheduleMode !== "relative") return false;
    if (relAnchorKind !== "task" || !anchorTask) return false;
    const anchorType = s(anchorTask.task_type);
    if (anchorType !== "call" && anchorType !== "zoom") return false;
    return currentTypeRow?.mode === "automatic";
  }, [scheduleMode, relAnchorKind, anchorTask, currentTypeRow]);

  // resolve final due_at ISO from scheduling state
  function resolveDueIso(): { iso: string; error?: string } {
    if (scheduleMode === "absolute") {
      const d = new Date(dueLocal);
      if (Number.isNaN(d.getTime())) return { iso: "", error: "Nederīgs termiņš" };
      return { iso: d.toISOString() };
    }
    // relative
    if (!relAnchorId) return { iso: "", error: "Izvēlies atskaites uzdevumu" };
    const amount = Number(relAmount);
    if (!Number.isFinite(amount) || amount <= 0)
      return { iso: "", error: "Nederīgs daudzums" };
    let anchorIso: string | undefined;
    if (relAnchorKind === "task") {
      const t = recentTaskRows.find((r) => s(r.id) === relAnchorId);
      if (!t) return { iso: "", error: "Atskaites uzdevums nav atrasts" };
      const field = relAnchorEvent === "completed_at" ? "completed_at" : "due_at";
      anchorIso = s((t as Record<string, unknown>)[field]);
    } else if (relAnchorKind === "communication") {
      const c = outboundEmailRows.find((r) => s(r.id) === relAnchorId);
      if (!c) return { iso: "", error: "Atskaites komunikācija nav atrasta" };
      const field = relAnchorEvent === "received_at" ? "received_at" : "sent_at";
      anchorIso = s((c as Record<string, unknown>)[field] ?? c.created_at);
    }
    if (!anchorIso) return { iso: "", error: "Atskaites punkta laiks nav iestatīts" };
    const due = computeRelativeDue(anchorIso, relDirection, amount, relUnit);
    if (!due) return { iso: "", error: "Nevarēja aprēķināt termiņu" };
    if (Date.parse(due) <= Date.now())
      return { iso: "", error: "Aprēķinātais termiņš ir pagātnē" };
    return { iso: due };
  }

  // ----- build the per-type metadata payload -----
  function buildTypeMeta(): { meta: Record<string, unknown>; error?: string } {
    const key = taskType;
    let payload: Record<string, unknown> = {};
    switch (key) {
      case "automatic_email":
        payload = {
          channel: "email",
          mode: "automatic",
          recipient: recipient.trim(),
          subject: [subject.trim(), subjectRef.trim()].filter(Boolean).join(" "),
          body: body.trim(),
          template_key: templateKey.trim() || null,
          signature_key: signatureKey.trim() || null,
        };
        break;
      case "automatic_reply_email":
        payload = {
          channel: "email",
          mode: "automatic",
          in_reply_to_communication_id: replyToCommunicationId,
          subject: [subject.trim(), subjectRef.trim()].filter(Boolean).join(" "),
          recipient: recipient.trim() || undefined,
          body: body.trim(),
          signature_key: signatureKey.trim() || null,
          reply_match: {
            primary: "original_recipient_email",
            fallback: "lead_contact_emails",
          },
        };
        break;
      case "manual_email":
        payload = {
          channel: "email",
          mode: "manual",
          recipient: recipient.trim(),
          subject: [subject.trim(), subjectRef.trim()].filter(Boolean).join(" "),
          body: body.trim(),
          proof: { required: true, accept: ["crm_send", "imap_reconcile", "manual_link"] },
        };
        break;
      case "call":
        payload = {
          channel: "call",
          mode: "human",
          phone_e164: phoneE164.trim(),
          agenda: agenda.trim() || null,
        };
        break;
      case "zoom":
        payload = {
          channel: "zoom",
          mode: "human",
          meeting_url: meetingUrl.trim(),
          duration_minutes: Number(durationMinutes) || null,
          agenda: agenda.trim() || null,
        };
        break;
      case "draw_sketches":
        payload = {
          channel: "internal",
          mode: "human",
          agenda: agenda.trim() || null,
        };
        break;
      case "automatic_sms":
        payload = {
          channel: "sms",
          mode: "automatic",
          recipient: recipient.trim(),
          body: body.trim(),
          template_key: templateKey.trim() || null,
        };
        break;
      case "manual_sms":
        payload = {
          channel: "sms",
          mode: "manual",
          recipient: recipient.trim(),
          body: body.trim(),
          proof: { required: true, accept: ["crm_send", "manual_link", "manual_marked"] },
        };
        break;
      case "automatic_whatsapp":
        payload = {
          channel: "whatsapp",
          mode: "automatic",
          recipient: recipient.trim(),
          body: body.trim(),
          template_key: templateKey.trim() || null,
        };
        break;
      case "manual_whatsapp":
        payload = {
          channel: "whatsapp",
          mode: "manual",
          recipient: recipient.trim(),
          body: body.trim(),
          proof: { required: true, accept: ["crm_send", "manual_link", "manual_marked"] },
        };
        break;
    }
    const schema = taskMetaSchemas[key];
    if (!schema) {
      // Unknown / non-channel task types (e.g. draw_sketches) — no per-type
      // schema. Skip strict validation; envelope-level checks still apply.
      return { meta: payload };
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { meta: payload, error: issue?.message ?? "Nederīgi lauki" };
    }
    return { meta: payload };
  }

  const canSubmit = !busy && !!effectiveLeadId && !!title.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const due = resolveDueIso();
    if (due.error) {
      toast.error(due.error);
      return;
    }
    const isDrawSketches = (taskType as string) === "draw_sketches";
    if (isDrawSketches && startWorkflow && !serverFolderUrl.trim()) {
      toast.error("Servera mapes saite ir obligāta, kad workflow ir aktīvs");
      return;
    }
    const typed = buildTypeMeta();
    if (typed.error) {
      toast.error(typed.error);
      return;
    }

    // assemble envelope
    const relativeTo =
      scheduleMode === "relative"
        ? {
            anchor_kind: relAnchorKind,
            anchor_id: relAnchorId,
            anchor_event: relAnchorEvent,
            offset_minutes:
              (relDirection === "before" ? -1 : 1) *
              unitToMinutes(Number(relAmount), relUnit),
            dynamic_recalc: relDynamicRecalc,
            cancel_with_anchor: relCancelWithAnchor,
          }
        : null;

    const related = Object.values(relatedIds);

    const approval = triggersApproval
      ? {
          actor_source: "anchor_task_owner" as const,
          anchor_task_id: relAnchorId,
        }
      : null;

    const metadata: Record<string, unknown> = {
      source: "manual_ui",
      task_type: taskType,
      ...typed.meta,
      ...(defaultOwnerLabel ? { owner_label: defaultOwnerLabel } : {}),
      owner_code: ownerCode,
      ...(replyToEmail.trim() ? { reply_to: replyToEmail.trim() } : {}),
      ...(leadContext?.referenceCode ? { reference_code: leadContext.referenceCode } : {}),
      ...(relativeTo ? { relative_to: relativeTo } : {}),
      ...(related.length ? { related_activities: related } : {}),
      ...(serverFolderUrl.trim() ? { server_folder_url: serverFolderUrl.trim() } : {}),
      ...(isDrawSketches && startWorkflow
        ? { workflow: { template_key: "object_preparation_v1", step: 1 } }
        : {}),
      ...(approval
        ? { requires_approval: true, approval }
        : { requires_approval: false }),
    };

    setBusy(true);
    try {
      const res = await callCrmRpc({
        data: {
          fn: "rpc_create_task",
          params: {
            p_lead_id: effectiveLeadId,
            p_task_type: taskType,
            p_due_at: due.iso,
            p_title: title.trim(),
            p_description: description.trim() || null,
            p_assigned_user_id: null,
            p_required_role: null,
            p_workflow_instance_id: null,
            p_parent_task_id: null,
            p_metadata: metadata,
            p_is_auto_created: false,
            p_priority: priority,
          },
        },
      });
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Uzdevums izveidots");
      await qc.invalidateQueries({ queryKey: ["crm"] });
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nezināma kļūda");
    } finally {
      setBusy(false);
    }
  };

  function toggleRelated(ref: RelatedActivityRef) {
    setRelatedIds((prev) => {
      const next = { ...prev };
      const k = `${ref.kind}:${ref.id}`;
      if (next[k]) delete next[k];
      else next[k] = ref;
      return next;
    });
  }

  // ============================================================
  // RENDER
  // ============================================================

  const showRecipient =
    currentTypeRow?.channel === "email" ||
    currentTypeRow?.channel === "sms" ||
    currentTypeRow?.channel === "whatsapp";
  // Email channel renders recipient+reply-to in a combined row below.
  // Non-email channels keep the standalone recipient block.
  const showRecipientStandalone =
    showRecipient && currentTypeRow?.channel !== "email";
  const showEmailRecipientRow = currentTypeRow?.channel === "email";
  const showSubject = !!currentTypeRow?.requires_subject;
  const showBody = !!currentTypeRow?.requires_body;
  const isAutomatic = currentTypeRow?.mode === "automatic";

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] p-0 overflow-hidden flex flex-col [&>button.absolute]:hidden">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/95 backdrop-blur px-5 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-sm font-semibold text-foreground">
              {leadContext?.leadName || "Jauns uzdevums"}
            </span>
            {leadContext?.country && (
              <span className="shrink-0 rounded-sm border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground">
                {country3(leadContext.country)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {leadContext?.serverFolderUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => window.open(leadContext.serverFolderUrl!, "_blank", "noopener")}
                title="Atvērt servera mapi"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Servera mape
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled
              title="Drīzumā"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => !busy && onOpenChange(false)}
              title="Aizvērt"
              aria-label="Aizvērt"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          {needsPicker && (
            <div className="space-y-1.5">
              <Label htmlFor="task-lead-search">Lead</Label>
              {pickedLeadId ? (
                <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                  <span className="truncate">{pickedLeadLabel || pickedLeadId}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() => {
                      setPickedLeadId("");
                      setPickedLeadLabel("");
                    }}
                  >
                    Mainīt
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    id="task-lead-search"
                    placeholder="Meklē pēc vārda vai e-pasta…"
                    value={leadQuery}
                    onChange={(e) => setLeadQuery(e.target.value)}
                  />
                  {trimmedQuery.length >= 2 && (
                    <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                      {leadsResult.isLoading ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Meklē…</div>
                      ) : leadResults.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Nav rezultātu</div>
                      ) : (
                        leadResults.map((r) => {
                          const id = s(r.lead_id);
                          const label =
                            s(r.display_name) ||
                            s(r.contact_full_name) ||
                            s(r.email_normalized) ||
                            id;
                          return (
                            <button
                              key={id}
                              type="button"
                              className="block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-accent"
                              onClick={() => {
                                setPickedLeadId(id);
                                setPickedLeadLabel(label);
                              }}
                            >
                              {label}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Top row: Type · Owner · Priority */}
          <div className="flex items-end gap-3">
            <div className="space-y-1.5 flex-1 min-w-0">
              <Label htmlFor="task-type">Tips *</Label>
              <Select
                value={taskType}
                onValueChange={(v) => setTaskType(v as TaskTypeKey)}
                disabled={tt.isLoading || tt.rows.length === 0}
              >
                <SelectTrigger id="task-type" className="w-full gap-2">
                  <SelectValue placeholder={tt.isLoading ? "Ielādē…" : "Izvēlies tipu"} />
                </SelectTrigger>
                <SelectContent>
                  {tt.rows.map((t) => (
                    <SelectItem key={t.type_key} value={t.type_key}>
                      <span className="inline-flex items-center gap-2">
                        <TypeIcon keyName={t.icon_key} />
                        {t.label_lv}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 shrink-0">
              <Label htmlFor="task-owner">Atbildīgais</Label>
              <Select
                value={ownerCode}
                onValueChange={(v) => setOwnerCode(v as OwnerCode)}
                disabled={isAutomatic}
              >
                <SelectTrigger id="task-owner" className="w-[5.5rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OWNER_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 shrink-0 ml-auto">
              <Label className="block">Prioritāte</Label>
              <div
                role="radiogroup"
                aria-label="Prioritāte"
                className="flex h-9 w-fit items-center rounded-md border border-input bg-background p-0.5 whitespace-nowrap"
              >
                {PRIORITY_OPTIONS.map((opt) => {
                  const active = priority === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setPriority(opt.value)}
                      className={
                        "h-7 px-2.5 text-xs rounded-sm transition shrink-0 " +
                        (active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted")
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Virsraksts *</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={currentTypeRow?.label_lv ?? "Virsraksts"}
              maxLength={200}
            />
          </div>

          {/* Type-specific fields */}
          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
            {showRecipientStandalone && (
              <div className="space-y-1.5">
                <Label htmlFor="task-recipient">
                  Saņēmēja tālrunis *
                </Label>
                <Input
                  id="task-recipient"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="+371…"
                />
              </div>
            )}

            {showEmailRecipientRow && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task-recipient">Sūtīt uz *</Label>
                  <Input
                    id="task-recipient"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="klients@piemers.lv"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-reply-to">Atbildēt uz</Label>
                  <Input
                    id="task-reply-to"
                    value={replyToEmail}
                    onChange={(e) => setReplyToEmail(e.target.value)}
                    placeholder={leadContext?.ppvEmail || "ppv@piemers.lv"}
                  />
                </div>
              </div>
            )}

            {taskType === "automatic_reply_email" && (
              <div className="space-y-1.5">
                <Label>Atbildēt uz izejošo e-pastu *</Label>
                {!effectiveLeadId ? (
                  <p className="text-xs text-muted-foreground">Vispirms izvēlies lead.</p>
                ) : outboundEmails.isLoading ? (
                  <p className="text-xs text-muted-foreground">Ielādē e-pastus…</p>
                ) : outboundEmailRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Šim lead nav izejošu e-pastu.</p>
                ) : (
                  <Select
                    value={replyToCommunicationId}
                    onValueChange={(v) => {
                      setReplyToCommunicationId(v);
                      const target = outboundEmailRows.find((c) => s(c.id) === v);
                      if (target && !subject) setSubject(`Re: ${s(target.subject)}`);
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Izvēlies…" /></SelectTrigger>
                    <SelectContent>
                      {outboundEmailRows.slice(0, 50).map((c) => (
                        <SelectItem key={s(c.id)} value={s(c.id)}>
                          {s(c.subject) || "(bez tēmas)"} — {s(c.sent_at ?? c.created_at).slice(0, 10)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {showSubject && (
              <div className="space-y-1.5">
                <Label htmlFor="task-subject">Tēma *</Label>
                <div className="flex gap-3">
                  <Input
                    id="task-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    maxLength={250}
                    placeholder="[Ievadi tēmu]"
                    className="flex-1 min-w-0"
                  />
                  <Input
                    aria-label="Reference"
                    value={subjectRef}
                    onChange={(e) => setSubjectRef(e.target.value)}
                    maxLength={120}
                    style={{ width: `${Math.max(subjectRef.length, 4) + 3}ch` }}
                    className="shrink-0 font-mono"
                  />
                </div>
              </div>
            )}

            {showBody && (
              <div className="space-y-1.5">
                <Label htmlFor="task-body">Saturs *</Label>
                <Textarea
                  id="task-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  maxLength={4000}
                />
                {(currentTypeRow?.channel === "sms") && (
                  <p className={
                    body.length > 160
                      ? "text-[10px] text-destructive font-medium"
                      : "text-[10px] text-muted-foreground"
                  }>
                    {body.length} / 160 rakstzīmes
                  </p>
                )}
              </div>
            )}

            {(taskType === "automatic_email" ||
              taskType === "automatic_sms" ||
              taskType === "automatic_whatsapp") && (
              <div className="space-y-1.5">
                <Label htmlFor="task-template">Veidne (template_key)</Label>
                <Input
                  id="task-template"
                  value={templateKey}
                  onChange={(e) => setTemplateKey(e.target.value)}
                  placeholder="Neobligāts"
                />
              </div>
            )}

            {(taskType === "automatic_email" || taskType === "automatic_reply_email") && (
              <div className="space-y-1.5">
                <Label htmlFor="task-signature">Paraksts (signature_key)</Label>
                <Input
                  id="task-signature"
                  value={signatureKey}
                  onChange={(e) => setSignatureKey(e.target.value)}
                  placeholder="Neobligāts"
                />
              </div>
            )}

            {taskType === "call" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="task-phone">Tālrunis *</Label>
                  <Input
                    id="task-phone"
                    value={phoneE164}
                    onChange={(e) => setPhoneE164(e.target.value)}
                    placeholder="+371…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-agenda">Saruna par</Label>
                  <Textarea
                    id="task-agenda"
                    value={agenda}
                    onChange={(e) => setAgenda(e.target.value)}
                    rows={2}
                    placeholder="Neobligāts"
                  />
                </div>
              </>
            )}

            {taskType === "zoom" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="task-zoom-url">Zoom saite *</Label>
                  <Input
                    id="task-zoom-url"
                    value={meetingUrl}
                    onChange={(e) => setMeetingUrl(e.target.value)}
                    placeholder="https://zoom.us/j/…"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="task-zoom-duration">Ilgums (min)</Label>
                    <Input
                      id="task-zoom-duration"
                      type="number"
                      min={5}
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-zoom-agenda">Sarunas mērķis</Label>
                  <Textarea
                    id="task-zoom-agenda"
                    value={agenda}
                    onChange={(e) => setAgenda(e.target.value)}
                    rows={2}
                    placeholder="Neobligāts"
                  />
                </div>
              </>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Iekšējās piezīmes</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Neobligāts"
              rows={2}
              maxLength={2000}
            />
          </div>

          {(taskType as string) === "draw_sketches" && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Sākt objekta sagatavošanas procesu
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Pēc katra soļa pabeigšanas sistēma automātiski izveidos nākamo uzdevumu.
                </p>
              </div>
              <ol className="space-y-1 text-xs text-foreground/90">
                <li className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">1</span>
                  Zīmēt skices
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">2</span>
                  Tāmēšana
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">3</span>
                  Piedāvājuma sagatavošana
                </li>
              </ol>
              <label className="flex items-center gap-2 pt-1 text-sm">
                <Checkbox
                  checked={startWorkflow}
                  onCheckedChange={(v) => setStartWorkflow(!!v)}
                />
                Sākt workflow
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="task-server-folder">
                  Servera mapes saite / ceļš{startWorkflow ? " *" : ""}
                </Label>
                <Input
                  id="task-server-folder"
                  value={serverFolderUrl}
                  onChange={(e) => setServerFolderUrl(e.target.value)}
                  placeholder="\\\\server\\projekti\\..."
                />
                {startWorkflow && !serverFolderUrl.trim() && (
                  <p className="text-[10px] text-destructive font-medium">
                    Obligāts, kad workflow ir aktīvs.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Scheduling */}
          <div className="space-y-2">
            <Label>Termiņš *</Label>
            <Tabs value={scheduleMode} onValueChange={(v) => setScheduleMode(v as "absolute" | "relative")}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="absolute">Absolūts</TabsTrigger>
                <TabsTrigger value="relative">Relatīvs</TabsTrigger>
              </TabsList>
              <TabsContent value="absolute" className="space-y-1.5">
                <Input
                  id="task-due"
                  type="datetime-local"
                  value={dueLocal}
                  onChange={(e) => setDueLocal(e.target.value)}
                />
              </TabsContent>
              <TabsContent value="relative" className="space-y-3">
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Automātiska pārrēķināšana tiks aktivizēta nākamajā fāzē.</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Select value={relDirection} onValueChange={(v) => setRelDirection(v as "before" | "after")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="before">Pirms</SelectItem>
                      <SelectItem value="after">Pēc</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    value={relAmount}
                    onChange={(e) => setRelAmount(e.target.value)}
                  />
                  <Select value={relUnit} onValueChange={(v) => setRelUnit(v as RelativeUnit)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">min</SelectItem>
                      <SelectItem value="hours">h</SelectItem>
                      <SelectItem value="days">d</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={relAnchorKind}
                    onValueChange={(v) => {
                      const k = v as RelativeAnchorKind;
                      setRelAnchorKind(k);
                      setRelAnchorId("");
                      setRelAnchorEvent(k === "task" ? "due_at" : k === "communication" ? "sent_at" : "occurred_at");
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="task">Uzdevums</SelectItem>
                      <SelectItem value="communication">Izejošs e-pasts</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={relAnchorEvent} onValueChange={setRelAnchorEvent}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {anchorEventOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Atskaites punkts *</Label>
                  {!effectiveLeadId ? (
                    <p className="text-xs text-muted-foreground">Vispirms izvēlies lead.</p>
                  ) : relAnchorKind === "task" ? (
                    recentTasks.isLoading ? (
                      <p className="text-xs text-muted-foreground">Ielādē uzdevumus…</p>
                    ) : recentTaskRows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Šim lead nav uzdevumu.</p>
                    ) : (
                      <Select value={relAnchorId} onValueChange={setRelAnchorId}>
                        <SelectTrigger><SelectValue placeholder="Izvēlies…" /></SelectTrigger>
                        <SelectContent>
                          {recentTaskRows.map((t) => (
                            <SelectItem key={s(t.id)} value={s(t.id)}>
                              [{s(t.task_type) || "—"}] {s(t.title) || "(bez nosaukuma)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )
                  ) : outboundEmails.isLoading ? (
                    <p className="text-xs text-muted-foreground">Ielādē e-pastus…</p>
                  ) : outboundEmailRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nav izejošu e-pastu.</p>
                  ) : (
                    <Select value={relAnchorId} onValueChange={setRelAnchorId}>
                      <SelectTrigger><SelectValue placeholder="Izvēlies…" /></SelectTrigger>
                      <SelectContent>
                        {outboundEmailRows.map((c) => (
                          <SelectItem key={s(c.id)} value={s(c.id)}>
                            {s(c.subject) || "(bez tēmas)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={relDynamicRecalc}
                      onCheckedChange={(v) => setRelDynamicRecalc(!!v)}
                    />
                    Dinamiska pārrēķināšana (Phase 2)
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={relCancelWithAnchor}
                      onCheckedChange={(v) => setRelCancelWithAnchor(!!v)}
                    />
                    Atcelt kopā ar atskaites punktu (Phase 2)
                  </label>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Approval banner */}
          {triggersApproval && (
            <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Šim uzdevumam būs nepieciešams apstiprinājums nākamajā fāzē.</span>
            </div>
          )}

          {/* Related activities */}
          {effectiveLeadId && (outboundEmailRows.length > 0 || recentTaskRows.length > 0) && (
            <details className="rounded-md border border-border p-3">
              <summary className="text-sm cursor-pointer select-none">Saistītās aktivitātes (neobligāti)</summary>
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1 text-xs">
                {outboundEmailRows.slice(0, 10).map((c) => {
                  const id = s(c.id);
                  const k = `communication:${id}`;
                  const checked = !!relatedIds[k];
                  return (
                    <label key={k} className="flex items-center gap-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          toggleRelated({
                            kind: "communication",
                            id,
                            role: "context",
                            label: s(c.subject),
                          })
                        }
                      />
                      <span className="truncate flex-1">E-pasts: {s(c.subject) || "(bez tēmas)"}</span>
                      {effectiveLeadId && (
                        <a
                          href={`/lead/${effectiveLeadId}#comm-${id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                          title="Atvērt"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </label>
                  );
                })}
                {recentTaskRows.slice(0, 10).map((t) => {
                  const id = s(t.id);
                  const k = `task:${id}`;
                  const checked = !!relatedIds[k];
                  return (
                    <label key={k} className="flex items-center gap-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          toggleRelated({
                            kind: "task",
                            id,
                            role: "context",
                            label: s(t.title),
                          })
                        }
                      />
                      <span className="truncate flex-1">Uzd.: {s(t.title) || "(bez nosaukuma)"}</span>
                      {effectiveLeadId && (
                        <a
                          href={`/lead/${effectiveLeadId}#task-${id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                          title="Atvērt"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </label>
                  );
                })}
              </div>
            </details>
          )}

        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Atcelt
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {busy ? "Saglabā…" : "Izveidot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
