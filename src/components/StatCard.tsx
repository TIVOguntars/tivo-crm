import { cn } from "@/lib/utils";

/**
 * Visual tones reused across KPI cards. Each tone maps to:
 *  - a top accent bar
 *  - a bold value color
 *  - an idle border tint
 *  - an active (selected) border + background tint
 *
 * Tones are aligned with the lead status badges and priority colors used
 * in the leads table, so users can match a card to its rows by color.
 */
export type StatCardTone =
  | "neutral"
  | "red"
  | "purple"
  | "orange"
  | "amber"
  | "yellow"
  | "blue"
  | "gray";

const TONE_STYLES: Record<
  StatCardTone,
  { bar: string; value: string; border: string; active: string }
> = {
  neutral: {
    bar: "bg-transparent",
    value: "text-foreground",
    border: "border-border",
    active: "border-primary ring-2 ring-primary/40 bg-primary/5 hover:bg-primary/10",
  },
  red: {
    bar: "bg-red-500/70",
    value: "text-foreground",
    border: "border-border",
    active:
      "border-red-500 ring-2 ring-red-500/30 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/60",
  },
  purple: {
    bar: "bg-purple-500/70",
    value: "text-foreground",
    border: "border-border",
    active:
      "border-purple-500 ring-2 ring-purple-500/30 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-950/60",
  },
  orange: {
    bar: "bg-orange-500/70",
    value: "text-foreground",
    border: "border-border",
    active:
      "border-orange-500 ring-2 ring-orange-500/30 bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/40 dark:hover:bg-orange-950/60",
  },
  amber: {
    bar: "bg-amber-500/70",
    value: "text-foreground",
    border: "border-border",
    active:
      "border-amber-600 ring-2 ring-amber-600/30 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-950/60",
  },
  yellow: {
    bar: "bg-yellow-500/70",
    value: "text-foreground",
    border: "border-border",
    active:
      "border-yellow-500 ring-2 ring-yellow-500/30 bg-yellow-50 hover:bg-yellow-100 dark:bg-yellow-950/40 dark:hover:bg-yellow-950/60",
  },
  blue: {
    bar: "bg-blue-500/70",
    value: "text-foreground",
    border: "border-border",
    active:
      "border-blue-500 ring-2 ring-blue-500/30 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-950/60",
  },
  gray: {
    bar: "bg-transparent",
    value: "text-foreground",
    border: "border-border",
    active:
      "border-muted-foreground/60 ring-2 ring-muted-foreground/20 bg-muted/60 hover:bg-muted",
  },
};

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
  onClick?: () => void;
  active?: boolean;
  tone?: StatCardTone;
}

export function StatCard({
  label,
  value,
  hint,
  className,
  onClick,
  active,
  tone = "neutral",
}: StatCardProps) {
  const styles = TONE_STYLES[tone];
  const content = (
    <>
      {/* Top accent bar */}
      <div className={cn("absolute inset-x-0 top-0 h-1 rounded-t-lg", styles.bar)} />
      <p className="text-xs font-medium uppercase leading-tight tracking-wide text-muted-foreground line-clamp-1 min-h-[1.125rem]">
        {label}
      </p>
      <p className={cn("mt-2 text-3xl font-bold tabular-nums leading-tight min-h-[4.5rem]", styles.value)}>
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-1 min-h-[1rem]">{hint}</p>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          "relative w-full text-left rounded-lg border bg-card p-4 pt-5 shadow-sm transition-colors hover:bg-secondary/40 focus:outline-none focus:ring-2 focus:ring-ring",
          styles.border,
          active && styles.active,
          className,
        )}
      >
        {content}
      </button>
    );
  }
  return (
    <div
      className={cn(
        "relative rounded-lg border bg-card p-4 pt-5 shadow-sm",
        styles.border,
        className,
      )}
    >
      {content}
    </div>
  );
}