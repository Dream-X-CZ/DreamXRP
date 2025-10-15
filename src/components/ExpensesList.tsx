import { useState, useEffect } from 'react';
import {
  Plus,
  Calendar,
  DollarSign,
  Trash2,
  CreditCard as Edit2,
  Repeat,
  CheckCircle,
  XCircle,
  Briefcase,
  Globe,
  Mail,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Expense, Category, Project } from '../types/database';
import { ensureUserOrganization } from '../lib/organization';

interface ExpensesListProps {
  activeOrganizationId: string | null;
}

export default function ExpensesList({ activeOrganizationId }: ExpensesListProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const createInitialFormState = () => ({
    name: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    category_id: '',
    project_id: '',
    notes: '',
    is_recurring: false,
    recurring_frequency: 'monthly' as 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    next_occurrence: '',
    is_billable: false,
    is_billed: false,
    billed_date: ''
  });

  const [formData, setFormData] = useState(createInitialFormState);

  const [organizationId, setOrganizationId] = useState<string | null>(null);

  const startOfDay = (date: Date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '—';

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';

    return parsed.toLocaleDateString('cs-CZ');
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency: 'CZK',
      maximumFractionDigits: 0
    }).format(value);

  useEffect(() => {
    const fetchOrganization = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setOrganizationId(null);
        setExpenses([]);
        setCategories([]);
        setProjects([]);
        return;
      }

      const orgId = await ensureUserOrganization(user.id, activeOrganizationId);
      setOrganizationId(orgId);
    };

    fetchOrganization();
  }, [activeOrganizationId]);

  useEffect(() => {
    if (!organizationId) {
      setExpenses([]);
      setCategories([]);
      setProjects([]);
      return;
    }

    loadExpenses();
    loadCategories();
    loadProjects();
  }, [organizationId]);

  const loadExpenses = async () => {
    if (!organizationId) return;
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('organization_id', organizationId)
      .order('date', { ascending: false });

    if (error) {
      console.error('Error loading expenses:', error);
      setExpenses([]);
      return;
    }

    const updatesMade = await processRecurringExpenses(data || []);

    if (updatesMade) {
      await loadExpenses();
      return;
    }

    setExpenses(data || []);
  };

  const loadCategories = async () => {
    if (!organizationId) return;
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name');
    setCategories(data || []);
  };

  const loadProjects = async () => {
    if (!organizationId) return;
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name');
    setProjects(data || []);
  };

  const calculateNextOccurrence = (date: string, frequency: string) => {
    const current = new Date(`${date}T00:00:00`);
    switch (frequency) {
      case 'weekly':
        current.setDate(current.getDate() + 7);
        break;
      case 'monthly':
        current.setMonth(current.getMonth() + 1);
        break;
      case 'quarterly':
        current.setMonth(current.getMonth() + 3);
        break;
      case 'yearly':
        current.setFullYear(current.getFullYear() + 1);
        break;
    }
    return current.toISOString().split('T')[0];
  };

  const processRecurringExpenses = async (fetchedExpenses: Expense[]) => {
    if (!organizationId) return false;

    const today = new Date().toISOString().split('T')[0];
    let updatesMade = false;

    for (const expense of fetchedExpenses) {
      if (!expense.is_recurring || !expense.recurring_frequency || !expense.next_occurrence) {
        continue;
      }

      let occurrenceDate = expense.next_occurrence;
      const occurrencesToCreate: string[] = [];

      while (occurrenceDate && occurrenceDate <= today) {
        occurrencesToCreate.push(occurrenceDate);
        occurrenceDate = calculateNextOccurrence(occurrenceDate, expense.recurring_frequency);
      }

      if (occurrencesToCreate.length === 0) continue;

      try {
        for (const occurrence of occurrencesToCreate) {
          const { error: insertError } = await supabase.from('expenses').insert({
            name: expense.name,
            amount: expense.amount,
            date: occurrence,
            category_id: expense.category_id,
            project_id: expense.project_id ?? null,
            notes: expense.notes ?? null,
            is_recurring: false,
            recurring_frequency: null,
            next_occurrence: null,
            is_billable: expense.is_billable ?? false,
            is_billed: false,
            billed_date: null,
            organization_id: expense.organization_id ?? organizationId,
            user_id: expense.user_id,
          });

          if (insertError) throw insertError;
        }

        const { error: updateError } = await supabase
          .from('expenses')
          .update({ next_occurrence: occurrenceDate })
          .eq('id', expense.id);

        if (updateError) throw updateError;

        updatesMade = true;
      } catch (error) {
        console.error('Error processing recurring expense:', error);
      }
    }

    return updatesMade;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !organizationId) return;

      const normalizedAmount = parseFloat(
        (formData.amount || '')
          .toString()
          .replace(',', '.')
      );

      if (!Number.isFinite(normalizedAmount)) {
        alert('Zadejte platnou částku.');
        return;
      }

      const expenseData = {
        name: formData.name,
        amount: normalizedAmount,
        date: formData.date,
        category_id: formData.category_id,
        project_id: formData.project_id || null,
        notes: formData.notes,
        is_recurring: formData.is_recurring,
        recurring_frequency: formData.is_recurring ? formData.recurring_frequency : null,
        next_occurrence: formData.is_recurring ? calculateNextOccurrence(formData.date, formData.recurring_frequency) : null,
        is_billable: formData.is_billable,
        is_billed: formData.is_billed,
        billed_date: formData.is_billed && formData.billed_date ? formData.billed_date : null,
        organization_id: organizationId,
      };

      if (editingExpense) {
        const { error } = await supabase
          .from('expenses')
          .update(expenseData)
          .eq('id', editingExpense.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('expenses').insert({
          ...expenseData,
          user_id: user.id,
          organization_id: organizationId,
        });

        if (error) throw error;
      }

      resetForm();
      loadExpenses();
    } catch (error) {
      console.error('Error saving expense:', error);
      alert('Chyba při ukládání nákladu');
    }
  };

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      name: expense.name,
      amount: expense.amount.toString(),
      date: expense.date,
      category_id: expense.category_id,
      project_id: expense.project_id || '',
      notes: expense.notes || '',
      is_recurring: expense.is_recurring || false,
      recurring_frequency: expense.recurring_frequency || 'monthly',
      next_occurrence: expense.next_occurrence || '',
      is_billable: expense.is_billable || false,
      is_billed: expense.is_billed || false,
      billed_date: expense.billed_date || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Opravdu chcete smazat tento náklad?')) return;

    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (!error) loadExpenses();
  };

  const resetForm = (options?: { keepOpen?: boolean }) => {
    setFormData(createInitialFormState());
    setEditingExpense(null);
    if (!options?.keepOpen) {
      setShowForm(false);
    }
  };

  const getCategoryName = (categoryId: string) => {
    return categories.find((c) => c.id === categoryId)?.name || 'N/A';
  };

  const getProjectName = (projectId?: string) => {
    if (!projectId) return null;
    return projects.find((p) => p.id === projectId)?.name;
  };

  const getFrequencyText = (frequency?: string) => {
    switch (frequency) {
      case 'weekly': return 'Týdně';
      case 'monthly': return 'Měsíčně';
      case 'quarterly': return 'Čtvrtletně';
      case 'yearly': return 'Ročně';
      default: return '';
    }
  };

  const domainCategoryIds = new Set(
    categories
      .filter((category) => {
        const normalized = category.name.trim().toLowerCase();
        return normalized.includes('domén') || (normalized.includes('hosting') && normalized.includes('email'));
      })
      .map((category) => category.id)
  );

  const today = startOfDay(new Date());
  const msInDay = 1000 * 60 * 60 * 24;

  const domainExpenses = expenses
    .filter((expense) => domainCategoryIds.has(expense.category_id))
    .map((expense) => {
      const categoryName = getCategoryName(expense.category_id);
      const purchaseDate = expense.date ? `${expense.date}T00:00:00` : null;
      const purchaseDateObj = purchaseDate ? new Date(purchaseDate) : null;
      const hasValidPurchaseDate = purchaseDateObj && !Number.isNaN(purchaseDateObj.getTime());

      let renewalDate: Date | null = null;
      if (hasValidPurchaseDate && purchaseDateObj) {
        renewalDate = new Date(purchaseDateObj);
        renewalDate.setFullYear(renewalDate.getFullYear() + 1);
      }

      let daysToRenewal: number | null = null;
      if (renewalDate) {
        const renewalStart = startOfDay(renewalDate);
        daysToRenewal = Math.ceil((renewalStart.getTime() - today.getTime()) / msInDay);
      }

      let status: 'ok' | 'upcoming' | 'expired' | 'unknown' = 'unknown';
      if (!renewalDate) {
        status = 'unknown';
      } else if (daysToRenewal !== null && daysToRenewal <= 0) {
        status = 'expired';
      } else if (daysToRenewal !== null && daysToRenewal <= 30) {
        status = 'upcoming';
      } else {
        status = 'ok';
      }

      return {
        expense,
        categoryName,
        purchaseDate: purchaseDateObj?.toISOString() ?? null,
        renewalDate: renewalDate?.toISOString() ?? null,
        daysToRenewal,
        status
      };
    })
    .sort((a, b) => {
      const aTime = a.renewalDate ? new Date(a.renewalDate).getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.renewalDate ? new Date(b.renewalDate).getTime() : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    });

  const expiredDomains = domainExpenses.filter((item) => item.status === 'expired');
  const upcomingDomains = domainExpenses.filter((item) => item.status === 'upcoming');

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[#0a192f]">Náklady</h2>
          <p className="text-gray-600 mt-1">
            Celkem: <span className="font-semibold">{totalExpenses.toFixed(2)} Kč</span>
          </p>
        </div>
        <button
          onClick={() => {
            if (showForm && !editingExpense) {
              resetForm();
              return;
            }

            resetForm({ keepOpen: true });
            setShowForm(true);
          }}
          className="flex items-center gap-2 bg-[#0a192f] text-white px-6 py-3 rounded-lg hover:bg-opacity-90 transition"
        >
          <Plus className="w-5 h-5" />
          <span>Nový náklad</span>
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-[#0a192f]">Domény a emailové hostingy</h3>
            <p className="text-sm text-gray-600 mt-1">
              Sledované položky: <span className="font-medium">{domainExpenses.length}</span>
            </p>
          </div>
          <div className="flex items-center gap-3 text-[#0a192f]">
            <div className="flex items-center gap-2 bg-[#0a192f]/5 px-3 py-2 rounded-lg">
              <Globe className="w-4 h-4" />
              <span className="text-sm font-medium">Domény</span>
            </div>
            <div className="flex items-center gap-2 bg-[#0a192f]/5 px-3 py-2 rounded-lg">
              <Mail className="w-4 h-4" />
              <span className="text-sm font-medium">Email hostingy</span>
            </div>
          </div>
        </div>

        {domainExpenses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600">
            Zatím není evidována žádná doména ani emailový hosting. Přidejte je jako náklad s kategorií{' '}
            <span className="font-medium">„Doména“</span>{' '}nebo{' '}
            <span className="font-medium">„Emailový hosting“</span>, abychom mohli hlídat termín obnovy.
          </div>
        ) : (
          <>
            {expiredDomains.length > 0 && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4" />
                  <div>
                    <p className="font-semibold">{expiredDomains.length} položek je po termínu obnovy.</p>
                    <p className="mt-1 text-red-600/80">
                      Obnovte je co nejdříve, aby nedošlo ke ztrátě domény nebo přerušení emailových služeb.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {upcomingDomains.length > 0 && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4" />
                  <div>
                    <p className="font-semibold">
                      {upcomingDomains.length} {upcomingDomains.length === 1 ? 'položka vyžaduje' : 'položky vyžadují'} obnovu během 30
                      dní.
                    </p>
                    <p className="mt-1 text-amber-600/80">
                      Naplánujte platbu včas, aby nedošlo k výpadku služeb.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Služba</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Částka</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Datum nákupu</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Další obnovení</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Stav</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Poznámka</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {domainExpenses.map((item) => {
                    const renewalLabel = item.renewalDate ? formatDate(item.renewalDate) : '—';
                    const purchaseLabel = item.purchaseDate ? formatDate(item.purchaseDate) : '—';

                    const statusLabel = (() => {
                      switch (item.status) {
                        case 'expired':
                          return 'Po termínu';
                        case 'upcoming':
                          return `Obnovit do ${item.daysToRenewal} dní`;
                        case 'ok':
                          return 'V pořádku';
                        default:
                          return 'Bez data';
                      }
                    })();

                    const statusClasses = (() => {
                      switch (item.status) {
                        case 'expired':
                          return 'bg-red-100 text-red-700';
                        case 'upcoming':
                          return 'bg-amber-100 text-amber-700';
                        case 'ok':
                          return 'bg-emerald-100 text-emerald-700';
                        default:
                          return 'bg-gray-100 text-gray-600';
                      }
                    })();

                    return (
                      <tr key={item.expense.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#0a192f]">{item.expense.name}</div>
                          <div className="text-xs text-gray-500">{item.categoryName}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-semibold text-[#0a192f]">{formatCurrency(item.expense.amount)}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{purchaseLabel}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{renewalLabel}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClasses}`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {item.expense.notes ? item.expense.notes : <span className="text-gray-400">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold text-[#0a192f] mb-4">
            {editingExpense ? 'Upravit náklad' : 'Nový náklad'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Název *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kategorie *
                </label>
                <select
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                  required
                >
                  <option value="">Vyberte kategorii</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Částka (Kč) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Datum *
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Projekt
                </label>
                <select
                  value={formData.project_id}
                  onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                >
                  <option value="">-- Bez projektu --</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  id="is_recurring"
                  checked={formData.is_recurring}
                  onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
                  className="w-4 h-4 text-[#0a192f] border-gray-300 rounded focus:ring-[#0a192f]"
                />
                <label htmlFor="is_recurring" className="text-sm font-medium text-gray-700">
                  Opakovaný náklad
                </label>
              </div>

              {formData.is_recurring && (
                <div className="ml-6 mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Frekvence
                  </label>
                  <select
                    value={formData.recurring_frequency}
                    onChange={(e) => setFormData({ ...formData, recurring_frequency: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent max-w-xs"
                  >
                    <option value="weekly">Týdně</option>
                    <option value="monthly">Měsíčně</option>
                    <option value="quarterly">Čtvrtletně</option>
                    <option value="yearly">Ročně</option>
                  </select>
                </div>
              )}

              <div className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  id="is_billable"
                  checked={formData.is_billable}
                  onChange={(e) => setFormData({ ...formData, is_billable: e.target.checked })}
                  className="w-4 h-4 text-[#0a192f] border-gray-300 rounded focus:ring-[#0a192f]"
                />
                <label htmlFor="is_billable" className="text-sm font-medium text-gray-700">
                  Náklad k přefakturaci klientovi
                </label>
              </div>

              {formData.is_billable && (
                <div className="ml-6 grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_billed"
                      checked={formData.is_billed}
                      onChange={(e) => setFormData({ ...formData, is_billed: e.target.checked })}
                      className="w-4 h-4 text-[#0a192f] border-gray-300 rounded focus:ring-[#0a192f]"
                    />
                    <label htmlFor="is_billed" className="text-sm font-medium text-gray-700">
                      Již přefakturováno
                    </label>
                  </div>

                  {formData.is_billed && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Datum fakturace
                      </label>
                      <input
                        type="date"
                        value={formData.billed_date}
                        onChange={(e) => setFormData({ ...formData, billed_date: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Poznámka
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-[#0a192f] text-white px-6 py-2 rounded-lg hover:bg-opacity-90 transition"
              >
                {editingExpense ? 'Uložit změny' : 'Přidat náklad'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="border border-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-50 transition"
              >
                Zrušit
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Název
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Kategorie
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Částka
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Datum
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                Akce
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {expenses.map((expense) => (
              <tr key={expense.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{expense.name}</div>
                      {expense.project_id && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                          <Briefcase className="w-3 h-3" />
                          <span>{getProjectName(expense.project_id)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-gray-600">{getCategoryName(expense.category_id)}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm font-semibold text-[#0a192f]">
                    {expense.amount.toFixed(2)} Kč
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {new Date(expense.date).toLocaleDateString('cs-CZ')}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    {expense.is_recurring && (
                      <div className="flex items-center gap-1 text-xs text-blue-600">
                        <Repeat className="w-3 h-3" />
                        <span>{getFrequencyText(expense.recurring_frequency)}</span>
                      </div>
                    )}
                    {expense.is_billable && (
                      <div className={`flex items-center gap-1 text-xs ${expense.is_billed ? 'text-green-600' : 'text-orange-600'}`}>
                        {expense.is_billed ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        <span>{expense.is_billed ? 'Přefakturováno' : 'K přefakturaci'}</span>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => handleEdit(expense)}
                    className="text-[#0a192f] hover:bg-gray-100 p-2 rounded-lg transition inline-flex mr-2"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(expense.id)}
                    className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition inline-flex"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {expenses.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            Zatím nemáte evidované žádné náklady
          </div>
        )}
      </div>
    </div>
  );
}
