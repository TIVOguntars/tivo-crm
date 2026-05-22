import { z } from "zod";

export const TASK_TYPE_KEYS = [
  "automatic_email",
  "automatic_reply_email",
  "manual_email",
  "call",
  "zoom",
  "automatic_sms",
  "automatic_whatsapp",
  "manual_sms",
  "manual_whatsapp",
  // Workflow / internal human task types (no channel payload).
  "draw_sketches",
  "estimate",
  "prepare_offer",
] as const;

export type TaskTypeKey = (typeof TASK_TYPE_KEYS)[number];

export type TaskChannel = "email" | "sms" | "whatsapp" | "call" | "zoom";
export type TaskMode = "automatic" | "manual" | "human";
export type CompletionRule =
  | "send_success"
  | "delivered"
  | "read"
  | "inbound_reply"
  | "manual_with_proof"
  | "human_complete";

export interface TaskTypeRow {
  type_key: TaskTypeKey | string;
  label_lv: string;
  label_en: string | null;
  channel: TaskChannel | string;
  mode: TaskMode | string;
  completion_rule: CompletionRule | string;
  requires_communication_proof: boolean;
  requires_body: boolean;
  requires_subject: boolean;
  requires_meeting_url: boolean;
  default_priority: string;
  metadata_schema: Record<string, unknown>;
  icon_key: string | null;
  is_active: boolean;
  sort_order: number;
}

// ---------- relative scheduling ----------

export const relativeAnchorKinds = ["task", "activity", "communication"] as const;
export type RelativeAnchorKind = (typeof relativeAnchorKinds)[number];

export const relativeUnits = ["minutes", "hours", "days"] as const;
export type RelativeUnit = (typeof relativeUnits)[number];

export interface RelativeTo {
  anchor_kind: RelativeAnchorKind;
  anchor_id: string;
  anchor_event: string; // due_at | completed_at | sent_at | received_at | occurred_at
  offset_minutes: number; // signed: negative = before, positive = after
  dynamic_recalc: boolean;
  cancel_with_anchor: boolean;
}

export interface RelatedActivityRef {
  kind: "task" | "activity" | "communication";
  id: string;
  role?: "context" | "reply_target" | "trigger" | string;
  label?: string;
}

// ---------- per-type metadata (discriminated union) ----------

interface BaseMeta {
  source?: string;
  owner_label?: string;
  assigned_user_id?: string | null;
  related_activities?: RelatedActivityRef[];
  relative_to?: RelativeTo | null;
}

export interface AutomaticEmailMeta extends BaseMeta {
  task_type: "automatic_email";
  channel: "email";
  mode: "automatic";
  recipient: string;
  subject: string;
  body: string;
  template_key?: string | null;
  signature_key?: string | null;
  from_address?: string | null;
  reply_to?: string | null;
  cc?: string[];
  bcc?: string[];
}

export interface AutomaticReplyEmailMeta extends BaseMeta {
  task_type: "automatic_reply_email";
  channel: "email";
  mode: "automatic";
  in_reply_to_communication_id: string;
  subject: string;
  body: string;
  template_key?: string | null;
  signature_key?: string | null;
  reply_match?: { primary: string; fallback: string };
}

export interface ManualEmailMeta extends BaseMeta {
  task_type: "manual_email";
  channel: "email";
  mode: "manual";
  recipient: string;
  subject: string;
  body: string;
  proof?: { required: boolean; accept: string[] };
}

export interface CallMeta extends BaseMeta {
  task_type: "call";
  channel: "call";
  mode: "human";
  phone_e164: string;
  agenda?: string | null;
  notes_prompt?: string | null;
}

export interface ZoomMeta extends BaseMeta {
  task_type: "zoom";
  channel: "zoom";
  mode: "human";
  meeting_url: string;
  meeting_id?: string | null;
  dial_in?: string | null;
  duration_minutes?: number | null;
  agenda?: string | null;
  notes_prompt?: string | null;
}

