import { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, FileText, PieChart } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Stats {
  totalBudgets: number;
  totalRevenue: number;
  totalCosts: number;
  totalProfit: number;
  totalExpenses: number;
  budgetsByStatus: { status: string; count: number }[];
  expensesByCategory: { category: string; amount: number }[];
  monthlyData: { month: string; revenue: number; costs: number; profit: number }[];
}

export default function Analytics() {
  const [stats, setStats] = useState<Stats>({
    totalBudgets: 0,
    totalRevenue: 0,
    totalCosts: 0,
    totalProfit: 0,
    totalExpenses: 0,
    budgetsByStatus: [],
    expensesByCategory: [],
    monthlyData: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const { data: budgets } = await supabase.from('budgets').select('*');

      const { data: budgetItems } = await supabase.from('budget_items').select('*');

      const { data: expenses } = await supabase.from('expenses').select('*, categories(name)');

      const { data: categories } = await supabase.from('categories').select('*');

      const totalRevenue = budgetItems?.reduce((sum, item) => sum + item.total_price, 0) || 0;
      const totalCosts = budgetItems?.reduce((sum, item) => sum + item.internal_total_price, 0) || 0;
      const totalProfit = totalRevenue - totalCosts;
      const totalExpenses = expenses?.reduce((sum, exp) => sum + exp.amount, 0) || 0;

      const budgetsByStatus = [
        { status: 'Koncept', count: budgets?.filter((b) => b.status === 'draft').length || 0 },
        { status: 'Odesláno', count: budgets?.filter((b) => b.status === 'sent').length || 0 },
        { status: 'Schváleno', count: budgets?.filter((b) => b.status === 'approved').length || 0 },
        { status: 'Zamítnuto', count: budgets?.filter((b) => b.status === 'rejected').length || 0 },
      ];

      const expensesByCategoryMap = new Map<string, number>();
      expenses?.forEach((exp: any) => {
        const categoryName = exp.categories?.name || 'Ostatní';
        expensesByCategoryMap.set(
          categoryName,
          (expensesByCategoryMap.get(categoryName) || 0) + exp.amount
        );
      });

      const expensesByCategory = Array.from(expensesByCategoryMap.entries()).map(
        ([category, amount]) => ({ category, amount })
      );

      const monthlyMap = new Map<string, { revenue: number; costs: number }>();
      budgetItems?.forEach((item) => {
        const month = new Date(item.created_at).toLocaleDateString('cs-CZ', {
          year: 'numeric',
          month: 'short',
        });
        const current = monthlyMap.get(month) || { revenue: 0, costs: 0 };
        monthlyMap.set(month, {
          revenue: current.revenue + item.total_price,
          costs: current.costs + item.internal_total_price,
        });
      });

      const monthlyData = Array.from(monthlyMap.entries())
        .map(([month, data]) => ({
          month,
          revenue: data.revenue,
          costs: data.costs,
          profit: data.revenue - data.costs,
        }))
        .slice(-6);

      setStats({
        totalBudgets: budgets?.length || 0,
        totalRevenue,
        totalCosts,
        totalProfit,
        totalExpenses,
        budgetsByStatus,
        expensesByCategory,
        monthlyData,
      });
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Načítání analytiky...</div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#0a192f] mb-6">Analytika</h2>

      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600">Celkem rozpočtů</div>
            <FileText className="w-5 h-5 text-gray-400" />
          </div>
          <div className="text-3xl font-bold text-[#0a192f]">{stats.totalBudgets}</div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600">Celkové tržby</div>
            <DollarSign className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-[#0a192f]">
            {stats.totalRevenue.toFixed(0)} Kč
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600">Celkové náklady</div>
            <DollarSign className="w-5 h-5 text-red-500" />
          </div>
          <div className="text-3xl font-bold text-[#0a192f]">
            {stats.totalCosts.toFixed(0)} Kč
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600">Celkový zisk</div>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-green-600">
            {stats.totalProfit.toFixed(0)} Kč
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-[#0a192f] mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5" />
            Rozpočty podle stavu
          </h3>
          <div className="space-y-3">
            {stats.budgetsByStatus.map((item, index) => (
              <div key={index}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{item.status}</span>
                  <span className="font-semibold text-[#0a192f]">{item.count}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-[#0a192f] h-2 rounded-full transition-all"
                    style={{
                      width: `${stats.totalBudgets > 0 ? (item.count / stats.totalBudgets) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-[#0a192f] mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Náklady podle kategorie
          </h3>
          <div className="space-y-3">
            {stats.expensesByCategory.slice(0, 5).map((item, index) => (
              <div key={index}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{item.category}</span>
                  <span className="font-semibold text-[#0a192f]">
                    {item.amount.toFixed(0)} Kč
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-[#0a192f] h-2 rounded-full transition-all"
                    style={{
                      width: `${stats.totalExpenses > 0 ? (item.amount / stats.totalExpenses) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            {stats.expensesByCategory.length === 0 && (
              <div className="text-center text-gray-500 py-4">
                Žádné náklady k zobrazení
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-[#0a192f] mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Vývoj v čase (posledních 6 měsíců)
        </h3>
        {stats.monthlyData.length > 0 ? (
          <div className="space-y-4">
            {stats.monthlyData.map((item, index) => (
              <div key={index} className="border-b border-gray-200 pb-4 last:border-0">
                <div className="text-sm font-medium text-gray-700 mb-2">{item.month}</div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-gray-600">Tržby</div>
                    <div className="font-semibold text-[#0a192f]">
                      {item.revenue.toFixed(0)} Kč
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Náklady</div>
                    <div className="font-semibold text-[#0a192f]">
                      {item.costs.toFixed(0)} Kč
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Zisk</div>
                    <div className="font-semibold text-green-600">
                      {item.profit.toFixed(0)} Kč
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8">
            Zatím není dostatek dat pro zobrazení vývoje v čase
          </div>
        )}
      </div>
    </div>
  );
}