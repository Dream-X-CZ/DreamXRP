-- Simplify organization member policies to avoid recursive errors

DROP POLICY IF EXISTS "Members can view their organization membership" ON organization_members;
DROP POLICY IF EXISTS "Owners and admins can add members" ON organization_members;
DROP POLICY IF EXISTS "Owners and admins can update members" ON organization_members;
DROP POLICY IF EXISTS "Owners and admins can remove members" ON organization_members;

CREATE POLICY "Members can view their organization membership"
  ON organization_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Organization owners and admins can add members"
  ON organization_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM organization_members AS om_admin
      WHERE om_admin.organization_id = organization_members.organization_id
        AND om_admin.user_id = auth.uid()
        AND om_admin.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1
      FROM organizations
      WHERE organizations.id = organization_members.organization_id
        AND organizations.owner_id = auth.uid()
    )
  );

CREATE POLICY "Organization owners and admins can update members"
  ON organization_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM organization_members AS om_admin
      WHERE om_admin.organization_id = organization_members.organization_id
        AND om_admin.user_id = auth.uid()
        AND om_admin.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM organization_members AS om_admin
      WHERE om_admin.organization_id = organization_members.organization_id
        AND om_admin.user_id = auth.uid()
        AND om_admin.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Organization owners and admins can remove members"
  ON organization_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM organization_members AS om_admin
      WHERE om_admin.organization_id = organization_members.organization_id
        AND om_admin.user_id = auth.uid()
        AND om_admin.role IN ('owner', 'admin')
    )
  );
