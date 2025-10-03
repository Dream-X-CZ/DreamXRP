import { ReactNode } from 'react';
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
  Calendar as CalendarIcon
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
  | 'team';

interface LayoutProps {
  children: ReactNode;
  currentView: ViewName;
  onViewChange: (view: ViewName) => void;
}

export default function Layout({ children, currentView, onViewChange }: LayoutProps) {
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
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

        <main className="flex-1 px-6 lg:px-10 py-8">
          <div className="max-w-6xl mx-auto">{children}</div>
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