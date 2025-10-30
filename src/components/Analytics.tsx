import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, DollarSign, FileText, PieChart, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ensureUserOrganization } from '../lib/organization';
import ReactApexChart from 'react-apexcharts';
import type { ApexAxisChartSeries, ApexNonAxisChartSeries, ApexOptions } from 'apexcharts';

interface Stats {
  totalBudgets: number;
  totalRevenue: number;
  totalCosts: number;
  totalProfit: number;
  totalPersonnelCosts: number;
  totalExpenses: number;
  budgetsByStatus: { status: string; count: number }[];
  expensesByCategory: { category: string; amount: number }[];
  internalCostsByCategory: { category: string; amount: number }[];
  monthlyData: {
    monthKey: string;
    monthLabel: string;
    revenue: number;
    costs: number;
    profit: number;
  }[];
}

const INITIAL_STATS: Stats = {
  totalBudgets: 0,
  totalRevenue: 0,
  totalCosts: 0,
  totalProfit: 0,
  totalPersonnelCosts: 0,
  totalExpenses: 0,
  budgetsByStatus: [],
  expensesByCategory: [],
  internalCostsByCategory: [],
  monthlyData: [],
};

const NOTES_METADATA_PREFIX = '__budget_meta__:';

const parseBudgetItemMetadata = (
  rawNotes: string | null | undefined
): { isPersonnel: boolean } => {
  if (!rawNotes || !rawNotes.startsWith(NOTES_METADATA_PREFIX)) {
    return { isPersonnel: false };
  }

  try {
    const parsed = JSON.parse(rawNotes.slice(NOTES_METADATA_PREFIX.length));
    return { isPersonnel: Boolean(parsed?.isPersonnel) };
  } catch (error) {
    console.warn('Failed to parse budget item metadata in analytics view.', error);
    return { isPersonnel: false };
  }
};

interface AnalyticsProps {
  activeOrganizationId: string | null;
}

