-- A. crm.tasks additive columns
ALTER TABLE crm.tasks
  ADD COLUMN IF NOT EXISTS required_role text,
  ADD COLUMN IF NOT EXISTS workflow_instance_id uuid,
  ADD COLUMN IF NOT EXISTS outcome_code text,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS skipped_reason text,
  ADD COLUMN IF NOT EXISTS previous_assigned_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_workflow_instance_id_fkey' AND conrelid='crm.tasks'::regclass) THEN
    ALTER TABLE crm.tasks
      ADD CONSTRAINT tasks_workflow_instance_id_fkey
      FOREIGN KEY (workflow_instance_id) REFERENCES crm.workflow_instances(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_previous_assigned_user_id_fkey' AND conrelid='crm.tasks'::regclass) THEN
    ALTER TABLE crm.tasks
      ADD CONSTRAINT tasks_previous_assigned_user_id_fkey
      FOREIGN KEY (previous_assigned_user_id) REFERENCES crm.profiles(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_tasks_workflow_instance_id ON crm.tasks (workflow_instance_id);
CREATE INDEX IF NOT EXISTS idx_tasks_required_role ON crm.tasks (required_role);
CREATE INDEX IF NOT EXISTS idx_tasks_outcome_code ON crm.tasks (outcome_code);

-- B. crm.activities additive columns
ALTER TABLE crm.activities
  ADD COLUMN IF NOT EXISTS outcome_code text,
  ADD COLUMN IF NOT EXISTS communication_basis text;

CREATE INDEX IF NOT EXISTS idx_activities_outcome_code ON crm.activities (outcome_code);
CREATE INDEX IF NOT EXISTS idx_activities_communication_basis ON crm.activities (communication_basis);

-- C. crm.task_relations
CREATE TABLE IF NOT EXISTS crm.task_relations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid NOT NULL REFERENCES crm.leads(id) ON DELETE RESTRICT,
  from_kind     text NOT NULL CHECK (from_kind IN ('task','activity')),
  from_id       uuid NOT NULL,
  to_kind       text NOT NULL CHECK (to_kind   IN ('task','activity')),
  to_id         uuid NOT NULL,
  relation_type text NOT NULL CHECK (relation_type IN ('follows','caused','triggered','replaced_by')),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES crm.profiles(id) ON DELETE SET NULL,
  CONSTRAINT task_relations_no_self CHECK (NOT (from_kind = to_kind AND from_id = to_id))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_task_relations_edge
  ON crm.task_relations (from_kind, from_id, to_kind, to_id, relation_type);
CREATE INDEX IF NOT EXISTS idx_task_relations_lead_id ON crm.task_relations (lead_id);
CREATE INDEX IF NOT EXISTS idx_task_relations_from ON crm.task_relations (from_kind, from_id);
CREATE INDEX IF NOT EXISTS idx_task_relations_to ON crm.task_relations (to_kind, to_id);
CREATE INDEX IF NOT EXISTS idx_task_relations_relation_type ON crm.task_relations (relation_type);

ALTER TABLE crm.task_relations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='crm' AND tablename='task_relations' AND policyname='authenticated_task_relations_access'
  ) THEN
    CREATE POLICY authenticated_task_relations_access
      ON crm.task_relations
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END$$;