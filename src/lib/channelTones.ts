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
    inbound: "bg-[var(--tivo-blue-soft)] text-[var(--tivo-blue)] ring-1 ring-[var(--tivo-blue-border)]",
    outbound: "bg-[var(--tivo-navy-soft)] text-[var(--tivo-navy)] ring-1 ring-[var(--tivo-navy-border)]",
    unknown: "bg-[var(--tivo-blue-soft)] text-[var(--tivo-blue)] ring-1 ring-[var(--tivo-blue-border)]",
  },
  sms: {
    inbound: "bg-[var(--tivo-purple-soft)] text-[var(--tivo-purple)] ring-1 ring-[var(--tivo-purple-border)]",
    outbound: "bg-[var(--tivo-purple-soft)] text-[var(--tivo-purple)] ring-1 ring-[var(--tivo-purple-border)]",
    unknown: "bg-[var(--tivo-purple-soft)] text-[var(--tivo-purple)] ring-1 ring-[var(--tivo-purple-border)]",
  },
  whatsapp: {
    inbound: "bg-[var(--tivo-green-soft)] text-[var(--tivo-green)] ring-1 ring-[var(--tivo-green-border)]",
    outbound: "bg-[var(--tivo-green-soft)] text-[var(--tivo-green)] ring-1 ring-[var(--tivo-green-border)]",
    unknown: "bg-[var(--tivo-green-soft)] text-[var(--tivo-green)] ring-1 ring-[var(--tivo-green-border)]",
  },
  call: {
    inbound: "bg-[var(--tivo-teal-soft)] text-[var(--tivo-teal)] ring-1 ring-[var(--tivo-teal-border)]",
    outbound: "bg-[var(--tivo-teal-soft)] text-[var(--tivo-teal)] ring-1 ring-[var(--tivo-teal-border)]",
    unknown: "bg-[var(--tivo-teal-soft)] text-[var(--tivo-teal)] ring-1 ring-[var(--tivo-teal-border)]",
  },
  other: {
    inbound: "bg-muted text-foreground ring-1 ring-border",
    outbound: "bg-muted text-foreground ring-1 ring-border",
    unknown: "bg-muted text-foreground ring-1 ring-border",
  },
};

/** Emphasised badge for has_unread_reply = true. */
export const UNREAD_REPLY_TONE =
  "bg-[var(--tivo-red-soft)] text-[var(--tivo-red)] ring-1 ring-[var(--tivo-red-border)]";