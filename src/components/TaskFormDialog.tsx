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
import { callCrmRpc } from "@/server/analytics";
import { useCrmView } from "@/hooks/useCrmView";

type Priority = "low" | "normal" | "high";
type TaskType = "follow_up" | "call" | "email" | "review" | "custom";

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: "follow_up", label: "Sekošana" },
  { value: "call", label: "Zvans" },
  { value: "email", label: "E-pasts" },
  { value: "review", label: "Pārskats" },
  { value: "custom", label: "Cits" },
];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "low", label: "Zema" },
  { value: "normal", label: "Normāla" },
  { value: "high", label: "Augsta" },
];

function defaultDueLocal(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

type LeadRow = Record<string, unknown>;

function s(v: unknown): string {
  return v == null ? "" : String(v);
}

export function TaskFormDialog({
  leadId,
  open,
  onOpenChange,
  onCreated,
  defaultOwnerLabel,
}: {
  leadId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  defaultOwnerLabel?: string;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [taskType, setTaskType] = useState<TaskType>("follow_up");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueLocal, setDueLocal] = useState<string>(defaultDueLocal());
  const [priority, setPriority] = useState<Priority>("normal");

  // Lead picker (only when leadId not provided)
  const [leadQuery, setLeadQuery] = useState("");
  const [pickedLeadId, setPickedLeadId] = useState<string>("");
  const [pickedLeadLabel, setPickedLeadLabel] = useState<string>("");

  const needsPicker = !leadId;
  const trimmedQuery = leadQuery.trim();
  const leadSearchQuery = useMemo(() => {
    if (!needsPicker || trimmedQuery.length < 2) return undefined;
    const escaped = trimmedQuery.replace(/[%,()*]/g, " ").trim();
    if (!escaped) return undefined;
    const pattern = `*${escaped}*`;
    const or = [
      `display_name.ilike.${pattern}`,
      `contact_full_name.ilike.${pattern}`,
      `email_normalized.ilike.${pattern}`,
    ].join(",");
    return `select=lead_id,display_name,contact_full_name,email_normalized&or=(${or})&limit=10`;
  }, [needsPicker, trimmedQuery]);

  const leadsResult = useCrmView(
    "leads_list_display",
    leadSearchQuery,
  );
  const leadResults: LeadRow[] = needsPicker && leadSearchQuery
    ? ((leadsResult.data?.rows ?? []) as LeadRow[])
    : [];

  const effectiveLeadId = leadId ?? pickedLeadId;

  // Reset form whenever dialog opens
  useEffect(() => {
    if (open) {
      setTaskType("follow_up");
      setTitle("");
      setDescription("");
      setDueLocal(defaultDueLocal());
      setPriority("normal");
      setLeadQuery("");
      setPickedLeadId("");
      setPickedLeadLabel("");
    }
  }, [open]);

  const canSubmit =
    !busy &&
    !!effectiveLeadId &&
    !!title.trim() &&
    !!dueLocal &&
    !!taskType;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    let iso: string;
    try {
      const d = new Date(dueLocal);
      if (Number.isNaN(d.getTime())) throw new Error("invalid");
      iso = d.toISOString();
    } catch {
      toast.error("Nederīgs termiņš");
      return;
    }
    setBusy(true);
    try {
      const res = await callCrmRpc({
        data: {
          fn: "rpc_create_task",
          params: {
            p_lead_id: effectiveLeadId,
            p_task_type: taskType,
            p_due_at: iso,
            p_title: title.trim(),
            p_description: description.trim() || null,
            p_assigned_user_id: null,
            p_required_role: null,
            p_workflow_instance_id: null,
            p_parent_task_id: null,
            p_metadata: { source: "manual_ui" },
            p_metadata: {
              source: "manual_ui",
              ...(defaultOwnerLabel ? { owner_label: defaultOwnerLabel } : {}),
            },
            p_is_auto_created: false,
            p_priority: priority,
          },
        },
      });
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Uzdevums izveidots");
      await qc.invalidateQueries({ queryKey: ["crm"] });
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nezināma kļūda");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Jauns uzdevums</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {needsPicker && (
            <div className="space-y-1.5">
              <Label htmlFor="task-lead-search">Lead</Label>
              {pickedLeadId ? (
                <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                  <span className="truncate">{pickedLeadLabel || pickedLeadId}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() => {
                      setPickedLeadId("");
                      setPickedLeadLabel("");
                    }}
                  >
                    Mainīt
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    id="task-lead-search"
                    placeholder="Meklē pēc vārda vai e-pasta…"
                    value={leadQuery}
                    onChange={(e) => setLeadQuery(e.target.value)}
                  />
                  {trimmedQuery.length >= 2 && (
                    <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                      {leadsResult.isLoading ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          Meklē…
                        </div>
                      ) : leadResults.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          Nav rezultātu
                        </div>
                      ) : (
                        leadResults.map((r) => {
                          const id = s(r.lead_id);
                          const label =
                            s(r.display_name) ||
                            s(r.contact_full_name) ||
                            s(r.email_normalized) ||
                            id;
                          return (
                            <button
                              key={id}
                              type="button"
                              className="block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-accent"
                              onClick={() => {
                                setPickedLeadId(id);
                                setPickedLeadLabel(label);
                              }}
                            >
                              {label}
                              {s(r.email_normalized) &&
                              s(r.email_normalized) !== label ? (
                                <span className="ml-2 text-muted-foreground">
                                  {s(r.email_normalized)}
                                </span>
                              ) : null}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="task-type">Tips</Label>
            <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
              <SelectTrigger id="task-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-title">Virsraksts *</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Piem. Atzvanīt klientam"
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Apraksts</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Neobligāts"
              rows={3}
              maxLength={2000}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Termiņš *</Label>
              <Input
                id="task-due"
                type="datetime-local"
                value={dueLocal}
                onChange={(e) => setDueLocal(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-priority">Prioritāte</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as Priority)}
              >
                <SelectTrigger id="task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

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
            {busy ? "Saglabā…" : "Izveidot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}