export interface AutomaticSmsMeta extends BaseMeta {
  task_type: "automatic_sms";
  channel: "sms";
  mode: "automatic";
  recipient: string;
  body: string;
  template_key?: string | null;
}

export interface ManualSmsMeta extends BaseMeta {
  task_type: "manual_sms";
  channel: "sms";
  mode: "manual";
  recipient: string;
  body: string;
  proof?: { required: boolean; accept: string[] };
}

export interface AutomaticWhatsappMeta extends BaseMeta {
  task_type: "automatic_whatsapp";
  channel: "whatsapp";
  mode: "automatic";
  recipient: string;
  body: string;
  template_key?: string | null;
}

export interface ManualWhatsappMeta extends BaseMeta {
  task_type: "manual_whatsapp";
  channel: "whatsapp";
  mode: "manual";
  recipient: string;
  body: string;
  proof?: { required: boolean; accept: string[] };
}

export type TaskMetadata =
  | AutomaticEmailMeta
  | AutomaticReplyEmailMeta
  | ManualEmailMeta
  | CallMeta
  | ZoomMeta
  | AutomaticSmsMeta
  | ManualSmsMeta
  | AutomaticWhatsappMeta
  | ManualWhatsappMeta;

// ---------- Zod validation ----------

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRe = /^\+?[0-9 ()\-]{6,20}$/;
const urlRe = /^https?:\/\/.+/i;

const email = z.string().regex(emailRe, "Nederīga e-pasta adrese");
const phone = z.string().regex(phoneRe, "Nederīgs tālruņa numurs");
const reqText = (msg: string) => z.string().trim().min(1, msg);

export const taskMetaSchemas: Record<TaskTypeKey, z.ZodTypeAny> = {
  automatic_email: z.object({
    recipient: email,
    subject: reqText("Tēma ir obligāta"),
    body: reqText("Saturs ir obligāts"),
    template_key: z.string().optional().nullable(),
    signature_key: z.string().optional().nullable(),
  }),
  automatic_reply_email: z.object({
    in_reply_to_communication_id: reqText("Jāizvēlas izejošais e-pasts"),
    subject: reqText("Tēma ir obligāta"),
    body: reqText("Saturs ir obligāts"),
    signature_key: z.string().optional().nullable(),
  }),
  manual_email: z.object({
    recipient: email,
    subject: reqText("Tēma ir obligāta"),
    body: reqText("Saturs ir obligāts"),
  }),
  call: z.object({
    phone_e164: phone,
    agenda: z.string().optional().nullable(),
  }),
  zoom: z.object({
    meeting_url: z.string().regex(urlRe, "Nederīga saites URL"),
    duration_minutes: z.number().int().positive().optional().nullable(),
    agenda: z.string().optional().nullable(),
  }),
  automatic_sms: z.object({
    recipient: phone,
    body: reqText("Saturs ir obligāts"),
    template_key: z.string().optional().nullable(),
  }),
  automatic_whatsapp: z.object({
    recipient: phone,
    body: reqText("Saturs ir obligāts"),
    template_key: z.string().optional().nullable(),
  }),
  manual_sms: z.object({
    recipient: phone,
    body: reqText("Saturs ir obligāts"),
  }),
  manual_whatsapp: z.object({
    recipient: phone,
    body: reqText("Saturs ir obligāts"),
  }),
  // Workflow / internal types — no required channel payload.
  draw_sketches: z.object({}).passthrough(),
  estimate: z.object({}).passthrough(),
  prepare_offer: z.object({}).passthrough(),
};

export function isKnownTaskType(key: string): key is TaskTypeKey {
  return (TASK_TYPE_KEYS as readonly string[]).includes(key);
}

// ---------- legacy label fallback (for /uzdevumi list rendering) ----------
export const legacyTaskTypeLabels: Record<string, string> = {
  follow_up: "Sekošana",
  email: "E-pasts",
  call: "Zvans",
  review: "Pārskats",
  custom: "Cits",
  other: "Cits",
};
