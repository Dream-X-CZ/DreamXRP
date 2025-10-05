import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Plus,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Users,
  Tag,
  Edit3,
  Trash2,
  BarChart3,
  X
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ensureUserOrganization } from '../lib/organization';

import type { Task, Project, Employee } from '../types/database';
import Dropdown, { type DropdownOption } from './ui/Dropdown';
import TimePicker from './ui/TimePicker';


type StatusFilter = 'all' | Task['status'];
type PriorityFilter = 'all' | Task['priority'];
type ProjectFilter = 'all' | string;
type AssigneeFilter = 'all' | string;

type TaskFormState = {
  title: string;
  description: string;
  project_id: string;
  assigned_to: string;
  status: Task['status'];
  priority: Task['priority'];
  estimated_hours: string;
  actual_hours: string;
  deadline: string;
  deadlineTime: string;
};

const statusLabels: Record<Task['status'], string> = {
  todo: 'Plánováno',
  in_progress: 'Probíhá',
  completed: 'Dokončeno',
  cancelled: 'Zrušeno'
};

const statusColors: Record<Task['status'], string> = {
  todo: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-200 text-slate-600'
};

const priorityLabels: Record<Task['priority'], string> = {
  low: 'Nízká',
  medium: 'Střední',
  high: 'Vysoká',
  urgent: 'Kritická'
};

const priorityColors: Record<Task['priority'], string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-sky-100 text-sky-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700'
};

const statusDropdownOptions: DropdownOption[] = Object.entries(statusLabels).map(([value, label]) => ({
  value,
  label
}));

const priorityDropdownOptions: DropdownOption[] = Object.entries(priorityLabels).map(([value, label]) => ({
  value,
  label
}));

const initialFormState: TaskFormState = {
  title: '',
  description: '',
  project_id: '',
  assigned_to: '',
  status: 'todo',
  priority: 'medium',
  estimated_hours: '0',
  actual_hours: '0',
  deadline: '',
  deadlineTime: ''
};

interface TasksProps {
  activeOrganizationId: string | null;
}

