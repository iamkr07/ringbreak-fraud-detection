import { Activity, ShieldAlert, Radio, Boxes, User, Lock, LogOut } from 'lucide-react';
import { useStore } from '@/store/context';
import type { ViewKey } from './Sidebar';
import { NAV_ITEMS } from './Sidebar';

export function TopBar({ active, onLockSession, onLogout }: { active: ViewKey; onLockSession?: () => void; onLogout?: () => void }) {
  const { investigation, systemStatus, systemStatusLoading } = useStore();
  const activeMode = systemStatus?.mode ?? 'UNKNOWN';
  const statusLabel = systemStatus?.backendReachable
    ? systemStatus.uptimeLabel
    : systemStatus
      ? 'DEGRADED'
      : systemStatusLoading
        ? 'CHECKING'
        : 'UNAVAILABLE';
  const navItem = NAV_ITEMS.find((n) => n.key === active);

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-ink-800 bg-white/95 px-6 backdrop-blur-sm shadow-sm">
      <div className="flex items-center gap-4">
        {/* Branding */}
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-signal-600" />
          <span className="font-mono text-xs font-bold tracking-tightest text-slate-900">RING//BREAK</span>
        </div>
        <span className="h-4 w-px bg-ink-800" />
        {/* Current view */}
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-700">{navItem?.label ?? 'VIEW'}</span>
        {/* Investigation context */}
        {investigation && (
          <>
            <span className="hidden h-4 w-px bg-ink-800 sm:block" />
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-2xs font-semibold uppercase tracking-widest text-slate-500">Event</span>
              <span className="font-mono text-xs text-slate-800 font-semibold">{investigation.eventId}</span>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <span className="h-4 w-px bg-ink-800" />
              <span className="text-2xs font-semibold uppercase tracking-widest text-slate-500">Trace</span>
              <span className="font-mono text-xs text-slate-800 font-semibold">{investigation.traceId}</span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* System status */}
        <div className="hidden items-center gap-2 lg:flex">
          <Radio className={`h-3.5 w-3.5 ${systemStatus?.backendReachable ? 'text-emerald-600' : 'text-red-600'}`} />
          <span className="text-2xs font-semibold uppercase tracking-widest text-slate-500">Status</span>
          <span className={`font-mono text-xs font-semibold ${systemStatus?.backendReachable ? 'text-emerald-600' : 'text-red-600'}`}>{statusLabel}</span>
        </div>

        {/* Simulation badge */}
        <div className="flex items-center gap-2 rounded border border-amber-300 bg-amber-50 px-2.5 py-1">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-2xs font-bold uppercase tracking-widest text-amber-800">{activeMode === 'LIVE' ? 'LIVE' : activeMode === 'DEMO' ? 'DEMO ENV' : 'UNKNOWN'}</span>
        </div>

        {/* Investigator session & Security actions */}
        <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-100 px-2.5 py-1 text-2xs font-semibold text-slate-700">
          <User className="h-3.5 w-3.5 text-blue-700" />
          <span className="hidden font-mono sm:inline">investigator</span>
          {onLockSession && (
            <button
              type="button"
              onClick={onLockSession}
              title="Lock Session (Tab Switch Lock)"
              className="ml-1 rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
            >
              <Lock className="h-3.5 w-3.5" />
            </button>
          )}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title="Sign Out"
              className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Pulse activity */}
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-signal-600 animate-pulse-soft" />
        </div>
      </div>
    </header>
  );
}
