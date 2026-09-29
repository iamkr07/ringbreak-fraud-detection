import { useMemo } from 'react';
import {
  LayoutDashboard, FlaskConical, Search, Network, BrainCircuit,
  Route, Siren, ScrollText, Boxes, Users, Shield, Home, Play,
} from 'lucide-react';
import { useStore } from '@/store/context';
import type { LucideIcon } from 'lucide-react';

export type ViewKey =
  | 'home' | 'demo' | 'command' | 'payload' | 'investigation' | 'intelligence'
  | 'network' | 'agents' | 'risk' | 'trace' | 'forensic';

export interface NavItem {
  key: ViewKey;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'HOME', icon: Home },
  { key: 'demo', label: 'LIVE DEMO', icon: Play },
  { key: 'command', label: 'COMMAND CENTER', icon: LayoutDashboard },
  { key: 'payload', label: 'PAYLOAD LAB', icon: FlaskConical },
  { key: 'investigation', label: 'INVESTIGATION', icon: Search },
  { key: 'network', label: 'NETWORK', icon: Network },
  { key: 'intelligence', label: 'INTELLIGENCE', icon: BrainCircuit },
  { key: 'agents', label: 'AGENTS', icon: Users },
  { key: 'risk', label: 'RISK & RESPONSE', icon: Shield },
  { key: 'trace', label: 'TRACE EXPLORER', icon: Route },
  { key: 'forensic', label: 'FORENSIC REPORT', icon: ScrollText },
];

export function Sidebar({ active, onSelect }: { active: ViewKey; onSelect: (k: ViewKey) => void }) {
  const { systemStatus, systemStatusLoading, systemStatusError, investigation } = useStore();
  const activeMode = systemStatus?.mode ?? 'UNKNOWN';

  const statusLabel = useMemo(() => {
    if (!systemStatus) return systemStatusLoading ? 'CHECKING' : 'UNAVAILABLE';
    if (!systemStatus.backendReachable) return 'DEGRADED';
    return 'OPERATIONAL';
  }, [systemStatusLoading, systemStatus]);

  const statusColor = statusLabel === 'OPERATIONAL' ? 'text-emerald-700' : statusLabel === 'DEGRADED' ? 'text-amber-700' : 'text-red-700';
  const statusDot = statusLabel === 'OPERATIONAL' ? 'bg-emerald-500' : statusLabel === 'DEGRADED' ? 'bg-amber-500' : 'bg-red-500';

  return (
    <aside className="flex w-60 flex-shrink-0 flex-col border-r border-ink-800 bg-white shadow-sm">
      {/* Logo */}
      <button
        type="button"
        onClick={() => onSelect('home')}
        className="flex w-full items-center gap-3 border-b border-ink-800 px-5 py-5 text-left transition-colors hover:bg-slate-50"
      >
        <div className="relative flex h-9 w-9 items-center justify-center rounded-md border border-blue-200 bg-blue-50">
          <Boxes className="h-5 w-5 text-signal-600" />
        </div>
        <div>
          <div className="font-mono text-sm font-bold tracking-tightest text-slate-900">RING//BREAK</div>
          <div className="text-2xs font-semibold uppercase tracking-widest text-ink-600">Forensic Intel</div>
        </div>
      </button>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item, idx) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            const showSeparator = idx === 2; // after HOME + DEMO
            return (
              <li key={item.key}>
                {showSeparator && <div className="my-2 h-px bg-ink-800" />}
                <button
                  type="button"
                  onClick={() => onSelect(item.key)}
                  className={`group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider transition-colors ${
                    isActive
                      ? 'border border-blue-200 bg-blue-50 text-blue-700 shadow-xs'
                      : 'border border-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-800'}`} />
                  <span className="truncate">{item.label}</span>
                  {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-600" />}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer status */}
      <div className="border-t border-ink-800 px-4 py-4 space-y-3 bg-slate-50/50">
        <div className="rounded-md border border-ink-800 bg-white p-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-widest text-ink-600">System Status</span>
            <span className={`h-1.5 w-1.5 rounded-full ${statusDot} ${statusLabel === 'OPERATIONAL' ? '' : 'animate-pulse-soft'}`} />
          </div>
          <div className={`mt-1 font-mono text-xs font-bold ${statusColor}`}>{statusLabel}</div>
          {systemStatusError && <div className="mt-1 text-2xs text-red-600">{systemStatusError}</div>}
          {systemStatus && (
            <div className="mt-1 text-2xs font-medium text-ink-600">v{systemStatus.version} · {systemStatus.uptimeLabel}</div>
          )}
        </div>

        <div className="rounded-md border border-ink-800 bg-white p-3 shadow-xs">
          <div className="text-2xs font-semibold uppercase tracking-widest text-ink-600">Backend Runtime</div>
          <div className="mt-1 flex items-center gap-2">
            <Siren className={`h-3.5 w-3.5 ${activeMode === 'LIVE' ? 'text-emerald-600' : 'text-amber-600'}`} />
            <span className={`font-mono text-xs font-bold ${activeMode === 'LIVE' ? 'text-emerald-700' : 'text-amber-700'}`}>{activeMode}</span>
          </div>
          {investigation && (
            <div className="mt-1 truncate text-2xs font-mono text-slate-700">INV: {investigation.investigationId}</div>
          )}
        </div>
      </div>
    </aside>
  );
}
