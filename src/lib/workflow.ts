// Frontend-only workflow helpers (Phase 2b.2b MVP).
// Reads metadata.workflow envelopes written by rpc_create_task /
// rpc_spawn_next_workflow_task. Pure functions, no I/O.

export interface WorkflowMetadata {
  template_key: string;
  step: number;
  server_folder_url?: string | null;
}

export type WorkflowStatus = "completed" | "current" | "future";

export interface WorkflowTaskRow {
  id: string;
  lead_id?: string | null;
  workflow_instance_id?: string | null;
  task_type?: string | null;
  title?: string | null;
  status?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  assigned_user_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * Extract { template_key, step } from a task row's metadata.workflow.
 * Returns null when missing or malformed (step not numeric, template empty).
 */
export function parseWorkflowMetadata(
  metadata: unknown,
): WorkflowMetadata | null {
  const meta = asRecord(metadata);
  if (!meta) return null;
  const wf = asRecord(meta.workflow);
  if (!wf) return null;
  const template_key = typeof wf.template_key === "string" ? wf.template_key.trim() : "";
  const stepRaw = wf.step;
  const step =
    typeof stepRaw === "number"
      ? stepRaw
      : typeof stepRaw === "string"
        ? Number(stepRaw)
        : NaN;
  if (!template_key || !Number.isFinite(step) || step <= 0) return null;
  const sfu = typeof meta.server_folder_url === "string" ? meta.server_folder_url : null;
  return { template_key, step, server_folder_url: sfu };
}

/**
 * Map a task's raw status + step position into a visual lane:
 * - completed: status completed/skipped
 * - current:   the lowest step whose status is open (planned/in_progress/blocked/queued)
 * - future:    any other not-completed step above current
 * Cancelled tasks are filtered upstream (see deriveWorkflowChain).
 */
export function deriveWorkflowStatus(
  task: WorkflowTaskRow,
  isCurrent: boolean,
): WorkflowStatus {
  const s = (task.status ?? "").toLowerCase();
  if (s === "completed" || s === "skipped") return "completed";
  if (isCurrent) return "current";
  return "future";
}

export interface WorkflowChainEntry {
  task: WorkflowTaskRow;
  step: number;
  template_key: string;
  status: WorkflowStatus;
}

/**
 * Sort tasks belonging to a single workflow_instance_id by step and decorate
 * each with a visual status lane. Cancelled tasks are dropped.
 */
export function deriveWorkflowChain(
  tasks: WorkflowTaskRow[],
): WorkflowChainEntry[] {
  const parsed = tasks
    .map((t) => {
      const wf = parseWorkflowMetadata(t.metadata);
      return wf ? { t, wf } : null;
    })
    .filter((x): x is { t: WorkflowTaskRow; wf: WorkflowMetadata } => !!x)
    .filter(({ t }) => (t.status ?? "").toLowerCase() !== "cancelled")
    .sort((a, b) => a.wf.step - b.wf.step);

  const currentIdx = parsed.findIndex(({ t }) => {
    const s = (t.status ?? "").toLowerCase();
    return s !== "completed" && s !== "skipped";
  });

  return parsed.map(({ t, wf }, i) => ({
    task: t,
    step: wf.step,
    template_key: wf.template_key,
    status: deriveWorkflowStatus(t, i === currentIdx),
  }));
}

/** Group an arbitrary task list by workflow_instance_id (skips null). */
export function groupTasksByWorkflowInstance(
  tasks: WorkflowTaskRow[],
): Map<string, WorkflowTaskRow[]> {
  const m = new Map<string, WorkflowTaskRow[]>();
  for (const t of tasks) {
    const id = t.workflow_instance_id;
    if (!id) continue;
    const list = m.get(id);
    if (list) list.push(t);
    else m.set(id, [t]);
  }
  return m;
}