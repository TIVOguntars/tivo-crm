import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CheckSquare,
  ListTodo,
  Mail,
  MessageCircle,
  Phone,
  UserPlus2,
  Wallet,
  X,
  ChevronDown,
  Loader2,
  Search,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { callCrmRpc } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { statusRank } from "@/lib/statusRank";

/* ----------------------- Types ----------------------- */

export interface BulkPatch {
  status?: string;
  owner?: string;
  ppv?: string;
  next_action?: string;
  next_action_due?: string | null;
  last_activity?: string | null;
}

export interface BulkActionsBarProps {
  selectedIds: string[];
  options: {
    statuses: string[];
    owners: string[];
    ppvs: string[];
  };
  /** Current status per lead — used to detect backwards moves. */
  currentStatus: Record<string, string>;
  onClear: () => void;
  onPatchMany: (ids: string[], patch: BulkPatch) => void;
  /** Roll back optimistic patches for these ids. */
  onRollbackMany: (ids: string[], previous: Record<string, BulkPatch>) => void;
}

/* ----------------------- Bar ----------------------- */

export function BulkActionsBar(props: BulkActionsBarProps) {
  const { selectedIds, onClear } = props;
  const count = selectedIds.length;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 shadow-sm">
      <span className="text-xs font-semibold text-foreground">
        Atlasīti: {count}
      </span>
      <div className="mx-1 h-4 w-px bg-border" aria-hidden />

      <BulkStatusAction {...props} />
      <BulkOwnerAction {...props} />
      <BulkPpvAction {...props} />
      <BulkTaskAction {...props} />
      <BulkMessageAction {...props} />

      <Button
        size="sm"
        variant="ghost"
        className="ml-auto h-7 gap-1 text-xs text-muted-foreground"
        onClick={onClear}
      >
        <X className="h-3 w-3" />
        Notīrīt izvēli
      </Button>
    </div>
  );
}

/* ----------------------- Shared search dropdown ----------------------- */

function SearchableList({
  options,
  value,
  onSelect,
  placeholder,
}: {
  options: string[];
  value: string;
  onSelect: (v: string) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      options.filter((o) =>
        q ? o.toLowerCase().includes(q.toLowerCase()) : true,
      ),
    [options, q],
  );
  return (
    <>
      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="h-7 w-full rounded border border-input bg-background pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            Nav rezultātu
          </div>
        ) : (
          filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onSelect(opt)}
              className={cn(
                "flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-muted/50",
                value === opt && "bg-primary/10 text-foreground",
              )}
            >
              <span className="truncate">{opt}</span>
            </button>
          ))
        )}
      </div>
    </>
  );
}

/* ----------------------- helpers ----------------------- */

