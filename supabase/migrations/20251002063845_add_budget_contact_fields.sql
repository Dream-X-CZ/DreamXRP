/*
  # Add contact fields to budgets table

  1. Changes
    - Add `client_email` column to store client's email
    - Add `contact_person` column to store contact person name
    - Add `project_manager` column to store project manager name
    - Add `manager_email` column to store project manager email
  
  2. Notes
    - Using IF NOT EXISTS to prevent errors if columns already exist
    - All fields are optional (nullable)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budgets' AND column_name = 'client_email'
  ) THEN
    ALTER TABLE budgets ADD COLUMN client_email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budgets' AND column_name = 'contact_person'
  ) THEN
    ALTER TABLE budgets ADD COLUMN contact_person text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budgets' AND column_name = 'project_manager'
  ) THEN
    ALTER TABLE budgets ADD COLUMN project_manager text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budgets' AND column_name = 'manager_email'
  ) THEN
    ALTER TABLE budgets ADD COLUMN manager_email text;
  END IF;
END $$;