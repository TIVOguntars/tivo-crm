// Frontend UX helper only. The server (crm.rpc_complete_task) is the source
// of truth for which outcome_code values are valid per task_type, and will
// raise INVALID_OUTCOME_CODE / OUTCOME_NOT_ALLOWED_FOR_TASK_TYPE if a chosen
// value is not accepted. This list exists purely to populate the Select.

export interface OutcomeOption {
  code: string;
  label_lv: string;
}

const GENERIC: OutcomeOption[] = [
  { code: "completed", label_lv: "Pabeigts" },
  { code: "no_answer", label_lv: "Neatbild" },
  { code: "not_interested", label_lv: "Neinteresē" },
  { code: "rescheduled_by_client", label_lv: "Klients pārcēla" },
  { code: "won", label_lv: "Iegūts" },
  { code: "lost", label_lv: "Zaudēts" },
];

const BY_TYPE: Record<string, OutcomeOption[]> = {
  call: [
    { code: "answered", label_lv: "Atbildēja" },
    { code: "no_answer", label_lv: "Neatbild" },
    { code: "voicemail", label_lv: "Atstāta ziņa" },
    { code: "wrong_number", label_lv: "Nepareizs numurs" },
    { code: "not_interested", label_lv: "Neinteresē" },
    { code: "rescheduled_by_client", label_lv: "Klients pārcēla" },
    { code: "completed", label_lv: "Pabeigts" },
  ],
  manual_email: [
    { code: "sent", label_lv: "Nosūtīts" },
    { code: "no_reply", label_lv: "Bez atbildes" },
    { code: "replied", label_lv: "Atbildēja" },
    { code: "bounced", label_lv: "Atgriezts" },
    { code: "completed", label_lv: "Pabeigts" },
  ],
  manual_sms: [
    { code: "sent", label_lv: "Nosūtīts" },
    { code: "no_reply", label_lv: "Bez atbildes" },
    { code: "replied", label_lv: "Atbildēja" },
    { code: "completed", label_lv: "Pabeigts" },
  ],
  manual_whatsapp: [
    { code: "sent", label_lv: "Nosūtīts" },
    { code: "no_reply", label_lv: "Bez atbildes" },
    { code: "replied", label_lv: "Atbildēja" },
    { code: "completed", label_lv: "Pabeigts" },
  ],
  zoom: [
    { code: "completed", label_lv: "Notika" },
    { code: "no_show", label_lv: "Klients neieradās" },
    { code: "rescheduled_by_client", label_lv: "Klients pārcēla" },
  ],
  draw_sketches: [
    { code: "completed", label_lv: "Pabeigts" },
    { code: "blocked", label_lv: "Bloķēts" },
  ],
  estimate: [
    { code: "completed", label_lv: "Pabeigts" },
    { code: "blocked", label_lv: "Bloķēts" },
  ],
  prepare_offer: [
    { code: "completed", label_lv: "Pabeigts" },
    { code: "blocked", label_lv: "Bloķēts" },
  ],
};

export function outcomesForTaskType(taskType?: string | null): OutcomeOption[] {
  if (!taskType) return GENERIC;
  return BY_TYPE[taskType] ?? GENERIC;
}

// Derive a default p_activity_type from task_type when known. Returning null
// lets the server pick its own default — safer than guessing an invalid code.
export function activityTypeFor(taskType?: string | null): string | null {
  if (!taskType) return null;
  const t = taskType.toLowerCase();
  if (t.includes("email") || t.includes("mail")) return "email";
  if (t === "call" || t.includes("call")) return "call";
  if (t.includes("sms")) return "sms";
  if (t.includes("whatsapp")) return "whatsapp";
  if (t === "zoom" || t.includes("meeting")) return "meeting";
  if (t === "draw_sketches" || t === "estimate" || t === "prepare_offer") {
    return "workflow_step";
  }
  return null;
}