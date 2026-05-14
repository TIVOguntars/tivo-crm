import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { useCrmView } from "@/hooks/useCrmView";
import { hasAccess, useCurrentRole, type Role } from "@/lib/roles";

const ALLOWED: readonly Role[] = ["admin", "manager"];

const searchSchema = z.object({
  session: fallback(z.string().optional(), undefined),
  approval_status: fallback(z.string().optional(), undefined),
  validation_status: fallback(z.string().optional(), undefined),
  change_type: fallback(z.string().optional(), undefined),
  conflict_type: fallback(z.string().optional(), undefined),
  has_conflict: fallback(z.enum(["true", "false"]).optional(), undefined),
});

type SearchState = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/import-review")({
  validateSearch: zodValidator(searchSchema),
  component: ImportReviewPage,
});

const SESSION_FIELDS = [
  "id",
  "source_system",
  "import_type",
  "status",
  "total_records",
  "processed_records",
  "warnings_count",
  "conflicts_count",
  "approved_count",
  "rejected_count",
  "started_at",
  "completed_at",
] as const;

const CHANGE_FIELDS = [
  "id",
  "import_session_id",
  "entity_type",
  "entity_id",
  "external_id",
  "field_name",
  "old_value",
  "new_value",
  "change_type",
  "validation_status",
  "approval_status",
  "has_conflict",
  "conflict_type",
  "conflict_reason",
  "duplicate_detected",
  "orphan_detected",
  "review_action",
  "review_note",
  "created_at",
  "reviewed_at",
] as const;

function fmtDate(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("sv-SE").replace("T", " ").slice(0, 16);
}

function fmtNum(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return String(v);
}

