// API service boundary for RING//BREAK.
// Single place that talks to the backend. UI never imports this directly
// except through the store. Reads VITE_API_BASE_URL; falls back to mock.

import type {
  Event,
  ForensicReport,
  Investigation,
  NetworkGraph,
  RingCandidate,
  Scenario,
  ScenarioPreview,
  SystemStatus,
  Trace,
  TransactionPayload,
  AgentFinding,
  RiskAssessment,
  Countermeasure,
  AmlSimTransaction,
  AmlSimAccount,
  AmlSimAlert,
  AmlSimPattern,
  AmlSimInvestigation,
} from '@/types';
import {
  buildInvestigation,
  mockSystemStatus,
  mockNetworkGraph,
  mockRing,
  mockAgents,
  mockRisk,
  mockCountermeasure,
  mockScenarios,
  buildForensicReport,
} from '@/data/mock';
import { normalizeInvestigation, normalizeNetworkGraph, normalizeReport, normalizeRing, normalizeRisk, normalizeTrace } from '@/services/normalize';

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

export interface ApiClient {
  injectTransaction(payload: TransactionPayload, correlationId?: string): Promise<Event>;
  getInvestigation(eventId: string): Promise<Investigation>;
  getTrace(traceId: string): Promise<Trace>;
  getNetworkGraph(investigationId: string): Promise<NetworkGraph>;
  getRing(investigationId: string): Promise<RingCandidate | null>;
  getRingById(ringId: string): Promise<RingCandidate | null>;
  getAgents(investigationId: string): Promise<AgentFinding[]>;
  getRisk(investigationId: string): Promise<RiskAssessment>;
  getResponse(investigationId: string): Promise<Countermeasure | null>;
  simulateResponse(investigationId: string): Promise<Countermeasure>;
  getForensicReport(investigationId: string): Promise<ForensicReport>;
  getScenarios(): Promise<Scenario[]>;
  getScenarioPreview(scenarioId: string): Promise<ScenarioPreview>;
  investigateScenario(scenarioId: string, previewToken?: string): Promise<Event>;
  getAmlSimTransactions(params?: { offset?: number; limit?: number; is_fraud?: boolean; search?: string }): Promise<AmlSimTransaction[]>;
  getAmlSimTransaction(transactionId: string): Promise<AmlSimTransaction>;
  getAmlSimAccounts(): Promise<AmlSimAccount[]>;
  getAmlSimAccount(accountId: string): Promise<AmlSimAccount>;
  getAmlSimAlerts(): Promise<AmlSimAlert[]>;
  getAmlSimAlert(alertId: string): Promise<AmlSimAlert>;
  getAmlSimPatterns(): Promise<AmlSimPattern[]>;
  getAmlSimPresets(): Promise<{ benign: AmlSimTransaction[]; fraud: AmlSimTransaction[] }>;
  refreshAmlSimPresets(offset: number, fraudOffset: number): Promise<{ benign: AmlSimTransaction[]; fraud: AmlSimTransaction[] }>;
  investigateAmlSimTransaction(transactionId: string): Promise<AmlSimInvestigation>;
  checkAmlSimRing(transactionId: string): Promise<Record<string, unknown>>;
  getNodeRingHistory(accountId: string): Promise<{ accountId: string; hasHistory: boolean; totalRings: number; isRepeatOffender: boolean; pastRings: Array<{ ringId: string; patternType: string; confidence: number; amountInvolved: number; coConspirators: string[] }>; coConspirators: string[] }>;
  persistRing(ringData: unknown): Promise<Record<string, unknown>>;
  getDemoCase(): Promise<Investigation>;
  getSystemStatus(): Promise<SystemStatus>;
  exportProtectedPdf(reportData: Record<string, unknown> | ForensicReport): Promise<Blob>;
}

// ---- Mock implementation (DEMO mode) ----

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mockInvestigationsByEventId = new Map<string, Investigation>();
const mockInvestigationsByTraceId = new Map<string, Investigation>();
const mockInvestigationsByInvestigationId = new Map<string, Investigation>();

