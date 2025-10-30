-- Create budget_sections table for grouping budget items
CREATE TABLE IF NOT EXISTS budget_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE budget_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sections from own budgets"
  ON budget_sections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM budgets
      WHERE budgets.id = budget_sections.budget_id
      AND budgets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create sections in own budgets"
  ON budget_sections FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM budgets
      WHERE budgets.id = budget_sections.budget_id
      AND budgets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update sections in own budgets"
  ON budget_sections FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM budgets
      WHERE budgets.id = budget_sections.budget_id
      AND budgets.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM budgets
      WHERE budgets.id = budget_sections.budget_id
      AND budgets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete sections from own budgets"
  ON budget_sections FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM budgets
      WHERE budgets.id = budget_sections.budget_id
      AND budgets.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_budget_sections_budget_id ON budget_sections(budget_id);

-- Link budget items to sections
ALTER TABLE budget_items
  ADD COLUMN IF NOT EXISTS section_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'budget_items_section_id_fkey'
      AND conrelid = 'budget_items'::regclass
  ) THEN
    ALTER TABLE budget_items
      ADD CONSTRAINT budget_items_section_id_fkey
      FOREIGN KEY (section_id)
      REFERENCES budget_sections(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;
