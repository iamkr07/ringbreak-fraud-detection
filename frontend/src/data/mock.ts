// Centralized mock/demo data factory for RING//BREAK.
// Deterministic — no randomization on every render.

import type {
  ActivityEntry,
  AgentFinding,
  Countermeasure,
  Entity,
  Evidence,
  ForensicReport,
  Investigation,
  NetworkGraph,
  Relationship,
  RiskAssessment,
  RingCandidate,
  Scenario,
  SystemStatus,
  Trace,
  TraceStage,
  TransactionPayload,
  WorkflowNode,
} from '@/types';
import { workflowDescription, workflowResultLabel, workflowResultValue } from '@/services/normalize';

const NOW = '2026-08-24T14:32:09Z';

export const mockSystemStatus: SystemStatus = {
  mode: 'DEMO',
  mlModel: 'isolation_forest',
  backendReachable: false,
  version: '0.9.0-forensic',
  uptimeLabel: '04:12:51',
};

export const mockActivity: ActivityEntry[] = [
  { id: 'a1', time: '14:32:09', label: 'Transaction received', detail: 'TXN-77F1A2 · WIRE · 48,200 USD', severity: 'info' },
  { id: 'a2', time: '14:32:10', label: 'Behavioural anomaly detected', detail: 'Amount deviation +3.4σ from 90-day baseline', severity: 'warning' },
  { id: 'a3', time: '14:32:10', label: 'Shared device discovered', detail: 'DEV-7C3 used by 3 accounts in 24h', severity: 'warning' },
  { id: 'a4', time: '14:32:11', label: 'Suspicious cluster identified', detail: '6 entities · circular fund movement', severity: 'critical' },
  { id: 'a5', time: '14:32:11', label: 'Investigator agents activated', detail: 'Behaviour · Network · Evidence', severity: 'info' },
  { id: 'a6', time: '14:32:12', label: 'Risk assessment completed', detail: 'Score 94/100 · CRITICAL', severity: 'critical' },
  { id: 'a7', time: '14:32:12', label: 'Countermeasure recommended', detail: 'TRANSACTION HOLD (simulated)', severity: 'success' },
];

export const defaultPayload: TransactionPayload = {
  senderAccount: 'ACC-1001',
  receiverAccount: 'ACC-2048',
  amount: 48200,
  currency: 'USD',
  deviceId: 'DEV-7C3',
  ipAddress: '203.0.113.42',
  location: 'Frankfurt, DE',
  merchantId: 'MCH-5521',
  transactionType: 'WIRE',
  timestamp: NOW,
};

export function buildStages(traceId: string, eventId: string): TraceStage[] {
  return [
    {
      index: 1, key: 'ingestion', label: 'INGESTION', status: 'complete', durationMs: 42,
      startedAt: '14:32:09', completedAt: '14:32:09', traceId,
      input: { channel: 'synthetic-inject', payloadSize: '412B' },
      output: { eventId, accepted: true, normalized: true },
      evidence: [],
    },
    {
      index: 2, key: 'feature_engine', label: 'FEATURE ENGINE', status: 'complete', durationMs: 118,
      startedAt: '14:32:09', completedAt: '14:32:10', traceId,
      input: { eventId, featuresRequested: 24 },
      output: { featuresExtracted: 24, anomalies: 4 },
      evidence: [
        ev('e1', 'Amount deviation', '+3.4σ vs 90-day baseline', 88, 'feature_engine'),
        ev('e2', 'Device novelty', 'New device for sender account', 74, 'feature_engine'),
        ev('e3', 'Time deviation', 'Off-pattern hour window', 61, 'feature_engine'),
      ],
    },
    {
      index: 3, key: 'ml_intelligence', label: 'ML INTELLIGENCE', status: 'complete', durationMs: 214,
      startedAt: '14:32:10', completedAt: '14:32:10', traceId,
      input: { featureVector: 24, model: 'gradient-boosted-v4' },
      output: { fraudProbability: 91, decision: 'review' },
      evidence: [ev('e4', 'Model fraud probability', '0.91 — high-risk band', 91, 'ml_model')],
    },
    {
      index: 4, key: 'graph_intelligence', label: 'GRAPH INTELLIGENCE', status: 'complete', durationMs: 305,
      startedAt: '14:32:10', completedAt: '14:32:11', traceId,
      input: { seedEntities: 2, depth: 3 },
      output: { entities: 9, relationships: 14, clusters: 1 },
      evidence: [
        ev('e5', 'Shared device linkage', 'DEV-7C3 shared across 3 accounts', 86, 'graph_engine'),
        ev('e6', 'Shared IP linkage', '203.0.113.42 → 2 accounts', 79, 'graph_engine'),
      ],
    },
    {
      index: 5, key: 'ring_detection', label: 'RING DETECTION', status: 'complete', durationMs: 173,
      startedAt: '14:32:11', completedAt: '14:32:11', traceId,
      input: { graphSnapshot: '9n/14e', algorithm: 'community-detection' },
      output: { ringDetected: true, confidence: 87, members: 6 },
      evidence: [ev('e7', 'Circular transaction pattern', 'A→B→C→D→A within 4 hops', 83, 'ring_detector')],
    },
    {
      index: 6, key: 'investigator_agents', label: 'INVESTIGATOR AGENTS', status: 'complete', durationMs: 412,
      startedAt: '14:32:11', completedAt: '14:32:11', traceId,
      input: { agentsDispatched: 3, evidenceItems: 7 },
      output: { conclusions: 3, correlatedEvidence: 9 },
      evidence: [ev('e8', 'Cross-agent corroboration', '3 agents converge on ring RING-0014', 84, 'agents')],
    },
    {
      index: 7, key: 'risk', label: 'RISK', status: 'complete', durationMs: 96,
      startedAt: '14:32:12', completedAt: '14:32:12', traceId,
      input: { agentFindings: 3, evidence: 9 },
      output: { score: 94, level: 'CRITICAL' },
      evidence: [],
    },
    {
      index: 8, key: 'response', label: 'RESPONSE', status: 'complete', durationMs: 38,
      startedAt: '14:32:12', completedAt: '14:32:12', traceId,
      input: { riskScore: 94, level: 'CRITICAL' },
      output: { action: 'TRANSACTION_HOLD', simulated: true },
      evidence: [],
    },
  ];
}

