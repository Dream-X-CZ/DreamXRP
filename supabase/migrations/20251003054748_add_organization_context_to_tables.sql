/*
  # Add organization context to existing tables

  1. Changes
    - Add `organization_id` to budgets, projects, expenses, employees, categories tables
    - Update existing data to create default organizations for users
    - Create organization members for existing users

  2. Notes
    - Existing users will get their own organization
    - All existing data will be migrated to user's organization
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budgets' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE budgets ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE expenses ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE employees ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE categories ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  user_record RECORD;
  org_id uuid;
BEGIN
  FOR user_record IN SELECT DISTINCT user_id FROM budgets WHERE organization_id IS NULL
  LOOP
    INSERT INTO organizations (name, owner_id)
    VALUES ('Moje organizace', user_record.user_id)
    ON CONFLICT DO NOTHING
    RETURNING id INTO org_id;

    IF org_id IS NOT NULL THEN
      INSERT INTO organization_members (organization_id, user_id, role)
      VALUES (org_id, user_record.user_id, 'owner')
      ON CONFLICT DO NOTHING;

      UPDATE budgets SET organization_id = org_id WHERE user_id = user_record.user_id AND organization_id IS NULL;
      UPDATE projects SET organization_id = org_id WHERE user_id = user_record.user_id AND organization_id IS NULL;
      UPDATE expenses SET organization_id = org_id WHERE user_id = user_record.user_id AND organization_id IS NULL;
      UPDATE employees SET organization_id = org_id WHERE user_id = user_record.user_id AND organization_id IS NULL;
      UPDATE categories SET organization_id = org_id WHERE user_id = user_record.user_id AND organization_id IS NULL;
    END IF;
  END LOOP;
END $$;