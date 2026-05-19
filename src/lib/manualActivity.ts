export type ManualKind = "note" | "call" | "meeting";

export const MANUAL_KIND_LABELS: Record<ManualKind, string> = {
  note: "Piezīme",
  call: "Zvans",
  meeting: "Tikšanās",
};

export const MANUAL_KIND_ORDER: ManualKind[] = ["note", "call", "meeting"];

export const SUMMARY_MAX = 1000;

export interface ManualActivityInput {
  kind: ManualKind;
  activityAt: string; // ISO
  summary: string;
  outcome?: string | null;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export function validateManualActivity(input: ManualActivityInput): ValidationResult {
  const summary = (input.summary ?? "").trim();
  if (!summary) return { ok: false, error: "Apraksts ir obligāts" };
  if (summary.length > SUMMARY_MAX) {
    return { ok: false, error: `Apraksts nedrīkst pārsniegt ${SUMMARY_MAX} rakstzīmes` };
  }
  if (!input.activityAt) return { ok: false, error: "Datums ir obligāts" };
  if (Number.isNaN(new Date(input.activityAt).getTime())) {
    return { ok: false, error: "Nederīgs datums" };
  }
  if (!MANUAL_KIND_ORDER.includes(input.kind)) {
    return { ok: false, error: "Nederīgs darbības veids" };
  }
  return { ok: true };
}

/** Build params for crm.rpc_log_activity. */
export function buildLogActivityParams(args: {
  leadId: string;
  performedByUserId: string | null;
  input: ManualActivityInput;
}): Record<string, unknown> {
  const summary = args.input.summary.trim().slice(0, SUMMARY_MAX);
  const outcome = args.input.outcome?.trim() || null;
  return {
    p_lead_id: args.leadId,
    p_activity_type: "manual_update",
    p_activity_at: args.input.activityAt,
    p_summary: summary,
    p_performed_by_user_id: args.performedByUserId,
    p_outcome_code: outcome,
    p_metadata: {
      source: "manual",
      manual_kind: args.input.kind,
    },
  };
}