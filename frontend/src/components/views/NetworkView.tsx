import { useState, useRef, useCallback, useEffect } from 'react';
import { Network, X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useStore } from '@/store/context';
import { createApi } from '@/services/api';
import { Panel, EmptyState, KeyVal, Badge } from '@/components/ui/Primitives';
import type { Entity, EntityType, Relationship, RelationshipType, NetworkGraph } from '@/types';
import { GuidedNavigation } from '@/components/layout/GuidedNavigation';
import type { ViewKey } from '@/components/layout/Sidebar';

const ENTITY_STYLE: Record<EntityType, { color: string; fill: string; ring: string; shape: string }> = {
  ACCOUNT: { color: '#2563eb', fill: 'rgba(37,99,235,0.12)', ring: '#2563eb', shape: 'circle' },
  DEVICE: { color: '#0891b2', fill: 'rgba(8,145,178,0.12)', ring: '#0891b2', shape: 'rect' },
  IP: { color: '#7c3aed', fill: 'rgba(124,58,237,0.12)', ring: '#7c3aed', shape: 'diamond' },
  MERCHANT: { color: '#059669', fill: 'rgba(5,150,105,0.12)', ring: '#059669', shape: 'rect' },
};

const REL_COLOR: Record<RelationshipType, string> = {
  TRANSACTION: '#2563eb',
  SHARED_DEVICE: '#0891b2',
  SHARED_IP: '#7c3aed',
  SHARED_MERCHANT: '#059669',
};

