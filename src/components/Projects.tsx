import { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Calendar,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Pause,
  Trash2,
  CreditCard as Edit,
  Users,
  Sparkles,
  BarChart3,
  Target,
  Info,
  NotebookPen,
  Search

} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ensureUserOrganization } from '../lib/organization';
import { Project, Budget } from '../types/database';
import ProjectDetails from './ProjectDetails';

type StatusFilter = 'all' | Project['status'];

interface ProjectsProps {
  activeOrganizationId: string | null;
}

export default function Projects({ activeOrganizationId }: ProjectsProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    if (showForm) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [showForm]);


  const [formData, setFormData] = useState({
    name: '',
    description: '',
    budget_id: '',
    start_date: '',
    end_date: '',
    status: 'planning' as Project['status'],
    total_budget: 0,
    spent_amount: 0,
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, [activeOrganizationId]);

  const loadData = async () => {
    setLoading(true);

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setProjects([]);
        setBudgets([]);
        setOrganizationId(null);
        return;
      }

      const organizationPromise = ensureUserOrganization(user.id, activeOrganizationId);

      const [orgId, projectsRes, budgetsRes] = await Promise.all([
        organizationPromise,
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
        supabase.from('budgets').select('*').order('name')
      ]);

      if (projectsRes.error) throw projectsRes.error;
      if (budgetsRes.error) throw budgetsRes.error;

      setOrganizationId(orgId);
      setProjects(projectsRes.data || []);
      setBudgets(budgetsRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (currentStep < steps.length - 1) {
      handleNextStep();
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let orgId = organizationId || activeOrganizationId;
      if (!orgId) {
        orgId = await ensureUserOrganization(user.id, activeOrganizationId);
      }

      if (orgId !== organizationId) {
        setOrganizationId(orgId);
      }

      const projectData = {
        ...formData,
        budget_id: formData.budget_id || null,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        user_id: user.id,
        organization_id: orgId
      };

      if (editingProject) {
        const { error } = await supabase
          .from('projects')
          .update(projectData)
          .eq('id', editingProject.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('projects')
          .insert([projectData]);

        if (error) throw error;
      }

      await loadData();
      resetForm();
    } catch (error) {
      console.error('Error saving project:', error);
    }
  };

  const steps = useMemo(() => ([
    {
      title: 'Základní informace',
      description: 'Pojmenujte projekt a určete hlavní cíl.'
    },
    {
      title: 'Čas & finance',
      description: 'Naplánujte časový harmonogram a rozpočet.'
    },
    {
      title: 'Detaily projektu',
      description: 'Přidejte poznámky a dolaďte detaily.'
    }
  ]), []);

  const validateStep = (stepIndex: number) => {
    const errors: string[] = [];

    if (stepIndex === 0) {
      if (!formData.name.trim()) {
        errors.push('Název projektu je povinný.');
      }
    }

    if (stepIndex === 1) {
      if (formData.total_budget < 0) {
        errors.push('Celkový rozpočet nemůže být záporný.');
      }
      if (formData.spent_amount < 0) {
        errors.push('Vyčerpaná částka nemůže být záporná.');
      }
      if (formData.spent_amount > formData.total_budget && formData.total_budget > 0) {
        errors.push('Vyčerpaná částka je vyšší než celkový rozpočet.');
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

  const handleDelete = async (id: string) => {
    if (!confirm('Opravdu chcete smazat tento projekt?')) return;

    try {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setCurrentStep(0);
    setStepErrors([]);
    setFormData({
      name: project.name,
      description: project.description || '',
      budget_id: project.budget_id || '',
      start_date: project.start_date || '',
      end_date: project.end_date || '',
      status: project.status,
      total_budget: project.total_budget,
      spent_amount: project.spent_amount,
      notes: project.notes || ''
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      budget_id: '',
      start_date: '',
      end_date: '',
      status: 'planning',
      total_budget: 0,
      spent_amount: 0,
      notes: ''
    });
    setEditingProject(null);
    setShowForm(false);
    setCurrentStep(0);
    setStepErrors([]);
  };

  const getStatusIcon = (status: Project['status']) => {
    switch (status) {
      case 'planning': return <AlertCircle className="w-5 h-5" />;
      case 'active': return <Clock className="w-5 h-5" />;
      case 'completed': return <CheckCircle className="w-5 h-5" />;
      case 'on-hold': return <Pause className="w-5 h-5" />;
      case 'cancelled': return <XCircle className="w-5 h-5" />;
    }
  };

  const getStatusColor = (status: Project['status']) => {
    switch (status) {
      case 'planning': return 'bg-gray-100 text-gray-800';
      case 'active': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'on-hold': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
    }
  };

  const getStatusText = (status: Project['status']) => {
    switch (status) {
      case 'planning': return 'Plánování';
      case 'active': return 'Aktivní';
      case 'completed': return 'Dokončeno';
      case 'on-hold': return 'Pozastaveno';
      case 'cancelled': return 'Zrušeno';
    }
  };

  const calculateProgress = (project: Project) => {
    if (project.total_budget === 0) return 0;
    return Math.min((project.spent_amount / project.total_budget) * 100, 100);
  };

  if (selectedProject) {
    return (
      <ProjectDetails
        project={selectedProject}
        onBack={() => setSelectedProject(null)}
        onUpdate={loadData}
      />
    );
  }

  const openForm = () => {
    setShowForm(true);
    setCurrentStep(0);
    setStepErrors([]);
  };

  const totalBudget = useMemo(
    () => projects.reduce((sum, project) => sum + (project.total_budget || 0), 0),
    [projects]
  );

  const totalSpent = useMemo(
    () => projects.reduce((sum, project) => sum + (project.spent_amount || 0), 0),
    [projects]
  );

  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === 'active').length,
    [projects]
  );

  const completedProjects = useMemo(
    () => projects.filter((project) => project.status === 'completed').length,
    [projects]
  );

  const planningProjects = useMemo(
    () => projects.filter((project) => project.status === 'planning').length,
    [projects]
  );

  const overspentProjects = useMemo(
    () => projects.filter((project) => project.total_budget > 0 && project.spent_amount > project.total_budget).length,
    [projects]
  );

  const upcomingProjects = useMemo(() => {
    const now = new Date();
    const nextMonth = new Date();
    nextMonth.setDate(now.getDate() + 30);

    return projects.filter((project) => {
      if (!project.start_date) return false;
      const start = new Date(project.start_date);
      return start >= now && start <= nextMonth;
    }).length;
  }, [projects]);

  const statusCounts = useMemo(
    () =>
      projects.reduce(
        (acc, project) => ({
          ...acc,
          [project.status]: (acc[project.status] || 0) + 1
        }),
        { planning: 0, active: 0, completed: 0, 'on-hold': 0, cancelled: 0 } as Record<Project['status'], number>
      ),
    [projects]
  );

  const filterOptions = useMemo(
    () => [
      { value: 'all' as StatusFilter, label: 'Vše' },
      { value: 'planning' as StatusFilter, label: 'Plánování' },
      { value: 'active' as StatusFilter, label: 'Aktivní' },
      { value: 'completed' as StatusFilter, label: 'Dokončeno' },
      { value: 'on-hold' as StatusFilter, label: 'Pozastaveno' },
      { value: 'cancelled' as StatusFilter, label: 'Zrušeno' }
    ],
    []
  );

  const budgetsById = useMemo(() => {
    const map = new Map<string, Budget>();
    budgets.forEach((budget) => map.set(budget.id, budget));
    return map;
  }, [budgets]);

  const filteredProjects = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('cs-CZ');

    return projects.filter((project) => {
      const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
      if (!matchesStatus) return false;

      if (!normalizedSearch) return true;

      const budgetName = project.budget_id ? budgetsById.get(project.budget_id)?.name ?? '' : '';
      const haystack = `${project.name} ${project.description || ''} ${budgetName}`.toLocaleLowerCase('cs-CZ');

      return haystack.includes(normalizedSearch);
    });
  }, [projects, statusFilter, searchTerm, budgetsById]);

  const hasActiveFilters = statusFilter !== 'all' || searchTerm.trim() !== '';


  const formProgress = useMemo(
    () => ((currentStep + 1) / steps.length) * 100,
    [currentStep, steps.length]
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
      <div className="mb-8 flex flex-col gap-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#0a192f]">
              <Sparkles className="h-4 w-4" />

              Váš projekťák
            </div>
            <h2 className="text-3xl font-bold text-[#0a192f]">Řízení projektů</h2>
            <p className="text-gray-600">
              Přehledně plánujte projekty, sledujte rozpočet a motivujte tým.
            </p>
          </div>
          <button
            onClick={openForm}
            className="flex items-center justify-center gap-2 self-start rounded-xl bg-[#0a192f] px-6 py-3 text-white shadow-lg shadow-[#0a192f]/20 transition hover:-translate-y-0.5 hover:bg-[#0c2548]"
          >
            <Plus className="h-5 w-5" />
            <span>{editingProject ? 'Pokračovat v úpravách' : 'Postavit nový projekt'}</span>
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-sm text-gray-500">
              Aktivní projekty
              <Target className="h-4 w-4 text-[#0a192f]" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-[#0a192f]">{activeProjects}</p>
            <p className="text-xs text-gray-500">Zaměřte se na prioritní dodávky</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-sm text-gray-500">
              Dokončeno letos
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-[#0a192f]">{completedProjects}</p>
            <p className="text-xs text-gray-500">Výborná práce, pokračujte!</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-sm text-gray-500">
              Celkový rozpočet
              <BarChart3 className="h-4 w-4 text-indigo-500" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-[#0a192f]">
              {totalBudget.toLocaleString('cs-CZ')} Kč
            </p>
            <p className="text-xs text-gray-500">Pohlídejte si přerozdělení financí</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-sm text-gray-500">
              Vyčerpáno
              <TrendingUp className="h-4 w-4 text-amber-500" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-[#0a192f]">
              {totalSpent.toLocaleString('cs-CZ')} Kč
            </p>
            <p className="text-xs text-gray-500">Kontrolujte rozpočty včas</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-amber-700">
              Riziko překročení
              <AlertCircle className="h-4 w-4" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-amber-700">{overspentProjects}</p>
            <p className="text-xs text-amber-700/80">Projekt{overspentProjects === 1 ? '' : 'ů'} má vyšší čerpání než rozpočet</p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-blue-700">
              Startuje brzy
              <Calendar className="h-4 w-4" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-blue-700">{upcomingProjects}</p>
            <p className="text-xs text-blue-700/80">Projekty začínající do 30 dnů</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
              V přípravě
              <NotebookPen className="h-4 w-4 text-[#0a192f]" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-[#0a192f]">{planningProjects}</p>
            <p className="text-xs text-gray-500">Čekají na rozpracování detailů</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white/70 p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Hledat podle názvu, popisu nebo rozpočtu"
                className="w-full rounded-xl border border-gray-200 bg-white px-10 py-2.5 text-sm shadow-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/30"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {filterOptions.map((option) => {
                const isActive = statusFilter === option.value;
                const count = option.value === 'all' ? projects.length : statusCounts[option.value as Project['status']];

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatusFilter(option.value)}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'bg-[#0a192f] text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>{option.label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        isActive ? 'bg-white/20' : 'bg-white text-gray-600'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>Zobrazeno {filteredProjects.length} z {projects.length} projektů</span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                }}
                className="inline-flex items-center gap-1 font-semibold text-[#0a192f] hover:underline"
              >
                Vyčistit filtry
              </button>
            )}
          </div>
        </div>

        {overspentProjects > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5" />
              <div>
                <p className="font-semibold">Pozor na čerpání</p>
                <p>
                  {overspentProjects === 1
                    ? '1 projekt je momentálně nad plánovaným rozpočtem.'
                    : `${overspentProjects} projektů je momentálně nad plánovaným rozpočtem.`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-amber-700 shadow-sm transition hover:bg-amber-100"
            >
              Zaměřit se na aktivní projekty
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={resetForm}
        >
          <div
            className="relative w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-gray-100"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#0a192f]/5 via-transparent to-transparent" />
            <div className="relative grid gap-8 p-8 lg:grid-cols-[minmax(0,2fr),minmax(0,1fr)]">
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-wide text-[#0a192f]">
                      {editingProject ? 'Úprava projektu' : 'Kreator projektu'}
                    </p>
                    <h3 className="text-2xl font-bold text-[#0a192f]">
                      {steps[currentStep].title}
                    </h3>
                    <p className="text-gray-600">{steps[currentStep].description}</p>
                  </div>
                  <button
                    onClick={resetForm}
                    type="button"
                    className="text-sm font-medium text-gray-500 transition hover:text-red-500"
                  >
                    Zavřít
                  </button>
                </div>
                <div>
                  <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                    {steps.map((step, index) => (
                      <div key={step.title} className="flex flex-1 items-center gap-3">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold transition ${
                            index === currentStep
                              ? 'border-[#0a192f] bg-[#0a192f] text-white'
                              : index < currentStep
                                ? 'border-emerald-400 bg-emerald-400 text-white'
                                : 'border-gray-200 bg-gray-100 text-gray-400'
                          }`}
                        >
                          {index + 1}
                        </div>
                        {index < steps.length - 1 && (
                          <div className="h-0.5 flex-1 rounded-full bg-gradient-to-r from-gray-200 via-gray-200 to-gray-200">
                            <div
                              className={`h-full rounded-full ${
                                index < currentStep ? 'bg-[#0a192f]' : 'bg-transparent'
                              }`}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-[#0a192f] transition-all"
                      style={{ width: `${formProgress}%` }}
                    />
                  </div>
                </div>
              </div>

              {stepErrors.length > 0 && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <div className="mb-1 flex items-center gap-2 font-semibold">
                    <Info className="h-4 w-4" />
                    Potřebujeme doladit pár věcí
                  </div>
                  <ul className="list-disc space-y-1 pl-5">
                    {stepErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {currentStep === 0 && (
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-sm font-medium text-gray-700">Název projektu *</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Např. Rekonstrukce showroomu"
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base shadow-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/40"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Navázaný rozpočet</label>
                      <select
                        value={formData.budget_id}
                        onChange={(e) => setFormData({ ...formData, budget_id: e.target.value })}
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base shadow-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/40"
                      >
                        <option value="">-- Vyberte rozpočet --</option>
                        {budgets.map((budget) => (
                          <option key={budget.id} value={budget.id}>
                            {budget.name} {budget.client_name ? `• ${budget.client_name}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Status</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { value: 'planning', label: 'Plánování' },
                          { value: 'active', label: 'Aktivní' },
                          { value: 'completed', label: 'Dokončeno' },
                          { value: 'on-hold', label: 'Pozastaveno' },
                          { value: 'cancelled', label: 'Zrušeno' }
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setFormData({ ...formData, status: option.value as Project['status'] })}
                            className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                              formData.status === option.value
                                ? 'border-transparent bg-[#0a192f] text-white shadow-sm'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-[#0a192f]'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-sm font-medium text-gray-700">Popis projektu</label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        rows={4}
                        placeholder="Stručně popište, čeho chcete dosáhnout a proč je projekt důležitý."
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base shadow-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/40"
                      />
                    </div>
                  </div>
                )}

                {currentStep === 1 && (
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Datum začátku</label>
                      <input
                        type="date"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base shadow-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/40"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Datum dokončení</label>
                      <input
                        type="date"
                        value={formData.end_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base shadow-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/40"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Celkový rozpočet</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm text-gray-400">
                          Kč
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={formData.total_budget}
                          onChange={(e) =>
                            setFormData({ ...formData, total_budget: parseFloat(e.target.value) || 0 })
                          }
                          className="w-full rounded-xl border border-gray-200 px-4 py-3 pl-12 text-base shadow-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/40"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Již vyčerpáno</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm text-gray-400">
                          Kč
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={formData.spent_amount}
                          onChange={(e) =>
                            setFormData({ ...formData, spent_amount: parseFloat(e.target.value) || 0 })
                          }
                          className="w-full rounded-xl border border-gray-200 px-4 py-3 pl-12 text-base shadow-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/40"
                        />
                      </div>
                    </div>
                    <div className="md:col-span-2 rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-4 text-sm text-gray-600">
                      <p>
                        <strong className="text-[#0a192f]">Tip:</strong> Nastavte realistický finanční plán. Jakmile se blížíte
                        k vyčerpání rozpočtu, naplánujte revizi.
                      </p>
                    </div>
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Poznámky k realizaci</label>
                      <textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        rows={4}
                        placeholder="Klíčové milníky, odpovědnosti, rizika..."
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base shadow-sm focus:border-[#0a192f] focus:outline-none focus:ring-2 focus:ring-[#0a192f]/40"
                      />
                    </div>
                    <div className="rounded-2xl border border-[#0a192f]/10 bg-[#0a192f]/5 p-4 text-sm text-[#0a192f]">
                      <div className="mb-2 flex items-center gap-2 font-semibold">
                        <NotebookPen className="h-4 w-4" />
                        Rychlý checklist před spuštěním
                      </div>
                      <ul className="list-disc space-y-1 pl-5">
                        <li>Máte jasný cíl projektu a definovaný tým?</li>
                        <li>Jsou nastaveny kontrolní milníky a rozpočet?</li>
                        <li>Jsou v poznámkách důležité informace pro kolegy?</li>
                      </ul>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-gray-500">
                    Krok {currentStep + 1} z {steps.length}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={resetForm}
                      className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-800"
                    >
                      Zrušit
                    </button>
                    {currentStep > 0 && (
                      <button
                        type="button"
                        onClick={handlePreviousStep}
                        className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-800"
                      >
                        Zpět
                      </button>
                    )}
                    {currentStep === steps.length - 1 ? (
                      <button
                        type="submit"
                        className="rounded-xl bg-[#0a192f] px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-[#0a192f]/20 transition hover:-translate-y-0.5 hover:bg-[#0c2548]"
                      >
                        {editingProject ? 'Uložit změny' : 'Spustit projekt'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleNextStep}
                        className="rounded-xl bg-[#0a192f] px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-[#0a192f]/20 transition hover:-translate-y-0.5 hover:bg-[#0c2548]"
                      >
                        Pokračovat
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </div>

            <aside className="space-y-4">
              <div className="rounded-3xl bg-[#0a192f] p-6 text-white shadow-lg">
                <h4 className="text-lg font-semibold">Náhled projektu</h4>
                <p className="text-sm text-white/70">
                  Zkontrolujte si, zda všechno dává smysl, než projekt uložíte.
                </p>
                <div className="mt-4 space-y-3 text-sm">
                  <div>
                    <p className="text-white/60">Název</p>
                    <p className="font-semibold">{formData.name || 'Zatím nepojmenovaný projekt'}</p>
                  </div>
                  <div>
                    <p className="text-white/60">Status</p>
                    <p className="font-semibold">{getStatusText(formData.status)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-white/60">Začátek</p>
                      <p className="font-semibold">
                        {formData.start_date ? new Date(formData.start_date).toLocaleDateString('cs-CZ') : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-white/60">Konec</p>
                      <p className="font-semibold">
                        {formData.end_date ? new Date(formData.end_date).toLocaleDateString('cs-CZ') : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-white/60">Rozpočet</p>
                      <p className="font-semibold">{formData.total_budget.toLocaleString('cs-CZ')} Kč</p>
                    </div>
                    <div>
                      <p className="text-white/60">Vyčerpáno</p>
                      <p className="font-semibold">{formData.spent_amount.toLocaleString('cs-CZ')} Kč</p>
                    </div>
                  </div>
                  {formData.description && (
                    <div>
                      <p className="text-white/60">Popis</p>
                      <p className="line-clamp-3 text-sm leading-snug text-white/90">{formData.description}</p>
                    </div>
                  )}
                </div>
              </div>


              <div className="rounded-3xl border border-gray-100 bg-white/70 p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-[#0a192f]/10 p-2 text-[#0a192f]">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p className="font-semibold text-[#0a192f]">Tip pro lepší výsledek</p>
                    <p>
                      Proberte projekt s týmem ještě před spuštěním. Jasně pojmenované cíle a rozpočty ušetří spoustu improvizace
                      v průběhu.
                    </p>
                  </div>
                </div>
              </div>
            </aside>
            </div>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="rounded-3xl bg-white p-12 text-center shadow">
          <TrendingUp className="mx-auto mb-4 h-16 w-16 text-gray-300" />
          <h3 className="mb-2 text-lg font-medium text-gray-900">Zatím nemáte žádné projekty</h3>
          <p className="mb-6 text-gray-600">Vytvořte svůj první projekt a začněte plánovat.</p>
          <button
            onClick={openForm}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0a192f] px-6 py-3 text-white shadow-lg shadow-[#0a192f]/20 transition hover:-translate-y-0.5 hover:bg-[#0c2548]"
          >
            <Sparkles className="h-5 w-5" />
            Vytvořit projekt
          </button>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gray-200 bg-white/70 p-10 text-center shadow-sm">
          <h3 className="text-lg font-semibold text-[#0a192f]">Nic neodpovídá zvolenému filtru</h3>
          <p className="mt-2 text-sm text-gray-600">Zkuste upravit hledaný text nebo vyberte jiný status.</p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
              }}
              className="inline-flex items-center gap-2 rounded-full border border-[#0a192f]/20 px-5 py-2 text-sm font-medium text-[#0a192f] transition hover:border-[#0a192f]"
            >
              Vyčistit filtry
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6">
          {filteredProjects.map((project) => {
            const progress = calculateProgress(project);
            const remaining = project.total_budget - project.spent_amount;
            const linkedBudget = project.budget_id ? budgetsById.get(project.budget_id) : undefined;
            const isOverBudget = project.total_budget > 0 && project.spent_amount > project.total_budget;

            return (
              <div key={project.id} className="rounded-3xl bg-white p-6 shadow transition hover:shadow-lg">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="mb-2 text-xl font-semibold text-[#0a192f]">{project.name}</h3>
                    {linkedBudget && (
                      <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                        <NotebookPen className="h-4 w-4" />
                        <span>{linkedBudget.name}</span>
                        {linkedBudget.client_name && <span className="text-blue-400">• {linkedBudget.client_name}</span>}
                      </div>
                    )}
                    {project.description && (
                      <p className="text-sm text-gray-600">{project.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${getStatusColor(project.status)}`}>
                      {getStatusIcon(project.status)}
                      {getStatusText(project.status)}
                    </span>
                    <button
                      onClick={() => setSelectedProject(project)}
                      className="rounded-lg p-2 text-blue-600 transition hover:bg-blue-50"
                      title="Spravovat tým a úkoly"
                    >
                      <Users className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleEdit(project)}
                      className="rounded-lg p-2 text-gray-600 transition hover:bg-gray-100"
                    >
                      <Edit className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(project.id)}
                      className="rounded-lg p-2 text-red-600 transition hover:bg-red-50"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {project.start_date ? new Date(project.start_date).toLocaleDateString('cs-CZ') : 'N/A'}
                      {' → '}
                      {project.end_date ? new Date(project.end_date).toLocaleDateString('cs-CZ') : 'N/A'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    Rozpočet: <span className="font-semibold text-[#0a192f]">{project.total_budget.toLocaleString('cs-CZ')} Kč</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    Vyčerpáno: <span className="font-semibold text-[#0a192f]">{project.spent_amount.toLocaleString('cs-CZ')} Kč</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span className="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-600">
                      {progress.toFixed(0)} % rozpočtu čerpáno
                    </span>
                    {isOverBudget && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 font-medium text-red-700">
                        <AlertCircle className="h-3 w-3" /> Překračujete limit
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Průběh projektu</span>
                    <span className="font-medium text-[#0a192f]">{progress.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-200">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        isOverBudget ? 'bg-red-500' : progress >= 75 ? 'bg-amber-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{remaining < 0 ? 'Překročeno:' : 'Zbývá:'}</span>
                    <span className={`font-semibold ${remaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {remaining.toLocaleString('cs-CZ')} Kč
                    </span>
                  </div>
                </div>

                {project.notes && (
                  <div className="mt-4 border-t border-gray-200 pt-4">
                    <p className="text-sm text-gray-600">{project.notes}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
