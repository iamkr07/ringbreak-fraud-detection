import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, ChevronRight, X, Clock, Hash, FileText, Activity, Shield, Zap,
  BrainCircuit, Network, Target, Users, Siren, type LucideIcon,
} from 'lucide-react';
import { useStore } from '@/store/context';
import { Panel, EmptyState, KeyVal, Divider } from '@/components/ui/Primitives';
import { stageStatusColor, stageStatusDot, stageStatusBg } from '@/lib/format';
import { formatPercentage } from '@/lib/format';
import { buildWorkflowNodes } from '@/data/mock';
import type { TraceStage, WorkflowNode } from '@/types';
import type { ViewKey } from '@/components/layout/Sidebar';
import { GuidedNavigation } from '@/components/layout/GuidedNavigation';

const STAGE_ICONS: Record<string, LucideIcon> = {
  ingestion: Activity,
  transaction_ingestion: Activity,
  feature_engine: Zap,
  feature_extraction: Zap,
  ml_intelligence: BrainCircuit,
  ml_inference: BrainCircuit,
  ml_analysis: BrainCircuit,
  graph_intelligence: Network,
  graph_analysis: Network,
  graph_construction: Network,
  ring_detection: Target,
  investigator_agents: Users,
  agent_analysis: Users,
  risk: Shield,
  risk_assessment: Shield,
  response: Siren,
  countermeasure: Siren,
  report_generation: FileText,
};

