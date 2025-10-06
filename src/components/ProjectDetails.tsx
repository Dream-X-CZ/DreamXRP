import { useState, useEffect } from 'react';
import { ArrowLeft, Users, Plus, CheckCircle, Clock, Trash2, CreditCard as Edit, PlayCircle, FileText, GitBranch, GitBranchPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Project, Employee, ProjectAssignment, Task } from '../types/database';

interface ProjectDetailsProps {
  project: Project;
  onBack: () => void;
  onUpdate: () => void;
}

export default function ProjectDetails({ project, onBack, onUpdate }: ProjectDetailsProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [parentProject, setParentProject] = useState<Project | null>(null);
  const [childProjects, setChildProjects] = useState<Project[]>([]);
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
  }, [project.id, project.parent_project_id]);

  const loadData = async () => {
    try {
      const parentProjectPromise = project.parent_project_id
        ? supabase
            .from('projects')
            .select('*')
            .eq('id', project.parent_project_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null });

      const childProjectsPromise = supabase
        .from('projects')
        .select('*')
        .eq('parent_project_id', project.id)
        .order('created_at', { ascending: true });

      const [employeesRes, assignmentsRes, tasksRes, parentRes, childRes] = await Promise.all([
        supabase.from('employees').select('*').order('first_name'),
        supabase.from('project_assignments').select('*').eq('project_id', project.id),
        supabase.from('tasks').select('*').eq('project_id', project.id).order('deadline', { ascending: true }),
        parentProjectPromise,
        childProjectsPromise
      ]);

      if (employeesRes.data) setEmployees(employeesRes.data);
      if (assignmentsRes.data) setAssignments(assignmentsRes.data);
      if (tasksRes.data) setTasks(tasksRes.data);
      if (parentRes.error) throw parentRes.error;
      if (childRes.error) throw childRes.error;
      setParentProject(parentRes.data ?? null);
      setChildProjects(childRes.data ?? []);
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

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'low': return 'bg-gray-100 text-gray-800';
      case 'medium': return 'bg-blue-100 text-blue-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'urgent': return 'bg-red-100 text-red-800';
    }
  };

  const getStatusColor = (status: Task['status']) => {
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
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-[#0a192f] transition"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Zpět na projekty</span>
        </button>

        <div className="flex gap-3">
          {!showRateForm ? (
            <>
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
                <span className="text-sm text-gray-600">Hodinová sazba:</span>
                <span className="font-semibold text-[#0a192f]">{clientHourlyRate} Kč/hod</span>
                <button
                  onClick={() => setShowRateForm(true)}
                  className="text-[#0a192f] hover:bg-gray-200 p-1 rounded transition"
                >
                  <Edit className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={handleGenerateBudget}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
              >
                <FileText className="w-5 h-5" />
                <span>Generovat rozpočet z úkolů</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                value={clientHourlyRate}
                onChange={(e) => setClientHourlyRate(parseFloat(e.target.value) || 0)}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Kč/hod"
              />
              <button
                onClick={handleUpdateHourlyRate}
                className="px-4 py-2 bg-[#0a192f] text-white rounded-lg hover:bg-opacity-90 transition"
              >
                Uložit
              </button>
              <button
                onClick={() => {
                  setShowRateForm(false);
                  setClientHourlyRate(project.client_hourly_rate || 0);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Zrušit
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-2xl font-bold text-[#0a192f] mb-2">{project.name}</h2>
        {project.description && <p className="text-gray-600 mb-4">{project.description}</p>}

        {(parentProject || childProjects.length > 0) && (
          <div className="mb-4 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 text-sm font-medium">
              {parentProject && (
                <span className="inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1 text-purple-700">
                  <GitBranch className="h-4 w-4" />
                  <span>Nadřazený projekt: {parentProject.name}</span>
                </span>
              )}
              {childProjects.length > 0 && (
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                  <GitBranchPlus className="h-4 w-4" />
                  <span>Podprojekty: {childProjects.length}</span>
                </span>
              )}
            </div>
            {childProjects.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                {childProjects.map((child) => (
                  <span
                    key={child.id}
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1"
                  >
                    <GitBranch className="h-3 w-3 text-emerald-600" />
                    <span className="font-medium text-emerald-700">{child.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <div className="text-sm text-gray-600">Celkem úkolů</div>
            <div className="text-2xl font-bold text-[#0a192f]">{tasks.length}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Dokončeno</div>
            <div className="text-2xl font-bold text-green-600">{completedTasks}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Odhadovaný čas</div>
            <div className="text-2xl font-bold text-[#0a192f]">{totalEstimated}h</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Skutečný čas</div>
            <div className="text-2xl font-bold text-blue-600">{totalActual}h</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
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

        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
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
                    <span className={`px-2 py-1 rounded-full ${getStatusColor(task.status)}`}>
                      {task.status === 'todo' ? 'K dokončení' : task.status === 'in_progress' ? 'Probíhá' : task.status === 'completed' ? 'Hotovo' : 'Zrušeno'}
                    </span>
                    <span className={`px-2 py-1 rounded-full ${getPriorityColor(task.priority)}`}>
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
