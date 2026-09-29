import { useState, useMemo, type ReactNode } from 'react';
import { ScrollText, Download, FileText, Shield, AlertTriangle, Siren, CheckCircle2 } from 'lucide-react';
import { useStore } from '@/store/context';
import { Panel, EmptyState, KeyVal, Divider, Badge } from '@/components/ui/Primitives';
import { formatAmount, formatPercentage } from '@/lib/format';
import type { ViewKey } from '@/components/layout/Sidebar';
import { GuidedNavigation } from '@/components/layout/GuidedNavigation';
import { createApi } from '@/services/api';

export function ForensicReport({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const { investigation, mode, report: liveReport } = useStore();

  const report = useMemo(() => {
    if (!investigation) return null;
    return liveReport;
  }, [investigation, liveReport]);

  const reportMatchesInvestigation = Boolean(
    report
    && report.investigationId === investigation?.investigationId
    && report.eventId === investigation?.eventId
    && report.traceId === investigation?.traceId
  );
  const mlOutput = investigation?.trace.stages.find((stage) => stage.key === 'ml_intelligence')?.output as Record<string, unknown> | undefined;

  if (investigation && !reportMatchesInvestigation) {
    return <div className="mx-auto max-w-4xl p-6 text-sm font-medium text-slate-600">Report loading...</div>;
  }

  if (!investigation || !report) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center gap-3">
          <ScrollText className="h-5 w-5 text-signal-600" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Forensic Report</h2>
            <p className="text-xs text-slate-600">Professional investigation summary for analyst handoff.</p>
          </div>
        </div>
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No investigation to report"
          description="Run an investigation first to generate a forensic report."
          action={<button onClick={() => onNavigate('payload')} className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-blue-700 hover:bg-blue-100">Go to Payload Lab</button>}
        />
      </div>
    );
  }

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfToast, setPdfToast] = useState<string | null>(null);

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RINGBREAK-report-${report.investigationId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = async () => {
    const reportData = report ?? investigation;
    if (!reportData) return;
    setDownloadingPdf(true);
    setPdfToast(null);
    try {
      const api = createApi(mode);
      const pdfBlob = await api.exportProtectedPdf(reportData as unknown as Record<string, unknown>);
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RINGBREAK-Protected-Report-${reportData.investigationId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setPdfToast('Protected PDF generated successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to generate password-protected PDF report.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const modelPrediction = String(
    mlOutput?.classification ?? mlOutput?.prediction ?? mlOutput?.status ?? (report.risk.level === 'CRITICAL' || report.risk.level === 'HIGH' ? 'FRAUD_SUSPECT' : 'BENIGN')
  );

  const fraudProbabilityVal = report.risk.fraudProbability ?? (typeof mlOutput?.fraudProbability === 'number' ? mlOutput.fraudProbability : report.risk.score / 100);
  const confidenceVal = report.risk.confidence ?? 85;
  const evidenceStrengthVal = report.risk.evidenceStrength ?? (confidenceVal / 100);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ScrollText className="h-5 w-5 text-signal-600" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Forensic Report</h2>
            <p className="text-xs text-slate-600">{report.investigationId} · Generated {new Date(report.generatedAt).toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-slate-700 transition-colors hover:bg-slate-200"
          >
            <Download className="h-3.5 w-3.5" /> JSON
          </button>
          <button
            type="button"
            disabled={downloadingPdf}
            onClick={() => void handleExportPdf()}
            className="inline-flex items-center gap-2 rounded-md border border-blue-700 bg-blue-700 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-blue-800 disabled:opacity-50 shadow-sm"
          >
            {downloadingPdf ? <FileText className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloadingPdf ? 'Encrypting PDF...' : 'Download Protected PDF'}
          </button>
        </div>
      </div>

      {pdfToast && (
        <div className="flex items-center justify-between rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800 shadow-xs font-medium">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-600" />
            <span>{pdfToast}</span>
          </div>
          <button type="button" onClick={() => setPdfToast(null)} className="text-emerald-700 hover:text-emerald-900 font-bold">Dismiss</button>
        </div>
      )}

      {/* Report header */}
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-base font-bold text-slate-900">RING//BREAK FORENSIC REPORT</h3>
            </div>
            <div className="mt-1 text-2xs font-semibold uppercase tracking-widest text-slate-500">Financial Fraud-Ring Investigation</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>INV: {report.investigationId}</Badge>
            <Badge>EVT: {report.eventId}</Badge>
            <Badge>TRC: {report.traceId}</Badge>
          </div>
        </div>
      </Panel>

      {/* Transaction summary */}
      <Panel title="1. Transaction Summary">
        <div className="rounded-md border border-ink-800 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-900">{report.transactionSummary}</p>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          <KeyVal label="Sender" value={report.payload.senderAccount} />
          <KeyVal label="Receiver" value={report.payload.receiverAccount} />
          <KeyVal label="Amount" value={formatAmount(report.payload.amount, report.payload.currency)} />
          <KeyVal label="Type" value={report.payload.transactionType} />
          <KeyVal label="Device" value={report.payload.deviceId} />
          <KeyVal label="IP" value={report.payload.ipAddress} />
          <KeyVal label="Location" value={report.payload.location} />
          <KeyVal label="Merchant" value={report.payload.merchantId} />
          <KeyVal label="Timestamp" value={report.payload.timestamp} />
        </dl>
      </Panel>

      {/* Risk Assessment metrics */}
      <Panel title="2. Risk Assessment" actions={<Badge level={report.risk.level}>{report.risk.level} · {report.risk.score}/100</Badge>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Risk Score" value={`${report.risk.score}/100`} />
          <Metric label="Model Prediction" value={modelPrediction} />
          <Metric label="Fraud Probability" value={formatPercentage(fraudProbabilityVal)} />
          <Metric label="Confidence" value={`${confidenceVal}%`} />
          <Metric label="Evidence Strength" value={formatPercentage(evidenceStrengthVal)} />
        </div>
        <Divider label="Risk Factors" />
        <ul className="space-y-2">
          {report.risk.factors.map((f) => (
            <li key={f.key} className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">{f.label}</span>
              <div className="flex items-center gap-3">
                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full" style={{ width: `${f.score}%`, background: f.score > 75 ? '#dc2626' : f.score > 50 ? '#d97706' : '#059669' }} />
                </div>
                <span className="font-mono font-bold tabular-nums text-slate-900 w-8 text-right">{f.score}</span>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {/* ML & Network findings */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="3. ML Findings">
          <p className="text-xs leading-relaxed text-slate-700">{report.mlFindings}</p>
        </Panel>
        <Panel title="4. Network Findings">
          <NetworkFindings value={report.networkFindings} />
        </Panel>
      </div>

      {/* Ring candidate */}
      <Panel title="5. Ring Candidate" actions={report.ring?.detected ? <Badge level="CRITICAL">DETECTED</Badge> : <Badge level="LOW">NONE</Badge>}>
        {report.ring?.detected ? (
          <div className="space-y-2">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
              <KeyVal label="Ring ID" value={report.ring.ringId} />
              <KeyVal label="Confidence" value={`${report.ring.confidence}%`} />
              <KeyVal label="Members" value={report.ring.memberCount} />
              <KeyVal label="Amount" value={formatAmount(report.ring.amountInvolved, report.ring.currency)} />
            </dl>
            <Divider label="Signals" />
            <ul className="space-y-1">
              {report.ring.signals.filter((s) => s.present).map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                  <span className="font-semibold text-slate-900">{s.label}</span>
                  <span className="text-slate-600">— {s.description}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-slate-600">No ring candidate was returned by graph analysis. This relationship finding does not establish that the transaction is non-fraudulent.</p>
        )}
      </Panel>

      {/* Agent findings */}
      <Panel title="6. Investigator Agent Findings">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {report.agents.map((a) => (
            <div key={a.agentKey} className="rounded-md border border-ink-800 bg-white p-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-2xs font-bold uppercase tracking-wider text-slate-700">{a.name}</span>
                <span className="font-mono text-2xs font-bold text-emerald-700">{a.confidence == null ? 'Unavailable' : `${a.confidence}%`}</span>
              </div>
              <p className="mt-2 text-2xs text-slate-700">{a.conclusion}</p>
              <div className="mt-2 text-2xs font-medium text-slate-500">{a.evidenceCount} evidence items</div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Evidence timeline */}
      <Panel title="7. Evidence Timeline">
        {report.evidenceTimeline.length > 0 ? (
          <ol className="space-y-1.5">
            {report.evidenceTimeline.map((e, i) => (
              <li key={e.id} className="flex gap-3 rounded-md border border-ink-800 bg-slate-50 p-2.5">
                <span className="font-mono text-2xs font-bold text-slate-500">{String(i + 1).padStart(2, '0')}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{e.label}</span>
                    <span className="font-mono text-2xs font-bold text-amber-700">{e.strength}/100</span>
                  </div>
                  <p className="mt-0.5 text-2xs text-slate-600">{e.description}</p>
                  <div className="mt-0.5 text-2xs font-medium text-slate-500">{e.source} · {e.timestamp}</div>
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="text-xs text-slate-600">No evidence items.</p>}
      </Panel>

      {/* Recommended response */}
      <Panel title="8. Recommended Response" actions={<span className="inline-flex items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-amber-800"><Siren className="h-3 w-3" /> Simulation</span>}>
        {report.response ? (
          <div className="space-y-2">
            <div className="rounded-md border border-ink-800 bg-white p-3 shadow-xs">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-bold text-slate-900">{report.response.recommendedAction}</span>
              </div>
              <p className="mt-2 text-xs text-slate-700">{report.reason}</p>
            </div>
            <Divider label="Triggering Evidence" />
            <ul className="space-y-1">
              {report.response.triggeringEvidence.map((e, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-slate-700">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {e}
                </li>
              ))}
            </ul>
          </div>
        ) : <p className="text-xs text-slate-600">No countermeasure recommended.</p>}
      </Panel>

      {/* Conclusion */}
      <Panel title="9. Conclusion">
        <div className="rounded-md border border-ink-800 bg-slate-50 p-4">
          <p className="text-sm leading-relaxed text-slate-900 font-medium">{report.conclusion}</p>
        </div>
      </Panel>

      <div className="pb-4 text-center text-2xs font-medium text-slate-500">RING//BREAK · Forensic Intelligence Platform · Report generated in {mode} mode</div>
      <GuidedNavigation current="forensic" onNavigate={onNavigate} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink-800 bg-white p-3 shadow-xs">
      <div className="text-2xs font-bold uppercase tracking-widest text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-base font-bold text-slate-900">{value}</div>
    </div>
  );
}

function NetworkFindings({ value }: { value: unknown }) {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object') return <NetworkValue value={parsed} />;
    } catch {
      // Preserve already-readable report text.
    }
    return <p className="text-xs leading-relaxed text-slate-700">{value}</p>;
  }

  if (value == null) return <p className="text-xs text-slate-600">No network findings reported.</p>;
  return <NetworkValue value={value} />;
}

function NetworkValue({ value }: { value: unknown }): ReactNode {
  if (value == null) return <span className="text-slate-500">—</span>;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <span className="text-slate-900 font-medium">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-500">none</span>;
    return (
      <ul className="space-y-2">
        {value.map((item, index) => (
          <li key={index} className="rounded-md border border-ink-800 bg-slate-50 p-2.5 text-xs text-slate-800">
            <NetworkValue value={item} />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-slate-500">{safeJson(value)}</span>;
    return (
      <dl className="space-y-1.5">
        {entries.map(([key, item]) => (
          <div key={key} className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-3">
            <dt className="text-2xs font-bold uppercase tracking-wider text-slate-500">{humanizeKey(key)}</dt>
            <dd className="min-w-0 break-words text-xs text-slate-800"><NetworkValue value={item} /></dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span>{safeJson(value)}</span>;
}

function humanizeKey(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toUpperCase();
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return 'Unserializable value';
  }
}
