import { CheckCircle2, Circle, CircleDot, Copy, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import type { WorkflowTaskRow } from "@/lib/workflow";
import { useUserMap } from "@/hooks/useUsers";

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("lv-LV", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

const STEP_ORDER: Record<string, number> = {
  draw_sketches: 1,
  estimate: 2,
  prepare_offer: 3,
};
const STEP_LABEL: Record<string, string> = {
  draw_sketches: "Zīmēt skices",
  estimate: "Tāmēšana",
  prepare_offer: "Piedāvājuma sagatavošana",
};

function metaRecord(t: WorkflowTaskRow): Record<string, unknown> | null {
  return t.metadata && typeof t.metadata === "object" && !Array.isArray(t.metadata)
    ? (t.metadata as Record<string, unknown>)
    : null;
}

/**
 * Renders one "Piedāvājuma sagatavošana" group — 3 real crm.tasks linked by
 * a shared metadata.workflow_group_id. Each row shows status, owner, due
 * date (date-only) and a link to the task.
 */
export function WorkflowPlanCard({ tasks }: { tasks: WorkflowTaskRow[] }) {
  if (!tasks.length) return null;
  return <WorkflowPlanCardInner tasks={tasks} />;
}

function WorkflowPlanCardInner({ tasks }: { tasks: WorkflowTaskRow[] }) {
  const { resolve } = useUserMap();
  const sorted = [...tasks].sort((a, b) => {
    const am = metaRecord(a);
    const bm = metaRecord(b);
    const ar =
      (typeof am?.workflow_step === "number" ? (am.workflow_step as number) : null) ??
      STEP_ORDER[a.task_type ?? ""] ??
      99;
    const br =
      (typeof bm?.workflow_step === "number" ? (bm.workflow_step as number) : null) ??
      STEP_ORDER[b.task_type ?? ""] ??
      99;
    return ar - br;
  });

  const first = sorted[0];
  const firstMeta = metaRecord(first);
  const groupTitle =
    (firstMeta && typeof firstMeta.workflow_group_title === "string"
      ? firstMeta.workflow_group_title
      : null) || "Piedāvājuma sagatavošana";
  const folder =
    firstMeta && typeof firstMeta.server_folder_url === "string"
      ? firstMeta.server_folder_url
      : null;

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">
            {groupTitle}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Sagatavošanas process — {sorted.length} soļi
          </div>
        </div>
        {folder && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(folder);
              toast.success("Adrese nokopēta");
            }}
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-background/80 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            title={folder}
          >
            <Copy className="h-3 w-3" />
            Kopēt adresi
          </button>
        )}
      </div>

      <ol className="space-y-1">
        {(() => {
          const currentIdx = sorted.findIndex((t) => {
            const s = (t.status ?? "").toLowerCase();
            return s !== "completed" && s !== "skipped" && s !== "cancelled";
          });
          return sorted.map((t, idx) => {
          const meta = metaRecord(t);
          const label =
            (meta && typeof meta.workflow_step_label === "string"
              ? meta.workflow_step_label
              : null) ||
            STEP_LABEL[t.task_type ?? ""] ||
            t.title ||
            t.task_type ||
            "—";
          const status = (t.status ?? "").toLowerCase();
          const done = status === "completed" || status === "skipped";
          const isCurrent = !done && idx === currentIdx;
          const ownerCode =
            (meta && typeof meta.owner_code === "string" ? meta.owner_code : null) ??
            t.assigned_user_id ??
            "—";
          return (
            <li
              key={t.id}
              className={
                "grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-2 rounded-sm px-2 py-1.5 " +
                (isCurrent
                  ? "bg-primary/10 ring-1 ring-primary/40"
                  : "bg-background/60")
              }
            >
              {done ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-foreground" />
              ) : isCurrent ? (
                <CircleDot className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <div
                  className={
                    "text-xs font-medium truncate " +
                    (done
                      ? "text-muted-foreground line-through"
                      : isCurrent
                        ? "text-foreground font-semibold"
                        : "text-foreground")
                  }
                >
                  {label}
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                {ownerCode}
              </div>
              <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                {fmtDate(t.due_at)}
              </div>
              {t.lead_id ? (
                <Link
                  to="/lead/$leadId"
                  params={{ leadId: t.lead_id }}
                  hash={`task-${t.id}`}
                  className="text-muted-foreground hover:text-foreground"
                  title="Atvērt uzdevumu"
                >
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ) : (
                <span />
              )}
            </li>
          );
          });
        })()}
      </ol>
    </div>
  );
}