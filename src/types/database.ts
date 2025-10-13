export interface Category {
  id: string;
  name: string;
  user_id: string;
  organization_id?: string | null;
  created_at: string;
}

export interface Budget {
  id: string;
  name: string;
  client_name: string;
  client_email?: string;
  contact_person?: string;
  project_manager?: string;
  manager_email?: string;
  status: 'draft' | 'sent' | 'approved' | 'rejected';
  user_id: string;
  organization_id?: string | null;
  created_at: string;
  updated_at: string;
  archived: boolean;
  archived_at?: string | null;
}

export interface BudgetItem {
  id: string;
  budget_id: string;
  category_id: string;
  item_name: string;
  unit: string;
  quantity: number;
  price_per_unit: number;
  total_price: number;
  notes: string;
  internal_price_per_unit: number;
  internal_quantity: number;
  internal_total_price: number;
  profit: number;
  order_index: number;
  created_at: string;
  is_cost?: boolean;
}

export interface Expense {
  id: string;
  category_id: string;
  name: string;
  amount: number;
  date: string;
  notes: string;
  budget_id?: string;
  project_id?: string;
  user_id: string;
  organization_id?: string | null;
  is_recurring: boolean;
  recurring_frequency?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  next_occurrence?: string;
  is_billable: boolean;
  is_billed: boolean;
  billed_date?: string;
  created_at: string;
}

export interface Employee {
  id: string;
  user_id: string;
  organization_id?: string | null;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  position?: string;
  hourly_rate?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  organization_id?: string | null;
  name: string;
  description?: string;
  budget_id?: string;
  parent_project_id?: string | null;
  start_date?: string;
  end_date?: string;
  status: 'planning' | 'active' | 'completed' | 'on-hold' | 'cancelled';
  total_budget: number;
  spent_amount: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  client_hourly_rate?: number | null;
}

export interface Organization {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  created_at: string;
  user?: {
    email: string;
  };
}

export interface Invitation {
  id: string;
  organization_id: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  invited_by: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  token: string;
  expires_at: string;
  created_at: string;
}

export interface InvitationWithOrganization extends Invitation {
  organization?: Organization | null;
}

export interface ResourcePermission {
  id: string;
  organization_id: string;
  user_id: string;
  resource_type:
    | 'budgets'
    | 'projects'
    | 'expenses'
    | 'employees'
    | 'analytics';
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  created_at: string;
}

export interface ProjectAssignment {
  id: string;
  project_id: string;
  employee_id: string;
  assigned_by: string;
  role_in_project?: string;
  assigned_at: string;
  notes?: string;
}

export interface Task {
  id: string;
  project_id: string;
  assigned_to?: string;
  created_by?: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimated_hours: number;
  actual_hours: number;
  deadline?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  organization_id: string;
  title: string;
  description?: string | null;
  start_at: string;
  end_at: string;
  type: string;
  task_id?: string | null;
  task?: (Task & { project?: Project | null }) | null;
  created_at: string;
  updated_at: string;
}