function ev(id: string, label: string, description: string, strength: number, source: string): Evidence {
  return {
    id, label, description, strength, source,
    timestamp: '14:32:11', relationship: 'correlated',
  };
}

export function buildTrace(traceId = 'TRC-82F4A1', eventId = 'EVT-77F1A2', investigationId = 'INV-2026-0481'): Trace {
  return {
    traceId, eventId, investigationId,
    createdAt: NOW,
    state: 'COMPLETE',
    stages: buildStages(traceId, eventId),
  };
}

export function buildWorkflowNodes(trace: Trace): WorkflowNode[] {
  return trace.stages.map((s) => ({
    key: s.key,
    label: s.label.toUpperCase(),
    status: s.status,
    durationMs: s.durationMs,
    resultLabel: workflowResultLabel(s),
    resultValue: workflowResultValue(s),
    description: workflowDescription(s),
  }));
}

export const mockNetworkGraph: NetworkGraph = {
  entities: [
    ent('ACC-1001', 'ACCOUNT', 'ACC-1001', 240, 220, 17, 6, 2, 1, true, { role: 'sender', balance: '312,400 USD' }),
    ent('ACC-2048', 'ACCOUNT', 'ACC-2048', 540, 160, 12, 4, 2, 1, true, { role: 'receiver', balance: '88,100 USD' }),
    ent('ACC-3310', 'ACCOUNT', 'ACC-3310', 700, 280, 9, 5, 1, 1, true, { role: 'ring member' }),
    ent('ACC-4421', 'ACCOUNT', 'ACC-4421', 460, 420, 6, 3, 1, 0, true, { role: 'ring member' }),
    ent('DEV-7C3', 'DEVICE', 'DEV-7C3', 360, 300, 0, 0, 0, 0, true, { fingerprint: 'Chrome/Win' }),
    ent('DEV-9A1', 'DEVICE', 'DEV-9A1', 660, 380, 0, 0, 0, 0, false, { fingerprint: 'Safari/iOS' }),
    ent('IP-203', 'IP', '203.0.113.42', 300, 420, 0, 0, 0, 0, true, { asn: 'AS-2905', geo: 'Frankfurt' }),
    ent('IP-198', 'IP', '198.51.100.7', 620, 460, 0, 0, 0, 0, false, { asn: 'AS-15169', geo: 'Dublin' }),
    ent('MCH-5521', 'MERCHANT', 'MCH-5521', 560, 540, 0, 0, 0, 0, false, { category: 'electronics' }),
  ],
  relationships: [
    rel('r1', 'ACC-1001', 'ACC-2048', 'TRANSACTION', 1, true),
    rel('r2', 'ACC-1001', 'DEV-7C3', 'SHARED_DEVICE', 0.8, true),
    rel('r3', 'ACC-2048', 'DEV-7C3', 'SHARED_DEVICE', 0.8, true),
    rel('r4', 'ACC-3310', 'DEV-7C3', 'SHARED_DEVICE', 0.7, true),
    rel('r5', 'ACC-1001', 'IP-203', 'SHARED_IP', 0.7, true),
    rel('r6', 'ACC-2048', 'IP-203', 'SHARED_IP', 0.6, true),
    rel('r7', 'ACC-2048', 'ACC-3310', 'TRANSACTION', 0.6, true),
    rel('r8', 'ACC-3310', 'ACC-4421', 'TRANSACTION', 0.6, true),
    rel('r9', 'ACC-4421', 'ACC-1001', 'TRANSACTION', 0.7, true),
    rel('r10', 'ACC-2048', 'MCH-5521', 'SHARED_MERCHANT', 0.3, false),
    rel('r11', 'ACC-3310', 'IP-198', 'SHARED_IP', 0.2, false),
    rel('r12', 'ACC-4421', 'DEV-9A1', 'SHARED_DEVICE', 0.2, false),
  ],
};

