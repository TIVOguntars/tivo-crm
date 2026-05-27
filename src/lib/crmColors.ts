/**
 * Centralized TIVO color token resolver.
 *
 * All CRM status / type / priority badges should resolve their color via
 * this helper instead of hardcoding tailwind color classes per component.
 *
 * Tones map to the soft surface + accent text pair defined in
 * src/styles.css ( --tivo-{name}-soft / --tivo-{name} ).
 */

export type TivoTone =
  | "navy"
  | "red"
  | "coral"
  | "orange"
  | "olive"
  | "green"
  | "teal"
  | "blue"
  | "purple"
  | "muted";

const TONE_CLASSES: Record<TivoTone, { bg: string; text: string; border: string }> = {
  navy:   { bg: "bg-[var(--tivo-navy-soft)]",   text: "text-[var(--tivo-navy)]",   border: "border-[var(--tivo-navy-border)]" },
  red:    { bg: "bg-[var(--tivo-red-soft)]",    text: "text-[var(--tivo-red)]",    border: "border-[var(--tivo-red-border)]" },
  coral:  { bg: "bg-[var(--tivo-coral-soft)]",  text: "text-[var(--tivo-coral)]",  border: "border-[var(--tivo-red-border)]" },
  orange: { bg: "bg-[var(--tivo-orange-soft)]", text: "text-[var(--tivo-orange)]", border: "border-[var(--tivo-orange-border)]" },
  olive:  { bg: "bg-[var(--tivo-olive-soft)]",  text: "text-[var(--tivo-olive)]",  border: "border-[var(--tivo-orange-border)]" },
  green:  { bg: "bg-[var(--tivo-green-soft)]",  text: "text-[var(--tivo-green)]",  border: "border-[var(--tivo-green-border)]" },
  teal:   { bg: "bg-[var(--tivo-teal-soft)]",   text: "text-[var(--tivo-teal)]",   border: "border-[var(--tivo-teal-border)]" },
  blue:   { bg: "bg-[var(--tivo-blue-soft)]",   text: "text-[var(--tivo-blue)]",   border: "border-[var(--tivo-blue-border)]" },
  purple: { bg: "bg-[var(--tivo-purple-soft)]", text: "text-[var(--tivo-purple)]", border: "border-[var(--tivo-purple-border)]" },
  muted:  { bg: "bg-[var(--crm-muted)]",        text: "text-[var(--crm-text-muted)]", border: "border-[var(--crm-border)]" },
};

export function toneClasses(tone: TivoTone) {
  return TONE_CLASSES[tone];
}

export type CrmColorKind =
  | "leadStatus"
  | "objectStatus"
  | "taskPriority"
  | "taskType"
  | "taskDeadline"
  | "activity"
  | "commResult"
  | "importReview"
  | "userColor";

const norm = (v: string) => v.toLowerCase().trim();

const LEAD_STATUS: Record<string, TivoTone> = {
  jauns: "blue",
  "piesaistīšana": "teal",
  piesaistisana: "teal",
  nesasniedzams: "orange",
  atlikts: "orange",
  "kvalificēts": "green",
  kvalificets: "green",
  "kvalificējas": "green",
  kvalificejas: "green",
  "nekvalificējas": "red",
  nekvalificejas: "red",
  "nekvalificēts": "red",
  atcelts: "red",
  pabeigts: "green",
};

const OBJECT_STATUS: Record<string, TivoTone> = {
  "pieprasījums": "blue",
  pieprasijums: "blue",
  "piedāvājums": "teal",
  piedavajums: "teal",
  "līgums": "green",
  ligums: "green",
  atlikts: "orange",
  atcelts: "red",
};

const TASK_PRIORITY: Record<string, TivoTone> = {
  low: "blue", zema: "blue", "zemā": "blue",
  medium: "orange", vid: "orange", "vidēja": "orange", videja: "orange",
  high: "red", augsta: "red", "augstā": "red",
};

const TASK_TYPE: Record<string, TivoTone> = {
  call: "teal", zvans: "teal", phone: "teal",
  email: "blue", "e-pasts": "blue", epasts: "blue", mail: "blue",
  sms: "purple",
  whatsapp: "green", wa: "green",
  meeting: "orange", "tikšanās": "orange", tiksanas: "orange",
  estimate: "olive", "tāme": "olive", tame: "olive",
  offer: "navy", "piedāvājums": "navy", piedavajums: "navy",
  sis: "muted", system: "muted", automation: "muted",
};

const ACTIVITY: Record<string, TivoTone> = {
  note: "muted",
  call: "teal", call_in: "teal", call_out: "teal",
  email: "blue", email_in: "blue", email_out: "blue",
  sms: "purple", sms_in: "purple", sms_out: "purple",
  whatsapp: "green", whatsapp_in: "green", whatsapp_out: "green",
  meeting: "orange",
  estimate: "olive",
  offer: "navy",
  contract: "green",
  system: "muted", automation: "muted", audit: "muted", workflow: "purple",
  error: "red",
  other: "muted",
  task: "muted",
};

const COMM_RESULT: Record<string, TivoTone> = {
  reply: "green",
  click: "teal",
  sent: "blue",
  delivered: "blue",
  failed: "red",
  unsubscribed: "red",
  bounced: "orange",
};

const IMPORT_REVIEW: Record<string, TivoTone> = {
  pending_review: "orange", pending: "orange",
  approved: "green",
  rejected: "red",
  conflict: "red",
  applied: "teal",
};

const USER_COLOR: Record<string, TivoTone> = {
  navy: "navy", red: "red", coral: "coral", orange: "orange",
  olive: "olive", green: "green", teal: "teal", blue: "blue", purple: "purple",
};

const KIND_MAPS: Record<CrmColorKind, Record<string, TivoTone>> = {
  leadStatus: LEAD_STATUS,
  objectStatus: OBJECT_STATUS,
  taskPriority: TASK_PRIORITY,
  taskType: TASK_TYPE,
  taskDeadline: {}, // handled by deadlineTone()
  activity: ACTIVITY,
  commResult: COMM_RESULT,
  importReview: IMPORT_REVIEW,
  userColor: USER_COLOR,
};

export function getCrmColorToken(
  kind: CrmColorKind,
  value: string | null | undefined,
) {
  const key = value ? norm(value) : "";
  const tone: TivoTone = KIND_MAPS[kind][key] ?? "muted";
  const cls = TONE_CLASSES[tone];
  return {
    tone,
    className: `${cls.bg} ${cls.text}`,
    classNameWithBorder: `${cls.bg} ${cls.text} border ${cls.border}`,
    bg: cls.bg,
    text: cls.text,
    border: cls.border,
    label: value ?? "",
  };
}

/**
 * Deadline tone: compares due date to today.
 * - overdue → red
 * - today → orange
 * - within 2 days → olive
 * - future → blue
 * - completed → green
 * - none → muted
 */
export function deadlineTone(opts: {
  dueAt?: string | Date | null;
  completed?: boolean;
  now?: Date;
}): TivoTone {
  if (opts.completed) return "green";
  if (!opts.dueAt) return "muted";
  const now = opts.now ?? new Date();
  const due = new Date(opts.dueAt);
  if (Number.isNaN(due.getTime())) return "muted";
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now).getTime();
  const dueDay = startOfDay(due).getTime();
  const diffDays = Math.round((dueDay - today) / 86400000);
  if (diffDays < 0) return "red";
  if (diffDays === 0) return "orange";
  if (diffDays <= 2) return "olive";
  return "blue";
}