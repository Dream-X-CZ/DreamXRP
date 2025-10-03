/*
  # Add hourly rate to projects and task-budget linking

  1. Changes to projects table
    - Add `client_hourly_rate` (numeric) - hourly rate charged to client

  2. Changes to budget_items table
    - Add `task_id` (uuid, references tasks, optional) - link to task if auto-generated

  3. Notes
    - client_hourly_rate allows automatic budget generation from tasks
    - task_id link enables tracking which budget items came from tasks
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'client_hourly_rate'
  ) THEN
    ALTER TABLE projects ADD COLUMN client_hourly_rate numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budget_items' AND column_name = 'task_id'
  ) THEN
    ALTER TABLE budget_items ADD COLUMN task_id uuid REFERENCES tasks(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_budget_items_task ON budget_items(task_id);