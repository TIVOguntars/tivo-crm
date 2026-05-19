import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DATE_OPTIONS,
  TYPE_OPTIONS,
  type DateFilter,
  type TypeFilter,
} from "@/lib/timelineFilters";

export interface TimelineFiltersProps {
  type: TypeFilter;
  date: DateFilter;
  onTypeChange: (v: TypeFilter) => void;
  onDateChange: (v: DateFilter) => void;
}

export function TimelineFilters({
  type,
  date,
  onTypeChange,
  onDateChange,
}: TimelineFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={type} onValueChange={(v) => onTypeChange(v as TypeFilter)}>
        <SelectTrigger className="h-7 w-[140px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={date} onValueChange={(v) => onDateChange(v as DateFilter)}>
        <SelectTrigger className="h-7 w-[170px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}