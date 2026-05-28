import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Eye, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CrmPageActionsRow } from "@/components/crm/CrmLayout";
import { STATUS_BASE_CLASS, STATUS_STYLES } from "@/design/status-system";
import {
  CrmClearFiltersButton,
  CrmDataBody,
  CrmDataCell,
  CrmDataRow,
  CrmDataTable,
  CrmDataTableFilterRow,
  CrmDataTableHeader,
  CrmDataTableLabelRow,
  CrmFilterCell,
  CrmFilterInput,
  CrmFilterSelect,
  CrmSortableHead,
  type CrmTableSort,
  type SortDir,
} from "@/components/crm/table/CrmDataTable";

/**
 * Isolated demo for the unified CRM table system.
 * - Not linked from any nav.
 * - Uses fake in-memory data only.
 * - Does not touch auth, RPC, or existing routes.
 */

export const Route = createFileRoute("/crm-table-demo")({
  component: CrmTableDemo,
});

type Status = "new" | "active" | "paused" | "done";
type Priority = "high" | "medium" | "low";

interface DemoRow {
  id: string;
  lead: string;
  status: Status;
  priority: Priority;
  /** ISO date string. */
  due: string;
  owner: string;
  action: string;
}

const STATUS_LABEL: Record<Status, string> = {
  new: "Jauns",
  active: "Aktīvs",
  paused: "Pauzēts",
  done: "Pabeigts",
};
/** Map demo status → semantic status helper key. */
const STATUS_SEMANTIC: Record<Status, keyof typeof STATUS_STYLES> = {
  new: "jauns",
  active: "kvalificēts",
  paused: "atlikts",
  done: "pabeigts",
};
const PRIORITY_LABEL: Record<Priority, string> = {
  high: "Augsta",
  medium: "Vidēja",
  low: "Zema",
};

const PRIORITY_RANK: Record<Priority, number> = { high: 3, medium: 2, low: 1 };

const today = new Date();
const dayOffset = (d: number) => {
  const t = new Date(today);
  t.setDate(t.getDate() + d);
  return t.toISOString();
};

const DATA: DemoRow[] = [
  { id: "L-1042", lead: "Anna Bērziņa",      status: "new",    priority: "high",   due: dayOffset(-3), owner: "I. Kalniņš",  action: "Sazvanīt" },
  { id: "L-1043", lead: "Jānis Ozols",       status: "active", priority: "medium", due: dayOffset(0),  owner: "M. Liepa",    action: "E-pasts" },
  { id: "L-1044", lead: "SIA Mežs",          status: "active", priority: "high",   due: dayOffset(1),  owner: "I. Kalniņš",  action: "Tikšanās" },
  { id: "L-1045", lead: "Pēteris Kļaviņš",   status: "paused", priority: "low",    due: dayOffset(5),  owner: "A. Salnāja",  action: "Atgādināt" },
  { id: "L-1046", lead: "Laura Vītola",      status: "new",    priority: "medium", due: dayOffset(-1), owner: "M. Liepa",    action: "Sazvanīt" },
  { id: "L-1047", lead: "AS Saule",          status: "done",   priority: "low",    due: dayOffset(-10),owner: "A. Salnāja",  action: "Slēgt" },
  { id: "L-1048", lead: "Kristaps Zariņš",   status: "active", priority: "high",   due: dayOffset(2),  owner: "I. Kalniņš",  action: "Piedāvājums" },
  { id: "L-1049", lead: "SIA Rīta Rasa",     status: "paused", priority: "medium", due: dayOffset(7),  owner: "M. Liepa",    action: "Atgādināt" },
  { id: "L-1050", lead: "Ieva Krūmiņa",      status: "new",    priority: "low",    due: dayOffset(12), owner: "A. Salnāja",  action: "Sazvanīt" },
  { id: "L-1051", lead: "Roberts Skuja",     status: "active", priority: "high",   due: dayOffset(0),  owner: "I. Kalniņš",  action: "Tikšanās" },
];

const OWNERS = Array.from(new Set(DATA.map((r) => r.owner))).sort();

function StatusBadge({ s }: { s: Status }) {
  const style = STATUS_STYLES[STATUS_SEMANTIC[s]];
  return (
    <span className={`${STATUS_BASE_CLASS} ${style.bg} ${style.text}`}>
      {STATUS_LABEL[s]}
    </span>
  );
}

function PriorityTag({ p }: { p: Priority }) {
  const key: keyof typeof STATUS_STYLES =
    p === "high" ? "atcelts" : p === "medium" ? "atlikts" : "default";
  const style = STATUS_STYLES[key];
  return (
    <span className={`${STATUS_BASE_CLASS} ${style.bg} ${style.text}`}>
      {PRIORITY_LABEL[p]}
    </span>
  );
}

