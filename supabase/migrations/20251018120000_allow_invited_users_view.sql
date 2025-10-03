BEGIN;

DROP POLICY IF EXISTS "Members can view invitations for their organization" ON invitations;

CREATE POLICY "Members can view invitations for their organization"
  ON invitations FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
    OR lower(email) = lower(auth.jwt() ->> 'email')
  );

COMMIT;
