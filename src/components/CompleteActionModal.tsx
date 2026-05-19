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
import { cn } from "@/lib/utils";
import { callCrmRpc } from "@/server/analytics";
import { formatCrmError } from "@/lib/crmErrors";
import { useTaskTypes } from "@/hooks/useTaskTypes";
import { UserPicker } from "@/components/users/UserPicker";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUserMap } from "@/hooks/useUsers";

// Free-text pseudo-statuses written to crm.leads.nakama_darbiba. These are
// NOT task_types and have special server-side semantics (e.g. "Gaidu
// projektu" triggers a +7d reminder via existing backend logic).
const TRANSITION_ACTIONS = ["Pārdošana", "Piedāvājums", "Gaidu projektu"];

// User-facing canonical task type keys whose label_lv populates the
// "Darbības" group of the next-action picker.
const USER_FACING_TYPE_KEYS = [
  "call",
  "manual_email",
  "manual_sms",
  "manual_whatsapp",
  "zoom",
  "draw_sketches",
  "estimate",
  "prepare_offer",
];

const NONE = "__none__";

export function CompleteActionModal({
  open,
  onOpenChange,
  leadId,
  taskId,
  defaultOwner,
  isHumanPrimary,
  visibleAction,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string | null;
  taskId?: string | null;
  defaultOwner: string;
  isHumanPrimary?: boolean;
  visibleAction?: string;
  onCompleted: () => void;
}) {
  const qc = useQueryClient();
  const tt = useTaskTypes();
  const { operatorId } = useCurrentUser();
  const { resolve: resolveUserName } = useUserMap();
  const [note, setNote] = useState("");
  const [nextAction, setNextAction] = useState<string>(NONE);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [due, setDue] = useState<Date | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actionLabels = useMemo(() => {
    const fromTypes = USER_FACING_TYPE_KEYS
      .map((k) => tt.labelOf(k))
      .filter((l) => !!l && l.trim().length > 0);
    // dedupe while preserving order
    const seen = new Set<string>();
    const dedupe = (arr: string[]) =>
      arr.filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
    return {
      tasks: dedupe(fromTypes),
      transitions: dedupe(TRANSITION_ACTIONS),
    };
  }, [tt]);

  useEffect(() => {
    if (open) {
      setNote("");
      setNextAction(NONE);
      setOwnerId(operatorId ?? null);
      setDue(undefined);
      setError(null);
      setSubmitting(false);
    }
  }, [open, defaultOwner, operatorId]);

  const hasNext = nextAction !== NONE && nextAction !== "";
  const dueRequiredMissing = hasNext && !due;

  const handleSubmit = async () => {
    if (!leadId) return;
    if (!taskId && (!isHumanPrimary || !visibleAction || !visibleAction.trim())) {
      setError("Šim leadam nav aktīvas cilvēka darbības.");
      return;
    }
    if (dueRequiredMissing) {
      setError("Termiņš ir obligāts, ja izvēlēta nākamā darbība.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Resolve UUID → display label for legacy RPC that expects a text label.
      const ownerLabelForRpc =
        hasNext && ownerId
          ? (resolveUserName(ownerId) || defaultOwner || "").trim() || null
          : hasNext && defaultOwner.trim()
            ? defaultOwner.trim()
            : null;
      const res = taskId
        ? await callCrmRpc({
            data: {
              fn: "rpc_complete_task",
              params: {
                p_task_id: taskId,
                p_notes: note.trim() ? note.trim() : null,
              },
            },
          })
        : await callCrmRpc({
            data: {
              fn: "complete_human_action",
              params: {
                p_lead_id: leadId,
                p_completed_by: null,
                p_completion_note: note.trim() ? note.trim() : null,
                p_next_action: hasNext ? nextAction : null,
                p_next_owner: ownerLabelForRpc,
                p_next_due_date:
                  hasNext && due ? format(due, "yyyy-MM-dd") : null,
              },
            },
          });
      if (res.error) {
        setError(formatCrmError(res.error));
        setSubmitting(false);
        return;
      }
      toast.success(
        hasNext
          ? "Darbība pabeigta un nākamā darbība ieplānota"
          : "Darbība pabeigta",
      );
      await qc.invalidateQueries({ queryKey: ["crm"] });
      onOpenChange(false);
      onCompleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nezināma kļūda");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pabeigt darbību</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="note">Piezīme</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Neobligāti"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nākamā darbība</Label>
            <Select value={nextAction} onValueChange={setNextAction}>
              <SelectTrigger>
                <SelectValue placeholder="Izvēlies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Nav —</SelectItem>
                {actionLabels.tasks.length > 0 && (
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Darbības
                  </div>
                )}
                {actionLabels.tasks.map((a) => (
                  <SelectItem key={`t:${a}`} value={a}>
                    {a}
                  </SelectItem>
                ))}
                {actionLabels.transitions.length > 0 && (
                  <div className="mt-1 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Pārejas
                  </div>
                )}
                {actionLabels.transitions.map((a) => (
                  <SelectItem key={`x:${a}`} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasNext && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="owner">Atbildīgais</Label>
                <UserPicker value={ownerId} onChange={setOwnerId} />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Termiņš<span className="text-destructive"> *</span>
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !due && "text-muted-foreground",
                      )}
                      type="button"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {due ? format(due, "yyyy-MM-dd") : "Izvēlies datumu"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={due}
                      onSelect={setDue}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}
          {error && (
            <p className="text-xs text-destructive" role="alert">{error}</p>
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
            onClick={handleSubmit}
            disabled={submitting || dueRequiredMissing}
          >
            {submitting ? "Saglabā…" : "Pabeigt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}