function DueDate({ iso }: { iso: string }) {
  const due = new Date(iso);
  const diffH = (due.getTime() - Date.now()) / 36e5;
  const overdue = diffH < 0;
  const soon = !overdue && diffH < 24;
  const color = overdue
    ? "var(--tivo-red)"
    : soon
      ? "var(--tivo-orange)"
      : "var(--crm-text)";
  const label = due.toLocaleDateString("lv-LV", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return (
    <span style={{ color }} className={overdue ? "font-medium" : undefined}>
      {label}
      {overdue ? " · nokavēts" : soon ? " · šodien" : ""}
    </span>
  );
}

function CrmTableDemo() {
  const [search, setSearch] = React.useState("");
  const [fStatus, setFStatus] = React.useState("");
  const [fPriority, setFPriority] = React.useState("");
  const [fOwner, setFOwner] = React.useState("");
  const [sort, setSort] = React.useState<CrmTableSort>({
    key: null,
    dir: "asc",
  });

  const handleSort = (key: string, dir: SortDir) => {
    if (dir === null) setSort({ key: null, dir: "asc" });
    else setSort({ key, dir });
  };

  const clearAll = () => {
    setSearch("");
    setFStatus("");
    setFPriority("");
    setFOwner("");
  };

  const anyFilter =
    search.trim() !== "" || !!fStatus || !!fPriority || !!fOwner;

  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = DATA.filter((r) => {
      if (q && !r.lead.toLowerCase().includes(q) && !r.id.toLowerCase().includes(q))
        return false;
      if (fStatus && r.status !== fStatus) return false;
      if (fPriority && r.priority !== fPriority) return false;
      if (fOwner && r.owner !== fOwner) return false;
      return true;
    });
    if (sort.key) {
      const k = sort.key;
      const mul = sort.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        const va = readKey(a, k);
        const vb = readKey(b, k);
        if (va < vb) return -1 * mul;
        if (va > vb) return 1 * mul;
        return 0;
      });
    }
    return out;
  }, [search, fStatus, fPriority, fOwner, sort]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col" style={{ height: "calc(100vh - 9rem)" }}>
        <CrmPageActionsRow className="mb-0" style={{ marginBottom: 20 }}>
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Jauns ieraksts
          </Button>
        </CrmPageActionsRow>

        <CrmDataTable
          className="min-h-0 flex-1"
          maxHeight="100%"
          sort={sort}
          onSortChange={handleSort}
        >
        <CrmDataTableHeader>
          <CrmDataTableLabelRow>
            <CrmSortableHead sortKey="id" label="ID" style={{ width: 72 }} />
            <CrmSortableHead sortKey="lead" label="Lead" style={{ width: "auto" }} />
            <CrmSortableHead sortKey="status" label="Statuss" style={{ width: "1%", whiteSpace: "nowrap" }} />
            <CrmSortableHead sortKey="priority" label="Prioritāte" style={{ width: "1%", whiteSpace: "nowrap" }} />
            <CrmSortableHead sortKey="due" label="Termiņš" style={{ width: 130 }} />
            <CrmSortableHead sortKey="owner" label="Atbildīgais" style={{ width: 160 }} />
            <CrmSortableHead label="" align="right" style={{ width: 56 }} />
          </CrmDataTableLabelRow>
          <CrmDataTableFilterRow>
            <CrmFilterCell />
            <CrmFilterCell>
              <CrmFilterInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Meklēt leadu…"
              />
            </CrmFilterCell>
            <CrmFilterCell>
              <CrmFilterSelect
                value={fStatus}
                onValueChange={setFStatus}
                options={(Object.keys(STATUS_LABEL) as Status[]).map((k) => ({
                  value: k,
                  label: STATUS_LABEL[k],
                }))}
              />
            </CrmFilterCell>
            <CrmFilterCell>
              <CrmFilterSelect
                value={fPriority}
                onValueChange={setFPriority}
                options={(Object.keys(PRIORITY_LABEL) as Priority[]).map((k) => ({
                  value: k,
                  label: PRIORITY_LABEL[k],
                }))}
              />
            </CrmFilterCell>
            <CrmFilterCell />
            <CrmFilterCell>
              <CrmFilterSelect
                value={fOwner}
                onValueChange={setFOwner}
                options={OWNERS.map((o) => ({ value: o, label: o }))}
              />
            </CrmFilterCell>
            <CrmFilterCell align="right">
              <CrmClearFiltersButton active={anyFilter} onClick={clearAll} />
            </CrmFilterCell>
          </CrmDataTableFilterRow>
        </CrmDataTableHeader>
        <CrmDataBody>
          {rows.length === 0 ? (
            <CrmDataRow>
              <CrmDataCell
                colSpan={7}
                align="center"
                className="text-muted-foreground"
              >
                Nav rezultātu
              </CrmDataCell>
            </CrmDataRow>
          ) : (
            rows.map((r) => (
              <CrmDataRow key={r.id}>
                <CrmDataCell className="font-mono text-xs">{r.id}</CrmDataCell>
                <CrmDataCell className="font-medium">{r.lead}</CrmDataCell>
                <CrmDataCell><StatusBadge s={r.status} /></CrmDataCell>
                <CrmDataCell><PriorityTag p={r.priority} /></CrmDataCell>
                <CrmDataCell><DueDate iso={r.due} /></CrmDataCell>
                <CrmDataCell>{r.owner}</CrmDataCell>
                <CrmDataCell align="right">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label="Atvērt"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Atvērt</TooltipContent>
                  </Tooltip>
                </CrmDataCell>
              </CrmDataRow>
            ))
          )}
        </CrmDataBody>
        </CrmDataTable>
      </div>
    </TooltipProvider>
  );
}

function readKey(r: DemoRow, k: string): string | number {
  switch (k) {
    case "id":       return r.id;
    case "lead":     return r.lead.toLowerCase();
    case "status":   return STATUS_LABEL[r.status];
    case "priority": return PRIORITY_RANK[r.priority];
    case "due":      return r.due;
    case "owner":    return r.owner.toLowerCase();
    case "action":   return r.action.toLowerCase();
    default:         return "";
  }
}