function retainMockInvestigation(investigation: Investigation): Investigation {
  mockInvestigationsByEventId.set(investigation.eventId, investigation);
  mockInvestigationsByTraceId.set(investigation.traceId, investigation);
  mockInvestigationsByInvestigationId.set(investigation.investigationId, investigation);
  return investigation;
}

const mockApi: ApiClient = {
  async injectTransaction(payload) {
    await delay(600);
    const inv = retainMockInvestigation(buildInvestigation(payload));
    return {
      eventId: inv.eventId, traceId: inv.traceId, investigationId: inv.investigationId,
      receivedAt: new Date().toISOString(), ingestionStatus: 'accepted', payload,
    };
  },
  async getInvestigation(eventId) {
    await delay(200);
    return mockInvestigationsByEventId.get(eventId) ?? retainMockInvestigation(buildInvestigation(defaultPayloadFor(), eventId));
  },
  async getTrace(traceId) {
    await delay(150);
    return mockInvestigationsByTraceId.get(traceId)?.trace ?? buildInvestigation(defaultPayloadFor(), traceId).trace;
  },
  async getNetworkGraph() { await delay(150); return mockNetworkGraph; },
  async getRing() { await delay(120); return mockRing; },
  async getRingById() { await delay(120); return mockRing; },
  async getAgents() { await delay(120); return mockAgents; },
  async getRisk() { await delay(100); return mockRisk; },
  async getResponse() { await delay(100); return mockCountermeasure; },
  async simulateResponse() { await delay(100); return mockCountermeasure; },
  async getForensicReport(investigationId) {
    await delay(200);
    const investigation = mockInvestigationsByInvestigationId.get(investigationId)
      ?? buildInvestigation(defaultPayloadFor(), investigationId);
    return buildForensicReport(investigation);
  },
  async getScenarios() { await delay(100); return mockScenarios; },
  async getScenarioPreview(scenarioId) {
    await delay(100);
    const scenario = mockScenarios.find((item) => item.id === scenarioId) ?? mockScenarios[0];
    return { ...scenario, dataset: 'controlled-demo', sourceRowNumber: 0, sourceRow: {}, mappedPayload: scenario.payload, modelFeatures: {}, groundTruth: { isFraud: 0, isFlaggedFraud: 0 }, mapping: 'Controlled demo payload', derivedContext: {} };
  },
  async investigateScenario(scenarioId) { return this.injectTransaction((await this.getScenarioPreview(scenarioId)).mappedPayload); },
  async getAmlSimTransactions() { return []; },
  async getAmlSimTransaction() { throw new Error('AMLSim transaction detail unavailable in DEMO mode'); },
  async getAmlSimAccounts() { return []; },
  async getAmlSimAccount() { throw new Error('AMLSim account detail unavailable in DEMO mode'); },
  async getAmlSimAlerts() { return []; },
  async getAmlSimAlert() { throw new Error('AMLSim alert detail unavailable in DEMO mode'); },
  async getAmlSimPatterns() { return []; },
  async getAmlSimPresets() { return { benign: [], fraud: [] }; },
  async refreshAmlSimPresets() { return { benign: [], fraud: [] }; },
  async investigateAmlSimTransaction() { throw new Error('AMLSim investigation unavailable in DEMO mode'); },
  async checkAmlSimRing() { return { detected: false, reason: 'Demo mode', ring: null, relatedTransactions: [], totalChecked: 0 }; },
  getNodeRingHistory(accountId) {
    return liveApi.getNodeRingHistory(accountId).catch(() => ({ accountId, hasHistory: false, totalRings: 0, isRepeatOffender: false, pastRings: [], coConspirators: [] }));
  },
  async persistRing() { return { status: 'mock' }; },
  async getDemoCase() {
    await delay(100);
    return mockInvestigationsByInvestigationId.get('d3d6665f-4491-4632-81b9-ab1365b57cb8')
      ?? buildInvestigation(defaultPayloadFor(), 'd3d6665f-4491-4632-81b9-ab1365b57cb8');
  },
  async getSystemStatus() { await delay(50); return mockSystemStatus; },
  exportProtectedPdf(reportData) {
    const url = `${API_BASE || 'http://127.0.0.1:8000'}/export-protected-pdf`;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportData),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`PDF export failed (${res.status})`);
      return res.blob();
    });
  },
};

