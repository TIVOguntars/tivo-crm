import { useMemo, useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
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
import { callCrmRpc } from "@/server/analytics";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import { statusRank } from "@/lib/statusRank";

type Row = Record<string, unknown>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  currentStatus: string;
  currentOwnerId: string | null;
  currentPpvId: string | null;
}

const REASON_MAX = 500;

function useCrmMutation() {
  const call = useServerFn(callCrmRpc);
  return useMutation({
    mutationFn: async (input: {
      fn:
        | "bulk_change_lead_status"
        | "bulk_assign_owner"
        | "bulk_assign_ppv";
      params: Record<string, unknown>;
    }) => {
      const res = await call({ data: input });
      if (res.error) throw new Error(res.error);
      return res.rows;
    },
  });
}

export function LeadEditPanel({
  open,
  onOpenChange,
  leadId,
  currentStatus,
  currentOwnerId,
  currentPpvId,
}: Props) {
  const qc = useQueryClient();

  const invalidateLead = () => {
    // Partial keys: react-query matches by prefix.
    qc.invalidateQueries({ queryKey: ["crm-rpc", "get_lead_360_profile"] });
    qc.invalidateQueries({ queryKey: ["crm", "leads_list_display_v3"] });
    qc.invalidateQueries({ queryKey: ["crm", "v_lead_planned_actions"] });
    qc.invalidateQueries({ queryKey: ["crm", "tasks"] });
    qc.invalidateQueries({ queryKey: ["analytics", "leads_list_v2"] });
  };

  /* -------- Status section -------- */
  const filterOptionsQ = useAnalyticsView("filter_options", "limit=1", {
    enabled: open,
  });
  const statusOptions = useMemo<string[]>(() => {
    const rows = (filterOptionsQ.data?.rows ?? []) as Row[];
    const fo = rows[0];
    const list = fo?.statuses;
    if (!Array.isArray(list)) return [];
    return Array.from(
      new Set(list.map((v) => String(v)).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b, "lv"));
  }, [filterOptionsQ.data]);

  const [statusValue, setStatusValue] = useState<string>(currentStatus ?? "");
  const [statusReason, setStatusReason] = useState<string>("");
  const [statusConfirm, setStatusConfirm] = useState(false);
  const statusMut = useCrmMutation();

  // Re-sync local state when panel re-opens or upstream value changes.
  useEffect(() => {
    if (open) {
      setStatusValue(currentStatus ?? "");
      setStatusReason("");
      setStatusConfirm(false);
    }
  }, [open, currentStatus]);

  const statusDirty =
    !!statusValue && statusValue !== (currentStatus ?? "");
  const targetRank = statusRank(statusValue);
  const currentRank = statusRank(currentStatus ?? "");
  const isBackwards =
    statusDirty && targetRank > 0 && currentRank > 0 && targetRank < currentRank;

  const submitStatus = async () => {
    if (!statusDirty) return;
    if (isBackwards && !statusConfirm) {
      setStatusConfirm(true);
      return;
    }
    const reason = statusReason.trim().slice(0, REASON_MAX) || null;
    try {
      await statusMut.mutateAsync({
        fn: "bulk_change_lead_status",
        params: {
          lead_ids: [leadId],
          new_status: statusValue,
          reason,
        },
      });
      toast.success("Izmaiņas saglabātas");
      setStatusReason("");
      setStatusConfirm(false);
      invalidateLead();
    } catch (err) {
      toast.error(
        `Neizdevās saglabāt: ${err instanceof Error ? err.message : "kļūda"}`,
      );
    }
  };

  /* -------- Owner section -------- */
  const [ownerValue, setOwnerValue] = useState<string | null>(
    currentOwnerId ?? null,
  );
  const ownerMut = useCrmMutation();
  useEffect(() => {
    if (open) setOwnerValue(currentOwnerId ?? null);
  }, [open, currentOwnerId]);
  const ownerDirty = (ownerValue ?? null) !== (currentOwnerId ?? null);

  const submitOwner = async () => {
    if (!ownerDirty) return;
    try {
      await ownerMut.mutateAsync({
        fn: "bulk_assign_owner",
        params: { lead_ids: [leadId], owner_id: ownerValue },
      });
      toast.success("Izmaiņas saglabātas");
      invalidateLead();
    } catch (err) {
      toast.error(
        `Neizdevās saglabāt: ${err instanceof Error ? err.message : "kļūda"}`,
      );
    }
  };

  /* -------- PPV section -------- */
  const [ppvValue, setPpvValue] = useState<string | null>(currentPpvId ?? null);
  const ppvMut = useCrmMutation();
  useEffect(() => {
    if (open) setPpvValue(currentPpvId ?? null);
  }, [open, currentPpvId]);
  const ppvDirty = (ppvValue ?? null) !== (currentPpvId ?? null);

  const submitPpv = async () => {
    if (!ppvDirty) return;
    try {
      await ppvMut.mutateAsync({
        fn: "bulk_assign_ppv",
        params: { lead_ids: [leadId], ppv_user_id: ppvValue },
      });
      toast.success("Izmaiņas saglabātas");
      invalidateLead();
    } catch (err) {
      toast.error(
        `Neizdevās saglabāt: ${err instanceof Error ? err.message : "kļūda"}`,
      );
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>Rediģēt leadu</SheetTitle>
          <SheetDescription>
            Rediģējami tikai CRM lauki. Smartsheet sinhronizētie lauki paliek
            tikai lasāmi.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Status */}
          <section className="rounded-md border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm font-semibold">Statuss</Label>
              {statusDirty && (
                <span className="text-[11px] text-muted-foreground">
                  Nesaglabātas izmaiņas
                </span>
              )}
            </div>
            <Select
              value={statusValue}
              onValueChange={(v) => {
                setStatusValue(v);
                setStatusConfirm(false);
              }}
              disabled={statusMut.isPending || filterOptionsQ.isLoading}
            >
              <SelectTrigger className="h-9">
                <SelectValue
                  placeholder={
                    filterOptionsQ.isLoading ? "Ielādē…" : "Izvēlēties statusu"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
                {/* Allow keeping current status even if not in options. */}
                {currentStatus && !statusOptions.includes(currentStatus) && (
                  <SelectItem value={currentStatus}>{currentStatus}</SelectItem>
                )}
              </SelectContent>
            </Select>

            <div className="mt-2">
              <Label className="text-xs text-muted-foreground">
                Iemesls (neobligāti)
              </Label>
              <Textarea
                value={statusReason}
                onChange={(e) =>
                  setStatusReason(e.target.value.slice(0, REASON_MAX))
                }
                placeholder="Īss skaidrojums…"
                rows={2}
                className="mt-1 text-xs"
              />
              <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
                {statusReason.length}/{REASON_MAX}
              </div>
            </div>

            {isBackwards && (
              <div className="mt-2 flex items-start gap-1.5 rounded border border-[var(--tivo-orange-border)] bg-[var(--tivo-orange-soft)] px-2 py-1.5 text-[11px] text-[var(--tivo-orange)]">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  Statusa pazemināšana — pārvieto leadu atpakaļ piltuvē.
                  {statusConfirm ? " Apstipriniet, ja tas ir paredzēts." : ""}
                </span>
              </div>
            )}

            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={!statusDirty || statusMut.isPending}
                onClick={() => {
                  setStatusValue(currentStatus ?? "");
                  setStatusReason("");
                  setStatusConfirm(false);
                }}
              >
                Atcelt
              </Button>
              <Button
                size="sm"
                disabled={!statusDirty || statusMut.isPending}
                onClick={submitStatus}
              >
                {statusMut.isPending && (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                )}
                {isBackwards && !statusConfirm
                  ? "Turpināt"
                  : isBackwards && statusConfirm
                    ? "Apstiprināt un saglabāt"
                    : "Saglabāt"}
              </Button>
            </div>
          </section>

          {/* Owner */}
          <section className="rounded-md border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm font-semibold">Atbildīgais</Label>
              {ownerDirty && (
                <span className="text-[11px] text-muted-foreground">
                  Nesaglabātas izmaiņas
                </span>
              )}
            </div>
            <UserPicker
              value={ownerValue}
              onChange={setOwnerValue}
              disabled={ownerMut.isPending}
              placeholder="Nav piešķirts"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={!ownerDirty || ownerMut.isPending}
                onClick={() => setOwnerValue(currentOwnerId ?? null)}
              >
                Atcelt
              </Button>
              <Button
                size="sm"
                disabled={!ownerDirty || ownerMut.isPending}
                onClick={submitOwner}
              >
                {ownerMut.isPending && (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                )}
                Saglabāt
              </Button>
            </div>
          </section>

          {/* PPV */}
          <section className="rounded-md border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm font-semibold">PPV</Label>
              {ppvDirty && (
                <span className="text-[11px] text-muted-foreground">
                  Nesaglabātas izmaiņas
                </span>
              )}
            </div>
            <UserPicker
              value={ppvValue}
              onChange={setPpvValue}
              disabled={ppvMut.isPending}
              placeholder="Nav piešķirts"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={!ppvDirty || ppvMut.isPending}
                onClick={() => setPpvValue(currentPpvId ?? null)}
              >
                Atcelt
              </Button>
              <Button
                size="sm"
                disabled={!ppvDirty || ppvMut.isPending}
                onClick={submitPpv}
              >
                {ppvMut.isPending && (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                )}
                Saglabāt
              </Button>
            </div>
          </section>

          <p className="rounded-md bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">
            Labojumi pārējiem laukiem (vārds, telefons, e-pasts, tagi u.c.)
            jāveic caur labojuma pieprasījumu.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}