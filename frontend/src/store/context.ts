import { createContext, useContext } from 'react';
import type { Investigation, RuntimeMode, SystemStatus, Scenario, ScenarioPreview, NetworkGraph, ForensicReport, RingCandidate, PayloadLabGroup, AmlSimTransaction, AmlSimAccount, AmlSimAlert, AmlSimPattern, AmlSimInvestigation } from '@/types';

export interface ActiveInvestigationIds {
  eventId: string;
  traceId: string;
  investigationId: string;
}

export interface RingCheckResult {
  transactionId: string;
  detected: boolean;
  reason: string;
  ring: RingCandidate | null;
  gnnScore?: number;
  gnnClique?: {
    cliqueId: string;
    confidence: number;
    memberCount: number;
    members: string[];
    patternType: string;
  } | null;
  attentionWeights?: Array<{
    source: string;
    target: string;
    weight: number;
  }>;
  source?: string;
  relatedTransactions: Array<{
    transactionId: string;
    senderAccount: string;
    receiverAccount: string;
    amount: number;
    timeStep: number;
    alertType: string | null;
    isFraud: boolean;
  }>;
  totalChecked: number;
  alertId?: number | null;
}

export interface AppState {
  mode: RuntimeMode;
  systemStatus: SystemStatus | null;
  systemStatusLoading: boolean;
  systemStatusError: string | null;
  activeIds: ActiveInvestigationIds | null;
  investigation: Investigation | null;
  ringContext: RingCandidate | null;
  networkGraph: NetworkGraph | null;
  report: ForensicReport | null;
  error: string | null;
  scenarios: Scenario[];
  payloadLabGroup: PayloadLabGroup;
  setPayloadLabGroup: (group: PayloadLabGroup) => void;
  scenarioPreview: ScenarioPreview | null;
  scenarioLoading: boolean;
  loading: boolean;
  amlsimTransactions: AmlSimTransaction[];
  amlsimAccounts: AmlSimAccount[];
  amlsimAlerts: AmlSimAlert[];
  amlsimPatterns: AmlSimPattern[];
  amlsimInvestigation: AmlSimInvestigation | null;
  inject: (payload: import('@/types').TransactionPayload, correlationId?: string) => Promise<void>;
  loadScenarios: () => Promise<void>;
  loadScenarioPreview: (scenarioId: string) => Promise<void>;
  investigateScenario: (scenarioId: string, previewToken?: string) => Promise<void>;
  loadAmlSimLiveData: () => Promise<void>;
  loadAmlSimInvestigation: (transactionId: string) => Promise<void>;
  refreshSystemStatus: () => Promise<void>;
  openInvestigationByEventId: (eventId: string) => Promise<void>;
  simulateResponse: () => Promise<void>;
  setInvestigation: (inv: Investigation | null) => void;
  setRingContext: (ring: RingCandidate | null) => void;
  clearError: () => void;
  checkRing: (transactionId: string) => Promise<RingCheckResult>;
  refreshAmlSimPresets: (preset: 'BENIGN' | 'FRAUD') => Promise<void>;
}

export const StoreContext = createContext<AppState | null>(null);

export function useStore(): AppState {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
