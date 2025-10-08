import { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  Users,
  Briefcase,
  AlertCircle,
  CheckCircle,
  Clock,
  Plus,
  ArrowRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ensureUserOrganization } from '../lib/organization';

interface DashboardStats {
  totalBudgets: number;
  activeBudgets: number;
  totalRevenue: number;
  revenueChange: number;
  totalExpenses: number;
  expensesChange: number;
  activeProjects: number;
  projectsChange: number;
  totalEmployees: number;
  budgetUtilization: number;
  profitMargin: number;
}

interface RecentActivity {
  id: string;
  type: 'budget' | 'project' | 'expense' | 'employee';
  action: string;
  timestamp: string;
  details: string;
}

interface Notification {
  id: string;
  type: 'warning' | 'info' | 'success';
  message: string;
  timestamp: string;
}

interface DashboardProps {
  onNavigate: (view: string, action?: string) => void;
  activeOrganizationId: string | null;
}

const INITIAL_STATS: DashboardStats = {
  totalBudgets: 0,
  activeBudgets: 0,
  totalRevenue: 0,
  revenueChange: 0,
  totalExpenses: 0,
  expensesChange: 0,
  activeProjects: 0,
  projectsChange: 0,
  totalEmployees: 0,
  budgetUtilization: 0,
  profitMargin: 0
};

