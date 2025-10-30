import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  FileText,
  Info,
  Layers,
  Loader2,
  Pencil,
  TrendingUp,
  User
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { Budget, BudgetItem, BudgetSection } from '../types/database';

interface BudgetDetailProps {
  budgetId: string;
  onBack: () => void;
  onEdit: (budgetId: string) => void;
  activeOrganizationId: string | null;
}

const NOTES_METADATA_PREFIX = '__budget_meta__:';

type DecodedNotes = {
  text: string;
  isCost: boolean;
  isPersonnel: boolean;
};

const decodeItemNotes = (rawNotes?: string | null): DecodedNotes => {
  if (!rawNotes) {
    return { text: '', isCost: false, isPersonnel: false };
  }

  if (rawNotes.startsWith(NOTES_METADATA_PREFIX)) {
    try {
      const parsed = JSON.parse(rawNotes.slice(NOTES_METADATA_PREFIX.length));
      return {
        text: typeof parsed?.text === 'string' ? parsed.text : '',
        isCost: Boolean(parsed?.isCost),
        isPersonnel: Boolean(parsed?.isPersonnel)
      };
    } catch (error) {
      console.error('Failed to parse budget item notes metadata', error);
      return { text: '', isCost: false, isPersonnel: false };
    }
  }

  return { text: rawNotes, isCost: false, isPersonnel: false };
};

const formatCurrency = (value: number) => `${value.toLocaleString('cs-CZ')} Kč`;

