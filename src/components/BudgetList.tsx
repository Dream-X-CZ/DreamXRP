import { useState, useEffect } from 'react';
import {
  Plus,
  FileText,
  Calendar,
  User,
  Eye,
  DollarSign,
  TrendingUp,
  CheckCircle,
  Clock,
  Archive,
  ArchiveRestore,
  Trash2,
  AlertTriangle,
  X,
  Pencil
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ensureUserOrganization } from '../lib/organization';
import { Budget } from '../types/database';

interface BudgetListProps {
  onCreateNew: () => void;
  onEditBudget: (budgetId: string) => void;
  onViewBudget: (budgetId: string) => void;
  refreshSignal?: number;
  activeOrganizationId?: string | null;
}

interface BudgetWithStats extends Budget {
  total_amount?: number;
  internal_cost?: number;
  profit?: number;
  items_count?: number;
}

export default function BudgetList({ onCreateNew, onEditBudget, onViewBudget, refreshSignal, activeOrganizationId }: BudgetListProps) {
  const [budgets, setBudgets] = useState<BudgetWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'draft' | 'sent' | 'approved' | 'rejected' | 'archived'>('all');
  const [updatingBudgetId, setUpdatingBudgetId] = useState<string | null>(null);
  const [budgetToDelete, setBudgetToDelete] = useState<BudgetWithStats | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    loadBudgets();
  }, [refreshSignal, activeOrganizationId]);

  const loadBudgets = async () => {
    try {
      setLoading(true);
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setBudgets([]);
        return;
      }

      const organizationId = await ensureUserOrganization(user.id, activeOrganizationId);
      const { data: budgetsData, error: budgetsError } = await supabase
        .from('budgets')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (budgetsError) throw budgetsError;

      const budgetsWithStats = await Promise.all(
        (budgetsData || []).map(async (budget) => {
          const { data: items } = await supabase
            .from('budget_items')
            .select('*')
            .eq('budget_id', budget.id);

          const total_amount = items?.reduce((sum, item) => sum + (item.total_price || 0), 0) || 0;
          const internal_cost = items?.reduce((sum, item) => sum + (item.internal_total_price || 0), 0) || 0;
          const profit = total_amount - internal_cost;
          const items_count = items?.length || 0;

          return {
            ...budget,
            archived: budget.archived ?? false,
            archived_at: budget.archived_at ?? null,
            total_amount,
            internal_cost,
            profit,
            items_count
          };
        })
      );

      setBudgets(budgetsWithStats);
    } catch (error) {
      console.error('Error loading budgets:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'draft': return 'Koncept';
      case 'sent': return 'Odesláno';
      case 'approved': return 'Schváleno';
      case 'rejected': return 'Zamítnuto';
      default: return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <FileText className="w-4 h-4" />;
      case 'sent': return <Clock className="w-4 h-4" />;
      case 'approved': return <CheckCircle className="w-4 h-4" />;
      case 'rejected': return <FileText className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const handleArchiveToggle = async (budgetId: string, shouldArchive: boolean) => {
    try {
      setUpdatingBudgetId(budgetId);
      const archivedAtValue = shouldArchive ? new Date().toISOString() : null;
      const { error } = await supabase
        .from('budgets')
        .update({
          archived: shouldArchive,
          archived_at: archivedAtValue,
          updated_at: new Date().toISOString()
        })
        .eq('id', budgetId);

      if (error) throw error;

      setBudgets((prev) =>
        prev.map((budget) =>
          budget.id === budgetId
            ? { ...budget, archived: shouldArchive, archived_at: archivedAtValue }
            : budget
        )
      );
    } catch (error) {
      console.error('Error updating budget archive state:', error);
      alert('Nepodařilo se aktualizovat archivaci rozpočtu. Zkuste to prosím znovu.');
    } finally {
      setUpdatingBudgetId(null);
    }
  };

  const handleDeleteBudget = async () => {
    if (!budgetToDelete) return;

    try {
      setDeleteLoading(true);

      const { error: deleteItemsError } = await supabase
        .from('budget_items')
        .delete()
        .eq('budget_id', budgetToDelete.id);

      if (deleteItemsError) throw deleteItemsError;

      const { error: deleteBudgetError } = await supabase
        .from('budgets')
        .delete()
        .eq('id', budgetToDelete.id);

      if (deleteBudgetError) throw deleteBudgetError;

      setBudgets((prev) => prev.filter((budget) => budget.id !== budgetToDelete.id));
      setBudgetToDelete(null);
    } catch (error) {
      console.error('Error deleting budget:', error);
      alert('Nepodařilo se smazat rozpočet. Zkuste to prosím znovu.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const activeBudgets = budgets.filter((budget) => !budget.archived);
  const archivedBudgets = budgets.filter((budget) => budget.archived);

  const filteredBudgets = filter === 'archived'
    ? archivedBudgets
    : filter === 'all'
      ? activeBudgets
      : activeBudgets.filter((budget) => budget.status === filter);

  const totalRevenue = activeBudgets.reduce((sum, b) => sum + (b.total_amount || 0), 0);
  const totalCosts = activeBudgets.reduce((sum, b) => sum + (b.internal_cost || 0), 0);
  const totalProfit = totalRevenue - totalCosts;

  const emptyStateTitle = (() => {
    if (filter === 'all') {
      return 'Zatím nemáte žádné rozpočty';
    }
    if (filter === 'archived') {
      return 'Žádné archivované rozpočty';
    }
    return `Žádné rozpočty ve stavu "${getStatusText(filter)}"`;
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Načítání...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-[#0a192f]">Rozpočty</h2>
        <button
          onClick={onCreateNew}
          className="flex items-center gap-2 bg-[#0a192f] text-white px-6 py-3 rounded-lg hover:bg-opacity-90 transition"
        >
          <Plus className="w-5 h-5" />
          <span>Nový rozpočet</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Celkové příjmy</span>
            <DollarSign className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-2xl font-bold text-[#0a192f]">
            {totalRevenue.toLocaleString('cs-CZ')} Kč
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Celkové náklady</span>
            <TrendingUp className="w-5 h-5 text-red-600" />
          </div>
          <div className="text-2xl font-bold text-[#0a192f]">
            {totalCosts.toLocaleString('cs-CZ')} Kč
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Celkový zisk</span>
            <TrendingUp className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-green-600">
            {totalProfit.toLocaleString('cs-CZ')} Kč
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Počet rozpočtů</span>
            <FileText className="w-5 h-5 text-gray-600" />
          </div>
          <div className="text-2xl font-bold text-[#0a192f]">
            {activeBudgets.length}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg transition ${
              filter === 'all'
                ? 'bg-[#0a192f] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Aktivní ({activeBudgets.length})
          </button>
          <button
            onClick={() => setFilter('draft')}
            className={`px-4 py-2 rounded-lg transition ${
              filter === 'draft'
                ? 'bg-[#0a192f] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Koncepty ({activeBudgets.filter(b => b.status === 'draft').length})
          </button>
          <button
            onClick={() => setFilter('sent')}
            className={`px-4 py-2 rounded-lg transition ${
              filter === 'sent'
                ? 'bg-[#0a192f] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Odeslané ({activeBudgets.filter(b => b.status === 'sent').length})
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`px-4 py-2 rounded-lg transition ${
              filter === 'approved'
                ? 'bg-[#0a192f] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Schválené ({activeBudgets.filter(b => b.status === 'approved').length})
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`px-4 py-2 rounded-lg transition ${
              filter === 'rejected'
                ? 'bg-[#0a192f] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Zamítnuté ({activeBudgets.filter(b => b.status === 'rejected').length})
          </button>
          <button
            onClick={() => setFilter('archived')}
            className={`px-4 py-2 rounded-lg transition ${
              filter === 'archived'
                ? 'bg-[#0a192f] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Archivované ({archivedBudgets.length})
          </button>
        </div>
      </div>

      {filteredBudgets.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{emptyStateTitle}</h3>
          <p className="text-gray-600 mb-6">
            {filter === 'archived'
              ? 'Archivujte hotové rozpočty pro přehlednější práci s aktivními zakázkami.'
              : 'Vytvořte svůj první rozpočet a začněte spravovat zakázky'}
          </p>
          <button
            onClick={onCreateNew}
            className="bg-[#0a192f] text-white px-6 py-3 rounded-lg hover:bg-opacity-90 transition"
          >
            Vytvořit rozpočet
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredBudgets.map((budget) => (
            <div
              key={budget.id}
              className="bg-white rounded-lg shadow hover:shadow-lg transition p-6 cursor-pointer"
              onClick={() => onViewBudget(budget.id)}
            >
              <div className="flex justify-between items-start mb-4 gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <h3 className="text-xl font-semibold text-[#0a192f]">
                      {budget.name}
                    </h3>
                    <span
                      className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(budget.status)}`}
                    >
                      {getStatusIcon(budget.status)}
                      {getStatusText(budget.status)}
                    </span>
                    {budget.archived && (
                      <span className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        <Archive className="w-4 h-4" />
                        Archivováno
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-4">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <span>{budget.client_name}</span>
                    </div>

                    {budget.client_email && (
                      <div className="flex items-center gap-2">
                        <span>{budget.client_email}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>{new Date(budget.created_at).toLocaleDateString('cs-CZ')}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      <span>{budget.items_count} položek</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    className="text-[#0a192f] hover:bg-gray-100 p-2 rounded-lg transition"
                    onClick={(event) => {
                      event.stopPropagation();
                      onViewBudget(budget.id);
                    }}
                    title="Zobrazit detail"
                  >
                    <Eye className="w-5 h-5" />
                  </button>
                  <button
                    className="text-[#0a192f] hover:bg-gray-100 p-2 rounded-lg transition"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditBudget(budget.id);
                    }}
                    title="Upravit rozpočet"
                  >
                    <Pencil className="w-5 h-5" />
                  </button>
                  <button
                    className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition"
                    onClick={(event) => {
                      event.stopPropagation();
                      setBudgetToDelete(budget);
                    }}
                    title="Smazat rozpočet"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button
                    className="text-[#0a192f] hover:bg-gray-100 p-2 rounded-lg transition disabled:opacity-50"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleArchiveToggle(budget.id, !budget.archived);
                    }}
                    disabled={updatingBudgetId === budget.id}
                    title={budget.archived ? 'Obnovit rozpočet' : 'Archivovat rozpočet'}
                  >
                    {budget.archived ? <ArchiveRestore className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <div className="text-xs text-gray-600 mb-1">Cena pro klienta</div>
                  <div className="text-lg font-bold text-[#0a192f]">
                    {(budget.total_amount || 0).toLocaleString('cs-CZ')} Kč
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-600 mb-1">Interní náklady</div>
                  <div className="text-lg font-bold text-red-600">
                    {(budget.internal_cost || 0).toLocaleString('cs-CZ')} Kč
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-600 mb-1">Zisk</div>
                  <div className="text-lg font-bold text-green-600">
                    {(budget.profit || 0).toLocaleString('cs-CZ')} Kč
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-600 mb-1">Marže</div>
                  <div className="text-lg font-bold text-blue-600">
                    {budget.total_amount ? ((budget.profit || 0) / budget.total_amount * 100).toFixed(1) : 0}%
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {budgetToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm"
          onClick={() => (deleteLoading ? null : setBudgetToDelete(null))}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#0a192f]">Smazat rozpočet</h3>
                  <p className="text-sm text-gray-600">Tato akce je nevratná. Všechny položky a podklady spojené s tímto rozpočtem budou odstraněny.</p>
                </div>
              </div>
              <button
                className="rounded-full border border-gray-200 p-1 text-gray-500 transition hover:border-gray-300 hover:text-gray-700"
                onClick={() => setBudgetToDelete(null)}
                aria-label="Zavřít potvrzení smazání"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-4 rounded-xl bg-gray-50 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Název rozpočtu</p>
                <p className="text-sm font-medium text-[#0a192f]">{budgetToDelete.name}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Celková částka</p>
                  <p className="text-sm font-semibold text-[#0a192f]">
                    {(budgetToDelete.total_amount || 0).toLocaleString('cs-CZ')} Kč
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Počet položek</p>
                  <p className="text-sm font-semibold text-[#0a192f]">{budgetToDelete.items_count ?? 0}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
                onClick={() => setBudgetToDelete(null)}
                disabled={deleteLoading}
              >
                Zrušit
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleDeleteBudget}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  'Mažu…'
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Smazat rozpočet
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