export default function Dashboard({ onNavigate, activeOrganizationId }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [activeOrganizationId]);

  const loadDashboardData = async () => {
    setLoading(true);

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setStats(INITIAL_STATS);
        setRecentActivities([]);
        setNotifications([]);
        return;
      }

      const organizationId = await ensureUserOrganization(user.id, activeOrganizationId);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const [budgetsRes, expensesRes, projectsRes, employeesRes, recentBudgetsRes, expensesLast30, expensesPrevious30] = await Promise.all([
        supabase.from('budgets').select('*').eq('organization_id', organizationId),
        supabase.from('expenses').select('*').eq('organization_id', organizationId),
        supabase.from('projects').select('*').eq('organization_id', organizationId),
        supabase.from('employees').select('*').eq('organization_id', organizationId),
        supabase
          .from('budgets')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('expenses')
          .select('amount')
          .eq('organization_id', organizationId)
          .gte('created_at', thirtyDaysAgo.toISOString()),
        supabase
          .from('expenses')
          .select('amount')
          .eq('organization_id', organizationId)
          .gte('created_at', sixtyDaysAgo.toISOString())
          .lt('created_at', thirtyDaysAgo.toISOString())
      ]);

      if (budgetsRes.error) throw budgetsRes.error;
      if (expensesRes.error) throw expensesRes.error;
      if (projectsRes.error) throw projectsRes.error;
      if (employeesRes.error) throw employeesRes.error;

      const budgets = budgetsRes.data || [];
      const expenses = expensesRes.data || [];
      const projects = projectsRes.data || [];
      const employees = employeesRes.data || [];

      const activeBudgets = budgets.filter(b => b.status === 'approved' || b.status === 'sent').length;
      const activeProjects = projects.filter(p => p.status === 'active').length;

      const totalRevenue = budgets
        .filter(b => b.status === 'approved')
        .reduce((sum, b) => sum + (b.total_revenue || 0), 0);

      const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

      const expensesLast30Total = (expensesLast30.data || []).reduce((sum, e) => sum + e.amount, 0);
      const expensesPrevious30Total = (expensesPrevious30.data || []).reduce((sum, e) => sum + e.amount, 0);
      const expensesChange = expensesPrevious30Total > 0
        ? ((expensesLast30Total - expensesPrevious30Total) / expensesPrevious30Total) * 100
        : 0;

      const budgetUtilization = totalRevenue > 0 ? (totalExpenses / totalRevenue) * 100 : 0;
      const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0;

      const activities: RecentActivity[] = (recentBudgetsRes.data || []).map(budget => ({
        id: budget.id,
        type: 'budget' as const,
        action: 'vytvořen',
        timestamp: budget.created_at,
        details: `Rozpočet "${budget.name}" pro ${budget.client_name}`
      }));

      const alerts: Notification[] = [];

      projects.forEach(project => {
        if (project.total_budget > 0 && project.spent_amount > project.total_budget * 0.9) {
          alerts.push({
            id: project.id,
            type: 'warning',
            message: `Projekt "${project.name}" překročil 90% rozpočtu`,
            timestamp: new Date().toISOString()
          });
        }
      });

      budgets.forEach(budget => {
        if (budget.status === 'sent') {
          alerts.push({
            id: budget.id,
            type: 'info',
            message: `Rozpočet "${budget.name}" čeká na schválení`,
            timestamp: budget.created_at
          });
        }
      });

      setStats({
        totalBudgets: budgets.length,
        activeBudgets,
        totalRevenue,
        revenueChange: 0,
        totalExpenses,
        expensesChange,
        activeProjects,
        projectsChange: 0,
        totalEmployees: employees.length,
        budgetUtilization,
        profitMargin
      });

      setRecentActivities(activities);
      setNotifications(alerts);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency: 'CZK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Načítání dashboardu...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-[#0a192f]">Dashboard</h1>
          <p className="text-gray-600 mt-1">Přehled klíčových metrik a aktivit</p>
        </div>
        <div className="text-sm text-gray-500">
          Aktualizováno: {new Date().toLocaleString('cs-CZ')}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div className={`flex items-center gap-1 text-sm ${stats.revenueChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.revenueChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{formatPercentage(stats.revenueChange)}</span>
            </div>
          </div>
          <h3 className="text-2xl font-bold text-[#0a192f] mb-1">{stats.totalBudgets}</h3>
          <p className="text-gray-600 text-sm mb-2">Celkový počet rozpočtů</p>
          <p className="text-xs text-gray-500">{stats.activeBudgets} aktivních</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex items-center gap-1 text-sm text-green-600">
              <TrendingUp className="w-4 h-4" />
              <span>{formatPercentage(stats.profitMargin)}</span>
            </div>
          </div>
          <h3 className="text-2xl font-bold text-[#0a192f] mb-1">{formatCurrency(stats.totalRevenue)}</h3>
          <p className="text-gray-600 text-sm mb-2">Celkové tržby</p>
          <p className="text-xs text-gray-500">Zisková marže: {stats.profitMargin.toFixed(1)}%</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-orange-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-orange-600" />
            </div>
            <div className={`flex items-center gap-1 text-sm ${stats.expensesChange >= 0 ? 'text-red-600' : 'text-green-600'}`}>
              {stats.expensesChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{formatPercentage(stats.expensesChange)}</span>
            </div>
          </div>
          <h3 className="text-2xl font-bold text-[#0a192f] mb-1">{formatCurrency(stats.totalExpenses)}</h3>
          <p className="text-gray-600 text-sm mb-2">Celkové náklady</p>
          <p className="text-xs text-gray-500">Využití: {stats.budgetUtilization.toFixed(1)}%</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Briefcase className="w-6 h-6 text-purple-600" />
            </div>
            <div className={`flex items-center gap-1 text-sm ${stats.projectsChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.projectsChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{formatPercentage(stats.projectsChange)}</span>
            </div>
          </div>
          <h3 className="text-2xl font-bold text-[#0a192f] mb-1">{stats.activeProjects}</h3>
          <p className="text-gray-600 text-sm mb-2">Aktivní projekty</p>
          <p className="text-xs text-gray-500">{stats.totalEmployees} zaměstnanců</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-[#0a192f] mb-4">Rychlé akce</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              onClick={() => onNavigate('budgets', 'create')}
              className="flex flex-col items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-[#0a192f] hover:bg-gray-50 transition group"
            >
              <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition">
                <Plus className="w-6 h-6 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">Nový rozpočet</span>
            </button>

            <button
              onClick={() => onNavigate('projects', 'create')}
              className="flex flex-col items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-[#0a192f] hover:bg-gray-50 transition group"
            >
              <div className="p-3 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition">
                <Plus className="w-6 h-6 text-purple-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">Nový projekt</span>
            </button>

            <button
              onClick={() => onNavigate('expenses', 'create')}
              className="flex flex-col items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-[#0a192f] hover:bg-gray-50 transition group"
            >
              <div className="p-3 bg-orange-100 rounded-lg group-hover:bg-orange-200 transition">
                <Plus className="w-6 h-6 text-orange-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">Nový náklad</span>
            </button>

            <button
              onClick={() => onNavigate('employees', 'create')}
              className="flex flex-col items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-[#0a192f] hover:bg-gray-50 transition group"
            >
              <div className="p-3 bg-green-100 rounded-lg group-hover:bg-green-200 transition">
                <Plus className="w-6 h-6 text-green-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">Nový zaměstnanec</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[#0a192f]">Navigace</h3>
          </div>
          <div className="space-y-2">
            <button
              onClick={() => onNavigate('budgets', '')}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition group"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Rozpočty</span>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#0a192f]" />
            </button>

            <button
              onClick={() => onNavigate('projects', '')}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition group"
            >
              <div className="flex items-center gap-3">
                <Briefcase className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Projekty</span>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#0a192f]" />
            </button>

            <button
              onClick={() => onNavigate('expenses', '')}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition group"
            >
              <div className="flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Náklady</span>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#0a192f]" />
            </button>

            <button
              onClick={() => onNavigate('analytics', '')}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition group"
            >
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Analytika</span>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#0a192f]" />
            </button>

            <button
              onClick={() => onNavigate('employees', '')}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition group"
            >
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Zaměstnanci</span>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#0a192f]" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[#0a192f]">Upozornění</h3>
            <span className="text-sm text-gray-500">{notifications.length} aktivních</span>
          </div>
          <div className="space-y-3">
            {notifications.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="text-gray-600">Žádná upozornění</p>
              </div>
            ) : (
              notifications.slice(0, 5).map((notification) => (
                <div
                  key={notification.id}
                  className={`flex items-start gap-3 p-3 rounded-lg ${
                    notification.type === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
                    notification.type === 'info' ? 'bg-blue-50 border border-blue-200' :
                    'bg-green-50 border border-green-200'
                  }`}
                >
                  {notification.type === 'warning' && <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />}
                  {notification.type === 'info' && <Clock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />}
                  {notification.type === 'success' && <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">{notification.message}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(notification.timestamp).toLocaleString('cs-CZ')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[#0a192f]">Poslední aktivity</h3>
            <button
              onClick={() => onNavigate('budgets', '')}
              className="text-sm text-[#0a192f] hover:underline"
            >
              Zobrazit vše
            </button>
          </div>
          <div className="space-y-4">
            {recentActivities.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600">Žádné nedávné aktivity</p>
              </div>
            ) : (
              recentActivities.map((activity) => (
                <div key={activity.id} className="flex gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                      {activity.type === 'budget' && <FileText className="w-5 h-5 text-gray-600" />}
                      {activity.type === 'project' && <Briefcase className="w-5 h-5 text-gray-600" />}
                      {activity.type === 'expense' && <DollarSign className="w-5 h-5 text-gray-600" />}
                      {activity.type === 'employee' && <Users className="w-5 h-5 text-gray-600" />}
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">{activity.details}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(activity.timestamp).toLocaleString('cs-CZ')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
