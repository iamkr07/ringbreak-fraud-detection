// RING//BREAK — Core data models
// Centralized TypeScript interfaces shared across the investigation platform.

export type InvestigationState =
  | 'IDLE'
  | 'RECEIVED'
  | 'ANALYZING'
  | 'FEATURES_READY'
  | 'ML_ANALYZED'
  | 'GRAPH_ANALYZED'
  | 'RING_DETECTED'
  | 'AGENTS_RUNNING'
  | 'RISK_READY'
  | 'RESPONSE_READY'
  | 'COMPLETE'
  | 'WARNING'
  | 'CRITICAL'
  | 'ERROR'
  | 'OFFLINE';

export type DataMode = 'DEMO' | 'LIVE';
export type RuntimeMode = DataMode | 'UNKNOWN';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type StageStatus = 'pending' | 'running' | 'complete' | 'warning' | 'error' | 'skipped';

export type Currency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'AED' | 'SGD' | string;
export type TransactionType = 'WIRE' | 'P2P' | 'CARD' | 'ACH' | 'CRYPTO' | 'INTERNAL' | 'TRANSFER' | string;

export interface TransactionPayload {
  senderAccount: string;
  receiverAccount: string;
  amount: number;
  currency: Currency;
  deviceId?: string;
  ipAddress?: string;
  location?: string;
  merchantId?: string;
  transactionType: TransactionType;
  timestamp: string; // ISO or Step string
  timeStep?: number | null;
}

export interface Event {
  eventId: string;
  traceId: string;
  investigationId: string;
  receivedAt: string;
  ingestionStatus: 'accepted' | 'rejected' | 'queued';
  payload: TransactionPayload;
}

export type StageKey =
  | 'ingestion'
  | 'feature_engine'
  | 'ml_intelligence'
  | 'graph_intelligence'
  | 'ring_detection'
  | 'investigator_agents'
  | 'risk_assessment'
  | 'risk'
  | 'response'
  | 'countermeasure'
  | 'report_generation';

export interface TraceStage {
  index: number;
  key: StageKey;
  label: string;
  status: StageStatus;
  durationMs: number;
  startedAt: string;
  completedAt: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  evidence: Evidence[];
  traceId: string;
}

export interface Trace {
  traceId: string;
  eventId: string;
  investigationId: string;
  stages: TraceStage[];
  createdAt: string;
  state: InvestigationState;
}

export interface Investigation {
  investigationId: string;
  eventId: string;
  traceId: string;
  state: InvestigationState;
  createdAt: string;
  updatedAt: string;
  payload: TransactionPayload;
  trace: Trace;
  risk?: RiskAssessment;
  ring?: RingCandidate | null;
  agents?: AgentFinding[];
  response?: Countermeasure | null;
  report?: ForensicReport;
}

export interface WorkflowNode {
  key: StageKey;
  label: string;
  status: StageStatus;
  durationMs: number;
  resultLabel: string;
  resultValue: string;
  description: string;
}

export type EntityType = 'ACCOUNT' | 'DEVICE' | 'IP' | 'MERCHANT';
export type RelationshipType =
  | 'TRANSACTION'
  | 'SHARED_DEVICE'
  | 'SHARED_IP'
  | 'SHARED_MERCHANT';

export interface Entity {
  id: string;
  type: EntityType;
  label: string;
  risk: RiskLevel;
  x: number;
  y: number;
  transactions: number | null;
  connectedAccounts: number | null;
  sharedDevices: number | null;
  sharedIps: number | null;
  suspicious: boolean;
  metadata?: Record<string, string>;
}

export interface Relationship {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  weight: number;
  suspicious: boolean;
}

export interface NetworkGraph {
  entities: Entity[];
  relationships: Relationship[];
}

export interface RingCandidate {
  ringId: string;
  confidence: number; // 0-100
  members: string[];
  memberCount: number;
  transactionVolume: number;
  amountInvolved: number;
  currency: Currency;
  signals: RingSignal[];
  detected: boolean;
  memberAccounts?: string[];
  memberEvents?: string[];
  memberInvestigations?: string[];
  transactions?: Array<{ eventId: string; investigationId: string; traceId: string; payload: TransactionPayload }>;
  sharedDevices?: string[];
  sharedIps?: string[];
  sharedMerchants?: string[];
}

export interface RingSignal {
  key: string;
  label: string;
  description: string;
  weight: number;
  present: boolean;
}

export type AgentKey = 'behaviour' | 'network' | 'evidence';

export interface AgentFinding {
  agentKey: AgentKey;
  name: string;
  status: StageStatus;
  finding: string;
  conclusion: string;
  confidence: number | null; // 0-100 when evidence is sufficient
  evidenceStatus?: 'sufficient' | 'insufficient_evidence';
  evidenceReason?: string | null;
  scores?: Record<string, number | null>;
  evidenceCount: number;
  objective: string;
  observations: string[];
  evidence: Evidence[];
}

