import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPicker } from "@/components/users/UserPicker";
import { useCrmView } from "@/hooks/useCrmView";
import { useTaskTypes } from "@/hooks/useTaskTypes";
import { callCrmRpc } from "@/server/analytics";
import { formatCrmError } from "@/lib/crmErrors";

type Priority = "low" | "normal" | "high";

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "high", label: "Augsts" },
  { value: "normal", label: "Vidējs" },
  { value: "low", label: "Zems" },
];

function s(v: unknown): string {
  return v == null ? "" : String(v);
}

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type TaskRow = Record<string, unknown>;

export function TaskEditDialog({
  taskId,
  open,
  onOpenChange,
  onSaved,
}: {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const tt = useTaskTypes();
  const [busy, setBusy] = useState(false);

  // Fetch the task fresh when the dialog opens.
  const query = open && taskId
    ? `select=id,lead_id,task_type,title,description,due_at,assigned_user_id,priority,status,metadata&id=eq.${taskId}&limit=1`
    : undefined;
  const taskQ = useCrmView("tasks", query);
  const task = (taskQ.data?.rows?.[0] ?? null) as TaskRow | null;

  const [taskType, setTaskType] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueLocal, setDueLocal] = useState<string>("");
  const [assignedUserId, setAssignedUserId] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority>("normal");
  const [notes, setNotes] = useState("");

  // Prefill when the task arrives.
  useEffect(() => {
    if (!open || !task) return;
    setTaskType(s(task.task_type));
    setTitle(s(task.title));
    setDescription(s(task.description));
    setDueLocal(toLocalInputValue(s(task.due_at)));
    setAssignedUserId(s(task.assigned_user_id) || null);
    const p = s(task.priority);
    setPriority(p === "high" || p === "low" ? p : "normal");
    setNotes("");
  }, [open, task]);

  const typeRows = useMemo(
    () =>
      tt.rows.filter(
        (r) => r.type_key !== "draw_sketches" && r.type_key !== "estimate",
      ),
    [tt.rows],
  );

  const canSubmit = !busy && !!taskId && !!title.trim() && !!dueLocal;

  const handleSubmit = async () => {
    if (!canSubmit || !task) return;
    const d = new Date(dueLocal);
    if (Number.isNaN(d.getTime())) {
      toast.error("Nederīgs termiņš");
      return;
    }
    setBusy(true);
    try {
      const res = await callCrmRpc({
        data: {
          fn: "rpc_update_task",
          params: {
            p_task_id: taskId,
            p_task_type: taskType || null,
            p_title: title.trim(),
            p_description: description.trim() || null,
            p_due_at: d.toISOString(),
            p_assigned_user_id: assignedUserId,
            p_priority: priority,
            p_metadata_patch: null,
            p_notes: notes.trim() || null,
            p_updated_by_user_id: null,
          },
        },
      });
      if (res?.error) {
        toast.error(formatCrmError(res.error));
        return;
      }
      toast.success("Uzdevums saglabāts");
      await qc.invalidateQueries({ queryKey: ["crm"] });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(formatCrmError(e));
    } finally {
      setBusy(false);
    }
  };

  const loading = open && (taskQ.isLoading || !task);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        className="sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Pārplānot / labot uzdevumu</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Ielādē uzdevumu…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="te-type">Tips</Label>
                <Select
                  value={taskType}
                  onValueChange={setTaskType}
                  disabled={tt.isLoading || typeRows.length === 0}
                >
                  <SelectTrigger id="te-type">
                    <SelectValue placeholder="Izvēlies tipu" />
                  </SelectTrigger>
                  <SelectContent>
                    {typeRows.map((t) => (
                      <SelectItem key={t.type_key} value={t.type_key}>
                        {t.label_lv}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioritāte</Label>
                <div
                  role="radiogroup"
                  className="flex h-9 items-center rounded-md border border-input bg-background p-0.5"
                >
                  {PRIORITY_OPTIONS.map((opt) => {
                    const active = priority === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setPriority(opt.value)}
                        className={
                          "flex-1 h-7 px-2 text-xs rounded-sm transition " +
                          (active
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted")
                        }
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="te-title">Virsraksts *</Label>
              <Input
                id="te-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="te-desc">Apraksts</Label>
              <Textarea
                id="te-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="te-due">Termiņš *</Label>
                <Input
                  id="te-due"
                  type="datetime-local"
                  value={dueLocal}
                  onChange={(e) => setDueLocal(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Atbildīgais</Label>
                <UserPicker
                  value={assignedUserId}
                  onChange={setAssignedUserId}
                  placeholder="Nav piešķirts"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="te-notes">Piezīmes (parādās aktivitātēs)</Label>
              <Textarea
                id="te-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Komentārs par labojumu…"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Atcelt
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {busy ? "Saglabā…" : "Saglabāt izmaiņas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}