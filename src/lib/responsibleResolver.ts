/**
 * Frontend-only resolver for the "Atbildīgais" column in /leadi.
 *
 * Source of truth: crm.v_next_action_queue (action_type + assigned_user_id).
 * No backend resolver, no DB changes.
 *
 * Auto group (→ "SIS"):
 *   - email_send
 *   - sms_send
 *   - whatsapp_send
 *   - any action_type starting with system_*
 *   - any action_type starting with auto_*
 *
 * Manual + assigned_user_id → raw user ID.
 * Otherwise → "-".
 *
 * Pending: full action_type taxonomy must come from Supabase business layer.
 */
const AUTO_EXACT = new Set(["email_send", "sms_send", "whatsapp_send"]);

export function isAutoActionType(t: string | null | undefined): boolean {
  if (!t) return false;
  const v = String(t).toLowerCase().trim();
  if (!v) return false;
  if (AUTO_EXACT.has(v)) return true;
  return v.startsWith("system_") || v.startsWith("auto_");
}

export function resolveResponsible(
  actionType: string | null | undefined,
  assignedUserId: string | null | undefined,
): string {
  if (isAutoActionType(actionType)) return "SIS";
  const uid = String(assignedUserId ?? "").trim();
  if (uid) return uid;
  return "-";
}