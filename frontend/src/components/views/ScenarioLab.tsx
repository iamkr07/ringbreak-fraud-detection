import { useState } from 'react';
import { GitFork, ArrowRight, CheckCircle2, AlertTriangle, Siren, FlaskConical } from 'lucide-react';
import { useStore } from '@/store/context';
import { Panel, Badge } from '@/components/ui/Primitives';
import type { Scenario } from '@/types';
import type { ViewKey } from '@/components/layout/Sidebar';

const CATEGORY_STYLE = {
  normal: { color: 'text-safe-400', border: 'border-safe-500/25', bg: 'bg-safe-500/5', icon: CheckCircle2 },
  suspicious: { color: 'text-warn-400', border: 'border-warn-500/25', bg: 'bg-warn-500/5', icon: AlertTriangle },
  malicious: { color: 'text-risk-400', border: 'border-risk-500/25', bg: 'bg-risk-500/5', icon: Siren },
} as const;

export function ScenarioLab({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const { scenarios, inject, investigation } = useStore();
  const [selected, setSelected] = useState<Scenario | null>(null);

  const handleRun = async (scenario: Scenario) => {
    setSelected(scenario);
    if (scenario.id !== 'fraud_ring') {
      await inject(scenario.payload);
      return;
    }

    const correlationId = crypto.randomUUID();
    const ringAccountA = scenario.payload.senderAccount;
    const ringAccountB = scenario.payload.receiverAccount;
    const ringAccountC = 'ACC-SCENARIO-RING-03';
    const sequence = [
      scenario.payload,
      {
        ...scenario.payload,
        senderAccount: ringAccountB,
        receiverAccount: ringAccountC,
      },
      {
        ...scenario.payload,
        senderAccount: ringAccountC,
        receiverAccount: ringAccountA,
      },
    ];
    for (const payload of sequence) {
      await inject(payload, correlationId);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitFork className="h-5 w-5 text-signal-400" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Scenario Lab</h2>
            <p className="text-xs text-slate-600">Pre-built scenarios to test the investigation pipeline.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-warn-500/30 bg-warn-500/10 px-3 py-1.5">
          <Siren className="h-3.5 w-3.5 text-warn-400" />
          <span className="text-2xs font-semibold uppercase tracking-widest text-warn-400">Simulation Environment</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {scenarios.map((s) => {
          const style = CATEGORY_STYLE[s.category];
          const Icon = style.icon;
          return (
            <div key={s.id} className={`rounded-lg border ${style.border} ${style.bg} p-4`}>
              <div className="flex items-start justify-between">
                <Icon className={`h-5 w-5 ${style.color}`} />
                <span className={`text-2xs font-semibold uppercase tracking-wider ${style.color}`}>{s.category}</span>
              </div>
              <h3 className="mt-2 text-sm font-semibold text-slate-900">{s.name}</h3>
              <p className="mt-1 text-xs text-slate-700">{s.description}</p>
              <div className="mt-3 rounded border border-slate-200 bg-slate-100/70 p-2">
                <div className="text-2xs text-slate-500">Expected outcome</div>
                <div className="mt-0.5 text-2xs font-medium text-slate-800">{s.expectedOutcome}</div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-2xs text-slate-600">{s.payload.senderAccount} → {s.payload.receiverAccount}</span>
                <button
                  type="button"
                  onClick={() => handleRun(s)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-signal-500/30 bg-signal-500/10 px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wider text-blue-700 transition-colors hover:bg-signal-500/20"
                >
                  Run <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom scenario CTA */}
      <Panel title="Custom Scenario">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FlaskConical className="h-5 w-5 text-signal-400" />
            <div>
              <div className="text-sm font-semibold text-slate-900">Build your own transaction</div>
              <p className="text-xs text-slate-600">Construct a custom payload with specific parameters to test edge cases.</p>
            </div>
          </div>
          <button onClick={() => onNavigate('payload')} className="inline-flex items-center gap-2 rounded-md border border-signal-500/30 bg-signal-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-blue-700 hover:bg-signal-500/20">
            Open Payload Lab <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </Panel>

      {/* Result */}
      {investigation && selected && (
        <Panel title="Scenario Result" subtitle={`Ran: ${selected.name}`}>
          <div className="flex flex-wrap items-center gap-3">
            <Badge>Event: {investigation.eventId}</Badge>
            <Badge>Trace: {investigation.traceId}</Badge>
            {investigation.risk && <Badge level={investigation.risk.level}>Risk: {investigation.risk.score}/100</Badge>}
            {investigation.ring && <Badge level={investigation.ring.detected ? 'CRITICAL' : 'LOW'}>{investigation.ring.detected ? `Ring: ${investigation.ring.ringId}` : 'No ring'}</Badge>}
            <button onClick={() => onNavigate('investigation')} className="ml-auto inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-100 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-slate-700 hover:bg-slate-200">
              View Investigation <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </Panel>
      )}
    </div>
  );
}