export interface Evidence {
  id: string;
  label: string;
  description: string;
  strength: number; // 0-100
  source: string;
  timestamp: string;
  relationship: string;
}

export interface RiskFactor {
  key: string;
  label: string;
  score: number; // 0-100
  weight: number; // 0-1
  detail: string;
}

export interface RiskAssessment {
  score: number; // 0-100
  level: RiskLevel;
  fraudProbability?: number; // 0-1 probability returned by the LIVE classifier
  confidence: number; // 0-100
  evidenceStrength?: number; // 0-100 when supplied by the backend
  factors: RiskFactor[];
  assessedAt: string;
  evidenceReferences?: string[];
  explanation?: string;
}

export type CountermeasureType =
  | 'TRANSACTION_HOLD'
  | 'ADDITIONAL_VERIFICATION'
  | 'ACCOUNT_PROTECTION'
  | 'ENHANCED_MONITORING'
  | 'NONE';

export interface Countermeasure {
  type: CountermeasureType;
  status?: 'RECOMMENDED' | 'SIMULATED';
  recommendedAction: string;
  reason: string;
  triggeringEvidence: string[];
  confidence: number;
  simulated: boolean;
  actionId?: string;
  actionType?: string;
  timestamp?: string;
  investigationId?: string;
  supportingEvidence?: string[];
  auditNote?: string;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  category: 'normal' | 'suspicious' | 'malicious';
  payload: TransactionPayload;
  expectedOutcome: string;
  sourceDataset?: string;
  sourceRowNumber?: number;
}

export interface ScenarioPreview extends Scenario {
  dataset: string;
  sourceRowNumber: number;
  sourceRow: Record<string, string>;
  mappedPayload: TransactionPayload;
  modelFeatures: Record<string, unknown>;
  groundTruth: { isFraud: number; isFlaggedFraud: number };
  mapping: string;
  derivedContext: Record<string, string>;
  previewToken?: string;
}

export interface AmlSimTransaction {
  sourceDataset: string;
  sourceTransactionId: string;
  transactionId: string;
  senderAccount: string;
  receiverAccount: string;
  amount: number;
  transactionType: string;
  timeStep: number | null;
  datasetIsFraud: boolean;
  alertId: number | null;
  alertType: string | null;
  timestamp: string | null;
  sourceReference?: Record<string, unknown>;
}

export interface AmlSimAccount {
  accountId: string;
  customerId: string;
  initialBalance: number;
  country: string | null;
  accountType: string | null;
  datasetIsFraud: boolean;
  txBehaviorId: string | null;
  sourceReference?: Record<string, unknown>;
}

export interface AmlSimAlert {
  alertId: number;
  alertType: string | null;
  datasetIsFraud: boolean;
  transactionId: string;
  senderAccount: string;
  receiverAccount: string;
  transactionType: string;
  amount: number;
  timeStep: number | null;
  sourceReference?: Record<string, unknown>;
}

export interface AmlSimPatternEvidence {
  alertId: number;
  patternType: string;
  transactionIds: string[];
  accountIds: string[];
  timeSteps: number[];
  relatedAlertRows?: Array<Record<string, unknown>>;
}

export interface AmlSimPattern {
  patternId: string;
  alertId: number;
  patternType: string;
  transactionIds: string[];
  accountIds: string[];
  timeSteps: number[];
  evidence: Record<string, unknown>;
}

export interface AmlSimInvestigation {
  sourceTransactionId: string;
  patternType: string;
  status: string;
  groundTruth: Record<string, unknown> | null;
  patternEvidence: AmlSimPatternEvidence | null;
  prediction: {
    status: string;
    model: string;
    reason: string;
  };
}

export interface AmlSimPreset {
  id: string;
  name: string;
  description: string;
  category: 'malicious' | 'suspicious' | 'normal';
  patternType: string;
  transactionId: string;
  alertId?: number | null;
  expectedOutcome: string;
  payload: TransactionPayload;
  groundTruth: {
    isFraud: number;
    alertId?: number | null;
    patternType?: string | null;
  };
}

export type PayloadLabGroup = 'DEMO' | 'DIRECT';

export interface ForensicReport {
  investigationId: string;
  eventId: string;
  traceId: string;
  generatedAt: string;
  transactionSummary: string;
  payload: TransactionPayload;
  risk: RiskAssessment;
  mlFindings: string;
  networkFindings: unknown;
  ring: RingCandidate | null;
  agents: AgentFinding[];
  evidenceTimeline: Evidence[];
  response: Countermeasure | null;
  conclusion: string;
}

export interface ActivityEntry {
  id: string;
  time: string;
  label: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
}

export interface SystemStatus {
  mode: DataMode;
  mlModel?: string;
  backendReachable: boolean;
  version: string;
  uptimeLabel: string;
}
