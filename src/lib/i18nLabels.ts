// Centralized Latvian label maps for backend codes (statuses, channels,
// directions). Pure data + tiny helper. No backend impact.

export const TASK_STATUS_LV: Record<string, string> = {
  pending: "Gaida",
  in_progress: "Notiek",
  completed: "Pabeigts",
  cancelled: "Atcelts",
  skipped: "Izlaists",
  blocked: "Bloķēts",
  failed: "Kļūda",
  scheduled: "Plānots",
};

export const QUEUE_STATUS_LV: Record<string, string> = {
  queued: "Plānots",
  sending: "Sūta",
  sent: "Nosūtīts",
  delivered: "Piegādāts",
  failed: "Kļūda",
  blocked: "Bloķēts",
  cancelled: "Atcelts",
  bounced: "Atgriezts",
};

export const COMM_STATUS_LV: Record<string, string> = {
  created: "Izveidots",
  queued: "Plānots",
  sending: "Sūta",
  sent: "Nosūtīts",
  delivered: "Piegādāts",
  failed: "Kļūda",
  bounced: "Atgriezts",
  opened: "Atvērts",
  clicked: "Spiests",
  replied: "Atbildēts",
};

export const DIRECTION_LV: Record<string, string> = {
  inbound: "Ienākošs",
  outbound: "Izejošs",
};

export const CHANNEL_LV: Record<string, string> = {
  email: "E-pasts",
  sms: "SMS",
  whatsapp: "WhatsApp",
  call: "Zvans",
  zoom: "Zoom",
};

export function lv(
  map: Record<string, string>,
  raw: string | null | undefined,
  fallback?: string,
): string {
  if (!raw) return fallback ?? "";
  const key = raw.toLowerCase().trim();
  return map[key] ?? fallback ?? raw;
}