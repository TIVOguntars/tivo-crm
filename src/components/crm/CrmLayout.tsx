import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Unified CRM table-view layout primitives.
 *
 * Standard vertical order on a table page:
 *   1. <CrmPageActionsRow>    — action buttons, right-aligned
 *   2. <CrmBannerRow>         — KPI banners, single row, max 8
 *   3. <CrmTableToolbar>      — group/view + defined filters
 *   4. <table>                — body with 2 header rows
 *
 * These wrappers are intentionally thin — they only enforce spacing,
 * alignment and the TIVO color tokens. They do NOT change behavior of
 * existing tables or own any data logic.
 */

export function CrmPageActionsRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-end gap-2", className)}>
      {children}
    </div>
  );
}

/**
 * KPI / stat banner row.
 * - Always a single row (no wrap)
 * - Hard cap of 8 items; extras are dropped (caller passes the prioritized 8)
 * - No horizontal scroll
 * - Banner height ≈ 2x button rows (h-16)
 */
export function CrmBannerRow({
  children,
  className,
  max = 8,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
}) {
  const items = React.Children.toArray(children).slice(0, max);
  return (
    <div
      className={cn(
        "mb-3 grid w-full grid-flow-col auto-cols-fr gap-2",
        className,
      )}
    >
      {items}
    </div>
  );
}

export function CrmTableToolbar({
  groupSlot,
  children,
  className,
}: {
  /** Group / view picker rendered first. */
  groupSlot?: React.ReactNode;
  /** Defined filters, rendered after a 30px gap from the group slot. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center gap-2",
        className,
      )}
    >
      {groupSlot ? (
        <div className="flex items-center gap-2" style={{ marginRight: 30 }}>
          {groupSlot}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * Shared "X — clear all filters" affordance for the last cell of a
 * table filter row. Pass `active` to control visibility.
 */
export function ClearAllFiltersButton({
  active,
  onClick,
  label = "Notīrīt",
  className,
}: {
  active: boolean;
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  if (!active) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Notīrīt visus filtrus"
      className={cn(
        "crm-filter-control justify-center gap-1 font-medium transition-colors hover:bg-[var(--tivo-navy-soft)]",
        className,
      )}
    >
      <X className="h-3 w-3" />
      <span>{label}</span>
    </button>
  );
}