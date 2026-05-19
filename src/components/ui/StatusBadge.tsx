import { STATUS_STYLES, STATUS_BASE_CLASS } from "@/design/status-system";
import {
  COMM_STATUS_LV,
  QUEUE_STATUS_LV,
  TASK_STATUS_LV,
  lv,
} from "@/lib/i18nLabels";

type StatusKey = keyof typeof STATUS_STYLES;

const MAPS = {
  comm: COMM_STATUS_LV,
  task: TASK_STATUS_LV,
  queue: QUEUE_STATUS_LV,
} as const;

export function StatusBadge({
  status,
  mapKind,
}: {
  status?: string | null;
  /** Optional translation map. Default = passthrough (preserves existing
   *  behavior for already-LV lead statuses). */
  mapKind?: keyof typeof MAPS;
}) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const normalizedStatus = status.toLowerCase().trim() as StatusKey;
  const style = STATUS_STYLES[normalizedStatus] || STATUS_STYLES.default;
  const display = mapKind ? lv(MAPS[mapKind], status, status) : status;
  return (
    <span className={`${STATUS_BASE_CLASS} ${style.bg} ${style.text}`}>
      {display}
    </span>
  );
}

export default StatusBadge;
