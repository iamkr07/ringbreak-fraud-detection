import type { ReactNode } from 'react';
import { riskBg, riskColor } from '@/lib/format';
import type { RiskLevel, StageStatus } from '@/types';
import { stageStatusBg, stageStatusColor, stageStatusDot } from '@/lib/format';

export function Panel({
  title, subtitle, actions, children, className = '', scroll = false,
}: {
  title?: string; subtitle?: string; actions?: ReactNode; children: ReactNode; className?: string; scroll?: boolean;
}) {
  return (
    <section className={`rounded-lg border border-ink-800 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-ink-800 px-4 py-3 bg-slate-50/50 rounded-t-lg">
          <div>
            {title && <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-500">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-600">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`p-4 ${scroll ? 'overflow-auto' : ''}`}>{children}</div>
    </section>
  );
}

export function StatTile({
  label, value, sub, accent,
}: { label: string; value: ReactNode; sub?: string; accent?: 'signal' | 'risk' | 'warn' | 'safe' | 'none' }) {
  const accentColor =
    accent === 'risk' ? 'text-risk-600' :
    accent === 'warn' ? 'text-warn-600' :
    accent === 'safe' ? 'text-safe-600' :
    accent === 'signal' ? 'text-signal-600' : 'text-slate-900';
  return (
    <div className="rounded-lg border border-ink-800 bg-white p-4 shadow-sm">
      <div className="text-2xs font-semibold uppercase tracking-widest text-ink-600">{label}</div>
      <div className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${accentColor}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-600">{sub}</div>}
    </div>
  );
}

export function Badge({
  children, level,
}: { children: ReactNode; level?: RiskLevel }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider ${riskBg(level)}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status, label }: { status: StageStatus; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider ${stageStatusBg(status)} ${stageStatusColor(status)}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${stageStatusDot(status)}`} />
      {label ?? status}
    </span>
  );
}

export function RiskBadge({ level, score }: { level: RiskLevel; score?: number }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider ${riskBg(level)} ${riskColor(level)}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${level === 'CRITICAL' || level === 'HIGH' ? 'bg-risk-500' : level === 'MEDIUM' ? 'bg-warn-500' : 'bg-safe-500'}`} />
      {level}{score != null && ` · ${score}`}
    </span>
  );
}

export function Divider({ label }: { label?: string }) {
  if (!label) return <div className="h-px bg-ink-800" />;
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-ink-800" />
      <span className="text-2xs font-semibold uppercase tracking-widest text-ink-600">{label}</span>
      <div className="h-px flex-1 bg-ink-800" />
    </div>
  );
}

export function EmptyState({
  icon, title, description, action,
}: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-ink-750 bg-slate-50/70 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-ink-600">{icon}</div>}
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-xs text-ink-600">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function KeyVal({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-xs text-ink-600">{label}</dt>
      <dd className={`text-xs ${mono ? 'font-mono' : ''} font-medium text-slate-800`}>{value}</dd>
    </div>
  );
}
