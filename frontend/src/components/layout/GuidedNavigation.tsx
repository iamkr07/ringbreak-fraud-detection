import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '@/store/context';
import type { ViewKey } from './Sidebar';

export const INVESTIGATION_STAGES: ViewKey[] = [
  'payload',
  'investigation',
  'network',
  'intelligence',
  'agents',
  'risk',
  'trace',
  'forensic',
];

export function GuidedNavigation({ current, onNavigate }: { current: ViewKey; onNavigate: (view: ViewKey) => void }) {
  const { investigation } = useStore();
  const stageIndex = INVESTIGATION_STAGES.indexOf(current);
  if (stageIndex < 0) return null;

  const previous = INVESTIGATION_STAGES[stageIndex - 1];
  const next = INVESTIGATION_STAGES[stageIndex + 1];
  const disabled = !investigation && current !== 'payload';

  return (
    <div className="flex items-center justify-between border-t border-ink-700 pt-4">
      <button
        type="button"
        onClick={() => previous && onNavigate(previous)}
        disabled={!previous || disabled}
        className="inline-flex items-center gap-2 rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-ink-400 hover:bg-ink-750 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" /> Previous
      </button>
      <span className="font-mono text-2xs text-ink-600">{stageIndex + 1}/{INVESTIGATION_STAGES.length}</span>
      <button
        type="button"
        onClick={() => next && onNavigate(next)}
        disabled={!next || disabled}
        className="inline-flex items-center gap-2 rounded-md border border-signal-500/30 bg-signal-500/10 px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-signal-300 hover:bg-signal-500/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
