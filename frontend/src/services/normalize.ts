import type {
  AgentFinding,
  Countermeasure,
  Entity,
  ForensicReport,
  Investigation,
  NetworkGraph,
  Relationship,
  RiskAssessment,
  RiskLevel,
  RingCandidate,
  Trace,
  TraceStage,
} from '@/types';
import { formatPercentage } from '@/lib/format';

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue {
  return value && typeof value === 'object' ? value as RecordValue : {};
}

export function normalizeRisk(value: unknown): RiskAssessment {
  const raw = asRecord(value);
  const score = Number(raw.score ?? raw.riskScore ?? 0);
  const level = String(raw.level ?? raw.severity ?? 'LOW') as RiskLevel;
  const references = Array.isArray(raw.evidenceReferences) ? raw.evidenceReferences : [];
  const explanation = typeof raw.explanation === 'string' ? raw.explanation : undefined;
  const rawFactors = Array.isArray(raw.factors)
    ? raw.factors
    : Array.isArray(raw.contributingFactors) ? raw.contributingFactors : [];

  const factors = rawFactors.flatMap((factor: unknown) => {
    const item = asRecord(factor);
    if (
      typeof factor !== 'object' || factor === null
      || typeof item.key !== 'string'
      || typeof item.label !== 'string'
      || typeof item.score !== 'number'
      || typeof item.weight !== 'number'
      || typeof item.detail !== 'string'
    ) return [];
    return [{
      key: item.key,
      label: item.label,
      score: item.score,
      weight: item.weight,
      detail: item.detail,
    }];
  });

  return {
    score,
    level,
    fraudProbability: typeof raw.fraudProbability === 'number' ? raw.fraudProbability : undefined,
    confidence: Number(raw.confidence ?? 0),
    evidenceStrength: typeof raw.evidenceStrength === 'number' ? raw.evidenceStrength : undefined,
    factors,
    assessedAt: String(raw.assessedAt ?? raw.createdAt ?? ''),
    evidenceReferences: references.length ? references : undefined,
    explanation,
  } as unknown as RiskAssessment;
}

export function normalizeRing(value: unknown): RingCandidate | null {
  if (!value || typeof value !== 'object') return null;
  const raw = asRecord(value);
  const signals = Array.isArray(raw.signals) ? raw.signals.map((signal: unknown) => {
    const item = asRecord(signal);
    const weight = Number(item.weight ?? 0);
    return { ...item, weight: weight > 1 ? weight / 100 : weight, present: Boolean(item.present ?? true) };
  }) : [];
  return { ...raw, confidence: Number(raw.confidence ?? 0), members: Array.isArray(raw.members) ? raw.members : [], signals } as RingCandidate;
}

function formatStageValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(formatStageValue).join(', ') || 'none';

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const preferredKey = ['label', 'name', 'finding', 'signal', 'value', 'key', 'source'].find((key) => record[key] != null);
    if (preferredKey) {
      const preferredValue = formatStageValue(record[preferredKey]);
      const detail = record.description != null ? `: ${formatStageValue(record.description)}` : '';
      return `${preferredValue}${detail}`;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return 'Unserializable value';
    }
  }

  return String(value);
}

