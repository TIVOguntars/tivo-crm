import { CheckCircle2, Circle, CircleDashed, FolderOpen } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  parseWorkflowPlan,
  type WorkflowTaskRow,
} from "@/lib/workflow";

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("lv-LV", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Renders a single parent prepare_offer task as a "process card" with its
 * embedded metadata.workflow_plan steps. Read-only for now — children are
 * not spawned from this plan yet. The parent task's own status drives the
 * outer card; each step row reflects its plan entry.
 */
export function WorkflowPlanCard({ task }: { task: WorkflowTaskRow }) {
  const plan = parseWorkflowPlan(task.metadata);
  if (!plan) return null;

  const meta =
    task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
      ? (task.metadata as Record<string, unknown>)
      : null;
  const folder =
    meta && typeof meta.server_folder_url === "string" ? meta.server_folder_url : null;

  const parentStatus = (task.status ?? "").toLowerCase();
  const isDone = parentStatus === "completed" || parentStatus === "skipped";

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">
            {task.title || "Piedāvājuma sagatavošana"}
          </div>
          <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
            <span>Termiņš: {fmtDate(task.due_at)}</span>
            <span>Atb: {task.assigned_user_id ?? "—"}</span>
            <span>Statuss: {parentStatus || "—"}</span>
          </div>
        </div>
        {folder && (
          <a
            href={folder}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-background/80 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            title={folder}
          >
            <FolderOpen className="h-3 w-3" />
            Servera mape
          </a>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">
          Sagatavošanas soļi
        </div>
        <ol className="space-y-1">
          {plan.steps.map((s) => {
            const disabled = !s.enabled;
            const Icon = isDone
              ? CheckCircle2
              : disabled
                ? Circle
                : CircleDashed;
            const tone = isDone
              ? "text-foreground"
              : disabled
                ? "text-muted-foreground/60 line-through"
                : "text-muted-foreground";
            return (
              <li
                key={s.step}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-sm bg-background/60 px-2 py-1.5"
              >
                <Checkbox checked={s.enabled && isDone} disabled />
                <div className="min-w-0">
                  <div className={`text-xs font-medium truncate ${tone}`}>
                    <Icon className="mr-1 inline h-3 w-3 align-[-2px]" />
                    {s.step}. {s.label || s.task_type}
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {s.owner_id ?? "—"}
                </div>
                <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {fmtDate(s.due_at)}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="text-[10px] text-muted-foreground">
          Soļu automātiskā izveide tiks pievienota nākamajā fāzē.
        </p>
      </div>
    </div>
  );
}