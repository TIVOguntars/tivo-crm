import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPicker } from "@/components/users/UserPicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { callCrmRpc } from "@/server/analytics";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  MANUAL_KIND_LABELS,
  MANUAL_KIND_ORDER,
  SUMMARY_MAX,
  buildLogActivityParams,
  validateManualActivity,
  type ManualKind,
} from "@/lib/manualActivity";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
}

// Operator-visible follow-up options. `taskType` maps each option to an
// existing crm.task_types row accepted by rpc_create_task — the RPC
// rejects any key not present in that table.
const FOLLOW_UP_TYPES = [
  { value: "call_follow_up", label: "Atzvanīt", taskType: "call" },
  { value: "meeting_follow_up", label: "Tikšanās turpinājums", taskType: "zoom" },
  { value: "info_follow_up", label: "Nosūtīt informāciju", taskType: "manual_email" },
  { value: "general_follow_up", label: "Cits follow-up", taskType: "call" },
] as const;
type FollowUpType = (typeof FOLLOW_UP_TYPES)[number]["value"];

/** Format a Date to <input type="datetime-local"> value in local time. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ManualActivityDialog({ open, onOpenChange, leadId }: Props) {
  const qc = useQueryClient();
  const { operatorId } = useCurrentUser();
  const call = useServerFn(callCrmRpc);

  const [kind, setKind] = useState<ManualKind>("note");
  const [activityAt, setActivityAt] = useState<string>(() => toLocalInputValue(new Date()));
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");

  // Optional follow-up task
  const [createFollowUp, setCreateFollowUp] = useState(false);
  const [fuType, setFuType] = useState<FollowUpType>("call_follow_up");
  const [fuDueAt, setFuDueAt] = useState<string>("");
  const [fuAssignee, setFuAssignee] = useState<string | null>(null);
  const [fuNote, setFuNote] = useState("");
  const [busyFollowUp, setBusyFollowUp] = useState(false);

  useEffect(() => {
    if (open) {
      setKind("note");
      setActivityAt(toLocalInputValue(new Date()));
      setSummary("");
      setOutcome("");
      setCreateFollowUp(false);
      setFuType("call_follow_up");
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      setFuDueAt(toLocalInputValue(tomorrow));
      setFuAssignee(null);
      setFuNote("");
      setBusyFollowUp(false);
    }
  }, [open]);

  const mut = useMutation({
    mutationFn: async (params: Record<string, unknown>) => {
      const res = await call({ data: { fn: "rpc_log_activity", params } });
      if (res.error) throw new Error(res.error);
      return res.rows;
    },
  });

  const isoActivityAt = useMemo(() => {
    if (!activityAt) return "";
    const d = new Date(activityAt);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }, [activityAt]);

  const isoFuDueAt = useMemo(() => {
    if (!fuDueAt) return "";
    const d = new Date(fuDueAt);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }, [fuDueAt]);

  const onSubmit = async () => {
    const v = validateManualActivity({
      kind,
      activityAt: isoActivityAt,
      summary,
      outcome,
    });
    if (!v.ok) {
      toast.error(v.error ?? "Neizdevās saglabāt");
      return;
    }
    if (createFollowUp && !isoFuDueAt) {
      toast.error("Norādiet nākamā uzdevuma termiņu");
      return;
    }
    const params = buildLogActivityParams({
      leadId,
      performedByUserId: operatorId,
      input: { kind, activityAt: isoActivityAt, summary, outcome },
    });
    try {
      await mut.mutateAsync(params);

      let followUpOk = false;
      if (createFollowUp) {
        setBusyFollowUp(true);
        try {
          const fuDef = FOLLOW_UP_TYPES.find((t) => t.value === fuType);
          const fuLabel = fuDef?.label || "Follow-up";
          const fuTaskType = fuDef?.taskType || "call";
          const res = await call({
            data: {
              fn: "rpc_create_task",
              params: {
                p_lead_id: leadId,
                p_task_type: fuTaskType,
                p_due_at: isoFuDueAt,
                p_title: fuLabel,
                p_description: fuNote.trim() || null,
                p_assigned_user_id: fuAssignee,
                p_required_role: null,
                p_workflow_instance_id: null,
                p_parent_task_id: null,
                p_metadata: {
                  source: "manual",
                  follow_up_of_kind: kind,
                  follow_up_kind: fuType,
                  follow_up_label_lv: fuLabel,
                },
                p_is_auto_created: false,
                p_priority: "normal",
              },
            },
          });
          if (res?.error) throw new Error(res.error);
          followUpOk = true;
        } catch (fuErr) {
          toast.error(
            `Darbība saglabāta, bet uzdevumu neizdevās izveidot: ${
              fuErr instanceof Error ? fuErr.message : "kļūda"
            }`,
          );
        } finally {
          setBusyFollowUp(false);
        }
      }

      if (createFollowUp && followUpOk) {
        toast.success("Darbība saglabāta un nākamais uzdevums izveidots");
      } else if (!createFollowUp) {
        toast.success("Darbība saglabāta");
      }

      qc.invalidateQueries({ queryKey: ["crm-rpc", "get_lead_360_profile"] });
      qc.invalidateQueries({ queryKey: ["crm", "v_unified_timeline"] });
      qc.invalidateQueries({ queryKey: ["crm", "activities"] });
      qc.invalidateQueries({ queryKey: ["crm", "tasks"] });
      qc.invalidateQueries({ queryKey: ["crm", "v_lead_planned_actions"] });
      qc.invalidateQueries({ queryKey: ["crm", "communication_queue"] });
      await qc.refetchQueries({ queryKey: ["crm", "v_lead_planned_actions"] });
      await qc.refetchQueries({ queryKey: ["crm-rpc", "get_lead_360_profile"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(
        `Neizdevās saglabāt: ${err instanceof Error ? err.message : "kļūda"}`,
      );
    }
  };

  const busy = mut.isPending || busyFollowUp;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pievienot darbību</DialogTitle>
          <DialogDescription>
            Manuāli reģistrēt piezīmi, zvanu vai tikšanos šim leadam.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Veids</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ManualKind)} disabled={busy}>
              <SelectTrigger className="mt-1 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_KIND_ORDER.map((k) => (
                  <SelectItem key={k} value={k}>
                    {MANUAL_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Datums un laiks</Label>
            <Input
              type="datetime-local"
              value={activityAt}
              onChange={(e) => setActivityAt(e.target.value)}
              disabled={busy}
              className="mt-1 h-9"
            />
          </div>

          <div>
            <Label className="text-xs">Apraksts</Label>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value.slice(0, SUMMARY_MAX))}
              placeholder="Īss apraksts par darbību…"
              rows={4}
              disabled={busy}
              className="mt-1 text-sm"
            />
            <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
              {summary.length}/{SUMMARY_MAX}
            </div>
          </div>

          <div>
            <Label className="text-xs">Iznākums (neobligāti)</Label>
            <Input
              value={outcome}
              onChange={(e) => setOutcome(e.target.value.slice(0, 100))}
              placeholder="Piemēram: neatbild, ieplānota tikšanās…"
              disabled={busy}
              className="mt-1 h-9 text-sm"
            />
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <Checkbox
                checked={createFollowUp}
                onCheckedChange={(c) => setCreateFollowUp(c === true)}
                disabled={busy}
              />
              Izveidot nākamo uzdevumu
            </label>

            {createFollowUp && (
              <div className="mt-3 space-y-3">
                <div>
                  <Label className="text-xs">Uzdevuma veids</Label>
                  <Select
                    value={fuType}
                    onValueChange={(v) => setFuType(v as FollowUpType)}
                    disabled={busy}
                  >
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FOLLOW_UP_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Termiņš</Label>
                  <Input
                    type="datetime-local"
                    value={fuDueAt}
                    onChange={(e) => setFuDueAt(e.target.value)}
                    disabled={busy}
                    className="mt-1 h-9"
                  />
                </div>

                <div>
                  <Label className="text-xs">Atbildīgais operators</Label>
                  <div className="mt-1">
                    <UserPicker
                      value={fuAssignee}
                      onChange={setFuAssignee}
                      placeholder="Nav piešķirts"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Piezīme</Label>
                  <Textarea
                    value={fuNote}
                    onChange={(e) => setFuNote(e.target.value.slice(0, 1000))}
                    placeholder="Piezīme nākamajam uzdevumam…"
                    rows={3}
                    disabled={busy}
                    className="mt-1 text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Atcelt
          </Button>
          <Button onClick={onSubmit} disabled={busy || !summary.trim()}>
            {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Saglabāt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}