import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StoreContext, type ActiveInvestigationIds, type AppState } from './context';
import { createApi, type ApiClient } from '@/services/api';
import type { RuntimeMode, Investigation, NetworkGraph, ForensicReport, RingCandidate, SystemStatus, Scenario, ScenarioPreview, TransactionPayload, PayloadLabGroup, AmlSimTransaction, AmlSimAccount, AmlSimAlert, AmlSimPattern, AmlSimInvestigation } from '@/types';

const ACTIVE_EVENT_KEY = 'ringbreak.active-live-event';

function asAmlSimRiskLevel(score: number): Investigation['risk'] extends infer T ? T extends { level: infer L } ? L : never : never {
  if (score >= 90) return 'CRITICAL';
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

function buildAmlSimNetworkGraph(transaction: AmlSimTransaction, detail: AmlSimInvestigation | null): NetworkGraph {
  const patternAccounts = detail?.patternEvidence?.accountIds ?? [transaction.senderAccount, transaction.receiverAccount];
  const allAccounts = Array.from(new Set([transaction.senderAccount, transaction.receiverAccount, ...patternAccounts]));
  const accounts: NetworkGraph['entities'] = allAccounts.map((accountId, index) => ({
    id: accountId,
    type: 'ACCOUNT',
    label: accountId,
    risk: transaction.datasetIsFraud ? (index === 0 ? 'HIGH' : 'MEDIUM') : 'LOW',
    x: 140 + ((index % 4) * 140),
    y: 120 + (Math.floor(index / 4) * 150),
    transactions: index === 0 ? 2 : 1,
    connectedAccounts: patternAccounts.length > 2 ? patternAccounts.length - 1 : 1,
    sharedDevices: 0,
    sharedIps: 0,
    suspicious: transaction.datasetIsFraud || detail?.patternEvidence != null,
    metadata: { source: 'AMLSim dataset', accountType: 'dataset-linked' },
  }));

  const relationshipId = `${transaction.sourceTransactionId}-txn`;
  const source = transaction.senderAccount;
  const target = transaction.receiverAccount;
  const suspicious = detail?.patternEvidence != null || transaction.datasetIsFraud;

  const relationships: NetworkGraph['relationships'] = [
    {
      id: relationshipId,
      source,
      target,
      type: 'TRANSACTION',
      weight: suspicious ? 1 : 0.5,
      suspicious,
    },
    ...allAccounts.slice(2).map((accountId, index) => ({
      id: `${transaction.sourceTransactionId}-link-${index}`,
      source: allAccounts[index % 2] ?? source,
      target: accountId,
      type: 'TRANSACTION' as const,
      weight: 0.6,
      suspicious: suspicious || accountId === transaction.senderAccount || accountId === transaction.receiverAccount,
    })),
  ];

  return {
    entities: accounts,
    relationships,
  };
}

function buildAmlSimCaseContext(
  transaction: AmlSimTransaction,
  detail: AmlSimInvestigation | null,
  accounts: AmlSimAccount[],
  alerts: AmlSimAlert[]
): { investigation: Investigation; networkGraph: NetworkGraph; report: ForensicReport } {
  const hasPattern = Boolean(detail?.patternEvidence && detail.patternEvidence.patternType && detail.patternEvidence.patternType !== 'normal');
  const fraudLabel = Boolean(transaction.datasetIsFraud);
  const patternType = detail?.patternEvidence?.patternType ?? 'normal';
  const patternAccounts = detail?.patternEvidence?.accountIds ?? [transaction.senderAccount, transaction.receiverAccount];
  const networkGraph = buildAmlSimNetworkGraph(transaction, detail);

  const backendRisk = (detail as any)?.riskAssessment ?? (detail as any)?.risk;
  const backendMlStage = (detail as any)?.trace?.stages?.find((s: any) => s.key === 'ml_intelligence');
  const backendFraudProb = typeof backendRisk?.fraudProbability === 'number'
    ? backendRisk.fraudProbability
    : typeof backendMlStage?.output?.fraudProbability === 'number'
      ? backendMlStage.output.fraudProbability
      : (fraudLabel ? 0.85 : 0.0002);
  const mlClassification = String(
    backendMlStage?.output?.classification
    ?? backendRisk?.classification
    ?? (fraudLabel ? 'FRAUD' : 'NORMAL')
  );

  const riskScore = typeof backendRisk?.score === 'number'
    ? backendRisk.score
    : (fraudLabel ? (hasPattern ? 91 : 72) : 18);
  const riskLevel = backendRisk?.level ? asAmlSimRiskLevel(backendRisk.level) : asAmlSimRiskLevel(riskScore);

  const senderAccount = accounts.find((account) => account.accountId === transaction.senderAccount);
  const receiverAccount = accounts.find((account) => account.accountId === transaction.receiverAccount);
  const accountContextScore = (() => {
    const senderFraud = senderAccount?.datasetIsFraud ?? false;
    const receiverFraud = receiverAccount?.datasetIsFraud ?? false;
    if (senderFraud && receiverFraud) return 92;
    if (senderFraud || receiverFraud) return 74;
    if (senderAccount || receiverAccount) return 44;
    return 18;
  })();

  const riskFactors = [
    {
      key: 'ml_model',
      label: 'ML Model Prediction',
      score: Math.min(100, Math.max(0, Math.round(backendFraudProb * 100))),
      weight: 0.35,
      detail: `Live fraud classifier: ${mlClassification} (fraud probability: ${(backendFraudProb * 100).toFixed(2)}%)`,
    },
    {
      key: 'amount_signal',
      label: 'Transaction amount signal',
      score: Math.min(100, Math.max(10, Math.round((Number(transaction.amount || 0) / 200000) * 100))),
      weight: 0.25,
      detail: fraudLabel ? 'Amount is aligned with suspicious transfer behaviour in the live AMLSim dataset.' : 'Amount is within the non-fraud baseline for this dataset.',
    },
    {
      key: 'alert_signal',
      label: 'Alert linkage',
      score: transaction.alertId != null && transaction.alertId !== -1 ? (fraudLabel ? 82 : 38) : 14,
      weight: 0.25,
      detail: transaction.alertId != null && transaction.alertId !== -1 ? `Dataset alert ${transaction.alertId} was attached to this transaction.` : 'No direct alert link was assigned to this transaction by the dataset.',
    },
    {
      key: 'pattern_signal',
      label: 'Pattern evidence',
      score: hasPattern ? 88 : 12,
      weight: 0.15,
      detail: hasPattern ? `AMLSim pattern evidence indicates ${patternType.toUpperCase()} behaviour across ${patternAccounts.length} account references.` : 'No verified ring or fan-in pattern was established for this transaction.',
    },
  ];

  const riskAssessment = {
    score: riskScore,
    level: riskLevel,
    fraudProbability: backendFraudProb,
    confidence: backendRisk?.confidence ?? (fraudLabel ? 86 : 99),
    evidenceStrength: hasPattern ? 88 : 62,
    factors: riskFactors,
    assessedAt: new Date().toISOString(),
    evidenceReferences: hasPattern ? [
      `AMLSim alert ${transaction.alertId ?? 'unknown'}`,
      `Pattern ${patternType}`,
      `Accounts ${patternAccounts.join(', ')}`,
    ] : [`Dataset transaction ${transaction.sourceTransactionId}`],
    explanation: fraudLabel
      ? (hasPattern
        ? `ML model and pattern evidence corroborate coordinated ${patternType.toUpperCase()} fraud activity.`
        : 'ML model and source ground truth indicate suspicious transaction activity.')
      : `ML model evaluated transaction as ${mlClassification} with ${(backendFraudProb * 100).toFixed(2)}% fraud probability. Activity is within normal baseline.`,
  } as import('@/types').RiskAssessment;

  const ring: RingCandidate | null = hasPattern ? {
    ringId: `AMLSIM-${patternType.toUpperCase()}-${transaction.sourceTransactionId}`,
    confidence: 88,
    members: Array.from(new Set(patternAccounts)),
    memberCount: Array.from(new Set(patternAccounts)).length,
    transactionVolume: detail?.patternEvidence?.transactionIds?.length ?? 1,
    amountInvolved: Number(transaction.amount ?? 0),
    currency: 'USD',
    detected: true,
    memberAccounts: Array.from(new Set(patternAccounts)),
    memberEvents: detail?.patternEvidence?.transactionIds ?? [transaction.sourceTransactionId],
    memberInvestigations: [`amlsim:${transaction.sourceTransactionId}`],
    signals: [
      { key: 'dataset_pattern', label: 'Dataset pattern evidence', description: `Recorded ${patternType.toUpperCase()} evidence on the selected AMLSim transaction cluster.`, weight: 0.93, present: true },
      { key: 'alert_linkage', label: 'Alert linkage', description: transaction.alertId != null && transaction.alertId !== -1 ? `Alert ${transaction.alertId} links directly to the source transaction.` : 'No direct alert link was assigned to the source transaction.', weight: 0.76, present: true },
      { key: 'account_overlap', label: 'Account overlap', description: `${patternAccounts.length} related account references were identified in the source evidence.`, weight: 0.67, present: true },
    ],
  } : {
    ringId: `AMLSIM-NONE-${transaction.sourceTransactionId}`,
    confidence: 0,
    members: [transaction.senderAccount, transaction.receiverAccount],
    memberCount: 2,
    transactionVolume: 1,
    amountInvolved: Number(transaction.amount ?? 0),
    currency: 'USD',
    detected: false,
    memberAccounts: [transaction.senderAccount, transaction.receiverAccount],
    memberEvents: [transaction.sourceTransactionId],
    memberInvestigations: [`amlsim:${transaction.sourceTransactionId}`],
    signals: [
      { key: 'dataset_pattern', label: 'Pattern evidence', description: 'No verified ring pattern or related cluster was established for this record.', weight: 0.12, present: false },
    ],
  };

  const evidenceTimeline = [
    {
      id: `amlsim-alert-${transaction.sourceTransactionId}`,
      label: 'Dataset alert linkage',
      description: transaction.alertId != null && transaction.alertId !== -1 ? `Alert ${transaction.alertId} is associated with this source AMLSim transaction.` : 'No direct source alert was assigned to this record.',
      strength: transaction.alertId != null && transaction.alertId !== -1 ? 78 : 22,
      source: 'AMLSim alerts.csv',
      timestamp: transaction.timestamp ?? new Date().toISOString(),
      relationship: 'dataset_evidence',
    },
    {
      id: `amlsim-pattern-${transaction.sourceTransactionId}`,
      label: hasPattern ? `${patternType.toUpperCase()} pattern evidence` : 'No verified pattern cluster',
      description: hasPattern
        ? `The selected record participates in an AMLSim ${patternType.toUpperCase()} cluster containing ${Array.from(new Set(patternAccounts)).length} account references.`
        : 'No ring-like or fan-in pattern was found in the source alert evidence.',
      strength: hasPattern ? 87 : 18,
      source: 'AMLSim pattern clusters',
      timestamp: transaction.timestamp ?? new Date().toISOString(),
      relationship: 'pattern_cluster',
    },
  ];

  const agents: import('@/types').AgentFinding[] = [
    {
      agentKey: 'behaviour',
      name: 'BEHAVIOUR INVESTIGATOR',
      status: 'complete',
      finding: fraudLabel ? 'Dataset-labelled behavioural anomaly is consistent with known fraudulent transfer activity.' : 'Behaviour remains within the dataset baseline for non-fraud activity.',
      conclusion: fraudLabel ? 'Behavioural evidence supports the live AMLSim fraud classification.' : 'Behavioural evidence supports the live AMLSim benign classification.',
      confidence: fraudLabel ? 84 : 68,
      evidenceStatus: 'sufficient',
      evidenceReason: null,
      scores: { fraudProbability: riskAssessment?.fraudProbability ?? 0, anomalyScore: fraudLabel ? 0.83 : 0.18, modelConfidence: 0.81, amountSignal: riskFactors[0].score, transactionTypeSignal: 38 },
      evidenceCount: 2,
      objective: 'Assess whether the selected transaction behaviour is consistent with fraud signals in the AMLSim dataset.',
      observations: [
        `Transaction amount: ${transaction.amount}`,
        `Alert linkage: ${transaction.alertId != null && transaction.alertId !== -1 ? transaction.alertId : 'unlinked'}`,
      ],
      evidence: evidenceTimeline,
    },
    {
      agentKey: 'network',
      name: 'NETWORK INVESTIGATOR',
      status: 'complete',
      finding: hasPattern ? `Detected ${patternType.toUpperCase()} evidence across related accounts.` : 'No verified ring cluster was established for this record.',
      conclusion: hasPattern ? 'Network evidence corroborates the source dataset fraud pattern.' : 'No network ring was supported by the available AMLSim evidence.',
      confidence: hasPattern ? 86 : 34,
      evidenceStatus: hasPattern ? 'sufficient' : 'insufficient_evidence',
      evidenceReason: hasPattern ? null : 'No cluster-level relationship evidence was established in the source pattern data.',
      scores: { sharedDevice: 0, sharedIp: 0, connectedAccounts: patternAccounts.length },
      evidenceCount: hasPattern ? 2 : 0,
      objective: 'Determine whether the transaction participates in a shared infrastructure or circular activity pattern.',
      observations: hasPattern ? [
        `Pattern: ${patternType}`,
        `Related accounts: ${patternAccounts.join(', ')}`,
      ] : ['No relation evidence found in the current AMLSim cluster set.'],
      evidence: evidenceTimeline,
    },
    {
      agentKey: 'evidence',
      name: 'EVIDENCE INVESTIGATOR',
      status: 'complete',
      finding: `Source dataset ground truth includes ${fraudLabel ? 'fraud' : 'benign'} classification for this record.`,
      conclusion: hasPattern ? 'Evidence chain is consistent with a coordinated fraud pattern in the live AMLSim dataset.' : 'Evidence chain is limited to dataset-label context and does not support a ring designation.',
      confidence: hasPattern ? 83 : 62,
      evidenceStatus: 'sufficient',
      evidenceReason: null,
      scores: { evidenceStrength: riskAssessment?.evidenceStrength ?? 0 },
      evidenceCount: evidenceTimeline.length,
      objective: 'Correlate direct source ground truth with supporting transaction and pattern evidence.',
      observations: [
        `Ground truth: ${fraudLabel ? 'FRAUD' : 'BENIGN'}`,
        `Pattern type: ${patternType}`,
      ],
      evidence: evidenceTimeline,
    },
  ];

  const response: import('@/types').Countermeasure = {
    type: 'TRANSACTION_HOLD',
    status: 'RECOMMENDED',
    recommendedAction: fraudLabel ? (hasPattern ? 'HOLD AND INVESTIGATE RING' : 'HOLD AND REVIEW') : 'NO ACTION',
    reason: hasPattern
      ? 'The record is supported by direct AMLSim fraud ground truth and corroborating pattern evidence.'
      : fraudLabel
        ? 'The record is fraud-labelled in the source dataset, but the relationship evidence is not strong enough to support a ring determination.'
        : 'The source dataset labels this as benign and no suspicious pattern evidence was corroborated.',
    triggeringEvidence: hasPattern
      ? [`Pattern ${patternType.toUpperCase()}`, `Source label ${fraudLabel ? 'FRAUD' : 'BENIGN'}`, `Alert ${(transaction.alertId ?? 'unlinked')}`]
      : [`Ground truth ${fraudLabel ? 'FRAUD' : 'BENIGN'}`, 'No pattern cluster identified'],
    confidence: fraudLabel ? 80 : 45,
    simulated: true,
    actionId: `amlsim-${transaction.sourceTransactionId}`,
    actionType: 'TRANSACTION_HOLD',
    timestamp: new Date().toISOString(),
    investigationId: `amlsim:${transaction.sourceTransactionId}`,
    supportingEvidence: evidenceTimeline.map((entry) => entry.label),
    auditNote: 'The evidence is drawn from the live AMLSim dataset and does not imply an externally validated production model score.',
  };

  const trace: Investigation['trace'] = {
    traceId: `amlsim-trace-${transaction.sourceTransactionId}`,
    eventId: `amlsim-event-${transaction.sourceTransactionId}`,
    investigationId: `amlsim:${transaction.sourceTransactionId}`,
    createdAt: transaction.timestamp ?? new Date().toISOString(),
    state: 'COMPLETE',
    stages: [
      {
        index: 1,
        key: 'ingestion',
        label: 'INGESTION',
        status: 'complete',
        durationMs: 26,
        startedAt: transaction.timestamp ?? new Date().toISOString(),
        completedAt: transaction.timestamp ?? new Date().toISOString(),
        input: { source: 'AMLSim dataset', transactionId: transaction.sourceTransactionId, provenance: detail ?? null },
        output: { eventId: `amlsim-event-${transaction.sourceTransactionId}`, accepted: true },
        evidence: [],
        traceId: `amlsim-trace-${transaction.sourceTransactionId}`,
      },
      {
        index: 2,
        key: 'feature_engine',
        label: 'FEATURE ENGINE',
        status: 'complete',
        durationMs: 90,
        startedAt: transaction.timestamp ?? new Date().toISOString(),
        completedAt: transaction.timestamp ?? new Date().toISOString(),
        input: { transactionAmount: Number(transaction.amount ?? 0), transactionType: transaction.transactionType },
        output: { featuresExtracted: 5, anomalies: fraudLabel ? 3 : 1 },
        evidence: evidenceTimeline,
        traceId: `amlsim-trace-${transaction.sourceTransactionId}`,
      },
      {
        index: 3,
        key: 'ml_intelligence',
        label: 'ML INTELLIGENCE',
        status: 'complete',
        durationMs: backendMlStage?.durationMs ?? 48,
        startedAt: transaction.timestamp ?? new Date().toISOString(),
        completedAt: transaction.timestamp ?? new Date().toISOString(),
        input: backendMlStage?.input ?? {
          step: transaction.timeStep,
          amount: Number(transaction.amount ?? 0),
          transactionType: transaction.transactionType,
        },
        output: backendMlStage?.output ?? {
          model: { name: 'ringbreak_live_fraud_model', version: '2.0' },
          classification: mlClassification,
          fraudProbability: backendFraudProb,
          anomalyScore: backendFraudProb,
          normalityScore: 1 - backendFraudProb,
          confidence: 1 - backendFraudProb,
        },
        evidence: (backendMlStage?.evidence && backendMlStage.evidence.length > 0)
          ? backendMlStage.evidence
          : [
            {
              id: 'amlsim-ml',
              label: 'Fraud probability',
              description: `Live fraud model evaluated transaction as ${mlClassification} with ${(backendFraudProb * 100).toFixed(2)}% fraud probability.`,
              strength: Math.round(backendFraudProb * 100),
              source: 'ml_intelligence',
              timestamp: transaction.timestamp ?? new Date().toISOString(),
              relationship: 'transaction',
            },
          ],
        traceId: `amlsim-trace-${transaction.sourceTransactionId}`,
      },
      {
        index: 4,
        key: 'graph_intelligence',
        label: 'GRAPH INTELLIGENCE',
        status: 'complete',
        durationMs: 105,
        startedAt: transaction.timestamp ?? new Date().toISOString(),
        completedAt: transaction.timestamp ?? new Date().toISOString(),
        input: { seedAccounts: [transaction.senderAccount, transaction.receiverAccount] },
        output: { entities: networkGraph.entities.length, relationships: networkGraph.relationships.length },
        evidence: evidenceTimeline,
        traceId: `amlsim-trace-${transaction.sourceTransactionId}`,
      },
      {
        index: 5,
        key: 'ring_detection',
        label: 'RING DETECTION',
        status: hasPattern ? 'complete' : 'warning',
        durationMs: 85,
        startedAt: transaction.timestamp ?? new Date().toISOString(),
        completedAt: transaction.timestamp ?? new Date().toISOString(),
        input: { alertType: patternType },
        output: { ringDetected: hasPattern, confidence: hasPattern ? 88 : 0, members: Array.from(new Set(patternAccounts)).length },
        evidence: hasPattern ? [{ id: 'amlsim-ring', label: 'Pattern evidence', description: `AMLSim cluster indicates ${patternType.toUpperCase()} signal.`, strength: 87, source: 'AMLSim pattern clusters', timestamp: transaction.timestamp ?? new Date().toISOString(), relationship: 'ring_provenance' }] : [],
        traceId: `amlsim-trace-${transaction.sourceTransactionId}`,
      },
      {
        index: 6,
        key: 'investigator_agents',
        label: 'INVESTIGATOR AGENTS',
        status: 'complete',
        durationMs: 120,
        startedAt: transaction.timestamp ?? new Date().toISOString(),
        completedAt: transaction.timestamp ?? new Date().toISOString(),
        input: { agentsDispatched: 3 },
        output: { conclusions: 3, correlatedEvidence: evidenceTimeline.length },
        evidence: evidenceTimeline,
        traceId: `amlsim-trace-${transaction.sourceTransactionId}`,
      },
      {
        index: 7,
        key: 'risk_assessment',
        label: 'RISK ASSESSMENT',
        status: 'complete',
        durationMs: 48,
        startedAt: transaction.timestamp ?? new Date().toISOString(),
        completedAt: transaction.timestamp ?? new Date().toISOString(),
        input: { fraudLabel: fraudLabel, patternEvidence: detail?.patternEvidence ?? null },
        output: { score: riskScore, level: riskLevel },
        evidence: evidenceTimeline,
        traceId: `amlsim-trace-${transaction.sourceTransactionId}`,
      },
      {
        index: 8,
        key: 'response',
        label: 'RESPONSE',
        status: 'complete',
        durationMs: 25,
        startedAt: transaction.timestamp ?? new Date().toISOString(),
        completedAt: transaction.timestamp ?? new Date().toISOString(),
        input: { risk: riskScore, level: riskLevel },
        output: { action: response.recommendedAction, simulated: true },
        evidence: [],
        traceId: `amlsim-trace-${transaction.sourceTransactionId}`,
      },
    ],
  };

  const investigation: Investigation = {
    investigationId: `amlsim:${transaction.sourceTransactionId}`,
    eventId: `amlsim-event-${transaction.sourceTransactionId}`,
    traceId: `amlsim-trace-${transaction.sourceTransactionId}`,
    state: 'COMPLETE',
    createdAt: transaction.timestamp ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    payload: {
      senderAccount: transaction.senderAccount,
      receiverAccount: transaction.receiverAccount,
      amount: Number(transaction.amount ?? 0),
      currency: 'USD',
      deviceId: `AMLSIM-${transaction.sourceTransactionId}`,
      ipAddress: `10.${(Number(transaction.sourceTransactionId) || 1) % 200}.${(Number(transaction.sourceTransactionId) || 1) % 100}.1`,
      location: 'AMLSim dataset',
      merchantId: `MCH-${transaction.sourceTransactionId}`,
      transactionType: (String(transaction.transactionType ?? '').toUpperCase() as Investigation['payload']['transactionType']) || 'WIRE',
      timestamp: transaction.timestamp ?? new Date().toISOString(),
    },
    trace,
    risk: riskAssessment,
    ring,
    agents,
    response,
    report: undefined,
  };

  const summary = fraudLabel
    ? (hasPattern ? 'FRAUD — RING-SUPPORTED' : 'FRAUD — RING UNESTABLISHED')
    : 'BENIGN — ISOLATED';

  const report: ForensicReport = {
    investigationId: investigation.investigationId,
    eventId: investigation.eventId,
    traceId: investigation.traceId,
    generatedAt: new Date().toISOString(),
    transactionSummary: `AMLSim source record ${transaction.sourceTransactionId} shows ${summary.toLowerCase()} evidence. Ground truth is ${fraudLabel ? 'fraud' : 'benign'} and the pattern evidence is ${hasPattern ? 'corroborated' : 'not established'}.`,
    payload: investigation.payload,
    risk: riskAssessment,
    mlFindings: `Live fraud classifier evaluated transaction as ${mlClassification} with ${(backendFraudProb * 100).toFixed(2)}% fraud probability. Ground truth: ${fraudLabel ? 'FRAUD' : 'BENIGN'}.`,
    networkFindings: hasPattern ? { patternType, relatedAccounts: patternAccounts, ring: ring?.ringId ?? 'none' } : { patternType: 'normal', relatedAccounts: [transaction.senderAccount, transaction.receiverAccount], ring: 'none' },
    ring,
    agents,
    evidenceTimeline,
    response,
    conclusion: summary,
  };

  investigation.report = report;
  return { investigation, networkGraph, report };
}

function frag(accounts: AmlSimAccount[], senderAccount: string, receiverAccount: string) {
  const sender = accounts.find((account) => account.accountId === senderAccount);
  const receiver = accounts.find((account) => account.accountId === receiverAccount);
  if (sender && receiver) return 66;
  if (sender || receiver) return 46;
  return 28;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [systemStatusLoading, setSystemStatusLoading] = useState(true);
  const [systemStatusError, setSystemStatusError] = useState<string | null>(null);
  const mode: RuntimeMode = systemStatus?.mode ?? 'UNKNOWN';
  const [investigation, setInvestigationState] = useState<Investigation | null>(null);
  const [activeIds, setActiveIds] = useState<ActiveInvestigationIds | null>(() => investigation ? {
    eventId: investigation.eventId,
    traceId: investigation.traceId,
    investigationId: investigation.investigationId,
  } : null);
  const [ringContext, setRingContext] = useState<RingCandidate | null>(() => investigation?.ring ?? null);
  const [networkGraph, setNetworkGraph] = useState<NetworkGraph | null>(null);
  const [report, setReport] = useState<ForensicReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [payloadLabGroup, setPayloadLabGroupState] = useState<PayloadLabGroup>(() => {
    const saved = sessionStorage.getItem('ringbreak.payload-lab-group') as PayloadLabGroup | null;
    return saved && ['DEMO', 'DIRECT'].includes(saved) ? saved : 'DIRECT';
  });
  const [scenarioPreview, setScenarioPreview] = useState<ScenarioPreview | null>(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [amlsimTransactions, setAmlSimTransactions] = useState<AmlSimTransaction[]>([]);
  const [amlsimAccounts, setAmlSimAccounts] = useState<AmlSimAccount[]>([]);
  const [amlsimAlerts, setAmlSimAlerts] = useState<AmlSimAlert[]>([]);
  const [amlsimPatterns, setAmlSimPatterns] = useState<AmlSimPattern[]>([]);
  const [amlsimInvestigation, setAmlSimInvestigation] = useState<AmlSimInvestigation | null>(null);
  const modeGenerationRef = useRef(0);
  const activeAmlSimCaseRef = useRef<string | null>(null);

  const api: ApiClient = useMemo(() => createApi('LIVE'), []);

  const setInvestigation = useCallback((next: Investigation | null) => {
    setInvestigationState(next);
  }, []);

  const setPayloadLabGroup = useCallback((group: PayloadLabGroup) => {
    sessionStorage.setItem('ringbreak.payload-lab-group', group);
    modeGenerationRef.current += 1;
    setScenarioLoading(false);
    setLoading(false);
    setPayloadLabGroupState(group);
    setScenarioPreview(null);
    setInvestigationState(null);
    setActiveIds(null);
    setNetworkGraph(null);
    setReport(null);
    setRingContext(null);
    sessionStorage.removeItem(ACTIVE_EVENT_KEY);
  }, []);

  const refreshSystemStatus = useCallback(async () => {
    const generation = modeGenerationRef.current;
    try {
      const s = await api.getSystemStatus();
      if (generation !== modeGenerationRef.current) return;
      setSystemStatus(s);
      setSystemStatusError(null);
    } catch (cause) {
      if (generation !== modeGenerationRef.current) return;
      setSystemStatus(null);
      setSystemStatusError(cause instanceof Error ? cause.message : 'Backend status unavailable');
    } finally {
      if (generation === modeGenerationRef.current) setSystemStatusLoading(false);
    }
  }, [api]);

  const loadScenarios = useCallback(async () => {
    const generation = modeGenerationRef.current;
    try {
      const s = await api.getScenarios();
      if (generation !== modeGenerationRef.current) return;
      setScenarios(s);
    } catch (cause) {
      if (generation !== modeGenerationRef.current) return;
      setScenarios([]);
      setError(cause instanceof Error ? cause.message : 'Scenario service unavailable');
    }
  }, [api]);

  const loadScenarioPreview = useCallback(async (scenarioId: string) => {
    const generation = ++modeGenerationRef.current;
    setScenarioLoading(true);
    setError(null);
    setScenarioPreview(null);
    setInvestigation(null);
    setActiveIds(null);
    setNetworkGraph(null);
    setReport(null);
    setRingContext(null);
    sessionStorage.removeItem(ACTIVE_EVENT_KEY);
    try {
      const demoScenario = scenarios.find((scenario) => scenario.id === scenarioId);
      const preview = demoScenario
        ? {
          ...demoScenario,
          dataset: 'controlled-demo',
          sourceRowNumber: 0,
          sourceRow: {},
          mappedPayload: demoScenario.payload,
          modelFeatures: {},
          groundTruth: { isFraud: 0, isFlaggedFraud: 0 },
          mapping: 'Static controlled demonstration payload; no dataset row or backend event.',
          derivedContext: {},
        }
        : await api.getScenarioPreview(scenarioId);
      if (generation !== modeGenerationRef.current) return;
      setScenarioPreview(preview);
    } catch (cause) {
      if (generation !== modeGenerationRef.current) return;
      setScenarioPreview(null);
      setError(cause instanceof Error ? cause.message : 'Scenario preview failed');
    } finally {
      if (generation === modeGenerationRef.current) setScenarioLoading(false);
    }
  }, [api, scenarios, setInvestigation]);

  const openInvestigationByEventId = useCallback(async (eventId: string) => {
    const generation = ++modeGenerationRef.current;
    setLoading(true);
    setError(null);
    if (mode === 'LIVE') {
      setReport(null);
      setNetworkGraph(null);
      setRingContext(null);
    }
    try {
      const inv = await api.getInvestigation(eventId);
      if (generation !== modeGenerationRef.current) return;
      setInvestigation(inv);
      setActiveIds({ eventId: inv.eventId, traceId: inv.traceId, investigationId: inv.investigationId });
      if (mode === 'LIVE') sessionStorage.setItem(ACTIVE_EVENT_KEY, inv.eventId);
      if (mode === 'LIVE') {
        let graph: NetworkGraph | null = null;
        let fetchedReport: ForensicReport | null = null;
        let ring: RingCandidate | null = inv.ring ?? null;
        try {
          graph = await api.getNetworkGraph(inv.investigationId);
        } catch {
          graph = null;
        }
        try {
          fetchedReport = await api.getForensicReport(inv.investigationId);
        } catch {
          fetchedReport = null;
        }
        if (inv.ring?.ringId) {
          try {
            ring = await api.getRingById(inv.ring.ringId);
          } catch {
            ring = inv.ring ?? null;
          }
        }
        if (generation !== modeGenerationRef.current) return;
        setNetworkGraph(graph);
        setReport(fetchedReport);
        setRingContext(ring);
      } else {
        setNetworkGraph(null);
        setReport(inv.report ?? null);
        setRingContext(inv.ring ?? null);
      }
    } catch (cause) {
      if (generation !== modeGenerationRef.current) return;
      sessionStorage.removeItem(ACTIVE_EVENT_KEY);
      setInvestigation(null);
      setNetworkGraph(null);
      setReport(null);
      setRingContext(null);
      setError(cause instanceof Error ? cause.message : 'Investigation request failed');
    } finally {
      if (generation === modeGenerationRef.current) setLoading(false);
    }
  }, [api, mode, setInvestigation]);

  const inject = useCallback(async (payload: TransactionPayload, correlationId?: string) => {
    const generation = ++modeGenerationRef.current;
    setLoading(true);
    setError(null);
    if (mode === 'LIVE') {
      setReport(null);
      setNetworkGraph(null);
      setRingContext(null);
    }
    try {
      const event = await api.injectTransaction(payload, correlationId);
      if (generation !== modeGenerationRef.current) return;
      const returnedIds: ActiveInvestigationIds = {
        eventId: event.eventId,
        traceId: event.traceId,
        investigationId: event.investigationId,
      };
      setActiveIds(returnedIds);
      if (mode === 'LIVE') sessionStorage.setItem(ACTIVE_EVENT_KEY, returnedIds.eventId);
      const inv = await api.getInvestigation(event.eventId);
      if (generation !== modeGenerationRef.current) return;
      if (
        inv.eventId !== returnedIds.eventId
        || inv.traceId !== returnedIds.traceId
        || inv.investigationId !== returnedIds.investigationId
      ) {
        throw new Error('API returned an investigation with mismatched identifiers');
      }
      setInvestigation(inv);
      if (mode === 'LIVE') {
        let graph: NetworkGraph | null = null;
        let fetchedReport: ForensicReport | null = null;
        let ring: RingCandidate | null = inv.ring ?? null;
        try {
          graph = await api.getNetworkGraph(returnedIds.investigationId);
        } catch {
          graph = null;
        }
        try {
          fetchedReport = await api.getForensicReport(returnedIds.investigationId);
        } catch {
          fetchedReport = null;
        }
        if (inv.ring?.ringId) {
          try {
            ring = await api.getRingById(inv.ring.ringId);
          } catch {
            ring = inv.ring ?? null;
          }
        }
        if (generation !== modeGenerationRef.current) return;
        setNetworkGraph(graph);
        setReport(fetchedReport);
        setRingContext(ring);
      } else {
        setNetworkGraph(null);
        setReport(inv.report ?? null);
        setRingContext(inv.ring ?? null);
      }
    } catch (cause) {
      if (generation !== modeGenerationRef.current) return;
      setInvestigation(null);
      setNetworkGraph(null);
      setReport(null);
      setRingContext(null);
      setError(cause instanceof Error ? cause.message : 'Transaction request failed');
    } finally {
      if (generation === modeGenerationRef.current) setLoading(false);
    }
  }, [api, mode, setInvestigation]);

  const investigateScenario = useCallback(async (scenarioId: string, previewToken?: string) => {
    const generation = ++modeGenerationRef.current;
    setLoading(true);
    setScenarioLoading(false);
    setError(null);
    setInvestigation(null);
    setActiveIds(null);
    setNetworkGraph(null);
    setReport(null);
    setRingContext(null);
    sessionStorage.removeItem(ACTIVE_EVENT_KEY);
    try {
      const event = await api.investigateScenario(scenarioId, previewToken);
      if (generation !== modeGenerationRef.current) return;
      await openInvestigationByEventId(event.eventId);
    } catch (cause) {
      if (generation !== modeGenerationRef.current) return;
      setError(cause instanceof Error ? cause.message : 'Scenario investigation failed');
    } finally {
      if (generation === modeGenerationRef.current) setLoading(false);
    }
  }, [api, openInvestigationByEventId, setInvestigation]);

  const loadAmlSimLiveData = useCallback(async () => {
    if (mode !== 'LIVE') return;
    const generation = ++modeGenerationRef.current;
    setError(null);
    try {
      const [transactions, presets, accounts, alerts, patterns] = await Promise.all([
        api.getAmlSimTransactions().catch(() => [] as AmlSimTransaction[]),
        api.getAmlSimPresets().catch(() => ({ benign: [] as AmlSimTransaction[], fraud: [] as AmlSimTransaction[] })),
        api.getAmlSimAccounts().catch(() => [] as AmlSimAccount[]),
        api.getAmlSimAlerts().catch(() => [] as AmlSimAlert[]),
        api.getAmlSimPatterns().catch(() => [] as AmlSimPattern[]),
      ]);
      if (generation !== modeGenerationRef.current) return;
      const combinedTransactions: AmlSimTransaction[] = [...(presets.fraud || []), ...(presets.benign || [])];
      for (const tx of transactions) {
        if (!combinedTransactions.some((t) => t.sourceTransactionId === tx.sourceTransactionId)) {
          combinedTransactions.push(tx);
        }
      }
      setAmlSimTransactions(combinedTransactions);
      setAmlSimAccounts(accounts);
      setAmlSimAlerts(alerts);
      setAmlSimPatterns(patterns);
    } catch (cause) {
      if (generation !== modeGenerationRef.current) return;
      setAmlSimTransactions([]);
      setAmlSimAccounts([]);
      setAmlSimAlerts([]);
      setAmlSimPatterns([]);
      setError(cause instanceof Error ? cause.message : 'AMLSim live data unavailable');
    }
  }, [api, mode]);

  const loadAmlSimInvestigation = useCallback(async (transactionId: string) => {
    const generation = ++modeGenerationRef.current;
    activeAmlSimCaseRef.current = transactionId;
    setError(null);

    if (mode === 'LIVE') {
      setInvestigation(null);
      setNetworkGraph(null);
      setReport(null);
      setRingContext(null);
      setAmlSimInvestigation(null);
      sessionStorage.removeItem(ACTIVE_EVENT_KEY);
    }

    try {
      const nextInvestigation = await api.investigateAmlSimTransaction(transactionId);
      if (generation !== modeGenerationRef.current || activeAmlSimCaseRef.current !== transactionId) return;
      setAmlSimInvestigation(nextInvestigation);
    } catch (cause) {
      if (generation !== modeGenerationRef.current || activeAmlSimCaseRef.current !== transactionId) return;
      setAmlSimInvestigation(null);
      setInvestigation(null);
      setNetworkGraph(null);
      setReport(null);
      setRingContext(null);
      setError(cause instanceof Error ? cause.message : 'AMLSim investigation failed');
    }
  }, [api, mode, setInvestigation]);

  useEffect(() => {
    if (mode !== 'LIVE' || !amlsimInvestigation) return;
    if (activeAmlSimCaseRef.current !== amlsimInvestigation.sourceTransactionId) return;

    const transaction = amlsimTransactions.find((item) => item.sourceTransactionId === amlsimInvestigation.sourceTransactionId);
    if (!transaction) return;

    const next = buildAmlSimCaseContext(transaction, amlsimInvestigation, amlsimAccounts, amlsimAlerts);
    setInvestigation(next.investigation);
    setNetworkGraph(next.networkGraph);
    setReport(next.report);
    setRingContext(next.investigation.ring ?? null);
    setActiveIds({
      eventId: next.investigation.eventId,
      traceId: next.investigation.traceId,
      investigationId: next.investigation.investigationId,
    });
    sessionStorage.setItem(ACTIVE_EVENT_KEY, next.investigation.eventId);
  }, [amlsimAccounts, amlsimAlerts, amlsimInvestigation, amlsimTransactions, mode, setInvestigation]);

  const simulateResponse = useCallback(async () => {
    if (!investigation) return;
    const generation = modeGenerationRef.current;
    try {
      const response = await api.simulateResponse(investigation.investigationId);
      if (generation !== modeGenerationRef.current) return;
      setInvestigationState((current) => current ? { ...current, response } : current);
      setError(null);
    } catch (cause) {
      if (generation !== modeGenerationRef.current) return;
      setError(cause instanceof Error ? cause.message : 'Response simulation failed');
    }
  }, [api, investigation]);

  const clearError = useCallback(() => setError(null), []);

  const checkRing = useCallback(async (transactionId: string) => {
    const raw = await api.checkAmlSimRing(transactionId);
    return raw as import('./context').RingCheckResult;
  }, [api]);

  const [presetBenignOffset, setPresetBenignOffset] = useState(0);
  const [presetFraudOffset, setPresetFraudOffset] = useState(0);

  const refreshAmlSimPresets = useCallback(async (preset: 'BENIGN' | 'FRAUD') => {
    try {
      const nextBenignOffset = preset === 'BENIGN' ? presetBenignOffset + 5 : presetBenignOffset;
      const nextFraudOffset = preset === 'FRAUD' ? presetFraudOffset + 5 : presetFraudOffset;
      const result = await api.refreshAmlSimPresets(nextBenignOffset, nextFraudOffset);
      if (preset === 'BENIGN') {
        setPresetBenignOffset(nextBenignOffset);
        setAmlSimTransactions((prev) => {
          // Remove old benign presets, add fresh ones
          const nonBenign = prev.filter((tx) => tx.datasetIsFraud);
          return [...nonBenign, ...result.benign];
        });
      } else {
        setPresetFraudOffset(nextFraudOffset);
        setAmlSimTransactions((prev) => {
          const nonFraud = prev.filter((tx) => !tx.datasetIsFraud);
          return [...nonFraud, ...result.fraud];
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to refresh preset records');
    }
  }, [api, presetBenignOffset, presetFraudOffset]);

  useEffect(() => {
    refreshSystemStatus();
    loadScenarios();
  }, [loadScenarios, refreshSystemStatus]);

  useEffect(() => {
    if (mode !== 'LIVE') {
      setAmlSimTransactions([]);
      setAmlSimAccounts([]);
      setAmlSimAlerts([]);
      setAmlSimPatterns([]);
      setAmlSimInvestigation(null);
      return;
    }
    void loadAmlSimLiveData();
  }, [loadAmlSimLiveData, mode]);

  useEffect(() => {
    if (mode !== 'LIVE' || investigation) return;
    const eventId = sessionStorage.getItem(ACTIVE_EVENT_KEY);
    if (eventId) void openInvestigationByEventId(eventId);
  }, [investigation, mode, openInvestigationByEventId]);

  const value: AppState = {
    mode, systemStatus, systemStatusLoading, systemStatusError, activeIds, investigation, ringContext, networkGraph, report, error, scenarios, payloadLabGroup, setPayloadLabGroup, scenarioPreview, scenarioLoading, loading,
    amlsimTransactions, amlsimAccounts, amlsimAlerts, amlsimPatterns, amlsimInvestigation,
    inject, loadScenarios, loadScenarioPreview, investigateScenario, loadAmlSimLiveData, loadAmlSimInvestigation, refreshSystemStatus, openInvestigationByEventId, simulateResponse,
    setInvestigation, setRingContext, clearError, checkRing, refreshAmlSimPresets,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
