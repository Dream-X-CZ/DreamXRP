import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, Save, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Budget, BudgetItem, Category } from '../types/database';
import * as XLSX from 'xlsx';

interface BudgetEditorProps {
  budgetId: string | null;
  onBack: () => void;
}

export default function BudgetEditor({ budgetId, onBack }: BudgetEditorProps) {
  const [budget, setBudget] = useState<Partial<Budget>>({
    name: '',
    client_name: '',
    status: 'draft',
  });
  const [items, setItems] = useState<Partial<BudgetItem>[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCategories();
    if (budgetId) {
      loadBudget();
    } else {
      addNewItem();
    }
  }, [budgetId]);

  const loadCategories = async () => {
    const { data } = await supabase.from('categories').select('*').order('name');
    setCategories(data || []);
  };

  const loadBudget = async () => {
    if (!budgetId) return;
    setLoading(true);

    try {
      const { data: budgetData } = await supabase
        .from('budgets')
        .select('*')
        .eq('id', budgetId)
        .single();

      const { data: itemsData } = await supabase
        .from('budget_items')
        .select('*')
        .eq('budget_id', budgetId)
        .order('order_index');

      if (budgetData) setBudget(budgetData);
      if (itemsData) setItems(itemsData);
    } catch (error) {
      console.error('Error loading budget:', error);
    } finally {
      setLoading(false);
    }
  };

  const addNewItem = () => {
    setItems([
      ...items,
      {
        item_name: '',
        unit: 'ks',
        quantity: 1,
        price_per_unit: 0,
        total_price: 0,
        notes: '',
        internal_price_per_unit: 0,
        internal_quantity: 1,
        internal_total_price: 0,
        profit: 0,
        order_index: items.length,
      },
    ]);
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    const item = { ...newItems[index], [field]: value };

    if (field === 'quantity' || field === 'price_per_unit') {
      item.total_price = (item.quantity || 0) * (item.price_per_unit || 0);
      if (field === 'quantity') {
        item.internal_quantity = value;
      }
    }

    if (field === 'internal_quantity' || field === 'internal_price_per_unit') {
      item.internal_total_price = (item.internal_quantity || 0) * (item.internal_price_per_unit || 0);
    }

    item.profit = (item.total_price || 0) - (item.internal_total_price || 0);

    newItems[index] = item;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const saveBudget = async () => {
    if (!budget.name || !budget.client_name) {
      alert('Vyplňte prosím název zakázky a klienta');
      return;
    }

    const invalidItems = items.filter(
      item => !item.category_id || !item.item_name
    );

    if (invalidItems.length > 0) {
      alert('Všechny položky musí mít vybranou kategorii a název');
      return;
    }

    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let currentBudgetId = budgetId;

      if (!budgetId) {
        const { data: newBudget, error: budgetError } = await supabase
          .from('budgets')
          .insert({
            ...budget,
            user_id: user.id,
          })
          .select()
          .single();

        if (budgetError) throw budgetError;
        currentBudgetId = newBudget.id;
      } else {
        const { error: updateError } = await supabase
          .from('budgets')
          .update({
            ...budget,
            updated_at: new Date().toISOString(),
          })
          .eq('id', budgetId);

        if (updateError) throw updateError;
      }

      if (currentBudgetId) {
        await supabase.from('budget_items').delete().eq('budget_id', currentBudgetId);

        const itemsToInsert = items.map((item, index) => ({
          ...item,
          budget_id: currentBudgetId,
          order_index: index,
        }));

        const { error: itemsError } = await supabase
          .from('budget_items')
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        const negativeItems = items.filter(item => (item.price_per_unit || 0) < 0);

        if (negativeItems.length > 0 && categories.length > 0) {
          const expensesToCreate = negativeItems.map(item => ({
            name: item.item_name || 'Náklad z rozpočtu',
            amount: Math.abs((item.total_price || 0)),
            date: new Date().toISOString().split('T')[0],
            category_id: item.category_id,
            budget_id: currentBudgetId,
            notes: `Automaticky vytvořeno z rozpočtu: ${budget.name}. ${item.notes || ''}`,
            user_id: user.id,
            is_recurring: false,
            is_billable: false,
            is_billed: false
          }));

          const { error: expensesError } = await supabase
            .from('expenses')
            .insert(expensesToCreate);

          if (expensesError) {
            console.error('Error creating expenses:', expensesError);
          }
        }
      }

      onBack();
    } catch (error) {
      console.error('Error saving budget:', error);
      alert('Chyba při ukládání rozpočtu');
    } finally {
      setSaving(false);
    }
  };

  const exportToExcel = (includeInternal: boolean) => {
    const fileName = includeInternal
      ? `${budget.name || 'Rozpocet'}_kompletni.xlsx`
      : `${budget.name || 'Rozpocet'}_klient.xlsx`;

    const worksheetData: any[] = [
      ['Klient', budget.client_name || '', '', 'E-mail', budget.client_email || '', '', 'Projektový manažer', budget.project_manager || ''],
      ['Projekt', budget.name || '', '', 'Datum zahájení', new Date().toLocaleDateString('cs-CZ'), '', 'E-mail', budget.manager_email || ''],
      ['Typ projektu', '', '', 'Datum ukončení', '', '', '', ''],
      [],
    ];

    worksheetData.push([]);
    worksheetData.push(['', '', '', '', '', 'Rozpočet', '', '']);

    const headers = ['Kategorie', 'Položka', 'Jednotka', 'Počet', 'Kč / jednotka', 'Kč celkem bez DPH', '', 'Poznámka'];
    worksheetData.push(headers);

    items.forEach((item) => {
      const category = categories.find(c => c.id === item.category_id);
      const row = [
        category?.name || '',
        item.item_name || '',
        item.unit || '',
        item.quantity || 0,
        `${(item.price_per_unit || 0).toFixed(2)} Kč`,
        `${(item.total_price || 0).toFixed(2)} Kč`,
        '',
        item.notes || '',
      ];

      worksheetData.push(row);
    });

    worksheetData.push([]);
    worksheetData.push(['Celkem k fakturaci bez DPH', '', '', '', '', `${totals.clientTotal.toFixed(2)} Kč`]);
    worksheetData.push(['Celkem k fakturaci s DPH', '0,00%', '', '', '', `${totals.clientTotal.toFixed(2)} Kč`]);

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rozpočet');

    worksheet['!cols'] = [
      { wch: 18 },
      { wch: 35 },
      { wch: 10 },
      { wch: 8 },
      { wch: 14 },
      { wch: 18 },
      { wch: 3 },
      { wch: 40 }
    ];

    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let R = 0; R <= range.e.r; R++) {
      for (let C = 0; C <= range.e.c; C++) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        if (!worksheet[cellRef]) continue;

        if (!worksheet[cellRef].s) worksheet[cellRef].s = {};

        if (R <= 2) {
          worksheet[cellRef].s = {
            font: { bold: true },
            fill: { fgColor: { rgb: 'E8F4F8' } },
            border: {
              top: { style: 'thin' },
              bottom: { style: 'thin' },
              left: { style: 'thin' },
              right: { style: 'thin' }
            }
          };
        }

        if (R === 5) {
          worksheet[cellRef].s = {
            font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 14 },
            fill: { fgColor: { rgb: '1F4E78' } },
            alignment: { horizontal: 'center' }
          };
        }

        if (R === 6) {
          worksheet[cellRef].s = {
            font: { color: { rgb: 'FFFFFF' }, bold: true },
            fill: { fgColor: { rgb: '1F4E78' } },
            border: {
              top: { style: 'thin' },
              bottom: { style: 'thin' },
              left: { style: 'thin' },
              right: { style: 'thin' }
            }
          };
        }
      }
    }

    XLSX.writeFile(workbook, fileName);
  };

  const totals = items.reduce(
    (acc, item) => ({
      clientTotal: acc.clientTotal + (item.total_price || 0),
      internalTotal: acc.internalTotal + (item.internal_total_price || 0),
      profit: acc.profit + (item.profit || 0),
    }),
    { clientTotal: 0, internalTotal: 0, profit: 0 }
  );

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
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-[#0a192f] transition"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Zpět</span>
        </button>

        <div className="flex gap-3">
          {budgetId && (
            <>
              <button
                onClick={() => exportToExcel(false)}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition"
              >
                <Download className="w-5 h-5" />
                <span>Excel pro klienta</span>
              </button>
              <button
                onClick={() => exportToExcel(true)}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition"
              >
                <Download className="w-5 h-5" />
                <span>Excel kompletní</span>
              </button>
            </>
          )}
          <button
            onClick={saveBudget}
            disabled={saving}
            className="flex items-center gap-2 bg-[#0a192f] text-white px-6 py-3 rounded-lg hover:bg-opacity-90 transition disabled:opacity-50"
          >
            <Save className="w-5 h-5" />
            <span>{saving ? 'Ukládám...' : 'Uložit'}</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold text-[#0a192f] mb-6">
          {budgetId ? 'Upravit rozpočet' : 'Nový rozpočet'}
        </h2>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Název zakázky
            </label>
            <input
              type="text"
              value={budget.name || ''}
              onChange={(e) => setBudget({ ...budget, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
              placeholder="Např. Rekonstrukce koupelny"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Klient
            </label>
            <input
              type="text"
              value={budget.client_name || ''}
              onChange={(e) => setBudget({ ...budget, client_name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
              placeholder="Jméno klienta"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              E-mail klienta
            </label>
            <input
              type="email"
              value={budget.client_email || ''}
              onChange={(e) => setBudget({ ...budget, client_email: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
              placeholder="klient@email.cz"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Kontaktní osoba
            </label>
            <input
              type="text"
              value={budget.contact_person || ''}
              onChange={(e) => setBudget({ ...budget, contact_person: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
              placeholder="Jméno kontaktní osoby"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Projektový manažer
            </label>
            <input
              type="text"
              value={budget.project_manager || ''}
              onChange={(e) => setBudget({ ...budget, project_manager: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
              placeholder="Jméno manažera"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              E-mail manažera
            </label>
            <input
              type="email"
              value={budget.manager_email || ''}
              onChange={(e) => setBudget({ ...budget, manager_email: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
              placeholder="manazer@vas-email.cz"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-[#0a192f]">Položky rozpočtu</h3>
          <button
            onClick={addNewItem}
            className="flex items-center gap-2 text-[#0a192f] hover:bg-gray-100 px-4 py-2 rounded-lg transition"
          >
            <Plus className="w-5 h-5" />
            <span>Přidat položku</span>
          </button>
        </div>

        <div className="space-y-4">
          {items.map((item, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start mb-4">
                <h4 className="font-medium text-[#0a192f]">Položka {index + 1}</h4>
                <button
                  onClick={() => removeItem(index)}
                  className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-6 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Kategorie
                    </label>
                    <select
                      value={item.category_id || ''}
                      onChange={(e) => updateItem(index, 'category_id', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                    >
                      <option value="">Vyberte...</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Název položky
                    </label>
                    <input
                      type="text"
                      value={item.item_name || ''}
                      onChange={(e) => updateItem(index, 'item_name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Jednotka
                    </label>
                    <input
                      type="text"
                      value={item.unit || ''}
                      onChange={(e) => updateItem(index, 'unit', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Počet
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.quantity || ''}
                      onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Kč/jednotka
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.price_per_unit || ''}
                      onChange={(e) => updateItem(index, 'price_per_unit', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-6 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Celkem bez DPH
                    </label>
                    <input
                      type="number"
                      value={item.total_price?.toFixed(2) || '0.00'}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Poznámka
                    </label>
                    <input
                      type="text"
                      value={item.notes || ''}
                      onChange={(e) => updateItem(index, 'notes', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                    />
                  </div>

                  <div className="col-span-3 bg-gray-50 rounded-lg p-3">
                    <div className="text-xs font-medium text-gray-700 mb-2">Interní část</div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          Kč/j. náklad
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.internal_price_per_unit || ''}
                          onChange={(e) => updateItem(index, 'internal_price_per_unit', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          Počet
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.internal_quantity || ''}
                          onChange={(e) => updateItem(index, 'internal_quantity', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          Náklad celkem
                        </label>
                        <input
                          type="number"
                          value={item.internal_total_price?.toFixed(2) || '0.00'}
                          readOnly
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                        />
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-300">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Zisk:</span>
                        <span className="font-semibold text-green-600">
                          {item.profit?.toFixed(2) || '0.00'} Kč
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#0a192f] text-white rounded-lg shadow p-6 sticky bottom-4">
        <h3 className="text-lg font-semibold mb-4">Souhrn</h3>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-sm opacity-80 mb-1">Celkem pro klienta</div>
            <div className="text-2xl font-bold">{totals.clientTotal.toFixed(2)} Kč</div>
          </div>
          <div>
            <div className="text-sm opacity-80 mb-1">Interní náklady</div>
            <div className="text-2xl font-bold">{totals.internalTotal.toFixed(2)} Kč</div>
          </div>
          <div>
            <div className="text-sm opacity-80 mb-1">Celkový zisk</div>
            <div className="text-2xl font-bold text-green-400">{totals.profit.toFixed(2)} Kč</div>
          </div>
        </div>
      </div>
    </div>
  );
}