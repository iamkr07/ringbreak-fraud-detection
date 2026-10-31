import { useEffect, useState } from 'react';
import { BrainCircuit, Activity, Network, FileSearch, type LucideIcon } from 'lucide-react';
import { useStore } from '@/store/context';
import { Panel, EmptyState, KeyVal, Divider, Badge } from '@/components/ui/Primitives';
import { formatPercentage } from '@/lib/format';
import type { AgentFinding, Evidence, RingCandidate, RiskAssessment } from '@/types';
import { GuidedNavigation } from '@/components/layout/GuidedNavigation';
import type { ViewKey } from '@/components/layout/Sidebar';

type Domain = 'behaviour' | 'network' | 'evidence';

const DOMAINS: { key: Domain; label: string; icon: LucideIcon; desc: string }[] = [
  { key: 'behaviour', label: 'BEHAVIOUR', icon: Activity, desc: 'Anomalous transaction behaviour signals' },
  { key: 'network', label: 'NETWORK', icon: Network, desc: 'Entity relationships and cluster structure' },
  { key: 'evidence', label: 'EVIDENCE', icon: FileSearch, desc: 'Correlated evidence items and strength' },
];

export function IntelligenceView({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const { investigation, ringContext, openInvestigationByEventId } = useStore();
  const [domain, setDomain] = useState<Domain>('behaviour');
  const [resolvedRing, setResolvedRing] = useState<RingCandidate | null>(null);

  useEffect(() => {
    setResolvedRing(ringContext ?? investigation?.ring ?? null);
  }, [ringContext, investigation?.ring]);

  if (!investigation) {
    return (
      <div className="mx-auto max-w-4xl">
        <Header />
        <EmptyState icon={<BrainCircuit className="h-8 w-8" />} title="No intelligence data" description="Inject a transaction to generate intelligence findings." />
      </div>
    );
  }

  const risk = investigation.risk ?? null;
  const ring = resolvedRing;
  const agents = investigation.agents ?? null;
  if (!risk || !agents) return <EmptyState icon={<BrainCircuit className="h-8 w-8" />} title="Live intelligence unavailable" description="The backend returned an incomplete investigation." />;
  const behaviourAgent = agents.find((agent) => agent.agentKey === 'behaviour');
  const allEvidence: Evidence[] = investigation.trace.stages.flatMap((s) => s.evidence);

  return (
    <div className="space-y-5">
      <Header />

      {/* Domain tabs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {DOMAINS.map((d) => {
          const Icon = d.icon;
          const active = domain === d.key;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => setDomain(d.key)}
              className={`rounded-lg border p-4 text-left transition-all ${active ? 'border-signal-500/40 bg-signal-500/10 shadow-glow-signal' : 'border-slate-300 bg-white hover:bg-slate-100 shadow-sm'}`}
            >
              <Icon className={`h-5 w-5 ${active ? 'text-signal-400' : 'text-slate-500'}`} />
              <div className={`mt-2 text-xs font-semibold uppercase tracking-widest ${active ? 'text-blue-700' : 'text-slate-700'}`}>{d.label}</div>
              <div className="mt-1 text-2xs text-slate-600">{d.desc}</div>
            </button>
          );
        })}
      </div>

      {domain === 'behaviour' && (behaviourAgent
        ? <BehaviourDomain risk={risk} agent={behaviourAgent} />
        : <EmptyState icon={<Activity className="h-8 w-8" />} title="Behaviour scores unavailable" description="The backend did not return a Behaviour Agent result for this investigation." />)}
      {domain === 'network' && <NetworkDomain ring={ring} onNavigate={onNavigate} onOpenEvent={openInvestigationByEventId} />}
      {domain === 'evidence' && <EvidenceDomain evidence={allEvidence} agents={agents} />}
      <GuidedNavigation current="intelligence" onNavigate={onNavigate} />
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-3">
      <BrainCircuit className="h-5 w-5 text-signal-400" />
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Intelligence</h2>
        <p className="text-xs text-slate-600">Three investigation domains: behaviour, network, and evidence.</p>
      </div>
    </div>
  );
}

function BehaviourDomain({ risk, agent }: { risk: RiskAssessment; agent: AgentFinding }) {
  const signals = [
    { key: 'fraudProbability', label: 'Fraud probability', max: 1, fraction: true },
    { key: 'anomalyScore', label: 'ML anomaly score', max: 1, fraction: true },
    { key: 'modelConfidence', label: 'Model confidence', max: 1, fraction: true },
    { key: 'amountSignal', label: 'Amount signal', max: 100, fraction: false },
    { key: 'transactionTypeSignal', label: 'Transaction type signal', max: 100, fraction: false },
    { key: 'deviceSignal', label: 'Device presence signal', max: 100, fraction: false },
    { key: 'locationSignal', label: 'Location signal', max: 100, fraction: false },
    { key: 'ipSignal', label: 'IP signal', max: 100, fraction: false },
  ] as const;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel title="Behavioural Scores" subtitle="Values returned by the Feature Engine and ML stage">
        {agent.evidenceStatus === 'insufficient_evidence' && (
          <p className="mb-3 rounded border border-warn-500/25 bg-warn-500/5 p-2 text-xs text-warn-600">
            {agent.evidenceReason ?? 'Behavioural evidence is insufficient.'}
          </p>
        )}
        <ul className="space-y-3">
          {signals.map((s) => (
            <li key={s.label}>
              {(() => {
                const value = agent.scores?.[s.key] ?? null;
                const percentage = value === null ? 0 : Math.max(0, Math.min(100, (value / s.max) * 100));
                const formatted = value === null
                  ? 'Unavailable'
                  : s.fraction ? formatPercentage(value) : `${Math.round(value)}/100`;
                return (
                  <>
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-slate-800">{s.label}</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">{formatted}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${percentage}%`, background: percentage > 75 ? '#ef4444' : percentage > 50 ? '#f59e0b' : '#10b981' }}
                />
              </div>
              <div className="mt-1 text-2xs text-slate-600">{value === null ? 'This score was not returned by the evidence stages.' : s.fraction ? 'Model output, on a 0 to 1 scale.' : 'Feature Engine output, on a 0 to 100 scale.'}</div>
                  </>
                );
              })()}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Risk Factor Breakdown" subtitle="Contribution to overall risk score">
        <ul className="space-y-2">
          {risk.factors.map((f) => (
            <li key={f.key} className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold text-slate-800">{f.label}</span>
                <span className="font-mono text-sm tabular-nums font-semibold text-slate-900">{f.score}<span className="text-slate-500">/100</span></span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full" style={{ width: `${f.score}%`, background: f.score > 75 ? '#ef4444' : f.score > 50 ? '#f59e0b' : '#10b981' }} />
                </div>
                <span className="text-2xs text-slate-600">w {f.weight}</span>
              </div>
              <div className="mt-1 text-2xs text-slate-600">{f.detail}</div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function NetworkDomain({ ring, onNavigate, onOpenEvent }: { ring: RingCandidate | null; onNavigate: (v: 'investigation' | 'network' | 'forensic') => void; onOpenEvent: (eventId: string) => Promise<void>; }) {
  const { investigation } = useStore();
  const graphOutput = investigation?.trace?.stages?.find((s) => /graph/i.test(s.key))?.output;
  const entityCount = Array.isArray(graphOutput?.entities) ? graphOutput.entities.length : null;
  const relationshipCount = Array.isArray(graphOutput?.relationships) ? graphOutput.relationships.length : null;
  const sharedDev = ring?.signals?.find((s) => /devic/i.test(s.key))?.description ?? investigation?.ring?.signals?.find((s) => /devic/i.test(s.key))?.description ?? 'No shared device signal';
  const sharedIp = ring?.signals?.find((s) => /shared.*ip|ip.*shared/i.test(s.key))?.description ?? investigation?.ring?.signals?.find((s) => /shared.*ip|ip.*shared/i.test(s.key))?.description ?? 'No shared IP signal';
  const netsig = [
    { label: 'Connected Entities', value: entityCount != null ? String(entityCount) : '—', detail: 'Accounts, devices, IPs, merchants' },
    { label: 'Shared Device', value: /DEV[-_]?[0-9A-F]+/i.test(sharedDev) ? /DEV[-_]?[0-9A-F]+/i.exec(sharedDev)![0] : (ring ? 'PRESENT' : '—'), detail: sharedDev },
    { label: 'Shared IP', value: (/(\d{1,3}\.){3}\d{1,3}/.test(sharedIp) ? /(\d{1,3}\.){3}\d{1,3}/.exec(sharedIp)![0] : (ring ? 'PRESENT' : '—')), detail: sharedIp },
    { label: 'Transaction Relationships', value: relationshipCount != null ? String(relationshipCount) : '—', detail: 'Edges in entity graph' },
    { label: 'Cluster Size', value: String(ring?.memberCount ?? '—'), detail: 'Accounts in detected ring' },
  ];
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel title="Network Signals">
        <ul className="space-y-2">
          {netsig.map((s) => (
            <li key={s.label} className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 p-3">
              <div>
                <div className="text-xs font-medium text-slate-800">{s.label}</div>
                <div className="mt-0.5 text-2xs text-slate-600">{s.detail}</div>
              </div>
              <span className="font-mono text-sm font-semibold text-slate-900">{s.value}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Ring Candidate" actions={<Badge level={ring?.detected ? 'CRITICAL' : 'LOW'}>{ring?.detected ? 'DETECTED' : 'NONE'}</Badge>}>
        {ring?.detected ? (
          <div className="space-y-3">
            <dl className="space-y-1 rounded-md border border-risk-500/20 bg-risk-500/5 p-3">
              <KeyVal label="Ring ID" value={ring.ringId} />
              <KeyVal label="Confidence" value={`${ring.confidence}%`} />
              <KeyVal label="Members" value={ring.memberCount} />
              <KeyVal label="Transaction Volume" value={ring.transactionVolume} />
              <KeyVal label="Amount Involved" value={`${ring.amountInvolved.toLocaleString()} ${ring.currency}`} />
            </dl>
            <Divider label="Detection Signals" />
            <ul className="space-y-1.5">
              {ring.signals.filter((s) => s.present).map((s) => (
                <li key={s.key} className="rounded-md border border-slate-200 bg-white p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900">{s.label}</span>
                    <span className="font-mono text-2xs font-bold text-warn-600">{(s.weight * 100).toFixed(0)}%</span>
                  </div>
                  <p className="mt-0.5 text-2xs text-slate-600">{s.description}</p>
                </li>
              ))}
            </ul>
            {ring.memberEvents && ring.memberEvents.length > 0 && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-2xs font-semibold uppercase tracking-widest text-slate-600">Ring correlation</div>
                <div className="flex flex-wrap gap-2">
                  {ring.memberEvents.map((eventId) => (
                    <button key={eventId} type="button" onClick={() => void onOpenEvent(eventId)} className="rounded border border-signal-500/30 bg-signal-500/10 px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-blue-700 hover:bg-signal-500/20">
                      {eventId}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => onNavigate('network')} className="w-full rounded-md border border-slate-300 bg-slate-100 py-2 text-2xs font-semibold uppercase tracking-wider text-slate-700 hover:bg-slate-200">View Network Graph</button>
          </div>
        ) : (
          <EmptyState title="No ring detected" description="This transaction did not trigger ring detection." />
        )}
      </Panel>
    </div>
  );
}

function EvidenceDomain({ evidence, agents }: { evidence: Evidence[]; agents: AgentFinding[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Panel title="Evidence Items" subtitle={`${evidence.length} items collected across pipeline stages`}>
          {evidence.length > 0 ? (
            <ul className="space-y-2">
              {evidence.map((e) => (
                <li key={e.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-slate-900">{e.label}</div>
                      <p className="mt-0.5 text-2xs text-slate-600">{e.description}</p>
                      <div className="mt-1.5 flex items-center gap-2 text-2xs text-slate-500">
                        <span>Source: {e.source}</span><span>·</span><span>{e.timestamp}</span><span>·</span><span>{e.relationship}</span>
                      </div>
                    </div>
                    <div className="ml-3 flex flex-col items-end">
                      <span className="font-mono text-sm font-semibold text-warn-600">{e.strength}</span>
                      <span className="text-2xs text-slate-500">strength</span>
                    </div>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full" style={{ width: `${e.strength}%`, background: e.strength > 80 ? '#ef4444' : e.strength > 60 ? '#f59e0b' : '#10b981' }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No evidence collected" />
          )}
        </Panel>
      </div>

      <div>
        <Panel title="Agent Corroboration">
          <ul className="space-y-2">
            {agents.map((a) => (
              <li key={a.agentKey} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-semibold uppercase tracking-wider text-slate-700">{a.name}</span>
                  <span className="font-mono text-2xs font-semibold text-emerald-700">{a.confidence == null ? 'Unavailable' : `${a.confidence}%`}</span>
                </div>
                <p className="mt-1 text-2xs text-slate-600">{a.finding}</p>
                <div className="mt-1.5 text-2xs text-slate-500">{a.evidenceCount} evidence items</div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
