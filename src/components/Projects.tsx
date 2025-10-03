import { useState, useEffect } from 'react';
import { Plus, Calendar, TrendingUp, AlertCircle, CheckCircle, Clock, XCircle, Pause, Trash2, CreditCard as Edit, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Project, Budget } from '../types/database';
import ProjectDetails from './ProjectDetails';

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

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
  }, []);

  const loadData = async () => {
    try {
      const [projectsRes, budgetsRes] = await Promise.all([
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
        supabase.from('budgets').select('*').order('name')
      ]);

      if (projectsRes.error) throw projectsRes.error;
      if (budgetsRes.error) throw budgetsRes.error;

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

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const projectData = {
        ...formData,
        budget_id: formData.budget_id || null,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        user_id: user.id
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
        <h2 className="text-2xl font-bold text-[#0a192f]">Projekty</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-[#0a192f] text-white px-6 py-3 rounded-lg hover:bg-opacity-90 transition"
        >
          <Plus className="w-5 h-5" />
          <span>Nový projekt</span>
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-xl font-semibold text-[#0a192f] mb-4">
            {editingProject ? 'Upravit projekt' : 'Nový projekt'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Název projektu *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rozpočet
                </label>
                <select
                  value={formData.budget_id}
                  onChange={(e) => setFormData({ ...formData, budget_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                >
                  <option value="">-- Vyberte rozpočet --</option>
                  {budgets.map((budget) => (
                    <option key={budget.id} value={budget.id}>
                      {budget.name} - {budget.client_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Datum začátku
                </label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Datum konce
                </label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Celkový rozpočet
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.total_budget}
                  onChange={(e) => setFormData({ ...formData, total_budget: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vyčerpáno
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.spent_amount}
                  onChange={(e) => setFormData({ ...formData, spent_amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as Project['status'] })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                >
                  <option value="planning">Plánování</option>
                  <option value="active">Aktivní</option>
                  <option value="completed">Dokončeno</option>
                  <option value="on-hold">Pozastaveno</option>
                  <option value="cancelled">Zrušeno</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Popis
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Poznámky
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="px-6 py-2 bg-[#0a192f] text-white rounded-lg hover:bg-opacity-90 transition"
              >
                {editingProject ? 'Uložit' : 'Vytvořit projekt'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Zrušit
              </button>
            </div>
          </form>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <TrendingUp className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Zatím nemáte žádné projekty
          </h3>
          <p className="text-gray-600 mb-6">
            Vytvořte svůj první projekt a začněte plánovat
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="bg-[#0a192f] text-white px-6 py-3 rounded-lg hover:bg-opacity-90 transition"
          >
            Vytvořit projekt
          </button>
        </div>
      ) : (
        <div className="grid gap-6">
          {projects.map((project) => {
            const progress = calculateProgress(project);
            const remaining = project.total_budget - project.spent_amount;

            return (
              <div key={project.id} className="bg-white rounded-lg shadow hover:shadow-md transition p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-[#0a192f] mb-2">
                      {project.name}
                    </h3>
                    {project.description && (
                      <p className="text-gray-600 mb-3">{project.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(project.status)}`}>
                      {getStatusIcon(project.status)}
                      {getStatusText(project.status)}
                    </span>
                    <button
                      onClick={() => setSelectedProject(project)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      title="Spravovat tým a úkoly"
                    >
                      <Users className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleEdit(project)}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(project.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {project.start_date ? new Date(project.start_date).toLocaleDateString('cs-CZ') : 'N/A'}
                      {' → '}
                      {project.end_date ? new Date(project.end_date).toLocaleDateString('cs-CZ') : 'N/A'}
                    </span>
                  </div>

                  <div className="text-sm">
                    <span className="text-gray-600">Rozpočet: </span>
                    <span className="font-semibold text-[#0a192f]">
                      {project.total_budget.toLocaleString('cs-CZ')} Kč
                    </span>
                  </div>

                  <div className="text-sm">
                    <span className="text-gray-600">Vyčerpáno: </span>
                    <span className="font-semibold text-[#0a192f]">
                      {project.spent_amount.toLocaleString('cs-CZ')} Kč
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Průběh projektu</span>
                    <span className="font-medium text-[#0a192f]">{progress.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        progress >= 100 ? 'bg-red-500' : progress >= 75 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Zbývá:</span>
                    <span className={`font-medium ${remaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {remaining.toLocaleString('cs-CZ')} Kč
                    </span>
                  </div>
                </div>

                {project.notes && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
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
