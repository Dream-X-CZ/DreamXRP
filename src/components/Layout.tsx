import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  LogOut,
  FileText,
  TrendingUp,
  DollarSign,
  Users,
  Briefcase,
  Home,
  Settings,
  CheckSquare,
  Calendar as CalendarIcon,
  UserCircle,
  UserCog,
  ChevronDown
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';

type ViewName =
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

interface OrganizationOption {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

interface LayoutProps {
  children: ReactNode;
  currentView: ViewName;
  onViewChange: (view: ViewName) => void;
  activeOrganizationName?: string | null;
  activeOrganizationId?: string | null;
  organizations?: OrganizationOption[];
  onSelectOrganization?: (id: string) => void;
  pendingInvitationCount?: number;
}

export default function Layout({
  children,
  currentView,
  onViewChange,
  activeOrganizationName,
  activeOrganizationId,
  organizations,
  onSelectOrganization,
  pendingInvitationCount
}: LayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [currentView]);

  const roleLabels: Record<OrganizationOption['role'], string> = {
    owner: 'Vlastník',
    admin: 'Správce',
    member: 'Člen',
    viewer: 'Pozorovatel'
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex min-h-screen">
        <aside className="w-64 bg-[#0a192f] text-white shadow-lg flex flex-col">
          <div className="px-6 py-6 border-b border-white/10">
            <h1 className="text-2xl font-bold">Správa rozpočtů</h1>
            <p className="text-white/60 text-sm mt-1">Řízení projektů a nákladů</p>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-1">
            <SidebarButton
              icon={Home}
              label="Dashboard"
              isActive={currentView === 'dashboard'}
              onClick={() => onViewChange('dashboard')}
            />
            <SidebarButton
              icon={FileText}
              label="Rozpočty"
              isActive={currentView === 'budgets'}
              onClick={() => onViewChange('budgets')}
            />
            <SidebarButton
              icon={DollarSign}
              label="Náklady"
              isActive={currentView === 'expenses'}
              onClick={() => onViewChange('expenses')}
            />
            <SidebarButton
              icon={TrendingUp}
              label="Analytika"
              isActive={currentView === 'analytics'}
              onClick={() => onViewChange('analytics')}
            />
            <SidebarButton
              icon={Users}
              label="Zaměstnanci"
              isActive={currentView === 'employees'}
              onClick={() => onViewChange('employees')}
            />
            <SidebarButton
              icon={Briefcase}
              label="Projekty"
              isActive={currentView === 'projects'}
              onClick={() => onViewChange('projects')}
            />
            <SidebarButton
              icon={CheckSquare}
              label="Úkoly"
              isActive={currentView === 'tasks'}
              onClick={() => onViewChange('tasks')}
            />
            <SidebarButton
              icon={CalendarIcon}
              label="Kalendář"
              isActive={currentView === 'calendar'}
              onClick={() => onViewChange('calendar')}
            />
            <SidebarButton
              icon={Settings}
              label="Tým"
              isActive={currentView === 'team'}
              onClick={() => onViewChange('team')}
            />
          </nav>

          <div className="px-4 py-6 border-t border-white/10">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-white/10 hover:bg-white/20 transition"
            >
              <LogOut className="w-5 h-5" />
              <span>Odhlásit</span>
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col">
          <header className="px-6 lg:px-10 py-4 border-b border-gray-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            <div className="max-w-6xl mx-auto flex items-center justify-end">
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(prev => !prev)}
                  className={`flex items-center gap-3 rounded-full px-4 py-2 text-sm font-medium transition-colors border ${
                    menuOpen || currentView === 'profile' || currentView === 'profile-settings'
                      ? 'bg-[#0a192f] text-white shadow border-transparent'
                      : 'bg-white text-[#0a192f] border-[#0a192f]/10 hover:border-[#0a192f]/30'
                  }`}
                >
                  <UserCircle className="h-5 w-5" />
                  <div className="flex flex-col text-left">
                    <span className="text-xs uppercase tracking-wide">
                      {pendingInvitationCount && pendingInvitationCount > 0 ? 'Pozvánka čeká' : 'Můj profil'}
                    </span>
                    <span className="text-sm font-semibold">
                      {activeOrganizationName || 'Bez týmu'}
                    </span>
                  </div>
                  {pendingInvitationCount && pendingInvitationCount > 0 && (
                    <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-white/90 px-2 text-xs font-semibold text-[#0a192f]">
                      {pendingInvitationCount}
                    </span>
                  )}
                  <ChevronDown className={`h-4 w-4 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 z-50 mt-3 w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
                    <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Navigace
                    </div>
                    <button
                      onClick={() => {
                        onViewChange('profile');
                        setMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-gray-50 ${
                        currentView === 'profile' ? 'text-[#0a192f]' : 'text-gray-700'
                      }`}
                    >
                      <UserCircle className="h-4 w-4" />
                      Profil
                    </button>
                    <button
                      onClick={() => {
                        onViewChange('profile-settings');
                        setMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-gray-50 ${
                        currentView === 'profile-settings' ? 'text-[#0a192f]' : 'text-gray-700'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <UserCog className="h-4 w-4" />
                        Nastavení profilu
                      </span>
                      {pendingInvitationCount && pendingInvitationCount > 0 && (
                        <span className="inline-flex items-center justify-center rounded-full bg-[#0a192f] px-2 py-0.5 text-xs font-semibold text-white">
                          {pendingInvitationCount}
                        </span>
                      )}
                    </button>

                    <div className="my-2 border-t border-gray-100" />
                    <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Moje týmy
                    </div>

                    {organizations && organizations.length > 0 ? (
                      organizations.map(organization => {
                        const isActive = organization.id === activeOrganizationId;
                        return (
                          <button
                            key={organization.id}
                            onClick={() => {
                              onSelectOrganization?.(organization.id);
                              onViewChange('team');
                              setMenuOpen(false);
                            }}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition hover:bg-gray-50 ${
                              isActive ? 'text-[#0a192f] font-semibold' : 'text-gray-700'
                            }`}
                          >
                            <span>{organization.name}</span>
                            <span className="text-xs text-gray-400">
                              {roleLabels[organization.role]}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <p className="px-3 py-2 text-sm text-gray-500">Zatím nemáte žádné týmy.</p>
                    )}
                  </div>
                )}
              </div>

            </div>
          </header>
          <div className="flex-1 px-6 lg:px-10 py-8">
            <div className="max-w-6xl mx-auto">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}

interface SidebarButtonProps {
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function SidebarButton({ icon: Icon, label, isActive, onClick }: SidebarButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition text-left ${
        isActive ? 'bg-white text-[#0a192f] shadow-lg' : 'hover:bg-white/10'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium">{label}</span>
    </button>
  );
}