function ent(
  id: string, type: Entity['type'], label: string, x: number, y: number,
  transactions: number, connectedAccounts: number, sharedDevices: number, sharedIps: number,
  suspicious: boolean, metadata?: Record<string, string>,
): Entity {
  const risk = suspicious ? 'HIGH' : 'LOW';
  return { id, type, label, risk, x, y, transactions, connectedAccounts, sharedDevices, sharedIps, suspicious, metadata };
}

function rel(id: string, source: string, target: string, type: Relationship['type'], weight: number, suspicious: boolean): Relationship {
  return { id, source, target, type, weight, suspicious };
}

export const mockRing: RingCandidate = {
  ringId: 'RING-0014',
  confidence: 87,
  members: ['ACC-1001', 'ACC-2048', 'ACC-3310', 'ACC-4421'],
  memberCount: 4,
  transactionVolume: 11,
  amountInvolved: 162400,
  currency: 'USD',
  detected: true,
  signals: [
    { key: 'shared_device', label: 'Shared device', description: 'DEV-7C3 shared across 3 ring members', weight: 0.9, present: true },
    { key: 'shared_ip', label: 'Shared IP', description: '203.0.113.42 used by 2 members', weight: 0.7, present: true },
    { key: 'rapid_funds', label: 'Rapid fund movement', description: 'Transfers within 2h windows', weight: 0.8, present: true },
    { key: 'circular', label: 'Circular transaction pattern', description: 'A→B→C→D→A within 4 hops', weight: 0.95, present: true },
    { key: 'timing', label: 'Unusual transaction timing', description: 'Off-pattern hour window', weight: 0.5, present: true },
  ],
};

export const mockAgents: AgentFinding[] = [
  {
    agentKey: 'behaviour', name: 'BEHAVIOUR INVESTIGATOR', status: 'complete',
    finding: 'Anomalous transaction profile — amount, velocity, device novelty',
    conclusion: 'Behaviour strongly deviates from sender baseline. Supports fraud hypothesis.',
    confidence: 89, evidenceCount: 3,
    objective: 'Assess whether transaction behaviour is anomalous relative to historical baseline.',
    observations: [
      'Amount 48,200 USD is +3.4σ above 90-day mean (12,100 USD).',
      'Transaction velocity: 4 transfers in 2h — 9× baseline.',
      'Device DEV-7C3 never previously used by ACC-1001.',
    ],
    evidence: [ev('e1', 'Amount deviation', '+3.4σ vs 90-day baseline', 88, 'feature_engine')],
  },
  {
    agentKey: 'network', name: 'NETWORK INVESTIGATOR', status: 'complete',
    finding: 'Shared device & IP link 4 accounts into a circular cluster',
    conclusion: 'Entity graph reveals ring topology with circular fund movement.',
    confidence: 86, evidenceCount: 3,
    objective: 'Map entity relationships and identify structural fraud patterns.',
    observations: [
      'DEV-7C3 shared by ACC-1001, ACC-2048, ACC-3310.',
      'Circular path ACC-1001 → ACC-2048 → ACC-3310 → ACC-4421 → ACC-1001.',
      'Cluster of 4 accounts with 11 transactions totalling 162,400 USD.',
    ],
    evidence: [ev('e5', 'Shared device linkage', 'DEV-7C3 across 3 accounts', 86, 'graph_engine')],
  },
  {
    agentKey: 'evidence', name: 'EVIDENCE INVESTIGATOR', status: 'complete',
    finding: '9 evidence items correlated across 3 agents — strong corroboration',
    conclusion: 'Evidence converges on ring RING-0014 with high strength.',
    confidence: 84, evidenceCount: 9,
    objective: 'Correlate evidence across investigation domains and score strength.',
    observations: [
      '9 evidence items from feature, ML, graph, and ring stages.',
      'Average evidence strength 82/100.',
      '3 independent agents corroborate ring hypothesis.',
    ],
    evidence: [ev('e8', 'Cross-agent corroboration', '3 agents converge on RING-0014', 84, 'agents')],
  },
];

