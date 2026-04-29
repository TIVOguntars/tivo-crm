import type { StatCardTone } from "@/components/StatCard";

/**
 * Single source of truth for color-by-priority across the Leads UI.
 *
 * The same tone token must drive:
 *   1. KPI card (StatCard `tone`)
 *   2. table row background tint
 *   3. next_action badge / button tint
 *   4. priority group header (if rendered)
 *
 * Color must be derived from `priority` only — never from
 * `follow_up_bucket` or `status`.
 */

export type PriorityTone = StatCardTone;

export function priorityTone(score: number): PriorityTone {
  if (score === 100) return "red";
  if (score === 90) return "purple";
  if (score === 80) return "orange";
  if (score === 70) return "yellow";
  if (score === 60) return "blue";
  return "gray";
}

/** Soft tinted background for a table row, matched to KPI card tone. */
export const PRIORITY_ROW_BG: Record<PriorityTone, string> = {
  red: "bg-red-50/70 dark:bg-red-950/20",
  purple: "bg-purple-50/70 dark:bg-purple-950/20",
  orange: "bg-orange-50/70 dark:bg-orange-950/20",
  yellow: "bg-yellow-50/70 dark:bg-yellow-950/20",
  blue: "bg-blue-50/70 dark:bg-blue-950/20",
  amber: "bg-amber-50/70 dark:bg-amber-950/20",
  gray: "",
  neutral: "",
};

/** Tinted next_action badge/button, matched to KPI card tone. */
export const PRIORITY_BADGE: Record<PriorityTone, string> = {
  red: "bg-red-100 text-red-700 hover:bg-red-200 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60 dark:hover:bg-red-950/60",
  purple:
    "bg-purple-100 text-purple-700 hover:bg-purple-200 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/60 dark:hover:bg-purple-950/60",
  orange:
    "bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/60 dark:hover:bg-orange-950/60",
  yellow:
    "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-900/60 dark:hover:bg-yellow-950/60",
  blue: "bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60 dark:hover:bg-blue-950/60",
  amber:
    "bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60 dark:hover:bg-amber-950/60",
  gray: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border",
  neutral:
    "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border",
};