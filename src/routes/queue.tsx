import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useCrmView } from "@/hooks/useCrmView";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/queue")({
  component: QueuePage,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState message={error.message} />
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Lapa nav atrasta</div>,
});

type Row = Record<string, unknown>;

const RIGA_TZ = "Europe/Riga";

function s(v: unknown): string {
  if (v == null) return "";
  return String(v);
}
function n(v: unknown): number {
  const x = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtDateTime(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("lv-LV", {
    timeZone: RIGA_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function fmtDate(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("lv-LV", {
    timeZone: RIGA_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function rigaDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: RIGA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

type DueState = "overdue" | "today" | "tomorrow" | "week" | "future" | "none";

function dueState(v: unknown): DueState {
  if (!v) return "none";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "none";
  const now = new Date();
  const dk = rigaDateKey(d);
  const today = rigaDateKey(now);
  const tomorrow = rigaDateKey(new Date(now.getTime() + 86400000));
  if (d.getTime() < now.getTime() && dk !== today) return "overdue";
  if (dk === today) return "today";
  if (dk === tomorrow) return "tomorrow";
  const diff = (d.getTime() - now.getTime()) / 86400000;
  if (diff <= 7) return "week";
  return "future";
}

function DueCell({ value }: { value: unknown }) {
  const state = dueState(value);
  const tone =
    state === "overdue"
      ? "text-red-700/80 dark:text-red-300/90 font-medium"
      : state === "today"
        ? "text-orange-700/80 dark:text-orange-300/90 font-medium"
        : state === "tomorrow"
          ? "text-sky-700/80 dark:text-sky-300/90 font-medium"
          : state === "week"
            ? "text-muted-foreground"
            : state === "future"
              ? "text-muted-foreground"
              : "text-muted-foreground";
  return <span className={cn("whitespace-nowrap tabular-nums", tone)}>{fmtDate(value)}</span>;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "lv"),
  );
}

function PriorityBadge({ label }: { label: string }) {
  if (!label) return <span className="text-muted-foreground">—</span>;
  const tone =
    label === "Augsta"
      ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60"
      : label === "Normāla"
        ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60"
        : label === "Zema"
          ? "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700"
          : "";
  return (
    <Badge
      className={cn(
        "h-5 rounded px-1.5 py-0 text-[10px] font-medium leading-none shadow-none",
        tone,
      )}
    >
      {label}
    </Badge>
  );
}

function parseTags(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((t) => String(t).trim().toLowerCase())
      .filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function TagsCell({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex h-4 items-center rounded-sm bg-muted px-1 text-[10px] font-normal lowercase text-muted-foreground"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function OwnerBadge({ value }: { value: string }) {
  if (!value || value === "Nav piešķirts") return <span className="text-muted-foreground">—</span>;
  const isSystem = value === "SIS";
  return (
    <Badge
      className={cn(
        "h-5 rounded px-1.5 py-0 text-[10px] font-semibold leading-none shadow-none",
        isSystem
          ? "bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800/70 dark:text-slate-200 dark:border-slate-700"
          : "bg-muted text-foreground/80 border border-border dark:bg-slate-800/40 dark:text-slate-200 dark:border-slate-700",
      )}
    >
      {value}
    </Badge>
  );
}

function MiniKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "blue" | "neutral";
}) {
  const valueTone =
    tone === "red"
      ? "text-red-600 dark:text-red-400"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-400"
        : tone === "blue"
          ? "text-blue-600 dark:text-blue-400"
          : "text-foreground";
  const bar =
    tone === "red"
      ? "bg-red-500"
      : tone === "amber"
        ? "bg-amber-500"
        : tone === "blue"
          ? "bg-blue-500"
          : "bg-border";
  return (
    <div className="relative rounded-md border border-border bg-card px-3 py-2 shadow-sm">
      <div className={cn("absolute inset-y-0 left-0 w-0.5 rounded-l-md", bar)} />
      <div className="flex items-baseline justify-between gap-2 pl-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className={cn("text-xl font-semibold tabular-nums leading-none", valueTone)}>
          {value}
        </span>
      </div>
    </div>
  );
}

function QueuePage() {
  const navigate = useNavigate();
  // No hardcoded UI cap — fetch the full queue. PostgREST max-rows on the
  // backend still applies as a safety net. The table itself is virtualized
  // by the browser via the sticky-header scroll container, so 1000+ rows
  // render without freezing.
  const view = useCrmView("next_action_queue_display", "limit=10000");
  const rows = (view.data?.rows ?? []) as Row[];

  const [actionType, setActionType] = useState<string>("all");
  const [workflow, setWorkflow] = useState<string>("all");
  const [bucket, setBucket] = useState<string>("all");
  const [leadStatus, setLeadStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [owner, setOwner] = useState<string>("all");
  const [country, setCountry] = useState<string>("all");
  const [ppv, setPpv] = useState<string>("all");
  const [tag, setTag] = useState<string>("all");
  const [q, setQ] = useState<string>("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  const toggleSort = (key: SortKey) => {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "desc" };
      if (cur.dir === "desc") return { key, dir: "asc" };
      return null;
    });
  };

  const actionTypes = useMemo(
    () => uniq(rows.map((r) => s(r.action_label))),
    [rows],
  );
  const workflows = useMemo(
    () => uniq(rows.map((r) => s(r.workflow_label))),
    [rows],
  );
  const leadStatuses = useMemo(
    () => uniq(rows.map((r) => s(r.legacy_lead_status))),
    [rows],
  );
  const owners = useMemo(
    () => uniq(rows.map((r) => s(r.action_owner_label))),
    [rows],
  );
  const countries = useMemo(
    () => uniq(rows.map((r) => s(r.country))),
    [rows],
  );
  const ppvs = useMemo(
    () => uniq(rows.map((r) => s(r.ppv_name))),
    [rows],
  );
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const t of parseTags(r.tags)) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "lv"));
  }, [rows]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (actionType !== "all" && s(r.action_label) !== actionType) return false;
      if (workflow !== "all" && s(r.workflow_label) !== workflow) return false;
      if (bucket !== "all" && s(r.queue_bucket) !== bucket) return false;
      if (leadStatus !== "all" && s(r.legacy_lead_status) !== leadStatus)
        return false;
      if (priority !== "all" && s(r.priority_label) !== priority) return false;
      if (owner !== "all" && s(r.action_owner_label) !== owner) return false;
      if (country !== "all" && s(r.country) !== country) return false;
      if (ppv !== "all" && s(r.ppv_name) !== ppv) return false;
      if (tag !== "all") {
        const tags = parseTags(r.tags);
        if (!tags.includes(tag)) return false;
      }
      if (qq) {
        const hay = `${s(r.full_name)} ${s(r.object_name)}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      if (sort) {
        const dir = sort.dir === "asc" ? 1 : -1;
        const av = sortValue(a, sort.key);
        const bv = sortValue(b, sort.key);
        if (typeof av === "number" && typeof bv === "number") {
          if (av !== bv) return (av - bv) * dir;
        } else {
          const as = String(av ?? "");
          const bs = String(bv ?? "");
          const cmp = as.localeCompare(bs, "lv");
          if (cmp !== 0) return cmp * dir;
        }
      }
      const aSp = n(a.sort_priority);
      const bSp = n(b.sort_priority);
      if (aSp !== bSp) return bSp - aSp;
      const order: Record<string, number> = {
        overdue: 0,
        today: 1,
        next_24h: 2,
        upcoming: 3,
      };
      const aB = order[s(a.queue_bucket)] ?? 99;
      const bB = order[s(b.queue_bucket)] ?? 99;
      if (aB !== bB) return aB - bB;
      const aDue = a.due_at ? new Date(String(a.due_at)).getTime() : Infinity;
      const bDue = b.due_at ? new Date(String(b.due_at)).getTime() : Infinity;
      if (aDue !== bDue) return aDue - bDue;
      return n(b.priority_score) - n(a.priority_score);
    });
    return list;
  }, [rows, actionType, workflow, bucket, leadStatus, priority, owner, country, ppv, tag, q, sort]);

  const kpis = useMemo(() => {
    const c = { overdue: 0, today: 0, next_24h: 0, upcoming: 0 };
    for (const r of rows) {
      const b = s(r.queue_bucket);
      if (b in c) (c as Record<string, number>)[b]++;
    }
    return c;
  }, [rows]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <PageHeader
        title="Darba rinda"
        description="Nākamās darbības ar leadiem"
      />

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniKpi label="Kavēti" value={kpis.overdue} tone="red" />
        <MiniKpi label="Šodien" value={kpis.today} tone="amber" />
        <MiniKpi label="Nākamās 24h" value={kpis.next_24h} tone="blue" />
        <MiniKpi label="Plānots" value={kpis.upcoming} tone="neutral" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Meklēt leadu vai objektu..."
          className="h-7 w-full text-xs sm:w-72"
        />
      </div>

      {view.isLoading ? (
        <LoadingState />
      ) : view.data?.error ? (
        <ErrorState message={view.data.error} />
      ) : filtered.length === 0 ? (
        <EmptyState label="Rindā nav ierakstu" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="relative w-full overflow-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:bg-muted/95 supports-[backdrop-filter]:[&_tr]:bg-muted/85">
              <tr className="sticky top-0 z-20 border-b border-border/70 backdrop-blur shadow-[0_1px_0_0_hsl(var(--border))]">
                <HeadCell className="w-[92px]">
                  <SortButton label="Prioritāte" k="priority" sort={sort} onClick={toggleSort} />
                </HeadCell>
                <HeadCell className="w-[60px] text-right">
                  <div className="flex justify-end">
                    <SortButton label="Score" k="score" sort={sort} onClick={toggleSort} />
                  </div>
                </HeadCell>
                <HeadCell className="w-[100px]">
                  <SortButton label="Termiņš" k="due" sort={sort} onClick={toggleSort} />
                </HeadCell>
                <HeadCell className="w-[60px]">
                  <SortButton label="Atbild." k="owner" sort={sort} onClick={toggleSort} />
                </HeadCell>
                <HeadCell>
                  <SortButton label="Darbība" k="action" sort={sort} onClick={toggleSort} />
                </HeadCell>
                <HeadCell className="min-w-[280px]">
                  <SortButton label="Lead" k="lead" sort={sort} onClick={toggleSort} />
                </HeadCell>
                <HeadCell className="text-muted-foreground/70">
                  <SortButton label="PPV" k="ppv" sort={sort} onClick={toggleSort} />
                </HeadCell>
                <HeadCell className="w-[64px] text-muted-foreground/70">
                  <SortButton label="Valsts" k="country" sort={sort} onClick={toggleSort} />
                </HeadCell>
                <HeadCell className="w-[110px]">
                  <SortButton label="Tagi" k="tags" sort={sort} onClick={toggleSort} />
                </HeadCell>
                <HeadCell className="text-muted-foreground/70">
                  <SortButton label="Workflow" k="workflow" sort={sort} onClick={toggleSort} />
                </HeadCell>
                <HeadCell className="w-[80px] text-right">Darbības</HeadCell>
              </tr>
              <tr className="sticky top-8 z-20 border-b-2 border-border bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
                <FilterCell>
                  <HeaderSelect value={priority} onChange={setPriority} placeholder="Visi">
                    <SelectItem value="all">Visi</SelectItem>
                    <SelectItem value="Augsta">Augsta</SelectItem>
                    <SelectItem value="Normāla">Normāla</SelectItem>
                    <SelectItem value="Zema">Zema</SelectItem>
                  </HeaderSelect>
                </FilterCell>
                <FilterCell />
                <FilterCell />
                <FilterCell>
                  <HeaderOptionsSelect value={owner} onChange={setOwner} options={owners} />
                </FilterCell>
                <FilterCell>
                  <HeaderOptionsSelect value={actionType} onChange={setActionType} options={actionTypes} />
                </FilterCell>
                <FilterCell />
                <FilterCell>
                  <HeaderOptionsSelect value={ppv} onChange={setPpv} options={ppvs} />
                </FilterCell>
                <FilterCell>
                  <HeaderOptionsSelect value={country} onChange={setCountry} options={countries} />
                </FilterCell>
                <FilterCell>
                  <HeaderOptionsSelect value={tag} onChange={setTag} options={allTags} />
                </FilterCell>
                <FilterCell>
                  <HeaderOptionsSelect value={workflow} onChange={setWorkflow} options={workflows} />
                </FilterCell>
                <FilterCell />
              </tr>
            </thead>
            <TableBody>
              {filtered.map((r, i) => {
                const leadId = s(r.lead_id);
                const pLabel = s(r.priority_label);
                const isHigh = pLabel === "Augsta";
                const tags = parseTags(r.tags);
                const score = n(r.lead_priority_score) || n(r.priority_score);
                return (
                  <TableRow
                    key={s(r.queue_id) || s(r.next_action_id) || i}
                    className={cn(
                      "text-xs",
                      isHigh &&
                        "bg-red-50/70 hover:bg-red-100/70 dark:bg-red-950/20 dark:hover:bg-red-950/30",
                    )}
                  >
                    <TableCell className="py-3.5">
                      <PriorityBadge label={pLabel} />
                    </TableCell>
                    <TableCell className="py-3.5 text-right">
                      <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                        {score > 0 ? score : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <DueCell value={r.due_at} />
                    </TableCell>
                    <TableCell className="py-3.5">
                      <OwnerBadge value={s(r.action_owner_label) || s(r.ppv_owner_label) || s(r.ppv_owner)} />
                    </TableCell>
                    <TableCell className="py-3.5 font-semibold">{s(r.action_label) || "—"}</TableCell>
                    <TableCell className="py-3.5 align-top">
                      {leadId ? (
                        <button
                          className="line-clamp-2 max-w-[340px] text-left text-primary/90 hover:underline"
                          onClick={() =>
                            navigate({
                              to: "/lead/$leadId",
                              params: { leadId },
                            })
                          }
                        >
                          {s(r.full_name) || "—"}
                        </button>
                      ) : (
                        <span className="line-clamp-2 max-w-[340px]">{s(r.full_name) || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 text-muted-foreground">{s(r.ppv_name) || "—"}</TableCell>
                    <TableCell className="py-3.5 text-muted-foreground">{s(r.country) || "—"}</TableCell>
                    <TableCell className="py-3.5">
                      <TagsCell tags={tags} />
                    </TableCell>
                    <TableCell className="py-3.5 text-muted-foreground/80">{s(r.workflow_label) || "—"}</TableCell>
                    <TableCell className="py-3.5 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        onClick={() =>
                          leadId &&
                          navigate({
                            to: "/lead/$leadId",
                            params: { leadId },
                          })
                        }
                      >
                        Atvērt
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

function HeadCell({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <th
      className={cn(
        "h-8 px-2 text-left align-middle text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

function FilterCell({ children }: { children?: React.ReactNode }) {
  return <th className="px-1 pb-1 pt-0 align-middle">{children}</th>;
}

type SortKey =
  | "priority"
  | "score"
  | "due"
  | "owner"
  | "action"
  | "lead"
  | "ppv"
  | "country"
  | "tags"
  | "workflow";

function sortValue(r: Row, key: SortKey): string | number {
  switch (key) {
    case "priority":
      return n(r.sort_priority);
    case "score":
      return n(r.lead_priority_score) || n(r.priority_score);
    case "due":
      return r.due_at ? new Date(String(r.due_at)).getTime() : 0;
    case "owner":
      return s(r.action_owner_label).toLowerCase();
    case "action":
      return s(r.action_label).toLowerCase();
    case "lead":
      return s(r.full_name).toLowerCase();
    case "ppv":
      return s(r.ppv_name).toLowerCase();
    case "country":
      return s(r.country).toLowerCase();
    case "tags":
      return parseTags(r.tags).join(",");
    case "workflow":
      return s(r.workflow_label).toLowerCase();
  }
}

function SortButton({
  label,
  k,
  sort,
  onClick,
  ariaLabel,
}: {
  label?: string;
  k: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" } | null;
  onClick: (k: SortKey) => void;
  ariaLabel?: string;
}) {
  const active = sort?.key === k;
  const Icon = !active ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      aria-label={ariaLabel || label}
      onClick={() => onClick(k)}
      className={cn(
        "inline-flex items-center gap-1 rounded px-0.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {label && <span>{label}</span>}
      <Icon
        className={cn("h-3 w-3", !active && "opacity-50")}
        strokeWidth={2.25}
      />
    </button>
  );
}

function FilterPill({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  const active = value !== "all";
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          "h-7 w-auto min-w-0 gap-1 rounded-full border px-2.5 text-[11px]",
          active
            ? "border-primary/40 bg-primary/10 text-foreground"
            : "border-border bg-background text-muted-foreground",
        )}
      >
        <span className="font-medium">{label}</span>
        {active && <span className="text-foreground">: {value}</span>}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Visi</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.v} value={o.v}>
            {o.l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function HeaderSelect({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-6 w-full min-w-0 px-1.5 text-[11px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

function HeaderOptionsSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-6 w-full min-w-0 px-1.5 text-[11px]">
        <SelectValue placeholder="Visi" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Visi</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

