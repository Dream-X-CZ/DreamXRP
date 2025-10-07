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
import Calendar from './components/Calendar';
import Profile from './components/Profile';
import ProfileSettings from './components/ProfileSettings';
import {
  InvitationWithOrganization,
  OrganizationMember,
  Organization
} from './types/database';
import {
  getStoredActiveOrganizationId,
  setStoredActiveOrganizationId
} from './lib/organization';

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
  const [memberships, setMemberships] = useState<(OrganizationMember & { organization: Organization | null })[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null);
  const [isBudgetEditorWindow, setIsBudgetEditorWindow] = useState(false);
  const [budgetListRefreshSignal, setBudgetListRefreshSignal] = useState<number>(0);

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
      loadMemberships(session.user.id);
    } else {
      setPendingInvitations([]);
      setMemberships([]);
      setActiveOrganizationId(null);
    }
  }, [session]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'budget-editor') {
      setIsBudgetEditorWindow(true);
      setCurrentView('budgets');
      setIsCreatingBudget(true);
      const budgetParam = params.get('budgetId');
      setEditingBudgetId(budgetParam || null);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === 'budget:saved') {
        setBudgetListRefreshSignal(Date.now());
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

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

  const loadMemberships = async (userId: string, preferredOrganizationId?: string | null) => {
    try {
      const { data, error } = await supabase
        .from('organization_members')
        .select('*, organization:organizations(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const membershipList = (data as (OrganizationMember & { organization: Organization | null })[] | null) ?? [];
      setMemberships(membershipList);

      const membershipIds = new Set(membershipList.map(membership => membership.organization_id));

      let nextActiveId = preferredOrganizationId || activeOrganizationId || getStoredActiveOrganizationId();

      if (!nextActiveId || !membershipIds.has(nextActiveId)) {
        nextActiveId = membershipList[0]?.organization_id ?? null;
      }

      setActiveOrganizationId(nextActiveId ?? null);
      setStoredActiveOrganizationId(nextActiveId ?? null);
    } catch (error) {
      console.error('Error loading organization memberships:', error);
    }
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    if (!session?.user) return;

    const invitation = pendingInvitations.find(inv => inv.id === invitationId);
    if (!invitation) return;

    try {
      setProcessingInviteId(invitationId);

      const { error: insertError } = await supabase.from('organization_members').insert({
        organization_id: invitation.organization_id,
        user_id: session.user.id,
        role: invitation.role
      });

      if (insertError && insertError.code !== '23505') {
        throw insertError;
      }

      const { error: updateError } = await supabase
        .from('invitations')
        .update({ status: 'accepted' })
        .eq('id', invitationId);

      if (updateError) {
        throw updateError;
      }

      const remainingInvites = pendingInvitations.filter(inv => inv.id !== invitationId);
      setPendingInvitations(remainingInvites);

      await loadMemberships(session.user.id, invitation.organization_id);

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

      const { error: updateError } = await supabase
        .from('invitations')
        .update({ status: 'declined' })
        .eq('id', invitationId);

      if (updateError) {
        throw updateError;
      }

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

  const handleSelectOrganization = (organizationId: string) => {
    setActiveOrganizationId(organizationId);
    setStoredActiveOrganizationId(organizationId);
  };

  const handleOrganizationUpdated = (updatedOrganization: Organization) => {
    setMemberships(prev =>
      prev.map(membership =>
        membership.organization_id === updatedOrganization.id
          ? {
              ...membership,
              organization: membership.organization
                ? { ...membership.organization, ...updatedOrganization }
                : updatedOrganization
            }
          : membership
      )
    );
  };


  const openBudgetEditorWindow = (budgetId?: string | null) => {
    if (typeof window === 'undefined') {
      return false;
    }

    const url = new URL(window.location.href);
    url.searchParams.set('view', 'budget-editor');

    if (budgetId) {
      url.searchParams.set('budgetId', budgetId);
    } else {
      url.searchParams.delete('budgetId');
    }

    const editorWindow = window.open(
      url.toString(),
      '_blank',
      'width=1280,height=800,resizable=yes,scrollbars=yes'
    );

    if (editorWindow) {
      editorWindow.focus();
      return true;
    }

    return false;
  };

  const handleCreateBudget = () => {
    setEditingBudgetId(null);
    const opened = openBudgetEditorWindow(null);

    if (!opened) {
      setCurrentView('budgets');
      setIsCreatingBudget(true);
    }
  };

  const handleEditBudget = (budgetId: string) => {
    setEditingBudgetId(budgetId);
    const opened = openBudgetEditorWindow(budgetId);

    if (!opened) {
      setCurrentView('budgets');
      setIsCreatingBudget(true);
    }
  };

  const handleBackToBudgets = () => {
    if (isBudgetEditorWindow && typeof window !== 'undefined' && window.opener) {
      window.close();
      return;
    }

    setIsCreatingBudget(false);
    setEditingBudgetId(null);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('view');
      url.searchParams.delete('budgetId');
      window.history.replaceState({}, '', url.toString());
    }
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
    <Layout
      currentView={currentView}
      onViewChange={setCurrentView}
      activeOrganizationName={
        memberships.find(member => member.organization_id === activeOrganizationId)?.organization?.name ?? null
      }
      organizations={memberships.map(member => ({
        id: member.organization_id,
        name: member.organization?.name ?? 'Neznámý tým',
        role: member.role
      }))}
      activeOrganizationId={activeOrganizationId}
      onSelectOrganization={handleSelectOrganization}
      pendingInvitationCount={pendingInvitations.length}
    >
      {currentView === 'dashboard' && (
        <Dashboard key={`dashboard-${activeOrganizationId ?? 'none'}`} onNavigate={handleDashboardNavigate} />
      )}

      {currentView === 'budgets' && !isCreatingBudget && (
        <BudgetList
          key={`budget-list-${activeOrganizationId ?? 'none'}`}
          onCreateNew={handleCreateBudget}
          onEditBudget={handleEditBudget}
          refreshSignal={budgetListRefreshSignal}
        />
      )}

      {currentView === 'budgets' && isCreatingBudget && (
        <BudgetEditor
          key={`budget-editor-${activeOrganizationId ?? 'none'}`}
          budgetId={editingBudgetId}
          onBack={handleBackToBudgets}
        />
      )}

      {currentView === 'expenses' && <ExpensesList key={`expenses-${activeOrganizationId ?? 'none'}`} />}

      {currentView === 'analytics' && <Analytics key={`analytics-${activeOrganizationId ?? 'none'}`} />}

      {currentView === 'employees' && <Employees key={`employees-${activeOrganizationId ?? 'none'}`} />}

      {currentView === 'projects' && (
        <Projects key={`projects-${activeOrganizationId ?? 'none'}`} activeOrganizationId={activeOrganizationId} />
      )}

      {currentView === 'tasks' && (
        <Tasks key={`tasks-${activeOrganizationId ?? 'none'}`} activeOrganizationId={activeOrganizationId} />
      )}

      {currentView === 'calendar' && (
        <Calendar key={`calendar-${activeOrganizationId ?? 'none'}`} activeOrganizationId={activeOrganizationId} />
      )}

      {currentView === 'team' && (
        <TeamSettings
          key={`team-${activeOrganizationId ?? 'none'}`}
          activeOrganizationId={activeOrganizationId}
          onOrganizationUpdated={handleOrganizationUpdated}
        />

      )}

      {currentView === 'profile' && <Profile key={`profile-${activeOrganizationId ?? 'none'}`} />}

      {currentView === 'profile-settings' && (
        <ProfileSettings
          key={`profile-settings-${activeOrganizationId ?? 'none'}`}
          pendingInvitations={pendingInvitations}
          onAcceptInvitation={handleAcceptInvitation}
          onDeclineInvitation={handleDeclineInvitation}
          processingInvitationId={processingInviteId}
        />
      )}
    </Layout>
  );
}

export default App;