export function NetworkView({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const { investigation, networkGraph } = useStore();
  const graph: NetworkGraph = networkGraph ?? { entities: [], relationships: [] };
  const [selected, setSelected] = useState<Entity | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const [gnnClusterView, setGnnClusterView] = useState(false);
  const [neo4jExtendedGraph, setNeo4jExtendedGraph] = useState<NetworkGraph | null>(null);
  const [nodeHistory, setNodeHistory] = useState<{
    hasHistory: boolean;
    totalRings: number;
    isRepeatOffender: boolean;
    pastRings: Array<{ ringId: string; patternType: string; confidence: number; amountInvolved: number; coConspirators: string[] }>;
    coConspirators: string[];
  } | null>(null);

  const isRingCase = Boolean(
    investigation?.ring?.detected ||
    (investigation?.ring?.members && investigation.ring.members.length > 0) ||
    investigation?.ring?.ringId
  );

  useEffect(() => {
    setSelected(null);
    setNodeHistory(null);
    setNeo4jExtendedGraph(null);
  }, [investigation?.investigationId, networkGraph]);

  useEffect(() => {
    if (!graph.entities.length) {
      setNeo4jExtendedGraph(null);
      return;
    }

    const accountEntities = graph.entities.filter((e) => e.type === 'ACCOUNT');
    if (!accountEntities.length) return;

    const api = createApi('LIVE');
    let isCancelled = false;

    Promise.all(
      accountEntities.map((ent) => {
        const cleanId = ent.label.replace(/^Account\s*/i, '').replace(/^ACCOUNT:\s*/i, '').trim() || ent.id.replace(/^acc-/, '').trim();
        return api.getNodeRingHistory(cleanId).then((res) => ({ ent, cleanId, res })).catch(() => null);
      })
    ).then((results) => {
      if (isCancelled) return;

      const extraEntities: Entity[] = [];
      const extraRelationships: Relationship[] = [];

      const existingEntityIds = new Set<string>();
      graph.entities.forEach((e) => {
        existingEntityIds.add(e.id);
        existingEntityIds.add(e.label);
        const c = e.label.replace(/^Account\s*/i, '').replace(/^ACCOUNT:\s*/i, '').trim() || e.id.replace(/^acc-/, '').trim();
        existingEntityIds.add(c);
        existingEntityIds.add(`acc-${c}`);
        existingEntityIds.add(`Account ${c}`);
      });

      const existingRelKeys = new Set(
        graph.relationships.map((r) => `${r.source}->${r.target}`)
      );

      results.forEach((item) => {
        if (!item || !item.res || !item.res.hasHistory) return;
        const { ent, res } = item;
        const coConspirators = res.coConspirators || [];

        coConspirators.forEach((coId: string, idx: number) => {
          const hasNode =
            existingEntityIds.has(coId) ||
            existingEntityIds.has(`acc-${coId}`) ||
            existingEntityIds.has(`Account ${coId}`);

          const newId = ent.id.startsWith('acc-') ? `acc-${coId}` : coId;
          const newLabel = ent.label.startsWith('Account') ? `Account ${coId}` : coId;

          if (!hasNode) {
            existingEntityIds.add(coId);
            existingEntityIds.add(`acc-${coId}`);
            existingEntityIds.add(`Account ${coId}`);

            const angle = (idx / Math.max(1, coConspirators.length)) * 2 * Math.PI + Math.PI / 4;
            const radius = 130;
            const nx = (ent.x ?? 300) + radius * Math.cos(angle);
            const ny = (ent.y ?? 200) + radius * Math.sin(angle);

            extraEntities.push({
              id: newId,
              type: 'ACCOUNT',
              label: newLabel,
              risk: res.isRepeatOffender ? 'CRITICAL' : 'HIGH',
              x: Math.round(Math.max(50, Math.min(750, nx))),
              y: Math.round(Math.max(50, Math.min(500, ny))),
              transactions: res.totalRings,
              connectedAccounts: coConspirators.length,
              sharedDevices: 0,
              sharedIps: 0,
              suspicious: true,
              metadata: {
                'Neo4j Memory': 'Flagged Ring Offender',
                'Repeat Offender': res.isRepeatOffender ? 'YES' : 'NO',
                'Total Past Rings': String(res.totalRings),
              },
            });
          }

          const relKey1 = `${ent.id}->${newId}`;
          const relKey2 = `${newId}->${ent.id}`;
          if (!existingRelKeys.has(relKey1) && !existingRelKeys.has(relKey2)) {
            existingRelKeys.add(relKey1);
            extraRelationships.push({
              id: `neo4j-rel-${ent.id}-${newId}`,
              source: ent.id,
              target: newId,
              type: 'TRANSACTION',
              weight: 2,
              suspicious: true,
            });
          }
        });
      });

      if (extraEntities.length > 0 || extraRelationships.length > 0) {
        setNeo4jExtendedGraph({
          entities: [...graph.entities, ...extraEntities],
          relationships: [...graph.relationships, ...extraRelationships],
        });
      } else {
        setNeo4jExtendedGraph(null);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [investigation?.investigationId, graph]);

  const activeGraph: NetworkGraph = neo4jExtendedGraph ?? graph;

  useEffect(() => {
    if (!selected || selected.type !== 'ACCOUNT') {
      setNodeHistory(null);
      return;
    }
    const cleanId = selected.label.replace(/^Account\s*/i, '').replace(/^ACCOUNT:\s*/i, '').trim() || selected.id.replace(/^acc-/, '').trim();
    const api = createApi('LIVE');
    api.getNodeRingHistory(cleanId)
      .then((h) => setNodeHistory(h))
      .catch(() => setNodeHistory(null));
  }, [selected]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.5, Math.min(2.5, z + (e.deltaY > 0 ? -0.1 : 0.1))));
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    setPan((p) => ({ x: p.x + (e.clientX - last.current.x), y: p.y + (e.clientY - last.current.y) }));
    last.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Network className="h-5 w-5 text-signal-600" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Entity Network</h2>
            <p className="text-xs text-slate-600">Interactive graph of accounts, devices, IPs, and merchants.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {neo4jExtendedGraph && (
            <Badge level="HIGH">
              Neo4j History Cluster (+{neo4jExtendedGraph.entities.length - graph.entities.length} nodes)
            </Badge>
          )}
          {investigation && (
            <Badge level={investigation.ring?.detected ? 'HIGH' : 'LOW'}>
              {investigation.ring?.detected ? 'Ring cluster highlighted' : 'Live graph'}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        {/* Graph canvas */}
        <div className="lg:col-span-3">
          <Panel
            title="Network Graph"
            actions={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setGnnClusterView((v) => !v)}
                  className={`rounded border px-2 py-1 text-2xs font-semibold uppercase tracking-wider transition-colors ${
                    gnnClusterView
                      ? 'border-purple-300 bg-purple-50 text-purple-700'
                      : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {gnnClusterView ? 'GNN Attention ON' : 'GNN Attention OFF'}
                </button>
                <div className="flex items-center gap-1">
                  <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><ZoomOut className="h-4 w-4" /></button>
                  <span className="font-mono text-2xs font-semibold text-slate-600">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><ZoomIn className="h-4 w-4" /></button>
                  <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><Maximize2 className="h-4 w-4" /></button>
                </div>
              </div>
            }
          >
            {activeGraph.entities.length === 0 ? <EmptyState icon={<Network className="h-7 w-7" />} title="No graph available" description="Inject a transaction to load the live entity graph." /> : <div
              className="relative h-[560px] cursor-grab overflow-hidden rounded-md border border-ink-800 bg-grid-fine bg-white active:cursor-grabbing"
              onWheel={onWheel}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              <svg className="absolute inset-0 h-full w-full" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center' }}>
                {/* Edges */}
                {activeGraph.relationships.map((rel) => {
                  const s = activeGraph.entities.find((e) => e.id === rel.source);
                  const t = activeGraph.entities.find((e) => e.id === rel.target);
                  if (!s || !t) return null;
                  const color = gnnClusterView ? (rel.suspicious ? '#9333ea' : '#16a34a') : REL_COLOR[rel.type];
                  const width = gnnClusterView ? (rel.suspicious ? 3.5 : 1.5) : (rel.suspicious ? 2 : 1);
                  return (
                    <g key={rel.id}>
                      <line
                        x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                        stroke={color} strokeWidth={width}
                        strokeOpacity={rel.suspicious ? 0.85 : 0.4}
                        strokeDasharray={rel.suspicious ? '0' : '4 4'}
                      />
                      {rel.suspicious && (
                        <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={color} strokeWidth="1.5" strokeOpacity="0.6" className="animate-dash" strokeDasharray="4 6" />
                      )}
                    </g>
                  );
                })}
                {/* Nodes */}
                {activeGraph.entities.map((ent) => {
                  const style = ENTITY_STYLE[ent.type];
                  const isSel = selected?.id === ent.id;
                  const r = ent.suspicious ? 16 : 12;
                  const ringColor = gnnClusterView ? (ent.suspicious ? '#9333ea' : '#16a34a') : (isSel ? '#2563eb' : style.ring);
                  return (
                    <g key={ent.id} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); setSelected(ent); }}>
                      {ent.type === 'ACCOUNT' && (
                        <circle cx={ent.x} cy={ent.y} r={r} fill={style.fill} stroke={ringColor} strokeWidth={isSel ? 3 : 2} />
                      )}
                      {ent.type === 'DEVICE' && (
                        <rect x={ent.x - r} y={ent.y - r * 0.75} width={r * 2} height={r * 1.5} rx={3} fill={style.fill} stroke={ringColor} strokeWidth={isSel ? 3 : 2} />
                      )}
                      {ent.type === 'IP' && (
                        <rect x={ent.x - r} y={ent.y - r * 0.75} width={r * 2} height={r * 1.5} rx={3} fill={style.fill} stroke={ringColor} strokeWidth={isSel ? 3 : 2} transform={`rotate(45 ${ent.x} ${ent.y})`} />
                      )}
                      {ent.type === 'MERCHANT' && (
                        <rect x={ent.x - r} y={ent.y - r * 0.75} width={r * 2} height={r * 1.5} rx={3} fill={style.fill} stroke={ringColor} strokeWidth={isSel ? 3 : 2} />
                      )}
                      {ent.suspicious && <circle cx={ent.x} cy={ent.y} r={r + 5} fill="none" stroke={gnnClusterView ? '#9333ea' : '#dc2626'} strokeWidth="1.5" strokeOpacity="0.6" className="animate-pulse-soft" />}
                      <text x={ent.x} y={ent.y + r + 14} textAnchor="middle" fill={isSel ? '#2563eb' : '#0f172a'} fontSize="10" fontWeight="600" fontFamily="monospace" className="pointer-events-none select-none">{ent.label}</text>
                    </g>
                  );
                })}
              </svg>

              {/* Legend */}
              <div className="absolute bottom-3 left-3 rounded-md border border-ink-800 bg-white/95 p-3 shadow-md backdrop-blur-sm">
                <div className="mb-2 text-2xs font-semibold uppercase tracking-widest text-slate-600">Legend</div>
                <div className="space-y-1.5">
                  {(Object.keys(ENTITY_STYLE) as EntityType[]).map((t) => (
                    <div key={t} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: ENTITY_STYLE[t].color }} />
                      <span className="text-2xs font-medium text-slate-700">{t}</span>
                    </div>
                  ))}
                  <div className="my-1 h-px bg-ink-800" />
                  <div className="flex items-center gap-2"><span className="h-0.5 w-4 bg-red-600" /><span className="text-2xs font-medium text-slate-700">Suspicious link</span></div>
                  <div className="flex items-center gap-2"><span className="h-0.5 w-4 bg-slate-400" style={{ borderTop: '1px dashed' }} /><span className="text-2xs font-medium text-slate-700">Normal link</span></div>
                </div>
              </div>

              <div className="absolute right-3 top-3 rounded-md border border-ink-800 bg-white/95 px-2.5 py-1.5 text-2xs font-medium text-slate-700 shadow-sm backdrop-blur-sm">
                {activeGraph.entities.length} entities · {activeGraph.relationships.length} links
              </div>
            </div>}
          </Panel>
        </div>

        {/* Inspector */}
        <div>
          <Panel title="Entity Inspector">
            {selected ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-2xs font-semibold uppercase tracking-widest text-slate-600">{selected.type}</div>
                    <div className="mt-1 font-mono text-sm font-semibold text-slate-900">{selected.label}</div>
                  </div>
                  <button onClick={() => setSelected(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><X className="h-3.5 w-3.5" /></button>
                </div>
                <Badge level={selected.risk}>Risk: {selected.risk}</Badge>
                {selected.suspicious && <div className="rounded border border-risk-500/20 bg-risk-500/10 px-2 py-1 text-2xs font-semibold text-risk-700">Flagged suspicious</div>}
                {nodeHistory && nodeHistory.hasHistory && (
                  <div className="rounded-md border border-risk-500/40 bg-risk-500/10 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-2xs font-bold uppercase tracking-widest text-risk-600">Neo4j Graph History</span>
                      {nodeHistory.isRepeatOffender && (
                        <span className="rounded bg-risk-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-risk-700">
                          REPEAT OFFENDER
                        </span>
                      )}
                    </div>
                    <div className="text-2xs text-slate-800">
                      Identified in <span className="font-bold text-risk-600">{nodeHistory.totalRings}</span> past ring(s) in Neo4j database.
                    </div>
                    {nodeHistory.coConspirators.length > 0 && (
                      <div className="text-2xs text-slate-600">
                        Co-conspirators: <span className="font-mono font-semibold text-slate-900">{nodeHistory.coConspirators.join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}
                <dl className="space-y-1 rounded-md border border-ink-700 bg-ink-900 p-3">
                  <KeyVal label="Transactions" value={selected.transactions ?? 'UNKNOWN'} />
                  <KeyVal label="Connected accounts" value={selected.connectedAccounts ?? 'UNKNOWN'} />
                  <KeyVal label="Shared devices" value={selected.sharedDevices ?? 'UNKNOWN'} />
                  <KeyVal label="Shared IPs" value={selected.sharedIps ?? 'UNKNOWN'} />
                </dl>
                {selected.metadata && (
                  <div>
                    <div className="mb-1.5 text-2xs font-semibold uppercase tracking-widest text-ink-600">Metadata</div>
                    <dl className="space-y-1 rounded-md border border-ink-700 bg-ink-850 p-3">
                      {Object.entries(selected.metadata).map(([k, v]) => <KeyVal key={k} label={k} value={v} />)}
                    </dl>
                  </div>
                )}
                {/* Connections */}
                <div>
                  <div className="mb-1.5 text-2xs font-semibold uppercase tracking-widest text-ink-600">Connections</div>
                  <ul className="space-y-1">
                    {activeGraph.relationships.filter((r) => r.source === selected.id || r.target === selected.id).map((r) => {
                      const other = activeGraph.entities.find((e) => e.id === (r.source === selected.id ? r.target : r.source));
                      return (
                        <li key={r.id} className="flex items-center justify-between rounded border border-ink-700 bg-ink-850 px-2 py-1.5 text-2xs">
                          <span className="font-mono text-ink-400">{other?.label}</span>
                          <span className="text-ink-600">{r.type.replace('_', ' ').toLowerCase()}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            ) : (
              <EmptyState icon={<Network className="h-7 w-7" />} title="No entity selected" description="Click a node in the graph to inspect its details and connections." />
            )}
          </Panel>
        </div>
      </div>
      <GuidedNavigation current="network" onNavigate={onNavigate} />
    </div>
  );
}
