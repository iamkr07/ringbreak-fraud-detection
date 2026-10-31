import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ViewKey } from './Sidebar';
import { useStore } from '@/store/context';

const INVESTIGATION_STAGES = [
  'payload',
  'investigation',
  'network',
  'intelligence',
  'agents',
  'risk',
  'trace',
  'forensic',
] as const;

const STAGE_LABELS: Record<(typeof INVESTIGATION_STAGES)[number], string> = {
  payload: 'Payload Lab',
  investigation: 'Investigation',
  network: 'Network',
  intelligence: 'Intelligence',
  agents: 'Agents',
  risk: 'Risk & Response',
  trace: 'Trace Explorer',
  forensic: 'Forensic Report',
};

export function InvestigationStageNavigation({ active, onNavigate }: { active: ViewKey; onNavigate: (view: ViewKey) => void }) {
  const { investigation } = useStore();
  const stageIndex = INVESTIGATION_STAGES.indexOf(active as (typeof INVESTIGATION_STAGES)[number]);
  if (stageIndex < 0) return null;

  const previous = INVESTIGATION_STAGES[stageIndex - 1];
  const next = INVESTIGATION_STAGES[stageIndex + 1];

  return (
    <nav aria-label="Investigation stages" className="mb-5 flex items-center justify-between rounded-md border border-ink-800 bg-white px-3 py-2 shadow-xs">
      <button
        type="button"
        onClick={() => previous && onNavigate(previous)}
        disabled={!previous}
        className="inline-flex items-center gap-2 rounded border border-ink-800 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ArrowLeft className="h-4 w-4" /> Previous
      </button>
      <div className="min-w-0 px-3 text-center">
        <div className="text-2xs font-semibold uppercase text-slate-500">Stage {stageIndex + 1} of {INVESTIGATION_STAGES.length}</div>
        <div className="truncate text-xs font-bold text-slate-900">{STAGE_LABELS[active as (typeof INVESTIGATION_STAGES)[number]]}</div>
        {investigation && <div className="truncate font-mono text-[10px] text-slate-500 font-medium">{investigation.investigationId}</div>}
      </div>
      <button
        type="button"
        onClick={() => next && onNavigate(next)}
        disabled={!next || !investigation}
        className="inline-flex items-center gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next <ArrowRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
