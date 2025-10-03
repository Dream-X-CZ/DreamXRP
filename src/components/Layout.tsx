import { ReactNode } from 'react';
import { LogOut, FileText, TrendingUp, DollarSign, Users, Briefcase, Home, Settings } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LayoutProps {
  children: ReactNode;
  currentView: 'dashboard' | 'budgets' | 'expenses' | 'analytics' | 'employees' | 'projects' | 'team';
  onViewChange: (view: 'dashboard' | 'budgets' | 'expenses' | 'analytics' | 'employees' | 'projects' | 'team') => void;
}

export default function Layout({ children, currentView, onViewChange }: LayoutProps) {
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-[#0a192f] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-bold">Správa rozpočtů</h1>

            <div className="flex items-center gap-4">
              <button
                onClick={() => onViewChange('dashboard')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                  currentView === 'dashboard' ? 'bg-white text-[#0a192f]' : 'hover:bg-white/10'
                }`}
              >
                <Home className="w-5 h-5" />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => onViewChange('budgets')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                  currentView === 'budgets' ? 'bg-white text-[#0a192f]' : 'hover:bg-white/10'
                }`}
              >
                <FileText className="w-5 h-5" />
                <span>Rozpočty</span>
              </button>

              <button
                onClick={() => onViewChange('expenses')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                  currentView === 'expenses' ? 'bg-white text-[#0a192f]' : 'hover:bg-white/10'
                }`}
              >
                <DollarSign className="w-5 h-5" />
                <span>Náklady</span>
              </button>

              <button
                onClick={() => onViewChange('analytics')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                  currentView === 'analytics' ? 'bg-white text-[#0a192f]' : 'hover:bg-white/10'
                }`}
              >
                <TrendingUp className="w-5 h-5" />
                <span>Analytika</span>
              </button>

              <button
                onClick={() => onViewChange('employees')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                  currentView === 'employees' ? 'bg-white text-[#0a192f]' : 'hover:bg-white/10'
                }`}
              >
                <Users className="w-5 h-5" />
                <span>Zaměstnanci</span>
              </button>

              <button
                onClick={() => onViewChange('projects')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                  currentView === 'projects' ? 'bg-white text-[#0a192f]' : 'hover:bg-white/10'
                }`}
              >
                <Briefcase className="w-5 h-5" />
                <span>Projekty</span>
              </button>

              <button
                onClick={() => onViewChange('team')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                  currentView === 'team' ? 'bg-white text-[#0a192f]' : 'hover:bg-white/10'
                }`}
              >
                <Settings className="w-5 h-5" />
                <span>Tým</span>
              </button>

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-white/10 transition"
              >
                <LogOut className="w-5 h-5" />
                <span>Odhlásit</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}