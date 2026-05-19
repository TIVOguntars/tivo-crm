import type { ActivityKind } from "./activityStyles";

export type TypeFilter =
  | "all"
  | "emails"
  | "inbound"
  | "outbound"
  | "tasks"
  | "notes"
  | "calls"
  | "sms"
  | "whatsapp"
  | "workflow"
  | "automation";

export type DateFilter =
  | "all"
  | "today"
  | "7d"
  | "30d"
  | "this_month"
  | "prev_month";

export const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Visi" },
  { value: "emails", label: "E-pasti" },
  { value: "inbound", label: "Ienākošie" },
  { value: "outbound", label: "Izejošie" },
  { value: "tasks", label: "Uzdevumi" },
  { value: "notes", label: "Piezīmes" },
  { value: "calls", label: "Zvani" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "workflow", label: "Process" },
  { value: "automation", label: "Automātika" },
];

export const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "Viss periods" },
  { value: "today", label: "Šodien" },
  { value: "7d", label: "Pēdējās 7 dienas" },
  { value: "30d", label: "Pēdējās 30 dienas" },
  { value: "this_month", label: "Šis mēnesis" },
  { value: "prev_month", label: "Iepriekšējais mēnesis" },
];

type Row = Record<string, unknown>;

function s(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v : String(v);
}

/**
 * Classify a local Lead360 timeline item (TLItem-shaped) into an ActivityKind.
 */
export function classifyLocal(item: {
  kind: "comm" | "note" | "task";
  raw: Row;
}): ActivityKind {
  const { kind, raw } = item;
  if (kind === "note") return "note";
  if (kind === "task") {
    const status = s(raw.status).toLowerCase();
    if (status === "cancelled") return "error";
    if (status === "skipped") return "note";
    const meta =
      raw.metadata && typeof raw.metadata === "object"
        ? (raw.metadata as Row)
        : undefined;
    if (meta && (s(meta.workflow_instance_id) || s(meta.workflow_id))) {
      return "workflow";
    }
    return "task";
  }
  // comm
  const ch = s(raw.channel).toLowerCase();
  const dir = s(raw.direction).toLowerCase();
  const status = s(raw.status || raw.current_status).toLowerCase();
  const inbound = dir.includes("in");
  if (["bounced", "failed", "error"].includes(status)) return "error";
  if (ch.includes("mail")) return inbound ? "email_in" : "email_out";
  if (ch.includes("phone") || ch.includes("call"))
    return inbound ? "call_in" : "call_out";
  if (ch.includes("whats")) return inbound ? "whatsapp_in" : "whatsapp_out";
  if (ch.includes("sms")) return inbound ? "sms_in" : "sms_out";
  return "other";
}

/**
 * Classify a unified-timeline row by record_source / event_type.
 */
export function classifyUnified(row: Row): ActivityKind {
  const src = s(row.record_source).toLowerCase();
  const ev = s(row.event_type).toLowerCase();
  if (src.includes("workflow") || ev.includes("workflow")) return "workflow";
  if (src.includes("audit")) return "audit";
  if (src.includes("automation") || ev.includes("automation"))
    return "automation";
  if (src.includes("task")) return "task";
  if (src.includes("note")) return "note";
  if (src.includes("communication") || ev.includes("email")) {
    const dir = s(row.direction).toLowerCase();
    return dir.includes("in") ? "email_in" : "email_out";
  }
  return "other";
}

function isInbound(item: { kind: string; raw: Row }): boolean {
  if (item.kind !== "comm") return false;
  return s(item.raw.direction).toLowerCase().includes("in");
}

function typeMatches(
  filter: TypeFilter,
  kind: ActivityKind,
  item: { kind: string; raw: Row },
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "emails":
      return kind === "email_in" || kind === "email_out";
    case "inbound":
      return (
        kind === "email_in" ||
        kind === "call_in" ||
        kind === "sms_in" ||
        kind === "whatsapp_in" ||
        isInbound(item)
      );
    case "outbound":
      return (
        kind === "email_out" ||
        kind === "call_out" ||
        kind === "sms_out" ||
        kind === "whatsapp_out" ||
        (item.kind === "comm" &&
          s(item.raw.direction).toLowerCase().includes("out"))
      );
    case "tasks":
      return kind === "task";
    case "notes":
      return kind === "note";
    case "calls":
      return kind === "call_in" || kind === "call_out";
    case "sms":
      return kind === "sms_in" || kind === "sms_out";
    case "whatsapp":
      return kind === "whatsapp_in" || kind === "whatsapp_out";
    case "workflow":
      return kind === "workflow";
    case "automation":
      return kind === "automation" || kind === "audit";
  }
}

function dateBounds(filter: DateFilter): { from: number; to: number } | null {
  if (filter === "all") return null;
  const now = new Date();
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  switch (filter) {
    case "today": {
      const from = startOfDay(now).getTime();
      return { from, to: Number.POSITIVE_INFINITY };
    }
    case "7d": {
      const from = startOfDay(now).getTime() - 6 * 24 * 60 * 60 * 1000;
      return { from, to: Number.POSITIVE_INFINITY };
    }
    case "30d": {
      const from = startOfDay(now).getTime() - 29 * 24 * 60 * 60 * 1000;
      return { from, to: Number.POSITIVE_INFINITY };
    }
    case "this_month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return { from, to: Number.POSITIVE_INFINITY };
    }
    case "prev_month": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      const to = new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1;
      return { from, to };
    }
  }
}

export interface FilterState {
  type: TypeFilter;
  date: DateFilter;
}

export function filterLocalTimeline<
  T extends { kind: "comm" | "note" | "task"; ts: number; raw: Row },
>(items: T[], state: FilterState): T[] {
  const bounds = dateBounds(state.date);
  return items.filter((it) => {
    if (bounds && (it.ts < bounds.from || it.ts > bounds.to)) return false;
    const kind = classifyLocal(it);
    return typeMatches(state.type, kind, it);
  });
}