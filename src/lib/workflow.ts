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

// ---------- Workflow templates (frontend-only display overlay) ----------
//
// These mirror the server-side workflow templates stored in crm.settings.
// They are used purely to render a complete 3-step process card even before
// the spawn engine has created the later tasks. No subtasks are created
// from the client.

export interface WorkflowTemplateStep {
  step: number;
  task_type: string;
  label_lv: string;
}

export interface WorkflowTemplate {
  template_key: string;
  title_lv: string;
  steps: WorkflowTemplateStep[];
}

export const WORKFLOW_TEMPLATES: Record<string, WorkflowTemplate> = {
  object_preparation_v1: {
    template_key: "object_preparation_v1",
    title_lv: "Objekta sagatavošana",
    steps: [
      { step: 1, task_type: "draw_sketches", label_lv: "Zīmēt skices" },
      { step: 2, task_type: "estimate", label_lv: "Tāmēšana" },
      { step: 3, task_type: "prepare_offer", label_lv: "Piedāvājuma sagatavošana" },
    ],
  },
};

export function getWorkflowTemplate(key: string | null | undefined): WorkflowTemplate | null {
  if (!key) return null;
  return WORKFLOW_TEMPLATES[key] ?? null;
}

export interface WorkflowChainSlot {
  step: number;
  template_key: string;
  label_lv: string;
  task: WorkflowTaskRow | null;
  status: WorkflowStatus | "pending"; // "pending" = template step not yet spawned
}

/**
 * Merge a workflow template with the actual spawned tasks for one
 * workflow_instance_id. Missing future steps become "pending" placeholders.
 * If no template matches, falls back to deriveWorkflowChain shape.
 */
export function buildWorkflowChain(
  tasks: WorkflowTaskRow[],
): { template: WorkflowTemplate | null; slots: WorkflowChainSlot[] } {
  const decoratedRaw = deriveWorkflowChain(tasks);
  const templateKey =
    decoratedRaw.find((e) => e.template_key)?.template_key ?? null;
  const template = getWorkflowTemplate(templateKey);

  if (!template) {
    // No template overlay — return raw chain mapped to slots.
    return {
      template: null,
      slots: decoratedRaw.map((e) => ({
        step: e.step,
        template_key: e.template_key,
        label_lv: e.task.title || e.task.task_type || `#${e.step}`,
        task: e.task,
        status: e.status,
      })),
    };
  }

  // Index actual chain by step.
  const byStep = new Map<number, (typeof decoratedRaw)[number]>();
  for (const e of decoratedRaw) byStep.set(e.step, e);

  return {
    template,
    slots: template.steps.map((ts) => {
      const actual = byStep.get(ts.step);
      if (actual) {
        return {
          step: ts.step,
          template_key: template.template_key,
          label_lv: actual.task.title || ts.label_lv,
          task: actual.task,
          status: actual.status,
        };
      }
      return {
        step: ts.step,
        template_key: template.template_key,
        label_lv: ts.label_lv,
        task: null,
        status: "pending" as const,
      };
    }),
  };
}