function truncate(v: unknown, max = 60): string {
  if (v === null || v === undefined) return "—";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function fullText(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

function BoolPill({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  const truthy = value === true || value === "true";
  return (
    <Badge
      variant={truthy ? "destructive" : "secondary"}
      className="text-[10px] font-medium"
    >
      {truthy ? "Jā" : "Nē"}
    </Badge>
  );
}

function ImportReviewPage() {
  const role = useCurrentRole();
  if (!hasAccess(role, ALLOWED)) {
    return (
      <div>
        <PageHeader
          title="Importa pārskats"
          description="Šai sadaļai nav piekļuves."
        />
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nepieciešama admin vai manager loma.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importa pārskats"
        description="Tikai lasāms audita skats: importa sesijas un to izmaiņas no crm.import_sessions / crm.import_changes."
      >
        <Badge variant="secondary" className="text-xs">
          Read-only
        </Badge>
      </PageHeader>

      <SessionsCard />
      <ChangesCard />
    </div>
  );
}

function SessionsCard() {
  const search = Route.useSearch() as SearchState;
  const navigate = useNavigate({ from: Route.fullPath });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("select", SESSION_FIELDS.join(","));
    params.set("order", "started_at.desc.nullslast");
    params.set("limit", "200");
    return params.toString();
  }, []);

  const { data, isLoading, error } = useCrmView("import_sessions", query);
  const rows = (data?.rows ?? []) as Array<Record<string, unknown>>;
  const apiError = data?.error ?? (error instanceof Error ? error.message : null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Importa sesijas</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState label="Ielādē importa sesijas..." />
        ) : apiError ? (
          <ErrorState message={apiError} />
        ) : rows.length === 0 ? (
          <EmptyState label="Nav importa sesiju." />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Avots</TableHead>
                  <TableHead>Tips</TableHead>
                  <TableHead>Statuss</TableHead>
                  <TableHead className="text-right">Kopā</TableHead>
                  <TableHead className="text-right">Apstr.</TableHead>
                  <TableHead className="text-right">Brīd.</TableHead>
                  <TableHead className="text-right">Konfl.</TableHead>
                  <TableHead className="text-right">Apstipr.</TableHead>
                  <TableHead className="text-right">Norai.</TableHead>
                  <TableHead>Sākts</TableHead>
                  <TableHead>Pabeigts</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const id = String(r.id);
                  const selected = search.session === id;
                  return (
                    <TableRow
                      key={id}
                      data-state={selected ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() =>
                        navigate({
                          search: (prev: SearchState) => ({ ...prev, session: id }),
                        })
                      }
                    >
                      <TableCell className="font-medium">
                        {String(r.source_system ?? "—")}
                      </TableCell>
                      <TableCell>{String(r.import_type ?? "—")}</TableCell>
                      <TableCell>
                        <StatusBadge status={r.status as string | null} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtNum(r.total_records)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtNum(r.processed_records)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtNum(r.warnings_count)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtNum(r.conflicts_count)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtNum(r.approved_count)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtNum(r.rejected_count)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {fmtDate(r.started_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {fmtDate(r.completed_at)}
                      </TableCell>
                      <TableCell>
                        {selected && (
                          <Badge variant="default" className="text-[10px]">
                            Atvērts
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChangesCard() {
  const search = Route.useSearch() as SearchState;
  const navigate = useNavigate({ from: Route.fullPath });

  const session = search.session;

  const query = useMemo(() => {
    if (!session) return "";
    const params = new URLSearchParams();
    params.set("select", CHANGE_FIELDS.join(","));
    params.set("import_session_id", `eq.${session}`);
    if (search.approval_status)
      params.set("approval_status", `eq.${search.approval_status}`);
    if (search.validation_status)
      params.set("validation_status", `eq.${search.validation_status}`);
    if (search.change_type)
      params.set("change_type", `eq.${search.change_type}`);
    if (search.conflict_type)
      params.set("conflict_type", `eq.${search.conflict_type}`);
    if (search.has_conflict)
      params.set("has_conflict", `is.${search.has_conflict}`);
    params.set("order", "has_conflict.desc.nullslast,created_at.desc");
    params.set("limit", "500");
    return params.toString();
  }, [
    session,
    search.approval_status,
    search.validation_status,
    search.change_type,
    search.conflict_type,
    search.has_conflict,
  ]);

  const enabled = !!session;
  const { data, isLoading, error } = useCrmView(
    "import_changes",
    enabled ? query : "__noop__",
  );

  if (!session) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Importa izmaiņas</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState label="Izvēlieties sesiju, lai apskatītu izmaiņas." />
        </CardContent>
      </Card>
    );
  }

  const rows = (data?.rows ?? []) as Array<Record<string, unknown>>;
  const apiError = data?.error ?? (error instanceof Error ? error.message : null);

  // Distinct values for filter selects (from current loaded payload).
  const distinct = (key: string) => {
    const set = new Set<string>();
    for (const r of rows) {
      const v = r[key];
      if (v === null || v === undefined || v === "") continue;
      set.add(String(v));
    }
    return Array.from(set).sort();
  };

  const setFilter = (k: keyof SearchState, v: string | undefined) => {
    navigate({ search: (prev: SearchState) => ({ ...prev, [k]: v }) });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">
          Importa izmaiņas
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            sesija {session.slice(0, 8)}…
          </span>
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            navigate({
              search: () => ({}),
            })
          }
        >
          Aizvērt sesiju
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label="Approval"
            value={search.approval_status}
            options={distinct("approval_status")}
            onChange={(v) => setFilter("approval_status", v)}
          />
          <FilterSelect
            label="Validation"
            value={search.validation_status}
            options={distinct("validation_status")}
            onChange={(v) => setFilter("validation_status", v)}
          />
          <FilterSelect
            label="Change type"
            value={search.change_type}
            options={distinct("change_type")}
            onChange={(v) => setFilter("change_type", v)}
          />
          <FilterSelect
            label="Conflict type"
            value={search.conflict_type}
            options={distinct("conflict_type")}
            onChange={(v) => setFilter("conflict_type", v)}
          />
          <FilterSelect
            label="Has conflict"
            value={search.has_conflict}
            options={["true", "false"]}
            onChange={(v) =>
              setFilter(
                "has_conflict",
                v === "true" || v === "false" ? v : undefined,
              )
            }
          />
        </div>

        {isLoading ? (
          <LoadingState label="Ielādē izmaiņas..." />
        ) : apiError ? (
          <ErrorState message={apiError} />
        ) : rows.length === 0 ? (
          <EmptyState label="Nav izmaiņu šai sesijai ar izvēlētajiem filtriem." />
        ) : (
          <TooltipProvider delayDuration={200}>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>External ID</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Old</TableHead>
                    <TableHead>New</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Valid.</TableHead>
                    <TableHead>Approval</TableHead>
                    <TableHead>Konfl.</TableHead>
                    <TableHead>Konfl. tips</TableHead>
                    <TableHead>Iemesls</TableHead>
                    <TableHead>Dubl.</TableHead>
                    <TableHead>Orphan</TableHead>
                    <TableHead>Review</TableHead>
                    <TableHead>Review note</TableHead>
                    <TableHead>Izveidots</TableHead>
                    <TableHead>Pārskatīts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={String(r.id)}>
                      <TableCell>{String(r.entity_type ?? "—")}</TableCell>
                      <TableCell className="font-mono text-[11px]">
                        {truncate(r.entity_id, 12)}
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">
                        {truncate(r.external_id, 16)}
                      </TableCell>
                      <TableCell>{String(r.field_name ?? "—")}</TableCell>
                      <TableCell>
                        <ValueCell value={r.old_value} />
                      </TableCell>
                      <TableCell>
                        <ValueCell value={r.new_value} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {String(r.change_type ?? "—")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.validation_status as string | null} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.approval_status as string | null} />
                      </TableCell>
                      <TableCell>
                        <BoolPill value={r.has_conflict} />
                      </TableCell>
                      <TableCell>{String(r.conflict_type ?? "—")}</TableCell>
                      <TableCell>
                        <ValueCell value={r.conflict_reason} />
                      </TableCell>
                      <TableCell>
                        <BoolPill value={r.duplicate_detected} />
                      </TableCell>
                      <TableCell>
                        <BoolPill value={r.orphan_detected} />
                      </TableCell>
                      <TableCell>{String(r.review_action ?? "—")}</TableCell>
                      <TableCell>
                        <ValueCell value={r.review_note} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {fmtDate(r.created_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {fmtDate(r.reviewed_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}

function ValueCell({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block max-w-[200px] truncate text-xs">
          {truncate(value, 60)}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[420px] whitespace-pre-wrap break-words text-xs">
        {fullText(value)}
      </TooltipContent>
    </Tooltip>
  );
}

const ALL_VALUE = "__all__";

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: string[];
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Select
        value={value ?? ALL_VALUE}
        onValueChange={(v) => onChange(v === ALL_VALUE ? undefined : v)}
      >
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue placeholder="Visi" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Visi</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}