function ActionButton({
  open,
  setOpen,
  icon,
  label,
  children,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs">
          {icon}
          {label}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function useBulkRpc() {
  const call = useServerFn(callCrmRpc);
  return useMutation({
    mutationFn: async (input: {
      fn:
        | "bulk_change_lead_status"
        | "bulk_assign_owner"
        | "bulk_assign_ppv"
        | "bulk_create_task"
        | "log_lead_communication";
      params: Record<string, unknown>;
    }) => {
      const res = await call({ data: input });
      if (res.error) throw new Error(res.error);
      return res.rows;
    },
  });
}

function snapshot(
  ids: string[],
  src: Record<string, string>,
  key: keyof BulkPatch,
): Record<string, BulkPatch> {
  const out: Record<string, BulkPatch> = {};
  ids.forEach((id) => {
    out[id] = { [key]: src[id] ?? "" } as BulkPatch;
  });
  return out;
}

/* ----------------------- Status ----------------------- */

function BulkStatusAction({
  selectedIds,
  options,
  currentStatus,
  onPatchMany,
  onRollbackMany,
}: BulkActionsBarProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const m = useBulkRpc();

  const backwardsCount = useMemo(() => {
    if (!value) return 0;
    const targetRank = statusRank(value);
    if (targetRank === 0) return 0;
    return selectedIds.filter((id) => {
      const cur = currentStatus[id] || "";
      const r = statusRank(cur);
      return r > 0 && targetRank > 0 && targetRank < r;
    }).length;
  }, [value, selectedIds, currentStatus]);

  const requiresConfirm = backwardsCount > 0;

  const submit = async () => {
    if (!value) return;
    if (requiresConfirm && !confirm) {
      setConfirm(true);
      return;
    }
    const prev = snapshot(selectedIds, currentStatus, "status");
    onPatchMany(selectedIds, {
      status: value,
      last_activity: new Date().toISOString(),
    });
    try {
      await m.mutateAsync({
        fn: "bulk_change_lead_status",
        params: {
          lead_ids: selectedIds,
          new_status: value,
          reason: reason || null,
        },
      });
      toast.success(`Statuss atjaunināts: ${selectedIds.length}`);
      setOpen(false);
      setValue("");
      setReason("");
      setConfirm(false);
    } catch (e) {
      onRollbackMany(selectedIds, prev);
      toast.error(
        `Neizdevās mainīt statusu: ${e instanceof Error ? e.message : "kļūda"}`,
      );
    }
  };

  return (
    <ActionButton
      open={open}
      setOpen={(o) => {
        setOpen(o);
        if (!o) setConfirm(false);
      }}
      icon={<CheckSquare className="h-3.5 w-3.5" />}
      label="Mainīt statusu"
    >
      <div className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
        Mainīt statusu {selectedIds.length} leadiem
      </div>
      <SearchableList
        options={options.statuses}
        value={value}
        onSelect={setValue}
        placeholder="Meklēt statusu"
      />
      <div className="space-y-2 border-t border-border p-2">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Iemesls / piezīme (neobligāti)"
          className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {requiresConfirm && (
          <div className="flex items-start gap-1.5 rounded border border-[var(--tivo-orange-border)] bg-[var(--tivo-orange-soft)] px-2 py-1.5 text-[11px] text-[var(--tivo-orange)]">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              {backwardsCount} leadiem statuss tiek pārvietots atpakaļ piltuvē.
              {confirm ? " Apstipriniet, ja tas ir paredzēts." : ""}
            </span>
          </div>
        )}
        <Button
          size="sm"
          className="h-7 w-full text-xs"
          disabled={!value || m.isPending}
          onClick={submit}
        >
          {m.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {requiresConfirm && !confirm
            ? "Turpināt"
            : confirm
              ? "Apstiprināt un atjaunināt"
              : "Atjaunināt"}
        </Button>
      </div>
    </ActionButton>
  );
}

/* ----------------------- Owner ----------------------- */

function BulkOwnerAction({
  selectedIds,
  options,
  onPatchMany,
  onRollbackMany,
}: BulkActionsBarProps) {
  const [open, setOpen] = useState(false);
  const m = useBulkRpc();

  const apply = async (owner: string) => {
    const prev: Record<string, BulkPatch> = {};
    selectedIds.forEach((id) => (prev[id] = { owner: "" }));
    onPatchMany(selectedIds, { owner });
    try {
      await m.mutateAsync({
        fn: "bulk_assign_owner",
        params: { lead_ids: selectedIds, owner_id: owner },
      });
      toast.success(`Atbildīgais piešķirts: ${selectedIds.length}`);
      setOpen(false);
    } catch (e) {
      onRollbackMany(selectedIds, prev);
      toast.error(
        `Neizdevās piešķirt: ${e instanceof Error ? e.message : "kļūda"}`,
      );
    }
  };

  return (
    <ActionButton
      open={open}
      setOpen={setOpen}
      icon={<UserPlus2 className="h-3.5 w-3.5" />}
      label="Piešķirt atbildīgo"
    >
      <div className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
        Piešķirt atbildīgo {selectedIds.length} leadiem
      </div>
      <SearchableList
        options={options.owners}
        value=""
        onSelect={apply}
        placeholder="Meklēt darbinieku"
      />
      {m.isPending && (
        <div className="flex items-center gap-1 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Saglabā…
        </div>
      )}
    </ActionButton>
  );
}

/* ----------------------- PPV ----------------------- */

function BulkPpvAction({
  selectedIds,
  options,
  onPatchMany,
  onRollbackMany,
}: BulkActionsBarProps) {
  const [open, setOpen] = useState(false);
  const m = useBulkRpc();

  const apply = async (ppv: string) => {
    const prev: Record<string, BulkPatch> = {};
    selectedIds.forEach((id) => (prev[id] = { ppv: "" }));
    onPatchMany(selectedIds, { ppv });
    try {
      await m.mutateAsync({
        fn: "bulk_assign_ppv",
        params: { lead_ids: selectedIds, ppv_user_id: ppv },
      });
      toast.success(`PPV piešķirts: ${selectedIds.length}`);
      setOpen(false);
    } catch (e) {
      onRollbackMany(selectedIds, prev);
      toast.error(
        `Neizdevās piešķirt PPV: ${e instanceof Error ? e.message : "kļūda"}`,
      );
    }
  };

  return (
    <ActionButton
      open={open}
      setOpen={setOpen}
      icon={<Wallet className="h-3.5 w-3.5" />}
      label="Piešķirt PPV"
    >
      <div className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
        Piešķirt PPV {selectedIds.length} leadiem
      </div>
      <SearchableList
        options={options.ppvs}
        value=""
        onSelect={apply}
        placeholder="Meklēt PPV"
      />
      {m.isPending && (
        <div className="flex items-center gap-1 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Saglabā…
        </div>
      )}
    </ActionButton>
  );
}

/* ----------------------- Task ----------------------- */

function BulkTaskAction({
  selectedIds,
  options,
  onPatchMany,
}: BulkActionsBarProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [owner, setOwner] = useState("");
  const [note, setNote] = useState("");
  const m = useBulkRpc();

  const submit = async () => {
    if (!title.trim()) return;
    try {
      await m.mutateAsync({
        fn: "bulk_create_task",
        params: {
          lead_ids: selectedIds,
          title: title.trim(),
          due_at: due ? new Date(due).toISOString() : null,
          owner_id: owner || null,
          note: note || null,
        },
      });
      onPatchMany(selectedIds, {
        next_action: title.trim(),
        next_action_due: due || null,
        last_activity: new Date().toISOString(),
      });
      toast.success(`Uzdevumi izveidoti: ${selectedIds.length}`);
      setOpen(false);
      setTitle("");
      setDue("");
      setOwner("");
      setNote("");
    } catch (e) {
      toast.error(
        `Neizdevās izveidot uzdevumus: ${e instanceof Error ? e.message : "kļūda"}`,
      );
    }
  };

  return (
    <ActionButton
      open={open}
      setOpen={setOpen}
      icon={<ListTodo className="h-3.5 w-3.5" />}
      label="Izveidot uzdevumu"
    >
      <div className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
        Izveidot uzdevumu {selectedIds.length} leadiem
      </div>
      <div className="space-y-2 p-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Uzdevuma nosaukums"
          className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <input
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Atbildīgais (neobligāti)</option>
          {options.owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Piezīme (neobligāti)"
          rows={2}
          className="w-full resize-none rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          size="sm"
          className="h-7 w-full text-xs"
          disabled={!title.trim() || m.isPending}
          onClick={submit}
        >
          {m.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Izveidot
        </Button>
      </div>
    </ActionButton>
  );
}

/* ----------------------- Message ----------------------- */

function BulkMessageAction({
  selectedIds,
  onPatchMany,
}: BulkActionsBarProps) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"email" | "whatsapp" | "sms">("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const m = useBulkRpc();

  const submit = async () => {
    if (!body.trim()) return;
    try {
      const summary =
        channel === "email" && subject.trim()
          ? `${subject.trim()} — ${body.trim()}`
          : body.trim();
      await Promise.all(
        selectedIds.map((id) =>
          m.mutateAsync({
            fn: "log_lead_communication",
            params: {
              lead_id: id,
              channel,
              direction: "outbound",
              summary,
            },
          }),
        ),
      );
      onPatchMany(selectedIds, {
        last_activity: new Date().toISOString(),
      });
      toast.success(`Ziņa nosūtīta: ${selectedIds.length}`);
      setOpen(false);
      setSubject("");
      setBody("");
    } catch (e) {
      toast.error(
        `Neizdevās nosūtīt: ${e instanceof Error ? e.message : "kļūda"}`,
      );
    }
  };

  return (
    <ActionButton
      open={open}
      setOpen={setOpen}
      icon={<MessageCircle className="h-3.5 w-3.5" />}
      label="Sūtīt ziņu"
    >
      <div className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
        Sūtīt ziņu {selectedIds.length} leadiem
      </div>
      <div className="space-y-2 p-2">
        <div className="flex gap-1">
          {(
            [
              { k: "email", label: "E-pasts", icon: <Mail className="h-3 w-3" /> },
              {
                k: "whatsapp",
                label: "WhatsApp",
                icon: <MessageCircle className="h-3 w-3" />,
              },
              { k: "sms", label: "SMS", icon: <Phone className="h-3 w-3" /> },
            ] as const
          ).map((c) => (
            <button
              key={c.k}
              type="button"
              onClick={() => setChannel(c.k)}
              className={cn(
                "inline-flex h-6 flex-1 items-center justify-center gap-1 rounded border text-[11px]",
                channel === c.k
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted/50",
              )}
            >
              {c.icon}
              {c.label}
            </button>
          ))}
        </div>
        {channel === "email" && (
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Tēma"
            className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Ziņas teksts"
          rows={4}
          className="w-full resize-none rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          size="sm"
          className="h-7 w-full text-xs"
          disabled={!body.trim() || m.isPending}
          onClick={submit}
        >
          {m.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Nosūtīt
        </Button>
      </div>
    </ActionButton>
  );
}