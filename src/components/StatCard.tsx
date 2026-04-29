import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
  onClick?: () => void;
  active?: boolean;
}

export function StatCard({ label, value, hint, className, onClick, active }: StatCardProps) {
  const content = (
    <>
      <p className="text-xs font-medium uppercase leading-tight tracking-wide text-muted-foreground line-clamp-2 min-h-[2.25rem]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground line-clamp-1 min-h-[1rem]">
        {hint ?? "\u00A0"}
      </p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          "w-full text-left rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:bg-secondary/40 focus:outline-none focus:ring-2 focus:ring-ring",
          active &&
            "border-primary ring-2 ring-primary/40 bg-primary/5 hover:bg-primary/10",
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
        "rounded-lg border border-border bg-card p-4 shadow-sm",
        className,
      )}
    >
      {content}
    </div>
  );
}