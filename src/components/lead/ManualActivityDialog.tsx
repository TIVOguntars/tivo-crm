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

  useEffect(() => {
    if (open) {
      setKind("note");
      setActivityAt(toLocalInputValue(new Date()));
      setSummary("");
      setOutcome("");
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
    const params = buildLogActivityParams({
      leadId,
      performedByUserId: operatorId,
      input: { kind, activityAt: isoActivityAt, summary, outcome },
    });
    try {
      await mut.mutateAsync(params);
      toast.success("Darbība pievienota");
      qc.invalidateQueries({ queryKey: ["crm-rpc", "get_lead_360_profile"] });
      qc.invalidateQueries({ queryKey: ["crm", "v_unified_timeline"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(
        `Neizdevās saglabāt: ${err instanceof Error ? err.message : "kļūda"}`,
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pievienot darbību</DialogTitle>
          <DialogDescription>
            Manuāli reģistrēt piezīmi, zvanu vai tikšanos šim leadam.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Veids</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ManualKind)} disabled={mut.isPending}>
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
              disabled={mut.isPending}
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
              disabled={mut.isPending}
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
              disabled={mut.isPending}
              className="mt-1 h-9 text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Atcelt
          </Button>
          <Button onClick={onSubmit} disabled={mut.isPending || !summary.trim()}>
            {mut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Saglabāt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}