export default function Tasks({ activeOrganizationId }: TasksProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<TaskFormState>(initialFormState);
  const [saving, setSaving] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);


  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('all');

  useEffect(() => {
    loadData();
  }, [activeOrganizationId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setTasks([]);
        setProjects([]);
        setEmployees([]);
        setOrganizationId(null);
        setError('Pro práci s úkoly musíte být přihlášeni.');
        return;
      }

      const organizationPromise = ensureUserOrganization(user.id, activeOrganizationId);

      const [orgId, tasksRes, projectsRes, employeesRes] = await Promise.all([
        organizationPromise,
        supabase.from('tasks').select('*').order('deadline', { ascending: true }),
        supabase.from('projects').select('id, name, organization_id').order('name'),

        supabase.from('employees').select('id, first_name, last_name, position').order('first_name')
      ]);

      if (tasksRes.error) throw tasksRes.error;
      if (projectsRes.error) throw projectsRes.error;
      if (employeesRes.error) throw employeesRes.error;

      setOrganizationId(orgId);

      setTasks(tasksRes.data || []);
      setProjects(projectsRes.data || []);
      setEmployees(employeesRes.data || []);
    } catch (err: any) {
      console.error('Error loading tasks:', err);
      setError('Nepodařilo se načíst data. Zkuste to prosím znovu.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = useCallback(() => {
    setFormData(initialFormState);
    setEditingTask(null);
  }, []);

  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    resetForm();
  }, [resetForm]);


  const handleCreateNew = () => {
    resetForm();
    setShowForm(true);
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setShowForm(true);
    let deadlineDate = '';
    let deadlineTime = '';

    if (task.deadline) {
      const [datePart, timePartRaw] = task.deadline.split('T');
      deadlineDate = datePart ?? '';

      if (timePartRaw) {
        const timePart = timePartRaw.split(/[+-]/)[0];
        if (timePart) {
          deadlineTime = timePart.slice(0, 5);
        }
      }
    }

    setFormData({
      title: task.title,
      description: task.description || '',
      project_id: task.project_id,
      assigned_to: task.assigned_to || '',
      status: task.status,
      priority: task.priority,
      estimated_hours: String(Number(task.estimated_hours || 0)),
      actual_hours: String(Number(task.actual_hours || 0)),
      deadline: deadlineDate,
      deadlineTime
    });
  };

  const handleDelete = async (task: Task) => {
    if (!confirm(`Opravdu chcete smazat úkol "${task.title}"?`)) return;

    try {
      const { error: deleteError } = await supabase.from('tasks').delete().eq('id', task.id);
      if (deleteError) throw deleteError;

      setTasks(prev => prev.filter(t => t.id !== task.id));
    } catch (err: any) {
      console.error('Error deleting task:', err);
      setError('Úkol se nepodařilo smazat.');
    }
  };

  const handleStatusChange = async (task: Task, status: Task['status']) => {
    if (task.status === status) return;

    try {
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
        .eq('id', task.id);

      if (updateError) throw updateError;

      setTasks(prev =>
        prev.map(t =>
          t.id === task.id
            ? {
                ...t,
                status,
                completed_at: status === 'completed' ? new Date().toISOString() : null
              }
            : t
        )
      );
    } catch (err: any) {
      console.error('Error updating task status:', err);
      setError('Nepodařilo se změnit stav úkolu.');
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (!formData.project_id) {
        setError('Vyberte prosím projekt, ke kterému úkol patří.');
        setSaving(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Pro práci s úkoly musíte být přihlášeni.');
        setSaving(false);
        return;
      }

      let organizationForTask = organizationId || activeOrganizationId;
      if (!organizationForTask) {
        organizationForTask = await ensureUserOrganization(user.id, activeOrganizationId);
      }

      if (organizationForTask !== organizationId) {
        setOrganizationId(organizationForTask);
      }

      const selectedProject = projects.find(project => project.id === formData.project_id);
      if (!selectedProject) {
        setError('Vybraný projekt se nepodařilo najít.');
        setSaving(false);
        return;
      }

      if (!selectedProject.organization_id) {
        const { error: projectUpdateError } = await supabase
          .from('projects')
          .update({ organization_id: organizationForTask })
          .eq('id', selectedProject.id);

        if (projectUpdateError) throw projectUpdateError;

        setProjects(prev =>
          prev.map(project =>
            project.id === selectedProject.id
              ? { ...project, organization_id: organizationForTask }
              : project
          )
        );
      }


      const deadlineValue = formData.deadline
        ? formData.deadlineTime
          ? `${formData.deadline}T${formData.deadlineTime}:00`
          : formData.deadline
        : null;

      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        project_id: formData.project_id,
        assigned_to: formData.assigned_to || null,
        status: formData.status,
        priority: formData.priority,
        estimated_hours: Number(formData.estimated_hours) || 0,
        actual_hours: Number(formData.actual_hours) || 0,
        deadline: deadlineValue
      };

      if (!payload.title) {
        setError('Název úkolu je povinný.');
        setSaving(false);
        return;
      }

      if (editingTask) {
        const { error: updateError } = await supabase
          .from('tasks')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingTask.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from('tasks').insert([
          {
            ...payload,
            created_by: user.id
          }
        ]);

        if (insertError) throw insertError;
      }

      await loadData();
      handleCloseForm();

    } catch (err: any) {
      console.error('Error saving task:', err);
      setError('Úkol se nepodařilo uložit. Zkontrolujte prosím zadané údaje.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!showForm) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [showForm]);

  useEffect(() => {
    if (!showForm) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseForm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showForm, handleCloseForm]);


  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    projects.forEach(project => map.set(project.id, project));
    return map;
  }, [projects]);

  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    employees.forEach(employee => map.set(employee.id, employee));
    return map;
  }, [employees]);

  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
      if (projectFilter !== 'all' && task.project_id !== projectFilter) return false;
      if (assigneeFilter !== 'all' && task.assigned_to !== assigneeFilter) return false;

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const projectName = projectMap.get(task.project_id)?.name?.toLowerCase() ?? '';
        const assignee = task.assigned_to
          ? `${employeeMap.get(task.assigned_to)?.first_name ?? ''} ${employeeMap.get(task.assigned_to)?.last_name ?? ''}`.trim().toLowerCase()
          : '';

        return (
          task.title.toLowerCase().includes(query) ||
          (task.description?.toLowerCase().includes(query) ?? false) ||
          projectName.includes(query) ||
          assignee.includes(query)
        );
      }

      return true;
    });
  }, [tasks, statusFilter, priorityFilter, projectFilter, assigneeFilter, searchTerm, projectMap, employeeMap]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(task => task.status === 'completed').length;
    const inProgress = tasks.filter(task => task.status === 'in_progress').length;
    const overdue = tasks.filter(task => {
      if (!task.deadline || task.status === 'completed' || task.status === 'cancelled') return false;
      const deadlineDate = new Date(task.deadline);
      deadlineDate.setHours(0, 0, 0, 0);
      return deadlineDate < today;
    }).length;
    const upcoming = tasks.filter(task => {
      if (!task.deadline) return false;
      const deadlineDate = new Date(task.deadline);
      deadlineDate.setHours(0, 0, 0, 0);
      const diff = (deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7 && task.status !== 'completed' && task.status !== 'cancelled';
    }).length;

    const estimatedHours = tasks.reduce((sum, task) => sum + Number(task.estimated_hours || 0), 0);
    const actualHours = tasks.reduce((sum, task) => sum + Number(task.actual_hours || 0), 0);

    return {
      total,
      completed,
      inProgress,
      overdue,
      upcoming,
      estimatedHours,
      actualHours
    };
  }, [tasks, today]);

  const uniqueAssignees = useMemo(() => {
    const ids = new Set(tasks.filter(task => task.assigned_to).map(task => task.assigned_to as string));
    return Array.from(ids)
      .map(id => employeeMap.get(id))
      .filter((employee): employee is Employee => Boolean(employee));
  }, [tasks, employeeMap]);

  const projectOptions = useMemo<DropdownOption[]>(
    () => projects.map(project => ({ value: project.id, label: project.name })),
    [projects]
  );

  const assigneeOptions = useMemo<DropdownOption[]>(() => {
    const base: DropdownOption[] = [
      { value: '', label: 'Nepřiřazeno' }
    ];

    employees.forEach(employee => {
      const fullName = `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim();
      base.push({
        value: employee.id,
        label: fullName || employee.first_name || 'Bez jména'
      });
    });

    return base;
  }, [employees]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#0a192f]">Úkoly</h1>
          <p className="text-slate-600">Plánujte, sledujte a spravujte práci napříč projekty.</p>
        </div>
        <button
          onClick={handleCreateNew}
          className="inline-flex items-center gap-2 px-4 py-3 rounded-lg bg-[#0a192f] text-white hover:bg-[#112a4d] transition"
        >
          <Plus className="w-5 h-5" />
          <span>Nový úkol</span>
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={ClipboardIcon}
          label="Celkem úkolů"
          value={stats.total}
          helper={`${stats.completed} dokončeno`}
        />
        <StatCard
          icon={Clock}
          label="Probíhá"
          value={stats.inProgress}
          helper={`${stats.upcoming} s termínem do 7 dní`}
        />
        <StatCard
          icon={AlertTriangle}
          label="Po termínu"
          value={stats.overdue}
          helper={stats.overdue > 0 ? 'Vyžaduje pozornost' : 'Vše pod kontrolou'}
          accent="bg-red-50"
        />
        <StatCard
          icon={BarChart3}
          label="Odhad / Čerpání (h)"
          value={`${stats.actualHours.toFixed(1)}h`}
          helper={`Odhad ${stats.estimatedHours.toFixed(1)}h`}
        />
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-6">
        <div className="grid gap-4 lg:grid-cols-4 md:grid-cols-2">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
            <Search className="w-5 h-5 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Hledat podle názvu, projektu nebo popisu"
              className="flex-1 bg-transparent outline-none"
            />
          </div>

          <FilterSelect
            icon={Filter}
            label="Stav"
            value={statusFilter}
            onChange={value => setStatusFilter(value as StatusFilter)}
            options={[
              { value: 'all', label: 'Vše' },
              { value: 'todo', label: statusLabels.todo },
              { value: 'in_progress', label: statusLabels.in_progress },
              { value: 'completed', label: statusLabels.completed },
              { value: 'cancelled', label: statusLabels.cancelled }
            ]}
          />

          <FilterSelect
            icon={Tag}
            label="Priorita"
            value={priorityFilter}
            onChange={value => setPriorityFilter(value as PriorityFilter)}
            options={[
              { value: 'all', label: 'Vše' },
              { value: 'low', label: priorityLabels.low },
              { value: 'medium', label: priorityLabels.medium },
              { value: 'high', label: priorityLabels.high },
              { value: 'urgent', label: priorityLabels.urgent }
            ]}
          />

          <FilterSelect
            icon={Users}
            label="Projekt / Přiřazení"
            value={`${projectFilter}|${assigneeFilter}`}
            onChange={value => {
              const [projectValue, assigneeValue] = value.split('|');
              setProjectFilter(projectValue as ProjectFilter);
              setAssigneeFilter(assigneeValue as AssigneeFilter);
            }}
            options={[
              { value: 'all|all', label: 'Všechny úkoly' },
              ...projects.map(project => ({ value: `${project.id}|all`, label: `Projekt: ${project.name}` })),
              ...uniqueAssignees.map(assignee => ({
                value: `all|${assignee.id}`,
                label: `Přiřazeno: ${assignee.first_name} ${assignee.last_name}`.trim()
              }))
            ]}
          />
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 text-red-700 border border-red-100">
            {error}
          </div>
      )
      }


        {loading ? (
          <div className="text-center py-16 text-slate-500">Načítání úkolů...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
            <div>
              <p className="text-lg font-semibold text-[#0a192f]">Žádné úkoly k zobrazení</p>
              <p className="text-slate-500">Změňte filtr nebo vytvořte nový úkol.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredTasks.map(task => {
              const project = projectMap.get(task.project_id);
              const assignee = task.assigned_to ? employeeMap.get(task.assigned_to) : undefined;
              const deadlineDate = task.deadline ? new Date(task.deadline) : null;
              const hasSpecificTime = task.deadline ? task.deadline.includes('T') : false;
              const dateLabel = deadlineDate?.toLocaleDateString('cs-CZ');
              const timeLabel = deadlineDate && hasSpecificTime
                ? deadlineDate.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
                : null;
              const deadlineLabel = deadlineDate
                ? timeLabel
                  ? `${dateLabel} ${timeLabel}`
                  : dateLabel ?? 'Bez termínu'
                : 'Bez termínu';

              const isOverdue = deadlineDate
                ? (() => {
                    const normalized = new Date(deadlineDate);
                    normalized.setHours(0, 0, 0, 0);
                    return normalized < today && task.status !== 'completed' && task.status !== 'cancelled';
                  })()
                : false;

              return (
                <article
                  key={task.id}
                  className="p-5 rounded-xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[task.status]}`}>
                          {statusLabels[task.status]}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${priorityColors[task.priority]}`}>
                          {priorityLabels[task.priority]}
                        </span>
                        {isOverdue && (
                          <span className="px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700">
                            Po termínu
                          </span>
                        )}
                      </div>

                      <h2 className="text-xl font-semibold text-[#0a192f]">{task.title}</h2>

                      {task.description && (
                        <p className="text-slate-600 whitespace-pre-line">{task.description}</p>
                      )}

                      <dl className="grid gap-3 sm:grid-cols-2">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Calendar className="w-4 h-4" />
                          <span>Termín: <strong>{deadlineLabel}</strong></span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Clock className="w-4 h-4" />
                          <span>
                            Čas: <strong>{Number(task.actual_hours || 0)}h</strong> / {Number(task.estimated_hours || 0)}h
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Tag className="w-4 h-4" />
                          <span>Projekt: <strong>{project?.name ?? 'Neznámý projekt'}</strong></span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Users className="w-4 h-4" />
                          <span>
                            Přiřazeno: <strong>{assignee ? `${assignee.first_name} ${assignee.last_name}`.trim() : 'Nepřiřazeno'}</strong>
                          </span>
                        </div>
                      </dl>
                    </div>

                    <div className="flex flex-col gap-2 min-w-[180px]">
                      <span className="text-xs uppercase tracking-wide text-slate-500 font-medium">Změna stavu</span>
                      <Dropdown
                        className="w-full"
                        value={task.status}
                        onChange={nextValue => handleStatusChange(task, nextValue as Task['status'])}
                        options={statusDropdownOptions}
                        placeholder="Vyberte stav"
                        size="sm"
                        variant="soft"
                      />

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(task)}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50"
                        >
                          <Edit3 className="w-4 h-4" />
                          Upravit
                        </button>
                        <button
                          onClick={() => handleDelete(task)}
                          className="px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                          title="Smazat úkol"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={handleCloseForm} />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-form-title"
            className="relative w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-slate-100 p-6 max-h-[90vh] overflow-y-auto"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="task-form-title" className="text-2xl font-semibold text-[#0a192f]">
                  {editingTask ? 'Upravit úkol' : 'Nový úkol'}
                </h2>
                <p className="text-slate-500">Vyplňte informace o úkolu a přiřaďte ho ke konkrétnímu projektu.</p>
              </div>
              <button
                type="button"
                onClick={handleCloseForm}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:text-slate-700 hover:border-slate-300"
                aria-label="Zavřít formulář"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 grid gap-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Název úkolu *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={event => setFormData(prev => ({ ...prev, title: event.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-[#0a192f] focus:ring-2 focus:ring-[#0a192f]/20"
                    placeholder="Např. Připravit podklady pro nabídku"
                    required
                  />
                </div>

                <Dropdown
                  label="Projekt *"
                  value={formData.project_id}
                  onChange={nextValue => setFormData(prev => ({ ...prev, project_id: nextValue }))}
                  options={projectOptions}
                  placeholder="Vyberte projekt"
                  className="w-full"
                />

                <Dropdown
                  label="Přiřazeno"
                  value={formData.assigned_to}
                  onChange={nextValue => setFormData(prev => ({ ...prev, assigned_to: nextValue }))}
                  options={assigneeOptions}
                  placeholder="Vyberte člena týmu"
                  className="w-full"
                />

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Termín dokončení</label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="date"
                      value={formData.deadline}
                      onChange={event => {
                        const nextDate = event.target.value;
                        setFormData(prev => ({
                          ...prev,
                          deadline: nextDate,
                          deadlineTime: nextDate ? prev.deadlineTime : ''
                        }));
                      }}
                      className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-[#0a192f] focus:ring-2 focus:ring-[#0a192f]/20"
                    />
                    <TimePicker
                      value={formData.deadlineTime}
                      onChange={nextValue =>
                        setFormData(prev => ({
                          ...prev,
                          deadlineTime: nextValue
                        }))
                      }
                      placeholder="Vyberte čas"
                      className="sm:col-span-1"
                      helperText="Volitelné"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Dropdown
                  label="Stav"
                  value={formData.status}
                  onChange={nextValue =>
                    setFormData(prev => ({ ...prev, status: nextValue as Task['status'] }))
                  }
                  options={statusDropdownOptions}
                  placeholder="Vyberte stav"
                  className="w-full"
                />

                <Dropdown
                  label="Priorita"
                  value={formData.priority}
                  onChange={nextValue =>
                    setFormData(prev => ({ ...prev, priority: nextValue as Task['priority'] }))
                  }
                  options={priorityDropdownOptions}
                  placeholder="Vyberte prioritu"
                  className="w-full"
                />

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Odhadovaný čas (h)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={formData.estimated_hours}
                    onChange={event => setFormData(prev => ({ ...prev, estimated_hours: event.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-[#0a192f] focus:ring-2 focus:ring-[#0a192f]/20"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Skutečně strávený čas (h)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={formData.actual_hours}
                    onChange={event => setFormData(prev => ({ ...prev, actual_hours: event.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-[#0a192f] focus:ring-2 focus:ring-[#0a192f]/20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Popis</label>
                <textarea
                  value={formData.description}
                  onChange={event => setFormData(prev => ({ ...prev, description: event.target.value }))}
                  rows={4}
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-[#0a192f] focus:ring-2 focus:ring-[#0a192f]/20"
                  placeholder="Shrňte detaily úkolu, akceptační kritéria nebo postup práce"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#0a192f] text-white hover:bg-[#112a4d] disabled:opacity-60"
                >
                  {saving ? 'Ukládám...' : editingTask ? 'Uložit změny' : 'Vytvořit úkol'}
                </button>
              </div>
            </form>
          </section>
        </div>
        ) : null}

    </div>
  );
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  helper?: string;
  accent?: string;
}

function StatCard({ icon: Icon, label, value, helper, accent }: StatCardProps) {
  return (
    <div className={`p-5 rounded-2xl border border-slate-100 bg-white shadow-sm space-y-2 ${accent ?? ''}`}>
      <div className="flex items-center gap-3 text-slate-500">
        <Icon className="w-5 h-5" />
        <span className="text-sm font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-3xl font-semibold text-[#0a192f]">{value}</div>
      {helper && <div className="text-sm text-slate-500">{helper}</div>}
    </div>
  );
}

interface FilterSelectProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
}

function FilterSelect({ icon: Icon, label, value, onChange, options }: FilterSelectProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
      <Icon className="w-5 h-5 text-slate-500" />
      <div className="flex-1">
        <p className="text-xs uppercase text-slate-500 font-medium mb-1">{label}</p>
        <Dropdown
          className="w-full"
          value={value}
          onChange={nextValue => onChange(nextValue)}
          options={options}
          placeholder="Vyberte možnost"
          size="sm"
          variant="ghost"
          buttonClassName="bg-transparent px-0 py-0 pr-6 text-sm font-medium text-slate-700 border-transparent shadow-none focus:ring-0 focus:border-transparent"
        />
      </div>
    </div>
  );
}

function ClipboardIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={props.className}
    >
      <path
        d="M9 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="9"
        y="2"
        width="6"
        height="4"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
