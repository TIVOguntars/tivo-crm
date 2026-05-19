import { CheckCircle2, Circle, Clock } from "lucide-react";
import {
  deriveWorkflowChain,
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

function stepLabel(templateKey: string, taskType: string | null | undefined): string {
  const tt = (taskType ?? "").trim();
  if (tt) return tt.replace(/_/g, " ");
  return templateKey;
}

/**
 * Compact read-only vertical timeline of workflow steps that share a
 * workflow_instance_id. Pure presentational; takes already-loaded tasks.
 */
export function WorkflowChainStrip({
  tasks,
  title,
}: {
  tasks: WorkflowTaskRow[];
  title?: string;
}) {
  const chain = deriveWorkflowChain(tasks);
  if (chain.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      {title && (
        <div className="mb-2 text-xs font-medium text-muted-foreground tracking-wide uppercase">
          {title}
        </div>
      )}
      <ol className="space-y-2">
        {chain.map((entry, idx) => {
          const isLast = idx === chain.length - 1;
          const tone =
            entry.status === "completed"
              ? "text-foreground"
              : entry.status === "current"
                ? "text-primary"
                : "text-muted-foreground";
          const Icon =
            entry.status === "completed"
              ? CheckCircle2
              : entry.status === "current"
                ? Clock
                : Circle;
          const owner = entry.task.assigned_user_id ?? "—";
          const due = fmtDate(entry.task.due_at);
          const statusLabel = (entry.task.status ?? "").toLowerCase();
          return (
            <li key={entry.task.id} className="relative flex gap-3">
              <div className="flex flex-col items-center">
                <Icon className={`h-4 w-4 ${tone}`} />
                {!isLast && (
                  <span className="mt-1 h-full w-px flex-1 bg-border" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className={`text-sm font-medium truncate ${tone}`}>
                  {entry.step}. {entry.task.title || stepLabel(entry.template_key, entry.task.task_type)}
                </div>
                <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>Termiņš: {due}</span>
                  <span>Atb: {owner}</span>
                  <span>Statuss: {statusLabel || "—"}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}