// Frontend translation of known crm.* RPC error codes raised by RAISE EXCEPTION.
// Backend message strings are surfaced by callCrmRpc verbatim (e.g.
// "Neizdevās izsaukt crm.rpc_complete_task (400): { ... WORKFLOW_PREVIOUS_STEP_NOT_COMPLETED ... }"),
// so we match by substring of the canonical code.

const CRM_ERROR_MESSAGES_LV: Record<string, string> = {
  WORKFLOW_PREVIOUS_STEP_NOT_COMPLETED:
    "Vispirms jāpabeidz iepriekšējais procesa solis.",
};

export function formatCrmError(input: unknown): string {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof Error
        ? input.message
        : "";
  if (!raw) return "Nezināma kļūda";
  for (const [code, lv] of Object.entries(CRM_ERROR_MESSAGES_LV)) {
    if (raw.includes(code)) return lv;
  }
  return raw;
}