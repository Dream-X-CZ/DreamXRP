-- Allow organization members to access and manage projects created within their teams
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view own projects" ON projects;
  DROP POLICY IF EXISTS "Users can insert own projects" ON projects;
  DROP POLICY IF EXISTS "Users can update own projects" ON projects;
  DROP POLICY IF EXISTS "Users can delete own projects" ON projects;

END $$;

CREATE POLICY "Organization members can view projects"
  ON projects FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Organization members can insert projects"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      organization_id IS NULL
      OR organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Organization members can update projects"
  ON projects FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid()
          AND role IN ('owner', 'admin')
      )
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid()
          AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "Organization members can delete projects"
  ON projects FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid()
          AND role IN ('owner', 'admin')
      )
    )
  );
