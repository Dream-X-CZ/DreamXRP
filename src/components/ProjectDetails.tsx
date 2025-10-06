import { useState, useEffect } from 'react';
import { ArrowLeft, Users, Plus, CheckCircle, Clock, AlertTriangle, Trash2, CreditCard as Edit, PlayCircle, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Project, Employee, ProjectAssignment, Task, Budget } from '../types/database';

interface ProjectDetailsProps {
  project: Project;
  onBack: () => void;
  onUpdate: () => void;
}

export default function ProjectDetails({ project, onBack, onUpdate }: ProjectDetailsProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [linkedBudget, setLinkedBudget] = useState<Budget | null>(null);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [clientHourlyRate, setClientHourlyRate] = useState(project.client_hourly_rate || 0);
  const [showRateForm, setShowRateForm] = useState(false);

  const [assignmentForm, setAssignmentForm] = useState({
    employee_id: '',
    role_in_project: '',
    notes: ''
  });

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assigned_to: '',
    priority: 'medium' as Task['priority'],
    estimated_hours: 0,
    actual_hours: 0,
    deadline: '',
    status: 'todo' as Task['status']
  });

  useEffect(() => {
    loadData();
  }, [project.id]);

  const loadData = async () => {
    try {
      const [employeesRes, assignmentsRes, tasksRes] = await Promise.all([
        supabase.from('employees').select('*').order('first_name'),
        supabase.from('project_assignments').select('*').eq('project_id', project.id),
        supabase.from('tasks').select('*').eq('project_id', project.id).order('deadline', { ascending: true })
      ]);

      if (employeesRes.data) setEmployees(employeesRes.data);
      if (assignmentsRes.data) setAssignments(assignmentsRes.data);
      if (tasksRes.data) setTasks(tasksRes.data);

      if (project.budget_id) {
        const { data: budgetRows, error: budgetError } = await supabase
          .from('budgets')
          .select('*')
          .eq('id', project.budget_id)
          .limit(1);

        if (!budgetError && budgetRows && budgetRows.length > 0) {
          setLinkedBudget(budgetRows[0] as Budget);
        } else {
          setLinkedBudget(null);
        }
      } else {
        setLinkedBudget(null);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const handleAssignWorker = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from('project_assignments').insert({
        project_id: project.id,
        employee_id: assignmentForm.employee_id,
        assigned_by: user.id,
        role_in_project: assignmentForm.role_in_project,
        notes: assignmentForm.notes
      });

      if (error) throw error;

      setAssignmentForm({ employee_id: '', role_in_project: '', notes: '' });
      setShowAssignmentForm(false);
      loadData();
    } catch (error) {
      console.error('Error assigning worker:', error);
      alert('Chyba při přiřazení pracovníka');
    }
  };

  const handleRemoveAssignment = async (id: string) => {
    if (!confirm('Opravdu chcete odebrat tohoto pracovníka z projektu?')) return;

    try {
      const { error } = await supabase.from('project_assignments').delete().eq('id', id);
      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error removing assignment:', error);
    }
  };

  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const taskData = {
        ...taskForm,
        project_id: project.id,
        assigned_to: taskForm.assigned_to || null,
        deadline: taskForm.deadline || null,
        created_by: user.id
      };

      if (editingTask) {
        const { error } = await supabase
          .from('tasks')
          .update(taskData)
          .eq('id', editingTask.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('tasks').insert([taskData]);
        if (error) throw error;
      }

      resetTaskForm();
      loadData();
    } catch (error) {
      console.error('Error saving task:', error);
      alert('Chyba při ukládání úkolu');
    }
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setTaskForm({
      title: task.title,
      description: task.description || '',
      assigned_to: task.assigned_to || '',
      priority: task.priority,
      estimated_hours: task.estimated_hours,
      actual_hours: task.actual_hours,
      deadline: task.deadline || '',
      status: task.status
    });
    setShowTaskForm(true);
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    try {
      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString()
      };

      if (newStatus === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', taskId);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error updating task status:', error);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('Opravdu chcete smazat tento úkol?')) return;

    try {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const resetTaskForm = () => {
    setTaskForm({
      title: '',
      description: '',
      assigned_to: '',
      priority: 'medium',
      estimated_hours: 0,
      actual_hours: 0,
      deadline: '',
      status: 'todo'
    });
    setEditingTask(null);
    setShowTaskForm(false);
  };

  const getEmployeeName = (employeeId: string) => {
    const employee = employees.find(e => e.id === employeeId);
    return employee ? `${employee.first_name} ${employee.last_name}` : 'N/A';
  };

  const assignedEmployeeIds = assignments.map(a => a.employee_id);
  const availableEmployees = employees.filter(e => !assignedEmployeeIds.includes(e.id));

  const getPriorityClasses = (priority: Task['priority']) => {
    switch (priority) {
      case 'low': return 'bg-gray-100 text-gray-800';
      case 'medium': return 'bg-blue-100 text-blue-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'urgent': return 'bg-red-100 text-red-800';
    }
  };

  const getTaskStatusClasses = (status: Task['status']) => {
    switch (status) {
      case 'todo': return 'bg-gray-100 text-gray-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
    }
  };

  const totalEstimated = tasks.reduce((sum, t) => sum + t.estimated_hours, 0);
  const totalActual = tasks.reduce((sum, t) => sum + t.actual_hours, 0);
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
  const overdueTasks = tasks.filter(
    t => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'completed' && t.status !== 'cancelled'
  ).length;

  const tasksByStatus = tasks.reduce(
    (acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    },
    { todo: 0, in_progress: 0, completed: 0, cancelled: 0 } as Record<Task['status'], number>
  );

  const tasksByPriority = tasks.reduce(
    (acc, task) => {
      acc[task.priority] = (acc[task.priority] || 0) + 1;
      return acc;
    },
    { low: 0, medium: 0, high: 0, urgent: 0 } as Record<Task['priority'], number>
  );
  const taskStatusLabels: Record<Task['status'], string> = {
    todo: 'K dokončení',
    in_progress: 'Probíhá',
    completed: 'Hotovo',
    cancelled: 'Zrušeno'
  };
  const taskPriorityLabels: Record<Task['priority'], string> = {
    low: 'Nízká',
    medium: 'Střední',
    high: 'Vysoká',
    urgent: 'Urgentní'
  };
  const taskStatusOrder: Task['status'][] = ['todo', 'in_progress', 'completed', 'cancelled'];
  const taskPriorityOrder: Task['priority'][] = ['urgent', 'high', 'medium', 'low'];

  const upcomingDeadline = tasks
    .filter(task => {
      if (!task.deadline) return false;
      const deadline = new Date(task.deadline);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return deadline >= today && task.status !== 'completed' && task.status !== 'cancelled';
    })
    .sort((a, b) => new Date(a.deadline || '').getTime() - new Date(b.deadline || '').getTime())[0];

  const daysToDeadline = upcomingDeadline?.deadline
    ? Math.ceil((new Date(upcomingDeadline.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const formatCurrency = (value: number) => `${value.toLocaleString('cs-CZ')} Kč`;
  const formatHours = (value: number) =>
    value.toLocaleString('cs-CZ', { maximumFractionDigits: 1, minimumFractionDigits: 0 });

  const budgetProgressRaw = project.total_budget > 0
    ? (project.spent_amount / project.total_budget) * 100
    : 0;
  const budgetProgress = Math.min(Math.max(budgetProgressRaw, 0), 150);
  const remainingBudget = project.total_budget - project.spent_amount;
  const isOverBudget = project.total_budget > 0 && project.spent_amount > project.total_budget;
  const completedPercentage = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const timeDifference = totalActual - totalEstimated;
  const timeDifferenceLabel =
    tasks.length === 0
      ? 'Zatím bez úkolů'
      : timeDifference === 0
        ? 'V souladu s plánem'
        : `${timeDifference > 0 ? '+' : '-'}${formatHours(Math.abs(timeDifference))}h proti plánu`;
  const durationInDays = project.start_date && project.end_date
    ? Math.max(
        1,
        Math.ceil(
          (new Date(project.end_date).getTime() - new Date(project.start_date).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : null;
  const formatDaysLabel = (days: number) => {
    if (days === 0) return 'dnes';
    if (days === 1) return 'za 1 den';
    if (days >= 2 && days <= 4) return `za ${days} dny`;
    return `za ${days} dní`;
  };
  const formattedHourlyRate = clientHourlyRate.toLocaleString('cs-CZ', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  });
  const keyMetrics = [
    {
      label: 'Celkem úkolů',
      value: tasks.length.toString(),
      accentClass: 'text-[#0a192f]',
      helper: completedTasks > 0 ? `${completedTasks} dokončeno` : 'Čeká na plnění'
    },
    {
      label: 'Dokončeno',
      value: completedTasks.toString(),
      accentClass: 'text-green-600',
      helper: tasks.length > 0 ? `${completedPercentage}% splněno` : 'Zatím nic'
    },
    {
      label: 'Probíhá',
      value: inProgressTasks.toString(),
      accentClass: 'text-blue-600',
      helper: inProgressTasks > 0 ? 'Aktivní úkoly' : 'Bez práce'
    },
    {
      label: 'Po termínu',
      value: overdueTasks.toString(),
      accentClass: overdueTasks > 0 ? 'text-red-600' : 'text-gray-600',
      helper: overdueTasks > 0 ? 'Vyžaduje pozornost' : 'Vše v termínu'
    },
    {
      label: 'Odhadovaný čas',
      value: `${formatHours(totalEstimated)} h`,
      accentClass: 'text-[#0a192f]',
      helper: tasks.length > 0 ? 'Součet plánovaných hodin' : 'Zatím neplánováno'
    },
    {
      label: 'Skutečný čas',
      value: `${formatHours(totalActual)} h`,
      accentClass: 'text-blue-600',
      helper: timeDifferenceLabel
    }
  ];

  const getProjectStatusBadge = (status: Project['status']) => {
    switch (status) {
      case 'planning':
        return 'bg-blue-50 text-blue-700 border border-blue-100';
      case 'active':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      case 'completed':
        return 'bg-green-50 text-green-700 border border-green-100';
      case 'on-hold':
        return 'bg-amber-50 text-amber-700 border border-amber-100';
      case 'cancelled':
        return 'bg-red-50 text-red-700 border border-red-100';
    }
  };

  const getProjectStatusLabel = (status: Project['status']) => {
    switch (status) {
      case 'planning':
        return 'Plánování';
      case 'active':
        return 'Aktivní';
      case 'completed':
        return 'Dokončeno';
      case 'on-hold':
        return 'Pozastaveno';
      case 'cancelled':
        return 'Zrušeno';
    }
  };

  const handleGenerateBudget = async () => {
    if (tasks.length === 0) {
      alert('Nejprve vytvořte úkoly pro tento projekt');
      return;
    }

    if (!clientHourlyRate || clientHourlyRate === 0) {
      alert('Nejprve nastavte hodinovou sazbu pro klienta');
      return;
    }

    if (!confirm(`Generovat rozpočet z ${tasks.length} úkolů s hodinovou sazbou ${clientHourlyRate} Kč?`)) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: categories } = await supabase.from('categories').select('*').limit(1);
      if (!categories || categories.length === 0) {
        alert('Nejprve vytvořte alespoň jednu kategorii');
        return;
      }
      const defaultCategoryId = categories[0].id;

      const { data: newBudget, error: budgetError } = await supabase
        .from('budgets')
        .insert({
          name: `Rozpočet - ${project.name}`,
          client_name: project.name,
          status: 'draft',
          user_id: user.id
        })
        .select()
        .single();

      if (budgetError) throw budgetError;

      const budgetItems = await Promise.all(
        tasks.map(async (task, index) => {
          const clientTotal = task.estimated_hours * clientHourlyRate;

          let internalCost = 0;
          if (task.assigned_to) {
            const { data: employee } = await supabase
              .from('employees')
              .select('hourly_rate')
              .eq('id', task.assigned_to)
              .single();

            if (employee && employee.hourly_rate) {
              internalCost = task.estimated_hours * employee.hourly_rate;
            }
          }

          return {
            budget_id: newBudget.id,
            task_id: task.id,
            category_id: defaultCategoryId,
            item_name: task.title,
            unit: 'hod',
            quantity: task.estimated_hours,
            price_per_unit: clientHourlyRate,
            total_price: clientTotal,
            notes: task.description || '',
            internal_price_per_unit: task.assigned_to && internalCost > 0 ? internalCost / task.estimated_hours : 0,
            internal_quantity: task.estimated_hours,
            internal_total_price: internalCost,
            profit: clientTotal - internalCost,
            order_index: index
          };
        })
      );

      const { error: itemsError } = await supabase
        .from('budget_items')
        .insert(budgetItems);

      if (itemsError) throw itemsError;

      await supabase
        .from('projects')
        .update({ budget_id: newBudget.id })
        .eq('id', project.id);

      alert(`Rozpočet byl úspěšně vytvořen s ${budgetItems.length} položkami!`);
      onUpdate();
    } catch (error) {
      console.error('Error generating budget:', error);
      alert('Chyba při generování rozpočtu');
    }
  };

  const handleUpdateHourlyRate = async () => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ client_hourly_rate: clientHourlyRate })
        .eq('id', project.id);

      if (error) throw error;

      setShowRateForm(false);
      alert('Hodinová sazba byla aktualizována');
      onUpdate();
    } catch (error) {
      console.error('Error updating hourly rate:', error);
      alert('Chyba při aktualizaci hodinové sazby');
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 transition hover:text-[#0a192f]"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Zpět na projekty</span>
        </button>

        <div className="flex flex-wrap items-center gap-3">
          {!showRateForm ? (
            <>
              <div className="flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2">
                <span className="text-sm text-gray-600">Hodinová sazba</span>
                <span className="text-sm font-semibold text-[#0a192f]">{formattedHourlyRate} Kč/hod</span>
                <button
                  onClick={() => setShowRateForm(true)}
                  className="rounded-lg p-1 text-[#0a192f] transition hover:bg-gray-200"
                  title="Upravit sazbu"
                >
                  <Edit className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={handleGenerateBudget}
                className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-white transition hover:bg-green-700"
              >
                <FileText className="w-5 h-5" />
                <span>Generovat rozpočet z úkolů</span>
              </button>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                step="0.01"
                value={clientHourlyRate}
                onChange={(e) => setClientHourlyRate(parseFloat(e.target.value) || 0)}
                className="w-32 rounded-lg border border-gray-300 px-3 py-2"
                placeholder="Kč/hod"
              />
              <button
                onClick={handleUpdateHourlyRate}
                className="rounded-lg bg-[#0a192f] px-4 py-2 text-white transition hover:bg-opacity-90"
              >
                Uložit
              </button>
              <button
                onClick={() => {
                  setShowRateForm(false);
                  setClientHourlyRate(project.client_hourly_rate || 0);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 transition hover:bg-gray-50"
              >
                Zrušit
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 rounded-3xl bg-white p-6 shadow">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${getProjectStatusBadge(project.status)}`}>
                {getProjectStatusLabel(project.status)}
              </span>
              {linkedBudget && (
                <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  <FileText className="h-4 w-4" />
                  {linkedBudget.name}
                </span>
              )}
            </div>
            <h2 className="text-3xl font-bold text-[#0a192f]">{project.name}</h2>
            {project.description && <p className="mt-3 text-base text-gray-600">{project.description}</p>}
          </div>

          <div className="grid w-full max-w-sm gap-3 text-sm text-gray-600">
            <div className="rounded-2xl border border-gray-100 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Harmonogram</div>
              <div className="mt-2 space-y-1 text-[#0a192f]">
                <div className="flex items-center justify-between">
                  <span>Začátek</span>
                  <span>{project.start_date ? new Date(project.start_date).toLocaleDateString('cs-CZ') : 'Neuvedeno'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Konec</span>
                  <span>{project.end_date ? new Date(project.end_date).toLocaleDateString('cs-CZ') : 'Neuvedeno'}</span>
                </div>
              </div>
              {durationInDays && (
                <div className="mt-3 text-xs text-gray-500">
                  Délka: <span className="font-semibold text-[#0a192f]">{durationInDays} {durationInDays === 1 ? 'den' : durationInDays < 5 ? 'dny' : 'dnů'}</span>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-100 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Finance</div>
              <div className="mt-2 space-y-1 text-[#0a192f]">
                <div className="flex items-center justify-between">
                  <span>Rozpočet</span>
                  <span>{formatCurrency(project.total_budget)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Vyčerpáno</span>
                  <span>{formatCurrency(project.spent_amount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{remainingBudget >= 0 ? 'Zbývá' : 'Překročeno'}</span>
                  <span className={`${remainingBudget < 0 ? 'text-red-600' : 'text-[#0a192f]'}`}>
                    {formatCurrency(Math.abs(remainingBudget))}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Sazba klienta</span>
                  <span>{formattedHourlyRate} Kč/hod</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {keyMetrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <div className="text-sm text-gray-600">{metric.label}</div>
              <div className={`mt-1 text-2xl font-bold ${metric.accentClass}`}>{metric.value}</div>
              <div className="mt-1 text-xs text-gray-500">{metric.helper}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl bg-gray-50 p-4">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Čerpání rozpočtu</span>
            <span className={`font-semibold ${isOverBudget ? 'text-red-600' : 'text-[#0a192f]'}`}>
              {Math.round(budgetProgressRaw)} %
            </span>
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-white">
            <div
              className={`h-full rounded-full ${isOverBudget ? 'bg-red-500' : 'bg-[#0a192f]'}`}
              style={{ width: `${Math.min(Math.max(budgetProgressRaw, 0), 100)}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {isOverBudget
              ? `Rozpočet je překročen o ${formatCurrency(Math.abs(remainingBudget))}`
              : `Zbývá vyčerpat ${formatCurrency(Math.max(remainingBudget, 0))}`}
          </div>
        </div>
      </div>

      {project.notes && (
        <div className="mb-6 rounded-3xl bg-white p-6 shadow">
          <h3 className="text-lg font-semibold text-[#0a192f]">Interní poznámky</h3>
          <p className="mt-2 whitespace-pre-line text-sm text-gray-600">{project.notes}</p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[#0a192f] flex items-center gap-2">
              <Users className="w-5 h-5" />
              Přiřazení pracovníci
            </h3>
            <button
              onClick={() => setShowAssignmentForm(!showAssignmentForm)}
              className="text-[#0a192f] hover:bg-gray-100 p-2 rounded-lg transition"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {showAssignmentForm && (
            <form onSubmit={handleAssignWorker} className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
              <select
                required
                value={assignmentForm.employee_id}
                onChange={(e) => setAssignmentForm({ ...assignmentForm, employee_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Vyberte pracovníka</option>
                {availableEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Role v projektu"
                value={assignmentForm.role_in_project}
                onChange={(e) => setAssignmentForm({ ...assignmentForm, role_in_project: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 bg-[#0a192f] text-white rounded-lg text-sm hover:bg-opacity-90">
                  Přiřadit
                </button>
                <button type="button" onClick={() => setShowAssignmentForm(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                  Zrušit
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {assignments.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Žádní přiřazení pracovníci</p>
            ) : (
              assignments.map((assignment) => {
                const employee = employees.find(e => e.id === assignment.employee_id);
                return (
                  <div key={assignment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-sm">
                        {employee ? `${employee.first_name} ${employee.last_name}` : 'N/A'}
                      </div>
                      {assignment.role_in_project && (
                        <div className="text-xs text-gray-600">{assignment.role_in_project}</div>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveAssignment(assignment.id)}
                      className="text-red-600 hover:bg-red-50 p-1 rounded transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-lg font-semibold text-[#0a192f]">Přehled úkolů</h3>
          <div className="mt-4 space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Podle stavu</div>
              <div className="mt-3 space-y-2">
                {taskStatusOrder.map((status) => (
                  <div
                    key={status}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${getTaskStatusClasses(status)}`}
                  >
                    <span>{taskStatusLabels[status]}</span>
                    <span>{tasksByStatus[status]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Priority</div>
              <div className="mt-3 space-y-2">
                {taskPriorityOrder.map((priority) => (
                  <div
                    key={priority}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${getPriorityClasses(priority)}`}
                  >
                    <span>{taskPriorityLabels[priority]}</span>
                    <span>{tasksByPriority[priority]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                <Clock className="mt-0.5 h-4 w-4" />
                {upcomingDeadline ? (
                  <div>
                    <div className="font-semibold">
                      {upcomingDeadline.deadline
                        ? new Date(upcomingDeadline.deadline).toLocaleDateString('cs-CZ')
                        : ''}
                      {daysToDeadline !== null ? ` • ${formatDaysLabel(Math.max(daysToDeadline, 0))}` : ''}
                    </div>
                    <div className="text-xs text-blue-900">
                      {upcomingDeadline.title}
                      {upcomingDeadline.assigned_to && (
                        <span className="ml-1">
                          • {getEmployeeName(upcomingDeadline.assigned_to)}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="font-semibold">Žádné nadcházející termíny</div>
                    <div className="text-xs text-blue-900">Naplánujte další kroky projektu</div>
                  </div>
                )}
              </div>

              {overdueTasks > 0 && (
                <div className="flex items-start gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4" />
                  <div>
                    <div className="font-semibold">{overdueTasks} úkolů po termínu</div>
                    <div className="text-xs text-red-600">Zkontrolujte stav a přerozdělte kapacity</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow lg:col-span-2 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[#0a192f]">Úkoly</h3>
            <button
              onClick={() => setShowTaskForm(!showTaskForm)}
              className="flex items-center gap-2 bg-[#0a192f] text-white px-4 py-2 rounded-lg hover:bg-opacity-90 transition"
            >
              <Plus className="w-5 h-5" />
              <span>Nový úkol</span>
            </button>
          </div>

          {showTaskForm && (
            <form onSubmit={handleSubmitTask} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3">
              <input
                type="text"
                required
                placeholder="Název úkolu *"
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <textarea
                placeholder="Popis"
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={taskForm.assigned_to}
                  onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">-- Nepřiřazeno --</option>
                  {assignments.map((assignment) => (
                    <option key={assignment.employee_id} value={assignment.employee_id}>
                      {getEmployeeName(assignment.employee_id)}
                    </option>
                  ))}
                </select>
                <select
                  value={taskForm.priority}
                  onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as Task['priority'] })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="low">Nízká priorita</option>
                  <option value="medium">Střední priorita</option>
                  <option value="high">Vysoká priorita</option>
                  <option value="urgent">Urgentní</option>
                </select>
                <input
                  type="number"
                  step="0.5"
                  placeholder="Odhadované hodiny"
                  value={taskForm.estimated_hours}
                  onChange={(e) => setTaskForm({ ...taskForm, estimated_hours: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <input
                  type="date"
                  placeholder="Deadline"
                  value={taskForm.deadline}
                  onChange={(e) => setTaskForm({ ...taskForm, deadline: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 bg-[#0a192f] text-white rounded-lg text-sm hover:bg-opacity-90">
                  {editingTask ? 'Uložit úkol' : 'Vytvořit úkol'}
                </button>
                <button type="button" onClick={resetTaskForm} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                  Zrušit
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {tasks.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">Zatím nebyly vytvořeny žádné úkoly</p>
            ) : (
              tasks.map((task) => (
                <div key={task.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{task.title}</h4>
                      {task.description && <p className="text-sm text-gray-600 mt-1">{task.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {task.status === 'completed' ? (
                        <button
                          onClick={() => handleUpdateTaskStatus(task.id, 'todo')}
                          className="text-gray-600 hover:bg-gray-100 p-1 rounded transition"
                          title="Znovu otevřít"
                        >
                          <PlayCircle className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUpdateTaskStatus(task.id, 'completed')}
                          className="text-green-600 hover:bg-green-50 p-1 rounded transition"
                          title="Označit jako hotové"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleEditTask(task)}
                        className="text-[#0a192f] hover:bg-gray-100 p-1 rounded transition"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="text-red-600 hover:bg-red-50 p-1 rounded transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`px-2 py-1 rounded-full ${getTaskStatusClasses(task.status)}`}>
                      {task.status === 'todo' ? 'K dokončení' : task.status === 'in_progress' ? 'Probíhá' : task.status === 'completed' ? 'Hotovo' : 'Zrušeno'}
                    </span>
                    <span className={`px-2 py-1 rounded-full ${getPriorityClasses(task.priority)}`}>
                      {task.priority === 'low' ? 'Nízká' : task.priority === 'medium' ? 'Střední' : task.priority === 'high' ? 'Vysoká' : 'Urgentní'}
                    </span>
                    {task.assigned_to && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full">
                        {getEmployeeName(task.assigned_to)}
                      </span>
                    )}
                    {task.deadline && (
                      <span className={`px-2 py-1 rounded-full flex items-center gap-1 ${
                        new Date(task.deadline) < new Date() && task.status !== 'completed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        <Clock className="w-3 h-3" />
                        {new Date(task.deadline).toLocaleDateString('cs-CZ')}
                      </span>
                    )}
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                      {task.estimated_hours}h / {task.actual_hours}h
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