function defaultPayloadFor(): TransactionPayload {
  return buildInvestigation(mockScenarios[8].payload).payload;
}

// ---- Live implementation (LIVE mode) ----

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const requestInit = { ...init };
  if (requestInit.body != null && typeof requestInit.body !== 'string') {
    requestInit.body = JSON.stringify(requestInit.body);
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...requestInit,
    headers: { 'Content-Type': 'application/json', ...(requestInit.headers ?? {}) },
  });
  const contentType = res.headers.get('content-type') ?? '';
  const body = await res.text();

  if (!res.ok) {
    let detail = body;
    if (contentType.includes('application/json')) {
      try {
        const parsed = JSON.parse(body) as { detail?: string };
        detail = parsed.detail ?? body;
      } catch {
        detail = 'API returned invalid JSON';
      }
    } else if (!detail) {
      detail = 'API returned an unexpected non-JSON response';
    }
    throw new Error(`API ${res.status}: ${detail}`);
  }

  if (!contentType.includes('application/json')) {
    throw new Error(`API ${res.status}: API returned an unexpected response (${contentType || 'unknown content type'})`);
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`API ${res.status}: API returned invalid JSON`);
  }
}

function normalizeSystemStatus(value: unknown): SystemStatus {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const sourceDataset = typeof raw.sourceDataset === 'string' ? raw.sourceDataset : undefined;
  const isAmlsim = sourceDataset === 'AMLSim' || typeof raw.datasetPath === 'string';
  const inlineMode = typeof raw.mode === 'string' && (raw.mode === 'LIVE' || raw.mode === 'DEMO') ? raw.mode : 'LIVE';
  const fallbackModel = typeof raw.mlModel === 'string' ? raw.mlModel : isAmlsim ? 'AMLSim dataset live source' : 'unknown';

  return {
    mode: inlineMode,
    mlModel: fallbackModel,
    backendReachable: raw.backendReachable !== undefined ? Boolean(raw.backendReachable) : true,
    version: typeof raw.version === 'string' ? raw.version : (isAmlsim ? 'AMLSim' : '0.1.0'),
    uptimeLabel: typeof raw.uptimeLabel === 'string' ? raw.uptimeLabel : 'ONLINE',
  };
}

