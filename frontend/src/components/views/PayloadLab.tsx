import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  FlaskConical, Send, Shuffle, RotateCcw, Layers, CheckCircle2, AlertCircle,
  ArrowRight, Hash, Activity, Zap, ShieldAlert, RefreshCw, Eye, Network, Target,
  Search, ShieldX, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import { useStore } from '@/store/context';
import type { RingCheckResult } from '@/store/context';
import type { AmlSimTransaction, Currency, PayloadLabGroup, TransactionPayload, TransactionType } from '@/types';
import { Panel, Divider, KeyVal, EmptyState } from '@/components/ui/Primitives';
import { formatPercentage } from '@/lib/format';
import { GuidedNavigation } from '@/components/layout/GuidedNavigation';
import type { ViewKey } from '@/components/layout/Sidebar';

const CURRENCIES: Currency[] = ['USD', 'EUR', 'GBP', 'JPY', 'AED', 'SGD'];
const TX_TYPES: TransactionType[] = ['WIRE', 'P2P', 'CARD', 'ACH', 'CRYPTO', 'INTERNAL'];

const EMPTY: TransactionPayload = {
  senderAccount: '', receiverAccount: '', amount: 0, currency: 'USD',
  deviceId: '', ipAddress: '', location: '', merchantId: '',
  transactionType: 'WIRE', timestamp: new Date().toISOString(),
};

function randomHex(len: number) {
  return Array.from({ length: len }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
}

function randomPayload(): TransactionPayload {
  const cities = ['Frankfurt, DE', 'London, GB', 'Singapore, SG', 'New York, US', 'Dubai, AE', 'Tokyo, JP'];
  return {
    senderAccount: `ACC-${randomHex(4)}`,
    receiverAccount: `ACC-${randomHex(4)}`,
    amount: Math.floor(500 + Math.random() * 90000),
    currency: CURRENCIES[Math.floor(Math.random() * CURRENCIES.length)],
    deviceId: `DEV-${randomHex(3)}`,
    ipAddress: `${Math.floor(Math.random() * 223 + 1)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254 + 1)}`,
    location: cities[Math.floor(Math.random() * cities.length)],
    merchantId: `MCH-${randomHex(4)}`,
    transactionType: TX_TYPES[Math.floor(Math.random() * TX_TYPES.length)],
    timestamp: new Date().toISOString(),
  };
}

function normalizeTimestamp(timestamp: string): string {
  const value = timestamp.trim();
  if (value.startsWith('Step ') || value.startsWith('step_') || !Number.isNaN(Number(value))) return value;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) && !Number.isNaN(Date.parse(value))) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function amlSimTransactionToPayload(transaction: AmlSimTransaction): TransactionPayload {
  const step = Number.isFinite(transaction.timeStep) ? Number(transaction.timeStep) : 0;
  return {
    senderAccount: transaction.senderAccount,
    receiverAccount: transaction.receiverAccount,
    amount: Number.isFinite(transaction.amount) ? Number(transaction.amount) : 0,
    currency: 'USD',
    deviceId: '',
    ipAddress: '',
    location: '',
    merchantId: '',
    transactionType: transaction.transactionType || 'TRANSFER',
    timestamp: `Step ${step}`,
    timeStep: step,
  };
}

