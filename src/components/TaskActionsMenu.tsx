import { useState } from "react";
import { MoreVertical, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callCrmRpc } from "@/lib/analytics";
import { formatCrmError } from "@/lib/crmErrors";
import { CompleteTaskModal } from "@/components/CompleteTaskModal";
import { TaskEditDialog } from "@/components/TaskEditDialog";

export function TaskActionsMenu({
  taskId,
  currentDueIso,
  leadId,
  taskType,
  onChanged,
}: {
  taskId: string;
  currentDueIso?: string | null;
  leadId?: string | null;
  taskType?: string | null;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [followupCount, setFollowupCount] = useState<number>(0);

  // Acknowledge unused-prop warning while keeping API stable for callers.
  void currentDueIso;

  type RpcFn =
    | "rpc_reschedule_task"
    | "rpc_cancel_task"
    | "rpc_delete_task";
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

  const openDelete = async () => {
    setBusy(true);
    try {
      const res = await callCrmRpc({
        data: { fn: "rpc_task_followup_count", params: { p_task_id: taskId } },
      });
      if (res?.error) {
        toast.error(formatCrmError(res.error));
        return;
      }
      const row = res.rows?.[0];
      // RPC returns a scalar integer; PostgREST wraps it as { rpc_task_followup_count: N }
      // or a bare number depending on the call shape.
      let count = 0;
      if (typeof row === "number") count = row;
      else if (row && typeof row === "object") {
        const v = Object.values(row)[0];
        count = typeof v === "number" ? v : Number(v) || 0;
      }
      setFollowupCount(count);
      setDeleteOpen(true);
    } catch (e) {
      toast.error(formatCrmError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (cascade: boolean) => {
    const ok = await run(
      "rpc_delete_task",
      {
        p_task_id: taskId,
        p_cascade: cascade,
        p_deleted_by_user_id: null,
      },
      cascade
        ? `Dzēsti ${followupCount + 1} uzdevumi`
        : "Uzdevums dzēsts",
    );
    if (ok) setDeleteOpen(false);
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
              setCompleteOpen(true);
            }}
          >
            Pabeigt
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setEditOpen(true);
            }}
          >
            Pārplānot
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
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              e.preventDefault();
              void openDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" />
            Dzēst
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TaskEditDialog
        taskId={editOpen ? taskId : null}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => onChanged?.()}
      />

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

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(o) => !busy && setDeleteOpen(o)}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {followupCount > 0 ? "Dzēst uzdevumu un sekojošos?" : "Dzēst šo uzdevumu?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {followupCount > 0
                ? `Šim uzdevumam ir ${followupCount} sekojoši uzdevumi. Izvēlies, ko dzēst.`
                : "Šī darbība ir neatgriezeniska."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Atcelt</AlertDialogCancel>
            {followupCount > 0 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleDelete(false)}
                  disabled={busy}
                >
                  Dzēst tikai šo
                </Button>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    void handleDelete(true);
                  }}
                  disabled={busy}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Dzēst šo un sekojošos
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleDelete(false);
                }}
                disabled={busy}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Dzēst
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CompleteTaskModal
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        taskId={taskId}
        leadId={leadId ?? null}
        taskType={taskType ?? null}
        onCompleted={() => onChanged?.()}
      />
    </>
  );
}