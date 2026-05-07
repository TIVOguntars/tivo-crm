import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
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

const NEXT_ACTIONS = [
  "Zvanīt",
  "SMS",
  "WhatsApp",
  "E-pasts",
  "Pārdošana",
  "Piedāvājums",
  "Tāmēšana",
  "Skice apjomi",
  "Gaidu projektu",
];

const NONE = "__none__";

export function CompleteActionModal({
  open,
  onOpenChange,
  leadId,
  defaultOwner,
  isHumanPrimary,
  visibleAction,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string | null;
  defaultOwner: string;
  isHumanPrimary?: boolean;
  visibleAction?: string;
  onCompleted: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [nextAction, setNextAction] = useState<string>(NONE);
  const [owner, setOwner] = useState<string>("");
  const [due, setDue] = useState<Date | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setNextAction(NONE);
      setOwner(defaultOwner ?? "");
      setDue(undefined);
      setError(null);
      setSubmitting(false);
    }
  }, [open, defaultOwner]);

  const hasNext = nextAction !== NONE && nextAction !== "";
  const dueRequiredMissing = hasNext && !due;

  const handleSubmit = async () => {
    if (!leadId) return;
    if (!isHumanPrimary || !visibleAction || !visibleAction.trim()) {
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
      const res = await callCrmRpc({
        data: {
          fn: "complete_human_action",
          params: {
            p_lead_id: leadId,
            p_completed_by: null,
            p_completion_note: note.trim() ? note.trim() : null,
            p_next_action: hasNext ? nextAction : null,
            p_next_owner: hasNext && owner.trim() ? owner.trim() : null,
            p_next_due_date:
              hasNext && due ? format(due, "yyyy-MM-dd") : null,
          },
        },
      });
      if (res.error) {
        setError(res.error);
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
                {NEXT_ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasNext && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="owner">Atbildīgais</Label>
                <Input
                  id="owner"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="Neobligāti"
                />
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