function Field({
  label, value, onChange, placeholder, mono = true, type = 'text',
}: { label: string; value: string | number; onChange: (v: string) => void; placeholder?: string; mono?: boolean; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-2xs font-semibold uppercase tracking-widest text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm ${mono ? 'font-mono' : ''} text-slate-900 placeholder-slate-400 transition-colors focus:border-blue-500 focus:bg-white focus:outline-none`}
      />
    </label>
  );
}

export function PayloadLab({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const {
    inject, loading, investigation, scenarios, payloadLabGroup, setPayloadLabGroup,
    scenarioPreview, scenarioLoading, loadScenarioPreview, investigateScenario, error,
    mode, amlsimTransactions, loadAmlSimInvestigation, amlsimInvestigation,
    checkRing, refreshAmlSimPresets,
  } = useStore();
  const [form, setForm] = useState<TransactionPayload>(() => {
    const saved = sessionStorage.getItem('ringbreak.payload-form');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return EMPTY;
  });
  const [showScenarioMenu, setShowScenarioMenu] = useState(false);
  const [loadedScenarioId, setLoadedScenarioId] = useState<string | null>(() => {
    return sessionStorage.getItem('ringbreak.payload-scenario-id');
  });
  const [demoPreviewed, setDemoPreviewed] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<'BENIGN' | 'FRAUD' | null>(() => {
    const saved = sessionStorage.getItem('ringbreak.payload-preset');
    return (saved === 'BENIGN' || saved === 'FRAUD') ? saved : 'BENIGN';
  });

  useEffect(() => {
    sessionStorage.setItem('ringbreak.payload-form', JSON.stringify(form));
  }, [form]);

  useEffect(() => {
    if (loadedScenarioId) sessionStorage.setItem('ringbreak.payload-scenario-id', loadedScenarioId);
    else sessionStorage.removeItem('ringbreak.payload-scenario-id');
  }, [loadedScenarioId]);

  useEffect(() => {
    if (selectedPreset) sessionStorage.setItem('ringbreak.payload-preset', selectedPreset);
    else sessionStorage.removeItem('ringbreak.payload-preset');
  }, [selectedPreset]);
  // Ring check state: map from transactionId -> { loading, result }
  const [ringCheckState, setRingCheckState] = useState<Record<string, { loading: boolean; result: RingCheckResult | null }>>({});
  const [activeRingCheckId, setActiveRingCheckId] = useState<string | null>(null);
  const [refreshingPreset, setRefreshingPreset] = useState<'BENIGN' | 'FRAUD' | null>(null);
  const visibleScenarios = useMemo(() => {
    if (payloadLabGroup === 'DEMO') return scenarios;
    return [];
  }, [payloadLabGroup, scenarios]);
  const simPresetTransactions = useMemo(() => {
    if (mode !== 'LIVE') return [];
    const filtered = amlsimTransactions.filter((transaction) => {
      if (!selectedPreset) return false;
      return transaction.datasetIsFraud === (selectedPreset === 'FRAUD');
    });
    return filtered.slice(0, 5);
  }, [amlsimTransactions, mode, selectedPreset]);

  const set = useCallback(<K extends keyof TransactionPayload>(key: K, val: TransactionPayload[K]) => {
    setLoadedScenarioId(null);
    setForm((f) => ({ ...f, [key]: val }));
  }, []);

  const valid = Boolean(
    form.senderAccount
    && form.receiverAccount
    && form.amount > 0
    && form.timestamp,
  );
  const scenarioStatus = scenarioLoading
    ? 'PROCESSING PREVIEW'
    : error && loadedScenarioId && !scenarioPreview
      ? 'FAILED'
      : loading && loadedScenarioId
        ? 'PROCESSING'
        : investigation && loadedScenarioId
          ? payloadLabGroup === 'DEMO' && demoPreviewed ? 'COMPLETED' : 'PROCESSING'
          : scenarioPreview
            ? 'LOADED · AWAITING INVESTIGATION'
            : 'NOT LOADED';

  const handleInject = useCallback(async () => {
    if (!valid) return;
    const payload = { ...form, timestamp: normalizeTimestamp(form.timestamp) };
    if (payloadLabGroup === 'DEMO') {
      setDemoPreviewed(true);
      if (loadedScenarioId === 'fraud_ring') {
        const correlationId = crypto.randomUUID();
        const ringAccountA = payload.senderAccount;
        const ringAccountB = payload.receiverAccount;
        const ringAccountC = 'ACC-SCENARIO-RING-03';
        const ringTransactions = [
          payload,
          { ...payload, senderAccount: ringAccountB, receiverAccount: ringAccountC },
          { ...payload, senderAccount: ringAccountC, receiverAccount: ringAccountA },
        ];
        for (const transaction of ringTransactions) {
          await inject(transaction, correlationId);
        }
        return;
      }
      await inject(payload);
      return;
    }
    if (loadedScenarioId && scenarioPreview?.previewToken) {
      await investigateScenario(loadedScenarioId, scenarioPreview.previewToken);
      return;
    }
    await inject(payload);
  }, [form, valid, inject, investigateScenario, loadedScenarioId, payloadLabGroup, scenarioPreview]);

  const handleRandomize = useCallback(() => {
    setLoadedScenarioId(null);
    setDemoPreviewed(false);
    setForm(randomPayload());
  }, []);
  const handleReset = useCallback(() => {
    setLoadedScenarioId(null);
    setDemoPreviewed(false);
    setForm(EMPTY);
    sessionStorage.removeItem('ringbreak.payload-form');
    sessionStorage.removeItem('ringbreak.payload-scenario-id');
    sessionStorage.removeItem('ringbreak.payload-preset');
  }, []);

  const handleLoadScenario = useCallback(async (id: string) => {
    const s = visibleScenarios.find((s) => s.id === id);
    if (s) {
      setLoadedScenarioId(s.id);
      setForm({ ...s.payload });
      setDemoPreviewed(false);
      await loadScenarioPreview(s.id);
    }
    setShowScenarioMenu(false);
  }, [loadScenarioPreview, visibleScenarios]);

  const investigationMlOutput = investigation?.trace.stages.find((stage) => stage.key === 'ml_intelligence')?.output;

  const handleAmlSimCaseSelection = useCallback(async (transactionId: string) => {
    const recorded = amlsimTransactions.find((transaction) => transaction.sourceTransactionId === transactionId);
    if (!recorded) return;

    const initialPayload = amlSimTransactionToPayload(recorded);
    setLoadedScenarioId(transactionId);
    setDemoPreviewed(false);
    setSelectedPreset(recorded.datasetIsFraud ? 'FRAUD' : 'BENIGN');
    setForm(initialPayload);
    setShowScenarioMenu(false);

    await loadAmlSimInvestigation(transactionId);
  }, [amlsimTransactions, loadAmlSimInvestigation]);

  const handleGroupChange = useCallback((group: PayloadLabGroup) => {
    setPayloadLabGroup(group);
    setLoadedScenarioId(null);
    setDemoPreviewed(false);
    setForm(EMPTY);
    setActiveRingCheckId(null);
  }, [setPayloadLabGroup]);

  const handleCheckRing = useCallback(async (transactionId: string) => {
    setActiveRingCheckId(transactionId);
    setRingCheckState((prev) => ({ ...prev, [transactionId]: { loading: true, result: null } }));
    try {
      const result = await checkRing(transactionId);
      setRingCheckState((prev) => ({ ...prev, [transactionId]: { loading: false, result } }));
    } catch {
      setRingCheckState((prev) => ({
        ...prev,
        [transactionId]: { loading: false, result: { transactionId, detected: false, reason: 'Ring check failed — backend error.', ring: null, relatedTransactions: [], totalChecked: 0 } },
      }));
    }
  }, [checkRing]);

  const handleInjectFromRingCheck = useCallback(async (transactionId: string) => {
    const recorded = amlsimTransactions.find((tx) => tx.sourceTransactionId === transactionId);
    if (!recorded) return;
    const initialPayload = amlSimTransactionToPayload(recorded);
    setLoadedScenarioId(transactionId);
    setDemoPreviewed(false);
    setSelectedPreset(recorded.datasetIsFraud ? 'FRAUD' : 'BENIGN');
    setForm(initialPayload);
    await loadAmlSimInvestigation(transactionId);
  }, [amlsimTransactions, loadAmlSimInvestigation]);

  const handleRefreshPreset = useCallback(async (preset: 'BENIGN' | 'FRAUD') => {
    setRefreshingPreset(preset);
    setActiveRingCheckId(null);
    try {
      await refreshAmlSimPresets(preset);
    } finally {
      setRefreshingPreset(null);
    }
  }, [refreshAmlSimPresets]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center gap-3">
        <FlaskConical className="h-5 w-5 text-signal-400" />
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Load Scenario</h2>
            <span className="inline-flex items-center gap-1.5 rounded border border-warn-500/30 bg-warn-500/10 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider text-warn-400">
              <ShieldAlert className="h-3 w-3" /> SELF-SIMULATION
            </span>
          </div>
          <p className="text-xs text-slate-600">Choose a controlled demo payload, inspect it, and send it through the AMLSim-backed pipeline.</p>
        </div>
      </div>

      <Panel className="relative z-30" title="Transaction Draft" subtitle={`Preset status: ${scenarioStatus}. Select a preset, review the preview, then inject explicitly.`}>
        <div className="space-y-5">
          {/* TRANSACTION */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-signal-400" />
              <span className="text-2xs font-semibold uppercase tracking-widest text-slate-700">Transaction</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Sender Account" value={form.senderAccount} onChange={(v) => set('senderAccount', v)} placeholder="ACC-1001" />
              <Field label="Receiver Account" value={form.receiverAccount} onChange={(v) => set('receiverAccount', v)} placeholder="ACC-2048" />
              <Field label="Amount" type="number" value={form.amount || ''} onChange={(v) => set('amount', Number(v))} placeholder="0" />
              <label className="block">
                <span className="mb-1 block text-2xs font-semibold uppercase tracking-widest text-slate-600">Currency</span>
                <select
                  value={form.currency}
                  onChange={(e) => set('currency', e.target.value as Currency)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 transition-colors focus:border-blue-500 focus:outline-none"
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-2xs font-semibold uppercase tracking-widest text-slate-600">Transaction Type</span>
                <select
                  value={form.transactionType}
                  onChange={(e) => set('transactionType', e.target.value as TransactionType)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 transition-colors focus:border-blue-500 focus:outline-none"
                >
                  {TX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <Field label="Timestamp" value={form.timestamp.slice(0, 19)} onChange={(v) => set('timestamp', v)} placeholder="ISO timestamp" />
            </div>
          </div>

          <Divider />

          {/* IDENTITY */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Hash className="h-3.5 w-3.5 text-signal-400" />
              <span className="text-2xs font-semibold uppercase tracking-widest text-slate-700">Identity</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Device ID" value={form.deviceId ?? ''} onChange={(v) => set('deviceId', v)} placeholder="DEV-7C3" />
              <Field label="IP Address" value={form.ipAddress ?? ''} onChange={(v) => set('ipAddress', v)} placeholder="203.0.113.42" />
              <Field label="Location" value={form.location ?? ''} onChange={(v) => set('location', v)} placeholder="Frankfurt, DE" mono={false} />
              <Field label="Merchant ID" value={form.merchantId ?? ''} onChange={(v) => set('merchantId', v)} placeholder="MCH-5521" />
            </div>
          </div>

          <Divider label="Actions" />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleInject}
              disabled={!valid || loading || scenarioLoading}
              className="inline-flex items-center gap-2 rounded-md border border-signal-500/40 bg-signal-500/15 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-blue-700 transition-all hover:bg-signal-500/25 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {loading ? <Activity className="h-4 w-4 animate-pulse-soft" /> : <Send className="h-4 w-4" />}
              {loading ? 'Processing…' : payloadLabGroup === 'DEMO' ? 'Inject Transaction' : loadedScenarioId ? 'Investigate Previewed Row' : 'Select Scenario'}
            </button>
            {payloadLabGroup === 'DEMO' && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowScenarioMenu((s) => !s)}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-100 px-3 py-2.5 text-xs font-semibold uppercase tracking-widest text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900"
                >
                  <Layers className="h-3.5 w-3.5" /> Load Scenario
                </button>
                {showScenarioMenu && (
                  <div className="absolute left-0 top-full z-20 mt-1 max-h-[calc(100vh-8rem)] w-64 overflow-auto rounded-md border border-slate-300 bg-white p-1 shadow-xl">
                    {visibleScenarios.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => void handleLoadScenario(s.id)}
                        className="block w-full rounded px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-2xs text-slate-500">{s.description}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-100 px-3 py-2.5 text-xs font-semibold uppercase tracking-widest text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        </div>
      </Panel>

      {mode === 'LIVE' && payloadLabGroup === 'DIRECT' && (
        <Panel title="Simulation Mode" subtitle="Choose a live AMLSim record set and select the exact transaction that becomes the active live case.">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {(['BENIGN', 'FRAUD'] as const).map((preset) => {
                const isActive = selectedPreset === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSelectedPreset(preset)}
                    className={`rounded-md border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                      isActive
                        ? (preset === 'FRAUD' ? 'border-risk-500/40 bg-risk-500/10 text-risk-700 font-bold' : 'border-safe-500/40 bg-safe-500/10 text-emerald-700 font-bold')
                        : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {preset} PRESET
                  </button>
                );
              })}
              {/* Refresh button for current preset */}
              {selectedPreset && (
                <button
                  type="button"
                  disabled={refreshingPreset === selectedPreset}
                  onClick={() => void handleRefreshPreset(selectedPreset)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshingPreset === selectedPreset ? 'animate-spin' : ''}`} />
                  {refreshingPreset === selectedPreset ? 'Refreshing…' : 'Refresh Records'}
                </button>
              )}
            </div>

            {!selectedPreset ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Select a preset to load five real AMLSim records.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {simPresetTransactions.length === 0 ? (
                  <div className="md:col-span-2 xl:col-span-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    Loading {selectedPreset.toLowerCase()} AMLSim records…
                  </div>
                ) : (
                  simPresetTransactions.map((transaction) => {
                    const selected = transaction.sourceTransactionId === loadedScenarioId || transaction.sourceTransactionId === amlsimInvestigation?.sourceTransactionId;
                    const ringState = ringCheckState[transaction.sourceTransactionId];
                    const isCheckingRing = ringState?.loading === true;
                    return (
                      <div
                        key={transaction.sourceTransactionId}
                        className={`rounded-md border p-3 transition-colors ${selected ? 'border-signal-500/40 bg-signal-500/10' : 'border-slate-200 bg-white shadow-sm'}`}
                      >
                        {/* Card header — clickable to select */}
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => void handleAmlSimCaseSelection(transaction.sourceTransactionId)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-900">{transaction.sourceTransactionId}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-widest font-bold ${transaction.datasetIsFraud ? 'bg-risk-500/10 text-risk-700' : 'bg-safe-500/10 text-emerald-700'}`}>
                              {transaction.datasetIsFraud ? 'FRAUD' : 'BENIGN'}
                            </span>
                          </div>
                          <div className="mt-2 text-2xs font-mono text-slate-700">{transaction.senderAccount} → {transaction.receiverAccount}</div>
                          <div className="mt-1 text-2xs text-slate-600">{Number(transaction.amount).toLocaleString()} · {transaction.transactionType}</div>
                          <div className="mt-2 text-[10px] uppercase tracking-widest text-slate-500">{transaction.alertType ?? 'source case'}</div>
                        </button>
                        {/* Check Ring button */}
                        <div className="mt-3 border-t border-slate-200 pt-3">
                          <button
                            type="button"
                            disabled={isCheckingRing}
                            onClick={() => void handleCheckRing(transaction.sourceTransactionId)}
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-warn-500/30 bg-warn-500/8 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-warn-600 transition-colors hover:bg-warn-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isCheckingRing
                              ? <><Activity className="h-3 w-3 animate-pulse-soft" /> Checking…</>
                              : <><Search className="h-3 w-3" /> Check Ring Detection</>}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Ring Check Result Panel */}
            {activeRingCheckId && ringCheckState[activeRingCheckId] && !ringCheckState[activeRingCheckId].loading && (
              (() => {
                const result = ringCheckState[activeRingCheckId]!.result;
                if (!result) return null;
                return (
                  <div className={`rounded-lg border p-4 space-y-3 ${result.detected ? 'border-risk-500/40 bg-risk-500/8' : 'border-safe-500/40 bg-safe-500/8'}`}>
                    <div className="flex items-start gap-3">
                      {result.detected
                        ? <ShieldX className="h-5 w-5 shrink-0 text-risk-400 mt-0.5" />
                        : <ShieldCheck className="h-5 w-5 shrink-0 text-safe-400 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-2xs font-bold uppercase tracking-widest ${result.detected ? 'text-risk-400' : 'text-emerald-700'}`}>
                            {result.detected ? 'Ring / Coordination Detected' : 'No Ring Detected · Isolated Transaction'}
                          </span>
                          <span className="text-2xs text-slate-500">TX #{activeRingCheckId} · {result.totalChecked} transactions checked</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-700">{result.reason}</p>
                      </div>
                    </div>

                    {result.gnnClique && (
                      <div className="rounded-md border border-signal-500/30 bg-signal-500/10 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-2xs font-bold uppercase tracking-widest text-blue-700">GNN Graph Attention Clique</span>
                          <span className="rounded bg-signal-500/20 px-2 py-0.5 font-mono text-2xs font-bold text-blue-800">
                            {result.gnnClique.confidence}% Embedding Coherence
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                          <KeyVal label="Clique ID" value={result.gnnClique.cliqueId} />
                          <KeyVal label="Members" value={String(result.gnnClique.memberCount)} />
                          <KeyVal label="GNN Fraud Risk" value={`${((result.gnnScore ?? 0) * 100).toFixed(1)}%`} />
                        </div>
                        <div className="text-2xs text-slate-600">
                          Clique Accounts: <span className="font-mono font-semibold text-slate-900">{result.gnnClique.members.join(', ')}</span>
                        </div>
                      </div>
                    )}

                    {result.detected && result.ring && (
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
                        <div className="text-2xs font-semibold uppercase tracking-widest text-risk-600 mb-2">Ring Details</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                          <KeyVal label="Ring ID" value={result.ring.ringId ?? '—'} />
                          <KeyVal label="Confidence" value={`${result.ring.confidence ?? 0}%`} />
                          <KeyVal label="Members" value={String(result.ring.memberCount ?? result.ring.members?.length ?? '—')} />
                          <KeyVal label="Transactions" value={String(result.ring.transactionVolume ?? '—')} />
                          <KeyVal label="Amount Involved" value={`$${Number(result.ring.amountInvolved ?? 0).toLocaleString()}`} />
                          {'patternType' in result.ring && result.ring.patternType ? <KeyVal label="Pattern" value={String(result.ring.patternType)} /> : null}
                        </div>
                        {Array.isArray(result.ring.signals) && result.ring.signals.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {result.ring.signals.map((sig: { key: string; label: string; description: string; weight: number }) => (
                              <div key={sig.key} className="flex items-start gap-2">
                                <AlertTriangle className="h-3 w-3 shrink-0 text-warn-400 mt-0.5" />
                                <div className="min-w-0">
                                  <span className="text-2xs font-semibold text-warn-600">{sig.label}</span>
                                  <span className="ml-1 text-2xs text-slate-600">{sig.description}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {result.relatedTransactions && result.relatedTransactions.length > 0 && (
                          <div className="mt-2">
                            <div className="text-2xs font-semibold uppercase tracking-widest text-slate-600 mb-1">Related Transactions ({result.relatedTransactions.length})</div>
                            <div className="max-h-28 overflow-auto space-y-0.5">
                              {result.relatedTransactions.map((rt) => (
                                <div key={rt.transactionId} className="flex items-center gap-2 text-2xs text-slate-600">
                                  <span className="font-mono text-slate-800">#{rt.transactionId}</span>
                                  <span>{rt.senderAccount} → {rt.receiverAccount}</span>
                                  <span>${Number(rt.amount).toLocaleString()}</span>
                                  {rt.isFraud && <span className="font-bold text-risk-600">FRAUD</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action: inject through full pipeline */}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => void handleInjectFromRingCheck(activeRingCheckId)}
                        disabled={loading}
                        className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-all ${
                          result.detected
                            ? 'border-risk-500/50 bg-risk-500/15 text-risk-700 hover:bg-risk-500/25'
                            : 'border-signal-500/40 bg-signal-500/15 text-blue-700 hover:bg-signal-500/25'
                        } disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400`}
                      >
                        {loading ? <Activity className="h-3.5 w-3.5 animate-pulse-soft" /> : <Send className="h-3.5 w-3.5" />}
                        {result.detected ? 'Send Ring Transaction Through Pipeline' : 'Send as Isolated Transaction Through Pipeline'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveRingCheckId(null)}
                        className="text-2xs text-slate-500 hover:text-slate-700"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                );
              })()
            )}

            {loadedScenarioId && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-signal-500/30 bg-signal-500/10 p-4">
                <div>
                  <div className="text-2xs font-semibold uppercase tracking-widest text-blue-700">Active AMLSim Case Loaded</div>
                  <div className="mt-1 font-mono text-sm font-bold text-slate-900">TX #{loadedScenarioId} · {investigation?.investigationId ?? 'Connecting pipeline...'}</div>
                  <p className="mt-0.5 text-xs text-slate-600">Ground truth: {selectedPreset} · Real AMLSim transaction and cluster network connected</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('investigation')}
                  className="inline-flex items-center gap-2 rounded-md border border-signal-500/50 bg-signal-500/20 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-blue-800 transition-all hover:bg-signal-500/30"
                >
                  Inspect Investigation <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </Panel>
      )}

      {scenarioPreview && (
        <Panel title="Controlled Demo Payload" subtitle="Static demonstration data · no dataset row or backend event">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-2xs font-semibold uppercase tracking-widest text-slate-700">Controlled payload</h3>
              <dl className="grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2">
                {Object.entries(scenarioPreview.sourceRow).length > 0
                  ? Object.entries(scenarioPreview.sourceRow).map(([field, value]) => <KeyVal key={field} label={field} value={String(value)} />)
                  : <KeyVal label="Source" value="Static controlled demo" />}
              </dl>
            </div>
            <div>
              <h3 className="mb-2 text-2xs font-semibold uppercase tracking-widest text-slate-700">Mapped transaction payload</h3>
              <dl className="grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2">
                <KeyVal label="Sender" value={scenarioPreview.mappedPayload.senderAccount} />
                <KeyVal label="Receiver" value={scenarioPreview.mappedPayload.receiverAccount} />
                <KeyVal label="Amount" value={String(scenarioPreview.mappedPayload.amount)} />
                <KeyVal label="Type" value={scenarioPreview.mappedPayload.transactionType} />
                <KeyVal label="Timestamp" value={scenarioPreview.mappedPayload.timestamp} />
                <KeyVal label="Device ID" value={scenarioPreview.mappedPayload.deviceId} />
                <KeyVal label="IP address" value={scenarioPreview.mappedPayload.ipAddress} />
                <KeyVal label="Merchant ID" value={scenarioPreview.mappedPayload.merchantId} />
                <KeyVal label="Location" value={scenarioPreview.mappedPayload.location} />
              </dl>
              <p className="mt-3 text-2xs text-slate-600">This payload is controlled demonstration data and is not an external dataset record.</p>
              {investigation && (
                <div className="mt-3 grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                  <KeyVal label="Model prediction" value={String(investigationMlOutput?.classification ?? 'Unavailable')} />
                  <KeyVal label="Model fraud probability" value={formatPercentage(investigation.risk?.fraudProbability)} />
                  <KeyVal label="Risk score and band" value={investigation.risk ? `${investigation.risk.score}/100 · ${investigation.risk.level}` : 'Unavailable'} />
                  <KeyVal label="Ring analysis" value={investigation.ring?.detected ? `Detected · ${investigation.ring.ringId}` : 'No ring candidate returned'} />
                </div>
              )}
            </div>
          </div>
        </Panel>
      )}

      {/* Validation */}
      <Panel title="Validation Status">
        <div className="flex flex-wrap items-center gap-3">
          {form.senderAccount ? (
            <ValidationPill ok label="Sender account" />
          ) : (
            <ValidationPill ok={false} label="Sender account required" />
          )}
          {form.receiverAccount ? (
            <ValidationPill ok label="Receiver account" />
          ) : (
            <ValidationPill ok={false} label="Receiver account required" />
          )}
          {form.amount > 0 ? (
            <ValidationPill ok label={`Amount ${form.amount} ${form.currency}`} />
          ) : (
            <ValidationPill ok={false} label="Amount must be > 0" />
          )}
          {form.deviceId ? <ValidationPill ok label="Device ID" /> : <ValidationPill ok={false} label="Device ID missing" />}
          {form.ipAddress ? <ValidationPill ok label="IP address" /> : <ValidationPill ok={false} label="IP address missing" />}
          {form.location ? <ValidationPill ok label="Location" /> : <ValidationPill ok={false} label="Location missing" />}
          {form.merchantId ? <ValidationPill ok label="Merchant ID" /> : <ValidationPill ok={false} label="Merchant ID missing" />}
        </div>
      </Panel>

      {/* Injection result */}
      {investigation ? (
        <Panel title="Injection Result" subtitle="Returned by the ingestion pipeline">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ResultCard icon={Hash} label="Event ID" value={investigation.eventId} />
            <ResultCard icon={ArrowRight} label="Trace ID" value={investigation.traceId} />
            <ResultCard icon={CheckCircle2} label="Ingestion Status" value="ACCEPTED" accent="safe" />
          </div>
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              <KeyVal label="Investigation" value={investigation.investigationId} />
              <KeyVal label="State" value={investigation.state} />
              <KeyVal label="Received" value={investigation.createdAt} />
              <KeyVal label="Amount" value={`${investigation.payload.amount.toLocaleString()} ${investigation.payload.currency}`} />
              <KeyVal label="Type" value={investigation.payload.transactionType} />
              <KeyVal label="Route" value={`${investigation.payload.senderAccount} → ${investigation.payload.receiverAccount}`} />
            </dl>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
            <ArrowRight className="h-3.5 w-3.5 text-signal-400" />
            <span>Investigation started — open the <span className="font-semibold text-blue-700">Investigation</span> view to follow the pipeline.</span>
          </div>
        </Panel>
      ) : (
        <Panel title="Injection Result">
          <EmptyState
            icon={<Send className="h-8 w-8" />}
            title="No transaction injected yet"
            description="Fill in the fields above and click INJECT TRANSACTION to start an investigation."
          />
        </Panel>
      )}
      <GuidedNavigation current="payload" onNavigate={onNavigate} />
    </div>
  );
}

function ValidationPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-2xs font-medium ${ok ? 'border-safe-500/25 bg-safe-500/10 text-emerald-700 font-semibold' : 'border-slate-300 bg-slate-100 text-slate-600'}`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

function ResultCard({ icon: Icon, label, value, accent }: { icon: typeof Hash; label: string; value: string; accent?: 'safe' }) {
  const color = accent === 'safe' ? 'text-emerald-700' : 'text-blue-700';
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-2xs font-semibold uppercase tracking-widest text-slate-600">{label}</span>
      </div>
      <div className={`mt-2 font-mono text-sm font-semibold ${color}`}>{value}</div>
    </div>
  );
}
