import {
  Activity,
  AlertTriangle,
  CheckSquare,
  Mail,
  MessageSquare,
  Phone,
  StickyNote,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type ActivityKind =
  | "email_in"
  | "email_out"
  | "call_in"
  | "call_out"
  | "sms_in"
  | "sms_out"
  | "whatsapp_in"
  | "whatsapp_out"
  | "note"
  | "task"
  | "workflow"
  | "automation"
  | "audit"
  | "error"
  | "other";

export interface ActivityStyle {
  bg: string;
  accent: string;
  Icon: LucideIcon;
}

const IN_ACCENT = "border-l-[var(--tivo-green)]";
const OUT_ACCENT = "border-l-[var(--tivo-blue)]";

const STYLES: Record<ActivityKind, ActivityStyle> = {
  email_in: {
    bg: "bg-[var(--tivo-blue-soft)]",
    accent: IN_ACCENT,
    Icon: Mail,
  },
  email_out: {
    bg: "bg-[var(--tivo-blue-soft)]",
    accent: OUT_ACCENT,
    Icon: Mail,
  },
  call_in: {
    bg: "bg-[var(--tivo-teal-soft)]",
    accent: IN_ACCENT,
    Icon: Phone,
  },
  call_out: {
    bg: "bg-[var(--tivo-teal-soft)]",
    accent: OUT_ACCENT,
    Icon: Phone,
  },
  sms_in: {
    bg: "bg-[var(--tivo-purple-soft)]",
    accent: IN_ACCENT,
    Icon: MessageSquare,
  },
  sms_out: {
    bg: "bg-[var(--tivo-purple-soft)]",
    accent: OUT_ACCENT,
    Icon: MessageSquare,
  },
  whatsapp_in: {
    bg: "bg-[var(--tivo-green-soft)]",
    accent: IN_ACCENT,
    Icon: MessageSquare,
  },
  whatsapp_out: {
    bg: "bg-[var(--tivo-green-soft)]",
    accent: OUT_ACCENT,
    Icon: MessageSquare,
  },
  note: {
    bg: "bg-[var(--crm-muted)]",
    accent: "border-l-[var(--crm-border)]",
    Icon: StickyNote,
  },
  task: {
    bg: "bg-[var(--crm-muted)]",
    accent: "border-l-[var(--crm-border)]",
    Icon: CheckSquare,
  },
  workflow: {
    bg: "bg-[var(--tivo-purple-soft)]",
    accent: "border-l-[var(--tivo-purple)]",
    Icon: Workflow,
  },
  automation: {
    bg: "bg-[var(--crm-muted)]",
    accent: "border-l-[var(--crm-border)]",
    Icon: Activity,
  },
  audit: {
    bg: "bg-[var(--crm-muted)]",
    accent: "border-l-[var(--crm-border)]",
    Icon: Activity,
  },
  error: {
    bg: "bg-[var(--tivo-red-soft)]",
    accent: "border-l-[var(--tivo-red)]",
    Icon: AlertTriangle,
  },
  other: {
    bg: "bg-[var(--crm-muted)]",
    accent: "border-l-[var(--crm-border)]",
    Icon: Activity,
  },
};

export function getActivityStyle(kind: ActivityKind): ActivityStyle {
  return STYLES[kind] ?? STYLES.other;
}