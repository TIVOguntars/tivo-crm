import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CrmPageActionsRow } from "@/components/crm/CrmLayout";
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
  const map: Record<Status, { bg: string; fg: string; bd: string }> = {
    new:    { bg: "var(--tivo-blue-soft)",  fg: "var(--tivo-navy)",  bd: "var(--tivo-blue-border)" },
    active: { bg: "var(--tivo-green-soft)", fg: "var(--tivo-navy)",  bd: "var(--tivo-green-border)" },
    paused: { bg: "var(--tivo-orange-soft)",fg: "var(--tivo-navy)",  bd: "var(--tivo-orange-border)" },
    done:   { bg: "var(--tivo-navy-soft)",  fg: "var(--tivo-navy)",  bd: "var(--tivo-navy-border)" },
  };
  const c = map[s];
  return (
    <span
      className="inline-flex h-6 items-center rounded-full border px-2 text-[12px] font-medium"
      style={{ backgroundColor: c.bg, color: c.fg, borderColor: c.bd }}
    >
      {STATUS_LABEL[s]}
    </span>
  );
}

function PriorityTag({ p }: { p: Priority }) {
  const map: Record<Priority, { bg: string; fg: string; bd: string }> = {
    high:   { bg: "var(--tivo-red-soft)",   fg: "var(--tivo-red)",   bd: "var(--tivo-red-border)" },
    medium: { bg: "var(--tivo-orange-soft)",fg: "var(--tivo-navy)",  bd: "var(--tivo-orange-border)" },
    low:    { bg: "var(--tivo-navy-soft)",  fg: "var(--tivo-navy)",  bd: "var(--tivo-navy-border)" },
  };
  const c = map[p];
  return (
    <span
      className="inline-flex h-6 items-center rounded-md border px-2 text-[12px] font-medium"
      style={{ backgroundColor: c.bg, color: c.fg, borderColor: c.bd }}
    >
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
    <div>
      <CrmPageActionsRow>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Jauns ieraksts
        </Button>
      </CrmPageActionsRow>

      <header className="mb-4">
        <h1 className="text-lg font-semibold text-[color:var(--tivo-navy)]">
          CRM DataTable demo
        </h1>
        <p className="text-sm text-muted-foreground">
          Izolēta demonstrācija jaunajai vienotajai CRM tabulu sistēmai.
          Neviena esoša lapa nav modificēta.
        </p>
      </header>

      <CrmDataTable maxHeight={480} sort={sort} onSortChange={handleSort}>
        <CrmDataTableHeader>
          <CrmDataTableLabelRow>
            <CrmSortableHead sortKey="id" label="ID" />
            <CrmSortableHead sortKey="lead" label="Lead" />
            <CrmSortableHead sortKey="status" label="Statuss" />
            <CrmSortableHead sortKey="priority" label="Prioritāte" />
            <CrmSortableHead sortKey="due" label="Termiņš" />
            <CrmSortableHead sortKey="owner" label="Atbildīgais" />
            <CrmSortableHead sortKey="action" label="Darbība" />
            <CrmSortableHead label="" align="right" />
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
            <CrmFilterCell />
            <CrmFilterCell align="right">
              <CrmClearFiltersButton active={anyFilter} onClick={clearAll} />
            </CrmFilterCell>
          </CrmDataTableFilterRow>
        </CrmDataTableHeader>
        <CrmDataBody>
          {rows.length === 0 ? (
            <CrmDataRow>
              <CrmDataCell
                colSpan={8}
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
                <CrmDataCell>{r.action}</CrmDataCell>
                <CrmDataCell align="right">
                  <Button size="sm" variant="outline">Atvērt</Button>
                </CrmDataCell>
              </CrmDataRow>
            ))
          )}
        </CrmDataBody>
      </CrmDataTable>

      <p className="mt-3 text-xs text-muted-foreground">
        Rāda {rows.length} no {DATA.length}.
      </p>
    </div>
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