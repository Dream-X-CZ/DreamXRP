-- Allow users to read their own membership rows and create membership when owning org

CREATE POLICY "Users can view their own membership rows"
  ON organization_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Organization owners can add themselves as members"
  ON organization_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id IN (
      SELECT id FROM organizations
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Organization owners can view their organizations"
  ON organizations FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());
