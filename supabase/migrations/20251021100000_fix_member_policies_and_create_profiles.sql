BEGIN;

DROP POLICY IF EXISTS "Members can view their organization membership" ON organization_members;
DROP POLICY IF EXISTS "Members can view organization members" ON organization_members;
DROP POLICY IF EXISTS "Organization owners and admins can add members" ON organization_members;
DROP POLICY IF EXISTS "Organization owners and admins can update members" ON organization_members;
DROP POLICY IF EXISTS "Organization owners and admins can remove members" ON organization_members;
DROP POLICY IF EXISTS "Users can view their own membership rows" ON organization_members;
DROP POLICY IF EXISTS "Organization owners can add themselves as members" ON organization_members;

CREATE OR REPLACE FUNCTION public.is_member_of_organization(org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_member_of_organization(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_member_of_organization(uuid) TO authenticated;

CREATE POLICY "Members can view organization members"
  ON organization_members FOR SELECT
  TO authenticated
  USING (public.is_member_of_organization(organization_id));

CREATE POLICY "Organization owners and admins can add members"
  ON organization_members FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_member_of_organization(organization_id)
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
  USING (public.is_member_of_organization(organization_id))
  WITH CHECK (
    public.is_member_of_organization(organization_id)
    OR EXISTS (
      SELECT 1
      FROM organizations
      WHERE organizations.id = organization_members.organization_id
        AND organizations.owner_id = auth.uid()
    )
  );

CREATE POLICY "Organization owners and admins can remove members"
  ON organization_members FOR DELETE
  TO authenticated
  USING (
    public.is_member_of_organization(organization_id)
    OR EXISTS (
      SELECT 1
      FROM organizations
      WHERE organizations.id = organization_members.organization_id
        AND organizations.owner_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  position text,
  bio text,
  avatar_url text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, position, bio, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

COMMIT;
