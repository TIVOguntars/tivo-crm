import { STATUS_STYLES, STATUS_BASE_CLASS } from "@/design/status-system";

type StatusKey = keyof typeof STATUS_STYLES;

export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const normalizedStatus = status.toLowerCase().trim() as StatusKey;
  const style = STATUS_STYLES[normalizedStatus] || STATUS_STYLES.default;
  return (
    <span className={`${STATUS_BASE_CLASS} ${style.bg} ${style.text}`}>
      {status}
    </span>
  );
}

export default StatusBadge;