const STAGE_META: Record<string, { label: string; description: string; resultLabel: string; resultValue: (s: TraceStage) => string }> = {
  ingestion: { label: 'INGESTION', description: 'Normalize & validate inbound transaction', resultLabel: 'Event', resultValue: (s) => formatStageValue(s.output?.eventId ?? s.input?.eventId) },
  transaction_ingestion: { label: 'INGESTION', description: 'Normalize & validate inbound transaction', resultLabel: 'Event', resultValue: (s) => formatStageValue(s.output?.eventId ?? s.input?.eventId) },
  feature_engine: { label: 'FEATURE ENGINE', description: 'Extract behavioural & contextual signals', resultLabel: 'Anomalies', resultValue: (s) => formatStageValue(s.output?.anomalies ?? s.output?.featuresExtracted) },
  feature_extraction: { label: 'FEATURE ENGINE', description: 'Extract behavioural & contextual signals', resultLabel: 'Anomalies', resultValue: (s) => formatStageValue(s.output?.anomalies ?? s.output?.featuresExtracted) },
  ml_intelligence: { label: 'ML INTELLIGENCE', description: 'Model-based fraud probability scoring', resultLabel: 'Fraud probability', resultValue: (s) => typeof s.output?.fraudProbability === 'number' ? formatPercentage(s.output.fraudProbability) : '—' },
  ml_inference: { label: 'ML INTELLIGENCE', description: 'Model-based fraud probability scoring', resultLabel: 'Fraud probability', resultValue: (s) => typeof s.output?.fraudProbability === 'number' ? formatPercentage(s.output.fraudProbability) : '—' },
  ml_analysis: { label: 'ML INTELLIGENCE', description: 'Model-based fraud probability scoring', resultLabel: 'Fraud probability', resultValue: (s) => typeof s.output?.fraudProbability === 'number' ? formatPercentage(s.output.fraudProbability) : '—' },
  graph_intelligence: { label: 'GRAPH INTELLIGENCE', description: 'Build entity graph from seed accounts', resultLabel: 'Entities linked', resultValue: (s) => formatStageValue(s.output?.entities ?? s.output?.entityCount ?? 0) },
  graph_analysis: { label: 'GRAPH INTELLIGENCE', description: 'Build entity graph from seed accounts', resultLabel: 'Entities linked', resultValue: (s) => formatStageValue(s.output?.entities ?? s.output?.entityCount ?? 0) },
  graph_construction: { label: 'GRAPH INTELLIGENCE', description: 'Build entity graph from seed accounts', resultLabel: 'Entities linked', resultValue: (s) => formatStageValue(s.output?.entities ?? s.output?.entityCount ?? 0) },
  ring_detection: { label: 'RING DETECTION', description: 'Detect suspicious circular clusters', resultLabel: 'Confidence', resultValue: (s) => s.output?.confidence != null ? `${s.output.confidence}%` : s.output?.ringDetected ? 'DETECTED' : 'NONE' },
  investigator_agents: { label: 'INVESTIGATOR AGENTS', description: 'Specialized agents investigate domains', resultLabel: 'Conclusions', resultValue: (s) => formatStageValue(s.output?.conclusions ?? s.output?.agents ?? s.output?.findings) },
  agent_analysis: { label: 'INVESTIGATOR AGENTS', description: 'Specialized agents investigate domains', resultLabel: 'Conclusions', resultValue: (s) => formatStageValue(s.output?.conclusions ?? s.output?.agents ?? s.output?.findings) },
  risk_assessment: { label: 'RISK ASSESSMENT', description: 'Correlate evidence into risk score', resultLabel: 'Score', resultValue: (s) => s.output?.riskScore != null || s.output?.score != null ? `${s.output.riskScore ?? s.output.score}/100` : '—' },
  risk: { label: 'RISK', description: 'Correlate evidence into risk score', resultLabel: 'Score', resultValue: (s) => s.output?.score != null || s.output?.riskScore != null ? `${s.output.score ?? s.output.riskScore}/100` : '—' },
  response: { label: 'RESPONSE', description: 'Recommend simulated countermeasure', resultLabel: 'Action', resultValue: (s) => formatStageValue(s.output?.recommendedAction ?? s.output?.action ?? s.output?.type) },
  countermeasure: { label: 'COUNTERMEASURE', description: 'Enforce simulated countermeasure', resultLabel: 'Action', resultValue: (s) => formatStageValue(s.output?.recommendedAction ?? s.output?.action ?? s.output?.type) },
  report_generation: { label: 'REPORT GENERATION', description: 'Assemble persisted forensic report', resultLabel: 'Report', resultValue: (s) => s.output?.reportGenerated || s.output?.reportId ? 'READY' : '—' },
};

