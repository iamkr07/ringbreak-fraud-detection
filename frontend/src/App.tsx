import { useCallback, useEffect, useRef, useState } from 'react';
import { StoreProvider } from '@/store/provider';
import { Sidebar, type ViewKey } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { HomePage } from '@/components/views/HomePage';
import { DemoView } from '@/components/views/DemoView';
import { CommandCenter } from '@/components/views/CommandCenter';
import { PayloadLab } from '@/components/views/PayloadLab';
import { InvestigationView } from '@/components/views/InvestigationView';
import { NetworkView } from '@/components/views/NetworkView';
import { IntelligenceView } from '@/components/views/IntelligenceView';
import { TraceExplorer } from '@/components/views/TraceExplorer';
import { ForensicReport } from '@/components/views/ForensicReport';
import { AgentsView } from '@/components/views/AgentsView';
import { RiskResponseView } from '@/components/views/RiskResponseView';
import { LoginPage } from '@/components/auth/LoginPage';
import { LockScreen } from '@/components/auth/LockScreen';
import { useStore } from '@/store/context';
import type { PayloadLabGroup } from '@/types';

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('ringbreak.auth') === 'true';
  });

  const [isLocked, setIsLocked] = useState<boolean>(() => {
    return sessionStorage.getItem('ringbreak.locked') === 'true';
  });

  const [view, setView] = useState<ViewKey>(() => {
    const saved = sessionStorage.getItem('ringbreak.active-view') as ViewKey | null;
    return saved && ['home', 'demo', 'command', 'payload', 'investigation', 'network', 'intelligence', 'agents', 'risk', 'trace', 'forensic'].includes(saved) ? saved : 'home';
  });

  const { error, clearError, mode, systemStatusLoading, investigation, loading, setPayloadLabGroup } = useStore();
  const pendingInvestigationViewRestore = useRef(
    ['investigation', 'network', 'intelligence', 'agents', 'risk', 'trace', 'forensic'].includes(view),
  );

  const handleLoginSuccess = useCallback(() => {
    sessionStorage.setItem('ringbreak.auth', 'true');
    sessionStorage.removeItem('ringbreak.locked');
    setIsAuthenticated(true);
    setIsLocked(false);
  }, []);

  const handleUnlock = useCallback(() => {
    sessionStorage.removeItem('ringbreak.locked');
    setIsLocked(false);
  }, []);

  const handleLockSession = useCallback(() => {
    sessionStorage.setItem('ringbreak.locked', 'true');
    setIsLocked(true);
  }, []);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem('ringbreak.auth');
    sessionStorage.removeItem('ringbreak.locked');
    setIsAuthenticated(false);
    setIsLocked(false);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        sessionStorage.setItem('ringbreak.locked', 'true');
        setIsLocked(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated]);

  const navigate = useCallback((nextView: ViewKey, payloadGroup?: PayloadLabGroup) => {
    if (nextView === 'payload' && payloadGroup !== undefined) {
      setPayloadLabGroup(payloadGroup);
    }
    setView(nextView);
    sessionStorage.setItem('ringbreak.active-view', nextView);
  }, [setPayloadLabGroup]);

  useEffect(() => {
    if (!pendingInvestigationViewRestore.current) return;
    if (systemStatusLoading) return;
    if (investigation) {
      pendingInvestigationViewRestore.current = false;
      return;
    }
    if (mode === 'LIVE' && (loading || sessionStorage.getItem('ringbreak.active-live-event'))) return;
    pendingInvestigationViewRestore.current = false;
    setView('home');
    sessionStorage.setItem('ringbreak.active-view', 'home');
  }, [investigation, loading, mode, systemStatusLoading]);

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const renderView = () => {
    switch (view) {
      case 'home': return <HomePage onNavigate={navigate} />;
      case 'demo': return <DemoView onNavigate={navigate} />;
      case 'command': return <CommandCenter onNavigate={navigate} />;
      case 'payload': return <PayloadLab onNavigate={navigate} />;
      case 'investigation': return <InvestigationView onNavigate={navigate} />;
      case 'network': return <NetworkView onNavigate={navigate} />;
      case 'intelligence': return <IntelligenceView onNavigate={navigate} />;
      case 'agents': return <AgentsView onNavigate={navigate} />;
      case 'risk': return <RiskResponseView onNavigate={navigate} />;
      case 'trace': return <TraceExplorer onNavigate={navigate} />;
      case 'forensic': return <ForensicReport onNavigate={navigate} />;
      default: return <HomePage onNavigate={navigate} />;
    }
  };

  return (
    <div className="relative flex h-screen overflow-hidden bg-ink-950 text-ink-200">
      {isLocked && <LockScreen onUnlock={handleUnlock} />}
      <Sidebar active={view} onSelect={navigate} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar active={view} onLockSession={handleLockSession} onLogout={handleLogout} />
        {error && (
          <div role="alert" className="flex items-center justify-between border-b border-risk-500/30 bg-risk-500/10 px-6 py-2 text-xs text-risk-700 font-medium">
            <span>LIVE API error: {error}</span>
            <button type="button" onClick={clearError} className="text-risk-800 hover:text-slate-900 font-semibold">Dismiss</button>
          </div>
        )}
        <main className="flex-1 overflow-y-auto bg-grid">
          <div className="mx-auto max-w-7xl px-6 py-6">
            {renderView()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}