export function InvestigationView({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const { investigation } = useStore();
  const [selectedStage, setSelectedStage] = useState<number | null>(null);

  const nodes: WorkflowNode[] = useMemo(() => {
    if (!investigation) return [];
    return buildWorkflowNodes(investigation.trace);
  }, [investigation]);

  const stages: TraceStage[] = useMemo(() => investigation?.trace.stages ?? [], [investigation]);
  const ingestionProvenance = stages.find((stage) => stage.key === 'ingestion')?.input.provenance as Record<string, unknown> | undefined;
  const isFraudTargetSet = ingestionProvenance?.workflow === 'fraud_target_set';
  const mlOutput = stages.find((stage) => stage.key === 'ml_intelligence')?.output;

  const pipelineCompletion = useMemo(() => {
    if (stages.length === 0) return 0;
    const done = stages.filter((s) => s.status === 'complete' || s.status === 'warning' || s.status === 'error').length;
    return Math.round((done / stages.length) * 100);
  }, [stages]);

  const gridCols = useMemo(() => {
    const n = nodes.length;
    if (n <= 4) return 'grid-cols-2 sm:grid-cols-4';
    if (n <= 5) return 'grid-cols-3 sm:grid-cols-5';
    if (n <= 6) return 'grid-cols-3 sm:grid-cols-3 lg:grid-cols-6';
    if (n <= 8) return 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-8';
    return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10';
  }, [nodes.length]);

  if (!investigation) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center gap-3">
          <Search className="h-5 w-5 text-signal-400" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Investigation</h2>
            <p className="text-xs text-slate-600">Follow the transaction through the full forensic pipeline.</p>
          </div>
        </div>
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title="No investigation in progress"
          description="Inject a transaction from the Payload Lab to start the pipeline."
          action={
            <button onClick={() => onNavigate('payload')} className="rounded-md border border-signal-500/30 bg-signal-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-blue-700 hover:bg-signal-500/20">
              Go to Payload Lab
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Search className="h-5 w-5 text-signal-400" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Investigation Pipeline</h2>
            <p className="text-xs text-slate-600">{investigation.investigationId} · {investigation.traceId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 shadow-sm">
          <span className="text-2xs uppercase tracking-widest text-slate-600">State</span>
          <span className="font-mono text-xs font-semibold text-emerald-700">{investigation.state}</span>
          <span className="mx-1 h-4 w-px bg-slate-200" />
          <span className="text-2xs uppercase tracking-widest text-slate-600">Pipeline</span>
          <span className={`font-mono text-xs font-semibold ${pipelineCompletion === 100 ? 'text-emerald-700' : pipelineCompletion >= 50 ? 'text-warn-600' : 'text-blue-700'}`}>{pipelineCompletion}%</span>
        </div>
      </div>

      {/* Pipeline */}
      <Panel title="Investigation Stages" subtitle="Click any stage to inspect input, process, output, and evidence">
        <div className={`grid ${gridCols} gap-3`}>
          {nodes.map((node, i) => {
            const Icon = STAGE_ICONS[node.key] ?? Hash;
            const stage = stages[i];
            return (
              <button
                key={`${node.key}-${i}`}
                type="button"
                onClick={() => setSelectedStage(i)}
                className={`group relative flex flex-col rounded-lg border p-3 text-left transition-all hover:scale-[1.02] ${stageStatusBg(node.status)}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-2xs font-bold text-slate-500">{String(i + 1).padStart(2, '0')}</span>
                  <span className={`h-2 w-2 rounded-full ${stageStatusDot(node.status)}`} />
                </div>
                <Icon className={`mt-2 h-5 w-5 ${stageStatusColor(node.status)}`} />
                <div className="mt-2 text-2xs font-semibold uppercase tracking-wider text-slate-800">{node.label}</div>
                <div className="mt-1 text-2xs text-slate-600">{node.resultLabel}</div>
                <div className={`mt-0.5 truncate font-mono text-sm font-semibold ${stageStatusColor(node.status)}`}>
                  {node.key === 'graph_intelligence' && stage && Array.isArray(stage.output.entities)
                    ? `${stage.output.entities.length} entities detected`
                    : node.resultValue}
                </div>
                {stage && (
                  <div className="mt-1 flex items-center gap-1 text-2xs text-slate-600">
                    <Clock className="h-2.5 w-2.5" /> {stage.durationMs}ms
                  </div>
                )}
                <ChevronRight className="absolute right-2 top-2 h-3 w-3 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
      </Panel>

      {/* Summary row */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Transaction" className="lg:col-span-1">
          <dl className="space-y-1">
            <KeyVal label="Amount" value={`${investigation.payload.amount.toLocaleString()} ${investigation.payload.currency}`} />
            <KeyVal label="Type" value={investigation.payload.transactionType} />
            <KeyVal label="Sender" value={investigation.payload.senderAccount} />
            <KeyVal label="Receiver" value={investigation.payload.receiverAccount} />
            <KeyVal label="Device" value={investigation.payload.deviceId} />
            <KeyVal label="IP" value={investigation.payload.ipAddress} />
            <KeyVal label="Location" value={investigation.payload.location} />
          </dl>
        </Panel>

        <Panel title="Outcome Summary" className="lg:col-span-2">
          {isFraudTargetSet && (
            <p className="mb-3 rounded-md border border-warn-500/25 bg-warn-500/5 p-3 text-xs text-warn-700">
              Collective scope: graph and ring findings use the five source account relationships. ML and fraud probability are for this transaction; its risk and response are transaction-level outputs informed by collective ring context. Agent findings combine this transaction's features with the collective graph and ring evidence.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SummaryCard label="Model Prediction" value={String(mlOutput?.classification ?? 'Unavailable')} />
            <SummaryCard label="Risk Score" value={investigation.risk ? `${investigation.risk.score}/100` : '—'} level={investigation.risk?.level} />
            <SummaryCard label="Fraud Probability" value={investigation.risk ? formatPercentage(investigation.risk.fraudProbability) : '—'} />
            <SummaryCard label="Ring Detected" value={investigation.ring?.detected ? investigation.ring.ringId : 'NONE'} level={investigation.ring?.detected ? 'CRITICAL' : 'LOW'} />
            <SummaryCard label="Countermeasure" value={investigation.response?.recommendedAction ?? 'NONE'} />
          </div>
          <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-900">{investigation.risk?.explanation ?? 'Risk explanation unavailable.'}</p>
            {investigation.risk?.factors.map((factor) => (
              <p key={factor.key} className="text-2xs text-slate-600">{factor.label}: {factor.detail}</p>
            ))}
            {!investigation.ring?.detected && (
              <p className="text-2xs text-slate-600">No ring candidate was returned. This is a relationship finding, not a fraud verdict; a single-record investigation may not contain enough linked activity to establish a ring.</p>
            )}
          </div>
          <Divider />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onNavigate('intelligence')} className="rounded-md border border-slate-300 bg-slate-100 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-slate-700 hover:bg-slate-200 hover:text-slate-900">Intelligence</button>
            <button onClick={() => onNavigate('network')} className="rounded-md border border-slate-300 bg-slate-100 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-slate-700 hover:bg-slate-200 hover:text-slate-900">Network</button>
            <button onClick={() => onNavigate('trace')} className="rounded-md border border-slate-300 bg-slate-100 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-slate-700 hover:bg-slate-200 hover:text-slate-900">Trace</button>
            <button onClick={() => onNavigate('forensic')} className="rounded-md border border-slate-300 bg-slate-100 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-slate-700 hover:bg-slate-200 hover:text-slate-900">Report</button>
          </div>
        </Panel>
      </div>

      {/* Inspection drawer */}
      <AnimatePresence>
        {selectedStage !== null && stages[selectedStage] && (
          <StageDrawer stage={stages[selectedStage]} onClose={() => setSelectedStage(null)} />
        )}
      </AnimatePresence>
      <GuidedNavigation current="investigation" onNavigate={onNavigate} />
    </div>
  );
}

function SummaryCard({ label, value, level }: { label: string; value: string; level?: import('@/types').RiskLevel }) {
  const color = level === 'CRITICAL' || level === 'HIGH' ? 'text-risk-400 font-bold' : level === 'MEDIUM' ? 'text-warn-400 font-bold' : level === 'LOW' ? 'text-emerald-700 font-bold' : 'text-slate-900 font-semibold';
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="text-2xs font-semibold uppercase tracking-widest text-slate-600">{label}</div>
      <div className={`mt-1 font-mono text-sm ${color}`}>{value}</div>
    </div>
  );
}

function StageDrawer({ stage, onClose }: { stage: TraceStage; onClose: () => void }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-30 bg-black/50" onClick={onClose}
      />
      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.2 }}
        className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-slate-300 bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xs font-bold text-slate-500">{String(stage.index).padStart(2, '0')}</span>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-900">{stage.label}</h3>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider ${stageStatusBg(stage.status)} ${stageStatusColor(stage.status)}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${stageStatusDot(stage.status)}`} /> {stage.status}
            </span>
            <span className="inline-flex items-center gap-1 text-2xs text-slate-600"><Clock className="h-3 w-3" /> {stage.durationMs}ms</span>
            <span className="inline-flex items-center gap-1 text-2xs text-slate-600"><FileText className="h-3 w-3" /> {stage.startedAt}</span>
          </div>

          <Section title="Input">
            <DataGrid data={stage.input} />
          </Section>

          <Section title="Output">
            <DataGrid data={stage.output} />
          </Section>

          <Section title="Evidence">
            {stage.evidence.length > 0 ? (
              <ul className="space-y-2">
                {stage.evidence.map((e) => (
                  <li key={e.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900">{e.label}</span>
                      <span className="font-mono text-2xs font-bold text-warn-600">{e.strength}/100</span>
                    </div>
                    <p className="mt-1 text-2xs text-slate-600">{e.description}</p>
                    <div className="mt-1.5 flex items-center gap-2 text-2xs text-slate-500">
                      <span>Source: {e.source}</span>
                      <span>·</span>
                      <span>{e.timestamp}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-600">No evidence items for this stage.</p>
            )}
          </Section>

          <Divider label="Metadata" />
          <dl className="space-y-1">
            <KeyVal label="Trace ID" value={stage.traceId} />
            <KeyVal label="Started" value={stage.startedAt} />
            <KeyVal label="Completed" value={stage.completedAt ?? '—'} />
            <KeyVal label="Duration" value={`${stage.durationMs}ms`} />
          </dl>
        </div>
      </motion.div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-2xs font-semibold uppercase tracking-widest text-slate-700">{title}</h4>
      {children}
    </div>
  );
}

function DataGrid({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return <p className="text-xs text-slate-600">No data.</p>;
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <KeyVal key={k} label={k} value={String(typeof v === 'object' ? JSON.stringify(v) : v)} />
      ))}
    </dl>
  );
}