const liveApi: ApiClient = {
  injectTransaction(payload, correlationId) {
    return http<Event>('/transactions/inject', {
      method: 'POST',
      headers: correlationId ? { 'X-Correlation-ID': correlationId } : undefined,
      body: payload as unknown as BodyInit,
    });
  },
  getInvestigation(eventId) {
    return http<unknown>(`/events/${eventId}`).then(normalizeInvestigation);
  },
  getTrace(traceId) {
    return http<unknown>(`/traces/${traceId}`).then(normalizeTrace);
  },
  getNetworkGraph(investigationId) {
    return http<unknown>(`/investigations/${investigationId}/network`).then(normalizeNetworkGraph);
  },
  getRing(investigationId) {
    return http<unknown>(`/investigations/${investigationId}/ring`).then(normalizeRing);
  },
  getRingById(ringId) {
    return http<unknown>(`/rings/${ringId}`).then(normalizeRing);
  },
  getAgents(investigationId) {
    return http<AgentFinding[]>(`/investigations/${investigationId}/agents`);
  },
  getRisk(investigationId) {
    return http<unknown>(`/investigations/${investigationId}/risk`).then(normalizeRisk);
  },
  getResponse(investigationId) {
    return http<Countermeasure | null>(`/investigations/${investigationId}/response`);
  },
  simulateResponse(investigationId) {
    return http<Countermeasure>(`/investigations/${investigationId}/response/simulate`, { method: 'POST' });
  },
  getForensicReport(investigationId) {
    return http<unknown>(`/investigations/${investigationId}/report`).then(normalizeReport);
  },
  getScenarios() {
    return http<Scenario[]>('/scenarios');
  },
  getScenarioPreview(scenarioId) {
    return http<ScenarioPreview>(`/scenarios/${scenarioId}/preview`);
  },
  investigateScenario(scenarioId, previewToken) {
    return http<Event>(`/scenarios/${scenarioId}/investigate`, {
      method: 'POST',
      body: JSON.stringify({ previewToken }),
    });
  },
  getAmlSimTransactions(params) {
    const qs = new URLSearchParams();
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.is_fraud !== undefined) qs.set('is_fraud', String(params.is_fraud));
    if (params?.search) qs.set('search', params.search);
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return http<AmlSimTransaction[]>(`/amlsim/transactions${query}`);
  },
  getAmlSimTransaction(transactionId) {
    return http<AmlSimTransaction>(`/amlsim/transactions/${transactionId}`);
  },
  getAmlSimAccounts() {
    return http<AmlSimAccount[]>('/amlsim/accounts');
  },
  getAmlSimAccount(accountId) {
    return http<AmlSimAccount>(`/amlsim/accounts/${accountId}`);
  },
  getAmlSimAlerts() {
    return http<AmlSimAlert[]>('/amlsim/alerts');
  },
  getAmlSimAlert(alertId) {
    return http<AmlSimAlert>(`/amlsim/alerts/${alertId}`);
  },
  getAmlSimPatterns() {
    return http<AmlSimPattern[]>('/amlsim/patterns');
  },
  getAmlSimPresets() {
    return http<{ benign: AmlSimTransaction[]; fraud: AmlSimTransaction[] }>('/amlsim/presets');
  },
  refreshAmlSimPresets(offset, fraudOffset) {
    return http<{ benign: AmlSimTransaction[]; fraud: AmlSimTransaction[] }>(`/amlsim/presets/refresh?offset=${offset}&fraud_offset=${fraudOffset}`);
  },
  investigateAmlSimTransaction(transactionId) {
    return http<AmlSimInvestigation>(`/amlsim/investigate/${transactionId}`);
  },
  checkAmlSimRing(transactionId) {
    return http<Record<string, unknown>>(`/amlsim/ring-check/${transactionId}`);
  },
  getNodeRingHistory(accountId) {
    const cleanId = accountId.replace('ACCOUNT:', '');
    return http<{ accountId: string; hasHistory: boolean; totalRings: number; isRepeatOffender: boolean; pastRings: Array<{ ringId: string; patternType: string; confidence: number; amountInvolved: number; coConspirators: string[] }>; coConspirators: string[] }>(`/gnn/memory/node/${cleanId}`);
  },
  persistRing(ringData) {
    return http<Record<string, unknown>>('/gnn/memory/persist-ring', {
      method: 'POST',
      body: JSON.stringify(ringData),
    });
  },
  getDemoCase() {
    return http<unknown>('/demo/case').then(normalizeInvestigation);
  },
  getSystemStatus() {
    return http<unknown>('/amlsim/status').then((value) => normalizeSystemStatus(value));
  },
  exportProtectedPdf(reportData) {
    const url = API_BASE ? `${API_BASE}/export-protected-pdf` : '/export-protected-pdf';
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportData),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`PDF export failed (${res.status})`);
      return res.blob();
    });
  },
};

export function createApi(mode: 'DEMO' | 'LIVE'): ApiClient {
  if (mode === 'LIVE') return liveApi;
  return mockApi;
}

export type { SystemStatus };
