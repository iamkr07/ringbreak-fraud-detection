import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, X, Target, FileSearch, Activity, CheckCircle2 } from 'lucide-react';
import { useStore } from '@/store/context';
import { EmptyState } from '@/components/ui/Primitives';
import type { AgentFinding, AgentKey } from '@/types';
import type { ViewKey } from '@/components/layout/Sidebar';
import { GuidedNavigation } from '@/components/layout/GuidedNavigation';
import { formatPercentage } from '@/lib/format';

const AGENT_ICONS: Record<AgentKey, typeof Target> = {
  behaviour: Activity,
  network: Target,
  evidence: FileSearch,
};

export function AgentsView({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const { investigation } = useStore();
  const [selected, setSelected] = useState<AgentFinding | null>(null);
  const agents = investigation?.agents ?? [];

  if (!investigation) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center gap-3">
          <Users className="h-5 w-5 text-signal-400" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Investigator Agents</h2>
            <p className="text-xs text-slate-600">Specialized agents that investigate behaviour, network, and evidence.</p>
          </div>
        </div>
        <EmptyState icon={<Users className="h-8 w-8" />} title="No agents dispatched" description="Inject a transaction to activate investigator agents." action={<button onClick={() => onNavigate('payload')} className="rounded-md border border-signal-500/30 bg-signal-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-blue-700 hover:bg-signal-500/20">Go to Payload Lab</button>} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Users className="h-5 w-5 text-signal-400" />
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Investigator Agents</h2>
          <p className="text-xs text-slate-600">3 specialized agents independently investigated this transaction.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {agents.map((agent) => {
          const Icon = AGENT_ICONS[agent.agentKey];
          return (
            <button
              key={agent.agentKey}
              type="button"
              onClick={() => setSelected(agent)}
              className="group rounded-lg border border-slate-200 bg-slate-50 p-5 text-left transition-all hover:border-blue-400 hover:bg-slate-100 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white">
                  <Icon className="h-5 w-5 text-signal-400" />
                </div>
                <span className="inline-flex items-center gap-1.5 rounded border border-safe-500/25 bg-safe-500/10 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" /> {agent.status}
                </span>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">{agent.name}</h3>
              <p className="mt-1.5 text-xs text-slate-600">{agent.finding}</p>
              <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                <div>
                  <div className="text-2xs uppercase tracking-widest text-slate-500 font-medium">Confidence</div>
                  <div className="font-mono text-sm font-semibold text-slate-900">{agent.confidence == null ? 'Unavailable' : `${agent.confidence}%`}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xs uppercase tracking-widest text-slate-500 font-medium">Evidence</div>
                  <div className="font-mono text-sm font-semibold text-slate-900">{agent.evidenceCount}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {selected && <AgentDrawer agent={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
      <GuidedNavigation current="agents" onNavigate={onNavigate} />
    </div>
  );
}

function AgentDrawer({ agent, onClose }: { agent: AgentFinding; onClose: () => void }) {
  const uniqueSources = Array.from(new Set(agent.evidence.filter((e) => e.source).map((e) => e.source))).slice(0, 6);

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-30 bg-black/50" onClick={onClose} />
      <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween', duration: 0.2 }} className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-slate-300 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-900">{agent.name}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded border border-safe-500/25 bg-safe-500/10 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider text-emerald-700">{agent.status}</span>
            <span className="font-mono text-xs text-slate-700">Confidence {agent.confidence == null ? 'Unavailable' : `${agent.confidence}%`}</span>
            <span className="font-mono text-xs text-slate-700">{agent.evidenceCount} evidence</span>
          </div>

          {agent.evidenceStatus === 'insufficient_evidence' && (
            <div className="rounded border border-warn-500/25 bg-warn-500/5 p-3 text-xs text-warn-700 font-medium">
              {agent.evidenceReason ?? 'Required behavioural evidence is unavailable.'}
            </div>
          )}

          {agent.scores && (
            <Section title="Scores">
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                {Object.entries(agent.scores).map(([key, value]) => {
                  const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (first) => first.toUpperCase());
                  const formatted = value == null
                    ? 'Unavailable'
                    : ['anomalyScore', 'fraudProbability', 'modelConfidence'].includes(key)
                      ? formatPercentage(value)
                      : `${Math.round(value)}/100`;
                  return <div key={key} className="border-b border-slate-200 pb-1"><dt className="text-2xs text-slate-600">{label}</dt><dd className="font-mono text-xs font-semibold text-slate-900">{formatted}</dd></div>;
                })}
              </dl>
            </Section>
          )}

          <Section title="Objective"><p className="text-xs text-slate-700">{agent.objective}</p></Section>
          <Section title="Observations">
            <ul className="space-y-1.5">
              {agent.observations.map((o, i) => (
                <li key={i} className="flex gap-2 rounded-md border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800">
                  <span className="font-mono text-2xs font-bold text-slate-500">{String(i + 1).padStart(2, '0')}</span>
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </Section>
          {uniqueSources.length > 0 && (
            <Section title="Evidence Sources">
              <div className="flex flex-wrap gap-2">
                {uniqueSources.map((source) => (
                  <span key={source} className="rounded border border-signal-500/20 bg-signal-500/5 px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-blue-700">
                    {source}
                  </span>
                ))}
              </div>
            </Section>
          )}
          <Section title="Evidence">
            <ul className="space-y-1.5">
              {agent.evidence.map((e) => (
                <li key={e.id} className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900">{e.label}</span>
                    <span className="font-mono text-2xs font-bold text-warn-600">{e.strength}/100</span>
                  </div>
                  {e.description && <p className="mt-0.5 text-2xs text-slate-600">{e.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
                    {e.source && <span className="rounded border border-slate-300 px-1.5 py-0.5">source: {e.source}</span>}
                    {e.relationship && <span className="rounded border border-slate-300 px-1.5 py-0.5">relationship: {e.relationship}</span>}
                    {e.timestamp && <span className="rounded border border-slate-300 px-1.5 py-0.5">{e.timestamp}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Conclusion">
            <div className="rounded-md border border-signal-500/20 bg-signal-500/5 p-3">
              <p className="text-xs font-medium text-slate-900">{agent.conclusion}</p>
            </div>
          </Section>
        </div>
      </motion.div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h4 className="mb-2 text-2xs font-semibold uppercase tracking-widest text-slate-700">{title}</h4>{children}</div>;
}
