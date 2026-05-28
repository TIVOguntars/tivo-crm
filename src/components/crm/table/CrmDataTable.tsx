import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Unified CRM DataTable primitives.
 *
 * Visual contract (enforced via .crm-* classes in src/styles.css):
 *   - Header label row:  40px
 *   - Header filter row: 40px
 *   - Filter controls:   32px
 *   - Body row minimum:  44px
 *   - Typography:        13px filter / 14px body
 *   - Colors:            TIVO tokens only
 *
 * Render shape: ALWAYS a real HTML <table> via shadcn primitives.
 * Forbidden in callers: <div role="grid">, native <select>/<input>,
 * inline py-* / px-* on table cells, hardcoded hex colors.
 */

export type SortDir = "asc" | "desc" | null;

export interface CrmTableSort {
  key: string | null;
  dir: Exclude<SortDir, null>;
}

interface Ctx {
  sort?: CrmTableSort;
  onSortChange?: (key: string, dir: SortDir) => void;
}

const TableCtx = React.createContext<Ctx>({});

/* ───────── Shell ───────── */

export interface CrmDataTableProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** When set, the wrapper scrolls vertically and sticky headers activate. */
  maxHeight?: number | string;
  sort?: CrmTableSort;
  onSortChange?: (key: string, dir: SortDir) => void;
  children?: React.ReactNode;
}

export function CrmDataTable({
  maxHeight,
  sort,
  onSortChange,
  className,
  children,
  ...rest
}: CrmDataTableProps) {
  const style =
    maxHeight != null
      ? {
          maxHeight:
            typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight,
        }
      : undefined;
  return (
    <TableCtx.Provider value={{ sort, onSortChange }}>
      <div
        className={cn(
          "rounded-md border border-[color:var(--crm-border)] bg-[color:var(--crm-surface)]",
          maxHeight != null && "overflow-auto",
          className,
        )}
        style={style}
        {...rest}
      >
        <Table>{children}</Table>
      </div>
    </TableCtx.Provider>
  );
}

/* ───────── Header ───────── */

export function CrmDataTableHeader({
  sticky = true,
  children,
  className,
}: {
  sticky?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TableHeader className={cn(sticky && "sticky top-0 z-20", className)}>
      {children}
    </TableHeader>
  );
}

export function CrmDataTableLabelRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TableRow
      className={cn(
        "crm-table-header-row hover:bg-[var(--tivo-navy-soft)]",
        className,
      )}
    >
      {children}
    </TableRow>
  );
}

export function CrmDataTableFilterRow({
  sticky = true,
  children,
  className,
}: {
  sticky?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TableRow
      className={cn(
        "crm-table-filter-row hover:bg-[var(--tivo-navy-soft)]",
        sticky && "sticky top-10 z-20",
        className,
      )}
    >
      {children}
    </TableRow>
  );
}

/* ───────── Sortable head ───────── */

function nextDir(current: SortDir): SortDir {
  if (current === null) return "asc";
  if (current === "asc") return "desc";
  return null;
}

export interface CrmSortableHeadProps
  extends Omit<React.ThHTMLAttributes<HTMLTableCellElement>, "onClick"> {
  sortKey?: string;
  label: React.ReactNode;
  align?: "left" | "right" | "center";
}

export function CrmSortableHead({
  sortKey,
  label,
  align = "left",
  className,
  ...rest
}: CrmSortableHeadProps) {
  const { sort, onSortChange } = React.useContext(TableCtx);
  const active = !!sortKey && sort?.key === sortKey;
  const dir: SortDir = active ? sort!.dir : null;

  const alignCls =
    align === "right"
      ? "text-right"
      : align === "center"
        ? "text-center"
        : "text-left";
  const justifyCls =
    align === "right"
      ? "justify-end"
      : align === "center"
        ? "justify-center"
        : "justify-start";

  if (!sortKey) {
    return (
      <TableHead className={cn(alignCls, className)} {...rest}>
        {label}
      </TableHead>
    );
  }

  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <TableHead className={cn(alignCls, className)} {...rest}>
      <button
        type="button"
        className={cn("crm-sort-trigger w-full", justifyCls)}
        onClick={() => onSortChange?.(sortKey, nextDir(dir))}
      >
        <span>{label}</span>
        <Icon className={cn("h-3 w-3", dir ? "opacity-80" : "opacity-40")} />
      </button>
    </TableHead>
  );
}

/* ───────── Filter cell ───────── */

export interface CrmFilterCellProps {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  colSpan?: number;
}

export function CrmFilterCell({
  children,
  align = "left",
  className,
  colSpan,
}: CrmFilterCellProps) {
  const alignCls =
    align === "right"
      ? "text-right"
      : align === "center"
        ? "text-center"
        : "text-left";
  return (
    <TableHead
      colSpan={colSpan}
      className={cn("crm-table-filter-cell", alignCls, className)}
    >
      {children}
    </TableHead>
  );
}

/* ───────── Body row + cell ───────── */

export function CrmDataRow({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <TableRow className={cn("crm-table-body-row", className)} {...rest}>
      {children}
    </TableRow>
  );
}

export interface CrmDataCellProps
  extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "right" | "center";
}

export function CrmDataCell({
  children,
  className,
  align = "left",
  colSpan,
  ...rest
}: CrmDataCellProps) {
  const alignCls =
    align === "right"
      ? "text-right"
      : align === "center"
        ? "text-center"
        : "text-left";
  return (
    <TableCell
      colSpan={colSpan}
      className={cn("crm-table-body-cell", alignCls, className)}
      {...rest}
    >
      {children}
    </TableCell>
  );
}

export function CrmDataBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <TableBody className={className}>{children}</TableBody>;
}

/* ───────── Filter controls ───────── */

export type CrmFilterInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
>;

export const CrmFilterInput = React.forwardRef<
  HTMLInputElement,
  CrmFilterInputProps
>(({ className, ...rest }, ref) => (
  <Input
    ref={ref}
    className={cn("crm-filter-control border-0 shadow-none", className)}
    {...rest}
  />
));
CrmFilterInput.displayName = "CrmFilterInput";

export interface CrmFilterSelectOption {
  value: string;
  label: string;
}

export interface CrmFilterSelectProps {
  value?: string;
  onValueChange?: (v: string) => void;
  options: CrmFilterSelectOption[];
  placeholder?: string;
  allValue?: string;
  allLabel?: string;
  className?: string;
  disabled?: boolean;
}

const ALL_SENTINEL = "__all__";

export function CrmFilterSelect({
  value,
  onValueChange,
  options,
  placeholder = "Visi",
  allValue = ALL_SENTINEL,
  allLabel = "Visi",
  className,
  disabled,
}: CrmFilterSelectProps) {
  const v = value === undefined || value === "" ? allValue : value;
  return (
    <Select
      value={v}
      onValueChange={(next) =>
        onValueChange?.(next === allValue ? "" : next)
      }
      disabled={disabled}
    >
      <SelectTrigger className={cn("crm-filter-control", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={allValue}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ───────── Clear all ───────── */

export function CrmClearFiltersButton({
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