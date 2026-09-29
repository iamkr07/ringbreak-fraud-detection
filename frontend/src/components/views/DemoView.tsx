import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, ChevronLeft, ChevronRight, Pause, RotateCcw, ArrowRight,
  Zap, Cpu, BrainCircuit, Network, Target, Users, Shield, Siren,
  Clock, FolderOpen,
} from 'lucide-react';
import { Panel, KeyVal, Divider } from '@/components/ui/Primitives';
import { stageStatusColor, stageStatusDot, stageStatusBg } from '@/lib/format';
import { buildInvestigation, defaultPayload, mockActivity } from '@/data/mock';
import type { ViewKey } from '@/components/layout/Sidebar';
import type { PayloadLabGroup, Investigation } from '@/types';
import { useStore } from '@/store/context';
import { createApi } from '@/services/api';

const STAGE_ICONS = [Zap, Cpu, BrainCircuit, Network, Target, Users, Shield, Siren];

const DEMO_CASE = {
  caseId: 'RING-CASE-001',
  type: 'COORDINATED TRANSACTION NETWORK',
  status: 'INVESTIGATION READY',
  description: 'A synthetic transaction has triggered multiple behavioural and network signals. Follow the investigation to determine whether the activity belongs to a coordinated fraud ring.',
};

export function DemoView({ onNavigate }: { onNavigate: (v: ViewKey, group?: PayloadLabGroup) => void }) {
  const { setInvestigation } = useStore();
  const defaultInvestigation = useMemo(() => buildInvestigation(defaultPayload), []);
  const [liveCase, setLiveCase] = useState<Investigation | null>(null);

  useEffect(() => {
    const api = createApi('LIVE');
    api.getDemoCase()
      .then((c) => { if (c) setLiveCase(c); })
      .catch(() => { /* offline / fallback */ });
  }, []);

  const investigation = liveCase ?? defaultInvestigation;
  const stages = investigation.trace.stages;
  const [phase, setPhase] = useState<'intro' | 'running'>('intro');
  const [currentStep, setCurrentStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalSteps = stages.length;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const advance = useCallback(() => {
    setPaused(false);
    clearTimer();
    setPhase('running');
    setCurrentStep((s) => Math.min(s + 1, totalSteps - 1));
  }, [clearTimer, totalSteps]);

  const goBack = useCallback(() => {
    setPaused(true);
    clearTimer();
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, [clearTimer]);

  const restart = useCallback(() => {
    clearTimer();
    setPaused(false);
    setCurrentStep(0);
    setPhase('running');
  }, [clearTimer]);

  const skipToInvestigation = useCallback(() => {
    clearTimer();
    setInvestigation(investigation);
    onNavigate('investigation');
  }, [clearTimer, investigation, onNavigate, setInvestigation]);

  // Auto-advance timer
  useEffect(() => {
    if (phase !== 'running' || paused) return;
    if (currentStep >= totalSteps - 1) return;
    timerRef.current = setTimeout(() => {
      setCurrentStep((s) => Math.min(s + 1, totalSteps - 1));
    }, 3000);
    return () => clearTimer();
  }, [phase, paused, currentStep, totalSteps, clearTimer]);

  // --- INTRO PHASE ---
  if (phase === 'intro') {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <Play className="h-5 w-5 text-signal-400" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Live Demo</h2>
            <p className="text-xs text-slate-600">A guided walkthrough of a preconfigured fraud investigation.</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <div className="border-b border-slate-200 bg-slate-100 px-6 py-4">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-signal-400" />
              <span className="text-2xs font-semibold uppercase tracking-widest text-slate-700">Case File</span>
            </div>
          </div>
          <div className="px-6 py-6 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <CaseField label="Case" value={DEMO_CASE.caseId} />
              <CaseField label="Type" value={DEMO_CASE.type} />
              <CaseField label="Status" value={DEMO_CASE.status} accent="safe" />
            </div>
            <Divider />
            <div>
              <div className="mb-2 text-2xs font-semibold uppercase tracking-widest text-slate-600">Description</div>
              <p className="text-sm leading-relaxed font-medium text-slate-800">{DEMO_CASE.description}</p>
            </div>

            {/* Case transaction preview */}
            <Divider label="Transaction Under Investigation" />
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
              <KeyVal label="Sender" value={investigation.payload.senderAccount} />
              <KeyVal label="Receiver" value={investigation.payload.receiverAccount} />
              <KeyVal label="Amount" value={`${investigation.payload.amount.toLocaleString()} ${investigation.payload.currency}`} />
              <KeyVal label="Type" value={investigation.payload.transactionType} />
              <KeyVal label="Device" value={investigation.payload.deviceId} />
              <KeyVal label="IP" value={investigation.payload.ipAddress} />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => onNavigate('home')}
                className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-600 hover:text-slate-900"
              >
                <ChevronLeft className="h-4 w-4" /> Back to Home
              </button>
              <button
                type="button"
                onClick={() => { setPhase('running'); setCurrentStep(0); }}
                className="inline-flex items-center gap-2 rounded-md border border-signal-500/40 bg-signal-500/15 px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-blue-700 transition-all hover:bg-signal-500/25"
              >
                Begin Investigation <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('payload', 'DEMO')}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-slate-700 hover:bg-slate-200"
              >
                Open Demo Scenarios <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- RUNNING PHASE ---
  const stage = stages[currentStep];
  const isComplete = currentStep >= totalSteps - 1;
  const Icon = STAGE_ICONS[currentStep] ?? Zap;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Play className="h-5 w-5 text-signal-400" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Live Demo</h2>
            <p className="text-xs text-slate-600">{DEMO_CASE.caseId} · {investigation.investigationId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 shadow-sm">
          <span className="text-2xs uppercase tracking-widest text-slate-600">Stage</span>
          <span className="font-mono text-xs font-semibold text-slate-900">{String(currentStep + 1).padStart(2, '0')}/{String(totalSteps).padStart(2, '0')}</span>
        </div>
      </div>

      {/* Progress rail */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {stages.map((s, i) => {
            const StageIcon = STAGE_ICONS[i] ?? Zap;
            const isPast = i < currentStep;
            const isCurrent = i === currentStep;
            return (
              <div key={s.key} className="flex flex-1 items-center gap-1.5 sm:gap-2">
                <div className={`relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border transition-all ${
                  isPast ? 'border-safe-500/30 bg-safe-500/10'
                  : isCurrent ? 'border-signal-500/50 bg-signal-500/15 shadow-glow-signal'
                  : 'border-slate-200 bg-slate-100'
                }`}>
                  <StageIcon className={`h-4 w-4 ${isPast ? 'text-emerald-700' : isCurrent ? 'text-blue-700' : 'text-slate-500'}`} />
                  {isCurrent && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-blue-500 animate-pulse-soft" />}
                </div>
                {i < stages.length - 1 && (
                  <div className={`h-px flex-1 ${isPast ? 'bg-safe-500/30' : 'bg-slate-200'}`} />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between">
          {stages.map((s, i) => (
            <span key={s.key} className={`flex-1 text-center font-mono text-2xs font-semibold ${i === currentStep ? 'text-blue-700' : i < currentStep ? 'text-emerald-700' : 'text-slate-500'}`}>
              {String(i + 1).padStart(2, '0')}
            </span>
          ))}
        </div>
      </div>

      {/* Stage detail */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Main stage card */}
        <div className="lg:col-span-2">
          <Panel>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-5"
              >
                {/* Stage header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-lg border ${stageStatusBg(stage.status)}`}>
                      <Icon className={`h-6 w-6 ${stageStatusColor(stage.status)}`} />
                    </div>
                    <div>
                      <div className="font-mono text-2xs font-bold text-slate-500">STAGE {String(stage.index).padStart(2, '0')}</div>
                      <h3 className="text-base font-semibold text-slate-900">{stage.label}</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider ${stageStatusBg(stage.status)} ${stageStatusColor(stage.status)}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${stageStatusDot(stage.status)}`} /> {stage.status}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-2xs text-slate-600">
                      <Clock className="h-3 w-3" /> {stage.durationMs}ms
                    </span>
                  </div>
                </div>

                <Divider />

                {/* Input / Output */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <DataBlock title="Input" data={stage.input} />
                  <DataBlock title="Output" data={stage.output} />
                </div>

                {/* Evidence */}
                {stage.evidence.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-2xs font-semibold uppercase tracking-widest text-slate-700">Evidence Discovered</h4>
                    <ul className="space-y-2">
                      {stage.evidence.map((e) => (
                        <li key={e.id} className="rounded-md border border-warn-500/20 bg-warn-500/5 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-900">{e.label}</span>
                            <span className="font-mono text-2xs font-bold text-warn-600">{e.strength}/100</span>
                          </div>
                          <p className="mt-1 text-2xs text-slate-600">{e.description}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </Panel>
        </div>

        {/* Side panel: activity + metadata */}
        <div className="space-y-4">
          <Panel title="Activity Log">
            <ul className="space-y-1.5">
              {mockActivity.slice(0, currentStep + 2).map((a) => (
                <li key={a.id} className="flex gap-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <span className="font-mono text-2xs text-slate-500">{a.time}</span>
                  <span className={`text-2xs font-medium ${
                    a.severity === 'critical' ? 'text-risk-600 font-bold'
                    : a.severity === 'warning' ? 'text-warn-600 font-bold'
                    : a.severity === 'success' ? 'text-emerald-700 font-bold'
                    : 'text-slate-700'
                  }`}>{a.label}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Trace Metadata">
            <dl className="space-y-1">
              <KeyVal label="Trace ID" value={investigation.traceId} />
              <KeyVal label="Event ID" value={investigation.eventId} />
              <KeyVal label="Investigation" value={investigation.investigationId} />
              <KeyVal label="Started" value={stage.startedAt} />
            </dl>
          </Panel>
        </div>
      </div>

      {/* Controls */}
      <div className="sticky bottom-0 flex items-center justify-between rounded-lg border border-slate-300 bg-white/95 px-4 py-3 shadow-md backdrop-blur-sm">
        <button
          type="button"
          onClick={goBack}
          disabled={currentStep === 0}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={restart}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900"
          >
            <RotateCcw className="h-4 w-4" /> Restart
          </button>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            disabled={isComplete}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {paused ? <><Play className="h-4 w-4" /> Resume</> : <><Pause className="h-4 w-4" /> Pause</>}
          </button>
          {isComplete ? (
            <button
              type="button"
              onClick={skipToInvestigation}
              className="inline-flex items-center gap-2 rounded-md border border-signal-500/40 bg-signal-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-blue-700 transition-all hover:bg-signal-500/25"
            >
              Skip to Investigation <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={advance}
              className="inline-flex items-center gap-2 rounded-md border border-signal-500/40 bg-signal-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-blue-700 transition-all hover:bg-signal-500/25"
            >
              Next Stage <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CaseField({ label, value, accent }: { label: string; value: string; accent?: 'safe' }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="text-2xs font-semibold uppercase tracking-widest text-slate-600">{label}</div>
      <div className={`mt-1 font-mono text-sm font-semibold ${accent === 'safe' ? 'text-emerald-700 font-bold' : 'text-slate-900'}`}>{value}</div>
    </div>
  );
}

function DataBlock({ title, data }: { title: string; data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-2xs font-semibold uppercase tracking-widest text-slate-700">{title}</div>
      <dl className="space-y-1">
        {entries.map(([k, v]) => (
          <KeyVal key={k} label={k} value={String(typeof v === 'object' ? JSON.stringify(v) : v)} />
        ))}
      </dl>
    </div>
  );
}
