import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Canonical priority → stars formula shared across /leadi, /uzdevumi
 * and Lead 360 profile. Do not duplicate this logic.
 */
export function priorityStarsCount(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.max(1, Math.min(5, Math.floor(score / 20) + 1));
}

export function PriorityCell({ score }: { score: number }) {
  const stars = priorityStarsCount(score);
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-flex items-center text-amber-500/90 dark:text-amber-400/80"
        aria-label={`Prioritāte ${stars} no 5`}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={cn(
              "h-2.5 w-2.5",
              i < stars
                ? "fill-current"
                : "text-muted-foreground/25 fill-transparent",
            )}
            strokeWidth={1.5}
          />
        ))}
      </span>
      <span className="text-[10px] tabular-nums text-muted-foreground/70">
        {score || 0}
      </span>
    </div>
  );
}