import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callCrmRpc } from "@/server/analytics";

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TaskActionsMenu({
  taskId,
  currentDueIso,
  onChanged,
}: {
  taskId: string;
  currentDueIso?: string | null;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDue, setNewDue] = useState<string>(toLocalInputValue(currentDueIso));

  const run = async (fn: string, params: Record<string, unknown>, successMsg: string) => {
    setBusy(true);
    try {
      const res = await callCrmRpc({ data: { fn, params } });
      if (res?.error) {
        toast.error(res.error);
        return false;
      }
      toast.success(successMsg);
      await qc.invalidateQueries({ queryKey: ["crm"] });
      onChanged?.();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nezināma kļūda");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = () =>
    run("rpc_complete_task", { p_task_id: taskId }, "Uzdevums pabeigts");
  const handleCancel = () =>
    run("rpc_cancel_task", { p_task_id: taskId }, "Uzdevums atcelts");
  const handleSkip = () =>
    run("rpc_skip_task", { p_task_id: taskId }, "Uzdevums izlaists");

  const handleReschedule = async () => {
    if (!newDue) {
      toast.error("Norādi jaunu termiņu");
      return;
    }
    const iso = new Date(newDue).toISOString();
    const ok = await run(
      "rpc_reschedule_task",
      { p_task_id: taskId, p_new_due_at: iso },
      "Uzdevums pārplānots",
    );
    if (ok) setRescheduleOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={busy}
            aria-label="Uzdevuma darbības"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void handleComplete();
            }}
          >
            Pabeigt
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setNewDue(toLocalInputValue(currentDueIso));
              setRescheduleOpen(true);
            }}
          >
            Pārplānot
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void handleSkip();
            }}
          >
            Izlaist
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              e.preventDefault();
              void handleCancel();
            }}
          >
            Atcelt
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={rescheduleOpen}
        onOpenChange={(o) => !busy && setRescheduleOpen(o)}
      >
        <DialogContent
          className="sm:max-w-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Pārplānot uzdevumu</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="task-new-due">Jaunais termiņš</Label>
            <Input
              id="task-new-due"
              type="datetime-local"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRescheduleOpen(false)}
              disabled={busy}
            >
              Atcelt
            </Button>
            <Button
              type="button"
              onClick={() => void handleReschedule()}
              disabled={busy || !newDue}
            >
              {busy ? "Saglabā…" : "Pārplānot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}