function compareStageIndex(a: TraceStage, b: TraceStage): number {
  if (a.index !== b.index) return a.index - b.index;
  const order = Object.keys(STAGE_META);
  const ai = order.indexOf(a.key);
  const bi = order.indexOf(b.key);
  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
}

export function normalizeStage(value: unknown): TraceStage {
  const raw = asRecord(value);
  const key = String(raw.key ?? 'unknown') as TraceStage['key'];
  const meta = STAGE_META[key];
  const label = meta?.label ?? String(raw.label ?? raw.key ?? 'UNKNOWN');
  return {
    index: Number(raw.index ?? 0),
    key,
    label,
    status: (raw.status ?? 'complete') as TraceStage['status'],
    durationMs: Number(raw.durationMs ?? raw.duration_ms ?? 0),
    startedAt: String(raw.startedAt ?? raw.started_at ?? ''),
    completedAt: (raw.completedAt != null || raw.completed_at != null) ? String(raw.completedAt ?? raw.completed_at) : null,
    input: asRecord(raw.input),
    output: asRecord(raw.output),
    evidence: Array.isArray(raw.evidence) ? raw.evidence : [],
    traceId: String(raw.traceId ?? raw.trace_id ?? ''),
  };
}

export function normalizeTrace(value: unknown): Trace {
  const raw = asRecord(value);
  const stagesUnordered = Array.isArray(raw.stages) ? raw.stages.map((stage: unknown) => normalizeStage(stage)) : [];
  const stagesSorted = [...stagesUnordered].sort(compareStageIndex);
  const stages = stagesSorted.map((s, i) => ({ ...s, index: i + 1 }));
  return { ...raw, stages } as Trace;
}

export function workflowResultLabel(s: TraceStage): string {
  return STAGE_META[s.key]?.resultLabel ?? 'Status';
}
export function workflowResultValue(s: TraceStage): string {
  const fn = STAGE_META[s.key]?.resultValue;
  return fn ? fn(s) : String(s.status);
}
export function workflowDescription(s: TraceStage): string {
  return STAGE_META[s.key]?.description ?? 'Pipeline stage';
}

export function normalizeNetworkGraph(value: unknown): NetworkGraph {
  const raw = asRecord(value);
  const rawEntityList = Array.isArray(raw.entities) ? raw.entities : Array.isArray(raw.nodes) ? raw.nodes : [];
  const rawRelList = Array.isArray(raw.relationships) ? raw.relationships : Array.isArray(raw.links) ? raw.links : [];
  const entities = rawEntityList.flatMap((value: unknown) => {
    const entity = asRecord(value);
    if (typeof entity.id !== 'string' || typeof entity.type !== 'string' || typeof entity.label !== 'string') return [];
    const numberOrNull = (field: string): number | null => typeof entity[field] === 'number' && Number.isFinite(entity[field]) ? entity[field] as number : null;
    return [{
      ...entity,
      id: entity.id,
      type: entity.type,
      label: entity.label,
      risk: entity.risk as Entity['risk'],
      x: numberOrNull('x') ?? 0,
      y: numberOrNull('y') ?? 0,
      transactions: numberOrNull('transactions'),
      connectedAccounts: numberOrNull('connectedAccounts'),
      sharedDevices: numberOrNull('sharedDevices'),
      sharedIps: numberOrNull('sharedIps'),
      suspicious: Boolean(entity.suspicious),
      metadata: entity.metadata && typeof entity.metadata === 'object' ? entity.metadata as Record<string, string> : {},
    } as Entity];
  });
  const relationships = rawRelList.flatMap((value: unknown) => {
    const relationship = asRecord(value);
    if (
      typeof relationship.id !== 'string'
      || typeof relationship.source !== 'string'
      || typeof relationship.target !== 'string'
      || typeof relationship.type !== 'string'
      || typeof relationship.weight !== 'number'
    ) return [];
    return [relationship as unknown as Relationship];
  });
  return { entities, relationships };
}

