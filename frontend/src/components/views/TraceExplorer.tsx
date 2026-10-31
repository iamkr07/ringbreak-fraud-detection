import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Route, X, Clock, FileText, CheckCircle2, ChevronRight } from 'lucide-react';
import { useStore } from '@/store/context';
import { Panel, EmptyState, KeyVal, Divider } from '@/components/ui/Primitives';
import { formatPercentage, stageStatusColor, stageStatusDot, stageStatusBg } from '@/lib/format';
import type { AgentFinding, TraceStage } from '@/types';
import type { ViewKey } from '@/components/layout/Sidebar';
import { GuidedNavigation } from '@/components/layout/GuidedNavigation';

export function TraceExplorer({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const { investigation } = useStore();
  const [selected, setSelected] = useState<number | null>(null);

  const stages: TraceStage[] = investigation?.trace.stages ?? [];

  if (!investigation) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center gap-3">
          <Route className="h-5 w-5 text-signal-600" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Trace Explorer</h2>
            <p className="text-xs text-slate-600">Inspect the complete execution timeline of an investigation.</p>
          </div>
        </div>
        <EmptyState
          icon={<Route className="h-8 w-8" />}
          title="No trace available"
          description="Inject a transaction to generate a traceable investigation timeline."
          action={<button onClick={() => onNavigate('payload')} className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-blue-700 hover:bg-blue-100">Go to Payload Lab</button>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Route className="h-5 w-5 text-signal-600" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Trace Explorer</h2>
            <p className="text-xs text-slate-600">Complete execution audit of trace {investigation.traceId}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-md border border-ink-800 bg-white px-3 py-1.5 shadow-xs">
            <span className="text-2xs font-bold uppercase tracking-widest text-slate-500">Trace</span>
            <div className="font-mono text-xs font-bold text-blue-700">{investigation.traceId}</div>
          </div>
          <div className="rounded-md border border-ink-800 bg-white px-3 py-1.5 shadow-xs">
            <span className="text-2xs font-bold uppercase tracking-widest text-slate-500">Investigation</span>
            <div className="font-mono text-xs font-bold text-slate-800">{investigation.investigationId}</div>
          </div>
          <div className="rounded-md border border-ink-800 bg-white px-3 py-1.5 shadow-xs">
            <span className="text-2xs font-bold uppercase tracking-widest text-slate-500">Event</span>
            <div className="font-mono text-xs font-bold text-slate-800">{investigation.eventId}</div>
          </div>
          <div className="rounded-md border border-ink-800 bg-white px-3 py-1.5 shadow-xs">
            <span className="text-2xs font-bold uppercase tracking-widest text-slate-500">State</span>
            <div className="font-mono text-xs font-bold text-emerald-700">{investigation.trace.state}</div>
          </div>
        </div>
      </div>

      {/* Vertical timeline */}
      <Panel title="Execution Timeline" subtitle="Click any stage to inspect its input, output, and evidence">
        <ol className="relative">
          {stages.map((stage, i) => (
            <li key={stage.key} className="relative flex gap-4 pb-4 last:pb-0">
              {/* Connector */}
              {i < stages.length - 1 && (
                <span className="absolute left-[15px] top-8 h-full w-px bg-ink-800" />
              )}
              {/* Node */}
              <button
                type="button"
                onClick={() => setSelected(i)}
                className={`relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 ${stageStatusBg(stage.status)}`}
              >
                <span className={`h-2 w-2 rounded-full ${stageStatusDot(stage.status)}`} />
              </button>
              {/* Content */}
              <button
                type="button"
                onClick={() => setSelected(i)}
                className="group flex flex-1 items-center justify-between rounded-md border border-ink-800 bg-white px-4 py-3 text-left shadow-xs transition-colors hover:border-blue-300 hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-2xs font-bold text-slate-500">{String(stage.index).padStart(2, '0')}</span>
                  <div>
                    <div className="text-xs font-bold text-slate-900">{stage.label}</div>
                    <div className="mt-0.5 flex items-center gap-3 text-2xs font-medium text-slate-500">
                      <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {stage.durationMs}ms</span>
                      <span className="flex items-center gap-1"><FileText className="h-2.5 w-2.5" /> {stage.startedAt}</span>
                      {stage.evidence.length > 0 && <span>{stage.evidence.length} evidence</span>}
                    </div>
                    <div className="mt-1 text-2xs font-medium text-slate-700">{stageOutcome(stage)}</div>
                    <div className="mt-0.5 text-2xs text-slate-500 font-medium">Next: {stages[i + 1]?.label ?? 'End of trace'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-2xs font-bold uppercase tracking-wider ${stageStatusColor(stage.status)}`}>{stage.status}</span>
                  <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600" />
                </div>
              </button>
            </li>
          ))}
        </ol>
      </Panel>

      <AnimatePresence>
        {selected !== null && stages[selected] && (
          <TraceDrawer
            stage={stages[selected]}
            nextStage={stages[selected + 1] ?? null}
            eventId={investigation.eventId}
            investigationId={investigation.investigationId}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
      <GuidedNavigation current="trace" onNavigate={onNavigate} />
    </div>
  );
}

function TraceDrawer({ stage, nextStage, eventId, investigationId, onClose }: { stage: TraceStage; nextStage: TraceStage | null; eventId: string; investigationId: string; onClose: () => void }) {
  const agentInputs = stage.input.agentInputs as Record<string, string[]> | undefined;
  const agents = Array.isArray(stage.output.agents) ? stage.output.agents as AgentFinding[] : [];
  const ordinaryInput = Object.fromEntries(Object.entries(stage.input).filter(([key]) => key !== 'agentInputs'));

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-xs" onClick={onClose} />
      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.2 }}
        className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-ink-800 bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-ink-800 px-5 py-4 bg-slate-50">
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xs font-bold text-slate-500">{String(stage.index).padStart(2, '0')}</span>
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900">{stage.label}</h3>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-2xs font-bold uppercase tracking-wider ${stageStatusBg(stage.status)} ${stageStatusColor(stage.status)}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${stageStatusDot(stage.status)}`} /> {stage.status}
            </span>
            <span className="inline-flex items-center gap-1 text-2xs font-medium text-slate-600"><Clock className="h-3 w-3" /> {stage.durationMs}ms</span>
            <span className="inline-flex items-center gap-1 text-2xs font-medium text-slate-600"><CheckCircle2 className="h-3 w-3" /> {stage.completedAt ?? '—'}</span>
          </div>

          <Section title="Input"><DataGrid data={ordinaryInput} /></Section>
          {agentInputs && (
            <Section title="Agent Evidence Inputs">
              <ul className="space-y-2">
                {Object.entries(agentInputs).map(([agent, sources]) => (
                  <li key={agent} className="rounded-md border border-ink-800 bg-slate-50 p-3">
                    <div className="text-xs font-bold capitalize text-slate-900">{agent} agent</div>
                    <div className="mt-1 text-2xs font-mono font-medium text-slate-600">{sources.join(' → ')}</div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section title="Output">
            {agents.length > 0 ? <AgentOutput agents={agents} /> : <DataGrid data={stage.output} />}
          </Section>
          <Section title="Evidence">
            {stage.evidence.length > 0 ? (
              <ul className="space-y-2">
                {stage.evidence.map((e) => (
                  <li key={e.id} className="rounded-md border border-ink-800 bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{e.label}</span>
                      <span className="font-mono text-2xs font-bold text-amber-700">{e.strength}/100</span>
                    </div>
                    <p className="mt-1 text-2xs text-slate-600">{e.description}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-medium text-slate-500">
                      <span>source: {e.source}</span>
                      <span>relationship: {e.relationship}</span>
                      <span>{e.timestamp}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-slate-500">No evidence items.</p>}
          </Section>

          <Divider label="Metadata" />
          <dl className="space-y-1">
            <KeyVal label="Event ID" value={eventId} />
            <KeyVal label="Investigation ID" value={investigationId} />
            <KeyVal label="Trace ID" value={stage.traceId} />
            <KeyVal label="Started" value={stage.startedAt} />
            <KeyVal label="Completed" value={stage.completedAt ?? '—'} />
            <KeyVal label="Duration" value={`${stage.durationMs}ms`} />
          </dl>
          <Section title="Next Stage">
            <p className="rounded-md border border-ink-800 bg-slate-50 p-3 text-xs font-bold text-slate-800">
              {nextStage ? `${String(nextStage.index).padStart(2, '0')} · ${nextStage.label}` : 'End of trace'}
            </p>
          </Section>
        </div>
      </motion.div>
    </>
  );
}

function AgentOutput({ agents }: { agents: AgentFinding[] }) {
  return (
    <div className="space-y-3">
      {agents.map((agent) => (
        <div key={agent.agentKey} className="rounded-md border border-ink-800 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-bold text-slate-900">{agent.name}</h4>
            <span className="font-mono text-2xs font-bold text-slate-600">Confidence {agent.confidence == null ? 'Unavailable' : `${agent.confidence}%`}</span>
          </div>
          <p className="mt-2 text-xs font-medium text-slate-800">{agent.finding}</p>
          <p className="mt-1 text-2xs text-slate-600">{agent.conclusion}</p>
          {agent.observations.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-2xs font-medium text-slate-700">
              {agent.observations.map((observation, index) => <li key={`${agent.agentKey}-${index}`}>{observation}</li>)}
            </ul>
          )}
          {agent.evidence.length > 0 && (
            <ul className="mt-3 space-y-2">
              {agent.evidence.map((item) => (
                <li key={item.id} className="border-l-2 border-blue-500 pl-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-2xs font-bold text-slate-800">{item.label}</span>
                    <span className="font-mono text-2xs font-bold text-slate-600">{item.strength}/100</span>
                  </div>
                  <p className="mt-0.5 text-2xs text-slate-600">{item.description}</p>
                  <div className="mt-1 text-[10px] font-medium text-slate-500">{item.source} · {item.relationship} · {item.timestamp}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function stageOutcome(stage: TraceStage): string {
  const output = stage.output;
  switch (stage.key) {
    case 'ingestion': return `Accepted event ${String(output.eventId ?? '')}`;
    case 'feature_engine': return `${stage.evidence.length} feature evidence items produced`;
    case 'ml_intelligence': {
      const modelName = String(output.model && typeof output.model === 'object' ? (output.model as Record<string, unknown>).name ?? 'Model' : 'Model');
      const probability = typeof output.fraudProbability === 'number' ? formatPercentage(output.fraudProbability) : '—';
      return `${modelName} · fraud probability ${probability}`;
    }
    case 'graph_intelligence': return `${Array.isArray(output.entities) ? output.entities.length : 0} entities · ${Array.isArray(output.relationships) ? output.relationships.length : 0} relationships`;
    case 'ring_detection': return output.detected ? `Ring detected · ${Array.isArray(output.members) ? output.members.length : 0} members` : 'No ring detected';
    case 'investigator_agents': return `${Array.isArray(output.agents) ? output.agents.length : 0} agents completed`;
    case 'risk_assessment': return `Risk ${String(output.riskScore ?? '—')}/100 · ${String(output.severity ?? 'unrated')}`;
    case 'response':
    case 'countermeasure': return String(output.recommendedAction ?? output.type ?? output.action ?? 'Response recorded');
    case 'report_generation': return output.reportGenerated ? 'Forensic report generated' : 'Report status unavailable';
    default: return stage.status;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h4 className="mb-2 text-2xs font-bold uppercase tracking-widest text-slate-500">{title}</h4>{children}</div>;
}

function DataGrid({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return <p className="text-xs text-slate-500">No data.</p>;
  return (
    <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 rounded-md border border-ink-800 bg-slate-50 p-3 sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div key={k} className="min-w-0">
          {typeof v === 'object' && v !== null ? (
            <>
              <dt className="text-xs font-bold text-slate-700">{k}</dt>
              <dd className="mt-1 min-w-0 max-w-full overflow-x-auto rounded border border-slate-800 bg-slate-900 p-2">
                <pre className="whitespace-pre-wrap break-words font-mono text-2xs leading-relaxed text-emerald-400">{JSON.stringify(v, null, 2)}</pre>
              </dd>
            </>
          ) : (
            <KeyVal label={k} value={String(v)} />
          )}
        </div>
      ))}
    </dl>
  );
}
