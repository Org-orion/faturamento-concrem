/**
 * PAINEL TV — Rota: /painel-tv
 * Para remover: delete este arquivo e remova a rota em App.tsx
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabaseOps, supabasePedidos } from '@/lib/supabase';

// ─── Mapeamento de status interno → label de exibição ───────────────────────
const STATUS_LABEL: Record<string, string> = {
  aguardando_avaliacao:  'AVALIAÇÃO',
  aguardando_mapeamento: 'MAPEAMENTO',
  mapeamento_andamento:  'MAPEAMENTO',
  mapeamento_concluido:  'MAPEAMENTO',
  aguardando_ferragem:   'FERRAGEM',
  ferragem_recebida:     'FERRAGEM',
  liberado_comercial:    'COMERCIAL',
  aguardando_gerencia:   'COMERCIAL',
  confirmado_gerencia:   'COMERCIAL',
  liberado_producao:     'LIBERADO PRODUÇÃO',
  em_producao:           'PRODUÇÃO',
  producao_finalizada:   'PRODUÇÃO',
  faturado:              'FATURADO',
  em_entrega:            'EM ROTA',
  parcialmente_entregue: 'EM ROTA',
  entregue:              'ENTREGUE',
  aguardando_pagamento:  'FINALIZADO',
  finalizado:            'FINALIZADO',
};

// ─── Cores por status ────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  'AVALIAÇÃO':          { bg: '#1c1917', color: '#a8a29e' },
  'MAPEAMENTO':         { bg: '#1e3a5f', color: '#60a5fa' },
  'FERRAGEM':           { bg: '#3b1b00', color: '#fb923c' },
  'COMERCIAL':          { bg: '#3b0764', color: '#c084fc' },
  'LIBERADO PRODUÇÃO':  { bg: '#1c3553', color: '#7dd3fc' },
  'PRODUÇÃO':           { bg: '#451a03', color: '#fbbf24' },
  'FATURADO':           { bg: '#162032', color: '#93c5fd' },
  'EM ROTA':            { bg: '#2e1065', color: '#a78bfa' },
  'ENTREGUE':           { bg: '#052e16', color: '#4ade80' },
  'FINALIZADO':         { bg: '#022c22', color: '#6ee7b7' },
};

const STEPS = [
  'AVALIAÇÃO', 'MAPEAMENTO', 'FERRAGEM', 'COMERCIAL',
  'LIBERADO PRODUÇÃO', 'PRODUÇÃO', 'FATURADO', 'EM ROTA', 'ENTREGUE', 'FINALIZADO',
];

const STEP_INDEX = Object.fromEntries(STEPS.map((s, i) => [s, i]));

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface PainelOrder {
  id: string;
  client: string;
  rep: string;
  value: number;
  statusRaw: string;
  statusLabel: string;
  updatedAt: string;
}

interface FeedEntry {
  key: string;
  time: Date;
  orderId: string;
  from: string | null;
  to: string;
  client: string;
  isNew: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtCurrency = (v: number) =>
  v ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-';

const fmtRelative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h atrás` : `${Math.floor(h / 24)}d atrás`;
};

const fmtTime = (d: Date) =>
  d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const erpTable = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';

// ─── Fetch de dados ───────────────────────────────────────────────────────────
async function loadPainelOrders(): Promise<PainelOrder[]> {
  if (!supabaseOps || !supabasePedidos) return [];

  const { data: statusRows, error } = await supabaseOps
    .from('concrem_pedidos_status')
    .select('pedido_id, status_atual, atualizado_em')
    .not('status_atual', 'eq', 'aguardando_avaliacao')
    .order('atualizado_em', { ascending: false })
    .limit(60);

  if (error || !statusRows?.length) return [];

  const ids = statusRows.map((r: any) => String(r.pedido_id));

  const { data: erpRows } = await supabasePedidos
    .from(erpTable)
    .select('numero_pedido, cliente_nome, representante, total_pedido_venda')
    .in('numero_pedido', ids);

  const erpMap = new Map((erpRows || []).map((r: any) => [String(r.numero_pedido), r]));

  return statusRows.map((s: any) => {
    const erp = erpMap.get(String(s.pedido_id));
    return {
      id: String(s.pedido_id),
      client: erp?.cliente_nome || '—',
      rep: erp?.representante || '—',
      value: erp?.total_pedido_venda || 0,
      statusRaw: s.status_atual,
      statusLabel: STATUS_LABEL[s.status_atual] || s.status_atual.toUpperCase(),
      updatedAt: s.atualizado_em,
    };
  });
}

// ─── Hook de polling + diff ───────────────────────────────────────────────────
function usePainel() {
  const [orders, setOrders] = useState<PainelOrder[]>([]);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [toast, setToast] = useState<FeedEntry | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const prevStatus = useRef<Record<string, string>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const feedKey = useRef(0);

  const poll = useCallback(async () => {
    const data = await loadPainelOrders();
    if (!data.length) return;

    const newEntries: FeedEntry[] = [];
    data.forEach((p) => {
      const prev = prevStatus.current[p.id];
      if (prev !== undefined && prev !== p.statusRaw) {
        newEntries.push({
          key: `${p.id}-${++feedKey.current}`,
          time: new Date(),
          orderId: p.id,
          from: STATUS_LABEL[prev] || prev,
          to: p.statusLabel,
          client: p.client,
          isNew: false,
        });
      } else if (prev === undefined) {
        newEntries.push({
          key: `${p.id}-${++feedKey.current}`,
          time: new Date(),
          orderId: p.id,
          from: null,
          to: p.statusLabel,
          client: p.client,
          isNew: true,
        });
      }
      prevStatus.current[p.id] = p.statusRaw;
    });

    if (newEntries.length) {
      setFeed((prev) => [...newEntries, ...prev].slice(0, 40));
      const change = newEntries.find((e) => !e.isNew);
      if (change) {
        setToast(change);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 5000);
      }
    }

    setOrders(data.slice(0, 12));
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 5000);
    return () => { clearInterval(interval); clearTimeout(toastTimer.current); };
  }, [poll]);

  return { orders, feed, toast, lastRefresh };
}

// ─── Componentes internos ─────────────────────────────────────────────────────

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.05em', color: '#e2e8f0', fontFamily: 'monospace', fontSize: 22 }}>
      {time.toLocaleTimeString('pt-BR')}
    </span>
  );
}

function StatusBadge({ label }: { label: string }) {
  const style = STATUS_STYLE[label] || { bg: '#1c1917', color: '#a8a29e' };
  return (
    <span style={{
      background: style.bg, color: style.color,
      padding: '3px 10px', borderRadius: 6, fontSize: 11,
      fontWeight: 700, letterSpacing: '0.08em', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function StepDots({ statusLabel }: { statusLabel: string }) {
  const current = STEP_INDEX[statusLabel] ?? -1;
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      {STEPS.map((s, i) => {
        const isCurrent = i === current;
        const isDone = i < current;
        return (
          <div key={s} title={s} style={{
            width: isCurrent ? 10 : 7,
            height: isCurrent ? 10 : 7,
            borderRadius: '50%',
            background: isCurrent ? '#fbbf24' : isDone ? '#22c55e' : '#374151',
            boxShadow: isCurrent ? '0 0 6px #fbbf24' : undefined,
            transition: 'all 0.3s',
            flexShrink: 0,
          }} />
        );
      })}
    </div>
  );
}

function OrderCard({ order }: { order: PainelOrder }) {
  const s = STATUS_STYLE[order.statusLabel] || { bg: '#1c1917', color: '#a8a29e' };
  return (
    <div style={{
      background: '#161b27',
      border: `1px solid ${s.color}22`,
      borderLeft: `3px solid ${s.color}`,
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#f1f5f9', fontFamily: 'monospace' }}>
            #{order.id}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {order.client}
          </div>
        </div>
        <StatusBadge label={order.statusLabel} />
      </div>

      <StepDots statusLabel={order.statusLabel} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>{order.rep.replace(/^\d+\s*[-–]\s*/, '').trim() || '—'}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace' }}>
          {fmtCurrency(order.value)}
        </span>
      </div>

      <div style={{ fontSize: 10, color: '#475569' }}>{fmtRelative(order.updatedAt)}</div>
    </div>
  );
}

