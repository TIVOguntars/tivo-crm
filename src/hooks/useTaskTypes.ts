import { useMemo } from "react";
import { useCrmView } from "@/hooks/useCrmView";
import {
  isKnownTaskType,
  type TaskTypeKey,
  type TaskTypeRow,
} from "@/lib/taskTypes";

/**
 * Loads crm.task_types via the existing useCrmView path.
 * Returns active rows sorted by sort_order plus a lookup keyed by type_key.
 */
export function useTaskTypes() {
  const result = useCrmView(
    "task_types",
    "select=*&is_active=eq.true&order=sort_order.asc",
  );

  const rows: TaskTypeRow[] = useMemo(() => {
    const raw = (result.data?.rows ?? []) as TaskTypeRow[];
    return [...raw].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
  }, [result.data]);

  const byKey = useMemo(() => {
    const m = new Map<string, TaskTypeRow>();
    for (const r of rows) m.set(r.type_key, r);
    return m;
  }, [rows]);

  const knownRows = useMemo(
    () => rows.filter((r) => isKnownTaskType(r.type_key)),
    [rows],
  );

  function get(key: string): TaskTypeRow | undefined {
    return byKey.get(key);
  }

  function labelOf(key: string): string {
    return byKey.get(key)?.label_lv ?? key;
  }

  function isKnown(key: string): key is TaskTypeKey {
    return isKnownTaskType(key);
  }

  return {
    rows: knownRows,
    allRows: rows,
    byKey,
    get,
    labelOf,
    isKnown,
    isLoading: result.isLoading,
    error: result.error,
  };
}
