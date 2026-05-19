import { CheckCircle2, Circle, Clock, CircleDashed } from "lucide-react";
import {
  buildWorkflowChain,
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
 * Compact read-only vertical timeline of workflow steps that share a
 * workflow_instance_id. Pure presentational; takes already-loaded tasks.
 * Renders the full template (e.g. 3 steps of object_preparation_v1) so the
 * process reads as one whole even before later tasks are spawned.
 */
export function WorkflowChainStrip({
  tasks,
  title,
}: {
  tasks: WorkflowTaskRow[];
  title?: string;
}) {
  const { template, slots } = buildWorkflowChain(tasks);
  if (slots.length === 0) return null;
  const headerTitle = title ?? (template ? template.title_lv : "Workflow");

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground tracking-wide uppercase">
        {headerTitle}
      </div>
      <ol className="space-y-2">
        {slots.map((entry, idx) => {
          const isLast = idx === slots.length - 1;
          const tone =
            entry.status === "completed"
              ? "text-foreground"
              : entry.status === "current"
                ? "text-primary"
                : entry.status === "pending"
                  ? "text-muted-foreground/70"
                  : "text-muted-foreground";
          const Icon =
            entry.status === "completed"
              ? CheckCircle2
              : entry.status === "current"
                ? Clock
                : entry.status === "pending"
                  ? CircleDashed
                  : Circle;
          const owner = entry.task?.assigned_user_id ?? "—";
          const due = fmtDate(entry.task?.due_at ?? null);
          const statusLabel =
            entry.status === "pending"
              ? "Vēl nav izveidots"
              : (entry.task?.status ?? "").toLowerCase() || "—";
          return (
            <li key={entry.task?.id ?? `pending-${entry.step}`} className="relative flex gap-3">
              <div className="flex flex-col items-center">
                <Icon className={`h-4 w-4 ${tone}`} />
                {!isLast && (
                  <span className="mt-1 h-full w-px flex-1 bg-border" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className={`text-sm font-medium truncate ${tone}`}>
                  {entry.step}. {entry.label_lv}
                </div>
                {entry.status === "pending" ? (
                  <div className="text-[11px] text-muted-foreground/70">
                    Vēl nav izveidots
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>Termiņš: {due}</span>
                    <span>Atb: {owner}</span>
                    <span>Statuss: {statusLabel}</span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}