// Frontend-only translation layer for crm.v_unified_timeline rows.
// Never modifies backend event structure. Unknown codes fall back to a
// humanized version so operators never see raw snake_case.

function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function humanize(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const spaced = t.replace(/[_-]+/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const RECORD_SOURCE_LV: Record<string, string> = {
  activity: "Darbība",
  audit_event: "Audita ieraksts",
  automation: "Automātika",
  workflow: "Process",
  task: "Uzdevums",
  communication: "Komunikācija",
  note: "Piezīme",
  milestone: "Atskaites punkts",
  lead: "Leads",
};

export const EVENT_TYPE_LV: Record<string, string> = {
  email_plan_generated: "Automātiski sagatavots e-pasts",
  email_sent: "E-pasts nosūtīts",
  email_delivered: "E-pasts piegādāts",
  email_replied: "Saņemta atbilde",
  email_bounced: "E-pasts atgriezts",
  email_opened: "E-pasts atvērts",
  email_clicked: "Spiests links",
  sms_sent: "SMS nosūtīts",
  whatsapp_sent: "WhatsApp nosūtīts",
  call_completed: "Zvans pabeigts",
  call_no_answer: "Zvans — neatbild",
  zoom_completed: "Tikšanās notika",
  task_created: "Uzdevums izveidots",
  task_completed: "Uzdevums pabeigts",
  task_cancelled: "Uzdevums atcelts",
  task_rescheduled: "Uzdevums pārcelts",
  workflow_started: "Process uzsākts",
  workflow_step_completed: "Procesa solis pabeigts",
  workflow_completed: "Process pabeigts",
  status_changed: "Statuss mainīts",
  owner_changed: "Atbildīgais mainīts",
  note_added: "Pievienota piezīme",
  create_lead: "Leads izveidots",
  lead_created: "Leads izveidots",
  lead_imported: "Leads importēts",
};

export function labelRecordSource(raw: string): string {
  if (!raw) return "";
  return RECORD_SOURCE_LV[normalize(raw)] ?? humanize(raw);
}

export function labelEventType(raw: string): string {
  if (!raw) return "";
  return EVENT_TYPE_LV[normalize(raw)] ?? humanize(raw);
}