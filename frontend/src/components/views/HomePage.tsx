import { motion } from 'framer-motion';
import {
  Boxes, Play, FlaskConical, ArrowRight, Activity, BrainCircuit,
  Network, Target, Users, Shield, Zap, Cpu, Globe, Siren,
  CheckCircle2, Radio,
} from 'lucide-react';
import { useStore } from '@/store/context';
import type { ViewKey } from '@/components/layout/Sidebar';
import type { PayloadLabGroup } from '@/types';

const PIPELINE_STAGES = [
  { label: 'TRANSACTION', icon: Zap },
  { label: 'FEATURES', icon: Cpu },
  { label: 'ML', icon: BrainCircuit },
  { label: 'NETWORK', icon: Network },
  { label: 'RING', icon: Target },
  { label: 'AGENTS', icon: Users },
  { label: 'RISK', icon: Shield },
  { label: 'RESPONSE', icon: Siren },
];

const HOW_IT_WORKS = [
  { num: '01', title: 'INJECT', desc: 'Create or load a synthetic transaction into the pipeline.' },
  { num: '02', title: 'INVESTIGATE', desc: 'RING//BREAK extracts behavioural and network signals.' },
  { num: '03', title: 'CONNECT', desc: 'Graph intelligence identifies suspicious relationships and potential rings.' },
  { num: '04', title: 'EXPLAIN', desc: 'Agents correlate evidence and produce an auditable risk decision.' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export function HomePage({ onNavigate }: { onNavigate: (v: ViewKey, group?: PayloadLabGroup) => void }) {
  const { systemStatus, systemStatusLoading } = useStore();
  const activeMode = systemStatus?.mode ?? 'UNKNOWN';
  const backendReachable = Boolean(systemStatus?.backendReachable);
  const statusLabel = systemStatus
    ? backendReachable ? 'OPERATIONAL' : 'DEGRADED'
    : systemStatusLoading ? 'CHECKING' : 'UNAVAILABLE';

  const startSimulation = () => onNavigate('payload', 'DIRECT');
  const startDemo = () => onNavigate('demo');

  return (
    <div className="mx-auto max-w-6xl space-y-12">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-xl border border-ink-800 bg-white bg-grid-fine px-8 py-16 shadow-sm sm:px-12 sm:py-20">
        <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-blue-500/5 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-32 w-64 -translate-x-1/2 rounded-full bg-red-500/5 blur-3xl" />

        <div className="relative">
          <motion.div
            initial="hidden" animate="visible"
            variants={fadeUp} transition={{ duration: 0.4 }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-blue-200 bg-blue-50">
                <Boxes className="h-6 w-6 text-signal-600" />
              </div>
              <div className="font-mono text-2xl font-bold tracking-tightest text-slate-900 sm:text-3xl">RING//BREAK</div>
            </div>
          </motion.div>

          <motion.div
            initial="hidden" animate="visible"
            variants={fadeUp} transition={{ duration: 0.4, delay: 0.1 }}
            className="mt-6"
          >
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              FIND THE RING.<br />
              <span className="text-blue-600">BREAK THE CHAIN.</span>
            </h1>
          </motion.div>

          <motion.p
            initial="hidden" animate="visible"
            variants={fadeUp} transition={{ duration: 0.4, delay: 0.2 }}
            className="mt-4 max-w-xl text-sm font-medium leading-relaxed text-slate-700 sm:text-base"
          >
            An interactive financial fraud-ring investigation and forensic intelligence platform.
          </motion.p>
          <motion.p
            initial="hidden" animate="visible"
            variants={fadeUp} transition={{ duration: 0.4, delay: 0.3 }}
            className="mt-2 max-w-xl text-xs leading-relaxed text-slate-500 sm:text-sm"
          >
            Inject a transaction. Follow the evidence. Discover the network. Understand why the system reached its conclusion.
          </motion.p>

          {/* CTA cards */}
          <motion.div
            initial="hidden" animate="visible"
            variants={fadeUp} transition={{ duration: 0.4, delay: 0.4 }}
            className="mt-8 space-y-3"
          >
            <button
              type="button"
              onClick={startSimulation}
              className="group relative block w-full overflow-hidden rounded-lg border border-blue-200 bg-blue-50/60 p-6 text-left transition-all hover:border-blue-300 hover:bg-blue-50 shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-blue-200 bg-white">
                  <FlaskConical className="h-5 w-5 text-blue-600" />
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-blue-700">SIMULATION MODE</div>
              </div>
              <p className="mt-4 text-sm font-medium text-slate-800">Open the live AMLSim case lab and select a real Benign or Fraud record to drive the active investigation.</p>
              <div className="mt-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-700 transition-transform group-hover:gap-3">
                START SIMULATION <ArrowRight className="h-4 w-4" />
              </div>
            </button>

            <button
              type="button"
              onClick={startDemo}
              className="group relative block w-full overflow-hidden rounded-lg border border-ink-800 bg-white p-4 text-left transition-all hover:border-slate-300 hover:bg-slate-50 shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50">
                  <Play className="h-4 w-4 text-slate-700" />
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">WATCH LIVE DEMO</div>
              </div>
              <p className="mt-3 text-sm text-slate-700 font-medium">Explore a guided preconfigured fraud investigation without leaving the original walkthrough.</p>
            </button>
          </motion.div>
        </div>
      </div>

      {/* VISUAL PIPELINE */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-signal-600" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600">Investigation Pipeline</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-800 bg-white p-4 shadow-sm sm:flex-nowrap sm:overflow-x-auto">
          {PIPELINE_STAGES.map((stage, i) => {
            const Icon = stage.icon;
            return (
              <div key={stage.label} className="flex items-center gap-2">
                <motion.div
                  initial={{ opacity: 0.6 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.5 + i * 0.08, repeat: Infinity, repeatType: 'reverse', repeatDelay: 2 }}
                  className="flex items-center gap-2 rounded-md border border-ink-800 bg-slate-50 px-3 py-2.5"
                >
                  <Icon className="h-4 w-4 text-signal-600" />
                  <span className="font-mono text-2xs font-bold uppercase tracking-wider text-slate-800">{stage.label}</span>
                </motion.div>
                {i < PIPELINE_STAGES.length - 1 && (
                  <ArrowRight className="h-3 w-3 flex-shrink-0 text-slate-400" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-signal-600" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600">How It Works</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((step) => (
            <div key={step.num} className="rounded-lg border border-ink-800 bg-white p-5 shadow-xs">
              <div className="font-mono text-2xl font-bold text-slate-300">{step.num}</div>
              <h3 className="mt-2 text-sm font-bold uppercase tracking-widest text-slate-900">{step.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* SYSTEM STATUS */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-lg border border-ink-800 bg-white p-5 shadow-xs lg:col-span-1">
          <div className="flex items-center justify-between">
            <h3 className="text-2xs font-bold uppercase tracking-widest text-slate-600">System Status</h3>
            <div className="flex items-center gap-1.5">
              <Radio className={`h-3 w-3 ${backendReachable ? 'text-emerald-600' : 'text-red-600'}`} />
              <span className={`font-mono text-2xs font-bold ${backendReachable ? 'text-emerald-700' : 'text-red-700'}`}>{statusLabel}</span>
            </div>
          </div>
          <div className="mt-4 space-y-2.5">
            <StatusRow label="Backend API" status={backendReachable ? 'REACHABLE' : statusLabel} healthy={backendReachable} />
            <StatusRow label="Backend Runtime" status={activeMode} healthy={activeMode === 'LIVE'} />
            <StatusRow label="ML Model" status={systemStatus?.mlModel ?? 'UNKNOWN'} healthy={backendReachable && Boolean(systemStatus?.mlModel)} />
          </div>
          <div className="mt-4 border-t border-ink-800 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-bold uppercase tracking-widest text-slate-600">Mode</span>
              <span className="inline-flex items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-amber-800">
                <Siren className="h-3 w-3" /> {activeMode}
              </span>
            </div>
          </div>
        </div>

        {/* Architecture summary */}
        <div className="rounded-lg border border-ink-800 bg-white p-5 shadow-xs lg:col-span-2">
          <h3 className="text-2xs font-bold uppercase tracking-widest text-slate-600">Platform Architecture</h3>
          <p className="mt-3 text-xs leading-relaxed text-slate-700 font-medium">
            RING//BREAK is an investigation window into a financial fraud detection system. Every transaction
            is traced through a deterministic pipeline — from feature extraction to ML scoring, graph
            intelligence, ring detection, and correlated agent findings — producing an auditable forensic report.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ArchBadge icon={Zap} label="Feature Engine" />
            <ArchBadge icon={BrainCircuit} label="ML Intelligence" />
            <ArchBadge icon={Network} label="Graph Intelligence" />
            <ArchBadge icon={Target} label="Ring Detection" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ArchBadge icon={Users} label="Investigator Agents" />
            <ArchBadge icon={Shield} label="Risk Engine" />
            <ArchBadge icon={Activity} label="Trace Explorer" />
            <ArchBadge icon={Globe} label="Network Graph" />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-ink-800 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className={`h-3.5 w-3.5 ${backendReachable ? 'text-emerald-600' : 'text-red-600'}`} />
          <span className="text-2xs font-medium text-slate-600">{backendReachable ? 'Backend connection verified' : `Backend connection ${statusLabel.toLowerCase()}`}</span>
        </div>
        <div className="text-2xs font-medium text-slate-600">
          {systemStatus ? `v${systemStatus.version}` : ''} · {activeMode} MODE
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, status, healthy }: { label: string; status: string; healthy: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <span className={`inline-flex items-center gap-1.5 font-mono text-2xs font-bold ${healthy ? 'text-emerald-700' : 'text-red-700'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${healthy ? 'bg-emerald-500' : 'bg-red-500'}`} /> {status}
      </span>
    </div>
  );
}

function ArchBadge({ icon: Icon, label }: { icon: typeof Zap; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-ink-800 bg-slate-50 px-2.5 py-2">
      <Icon className="h-3.5 w-3.5 text-signal-600" />
      <span className="text-2xs font-bold text-slate-800">{label}</span>
    </div>
  );
}