export default function Analytics({ activeOrganizationId }: AnalyticsProps) {
  const [stats, setStats] = useState<Stats>(INITIAL_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [activeOrganizationId]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setStats(INITIAL_STATS);
        return;
      }

      const organizationId = await ensureUserOrganization(user.id, activeOrganizationId);

      const { data: budgets, error: budgetsError } = await supabase
        .from('budgets')
        .select('id, status, created_at')
        .eq('organization_id', organizationId)
        .eq('archived', false);

      if (budgetsError) throw budgetsError;

      const budgetIds = (budgets ?? []).map(budget => budget.id);

      const { data: categoryRows, error: categoriesError } = await supabase
        .from('categories')
        .select('id, name')
        .eq('organization_id', organizationId);

      if (categoriesError) throw categoriesError;

      const categoryNameById = new Map(
        (categoryRows ?? []).map((category) => [category.id, category.name])
      );

      let budgetItems: any[] = [];
      if (budgetIds.length > 0) {
        const { data: budgetItemRows, error: budgetItemsError } = await supabase
          .from('budget_items')
          .select('*')
          .in('budget_id', budgetIds);

        if (budgetItemsError) throw budgetItemsError;
        budgetItems = budgetItemRows || [];
      }

      const { data: expenses, error: expensesError } = await supabase
        .from('expenses')
        .select('*, categories(name)')
        .eq('organization_id', organizationId);

      if (expensesError) throw expensesError;

      const totalRevenue = budgetItems?.reduce((sum, item) => sum + item.total_price, 0) || 0;
      const totalCosts = budgetItems?.reduce((sum, item) => sum + item.internal_total_price, 0) || 0;
      const totalProfit = totalRevenue - totalCosts;
      const totalExpenses = expenses?.reduce((sum, exp) => sum + exp.amount, 0) || 0;
      const totalPersonnelCosts =
        budgetItems?.reduce((sum, item) => {
          const { isPersonnel } = parseBudgetItemMetadata(item.notes);
          const hasPersonnelFlag = item.is_personnel ?? isPersonnel;
          if (!hasPersonnelFlag) {
            return sum;
          }

          const internalTotal = Number(item.internal_total_price) || 0;
          return sum + internalTotal;
        }, 0) || 0;

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

      const internalCostsByCategoryMap = new Map<string, number>();
      budgetItems?.forEach((item) => {
        const amount = Number(item.internal_total_price) || 0;
        const categoryName = categoryNameById.get(item.category_id) || 'Nezařazeno';

        if (!internalCostsByCategoryMap.has(categoryName)) {
          internalCostsByCategoryMap.set(categoryName, 0);
        }

        internalCostsByCategoryMap.set(
          categoryName,
          (internalCostsByCategoryMap.get(categoryName) || 0) + amount
        );
      });

      const internalCostsByCategory = Array.from(internalCostsByCategoryMap.entries())
        .map(([category, amount]) => ({ category, amount }))
        .filter((item) => item.amount > 0)
        .sort((a, b) => b.amount - a.amount);

      const monthlyMap = new Map<
        string,
        { revenue: number; costs: number; monthLabel: string }
      >();
      budgetItems?.forEach((item) => {
        const createdAt = item.created_at ? new Date(item.created_at) : new Date();
        const monthKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = createdAt.toLocaleDateString('cs-CZ', {
          year: 'numeric',
          month: 'short',
        });
        const current =
          monthlyMap.get(monthKey) || ({ revenue: 0, costs: 0, monthLabel } as const);
        monthlyMap.set(monthKey, {
          monthLabel,
          revenue: current.revenue + item.total_price,
          costs: current.costs + item.internal_total_price,
        });
      });

      const monthlyData = Array.from(monthlyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([monthKey, data]) => ({
          monthKey,
          monthLabel: data.monthLabel,
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
        totalPersonnelCosts,
        budgetsByStatus,
        expensesByCategory,
        internalCostsByCategory,
        monthlyData,
      });
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    `${value.toLocaleString('cs-CZ', {
      maximumFractionDigits: 0,
    })} Kč`;

  const formatPercentage = (value: number) =>
    `${value.toLocaleString('cs-CZ', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} %`;

  const businessHealth = useMemo(() => {
    const averageMonthlyRevenue =
      stats.monthlyData.length > 0
        ? stats.monthlyData.reduce((sum, month) => sum + month.revenue, 0) /
          stats.monthlyData.length
        : 0;

    const averageMonthlyProfit =
      stats.monthlyData.length > 0
        ? stats.monthlyData.reduce((sum, month) => sum + month.profit, 0) /
          stats.monthlyData.length
        : 0;

    const bestMonth = stats.monthlyData.reduce<
      (typeof stats.monthlyData)[number] | null
    >((best, month) => {
      if (!best || month.profit > best.profit) {
        return month;
      }
      return best;
    }, null);

    const lastTwoMonths = stats.monthlyData.slice(-2);
    const revenueTrend =
      lastTwoMonths.length === 2
        ? ((lastTwoMonths[1].revenue - lastTwoMonths[0].revenue) /
            (lastTwoMonths[0].revenue || 1)) * 100
        : 0;

    const profitMargin =
      stats.totalRevenue > 0
        ? (stats.totalProfit / stats.totalRevenue) * 100
        : 0;

    const expenseRatio =
      stats.totalRevenue > 0
        ? (stats.totalExpenses / stats.totalRevenue) * 100
        : 0;

    const personnelCostShare =
      stats.totalCosts > 0
        ? (stats.totalPersonnelCosts / stats.totalCosts) * 100
        : 0;

    return {
      averageMonthlyRevenue,
      averageMonthlyProfit,
      bestMonth,
      revenueTrend,
      profitMargin,
      expenseRatio,
      personnelCostShare,
    };
  }, [stats]);

  const revenueTrendClass =
    businessHealth.revenueTrend >= 0 ? 'text-green-600' : 'text-red-600';
  const revenueTrendPrefix = businessHealth.revenueTrend >= 0 ? '+' : '';

  const monthlyCategories = useMemo(
    () => stats.monthlyData.map((item) => item.monthLabel),
    [stats.monthlyData]
  );

  const revenueCostSeries = useMemo<ApexAxisChartSeries>(
    () => [
      {
        name: 'Tržby',
        data: stats.monthlyData.map((item) => Math.round(item.revenue)),
      },
      {
        name: 'Náklady',
        data: stats.monthlyData.map((item) => Math.round(item.costs)),
      },
    ],
    [stats.monthlyData]
  );

  const profitSeries = useMemo<ApexAxisChartSeries>(
    () => [
      {
        name: 'Zisk',
        data: stats.monthlyData.map((item) => Math.round(item.profit)),
      },
    ],
    [stats.monthlyData]
  );

  const revenueCostOptions = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: 'area',
        toolbar: { show: false },
        fontFamily: 'inherit',
      },
      stroke: {
        curve: 'smooth',
        width: 3,
      },
      dataLabels: { enabled: false },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 0.4,
          opacityFrom: 0.4,
          opacityTo: 0.1,
        },
      },
      colors: ['#1d4ed8', '#dc2626'],
      xaxis: {
        categories: monthlyCategories,
        labels: {
          style: {
            colors: '#4b5563',
          },
        },
      },
      yaxis: {
        labels: {
          formatter: (value: number) =>
            `${Math.round(value).toLocaleString('cs-CZ')} Kč`,
          style: {
            colors: '#4b5563',
          },
        },
      },
      grid: {
        borderColor: '#e5e7eb',
        strokeDashArray: 4,
      },
      tooltip: {
        theme: 'light',
        y: {
          formatter: (value: number) =>
            `${Math.round(value).toLocaleString('cs-CZ')} Kč`,
        },
      },
      legend: {
        position: 'top',
        horizontalAlign: 'left',
      },
    }),
    [monthlyCategories]
  );

  const profitOptions = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: 'bar',
        toolbar: { show: false },
        fontFamily: 'inherit',
      },
      plotOptions: {
        bar: {
          columnWidth: '45%',
          borderRadius: 6,
        },
      },
      dataLabels: { enabled: false },
      colors: ['#16a34a'],
      xaxis: {
        categories: monthlyCategories,
        labels: {
          style: { colors: '#4b5563' },
        },
      },
      yaxis: {
        labels: {
          formatter: (value: number) =>
            `${Math.round(value).toLocaleString('cs-CZ')} Kč`,
          style: { colors: '#4b5563' },
        },
      },
      grid: {
        borderColor: '#e5e7eb',
        strokeDashArray: 4,
      },
      tooltip: {
        theme: 'light',
        y: {
          formatter: (value: number) =>
            `${Math.round(value).toLocaleString('cs-CZ')} Kč`,
        },
      },
    }),
    [monthlyCategories]
  );

  const budgetsByStatusSeries = useMemo<ApexAxisChartSeries>(
    () => [
      {
        name: 'Počet',
        data: stats.budgetsByStatus.map((item) => item.count),
      },
    ],
    [stats.budgetsByStatus]
  );

  const budgetsByStatusOptions = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: 'bar',
        toolbar: { show: false },
        fontFamily: 'inherit',
      },
      plotOptions: {
        bar: {
          horizontal: true,
          borderRadius: 6,
        },
      },
      dataLabels: { enabled: false },
      colors: ['#0a192f'],
      xaxis: {
        categories: stats.budgetsByStatus.map((item) => item.status),
        labels: {
          style: { colors: '#4b5563' },
        },
      },
      grid: {
        borderColor: '#e5e7eb',
        strokeDashArray: 4,
      },
      tooltip: {
        theme: 'light',
      },
    }),
    [stats.budgetsByStatus]
  );

  const expensesByCategorySeries = useMemo<ApexNonAxisChartSeries>(
    () => stats.expensesByCategory.map((item) => Math.round(item.amount)),
    [stats.expensesByCategory]
  );

  const expensesByCategoryOptions = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: 'donut',
        toolbar: { show: false },
        fontFamily: 'inherit',
      },
      labels: stats.expensesByCategory.map((item) => item.category),
      legend: {
        position: 'bottom',
      },
      dataLabels: {
        formatter: (value: number) => `${value.toFixed(1)} %`,
      },
      stroke: {
        show: false,
      },
      colors: ['#0a192f', '#2563eb', '#eab308', '#dc2626', '#0891b2', '#7c3aed'],
      tooltip: {
        y: {
          formatter: (value: number) =>
            `${Math.round(value).toLocaleString('cs-CZ')} Kč`,
        },
      },
    }),
    [stats.expensesByCategory]
  );

  const hasBudgetStatusData = useMemo(
    () => stats.budgetsByStatus.some((item) => item.count > 0),
    [stats.budgetsByStatus]
  );

  const hasExpensesData = useMemo(
    () => stats.expensesByCategory.some((item) => item.amount > 0),
    [stats.expensesByCategory]
  );

  const internalCostCategoryLabels = useMemo(
    () => stats.internalCostsByCategory.map((item) => item.category),
    [stats.internalCostsByCategory]
  );

  const internalCostsByCategorySeries = useMemo<ApexNonAxisChartSeries>(
    () => stats.internalCostsByCategory.map((item) => Math.round(item.amount)),
    [stats.internalCostsByCategory]
  );

  const internalCostsByCategoryOptions = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: 'donut',
        toolbar: { show: false },
        fontFamily: 'inherit',
      },
      labels: internalCostCategoryLabels,
      legend: {
        position: 'bottom',
      },
      dataLabels: {
        formatter: (value: number) => `${value.toFixed(1)} %`,
      },
      stroke: {
        show: false,
      },
      colors: ['#2563eb', '#0a192f', '#dc2626', '#f97316', '#0f766e', '#7c3aed'],
      tooltip: {
        y: {
          formatter: (value: number) =>
            `${Math.round(value).toLocaleString('cs-CZ')} Kč`,
        },
      },
    }),
    [internalCostCategoryLabels]
  );

  const hasInternalCostData = useMemo(
    () => stats.internalCostsByCategory.some((item) => item.amount > 0),
    [stats.internalCostsByCategory]
  );

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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6 mb-8">
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
            {formatCurrency(stats.totalRevenue)}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600">Celkové náklady</div>
            <DollarSign className="w-5 h-5 text-red-500" />
          </div>
          <div className="text-3xl font-bold text-[#0a192f]">
            {formatCurrency(stats.totalCosts)}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600">Celkový zisk</div>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-green-600">
            {formatCurrency(stats.totalProfit)}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600">Personální náklady</div>
            <Users className="w-5 h-5 text-purple-500" />
          </div>
          <div className="text-3xl font-bold text-[#0a192f]">
            {formatCurrency(stats.totalPersonnelCosts)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-[#0a192f] mb-4">Průměrný měsíční výkon</h3>
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-gray-600">Tržby</div>
              <div className="text-xl font-semibold text-[#0a192f]">
                {formatCurrency(businessHealth.averageMonthlyRevenue)}
              </div>
            </div>
            <div>
              <div className="text-gray-600">Zisk</div>
              <div className="text-xl font-semibold text-[#0a192f]">
                {formatCurrency(businessHealth.averageMonthlyProfit)}
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            {stats.monthlyData.length > 0
              ? `Na základě posledních ${stats.monthlyData.length} měsíců`
              : 'Čekáme na první měsíční data'}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-[#0a192f] mb-4">Finanční zdraví</h3>
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-gray-600">Ziskovost</div>
              <div className="text-xl font-semibold text-[#0a192f]">
                {formatPercentage(businessHealth.profitMargin)}
              </div>
            </div>
            <div>
              <div className="text-gray-600">Podíl nákladů na tržbách</div>
              <div className="text-xl font-semibold text-[#0a192f]">
                {formatPercentage(businessHealth.expenseRatio)}
              </div>
            </div>
            <div>
              <div className="text-gray-600">Podíl personálních nákladů</div>
              <div className="text-xl font-semibold text-[#0a192f]">
                {formatPercentage(businessHealth.personnelCostShare)}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-[#0a192f] mb-4">Aktuální trend</h3>
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-gray-600">Vývoj tržeb oproti minulému měsíci</div>
              <div className={`text-xl font-semibold ${revenueTrendClass}`}>
                {revenueTrendPrefix}
                {formatPercentage(businessHealth.revenueTrend)}
              </div>
              <div className="text-xs text-gray-500">
                {stats.monthlyData.length >= 2
                  ? 'Meziměsíční změna z posledních dvou měsíců'
                  : 'Čekáme na další měsíc pro vyhodnocení trendu'}
              </div>
            </div>
            <div>
              <div className="text-gray-600">Nejlepší měsíc</div>
              <div className="text-xl font-semibold text-[#0a192f]">
                {businessHealth.bestMonth
                  ? businessHealth.bestMonth.monthLabel
                  : 'Zatím není k dispozici'}
              </div>
              {businessHealth.bestMonth && (
                <div className="text-xs text-gray-500">
                  Zisk {formatCurrency(businessHealth.bestMonth.profit)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6 xl:col-span-2">
          <h3 className="text-lg font-semibold text-[#0a192f] mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Vývoj tržeb a nákladů
          </h3>
          {stats.monthlyData.length > 0 ? (
            <ReactApexChart
              options={revenueCostOptions}
              series={revenueCostSeries}
              type="area"
              height={320}
            />
          ) : (
            <div className="text-center text-gray-500 py-12">
              Zatím není dostatek dat pro zobrazení vývoje tržeb a nákladů
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-[#0a192f] mb-4">Klíčové poznatky</h3>
          <ul className="space-y-3 text-sm text-gray-600">
            <li className="flex items-center justify-between">
              <span className="font-semibold text-[#0a192f]">Průměrný měsíční zisk</span>
              <span className="text-[#0a192f]">
                {formatCurrency(businessHealth.averageMonthlyProfit)}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="font-semibold text-[#0a192f]">Ziskovost</span>
              <span className="text-[#0a192f]">
                {formatPercentage(businessHealth.profitMargin)}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="font-semibold text-[#0a192f]">Trend tržeb</span>
              <span className={revenueTrendClass}>
                {revenueTrendPrefix}
                {formatPercentage(businessHealth.revenueTrend)}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="font-semibold text-[#0a192f]">Personální náklady</span>
              <span className="text-[#0a192f]">
                {formatPercentage(businessHealth.personnelCostShare)}
              </span>
            </li>
            <li>
              <span className="font-semibold text-[#0a192f] block">Nejlepší měsíc</span>
              {businessHealth.bestMonth ? (
                <div className="flex items-center justify-between text-sm">
                  <span>{businessHealth.bestMonth.monthLabel}</span>
                  <span className="text-[#0a192f] font-semibold">
                    {formatCurrency(businessHealth.bestMonth.profit)}
                  </span>
                </div>
              ) : (
                <span>Zatím není k dispozici</span>
              )}
            </li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6 xl:col-span-2">
          <h3 className="text-lg font-semibold text-[#0a192f] mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Vývoj zisku
          </h3>
          {stats.monthlyData.length > 0 ? (
            <ReactApexChart
              options={profitOptions}
              series={profitSeries}
              type="bar"
              height={320}
            />
          ) : (
            <div className="text-center text-gray-500 py-12">
              Zatím není dostatek dat pro zobrazení vývoje zisku
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-[#0a192f] mb-4">Měsíční detail</h3>
          {stats.monthlyData.length > 0 ? (
            <div className="space-y-4 max-h-[320px] overflow-y-auto pr-1">
              {stats.monthlyData
                .slice()
                .reverse()
                .map((item) => (
                  <div
                    key={item.monthKey}
                    className="border-b border-gray-200 pb-4 last:border-0"
                  >
                    <div className="flex items-center justify-between text-sm font-medium text-gray-700 mb-2">
                      <span>{item.monthLabel}</span>
                      <span
                        className={`font-semibold ${
                          item.profit >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {formatCurrency(item.profit)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-xs text-gray-500">
                      <div>
                        <div className="uppercase tracking-wide">Tržby</div>
                        <div className="text-[#0a192f] font-semibold text-sm">
                          {formatCurrency(item.revenue)}
                        </div>
                      </div>
                      <div>
                        <div className="uppercase tracking-wide">Náklady</div>
                        <div className="text-[#0a192f] font-semibold text-sm">
                          {formatCurrency(item.costs)}
                        </div>
                      </div>
                      <div>
                        <div className="uppercase tracking-wide">Zisk</div>
                        <div
                          className={`font-semibold text-sm ${
                            item.profit >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {formatCurrency(item.profit)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-12">
              Zatím není dostatek dat pro zobrazení měsíčního přehledu
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-[#0a192f] mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5" />
            Rozpočty podle stavu
          </h3>
          {hasBudgetStatusData ? (
            <ReactApexChart
              options={budgetsByStatusOptions}
              series={budgetsByStatusSeries}
              type="bar"
              height={320}
            />
          ) : (
            <div className="text-center text-gray-500 py-12">
              Zatím není dostatek dat pro zobrazení stavů rozpočtů
            </div>
          )}
        </div>
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-[#0a192f] mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Náklady podle kategorie
            </h3>
            {hasExpensesData ? (
              <ReactApexChart
                options={expensesByCategoryOptions}
                series={expensesByCategorySeries}
                type="donut"
                height={320}
              />
            ) : (
              <div className="text-center text-gray-500 py-12">
                Žádné náklady k zobrazení
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-[#0a192f] mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Interní náklady podle kategorie
            </h3>
            {hasInternalCostData ? (
              <div className="space-y-4">
                <ReactApexChart
                  options={internalCostsByCategoryOptions}
                  series={internalCostsByCategorySeries}
                  type="donut"
                  height={220}
                />
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {stats.internalCostsByCategory.map((item) => (
                    <div
                      key={item.category}
                      className="flex items-center justify-between text-sm text-gray-600"
                    >
                      <span className="font-medium text-[#0a192f]">{item.category}</span>
                      <span className="font-semibold text-[#0a192f]">
                        {formatCurrency(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-12">
                Žádné interní náklady k zobrazení
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
