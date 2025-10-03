/*
  # Add recurring and billable fields to expenses

  1. Changes
    - Add `project_id` (uuid, references projects, optional) - link expense to project
    - Add `is_recurring` (boolean) - whether the expense repeats
    - Add `recurring_frequency` (text) - frequency: 'monthly', 'yearly', 'weekly', 'quarterly'
    - Add `next_occurrence` (date, optional) - when the next recurring expense should be created
    - Add `is_billable` (boolean) - whether this should be billed to client
    - Add `is_billed` (boolean) - whether this has been billed to client
    - Add `billed_date` (date, optional) - when this was billed

  2. Notes
    - All new fields are optional and have sensible defaults
    - Existing expenses remain unchanged
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE expenses ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'is_recurring'
  ) THEN
    ALTER TABLE expenses ADD COLUMN is_recurring boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'recurring_frequency'
  ) THEN
    ALTER TABLE expenses ADD COLUMN recurring_frequency text CHECK (recurring_frequency IN ('weekly', 'monthly', 'quarterly', 'yearly'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'next_occurrence'
  ) THEN
    ALTER TABLE expenses ADD COLUMN next_occurrence date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'is_billable'
  ) THEN
    ALTER TABLE expenses ADD COLUMN is_billable boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'is_billed'
  ) THEN
    ALTER TABLE expenses ADD COLUMN is_billed boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'billed_date'
  ) THEN
    ALTER TABLE expenses ADD COLUMN billed_date date;
  END IF;
END $$;