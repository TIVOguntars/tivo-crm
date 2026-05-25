/**
 * Frontend-only tone palette for the Aktivitāte column in /leadi.
 * Values are NOT changed — only visual differentiation:
 *   - email / sms / whatsapp / call are visually distinct
 *   - inbound = cooler tone
 *   - outbound = warmer tone
 *   - unread reply = emphasised badge
 */
export type CommChannel = "email" | "sms" | "whatsapp" | "call" | "other";
export type CommDirection = "inbound" | "outbound" | "unknown";

export function detectChannel(
  label: string | null | undefined,
): CommChannel {
  const v = String(label ?? "").toLowerCase();
  if (!v) return "other";
  if (/whats|wa\b/.test(v)) return "whatsapp";
  if (/\bsms\b/.test(v)) return "sms";
  if (/e-?pasts|email|e-?mail|mail/.test(v)) return "email";
  if (/zvan|call|tel/.test(v)) return "call";
  return "other";
}

/**
 * Direction is inferred from the picked timestamp ordering used in the
 * Aktivitāte column:
 *   last_reply_at | last_inbound_at  -> inbound (cooler)
 *   last_outbound_at                 -> outbound (warmer)
 *   last_communication_at            -> unknown (neutral)
 */
export function directionFromTimestampSource(
  source: "reply" | "inbound" | "outbound" | "communication" | null,
): CommDirection {
  if (source === "reply" || source === "inbound") return "inbound";
  if (source === "outbound") return "outbound";
  return "unknown";
}

export const CHANNEL_DIRECTION_TONE: Record<
  CommChannel,
  Record<CommDirection, string>
> = {
  email: {
    inbound: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
    outbound: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
    unknown: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
  },
  sms: {
    inbound: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
    outbound: "bg-orange-50 text-orange-800 ring-1 ring-orange-200",
    unknown: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
  },
  whatsapp: {
    inbound: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    outbound: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
    unknown: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  },
  call: {
    inbound: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
    outbound: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
    unknown: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  },
  other: {
    inbound: "bg-muted text-foreground ring-1 ring-border",
    outbound: "bg-muted text-foreground ring-1 ring-border",
    unknown: "bg-muted text-foreground ring-1 ring-border",
  },
};

/** Emphasised badge for has_unread_reply = true. */
export const UNREAD_REPLY_TONE =
  "bg-rose-100 text-rose-700 ring-1 ring-rose-300";