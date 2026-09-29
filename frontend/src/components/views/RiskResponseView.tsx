import { Shield, Siren, Play } from 'lucide-react';
import { useStore } from '@/store/context';
import { Panel, EmptyState, Divider, Badge } from '@/components/ui/Primitives';
import { formatPercentage } from '@/lib/format';
import type { RiskLevel } from '@/types';
import type { ViewKey } from '@/components/layout/Sidebar';
import { GuidedNavigation } from '@/components/layout/GuidedNavigation';

export function RiskResponseView({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const { investigation, mode, simulateResponse } = useStore();
  const risk = investigation?.risk ?? null;
  const response = investigation?.response ?? null;

  if (!investigation || !risk || !response) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center gap-3">
          <Shield className="h-5 w-5 text-signal-400" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Risk & Response</h2>
            <p className="text-xs text-slate-600">Risk assessment and simulated countermeasure.</p>
          </div>
        </div>
        <EmptyState icon={<Shield className="h-8 w-8" />} title="No risk assessment" description="Inject a transaction to generate a risk score and response." action={<button onClick={() => onNavigate('payload')} className="rounded-md border border-signal-500/30 bg-signal-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-blue-700 hover:bg-signal-500/20">Go to Payload Lab</button>} />
      </div>
    );
  }

  const levelColor: Record<RiskLevel, string> = {
    CRITICAL: 'text-risk-400',
    HIGH: 'text-risk-400',
    MEDIUM: 'text-warn-400',
    LOW: 'text-safe-400',
  };
  const levelBg: Record<RiskLevel, string> = {
    CRITICAL: 'border-risk-500/30 bg-risk-500/10 shadow-glow-risk',
    HIGH: 'border-risk-500/25 bg-risk-500/5',
    MEDIUM: 'border-warn-500/25 bg-warn-500/5',
    LOW: 'border-safe-500/25 bg-safe-500/5',
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Shield className="h-5 w-5 text-signal-400" />
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Risk & Response</h2>
          <p className="text-xs text-slate-600">Risk assessment score and recommended simulated countermeasure.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Score */}
        <div className={`rounded-lg border p-5 ${levelBg[risk.level]}`}>
          <div className="text-2xs font-semibold uppercase tracking-widest text-slate-700">Risk Score</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`font-mono text-5xl font-bold ${levelColor[risk.level]}`}>{risk.score}</span>
            <span className="font-mono text-xl text-slate-600">/100</span>
          </div>
          <div className={`mt-2 text-sm font-semibold uppercase tracking-widest ${levelColor[risk.level]}`}>{risk.level}</div>
          <Divider />
          <dl className="space-y-1">
            {risk.fraudProbability != null && (
              <div className="flex justify-between gap-3"><dt className="text-2xs text-slate-600">Fraud Probability</dt><dd className="text-right font-mono text-xs font-semibold text-slate-900">{formatPercentage(risk.fraudProbability)}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-2xs text-slate-600">Confidence</dt><dd className="font-mono text-xs font-semibold text-slate-900">{risk.confidence}%</dd></div>
            {risk.evidenceStrength != null && (
              <div className="flex justify-between gap-3"><dt className="text-2xs text-slate-600">Evidence Strength</dt><dd className="text-right font-mono text-xs font-semibold text-slate-900">{formatPercentage(risk.evidenceStrength)}</dd></div>
            )}
          </dl>
        </div>

        {/* Factors */}
        <Panel title="Contributing Factors" className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {risk.factors.map((f) => (
              <div key={f.key} className="rounded-md border border-slate-200 bg-slate-100/70 p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-semibold text-slate-800">{f.label}</span>
                  <span className="font-mono text-sm tabular-nums font-semibold text-slate-900">{f.score}<span className="text-slate-500">/100</span></span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full" style={{ width: `${f.score}%`, background: f.score > 75 ? '#ef4444' : f.score > 50 ? '#f59e0b' : '#10b981' }} />
                  </div>
                  <span className="text-2xs text-slate-600">w {f.weight}</span>
                </div>
                <div className="mt-1.5 text-2xs text-slate-600">{f.detail}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Countermeasure */}
      <Panel
        title="Countermeasure"
        actions={<span className="inline-flex items-center gap-1.5 rounded border border-warn-500/30 bg-warn-500/10 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider text-warn-400"><Siren className="h-3 w-3" /> SIMULATION</span>}
      >
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-100/70 p-4">
            <div className="text-2xs font-semibold uppercase tracking-widest text-slate-600">Recommended Action</div>
            <div className="mt-2 flex items-center gap-2">
              <Shield className="h-5 w-5 text-signal-400" />
              <span className="text-base font-semibold text-slate-900">{response.recommendedAction}</span>
            </div>
            <p className="mt-3 text-xs text-slate-700">{response.reason}</p>
            <div className="mt-3 flex items-center gap-2">
              <Badge>Confidence: {response.confidence}%</Badge>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-100/70 p-4">
            <div className="text-2xs font-semibold uppercase tracking-widest text-slate-600">Triggering Evidence</div>
            <ul className="mt-2 space-y-1.5">
              {response.triggeringEvidence.map((e, i) => (
                <li key={i} className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-risk-500" />
                  {e}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => void simulateResponse()}
              disabled={mode === 'LIVE' && response.status === 'SIMULATED'}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-warn-500/30 bg-warn-500/10 px-3 py-2.5 text-xs font-semibold uppercase tracking-widest text-warn-600 transition-colors hover:bg-warn-500/20"
            >
              <Play className="h-4 w-4" /> {response.status === 'SIMULATED' ? 'Response Simulated' : 'Simulate Response'}
            </button>
          </div>
        </div>
        {response.status === 'SIMULATED' && (
          <div className="mt-5 rounded-md border border-safe-500/25 bg-safe-500/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-2xs font-semibold uppercase tracking-widest text-emerald-700">Simulation Audit</div>
              <Badge>{response.status}</Badge>
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div><dt className="text-slate-600">Action ID</dt><dd className="font-mono font-semibold text-slate-900">{response.actionId ?? '—'}</dd></div>
              <div><dt className="text-slate-600">Action Type</dt><dd className="font-semibold text-slate-900">{response.actionType ?? response.type}</dd></div>
              <div><dt className="text-slate-600">Timestamp</dt><dd className="font-mono font-semibold text-slate-900">{response.timestamp ?? '—'}</dd></div>
              <div><dt className="text-slate-600">Investigation</dt><dd className="font-mono font-semibold text-slate-900">{response.investigationId ?? investigation.investigationId}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-emerald-800 font-medium">{response.auditNote ?? 'Simulation only - no external financial action performed.'}</p>
          </div>
        )}
      </Panel>
      <GuidedNavigation current="risk" onNavigate={onNavigate} />
    </div>
  );
}