export const mockRisk: RiskAssessment = {
  score: 94, level: 'CRITICAL',
  fraudProbability: 91, confidence: 88, evidenceStrength: 82,
  assessedAt: '14:32:12',
  factors: [
    { key: 'behaviour', label: 'Behaviour', score: 89, weight: 0.25, detail: 'Amount + velocity + device novelty anomalies' },
    { key: 'network', label: 'Network', score: 86, weight: 0.25, detail: 'Circular cluster with shared device/IP' },
    { key: 'transaction', label: 'Transaction', score: 78, weight: 0.15, detail: 'High-value WIRE to new counterparty' },
    { key: 'device', label: 'Device', score: 74, weight: 0.15, detail: 'New device fingerprint for sender' },
    { key: 'location', label: 'Location', score: 58, weight: 0.10, detail: 'IP geo consistent with sender history' },
    { key: 'temporal', label: 'Temporal', score: 61, weight: 0.10, detail: 'Off-pattern timing window' },
  ],
};

export const mockCountermeasure: Countermeasure = {
  type: 'TRANSACTION_HOLD',
  recommendedAction: 'TRANSACTION HOLD',
  reason: 'Critical risk score (94/100) with corroborated fraud-ring evidence.',
  triggeringEvidence: ['Circular transaction pattern', 'Shared device across 3 accounts', 'Amount deviation +3.4σ'],
  confidence: 88,
  simulated: true,
};

export const mockScenarios: Scenario[] = [
  {
    id: 'normal', name: 'Normal transaction', description: 'Routine payment within established baseline.',
    category: 'normal', expectedOutcome: 'Low risk — no ring detected',
    payload: { senderAccount: 'ACC-5001', receiverAccount: 'ACC-5002', amount: 320, currency: 'USD', deviceId: 'DEV-01AA', ipAddress: '192.168.1.10', location: 'London, GB', merchantId: 'MCH-0001', transactionType: 'P2P', timestamp: NOW },
  },
  {
    id: 'high_value', name: 'High-value transaction', description: 'Large transfer above typical threshold.',
    category: 'suspicious', expectedOutcome: 'Elevated risk — review recommended',
    payload: { senderAccount: 'ACC-5003', receiverAccount: 'ACC-5004', amount: 95000, currency: 'USD', deviceId: 'DEV-02BB', ipAddress: '10.0.0.5', location: 'New York, US', merchantId: 'MCH-0002', transactionType: 'WIRE', timestamp: NOW },
  },
  {
    id: 'new_device', name: 'New device', description: 'Transaction from unseen device fingerprint.',
    category: 'suspicious', expectedOutcome: 'Medium risk — verify identity',
    payload: { senderAccount: 'ACC-5001', receiverAccount: 'ACC-5005', amount: 1200, currency: 'USD', deviceId: 'DEV-99ZZ', ipAddress: '192.168.1.10', location: 'London, GB', merchantId: 'MCH-0001', transactionType: 'CARD', timestamp: NOW },
  },
  {
    id: 'new_ip', name: 'New IP', description: 'Transaction from new IP address.',
    category: 'suspicious', expectedOutcome: 'Medium risk — geo mismatch check',
    payload: { senderAccount: 'ACC-5001', receiverAccount: 'ACC-5002', amount: 450, currency: 'USD', deviceId: 'DEV-01AA', ipAddress: '203.0.113.99', location: 'Unknown', merchantId: 'MCH-0001', transactionType: 'P2P', timestamp: NOW },
  },
  {
    id: 'ato', name: 'Account takeover', description: 'Rapid profile changes + unusual transfer.',
    category: 'malicious', expectedOutcome: 'High risk — account protection',
    payload: { senderAccount: 'ACC-5006', receiverAccount: 'ACC-5007', amount: 18700, currency: 'USD', deviceId: 'DEV-77CC', ipAddress: '198.51.100.20', location: 'Lagos, NG', merchantId: 'MCH-0003', transactionType: 'WIRE', timestamp: NOW },
  },
  {
    id: 'shared_device', name: 'Shared device', description: 'Multiple accounts using same device.',
    category: 'malicious', expectedOutcome: 'High risk — ring signal',
    payload: { senderAccount: 'ACC-1001', receiverAccount: 'ACC-2048', amount: 8200, currency: 'USD', deviceId: 'DEV-7C3', ipAddress: '203.0.113.42', location: 'Frankfurt, DE', merchantId: 'MCH-5521', transactionType: 'WIRE', timestamp: NOW },
  },
  {
    id: 'shared_ip', name: 'Shared IP', description: 'Multiple accounts from one IP.',
    category: 'malicious', expectedOutcome: 'Medium-high risk — network signal',
    payload: { senderAccount: 'ACC-2002', receiverAccount: 'ACC-2003', amount: 3400, currency: 'USD', deviceId: 'DEV-22BB', ipAddress: '203.0.113.42', location: 'Frankfurt, DE', merchantId: 'MCH-5521', transactionType: 'ACH', timestamp: NOW },
  },
  {
    id: 'circular', name: 'Circular transfer', description: 'Funds returning to origin via intermediaries.',
    category: 'malicious', expectedOutcome: 'Critical risk — ring detection',
    payload: { senderAccount: 'ACC-3310', receiverAccount: 'ACC-4421', amount: 22000, currency: 'USD', deviceId: 'DEV-7C3', ipAddress: '203.0.113.42', location: 'Frankfurt, DE', merchantId: 'MCH-5521', transactionType: 'WIRE', timestamp: NOW },
  },
  {
    id: 'fraud_ring', name: 'Fraud ring', description: 'Coordinated cluster with shared infrastructure.',
    category: 'malicious', expectedOutcome: 'Critical risk — full investigation',
    payload: { ...defaultPayload },
  },
  {
    id: 'false_positive', name: 'False positive', description: 'Looks suspicious but is legitimate.',
    category: 'normal', expectedOutcome: 'Low risk after correlation',
    payload: { senderAccount: 'ACC-7001', receiverAccount: 'ACC-7002', amount: 5200, currency: 'USD', deviceId: 'DEV-55DD', ipAddress: '172.16.0.8', location: 'Singapore, SG', merchantId: 'MCH-0004', transactionType: 'WIRE', timestamp: NOW },
  },
];

