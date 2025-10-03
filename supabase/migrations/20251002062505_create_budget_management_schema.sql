/*
  # Budget Management System Schema

  ## Overview
  This migration creates a complete budget management system for tracking budgets, 
  expenses, and internal calculations with profit tracking.

  ## New Tables

  ### 1. `categories`
  - `id` (uuid, primary key) - Unique category identifier
  - `name` (text) - Category name
  - `created_at` (timestamptz) - Record creation timestamp
  - `user_id` (uuid) - Owner of the category

  ### 2. `budgets`
  - `id` (uuid, primary key) - Unique budget identifier
  - `name` (text) - Budget/project name
  - `client_name` (text) - Client name
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp
  - `status` (text) - Budget status (draft, sent, approved, rejected)
  - `user_id` (uuid) - Owner of the budget

  ### 3. `budget_items`
  - `id` (uuid, primary key) - Unique item identifier
  - `budget_id` (uuid) - Reference to budget
  - `category_id` (uuid) - Reference to category
  - `item_name` (text) - Name of the item
  - `unit` (text) - Unit of measurement
  - `quantity` (decimal) - Number of units
  - `price_per_unit` (decimal) - Price per unit (client-facing)
  - `total_price` (decimal) - Total price without VAT (client-facing)
  - `notes` (text) - Additional notes
  - `internal_price_per_unit` (decimal) - Internal cost per unit
  - `internal_quantity` (decimal) - Internal quantity (defaults to same as quantity)
  - `internal_total_price` (decimal) - Internal total cost
  - `profit` (decimal) - Profit for this item
  - `order_index` (integer) - For ordering items
  - `created_at` (timestamptz) - Record creation timestamp

  ### 4. `expenses`
  - `id` (uuid, primary key) - Unique expense identifier
  - `category_id` (uuid) - Reference to category
  - `name` (text) - Expense name
  - `amount` (decimal) - Expense amount
  - `date` (date) - Expense date
  - `notes` (text) - Additional notes
  - `budget_id` (uuid, nullable) - Optional reference to budget
  - `user_id` (uuid) - Owner of the expense
  - `created_at` (timestamptz) - Record creation timestamp

  ## Security
  - Enable RLS on all tables
  - Policies allow authenticated users to manage only their own data
  - Each table has separate SELECT, INSERT, UPDATE, DELETE policies
  
  ## Important Notes
  1. All monetary values stored as decimal for precision
  2. Internal calculations separate from client-facing values
  3. Profit automatically calculated as difference between client and internal prices
  4. Categories are user-specific for flexibility
  5. Expenses can be linked to specific budgets or standalone
*/

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own categories"
  ON categories FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own categories"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own categories"
  ON categories FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own categories"
  ON categories FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client_name text NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'rejected')),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own budgets"
  ON budgets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own budgets"
  ON budgets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own budgets"
  ON budgets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own budgets"
  ON budgets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create budget_items table
CREATE TABLE IF NOT EXISTS budget_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  item_name text NOT NULL,
  unit text NOT NULL,
  quantity decimal(10, 2) NOT NULL DEFAULT 0,
  price_per_unit decimal(10, 2) NOT NULL DEFAULT 0,
  total_price decimal(10, 2) NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  internal_price_per_unit decimal(10, 2) NOT NULL DEFAULT 0,
  internal_quantity decimal(10, 2) NOT NULL DEFAULT 0,
  internal_total_price decimal(10, 2) NOT NULL DEFAULT 0,
  profit decimal(10, 2) NOT NULL DEFAULT 0,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view items from own budgets"
  ON budget_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM budgets
      WHERE budgets.id = budget_items.budget_id
      AND budgets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create items in own budgets"
  ON budget_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM budgets
      WHERE budgets.id = budget_items.budget_id
      AND budgets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update items in own budgets"
  ON budget_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM budgets
      WHERE budgets.id = budget_items.budget_id
      AND budgets.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM budgets
      WHERE budgets.id = budget_items.budget_id
      AND budgets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete items from own budgets"
  ON budget_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM budgets
      WHERE budgets.id = budget_items.budget_id
      AND budgets.user_id = auth.uid()
    )
  );

-- Create expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  amount decimal(10, 2) NOT NULL DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  notes text DEFAULT '',
  budget_id uuid REFERENCES budgets(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own expenses"
  ON expenses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own expenses"
  ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own expenses"
  ON expenses FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own expenses"
  ON expenses FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_items_budget_id ON budget_items(budget_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_budget_id ON expenses(budget_id);