function StatsBar({ orders }: { orders: PainelOrder[] }) {
  const counts: Record<string, number> = {};
  orders.forEach((o) => { counts[o.statusLabel] = (counts[o.statusLabel] || 0) + 1; });
  const groups = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {groups.map(([label, count]) => {
        const s = STATUS_STYLE[label] || { bg: '#1c1917', color: '#a8a29e' };
        return (
          <div key={label} style={{ background: s.bg, border: `1px solid ${s.color}33`, borderRadius: 8, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: s.color, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>{label}</span>
            <span style={{ background: s.color, color: '#000', borderRadius: 999, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function FeedPanel({ feed }: { feed: FeedEntry[] }) {
  return (
    <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: '0.12em', marginBottom: 10, textTransform: 'uppercase' }}>
        Atualizações Recentes
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {feed.length === 0 && (
          <div style={{ color: '#334155', fontSize: 12, textAlign: 'center', marginTop: 20 }}>Aguardando mudanças…</div>
        )}
        {feed.map((entry) => {
          const toStyle = STATUS_STYLE[entry.to] || { bg: '#1c1917', color: '#a8a29e' };
          return (
            <div key={entry.key} style={{ background: '#161b27', borderRadius: 8, padding: '8px 10px', borderLeft: `3px solid ${entry.isNew ? '#475569' : toStyle.color}` }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>{fmtTime(entry.time)}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace' }}>#{entry.orderId}</div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.client}</div>
              {entry.isNew ? (
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>Entrou no painel</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, color: '#64748b' }}>{entry.from}</span>
                  <span style={{ color: '#475569', fontSize: 10 }}>→</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: toStyle.color }}>{entry.to}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToastOverlay({ entry }: { entry: FeedEntry }) {
  const toStyle = STATUS_STYLE[entry.to] || { bg: '#1c1917', color: '#a8a29e' };
  return (
    <div style={{
      position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
      background: '#1e2535', border: `1px solid ${toStyle.color}55`,
      borderRadius: 12, padding: '14px 24px', zIndex: 1000,
      boxShadow: `0 0 30px ${toStyle.color}33`,
      display: 'flex', alignItems: 'center', gap: 14, minWidth: 340,
      animation: 'slideUp 0.3s ease',
    }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: toStyle.color, boxShadow: `0 0 8px ${toStyle.color}` }} />
      <div>
        <div style={{ fontSize: 11, color: '#64748b' }}>Mudança de status</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>
          #{entry.orderId} — {entry.client.slice(0, 30)}
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
          <span style={{ color: '#64748b' }}>{entry.from}</span>
          <span style={{ margin: '0 6px', color: '#475569' }}>→</span>
          <span style={{ fontWeight: 700, color: toStyle.color }}>{entry.to}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
const PainelTV: React.FC = () => {
  const { orders, feed, toast, lastRefresh } = usePainel();

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
      `}</style>

      <div style={{
        background: '#0f1117', minHeight: '100vh', color: '#f1f5f9',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', height: '100vh',
      }}>
        {/* Header */}
        <div style={{
          background: '#111827', borderBottom: '1px solid #1e293b',
          padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '0.05em', color: '#f1f5f9' }}>
              CONCREM
            </div>
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
              Painel de Pedidos
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, letterSpacing: '0.12em' }}>AO VIVO</span>
            </div>
            <Clock />
            <div style={{ fontSize: 11, color: '#475569' }}>
              Atualizado {fmtTime(lastRefresh)}
            </div>
          </div>
        </div>

        {/* Stats Bar */}
        <div style={{ background: '#0d1117', borderBottom: '1px solid #1e293b', padding: '8px 24px', flexShrink: 0 }}>
          <StatsBar orders={orders} />
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', gap: 0, overflow: 'hidden' }}>
          {/* Cards Grid */}
          <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
            {orders.length === 0 ? (
              <div style={{ color: '#334155', textAlign: 'center', marginTop: 60, fontSize: 16 }}>
                Carregando pedidos…
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 12,
              }}>
                {orders.map((o) => <OrderCard key={o.id} order={o} />)}
              </div>
            )}
          </div>

          {/* Feed lateral */}
          <div style={{
            width: 300, background: '#0d1117', borderLeft: '1px solid #1e293b',
            padding: '16px 14px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
          }}>
            <FeedPanel feed={feed} />
          </div>
        </div>

        {/* Toast */}
        {toast && <ToastOverlay entry={toast} />}
      </div>
    </>
  );
};

export default PainelTV;
