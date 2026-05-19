import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useAssignableUsers } from "@/hooks/useUsers";
import { displayName } from "@/lib/users";

/**
 * UUID-based user picker backed by crm.profiles (via useAssignableUsers).
 * value/onChange = profile UUID or null. No free-text entry.
 */
export function UserPicker({
  value,
  onChange,
  placeholder = "Nav piešķirts",
  disabled = false,
  allowClear = true,
  className,
}: {
  value: string | null;
  onChange: (uuid: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const usersQ = useAssignableUsers();
  const users = usersQ.data ?? [];

  const selected = useMemo(
    () => users.find((u) => u.id === value) ?? null,
    [users, value],
  );

  const label = selected
    ? displayName(selected) +
      (selected.user_code ? ` · ${selected.user_code}` : "")
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{label}</span>
          <span className="ml-2 flex items-center gap-1">
            {allowClear && selected && !disabled && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Notīrīt"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(null);
                }}
                className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Meklēt operatoru…" />
          <CommandList>
            <CommandEmpty>
              {usersQ.isLoading ? "Ielādē…" : "Nav atrasts"}
            </CommandEmpty>
            <CommandGroup>
              {users.map((u) => {
                const name = displayName(u);
                const searchValue = [
                  name,
                  u.email ?? "",
                  u.user_code ?? "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <CommandItem
                    key={u.id}
                    value={searchValue}
                    onSelect={() => {
                      onChange(u.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === u.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    {u.user_code && (
                      <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {u.user_code}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}