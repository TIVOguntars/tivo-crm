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
import { Textarea } from "@/components/ui/textarea";
import { callCrmRpc } from "@/server/analytics";
import { formatCrmError } from "@/lib/crmErrors";

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
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  type RpcFn =
    | "rpc_complete_task"
    | "rpc_reschedule_task"
    | "rpc_cancel_task"
    | "rpc_skip_task";
  const run = async (fn: RpcFn, params: Record<string, unknown>, successMsg: string) => {
    setBusy(true);
    try {
      const res = await callCrmRpc({ data: { fn, params } });
      if (res?.error) {
        toast.error(formatCrmError(res.error));
        return false;
      }
      toast.success(successMsg);
      await qc.invalidateQueries({ queryKey: ["crm"] });
      onChanged?.();
      return true;
    } catch (e) {
      toast.error(formatCrmError(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = () =>
    run("rpc_complete_task", { p_task_id: taskId }, "Uzdevums pabeigts");
  const handleCancel = async () => {
    const reason = cancelReason.trim();
    if (!reason) {
      toast.error("Norādi atcelšanas iemeslu");
      return;
    }
    const ok = await run(
      "rpc_cancel_task",
      {
        p_task_id: taskId,
        p_cancelled_reason: reason,
        p_cancelled_by_user_id: null,
      },
      "Uzdevums atcelts",
    );
    if (ok) {
      setCancelOpen(false);
      setCancelReason("");
    }
  };
  const handleSkip = async () => {
    const reason = skipReason.trim();
    if (!reason) {
      toast.error("Norādi izlaišanas iemeslu");
      return;
    }
    const ok = await run(
      "rpc_skip_task",
      {
        p_task_id: taskId,
        p_skipped_reason: reason,
        p_skipped_by_user_id: null,
      },
      "Uzdevums izlaists",
    );
    if (ok) {
      setSkipOpen(false);
      setSkipReason("");
    }
  };

  const handleReschedule = async () => {
    if (!newDue) {
      toast.error("Norādi jaunu termiņu");
      return;
    }
    const iso = new Date(newDue).toISOString();
    const ok = await run(
      "rpc_reschedule_task",
      {
        p_task_id: taskId,
        p_new_due_at: iso,
        p_rescheduled_by_user_id: null,
      },
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
              setSkipReason("");
              setSkipOpen(true);
            }}
          >
            Izlaist
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              e.preventDefault();
              setCancelReason("");
              setCancelOpen(true);
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

      <Dialog
        open={skipOpen}
        onOpenChange={(o) => !busy && setSkipOpen(o)}
      >
        <DialogContent
          className="sm:max-w-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Izlaist uzdevumu</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="task-skip-reason">Iemesls</Label>
            <Textarea
              id="task-skip-reason"
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              placeholder="Kāpēc šis uzdevums tiek izlaists?"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSkipOpen(false)}
              disabled={busy}
            >
              Atcelt
            </Button>
            <Button
              type="button"
              onClick={() => void handleSkip()}
              disabled={busy || !skipReason.trim()}
            >
              {busy ? "Saglabā…" : "Izlaist"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelOpen}
        onOpenChange={(o) => !busy && setCancelOpen(o)}
      >
        <DialogContent
          className="sm:max-w-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Atcelt uzdevumu</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="task-cancel-reason">Iemesls</Label>
            <Textarea
              id="task-cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Kāpēc šis uzdevums tiek atcelts?"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelOpen(false)}
              disabled={busy}
            >
              Aizvērt
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleCancel()}
              disabled={busy || !cancelReason.trim()}
            >
              {busy ? "Saglabā…" : "Atcelt uzdevumu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}