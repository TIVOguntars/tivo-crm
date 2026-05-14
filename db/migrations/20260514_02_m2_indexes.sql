-- =====================================================================
-- M2: Indeksi crm.tasks un crm.notes
-- Tikai CREATE INDEX IF NOT EXISTS. Bez CHECK, bez DEFAULT izmaiņām.
-- =====================================================================

CREATE INDEX IF NOT EXISTS tasks_lead_status_due_idx
  ON crm.tasks (lead_id, status, due_at);

CREATE INDEX IF NOT EXISTS tasks_assigned_status_idx
  ON crm.tasks (assigned_user_id, status);

CREATE INDEX IF NOT EXISTS tasks_due_at_idx
  ON crm.tasks (due_at);

CREATE INDEX IF NOT EXISTS tasks_task_type_idx
  ON crm.tasks (task_type);

CREATE INDEX IF NOT EXISTS notes_lead_created_idx
  ON crm.notes (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notes_type_idx
  ON crm.notes (note_type);