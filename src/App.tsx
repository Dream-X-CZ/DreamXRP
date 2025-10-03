import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import AuthForm from './components/AuthForm';
import Layout from './components/Layout';
import BudgetList from './components/BudgetList';
import BudgetEditor from './components/BudgetEditor';
import ExpensesList from './components/ExpensesList';
import Analytics from './components/Analytics';
import Employees from './components/Employees';
import Projects from './components/Projects';
import Dashboard from './components/Dashboard';
import TeamSettings from './components/TeamSettings';
import Tasks from './components/Tasks';

type View =
  | 'dashboard'
  | 'budgets'
  | 'expenses'
  | 'analytics'
  | 'employees'
  | 'projects'
  | 'tasks'
  | 'team';

function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [isCreatingBudget, setIsCreatingBudget] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        initializeDefaultCategories(session.user.id);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        initializeDefaultCategories(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const initializeDefaultCategories = async (userId: string) => {
    const { data: memberData } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!memberData) {
      const { data: newOrg, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: 'Moje organizace', owner_id: userId })
        .select()
        .single();

      if (!orgError && newOrg) {
        await supabase.from('organization_members').insert({
          organization_id: newOrg.id,
          user_id: userId,
          role: 'owner'
        });
      }
    }

    const { data: existingCategories } = await supabase
      .from('categories')
      .select('id')
      .limit(1);

    if (!existingCategories || existingCategories.length === 0) {
      const defaultCategories = [
        'Materiál',
        'Práce',
        'Doprava',
        'Nástroje',
        'Ostatní'
      ];

      await supabase.from('categories').insert(
        defaultCategories.map(name => ({ name, user_id: userId }))
      );
    }
  };

  const handleCreateBudget = () => {
    setIsCreatingBudget(true);
    setEditingBudgetId(null);
  };

  const handleEditBudget = (budgetId: string) => {
    setEditingBudgetId(budgetId);
    setIsCreatingBudget(true);
  };

  const handleBackToBudgets = () => {
    setIsCreatingBudget(false);
    setEditingBudgetId(null);
  };

  const handleDashboardNavigate = (view: string, action?: string) => {
    setCurrentView(view as View);
    if (view === 'budgets' && action === 'create') {
      handleCreateBudget();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Načítání...</div>
      </div>
    );
  }

  if (!session) {
    return <AuthForm onSuccess={() => setSession(true)} />;
  }

  return (
    <Layout currentView={currentView} onViewChange={setCurrentView}>
      {currentView === 'dashboard' && <Dashboard onNavigate={handleDashboardNavigate} />}

      {currentView === 'budgets' && !isCreatingBudget && (
        <BudgetList onCreateNew={handleCreateBudget} onEditBudget={handleEditBudget} />
      )}

      {currentView === 'budgets' && isCreatingBudget && (
        <BudgetEditor budgetId={editingBudgetId} onBack={handleBackToBudgets} />
      )}

      {currentView === 'expenses' && <ExpensesList />}

      {currentView === 'analytics' && <Analytics />}

      {currentView === 'employees' && <Employees />}

      {currentView === 'projects' && <Projects />}

      {currentView === 'tasks' && <Tasks />}

      {currentView === 'team' && <TeamSettings />}
    </Layout>
  );
}

export default App;