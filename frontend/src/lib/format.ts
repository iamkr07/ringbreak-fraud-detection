import type { RiskLevel, StageStatus } from '@/types';

export function riskColor(level: RiskLevel | undefined): string {
  switch (level) {
    case 'CRITICAL': return 'text-risk-600';
    case 'HIGH': return 'text-risk-600';
    case 'MEDIUM': return 'text-warn-600';
    case 'LOW': return 'text-safe-600';
    default: return 'text-ink-600';
  }
}

export function riskBg(level: RiskLevel | undefined): string {
  switch (level) {
    case 'CRITICAL': return 'bg-risk-50 border-risk-200 text-risk-700 font-semibold';
    case 'HIGH': return 'bg-red-50 border-red-200 text-red-700 font-semibold';
    case 'MEDIUM': return 'bg-amber-50 border-amber-200 text-amber-800 font-semibold';
    case 'LOW': return 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold';
    default: return 'bg-slate-100 border-slate-200 text-slate-700 font-semibold';
  }
}

export function riskGlow(level: RiskLevel | undefined): string {
  switch (level) {
    case 'CRITICAL': return 'shadow-glow-risk';
    case 'HIGH': return 'shadow-glow-risk';
    case 'MEDIUM': return 'shadow-glow-warn';
    case 'LOW': return 'shadow-glow-safe';
    default: return '';
  }
}

export function stageStatusColor(status: StageStatus): string {
  switch (status) {
    case 'complete': return 'text-safe-600';
    case 'running': return 'text-signal-600';
    case 'warning': return 'text-warn-600';
    case 'error': return 'text-risk-600';
    case 'pending': return 'text-ink-600';
    case 'skipped': return 'text-ink-600';
    default: return 'text-ink-600';
  }
}

export function stageStatusBg(status: StageStatus): string {
  switch (status) {
    case 'complete': return 'bg-emerald-50 border-emerald-200';
    case 'running': return 'bg-blue-50 border-blue-200';
    case 'warning': return 'bg-amber-50 border-amber-200';
    case 'error': return 'bg-red-50 border-red-200';
    case 'pending': return 'bg-slate-100 border-slate-200';
    case 'skipped': return 'bg-slate-100 border-slate-200';
    default: return 'bg-slate-100 border-slate-200';
  }
}

export function stageStatusDot(status: StageStatus): string {
  switch (status) {
    case 'complete': return 'bg-safe-500';
    case 'running': return 'bg-signal-500 animate-pulse-soft';
    case 'warning': return 'bg-warn-500';
    case 'error': return 'bg-risk-500';
    case 'pending': return 'bg-slate-400';
    case 'skipped': return 'bg-slate-400';
    default: return 'bg-slate-400';
  }
}

export function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function formatPercentage(value: number | undefined): string {
  if (typeof value !== 'number') return 'N/A — not available for this investigation';
  const percentage = Math.abs(value) <= 1 ? value * 100 : value;
  const precision = percentage > 0 && percentage < 0.01 ? 4 : 2;
  return `${Number(percentage.toFixed(precision))}%`;
}

export function shortId(id: string, prefix = 8): string {
  if (id.length <= prefix + 4) return id;
  return `${id.slice(0, prefix)}…`;
}