const getStatusMeta = (status?: Budget['status']) => {
  switch (status) {
    case 'draft':
      return { label: 'Koncept', className: 'bg-gray-100 text-gray-800', icon: <FileText className="w-4 h-4" /> };
    case 'sent':
      return { label: 'Odesláno', className: 'bg-blue-100 text-blue-800', icon: <Clock className="w-4 h-4" /> };
    case 'approved':
      return { label: 'Schváleno', className: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-4 h-4" /> };
    case 'rejected':
      return { label: 'Zamítnuto', className: 'bg-red-100 text-red-800', icon: <FileText className="w-4 h-4" /> };
    default:
      return null;
  }
};

export default function BudgetDetail({ budgetId, onBack, onEdit, activeOrganizationId }: BudgetDetailProps) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [sections, setSections] = useState<BudgetSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadBudgetDetail = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: budgetData, error: budgetError } = await supabase
          .from('budgets')
          .select('*')
          .eq('id', budgetId)
          .maybeSingle();

        if (budgetError) throw budgetError;
        if (!budgetData) {
          setError('Rozpočet nebyl nalezen.');
          return;
        }

        const [itemsResponse, sectionsResponse] = await Promise.all([
          supabase
            .from('budget_items')
            .select('*')
            .eq('budget_id', budgetId)
            .order('order_index', { ascending: true }),
          supabase
            .from('budget_sections')
            .select('*')
            .eq('budget_id', budgetId)
            .order('created_at', { ascending: true })
        ]);

        if (itemsResponse.error) throw itemsResponse.error;
        if (sectionsResponse.error) throw sectionsResponse.error;

        if (!isMounted) return;

        setBudget(budgetData as Budget);
        setItems((itemsResponse.data as BudgetItem[]) ?? []);
        setSections((sectionsResponse.data as BudgetSection[]) ?? []);
      } catch (err) {
        console.error('Error loading budget detail:', err);
        setError('Nepodařilo se načíst detail rozpočtu. Zkuste to prosím znovu.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (budgetId) {
      loadBudgetDetail();
    }

    return () => {
      isMounted = false;
    };
  }, [budgetId, activeOrganizationId]);

  const totals = useMemo(() => {
    const totalAmount = items.reduce((sum, item) => sum + (item.total_price ?? 0), 0);
    const internalTotal = items.reduce((sum, item) => sum + (item.internal_total_price ?? 0), 0);
    const profit = totalAmount - internalTotal;
    const margin = totalAmount > 0 ? (profit / totalAmount) * 100 : 0;

    return { totalAmount, internalTotal, profit, margin };
  }, [items]);

  const groupedSections = useMemo(() => {
    const sectionItemsMap = new Map<string, BudgetItem[]>();
    sections.forEach(section => {
      sectionItemsMap.set(section.id, []);
    });

    const unassigned: BudgetItem[] = [];

    items.forEach(item => {
      if (item.section_id && sectionItemsMap.has(item.section_id)) {
        sectionItemsMap.get(item.section_id)!.push(item);
      } else {
        unassigned.push(item);
      }
    });

    return {
      sections: sections.map(section => ({
        section,
        items: sectionItemsMap.get(section.id) ?? []
      })),
      unassigned
    };
  }, [items, sections]);

  const statusMeta = useMemo(() => getStatusMeta(budget?.status), [budget?.status]);

  if (loading) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#0a192f]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl space-y-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Zpět na rozpočty
        </button>
        <div className="rounded-xl bg-red-50 p-6 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!budget) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Zpět na rozpočty
          </button>
          {statusMeta && (
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${statusMeta.className}`}>
              {statusMeta.icon}
              {statusMeta.label}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => onEdit(budget.id)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0a192f] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-opacity-90"
          >
            <Pencil className="h-4 w-4" />
            Upravit rozpočet
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-[#0a192f]">{budget.name}</h1>
            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
              {budget.client_name && (
                <div className="inline-flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>{budget.client_name}</span>
                </div>
              )}
              {budget.client_email && (
                <div className="inline-flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  <span>{budget.client_email}</span>
                </div>
              )}
              <div className="inline-flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>Vytvořeno {new Date(budget.created_at).toLocaleDateString('cs-CZ')}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Stav</p>
              <p className="text-base font-semibold text-[#0a192f]">
                {statusMeta ? statusMeta.label : 'Neznámý'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Položek celkem</p>
              <p className="text-base font-semibold text-[#0a192f]">{items.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-white p-6 shadow">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Celková cena</span>
            <DollarSign className="h-5 w-5 text-green-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#0a192f]">{formatCurrency(totals.totalAmount)}</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Interní náklady</span>
            <Info className="h-5 w-5 text-red-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-red-600">{formatCurrency(totals.internalTotal)}</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Zisk</span>
            <TrendingUp className="h-5 w-5 text-blue-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-green-600">{formatCurrency(totals.profit)}</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Marže</span>
            <Layers className="h-5 w-5 text-purple-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#0a192f]">{totals.margin.toFixed(1)}%</p>
        </div>
      </div>

      <div className="space-y-4">
        {groupedSections.sections.map(({ section, items: sectionItems }) => (
          <div key={section.id} className="overflow-hidden rounded-xl bg-white shadow">
            <div className="flex flex-col gap-2 border-b border-gray-100 bg-gray-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#0a192f]">{section.name}</h2>
                {section.description && (
                  <p className="text-sm text-gray-600">{section.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Layers className="h-4 w-4" />
                <span>{sectionItems.length} položek</span>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {sectionItems.length === 0 ? (
                <div className="px-6 py-5 text-sm text-gray-500">Žádné položky v této sekci.</div>
              ) : (
                sectionItems.map(item => {
                  const { text: notes, isCost, isPersonnel } = decodeItemNotes(item.notes);
                  return (
                    <div key={item.id} className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="text-base font-semibold text-[#0a192f]">{item.item_name}</div>
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                            {item.quantity} {item.unit}
                          </span>
                          {isCost && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                              Náklad
                            </span>
                          )}
                          {isPersonnel && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                              Personální
                            </span>
                          )}
                        </div>
                        {notes && <p className="text-sm text-gray-600">{notes}</p>}
                      </div>
                      <div className="grid w-full gap-4 text-sm text-gray-600 md:w-auto md:min-w-[280px] md:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Cena / jednotka</p>
                          <p className="font-semibold text-[#0a192f]">{formatCurrency(item.price_per_unit ?? 0)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Cena celkem</p>
                          <p className="font-semibold text-[#0a192f]">{formatCurrency(item.total_price ?? 0)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Interní náklady</p>
                          <p className="font-semibold text-red-600">{formatCurrency(item.internal_total_price ?? 0)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Zisk</p>
                          <p className="font-semibold text-green-600">{formatCurrency(item.profit ?? 0)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}

        {groupedSections.unassigned.length > 0 && (
          <div className="overflow-hidden rounded-xl bg-white shadow">
            <div className="flex flex-col gap-2 border-b border-gray-100 bg-gray-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#0a192f]">Bez sekce</h2>
                <p className="text-sm text-gray-600">Položky, které nejsou přiřazeny k žádné sekci.</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <FileText className="h-4 w-4" />
                <span>{groupedSections.unassigned.length} položek</span>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {groupedSections.unassigned.map(item => {
                const { text: notes, isCost, isPersonnel } = decodeItemNotes(item.notes);
                return (
                  <div key={item.id} className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="text-base font-semibold text-[#0a192f]">{item.item_name}</div>
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                          {item.quantity} {item.unit}
                        </span>
                        {isCost && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                            Náklad
                          </span>
                        )}
                        {isPersonnel && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                            Personální
                          </span>
                        )}
                      </div>
                      {notes && <p className="text-sm text-gray-600">{notes}</p>}
                    </div>
                    <div className="grid w-full gap-4 text-sm text-gray-600 md:w-auto md:min-w-[280px] md:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Cena / jednotka</p>
                        <p className="font-semibold text-[#0a192f]">{formatCurrency(item.price_per_unit ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Cena celkem</p>
                        <p className="font-semibold text-[#0a192f]">{formatCurrency(item.total_price ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Interní náklady</p>
                        <p className="font-semibold text-red-600">{formatCurrency(item.internal_total_price ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Zisk</p>
                        <p className="font-semibold text-green-600">{formatCurrency(item.profit ?? 0)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center text-gray-500">
            <FileText className="mb-4 h-12 w-12 text-gray-300" />
            <p>Rozpočet zatím neobsahuje žádné položky.</p>
          </div>
        )}
      </div>
    </div>
  );
}