function stableDemoId(payload: TransactionPayload): string {
  const serialized = Object.keys(payload).sort().map((key) => `${key}:${String(payload[key as keyof TransactionPayload])}`).join('|');
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = Math.imul(hash ^ serialized.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

export function buildInvestigation(payload: TransactionPayload, identityKey = stableDemoId(payload)): Investigation {
  const eventId = `EVT-${identityKey}`;
  const traceId = `TRC-${identityKey}`;
  const investigationId = `INV-DEMO-${identityKey}`;
  const trace = buildTrace(traceId, eventId, investigationId);
  return {
    investigationId, eventId, traceId,
    state: 'COMPLETE',
    createdAt: NOW, updatedAt: NOW,
    payload, trace,
    risk: mockRisk, ring: mockRing, agents: mockAgents, response: mockCountermeasure,
  };
}

export function buildForensicReport(inv: Investigation): ForensicReport {
  return {
    investigationId: inv.investigationId,
    eventId: inv.eventId,
    traceId: inv.traceId,
    generatedAt: inv.updatedAt || inv.createdAt,
    transactionSummary: `${inv.payload.amount.toLocaleString()} ${inv.payload.currency} ${inv.payload.transactionType} from ${inv.payload.senderAccount} to ${inv.payload.receiverAccount}`,
    payload: inv.payload,
    risk: inv.risk ?? mockRisk,
    mlFindings: 'Fraud probability 91% — high-risk band. Amount deviation +3.4σ, device novelty detected.',
    networkFindings: '4-account circular cluster with shared device (DEV-7C3) and shared IP (203.0.113.42).',
    ring: inv.ring ?? null,
    agents: inv.agents ?? mockAgents,
    evidenceTimeline: inv.trace.stages.flatMap((s) => s.evidence),
    response: inv.response ?? null,
    conclusion: inv.risk && inv.ring?.detected
      ? `Investigation ${inv.investigationId} concludes a CRITICAL-risk fraud ring (${inv.ring.ringId}) with ${inv.ring.confidence}% confidence. Recommended simulated action: ${inv.response?.recommendedAction ?? 'NONE'}.`
      : `Investigation ${inv.investigationId} concludes with no fraud ring detected. Risk score ${inv.risk?.score ?? 0}/100.`,
  };
}

export const mockCommandStats = {
  activeInvestigations: 3,
  transactionsAnalyzed: 14892,
  fraudRingsDetected: 14,
  amountAtRisk: 2840000,
};
