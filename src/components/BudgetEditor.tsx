import { useState, useEffect, useMemo, useRef } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';

import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Save,
  Sparkles,
  Wallet,
  PiggyBank,
  Layers,
  BarChart3,
  Target,
  FileSpreadsheet,
  FileText,
  Info,
  Loader2,
  X,
  Archive,
  ArchiveRestore

} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Budget, BudgetItem, Category } from '../types/database';
import * as XLSX from 'xlsx';
import { ensureUserOrganization } from '../lib/organization';
import { isValidUuid } from '../lib/uuid';

interface BudgetEditorProps {
  budgetId: string | null;
  onBack: () => void;
  onSaved: () => void;
  activeOrganizationId: string | null;
}

export default function BudgetEditor({ budgetId, onBack, onSaved, activeOrganizationId }: BudgetEditorProps) {
  const [budget, setBudget] = useState<Partial<Budget>>({
    name: '',
    client_name: '',
    status: 'draft',
    archived: false,
    archived_at: null
  });
  const [items, setItems] = useState<Partial<BudgetItem>[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [categoryManagerError, setCategoryManagerError] = useState<string | null>(null);
  const [categorySavingId, setCategorySavingId] = useState<string | 'new' | null>(null);
  const categoriesLoadedRef = useRef(false);

  const statusOptions: { value: Budget['status']; label: string; hint: string }[] = [
    { value: 'draft', label: 'Koncept', hint: 'Pracovní verze pro interní ladění' },
    { value: 'sent', label: 'Odesláno', hint: 'Posláno klientovi ke schválení' },
    { value: 'approved', label: 'Schváleno', hint: 'Klient odsouhlasil nabídku' },
    { value: 'rejected', label: 'Zamítnuto', hint: 'Vyžaduje úpravy nebo revizi' }
  ];

  const NOTES_METADATA_PREFIX = '__budget_meta__:';

  const decodeItemNotes = (rawNotes?: string | null) => {
    if (!rawNotes) {
      return { text: '', isCost: false };
    }

    if (rawNotes.startsWith(NOTES_METADATA_PREFIX)) {
      try {
        const parsed = JSON.parse(rawNotes.slice(NOTES_METADATA_PREFIX.length));
        return {
          text: typeof parsed?.note === 'string' ? parsed.note : '',
          isCost: Boolean(parsed?.isCost)
        };
      } catch (error) {
        console.warn('Failed to parse budget item metadata, falling back to raw notes.', error);
      }
    }

    return { text: rawNotes, isCost: false };
  };

  const encodeItemNotes = (noteText: string | undefined, isCost: boolean | undefined) => {
    const sanitizedNote = noteText || '';

    if (!isCost) {
      return sanitizedNote;
    }

    const payload = { note: sanitizedNote, isCost: true };
    return `${NOTES_METADATA_PREFIX}${JSON.stringify(payload)}`;
  };

  const createEmptyItem = (orderIndex: number): Partial<BudgetItem> => ({
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
    order_index: orderIndex,
    is_cost: false
  });

  useEffect(() => {
    const fetchOrganization = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setOrganizationId(null);
        setCategories([]);
        return;
      }

      const orgId = await ensureUserOrganization(user.id, activeOrganizationId);
      setOrganizationId(orgId);
    };

    fetchOrganization();
  }, [activeOrganizationId]);

  useEffect(() => {
    if (!organizationId) return;
    loadCategories();
  }, [organizationId]);

  useEffect(() => {
    if (budgetId && isValidUuid(budgetId)) {
      loadBudget(budgetId);
    } else {
      setBudget({ name: '', client_name: '', status: 'draft', archived: false, archived_at: null });
      setItems([createEmptyItem(0)]);
    }
    setCurrentStep(0);
    setStepErrors([]);
  }, [budgetId]);

  const loadCategories = async () => {
    if (!organizationId) return;
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name');
    setCategories(data || []);
    categoriesLoadedRef.current = true;
  };

  useEffect(() => {
    if (!categoriesLoadedRef.current) return;

    setItems((prevItems) => {
      let hasChanged = false;
      const normalized = prevItems.map((item) => {
        if (item.category_id && !categories.some((cat) => cat.id === item.category_id)) {
          hasChanged = true;
          return { ...item, category_id: '' };
        }
        return item;
      });

      return hasChanged ? normalized : prevItems;
    });
  }, [categories]);

  const loadBudget = async (id: string) => {
    setLoading(true);

    try {
      const { data: budgetData } = await supabase
        .from('budgets')
        .select('*')
        .eq('id', id)
        .single();

      const { data: itemsData } = await supabase
        .from('budget_items')
        .select('*')
        .eq('budget_id', id)
        .order('order_index');

      if (budgetData) {
        setBudget({
          ...budgetData,
          archived: budgetData.archived ?? false,
          archived_at: budgetData.archived_at ?? null
        });
      }
      if (itemsData && itemsData.length > 0) {
        setItems(
          itemsData.map((item, index) => {
            const { text: decodedNote, isCost } = decodeItemNotes(item.notes);

            return {
              ...item,
              notes: decodedNote,
              order_index: index,
              is_cost: item.is_cost ?? isCost
            };
          })
        );
      } else {
        setItems([createEmptyItem(0)]);
      }
    } catch (error) {
      console.error('Error loading budget:', error);
    } finally {
      setLoading(false);
    }
  };

  const addNewItem = () => {
    setItems((prev) => [...prev, createEmptyItem(prev.length)]);
  };

  const handleArchiveToggle = async () => {
    if (!budgetId) return;

    try {
      setArchiveLoading(true);
      const shouldArchive = !budget.archived;
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

      setBudget((prev) => ({
        ...prev,
        archived: shouldArchive,
        archived_at: archivedAtValue
      }));

      onSaved();
    } catch (error) {
      console.error('Error toggling budget archive state:', error);
      alert('Archivaci rozpočtu se nepodařilo změnit. Zkuste to prosím znovu.');
    } finally {
      setArchiveLoading(false);
    }
  };

  type EditableField =
    | 'category_id'
    | 'item_name'
    | 'notes'
    | 'quantity'
    | 'unit'
    | 'price_per_unit'
    | 'internal_quantity'
    | 'internal_price_per_unit'
    | 'is_cost';

  const updateItem = (index: number, field: EditableField, value: string | number | boolean) => {
    setItems((prev) => {
      const newItems = [...prev];
      const item = { ...newItems[index] };

      switch (field) {
        case 'category_id':
          item.category_id = typeof value === 'string' ? value : '';
          break;
        case 'item_name':
          item.item_name = typeof value === 'string' ? value : '';
          break;
        case 'notes':
          item.notes = typeof value === 'string' ? value : '';
          break;
        case 'unit':
          item.unit = typeof value === 'string' ? value : '';
          break;
        case 'quantity':
          item.quantity = typeof value === 'number' ? value : Number(value) || 0;
          break;
        case 'price_per_unit':
          item.price_per_unit = typeof value === 'number' ? value : Number(value) || 0;
          break;
        case 'internal_quantity':
          item.internal_quantity = typeof value === 'number' ? value : Number(value) || 0;
          break;
        case 'internal_price_per_unit':
          item.internal_price_per_unit = typeof value === 'number' ? value : Number(value) || 0;
          break;
        case 'is_cost':
          item.is_cost = Boolean(value);
          break;
      }

      if (field === 'quantity') {
        item.internal_quantity = Number(value) || 0;
      }

      if (!item.is_cost && field === 'internal_quantity') {
        item.internal_quantity = Number(value) || 0;
      }

      if (!item.is_cost && field === 'internal_price_per_unit') {
        item.internal_price_per_unit = Number(value) || 0;
      }

      if (item.is_cost) {
        item.internal_quantity = Number(item.quantity) || 0;
        item.internal_price_per_unit = Number(item.price_per_unit) || 0;
      }

      const quantity = Number(item.quantity) || 0;
      const pricePerUnit = Number(item.price_per_unit) || 0;
      item.total_price = quantity * pricePerUnit;

      const internalQuantity = Number(item.internal_quantity) || 0;
      const internalPrice = Number(item.internal_price_per_unit) || 0;
      item.internal_total_price = internalQuantity * internalPrice;

      item.profit = (item.total_price || 0) - (item.internal_total_price || 0);

      newItems[index] = item;
      return newItems;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      const filtered = prev.filter((_, i) => i !== index);
      const normalized = filtered.map((item, orderIndex) => ({ ...item, order_index: orderIndex }));

      if (normalized.length === 0) {
        return [createEmptyItem(0)];
      }

      return normalized;
    });
  };

  const saveBudget = async () => {
    setSaving(true);

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let currentBudgetId = budgetId;

      if (!organizationId) {
        throw new Error('Není vybrána žádná organizace');
      }

      const orgId = organizationId;

      if (!budgetId) {
        const { data: newBudget, error: budgetError } = await supabase
          .from('budgets')
          .insert({
            ...budget,
            user_id: user.id,
            organization_id: organizationId
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
            organization_id: organizationId
          })
          .eq('id', budgetId);

        if (updateError) throw updateError;
      }

      if (currentBudgetId) {
        await supabase.from('budget_items').delete().eq('budget_id', currentBudgetId);

        const itemsToInsert = items.map((item, index) => {
          const { is_cost, notes, id: _id, created_at: _createdAt, updated_at: _updatedAt, ...rest } = item;
          const payload: Partial<BudgetItem> & {
            budget_id: string;
            order_index: number;
            notes?: string;
          } = {
            ...rest,
            budget_id: currentBudgetId,
            order_index: index,
            notes: encodeItemNotes(notes, is_cost)
          };

          return payload;
        });

        const { error: itemsError } = await supabase.from('budget_items').insert(itemsToInsert);

        if (itemsError) {
          throw itemsError;
        }


        const expenseCandidates = items.filter(
          (item) => item.is_cost || (item.price_per_unit || 0) < 0
        );

        if (expenseCandidates.length > 0) {
          const expensesToCreate = expenseCandidates.map((item) => ({
            name: item.item_name || 'Náklad z rozpočtu',
            amount: item.is_cost
              ? Math.abs(item.internal_total_price || 0)
              : Math.abs(item.total_price || 0),
            date: new Date().toISOString().split('T')[0],
            category_id: item.category_id,
            budget_id: currentBudgetId,
            notes: `Automaticky vytvořeno z rozpočtu: ${budget.name}. ${item.notes || ''}`,
            user_id: user.id,
            organization_id: orgId,
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

      onSaved();
      onBack();
      return true;
    } catch (error) {
      console.error('Error saving budget:', error);
      alert('Chyba při ukládání rozpočtu');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const resetCategoryManagerState = () => {
    setNewCategoryName('');
    setEditingCategoryId(null);
    setEditingCategoryName('');
    setCategoryManagerError(null);
    setCategorySavingId(null);
  };

  const handleCreateCategory = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedName = newCategoryName.trim();
    if (!trimmedName) {
      setCategoryManagerError('Název kategorie nemůže být prázdný.');
      return;
    }

    if (!organizationId) {
      setCategoryManagerError('Kategorie lze vytvářet pouze v rámci organizace.');
      return;
    }

    try {
      setCategorySavingId('new');
      setCategoryManagerError(null);

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Uživatel není přihlášen.');
      }

      const { error } = await supabase.from('categories').insert({
        name: trimmedName,
        user_id: user.id,
        organization_id: organizationId
      });

      if (error) throw error;

      setNewCategoryName('');
      await loadCategories();
    } catch (error) {
      console.error('Error creating category:', error);
      setCategoryManagerError('Nepodařilo se vytvořit kategorii. Zkuste to prosím znovu.');
    } finally {
      setCategorySavingId(null);
    }
  };

  const startEditingCategory = (categoryId: string, currentName: string) => {
    setEditingCategoryId(categoryId);
    setEditingCategoryName(currentName);
    setCategoryManagerError(null);
  };

  const handleUpdateCategory = async () => {
    if (!editingCategoryId) return;

    const trimmedName = editingCategoryName.trim();
    if (!trimmedName) {
      setCategoryManagerError('Název kategorie nemůže být prázdný.');
      return;
    }

    try {
      setCategorySavingId(editingCategoryId);
      setCategoryManagerError(null);

      const { error } = await supabase
        .from('categories')
        .update({ name: trimmedName })
        .eq('id', editingCategoryId);

      if (error) throw error;

      setEditingCategoryId(null);
      setEditingCategoryName('');
      await loadCategories();
    } catch (error) {
      console.error('Error updating category:', error);
      setCategoryManagerError('Úprava kategorie se nezdařila. Zkuste to prosím znovu.');
    } finally {
      setCategorySavingId(null);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('Opravdu chcete tuto kategorii smazat? Položky s ní spojené zůstanou bez kategorie.')) {
      return;
    }

    try {
      setCategorySavingId(categoryId);
      setCategoryManagerError(null);

      const [{ count: expensesCount, error: expensesError }, { count: budgetItemsCount, error: budgetItemsError }] =
        await Promise.all([
          supabase
            .from('expenses')
            .select('id', { count: 'exact', head: true })
            .eq('category_id', categoryId),
          supabase
            .from('budget_items')
            .select('id', { count: 'exact', head: true })
            .eq('category_id', categoryId)
        ]);

      if (expensesError) throw expensesError;
      if (budgetItemsError) throw budgetItemsError;

      const usageMessages: string[] = [];

      if ((expensesCount ?? 0) > 0) {
        usageMessages.push(`${expensesCount} nákladech`);
      }

      if ((budgetItemsCount ?? 0) > 0) {
        usageMessages.push(`${budgetItemsCount} rozpočtových položkách`);
      }

      if (usageMessages.length > 0) {
        setCategoryManagerError(
          `Kategorie je používána v ${usageMessages.join(' a ')}. Než ji smažete, odeberte nebo upravte tyto záznamy.`
        );
        return;
      }


      const { error } = await supabase.from('categories').delete().eq('id', categoryId);

      if (error) throw error;

      if (editingCategoryId === categoryId) {
        setEditingCategoryId(null);
        setEditingCategoryName('');
      }

      await loadCategories();
    } catch (error) {
      console.error('Error deleting category:', error);

      if ((error as PostgrestError)?.code === '23503') {
        setCategoryManagerError(
          'Tuto kategorii se nepodařilo smazat, protože je používána v existujících záznamech. Zkontrolujte související náklady a rozpočty.'
        );
        return;
      }


      setCategoryManagerError('Smazání kategorie se nezdařilo. Zkuste to prosím znovu.');
    } finally {
      setCategorySavingId(null);
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
      []
    ];

    worksheetData.push([]);
    worksheetData.push(['', '', '', '', '', 'Rozpočet', '', '']);

    const headers = ['Kategorie', 'Položka', 'Jednotka', 'Počet', 'Kč / jednotka', 'Kč celkem bez DPH', '', 'Poznámka'];
    worksheetData.push(headers);

    items.forEach((item) => {
      const category = categories.find((c) => c.id === item.category_id);
      const row = [
        category?.name || '',
        item.item_name || '',
        item.unit || '',
        item.quantity || 0,
        `${(item.price_per_unit || 0).toFixed(2)} Kč`,
        `${(item.total_price || 0).toFixed(2)} Kč`,
        '',
        item.notes || ''
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

  const exportToPdf = () => {
    const clientName = budget.client_name?.trim() || '—';
    const statusLabel =
      statusOptions.find((option) => option.value === budget.status)?.label || '—';
    const formattedDate = new Date().toLocaleDateString('cs-CZ');

    const getCurrency = (value: number) => `${value.toLocaleString('cs-CZ')} Kč`;

    const tableRows = (items.length > 0
      ? items.map((item) => {
        const category = categories.find((cat) => cat.id === item.category_id);
        const { text: noteText } = decodeItemNotes(item.notes);

        return `
          <tr>
            <td>${category?.name || '—'}</td>
            <td>${item.item_name || '—'}</td>
            <td>${item.unit || '—'}</td>
            <td class="text-right">${(item.quantity || 0).toLocaleString('cs-CZ')}</td>
            <td class="text-right">${getCurrency(item.price_per_unit || 0)}</td>
            <td class="text-right">${getCurrency(item.total_price || 0)}</td>
            <td>${noteText || '—'}</td>
          </tr>
        `;
      })
      : [
          `
        <tr class="empty">
          <td colspan="7" style="text-align:center; padding: 32px 16px; color: #64748b; font-style: italic;">
            Zatím nebyly přidány žádné položky rozpočtu.
          </td>
        </tr>
      `]
    ).join('');

    const topCategories =
      categoryBreakdown.length > 0
        ? categoryBreakdown.map((category) => category.name).join(', ')
        : '—';

    const pdfWindow = window.open('', '_blank');
    if (!pdfWindow) {
      console.error('Nepodařilo se otevřít okno pro export PDF.');
      return;
    }

    pdfWindow.document.write(`
      <!DOCTYPE html>
      <html lang="cs">
        <head>
          <meta charset="utf-8" />
          <title>Rozpočet pro klienta</title>
          <style>
            :root {
              color-scheme: light;
            }
            * {
              box-sizing: border-box;
            }
            body {
              margin: 0;
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background: #f8fafc;
              color: #0a192f;
              -webkit-print-color-adjust: exact;
            }
            @page {
              size: A4;
              margin: 24mm;
            }
            .page {
              padding: 48px 56px 64px;
              page-break-after: always;
            }
            .page:last-of-type {
              page-break-after: auto;
            }
            header {
              background: #0a192f;
              border-radius: 24px;
              padding: 32px 40px;
              color: white;
              position: relative;
              overflow: hidden;
            }
            header::after {
              content: '';
              position: absolute;
              inset: 16px;
              border: 1px solid rgba(255, 255, 255, 0.08);
              border-radius: 20px;
            }
            header h1 {
              margin: 0 0 8px;
              font-size: 28px;
            }
            header p {
              margin: 0;
              font-size: 15px;
              color: rgba(255, 255, 255, 0.8);
            }
            .badge {
              position: absolute;
              top: 32px;
              right: 40px;
              background: white;
              color: #0a192f;
              padding: 8px 16px;
              border-radius: 999px;
              font-size: 13px;
              font-weight: 600;
            }
            .section {
              margin-top: 32px;
              background: white;
              border-radius: 20px;
              padding: 28px 32px;
              box-shadow: 0 24px 40px -24px rgba(15, 23, 42, 0.18);
            }
            .section-title {
              margin: 0 0 20px;
              font-size: 18px;
              color: #0a192f;
            }
            .details-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 16px 32px;
            }
            .detail-label {
              font-size: 12px;
              font-weight: 600;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              color: #64748b;
              margin-bottom: 4px;
            }
            .detail-value {
              font-size: 15px;
              color: #0f172a;
              font-weight: 500;
            }
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 16px;
              margin-top: 16px;
            }
            .summary-card {
              background: #e8f4f8;
              border-radius: 18px;
              padding: 20px 24px;
            }
            .summary-card .label {
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: #486581;
              margin-bottom: 8px;
            }
            .summary-card .value {
              font-size: 22px;
              font-weight: 700;
              color: #0a192f;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 12px;
              font-size: 13px;
            }
            thead th {
              text-align: left;
              padding: 14px 16px;
              background: #0a192f;
              color: white;
              font-weight: 600;
              border: none;
            }
            tbody td {
              padding: 14px 16px;
              border-bottom: 1px solid #e2e8f0;
              color: #0f172a;
            }
            tbody tr:nth-child(even) td {
              background: #f8fafc;
            }
            tbody tr:last-child td {
              border-bottom: none;
            }
            .text-right {
              text-align: right;
            }
            .summary-footer {
              margin-top: 24px;
              display: flex;
              flex-direction: column;
              gap: 6px;
              font-size: 13px;
              color: #475569;
            }
            @media print {
              body {
                background: white;
              }
              .page {
                padding: 24px 32px 40px;
              }
              header {
                border-radius: 16px;
              }
              .section {
                box-shadow: none;
                border: 1px solid rgba(148, 163, 184, 0.2);
              }
              .summary-card {
                background: #e8f4f8 !important;
                -webkit-print-color-adjust: exact;
              }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <header>
              <div class="badge">${formattedDate}</div>
              <h1>${budget.name?.trim() || 'Rozpočet pro klienta'}</h1>
              <p>Připraveno pro ${clientName}</p>
            </header>

            <section class="section">
              <h2 class="section-title">Přehled projektu</h2>
              <div class="details-grid">
                <div>
                  <div class="detail-label">Klient</div>
                  <div class="detail-value">${clientName}</div>
                </div>
                <div>
                  <div class="detail-label">Datum exportu</div>
                  <div class="detail-value">${formattedDate}</div>
                </div>
                <div>
                  <div class="detail-label">E-mail</div>
                  <div class="detail-value">${budget.client_email?.trim() || '—'}</div>
                </div>
                <div>
                  <div class="detail-label">Projektový manažer</div>
                  <div class="detail-value">${budget.project_manager?.trim() || '—'}</div>
                </div>
                <div>
                  <div class="detail-label">Kontakt</div>
                  <div class="detail-value">${budget.manager_email?.trim() || '—'}</div>
                </div>
                <div>
                  <div class="detail-label">Stav rozpočtu</div>
                  <div class="detail-value">${statusLabel}</div>
                </div>
              </div>

              <div class="summary-grid">
                <div class="summary-card">
                  <div class="label">Celkem k fakturaci bez DPH</div>
                  <div class="value">${getCurrency(totals.clientTotal)}</div>
                </div>
                <div class="summary-card">
                  <div class="label">DPH 21 %</div>
                  <div class="value">${getCurrency(projectedVatTotal)}</div>
                </div>
                <div class="summary-card">
                  <div class="label">Průměrná položka</div>
                  <div class="value">${getCurrency(averageItemValue)}</div>
                </div>
              </div>
            </section>

            <section class="section">
              <h2 class="section-title">Položky rozpočtu</h2>
              <table>
                <thead>
                  <tr>
                    <th>Kategorie</th>
                    <th>Položka</th>
                    <th>Jednotka</th>
                    <th class="text-right">Počet</th>
                    <th class="text-right">Cena / jednotka</th>
                    <th class="text-right">Celkem bez DPH</th>
                    <th>Poznámka</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>

              <div class="summary-footer">
                <div><strong>Součet bez DPH:</strong> ${getCurrency(totals.clientTotal)}</div>
                <div><strong>Součet s DPH (21 %):</strong> ${getCurrency(projectedVatTotal)}</div>
                <div><strong>Top kategorie:</strong> ${topCategories}</div>
              </div>
            </section>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);

    pdfWindow.document.close();
    pdfWindow.focus();
  };

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, item) => ({
          clientTotal: acc.clientTotal + (item.total_price || 0),
          internalTotal: acc.internalTotal + (item.internal_total_price || 0),
          profit: acc.profit + (item.profit || 0)
        }),
        { clientTotal: 0, internalTotal: 0, profit: 0 }
      ),
    [items]
  );

  const steps = useMemo(
    () => [
      {
        title: 'Základní údaje',
        description: 'Ujasněte si zadání, kontakty a stav rozpočtu.'
      },
      {
        title: 'Ceník & položky',
        description: 'Rozepište jednotlivé položky a interní náklady.'
      },
      {
        title: 'Souhrn a výstupy',
        description: 'Zkontrolujte čísla a připravte exporty pro klienta.'
      }
    ],
    []
  );

  const validateStep = (stepIndex: number) => {
    const errors: string[] = [];

    if (stepIndex === 0) {
      if (!budget.name?.trim()) {
        errors.push('Vyplňte název zakázky.');
      }
      if (!budget.client_name?.trim()) {
        errors.push('Zadejte jméno klienta.');
      }
    }

    if (stepIndex === 1) {
      if (items.length === 0) {
        errors.push('Přidejte alespoň jednu položku rozpočtu.');
      }

      const missingCategory = items.some((item) => !item.category_id);
      if (missingCategory) {
        errors.push('Každá položka musí mít přiřazenou kategorii.');
      }

      const missingName = items.some((item) => !item.item_name?.trim());
      if (missingName) {
        errors.push('Položky musí mít název, aby se daly rozpoznat.');
      }

      const invalidQuantity = items.some((item) => (item.quantity || 0) <= 0);
      if (invalidQuantity) {
        errors.push('Množství jednotlivých položek musí být větší než nula.');
      }
    }

    return errors;
  };
  const handleNextStep = () => {
    const errors = validateStep(currentStep);
    setStepErrors(errors);

    if (errors.length === 0) {
      setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
    }
  };

  const handlePreviousStep = () => {
    setStepErrors([]);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (currentStep < steps.length - 1) {
      handleNextStep();
      return;
    }

    const errors = validateStep(currentStep);
    if (errors.length > 0) {
      setStepErrors(errors);
      return;
    }

    setStepErrors([]);
    await saveBudget();
  };

  const formProgress = useMemo(
    () => ((currentStep + 1) / steps.length) * 100,
    [currentStep, steps.length]
  );

  const averageItemValue = useMemo(
    () => (items.length > 0 ? totals.clientTotal / items.length : 0),
    [items.length, totals.clientTotal]
  );

  const marginPercentage = useMemo(
    () => (totals.clientTotal > 0 ? (totals.profit / totals.clientTotal) * 100 : 0),
    [totals.clientTotal, totals.profit]
  );

  const projectedVatTotal = useMemo(
    () => totals.clientTotal * 1.21,
    [totals.clientTotal]
  );

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; total: number }>();

    items.forEach((item) => {
      if (!item.category_id) return;
      const category = categories.find((cat) => cat.id === item.category_id);
      if (!category) return;

      const existing = map.get(category.id);
      const total = (item.total_price || 0) + (existing?.total || 0);
      map.set(category.id, { name: category.name, total });
    });

    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
  }, [items, categories]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Načítání...</div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8 xl:flex xl:items-start xl:gap-8 xl:space-y-0">
      <div className="flex-1 space-y-6 lg:space-y-8">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition hover:text-[#0a192f]"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Zpět do přehledu rozpočtů</span>
        </button>

        <div className="relative overflow-hidden rounded-3xl border border-[#0a192f]/10 bg-gradient-to-br from-[#0a192f] via-[#132c4d] to-[#1f4c7f] text-white shadow-xl">
          <div
            className="absolute inset-0 opacity-20"
            style={{ backgroundImage: 'radial-gradient(circle at top, rgba(255,255,255,0.8), transparent 60%)' }}
          />
          <div className="relative p-6 lg:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-xl space-y-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-wide">
                  <Sparkles className="h-4 w-4" />
                  Kreativní rozpočtář
                </span>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold leading-tight md:text-3xl">
                    Vytvořte nabídku, která klienta nadchne
                  </h1>
                  <p className="text-sm text-slate-200 md:text-base">
                    Projděte tři rychlé kroky – od základních údajů přes položky až po finální souhrn. V reálném čase uvidíte marži, top kategorie i připravené exporty.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-200">
                    Celkem pro klienta
                    <Wallet className="h-4 w-4 text-white" />
                  </div>
                  <p className="mt-3 text-xl font-semibold md:text-2xl">
                    {totals.clientTotal.toLocaleString('cs-CZ')} Kč
                  </p>
                  <p className="text-xs text-slate-200/80">bez DPH</p>
                </div>
                <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-200">
                    Odhadovaný zisk
                    <PiggyBank className="h-4 w-4 text-white" />
                  </div>
                  <p className="mt-3 text-xl font-semibold md:text-2xl">
                    {totals.profit.toLocaleString('cs-CZ')} Kč
                  </p>
                  <p className="text-xs text-slate-200/80">{marginPercentage.toFixed(1)} % marže</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {budgetId && (
          <div
            className={`rounded-2xl border p-4 sm:p-5 shadow-sm transition ${
              budget.archived
                ? 'border-amber-200/80 bg-amber-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0a192f]">
                  {budget.archived ? (
                    <Archive className="h-4 w-4" />
                  ) : (
                    <ArchiveRestore className="h-4 w-4" />
                  )}
                  {budget.archived ? 'Rozpočet je archivovaný' : 'Archivujte dokončený rozpočet'}
                </div>
                <p className="text-sm text-gray-600">
                  {budget.archived
                    ? `Rozpočet je skrytý z přehledu aktivních zakázek${
                        budget.archived_at
                          ? ` od ${new Date(budget.archived_at).toLocaleDateString('cs-CZ')}`
                          : ''
                      }.`
                    : 'Archivací rozpočet nepřijde o data ani exporty, pouze se přesune do samostatného seznamu.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleArchiveToggle}
                disabled={archiveLoading}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  budget.archived
                    ? 'border border-[#0a192f]/20 bg-white text-[#0a192f] hover:border-[#0a192f]'
                    : 'bg-[#0a192f] text-white shadow-sm hover:bg-[#0c2548]'
                } ${archiveLoading ? 'opacity-70' : ''}`}
              >
                {budget.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                {archiveLoading
                  ? 'Ukládám…'
                  : budget.archived
                    ? 'Obnovit rozpočet'
                    : 'Archivovat rozpočet'}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-6 xl:space-y-8">
          <div className="space-y-6">
            <div className="relative overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-gray-100">
            <div className="absolute inset-0 bg-gradient-to-br from-[#0a192f]/5 via-transparent to-transparent" />
            <div className="relative space-y-8 p-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#0a192f]/80">
                    {budgetId ? 'Úprava rozpočtu' : 'Nový rozpočet'}
                  </p>
                  <h2 className="text-2xl font-bold text-[#0a192f] md:text-3xl">
                    {steps[currentStep].title}
                  </h2>
                  <p className="text-sm text-gray-600 md:text-base">{steps[currentStep].description}</p>
                </div>
                <div className="hidden sm:flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  {steps.map((step, index) => (
                    <div key={step.title} className="flex items-center gap-3">
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm transition ${
                          index === currentStep
                            ? 'border-[#0a192f] bg-[#0a192f] text-white'
                            : index < currentStep
                              ? 'border-emerald-400 bg-emerald-400 text-white'
                              : 'border-gray-200 bg-gray-100 text-gray-400'
                        }`}
                      >
                        {index + 1}
                      </span>
                      {index < steps.length - 1 && <div className="h-px w-10 bg-gray-200" />}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-gray-500 sm:hidden">
                  {steps.map((step, index) => (
                    <div key={step.title} className="flex flex-1 items-center gap-3">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm ${
                          index === currentStep
                            ? 'border-[#0a192f] bg-[#0a192f] text-white'
                            : index < currentStep
                              ? 'border-emerald-400 bg-emerald-400 text-white'
                              : 'border-gray-200 bg-gray-100 text-gray-400'
                        }`}
                      >
                        {index + 1}
                      </div>
                      {index < steps.length - 1 && <div className="h-px flex-1 bg-gray-200" />}
                    </div>
                  ))}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-[#0a192f] transition-all"
                    style={{ width: `${formProgress}%` }}
                  />
                </div>
              </div>

              {stepErrors.length > 0 && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <div className="mb-2 flex items-center gap-2 font-semibold">
                    <Info className="h-4 w-4" />
                    Ještě dolaďte následující kroky
                  </div>
                  <ul className="list-disc space-y-1 pl-5">
                    {stepErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-8">
                {currentStep === 0 && (
                  <div className="space-y-6">
                    <div className="grid gap-5 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Název zakázky *</label>
                        <input
                          type="text"
                          value={budget.name || ''}
                          onChange={(e) => setBudget({ ...budget, name: e.target.value })}
                          placeholder="Např. Interiérový redesign kanceláří"
                          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm shadow-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Klient *</label>
                        <input
                          type="text"
                          value={budget.client_name || ''}
                          onChange={(e) => setBudget({ ...budget, client_name: e.target.value })}
                          placeholder="Jméno firmy nebo klienta"
                          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm shadow-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30"
                        />
                      </div>
                    </div>

                    <div className="grid gap-5 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">E-mail klienta</label>
                        <input
                          type="email"
                          value={budget.client_email || ''}
                          onChange={(e) => setBudget({ ...budget, client_email: e.target.value })}
                          placeholder="klient@email.cz"
                          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm shadow-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Kontaktní osoba</label>
                        <input
                          type="text"
                          value={budget.contact_person || ''}
                          onChange={(e) => setBudget({ ...budget, contact_person: e.target.value })}
                          placeholder="Kdo bude nabídku řešit"
                          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm shadow-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30"
                        />
                      </div>
                    </div>

                    <div className="grid gap-5 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Projektový manažer</label>
                        <input
                          type="text"
                          value={budget.project_manager || ''}
                          onChange={(e) => setBudget({ ...budget, project_manager: e.target.value })}
                          placeholder="Kdo za tým drží projekt"
                          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm shadow-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">E-mail manažera</label>
                        <input
                          type="email"
                          value={budget.manager_email || ''}
                          onChange={(e) => setBudget({ ...budget, manager_email: e.target.value })}
                          placeholder="manazer@firma.cz"
                          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm shadow-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30"
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/80 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-700">Stav rozpočtu</p>
                          <p className="text-xs text-gray-500">Označte, v jaké fázi schvalování se nabídka nachází.</p>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {statusOptions.map((option) => {
                          const isActive = budget.status === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setBudget({ ...budget, status: option.value })}
                              className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                                isActive
                                  ? 'border-[#0a192f] bg-white text-[#0a192f] shadow-sm'
                                  : 'border-transparent bg-white/60 text-gray-600 hover:border-[#0a192f]/40 hover:bg-white'
                              }`}
                            >
                              <div className="font-semibold">{option.label}</div>
                              <div className="text-xs text-gray-500">{option.hint}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
                {currentStep === 1 && (
                  <div className="space-y-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-[#0a192f]">Položky rozpočtu</h3>
                        <p className="text-sm text-gray-500">Rozepište jednotlivé položky tak, jak je uvidí klient i vaše interní náklady.</p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => {
                            setShowCategoryManager(true);
                            resetCategoryManagerState();
                          }}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#0a192f]/10 bg-white px-4 py-2 text-sm font-medium text-[#0a192f] shadow-sm transition hover:-translate-y-0.5 hover:border-[#0a192f]"
                        >
                          <Layers className="h-4 w-4" />
                          Spravovat kategorie
                        </button>
                        <button
                          type="button"
                          onClick={addNewItem}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#0a192f]/20 bg-white px-4 py-2 text-sm font-medium text-[#0a192f] shadow-sm transition hover:-translate-y-0.5 hover:border-[#0a192f]"
                        >
                          <Plus className="h-4 w-4" />
                          Přidat položku
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-gray-50 shadow-sm lg:bg-white">

                      <div className="overflow-x-auto lg:block">
                        <table className="w-full table-auto divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                            <tr>
                              <th className="px-4 py-3 text-left">#</th>
                              <th className="px-4 py-3 text-left">Kategorie</th>
                              <th className="px-4 py-3 text-left">Název položky</th>
                              <th className="px-4 py-3 text-left">Poznámka</th>
                              <th className="px-4 py-3 text-right">Počet</th>
                              <th className="px-4 py-3 text-left">Jednotka</th>
                              <th className="px-4 py-3 text-right">Cena / jednotka</th>
                              <th className="px-4 py-3 text-right">Celkem</th>
                              <th className="px-4 py-3 text-center text-gray-500">Náklad</th>
                              <th className="px-4 py-3 text-right text-gray-500">Interní počet</th>
                              <th className="px-4 py-3 text-right text-gray-500">Interní cena</th>
                              <th className="px-4 py-3 text-right text-gray-500">Interní celkem</th>
                              <th className="px-4 py-3 text-right text-emerald-600">Marže</th>
                              <th className="px-4 py-3 text-right">Akce</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {items.length === 0 ? (
                              <tr>
                                <td colSpan={14} className="px-4 py-6 text-center text-sm text-gray-500">
                                  Přidejte první položku pomocí tlačítka „Přidat položku“.
                                </td>
                              </tr>
                            ) : (
                              items.map((item, index) => {
                                const totalPrice = item.total_price || 0;
                                const internalTotal = item.internal_total_price || 0;
                                const profitValue = item.profit || 0;
                                const profitColor =
                                  profitValue < 0
                                    ? 'text-red-600'
                                    : profitValue === 0
                                    ? 'text-gray-600'
                                    : 'text-emerald-600';

                                return (
                                  <tr key={index} className="align-top transition hover:bg-slate-50">
                                    <td className="px-4 py-3 text-sm font-medium text-gray-500">{index + 1}</td>
                                    <td className="px-4 py-3">
                                      <select
                                        value={item.category_id || ''}
                                        onChange={(e) => updateItem(index, 'category_id', e.target.value)}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30 lg:min-w-[10rem]"
                                      >
                                        <option value="">Vyberte kategorii…</option>
                                        {categories.map((cat) => (
                                          <option key={cat.id} value={cat.id}>
                                            {cat.name}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="px-4 py-3">
                                      <input
                                        type="text"
                                        value={item.item_name || ''}
                                        onChange={(e) => updateItem(index, 'item_name', e.target.value)}
                                        placeholder={`Položka ${index + 1}`}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30 lg:min-w-[12rem]"
                                      />
                                    </td>
                                    <td className="px-4 py-3">
                                      <textarea
                                        value={item.notes || ''}
                                        onChange={(e) => updateItem(index, 'notes', e.target.value)}
                                        rows={2}
                                        placeholder="Doplňující informace"
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30 lg:min-w-[14rem]"
                                      />
                                    </td>
                                    <td className="px-4 py-3">
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={item.quantity ?? 0}
                                        onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-right text-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30 lg:min-w-[4.5rem]"
                                      />
                                    </td>
                                    <td className="px-4 py-3">
                                      <input
                                        type="text"
                                        value={item.unit || ''}
                                        onChange={(e) => updateItem(index, 'unit', e.target.value)}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30 lg:min-w-[3rem]"
                                      />
                                    </td>
                                    <td className="px-4 py-3">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={item.price_per_unit ?? 0}
                                        onChange={(e) => updateItem(index, 'price_per_unit', parseFloat(e.target.value) || 0)}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-right text-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30 lg:min-w-[4.5rem]"
                                      />
                                    </td>
                                    <td className="px-4 py-3 lg:min-w-[5.5rem]">
                                      <div className="text-right font-semibold text-[#0a192f]">
                                        {totalPrice.toLocaleString('cs-CZ')} Kč
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex justify-center">
                                        <input
                                          type="checkbox"
                                          checked={Boolean(item.is_cost)}
                                          onChange={(e) => updateItem(index, 'is_cost', e.target.checked)}
                                          className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                          title="Označit jako náklad"
                                        />
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={item.internal_quantity ?? 0}
                                        onChange={(e) => updateItem(index, 'internal_quantity', parseFloat(e.target.value) || 0)}
                                        disabled={item.is_cost}
                                        className={`w-full rounded-lg border border-emerald-200 px-3 py-2 text-right text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 lg:min-w-[4.5rem] ${

                                          item.is_cost ? 'bg-emerald-50 text-emerald-700' : ''
                                        } ${item.is_cost ? 'cursor-not-allowed' : ''}`}
                                      />
                                    </td>
                                    <td className="px-4 py-3">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={item.internal_price_per_unit ?? 0}
                                        onChange={(e) => updateItem(index, 'internal_price_per_unit', parseFloat(e.target.value) || 0)}
                                        disabled={item.is_cost}
                                        className={`w-full rounded-lg border border-emerald-200 px-3 py-2 text-right text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 lg:min-w-[4.5rem] ${

                                          item.is_cost ? 'bg-emerald-50 text-emerald-700' : ''
                                        } ${item.is_cost ? 'cursor-not-allowed' : ''}`}
                                      />
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="text-right font-semibold text-emerald-600">
                                        {internalTotal.toLocaleString('cs-CZ')} Kč
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className={`text-right font-semibold ${profitColor}`}>
                                        {profitValue.toLocaleString('cs-CZ')} Kč
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex justify-end">
                                        <button
                                          type="button"
                                          onClick={() => removeItem(index)}
                                          className="rounded-lg p-2 text-red-500 transition hover:bg-red-50"
                                          aria-label={`Smazat položku ${index + 1}`}
                                          title="Smazat položku"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                          <tfoot className="bg-[#0a192f]/5">
                            <tr>
                              <td colSpan={7} className="px-4 py-3 text-right text-sm font-semibold text-[#0a192f]">
                                Celkem pro klienta
                              </td>
                              <td className="px-4 py-3 text-right text-sm font-semibold text-[#0a192f]">
                                {totals.clientTotal.toLocaleString('cs-CZ')} Kč
                              </td>
                              <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold text-[#0a192f]">
                                Interní náklady
                              </td>
                              <td className="px-4 py-3 text-right text-sm font-semibold text-[#0a192f]">
                                {totals.internalTotal.toLocaleString('cs-CZ')} Kč
                              </td>
                              <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-600">
                                {totals.profit.toLocaleString('cs-CZ')} Kč
                              </td>
                              <td className="px-4 py-3" />
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      <div className="space-y-4 bg-gray-50 p-4 lg:hidden">

                        {items.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                            Přidejte první položku pomocí tlačítka „Přidat položku“.
                          </div>
                        ) : (
                          items.map((item, index) => {
                            const totalPrice = item.total_price || 0;
                            const internalTotal = item.internal_total_price || 0;
                            const profitValue = item.profit || 0;
                            const profitColor =
                              profitValue < 0
                                ? 'text-red-600'
                                : profitValue === 0
                                  ? 'text-gray-600'
                                  : 'text-emerald-600';

                            return (
                              <div key={index} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-[#0a192f]/70">Položka {index + 1}</p>

                                    <p className="text-base font-semibold text-[#0a192f]">
                                      {item.item_name?.trim() || 'Nepojmenovaná položka'}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeItem(index)}
                                    className="rounded-lg border border-red-100 p-2 text-red-500 transition hover:bg-red-50"
                                    aria-label={`Smazat položku ${index + 1}`}
                                    title="Smazat položku"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>

                                <div className="grid gap-4">
                                  <div className="space-y-2">
                                    <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Kategorie</label>
                                    <select
                                      value={item.category_id || ''}
                                      onChange={(e) => updateItem(index, 'category_id', e.target.value)}
                                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30"
                                    >
                                      <option value="">Vyberte kategorii…</option>
                                      {categories.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                          {cat.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="space-y-2">
                                    <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Název položky</label>
                                    <input
                                      type="text"
                                      value={item.item_name || ''}
                                      onChange={(e) => updateItem(index, 'item_name', e.target.value)}
                                      placeholder={`Položka ${index + 1}`}
                                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30"
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Poznámka</label>
                                    <textarea
                                      value={item.notes || ''}
                                      onChange={(e) => updateItem(index, 'notes', e.target.value)}
                                      rows={3}
                                      placeholder="Doplňující informace"
                                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30"
                                    />
                                  </div>

                                  <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Počet</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={item.quantity ?? 0}
                                        onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-right text-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Jednotka</label>
                                      <input
                                        type="text"
                                        value={item.unit || ''}
                                        onChange={(e) => updateItem(index, 'unit', e.target.value)}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Cena / jednotka</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={item.price_per_unit ?? 0}
                                        onChange={(e) => updateItem(index, 'price_per_unit', parseFloat(e.target.value) || 0)}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-right text-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Celkem</label>
                                      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-right text-sm font-semibold text-[#0a192f]">

                                        {totalPrice.toLocaleString('cs-CZ')} Kč
                                      </div>
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Náklad</span>
                                    <label className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(item.is_cost)}
                                        onChange={(e) => updateItem(index, 'is_cost', e.target.checked)}
                                        className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                                      />
                                      <span>Zařadit mezi interní náklady</span>
                                    </label>
                                  </div>

                                  <div className="grid gap-4 sm:grid-cols-2">

                                    <div className="space-y-2">
                                      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Interní počet</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={item.internal_quantity ?? 0}
                                        onChange={(e) => updateItem(index, 'internal_quantity', parseFloat(e.target.value) || 0)}
                                        disabled={item.is_cost}
                                        className={`w-full rounded-lg border border-emerald-200 px-3 py-2 text-right text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
                                          item.is_cost ? 'bg-emerald-50 text-emerald-700' : ''
                                        } ${item.is_cost ? 'cursor-not-allowed' : ''}`}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Interní cena</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={item.internal_price_per_unit ?? 0}
                                        onChange={(e) => updateItem(index, 'internal_price_per_unit', parseFloat(e.target.value) || 0)}
                                        disabled={item.is_cost}
                                        className={`w-full rounded-lg border border-emerald-200 px-3 py-2 text-right text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
                                          item.is_cost ? 'bg-emerald-50 text-emerald-700' : ''
                                        } ${item.is_cost ? 'cursor-not-allowed' : ''}`}
                                      />
                                    </div>
                                  </div>

                                  <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Interní celkem</label>
                                      <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-right text-sm font-semibold text-emerald-600">
                                        {internalTotal.toLocaleString('cs-CZ')} Kč
                                      </div>
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Marže</label>
                                      <div className={`rounded-lg border px-3 py-2 text-right text-sm font-semibold ${profitColor}`}>
                                        {profitValue.toLocaleString('cs-CZ')} Kč
                                      </div>
                                    </div>

                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}

                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Celkem pro klienta
                          <Wallet className="h-4 w-4 text-[#0a192f]" />
                        </div>
                        <p className="mt-3 text-2xl font-semibold text-[#0a192f]">
                          {totals.clientTotal.toLocaleString('cs-CZ')} Kč
                        </p>
                        <p className="text-xs text-gray-500">bez DPH</p>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Interní náklady
                          <PiggyBank className="h-4 w-4 text-[#0a192f]" />
                        </div>
                        <p className="mt-3 text-2xl font-semibold text-[#0a192f]">
                          {totals.internalTotal.toLocaleString('cs-CZ')} Kč
                        </p>
                        <p className="text-xs text-gray-500">včetně interních zdrojů</p>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Marže
                          <Target className="h-4 w-4 text-[#0a192f]" />
                        </div>
                        <p className="mt-3 text-2xl font-semibold text-[#0a192f]">
                          {totals.profit.toLocaleString('cs-CZ')} Kč
                        </p>
                        <p className="text-xs text-gray-500">{marginPercentage.toFixed(1)} % z nabídky</p>
                      </div>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-2">
                      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="rounded-full bg-[#0a192f]/10 p-2 text-[#0a192f]">
                            <FileSpreadsheet className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[#0a192f]">Podklady pro klienta</p>
                            <p className="text-xs text-gray-500">Předpokládaná částka s 21 % DPH a rychlý přehled.</p>
                          </div>
                        </div>
                        <div className="mt-4 rounded-2xl bg-gray-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">S DPH</div>
                          <div className="text-2xl font-bold text-[#0a192f]">
                            {projectedVatTotal.toLocaleString('cs-CZ')} Kč
                          </div>
                          <p className="text-xs text-gray-500">včetně 21 % DPH</p>
                        </div>
                        <ul className="mt-4 space-y-2 text-sm text-gray-600">
                          <li>• Přidejte krycí dopis s přehledem klíčových bodů.</li>
                          <li>• Zkontrolujte, zda souhlasí kontaktní osoby a e-maily.</li>
                          <li>• Přiložte případné reference nebo moodboard.</li>
                        </ul>
                      </div>

                      <div className="rounded-2xl border border-dashed border-[#0a192f]/30 bg-[#0a192f]/5 p-6 shadow-inner">
                        <div className="flex items-start gap-3">
                          <Sparkles className="h-5 w-5 text-[#0a192f]" />
                          <div className="space-y-2">
                            <p className="text-sm font-semibold text-[#0a192f]">Nezapomeňte na další kroky</p>
                            <p className="text-sm text-[#0a192f]/80">
                              Po uložení můžete rovnou odeslat klientovi nebo sdílet v týmu. Exporty jsou dostupné po uložení rozpočtu.
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl bg-white/80 p-3 text-sm text-gray-600 shadow-sm">
                            <p className="font-semibold text-[#0a192f]">Položek</p>
                            <p>{items.length}</p>
                          </div>
                          <div className="rounded-xl bg-white/80 p-3 text-sm text-gray-600 shadow-sm">
                            <p className="font-semibold text-[#0a192f]">Průměrná položka</p>
                            <p>{averageItemValue.toLocaleString('cs-CZ')} Kč</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3 border-t border-gray-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-gray-500">
                    {currentStep === 0 && 'Krok 1 ze 3 – základní informace o zakázce'}
                    {currentStep === 1 && 'Krok 2 ze 3 – rozepište položky a náklady'}
                    {currentStep === 2 && 'Poslední krok – uložte a vyexportujte rozpočet'}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {currentStep > 0 && (
                      <button
                        type="button"
                        onClick={handlePreviousStep}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Zpět
                      </button>
                    )}

                    {currentStep === steps.length - 1 && (
                      <>
                        <button
                          type="button"
                          onClick={exportToPdf}
                          disabled={!budgetId}
                          className={`inline-flex items-center gap-2 rounded-xl border border-[#0a192f]/20 px-4 py-2 text-sm font-medium transition ${
                            budgetId
                              ? 'bg-white text-[#0a192f] hover:border-[#0a192f] hover:bg-white shadow-sm'
                              : 'cursor-not-allowed bg-gray-100 text-gray-400'
                          }`}
                        >
                          <FileText className="h-4 w-4" />
                          PDF pro klienta
                        </button>
                        <button
                          type="button"
                          onClick={() => exportToExcel(false)}
                          disabled={!budgetId}
                          className={`inline-flex items-center gap-2 rounded-xl border border-[#0a192f]/20 px-4 py-2 text-sm font-medium transition ${
                            budgetId
                              ? 'bg-white text-[#0a192f] hover:border-[#0a192f] hover:bg-white shadow-sm'
                              : 'cursor-not-allowed bg-gray-100 text-gray-400'
                          }`}
                        >
                          <FileSpreadsheet className="h-4 w-4" />
                          Excel pro klienta
                        </button>
                        <button
                          type="button"
                          onClick={() => exportToExcel(true)}
                          disabled={!budgetId}
                          className={`inline-flex items-center gap-2 rounded-xl border border-[#0a192f]/20 px-4 py-2 text-sm font-medium transition ${
                            budgetId
                              ? 'bg-white text-[#0a192f] hover:border-[#0a192f] hover:bg-white shadow-sm'
                              : 'cursor-not-allowed bg-gray-100 text-gray-400'
                          }`}
                        >
                          <FileSpreadsheet className="h-4 w-4" />
                          Excel interní
                        </button>
                      </>
                    )}

                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-xl bg-[#0a192f] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#0a192f]/20 transition hover:-translate-y-0.5 hover:bg-[#0c2548] disabled:opacity-60"
                      disabled={saving}
                    >
                      {currentStep === steps.length - 1 ? (
                        <>
                          <Save className="h-4 w-4" />
                          {saving ? 'Ukládám…' : budgetId ? 'Aktualizovat rozpočet' : 'Dokončit rozpočet'}
                        </>
                      ) : (
                        <>
                          Pokračovat
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
        </div>
      </div>

      {showCategoryManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[#0a192f]">Kategorie rozpočtu</h3>
                <p className="text-sm text-gray-500">Přidejte nové kategorie nebo upravte ty stávající. Změny se projeví okamžitě v rozpočtu.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCategoryManager(false);
                  resetCategoryManagerState();
                }}
                className="rounded-full border border-gray-200 p-1 text-gray-500 transition hover:border-[#0a192f]/30 hover:text-[#0a192f]"
                aria-label="Zavřít správu kategorií"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {categoryManagerError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {categoryManagerError}
              </div>
            )}

            <div className="mb-6 max-h-64 space-y-2 overflow-y-auto pr-1">
              {categories.length === 0 ? (
                <p className="text-sm text-gray-500">Zatím nemáte žádné kategorie. Přidejte první níže.</p>
              ) : (
                categories.map((category) => {
                  const isEditing = editingCategoryId === category.id;
                  const isSaving = categorySavingId === category.id;

                  return (
                    <div
                      key={category.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2"
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editingCategoryName}
                          onChange={(e) => setEditingCategoryName(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30"
                          autoFocus
                        />
                      ) : (
                        <span className="text-sm font-medium text-gray-700">{category.name}</span>
                      )}

                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={handleUpdateCategory}
                              disabled={categorySavingId === category.id}
                              className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Uložit'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCategoryId(null);
                                setEditingCategoryName('');
                              }}
                              className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-gray-600 shadow-sm transition hover:bg-gray-100"
                            >
                              Zrušit
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditingCategory(category.id, category.name)}
                              className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-[#0a192f] shadow-sm transition hover:bg-gray-100"
                            >
                              Upravit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(category.id)}
                              disabled={categorySavingId === category.id}
                              className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Smazat'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={handleCreateCategory} className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Nová kategorie</label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Např. Konzultace"
                  className="w-full rounded-xl border border-gray-300 px-4 py-2 text-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={categorySavingId === 'new'}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0a192f] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a192f]/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {categorySavingId === 'new' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Přidat kategorii
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
