import { useMemo } from 'react';
import {
  Layers, TrendingUp, Clock, CheckCircle2, AlertCircle, ArrowRight,
} from 'lucide-react';
import { useStore } from '@/store/context';
import { Panel, StatTile, EmptyState } from '@/components/ui/Primitives';
import { formatAmount, formatNumber } from '@/lib/format';
import type { ActivityEntry, Evidence } from '@/types';
import type { ViewKey } from '@/components/layout/Sidebar';

const SEVERITY_COLOR = {
  info: 'text-blue-700 bg-blue-50 border-blue-200',
  warning: 'text-amber-800 bg-amber-50 border-amber-200',
  critical: 'text-red-700 bg-red-50 border-red-200',
  success: 'text-emerald-800 bg-emerald-50 border-emerald-200',
} as const;

function evidenceToActivity(e: Evidence): ActivityEntry {
  const sev = e.strength >= 80 ? 'critical' : e.strength >= 60 ? 'warning' : 'info';
  return {
    id: e.id,
    time: e.timestamp,
    label: e.label,
    detail: e.description,
    severity: sev,
  };
}

export function CommandCenter({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const { investigation, systemStatus, loading } = useStore();
  const activeMode = systemStatus?.mode ?? 'UNKNOWN';
  const runtimeSource = investigation ? 'Selected preset / live pipeline' : 'Load Scenario';
  const runtimeStatus = loading ? 'PROCESSING' : investigation?.state ?? 'READY';

  const stats = useMemo(() => {
    const ringAmount = investigation?.ring?.amountInvolved ?? 0;
    const curr = investigation?.ring?.currency ?? investigation?.payload.currency ?? 'USD';
    return {
      activeInvestigations: investigation ? 1 : 0,
      transactionsAnalyzed: investigation ? 1 : 0,
      fraudRingsDetected: investigation?.ring?.detected ? 1 : 0,
      amountAtRisk: ringAmount || investigation?.payload.amount || 0,
      _currency: curr,
    };
  }, [investigation]);

  const activity = useMemo<ActivityEntry[]>(() => {
    if (!investigation) return [];
    const evs = investigation.trace.stages.flatMap((s) => s.evidence).slice(0, 7);
    const entries = evs.map(evidenceToActivity);
    if (!entries.length && investigation.payload) {
      entries.push({
        id: 'tx-received',
        time: investigation.payload.timestamp.slice(11, 19),
        label: 'Transaction received',
        detail: `${investigation.payload.transactionType} · ${investigation.payload.amount.toLocaleString()} ${investigation.payload.currency}`,
        severity: 'info',
      });
    }
    if (investigation.risk && investigation.risk.score > 0) {
      entries.push({
        id: 'risk-done',
        time: investigation.risk.assessedAt || investigation.updatedAt?.slice(11, 19) || '',
        label: 'Risk assessment completed',
        detail: `Score ${investigation.risk.score}/100 · ${investigation.risk.level}`,
        severity: investigation.risk.level === 'CRITICAL' || investigation.risk.level === 'HIGH' ? 'critical' : investigation.risk.level === 'MEDIUM' ? 'warning' : 'success',
      });
    }
    if (investigation.response?.recommendedAction) {
      entries.push({
        id: 'response',
        time: investigation.updatedAt?.slice(11, 19) || '',
        label: 'Countermeasure recommended',
        detail: `${investigation.response.recommendedAction}${investigation.response.simulated ? ' (simulated)' : ''}`,
        severity: 'success',
      });
    }
    return entries;
  }, [investigation]);

  const systemHealthRows = useMemo(() => {
    const reachable = systemStatus?.backendReachable ?? false;
    return [
      { label: 'Backend API', ok: reachable },
      { label: 'Ingestion', ok: reachable },
      { label: 'ML Inference', ok: reachable },
      { label: 'Graph Engine', ok: reachable },
      { label: 'Agent Runtime', ok: reachable },
    ];
  }, [systemStatus]);

  const activitySubtitle = 'Investigation activity — derived from backend pipeline evidence';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-signal-600" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Command Center</h2>
            <p className="text-xs text-slate-600">Current investigation environment overview.</p>
          </div>
        </div>
        {investigation && (
          <button
            type="button"
            onClick={() => onNavigate('investigation')}
            className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-blue-700 shadow-xs transition-colors hover:bg-blue-100"
          >
            Open Investigation <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Active Investigations"
          value={stats.activeInvestigations}
          sub="Current backend session"
          accent="signal"
        />
        <StatTile
          label="Transactions Analyzed"
          value={formatNumber(stats.transactionsAnalyzed)}
          sub="Current backend session"
        />
        <StatTile
          label="Fraud Rings Detected"
          value={stats.fraudRingsDetected}
          sub="Current backend session"
          accent="risk"
        />
        <StatTile
          label="Amount at Risk"
          value={formatAmount(stats.amountAtRisk, stats._currency)}
          sub="Current investigation"
          accent="warn"
        />
      </div>

      <Panel title="Runtime Activity" subtitle="The selected row is processed by the live backend pipeline.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <RuntimeValue label="Mode" value={activeMode} />
          <RuntimeValue label="Source" value={runtimeSource} />
          <RuntimeValue label="Status" value={runtimeStatus} />
          <RuntimeValue label="Rows processed" value={investigation ? '1' : '0'} />
          <RuntimeValue label="Latest event" value={investigation?.eventId ?? '—'} />
          <RuntimeValue label="Latest investigation" value={investigation?.investigationId ?? '—'} />
          <RuntimeValue label="Latest risk" value={investigation?.risk ? `${investigation.risk.level} · ${investigation.risk.score}/100` : '—'} />
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Live activity feed */}
        <div className="lg:col-span-2">
          <Panel
            title="Live Investigation Activity"
            subtitle={activitySubtitle}
            actions={<span className="flex items-center gap-1.5 text-2xs font-semibold text-slate-600"><span className={`h-1.5 w-1.5 rounded-full ${activeMode === 'LIVE' ? (systemStatus?.backendReachable ? 'bg-emerald-500 animate-pulse-soft' : 'bg-red-500 animate-pulse-soft') : 'bg-emerald-500 animate-pulse-soft'}`} /> {activeMode}</span>}
          >
            {activity.length === 0 ? (
              <div className="py-8 text-center">
                <Clock className="mx-auto h-7 w-7 text-slate-400" />
                <p className="mt-2 text-xs text-slate-500 font-medium">Run a transaction to populate live investigation data.</p>
              </div>
            ) : (
              <ol className="relative space-y-0.5">
                {activity.map((entry, i) => (
                  <li key={entry.id} className="flex gap-3 py-2">
                    <div className="flex flex-col items-center">
                      <span className="font-mono text-2xs font-semibold text-slate-500">{entry.time}</span>
                      {i < activity.length - 1 && <span className="mt-1 h-full w-px flex-1 bg-slate-200" />}
                    </div>
                    <div className={`flex w-full items-start gap-3 rounded-md border px-3 py-2 shadow-xs ${SEVERITY_COLOR[entry.severity]}`}>
                      <div className="flex-1">
                        <div className="text-xs font-bold text-slate-900">{entry.label}</div>
                        <div className="mt-0.5 font-mono text-2xs font-medium text-slate-700">{entry.detail}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        {/* Quick state panel */}
        <div className="space-y-5">
          <Panel title="Current Investigation">
            {investigation ? (
              <div className="space-y-3">
                <Row label="Investigation" value={investigation.investigationId} />
                <Row label="Event" value={investigation.eventId} />
                <Row label="Trace" value={investigation.traceId} />
                <Row label="State" value={investigation.state} accent="signal" />
                <Row label="Amount" value={`${investigation.payload.amount.toLocaleString()} ${investigation.payload.currency}`} />
                <Row label="Route" value={`${investigation.payload.senderAccount} → ${investigation.payload.receiverAccount}`} />
                <div className="flex gap-2 pt-1">
                  <button onClick={() => onNavigate('investigation')} className="flex-1 rounded-md border border-ink-800 bg-slate-100 px-2 py-1.5 text-2xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-200">Pipeline</button>
                  <button onClick={() => onNavigate('trace')} className="flex-1 rounded-md border border-ink-800 bg-slate-100 px-2 py-1.5 text-2xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-200">Trace</button>
                  <button onClick={() => onNavigate('forensic')} className="flex-1 rounded-md border border-ink-800 bg-slate-100 px-2 py-1.5 text-2xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-200">Report</button>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<TrendingUp className="h-7 w-7" />}
                title="No active investigation"
                description="Inject a transaction from the Payload Lab to begin."
                action={
                  <button onClick={() => onNavigate('payload')} className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold uppercase tracking-widest text-blue-700 hover:bg-blue-100 shadow-xs">
                    Go to Payload Lab <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                }
              />
            )}
          </Panel>

          <Panel title="System Health">
            {systemStatus && (
              <div className="mb-2 rounded border border-ink-800 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-semibold text-slate-500">Version</span>
                  <span className="font-mono text-2xs font-bold text-slate-800">{systemStatus.version}</span>
                </div>
                {systemStatus.uptimeLabel && (
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-2xs font-semibold text-slate-500">Uptime</span>
                    <span className="font-mono text-2xs font-bold text-slate-800">{systemStatus.uptimeLabel}</span>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              {systemHealthRows.map((row) => (
                <HealthRow key={row.label} icon={row.ok ? CheckCircle2 : AlertCircle} label={row.label} status={row.ok ? 'operational' : 'degraded'} />
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function RuntimeValue({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-md border border-ink-800 bg-slate-50 p-3"><div className="text-2xs font-bold uppercase tracking-widest text-slate-500">{label}</div><div className="mt-1 truncate font-mono text-xs font-bold text-slate-900">{value}</div></div>;
}

function Row({ label, value, accent }: { label: string; value: string; accent?: 'signal' }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-2xs font-bold uppercase tracking-widest text-slate-500">{label}</span>
      <span className={`font-mono text-xs font-bold ${accent === 'signal' ? 'text-blue-700' : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

function HealthRow({ icon: Icon, label, status }: { icon: typeof CheckCircle2; label: string; status: 'operational' | 'degraded' }) {
  const ok = status === 'operational';
  return (
    <div className="flex items-center justify-between rounded-md border border-ink-800 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon className={`h-3.5 w-3.5 ${ok ? 'text-emerald-600' : 'text-amber-600'}`} />
        <span className="text-xs font-medium text-slate-800">{label}</span>
      </div>
      <span className={`text-2xs font-bold uppercase tracking-wider ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>{status}</span>
    </div>
  );
}
