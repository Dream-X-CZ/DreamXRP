/*
  # Add parent-child relationships between projects

  1. Changes
    - Add optional parent_project_id reference to projects table
    - Create an index for faster lookups by parent project
*/

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS parent_project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_parent_project_id_idx
  ON projects(parent_project_id);
