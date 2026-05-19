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

const EMERALD_ACCENT = "border-l-emerald-500";
const BLUE_ACCENT = "border-l-blue-500";

const STYLES: Record<ActivityKind, ActivityStyle> = {
  email_in: {
    bg: "bg-blue-50 dark:bg-blue-950/20",
    accent: EMERALD_ACCENT,
    Icon: Mail,
  },
  email_out: {
    bg: "bg-blue-50 dark:bg-blue-950/20",
    accent: BLUE_ACCENT,
    Icon: Mail,
  },
  call_in: {
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    accent: EMERALD_ACCENT,
    Icon: Phone,
  },
  call_out: {
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    accent: BLUE_ACCENT,
    Icon: Phone,
  },
  sms_in: {
    bg: "bg-violet-50 dark:bg-violet-950/20",
    accent: EMERALD_ACCENT,
    Icon: MessageSquare,
  },
  sms_out: {
    bg: "bg-violet-50 dark:bg-violet-950/20",
    accent: BLUE_ACCENT,
    Icon: MessageSquare,
  },
  whatsapp_in: {
    bg: "bg-violet-50 dark:bg-violet-950/20",
    accent: EMERALD_ACCENT,
    Icon: MessageSquare,
  },
  whatsapp_out: {
    bg: "bg-violet-50 dark:bg-violet-950/20",
    accent: BLUE_ACCENT,
    Icon: MessageSquare,
  },
  note: {
    bg: "bg-amber-50 dark:bg-amber-950/20",
    accent: "border-l-amber-400",
    Icon: StickyNote,
  },
  task: {
    bg: "bg-slate-50 dark:bg-slate-900/30",
    accent: "border-l-slate-400",
    Icon: CheckSquare,
  },
  workflow: {
    bg: "bg-violet-50/60 dark:bg-violet-950/15",
    accent: "border-l-violet-500",
    Icon: Workflow,
  },
  automation: {
    bg: "bg-muted/40",
    accent: "border-l-muted-foreground/40",
    Icon: Activity,
  },
  audit: {
    bg: "bg-muted/30",
    accent: "border-l-muted-foreground/30",
    Icon: Activity,
  },
  error: {
    bg: "bg-rose-50 dark:bg-rose-950/20",
    accent: "border-l-rose-500",
    Icon: AlertTriangle,
  },
  other: {
    bg: "bg-muted/30",
    accent: "border-l-muted-foreground/40",
    Icon: Activity,
  },
};

export function getActivityStyle(kind: ActivityKind): ActivityStyle {
  return STYLES[kind] ?? STYLES.other;
}