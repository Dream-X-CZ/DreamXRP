BEGIN;

CREATE POLICY "Invited users can respond to their invitations"
  ON invitations FOR UPDATE
  TO authenticated
  USING (
    status = 'pending'
    AND lower(email) = lower(auth.jwt() ->> 'email')
  )
  WITH CHECK (
    lower(email) = lower(auth.jwt() ->> 'email')
    AND status IN ('accepted', 'declined')
);

CREATE POLICY "Invited users can join organizations"
  ON organization_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM invitations
      WHERE invitations.organization_id = organization_members.organization_id
        AND lower(invitations.email) = lower(auth.jwt() ->> 'email')
        AND invitations.status = 'pending'
        AND invitations.expires_at > now()
        AND invitations.role = organization_members.role
    )
  );

COMMIT;
