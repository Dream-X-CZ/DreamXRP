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
import PendingInvitations from './components/PendingInvitations';
import Calendar from './components/Calendar';
import Profile from './components/Profile';
import ProfileSettings from './components/ProfileSettings';
import { InvitationWithOrganization } from './types/database';

type View =
  | 'dashboard'
  | 'budgets'
  | 'expenses'
  | 'analytics'
  | 'employees'
  | 'projects'
  | 'tasks'
  | 'calendar'
  | 'team'
  | 'profile'
  | 'profile-settings';

function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [isCreatingBudget, setIsCreatingBudget] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<InvitationWithOrganization[]>([]);
  const [processingInviteId, setProcessingInviteId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      loadPendingInvitations(session.user);
    } else {
      setPendingInvitations([]);
    }
  }, [session]);

  const loadPendingInvitations = async (user: any) => {
    if (!user?.email) {
      if (user?.id) {
        await initializeDefaultCategories(user.id);
      }
      return;
    }

    try {
      const email = (user.email as string).toLowerCase();
      const { data, error } = await supabase
        .from('invitations')
        .select('*, organization:organizations(*)')
        .ilike('email', email)
        .eq('status', 'pending');

      if (error) throw error;

      const invitations = (data as InvitationWithOrganization[] | null) ?? [];
      setPendingInvitations(invitations);

      if (invitations.length === 0) {
        await initializeDefaultCategories(user.id);
      }
    } catch (error) {
      console.error('Error loading invitations:', error);
      await initializeDefaultCategories(user.id);
    }
  };

  const initializeDefaultCategories = async (userId: string) => {
    const { data: memberships, error: membershipError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId);

    if (membershipError) {
      console.error('Error checking organization memberships:', membershipError);
    }

    if (!memberships || memberships.length === 0) {
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

  const handleAcceptInvitation = async (invitationId: string) => {
    if (!session?.user) return;

    const invitation = pendingInvitations.find(inv => inv.id === invitationId);
    if (!invitation) return;

    try {
      setProcessingInviteId(invitationId);

      await supabase.from('organization_members').insert({
        organization_id: invitation.organization_id,
        user_id: session.user.id,
        role: invitation.role
      });

      await supabase
        .from('invitations')
        .update({ status: 'accepted' })
        .eq('id', invitationId);

      const remainingInvites = pendingInvitations.filter(inv => inv.id !== invitationId);
      setPendingInvitations(remainingInvites);

      if (remainingInvites.length === 0) {
        await initializeDefaultCategories(session.user.id);
      }
    } catch (error) {
      console.error('Error accepting invitation:', error);
      alert('Nepodařilo se přijmout pozvánku. Zkuste to prosím znovu.');
    } finally {
      setProcessingInviteId(null);
    }
  };

  const handleDeclineInvitation = async (invitationId: string) => {
    if (!session?.user) return;

    try {
      setProcessingInviteId(invitationId);

      await supabase
        .from('invitations')
        .update({ status: 'declined' })
        .eq('id', invitationId);

      const remainingInvites = pendingInvitations.filter(inv => inv.id !== invitationId);
      setPendingInvitations(remainingInvites);

      if (remainingInvites.length === 0) {
        await initializeDefaultCategories(session.user.id);
      }
    } catch (error) {
      console.error('Error declining invitation:', error);
      alert('Nepodařilo se odmítnout pozvánku. Zkuste to prosím znovu.');
    } finally {
      setProcessingInviteId(null);
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

  if (pendingInvitations.length > 0) {
    return (
      <PendingInvitations
        invitations={pendingInvitations}
        onAccept={handleAcceptInvitation}
        onDecline={handleDeclineInvitation}
        processingId={processingInviteId}
      />
    );
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

      {currentView === 'calendar' && <Calendar />}

      {currentView === 'team' && <TeamSettings />}

      {currentView === 'profile' && <Profile />}

      {currentView === 'profile-settings' && <ProfileSettings />}
    </Layout>
  );
}

export default App;