export function normalizeCountermeasure(value: unknown): Countermeasure | null {
  if (!value || typeof value !== 'object') return null;
  return asRecord(value) as unknown as Countermeasure;
}

function formatValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.length ? v.map((x) => formatValue(x)).join(', ') : 'none';
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).slice(0, 4);
    return entries.map(([k, val]) => `${k}: ${formatValue(val)}`).join(' · ');
  }
  return String(v);
}

const ML_LABELS: Record<string, string> = {
  fraudProbability: 'Fraud probability',
  fraud_probability: 'Fraud probability',
  model: 'Model',
  modelName: 'Model',
  model_name: 'Model',
  decision: 'Decision',
  anomalies: 'Anomalies flagged',
  anomalyCount: 'Anomalies flagged',
  anomaly_count: 'Anomalies flagged',
  confidence: 'Confidence',
  featuresExtracted: 'Features extracted',
  features_extracted: 'Features extracted',
  score: 'Score',
  version: 'Version',
};

function summarizeFindingsObject(obj: RecordValue, labelMap: Record<string, string>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const label = labelMap[k] ?? k;
    parts.push(`${label} ${formatValue(v)}`);
  }
  return parts.length ? parts.join('. ') : 'No structured findings available.';
}

function summarizeFindings(value: unknown, labelMap: Record<string, string>): string {
  if (typeof value === 'string') return value || 'No findings reported.';
  if (value == null) return 'No findings reported.';
  if (Array.isArray(value)) {
    return value.length
      ? value.map((item, i) => {
          if (typeof item === 'object' && item != null) {
            return `${i + 1}. ${summarizeFindingsObject(asRecord(item), labelMap)}`;
          }
          return `${i + 1}. ${formatValue(item)}`;
        }).join(' ')
      : 'No findings reported.';
  }
  if (typeof value === 'object') return summarizeFindingsObject(asRecord(value), labelMap);
  return String(value);
}

export function normalizeReport(value: unknown): ForensicReport {
  const raw = asRecord(value);
  const transaction = asRecord(raw.transaction ?? raw.payload);
  const risk = normalizeRisk(raw.riskAssessment ?? raw.risk);
  const ring = normalizeRing(raw.ringDetection ?? raw.ring);
  const agents = Array.isArray(raw.agentFindings ?? raw.agents) ? (raw.agentFindings ?? raw.agents) as AgentFinding[] : [];
  const evidence = Array.isArray(raw.evidence ?? raw.evidenceTimeline) ? (raw.evidence ?? raw.evidenceTimeline) : [];
  const summary = String(raw.summary ?? raw.transactionSummary ?? '');
  return {
    ...raw,
    investigationId: String(raw.investigationId ?? ''),
    eventId: String(raw.eventId ?? ''),
    traceId: String(raw.traceId ?? ''),
    generatedAt: String(raw.generatedAt ?? ''),
    transactionSummary: summary,
    payload: transaction,
    risk,
    mlFindings: summarizeFindings(raw.mlFindings, ML_LABELS),
    networkFindings: raw.networkFindings ?? raw.graphFindings ?? null,
    ring,
    agents,
    evidenceTimeline: evidence,
    response: normalizeCountermeasure(raw.countermeasure ?? raw.response),
    conclusion: String(raw.conclusion ?? ''),
  } as unknown as ForensicReport;
}

export function normalizeInvestigation(value: unknown): Investigation {
  const raw = asRecord(value);
  return {
    ...raw,
    risk: normalizeRisk(raw.riskAssessment ?? raw.risk),
    ring: normalizeRing(raw.ring),
    agents: Array.isArray(raw.agents) ? raw.agents : [],
    response: normalizeCountermeasure(raw.response),
    report: raw.report ? normalizeReport(raw.report) : undefined,
    trace: normalizeTrace(raw.trace),
  } as Investigation;
}
