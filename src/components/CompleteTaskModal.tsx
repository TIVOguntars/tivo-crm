import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { callCrmRpc } from "@/server/analytics";
import { formatCrmError } from "@/lib/crmErrors";
import { useTaskTypes } from "@/hooks/useTaskTypes";
import {
  outcomesForTaskType,
  activityTypeFor,
} from "@/lib/taskOutcomes";

export interface CompleteTaskModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  taskId: string;
  /** Parent task lead id — required to create a follow-up. */
  leadId?: string | null;
  /** Parent task type, used to scope outcome options and derive activity_type. */
  taskType?: string | null;
  onCompleted?: () => void;
}

export function CompleteTaskModal({
  open,
  onOpenChange,
  taskId,
  leadId,
  taskType,
  onCompleted,
}: CompleteTaskModalProps) {
  const qc = useQueryClient();
  const taskTypes = useTaskTypes();

  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [createFollowup, setCreateFollowup] = useState(false);
  const [followupMode, setFollowupMode] = useState<
    "none" | "follow_up" | "wait_for_project"
  >("none");
  const [nextTaskType, setNextTaskType] = useState<string>("");
  const [nextDue, setNextDue] = useState<Date | undefined>(undefined);
  const [nextOwner, setNextOwner] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outcomeOptions = useMemo(
    () => outcomesForTaskType(taskType),
    [taskType],
  );

  useEffect(() => {
    if (open) {
      setSummary("");
      setOutcome("");
      setNotes("");
      setCreateFollowup(false);
      setFollowupMode("none");
      setNextTaskType("");
      setNextDue(undefined);
      setNextOwner("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const hasFollowup = followupMode !== "none";
  const canSubmit =
    summary.trim().length > 0 &&
    outcome.trim().length > 0 &&
    (!hasFollowup || (!!nextTaskType && !!nextDue));

  // Apply mode defaults whenever the user changes the follow-up mode.
  useEffect(() => {
    if (followupMode === "wait_for_project") {
      // Default: today + 7 days at 09:00 local — matches existing
      // server-side behavior for "Gaidu projektu" reminders.
      const d = new Date();
      d.setDate(d.getDate() + 7);
      d.setHours(9, 0, 0, 0);
      setNextDue(d);
      if (!nextTaskType) setNextTaskType("call");
    } else if (followupMode === "none") {
      setNextDue(undefined);
      setNextTaskType("");
      setNextOwner("");
    }
    setCreateFollowup(followupMode !== "none");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followupMode]);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      // 1) Complete the existing task. The RPC creates crm.activities itself
      //    when p_create_activity = true — we never insert it from the client.
      const completeRes = await callCrmRpc({
        data: {
          fn: "rpc_complete_task",
          params: {
            p_task_id: taskId,
            p_summary: summary.trim(),
            p_outcome_code: outcome,
            p_notes: notes.trim() ? notes.trim() : null,
            p_create_activity: true,
            p_activity_type: activityTypeFor(taskType),
            p_metadata: { source: "complete_task_modal" },
          },
        },
      });
      if (completeRes?.error) {
        setError(formatCrmError(completeRes.error));
        setSubmitting(false);
        return;
      }

      // 2) Optional follow-up via existing rpc_create_task.
      //    Relation is encoded inside metadata only (no direct write to
      //    crm.task_relations — that requires a backend RPC that does not
      //    currently exist).
      if (hasFollowup && leadId && nextTaskType && nextDue) {
        const isWait = followupMode === "wait_for_project";
        const followupTitle = isWait
          ? "Gaidu projektu — atgādinājums"
          : taskTypes.labelOf(nextTaskType) || "Sekošanas uzdevums";
        const dueIso = nextDue.toISOString();
        const followRes = await callCrmRpc({
          data: {
            fn: "rpc_create_task",
            params: {
              p_lead_id: leadId,
              p_task_type: nextTaskType,
              p_due_at: dueIso,
              p_title: followupTitle,
              p_assigned_user_id: null,
              p_metadata: {
                source: "complete_task_modal",
                parent_task_id: taskId,
                relation_type: isWait ? "wait_for_project" : "follow_up",
                ...(isWait ? { reason: "Gaidu projektu" } : {}),
                owner_label: nextOwner.trim() || null,
              },
            },
          },
        });
        if (followRes?.error) {
          // Parent task is already completed; surface follow-up failure as a
          // warning, do not block the close.
          toast.warning(
            `Uzdevums pabeigts, bet neizdevās izveidot sekošanas uzdevumu: ${formatCrmError(followRes.error)}`,
          );
        } else {
          toast.success(
            isWait
              ? "Uzdevums pabeigts un ieplānots atgādinājums (Gaidu projektu)"
              : "Uzdevums pabeigts un sekošanas uzdevums izveidots",
          );
        }
      } else {
        toast.success("Uzdevums pabeigts");
      }

      await qc.invalidateQueries({ queryKey: ["crm"] });
      onOpenChange(false);
      onCompleted?.();
    } catch (e) {
      setError(formatCrmError(e));
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) onOpenChange(o);
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Pabeigt uzdevumu</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ct-summary">
              Kopsavilkums<span className="text-destructive"> *</span>
            </Label>
            <Textarea
              id="ct-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Īss kopsavilkums par paveikto"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Iznākums<span className="text-destructive"> *</span>
            </Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger>
                <SelectValue placeholder="Izvēlies iznākumu" />
              </SelectTrigger>
              <SelectContent>
                {outcomeOptions.map((o) => (
                  <SelectItem key={o.code} value={o.code}>
                    {o.label_lv}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-notes">Piezīmes</Label>
            <Textarea
              id="ct-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Neobligāti"
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Pēc pabeigšanas</Label>
            <Select
              value={followupMode}
              onValueChange={(v) =>
                setFollowupMode(v as "none" | "follow_up" | "wait_for_project")
              }
              disabled={!leadId}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nekas</SelectItem>
                <SelectItem value="follow_up">
                  Izveidot sekošanas uzdevumu
                </SelectItem>
                <SelectItem value="wait_for_project">
                  Atlikt — gaidu projektu
                </SelectItem>
              </SelectContent>
            </Select>
            {!leadId && (
              <p className="text-[11px] text-muted-foreground">
                Nav pieejams: trūkst lead konteksta.
              </p>
            )}
          </div>

          {hasFollowup && leadId && (
            <div className="space-y-3 rounded-md border bg-muted/40 p-3">
              <div className="space-y-1.5">
                <Label>
                  Nākamā uzdevuma tips
                  <span className="text-destructive"> *</span>
                </Label>
                <Select value={nextTaskType} onValueChange={setNextTaskType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Izvēlies tipu" />
                  </SelectTrigger>
                  <SelectContent>
                    {taskTypes.rows.map((r) => (
                      <SelectItem key={r.type_key} value={r.type_key}>
                        {r.label_lv}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Termiņš<span className="text-destructive"> *</span>
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !nextDue && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {nextDue
                        ? format(nextDue, "yyyy-MM-dd")
                        : "Izvēlies datumu"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={nextDue}
                      onSelect={setNextDue}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-owner">Atbildīgais</Label>
                <Input
                  id="ct-owner"
                  value={nextOwner}
                  onChange={(e) => setNextOwner(e.target.value)}
                  placeholder="Neobligāti — vārds vai nosaukums"
                />
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Atcelt
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || submitting}
          >
            {submitting ? "Saglabā…" : "Pabeigt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}