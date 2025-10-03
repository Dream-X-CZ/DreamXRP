BEGIN;

DROP POLICY IF EXISTS "Members can view their organization membership" ON organization_members;

CREATE POLICY "Members can view their organization membership"
  ON organization_members FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

COMMIT;
