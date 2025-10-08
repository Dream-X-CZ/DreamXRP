import { useState, useEffect } from 'react';
import { Plus, Calendar, DollarSign, Trash2, CreditCard as Edit2, Repeat, CheckCircle, XCircle, Briefcase } from 'lucide-react';
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
  const [formData, setFormData] = useState({
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

  const [organizationId, setOrganizationId] = useState<string | null>(null);

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
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('organization_id', organizationId)
      .order('date', { ascending: false });
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
    const current = new Date(date);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !organizationId) return;

      const expenseData = {
        name: formData.name,
        amount: parseFloat(formData.amount),
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

  const resetForm = () => {
    setFormData({
      name: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      category_id: '',
      project_id: '',
      notes: '',
      is_recurring: false,
      recurring_frequency: 'monthly',
      next_occurrence: '',
      is_billable: false,
      is_billed: false,
      billed_date: ''
    });
    setShowForm(false);
    setEditingExpense(null);
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
            setShowForm(!showForm);
            resetForm();
          }}
          className="flex items-center gap-2 bg-[#0a192f] text-white px-6 py-3 rounded-lg hover:bg-opacity-90 transition"
        >
          <Plus className="w-5 h-5" />
          <span>Nový náklad</span>
        </button>
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
