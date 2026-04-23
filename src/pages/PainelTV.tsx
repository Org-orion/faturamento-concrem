/**
 * PAINEL TV — Rota: /painel-tv
 * Para remover: delete este arquivo e remova as 2 linhas marcadas em App.tsx
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// ─── Mapeamento de status interno → label ────────────────────────────────────
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
  liberado_producao:     'LIB. PRODUÇÃO',
  em_producao:           'PRODUÇÃO',
  producao_finalizada:   'PRODUÇÃO',
  faturado:              'FATURADO',
  em_entrega:            'EM ROTA',
  parcialmente_entregue: 'EM ROTA',
  entregue:              'ENTREGUE',
  aguardando_pagamento:  'FINALIZADO',
  finalizado:            'FINALIZADO',
};

// Cores dos badges — baseadas nas cores de status do app
const STATUS_CLS: Record<string, string> = {
  'AVALIAÇÃO':     'bg-muted text-muted-foreground',
  'MAPEAMENTO':    'bg-blue-950 text-blue-300 border border-blue-800/40',
  'FERRAGEM':      'bg-orange-950 text-orange-300 border border-orange-800/40',
  'COMERCIAL':     'bg-purple-950 text-purple-300 border border-purple-800/40',
  'LIB. PRODUÇÃO': 'bg-sky-950 text-sky-300 border border-sky-800/40',
  'PRODUÇÃO':      'bg-amber-950 text-amber-300 border border-amber-800/40',
  'FATURADO':      'bg-blue-950 text-blue-200 border border-blue-700/40',
  'EM ROTA':       'bg-violet-950 text-violet-300 border border-violet-800/40',
  'ENTREGUE':      'bg-green-950 text-green-300 border border-green-800/40',
  'FINALIZADO':    'bg-emerald-950 text-emerald-300 border border-emerald-800/40',
};

// Cor da borda esquerda dos cards
const STATUS_BORDER: Record<string, string> = {
  'AVALIAÇÃO':     '#6b7280',
  'MAPEAMENTO':    '#3b82f6',
  'FERRAGEM':      '#f97316',
  'COMERCIAL':     '#a855f7',
  'LIB. PRODUÇÃO': '#38bdf8',
  'PRODUÇÃO':      '#fbbf24',
  'FATURADO':      '#60a5fa',
  'EM ROTA':       '#8b5cf6',
  'ENTREGUE':      '#4ade80',
  'FINALIZADO':    '#34d399',
};

const STEPS = [
  'AVALIAÇÃO', 'MAPEAMENTO', 'FERRAGEM', 'COMERCIAL',
  'LIB. PRODUÇÃO', 'PRODUÇÃO', 'FATURADO', 'EM ROTA', 'ENTREGUE', 'FINALIZADO',
];
const STEP_INDEX = Object.fromEntries(STEPS.map((s, i) => [s, i]));

// ─── Tipos ────────────────────────────────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── Fetch ────────────────────────────────────────────────────────────────────
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

// ─── Hook polling + diff ──────────────────────────────────────────────────────
function usePainel() {
  const [orders, setOrders]         = useState<PainelOrder[]>([]);
  const [feed, setFeed]             = useState<FeedEntry[]>([]);
  const [popup, setPopup]           = useState<FeedEntry | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const prevStatus = useRef<Record<string, string>>({});
  const popupTimer = useRef<ReturnType<typeof setTimeout>>();
  const feedKey    = useRef(0);

  const poll = useCallback(async () => {
    const data = await loadPainelOrders();
    if (!data.length) return;

    const newEntries: FeedEntry[] = [];
    data.forEach((p) => {
      const prev = prevStatus.current[p.id];
      if (prev !== undefined && prev !== p.statusRaw) {
        newEntries.push({
          key:     `${p.id}-${++feedKey.current}`,
          time:    new Date(),
          orderId: p.id,
          from:    STATUS_LABEL[prev] || prev,
          to:      p.statusLabel,
          client:  p.client,
          isNew:   false,
        });
      } else if (prev === undefined) {
        newEntries.push({
          key:     `${p.id}-${++feedKey.current}`,
          time:    new Date(),
          orderId: p.id,
          from:    null,
          to:      p.statusLabel,
          client:  p.client,
          isNew:   true,
        });
      }
      prevStatus.current[p.id] = p.statusRaw;
    });

    if (newEntries.length) {
      setFeed((prev) => [...newEntries, ...prev].slice(0, 40));
      // popup só para mudança de status real (não primeiro carregamento)
      const change = newEntries.find((e) => !e.isNew);
      if (change) {
        setPopup(change);
        clearTimeout(popupTimer.current);
        popupTimer.current = setTimeout(() => setPopup(null), 6000);
      }
    }

    setOrders(data.slice(0, 12));
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 5000);
    return () => { clearInterval(interval); clearTimeout(popupTimer.current); };
  }, [poll]);

  return { orders, feed, popup, lastRefresh, dismissPopup: () => setPopup(null) };
}

// ─── Componentes ─────────────────────────────────────────────────────────────

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="font-mono text-xl tabular-nums text-foreground">
      {time.toLocaleTimeString('pt-BR')}
    </span>
  );
}

function StatusBadge({ label, large }: { label: string; large?: boolean }) {
  return (
    <span className={cn(
      'rounded-md font-bold tracking-widest whitespace-nowrap',
      large ? 'px-4 py-1.5 text-sm' : 'px-2.5 py-0.5 text-[10px]',
      STATUS_CLS[label] ?? 'bg-muted text-muted-foreground',
    )}>
      {label}
    </span>
  );
}

function StepDots({ statusLabel }: { statusLabel: string }) {
  const current = STEP_INDEX[statusLabel] ?? -1;
  return (
    <div className="flex gap-1 items-center flex-wrap">
      {STEPS.map((s, i) => (
        <div
          key={s}
          title={s}
          className="rounded-full shrink-0 transition-all duration-300"
          style={{
            width:      i === current ? 10 : 7,
            height:     i === current ? 10 : 7,
            background: i === current
              ? (STATUS_BORDER[statusLabel] ?? '#fbbf24')
              : i < current
                ? '#22c55e'
                : 'hsl(var(--border))',
            boxShadow: i === current
              ? `0 0 6px ${STATUS_BORDER[statusLabel] ?? '#fbbf24'}`
              : undefined,
          }}
        />
      ))}
    </div>
  );
}

function OrderCard({ order }: { order: PainelOrder }) {
  const borderColor = STATUS_BORDER[order.statusLabel] ?? 'hsl(var(--border))';
  return (
    <div
      className="bg-card rounded-xl p-4 flex flex-col gap-2 shadow-card"
      style={{ borderLeft: `3px solid ${borderColor}`, border: `1px solid hsl(var(--border))`, borderLeftWidth: 3, borderLeftColor: borderColor }}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base font-mono-data text-foreground">#{order.id}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{order.client}</p>
        </div>
        <StatusBadge label={order.statusLabel} />
      </div>

      <StepDots statusLabel={order.statusLabel} />

      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground truncate max-w-[55%]">
          {order.rep.replace(/^\d+\s*[-–]\s*/, '').trim() || '—'}
        </span>
        <span className="text-sm font-bold font-mono-data text-foreground">
          {fmtCurrency(order.value)}
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground">{fmtRelative(order.updatedAt)}</p>
    </div>
  );
}

function StatsBar({ orders }: { orders: PainelOrder[] }) {
  const counts: Record<string, number> = {};
  orders.forEach((o) => { counts[o.statusLabel] = (counts[o.statusLabel] || 0) + 1; });

  return (
    <div className="flex gap-2 flex-wrap">
      {Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => (
          <div
            key={label}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-1',
              STATUS_CLS[label] ?? 'bg-muted text-muted-foreground',
            )}
          >
            <span className="text-[11px] font-bold tracking-wider">{label}</span>
            <span className="text-[11px] font-extrabold bg-white/20 rounded-full w-5 h-5 flex items-center justify-center">
              {count}
            </span>
          </div>
        ))}
    </div>
  );
}

function FeedPanel({ feed }: { feed: FeedEntry[] }) {
  return (
    <div className="flex flex-col h-full">
      <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase mb-3">
        Atualizações Recentes
      </p>
      <div className="flex-1 overflow-y-auto flex flex-col gap-2">
        {feed.length === 0 && (
          <p className="text-muted-foreground text-xs text-center mt-6">Aguardando mudanças…</p>
        )}
        {feed.map((entry) => {
          const borderColor = STATUS_BORDER[entry.to] ?? 'hsl(var(--border))';
          return (
            <div
              key={entry.key}
              className="bg-card rounded-lg p-2.5"
              style={{ borderLeft: `3px solid ${entry.isNew ? 'hsl(var(--border))' : borderColor}` }}
            >
              <p className="text-[10px] text-muted-foreground mb-1">{fmtTime(entry.time)}</p>
              <p className="text-xs font-bold font-mono-data text-foreground">#{entry.orderId}</p>
              <p className="text-[10px] text-muted-foreground truncate">{entry.client}</p>
              {entry.isNew ? (
                <p className="text-[10px] text-muted-foreground mt-1">Entrou no painel</p>
              ) : (
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <span className="text-[10px] text-muted-foreground">{entry.from}</span>
                  <span className="text-[10px] text-muted-foreground">→</span>
                  <span
                    className="text-[10px] font-bold"
                    style={{ color: borderColor }}
                  >
                    {entry.to}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Popup centralizado de atualização ───────────────────────────────────────
function UpdatePopup({ entry, onClose }: { entry: FeedEntry; onClose: () => void }) {
  const [progress, setProgress] = useState(100);
  const borderColor = STATUS_BORDER[entry.to] ?? 'hsl(var(--primary))';
  const DURATION = 6000;

  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.max(0, 100 - (elapsed / DURATION) * 100));
    }, 50);
    return () => clearInterval(tick);
  }, []);

  const fromIdx = entry.from ? (STEP_INDEX[entry.from] ?? -1) : -1;
  const toIdx   = STEP_INDEX[entry.to] ?? -1;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Card */}
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        style={{ borderTopColor: borderColor, borderTopWidth: 3 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de progresso */}
        <div className="h-1 bg-muted">
          <div
            className="h-full transition-none"
            style={{ width: `${progress}%`, background: borderColor }}
          />
        </div>

        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">
                Mudança de Status
              </p>
              <p className="text-2xl font-extrabold font-mono-data text-foreground">
                #{entry.orderId}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5 leading-tight">{entry.client}</p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none mt-0.5"
            >
              ×
            </button>
          </div>

          {/* Transição de status */}
          <div className="flex items-center justify-center gap-4 py-2">
            {entry.from ? (
              <>
                <div className="text-center">
                  <StatusBadge label={entry.from} large />
                  <p className="text-[10px] text-muted-foreground mt-1.5">Antes</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-2xl text-muted-foreground">→</span>
                </div>
              </>
            ) : null}
            <div className="text-center">
              <StatusBadge label={entry.to} large />
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {entry.from ? 'Agora' : 'Status atual'}
              </p>
            </div>
          </div>

          {/* Etapas */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Progresso
            </p>
            <div className="flex gap-1.5 flex-wrap items-center">
              {STEPS.map((s, i) => {
                const isCurrent = i === toIdx;
                const isDone    = i < toIdx;
                const wasFrom   = i === fromIdx;
                return (
                  <React.Fragment key={s}>
                    <div className="flex flex-col items-center gap-0.5">
                      <div
                        className="rounded-full transition-all duration-300"
                        style={{
                          width:      isCurrent ? 14 : 9,
                          height:     isCurrent ? 14 : 9,
                          background: isCurrent
                            ? borderColor
                            : isDone
                              ? '#22c55e'
                              : 'hsl(var(--border))',
                          boxShadow: isCurrent ? `0 0 8px ${borderColor}` : undefined,
                          outline: wasFrom && !isCurrent ? '2px solid #f97316' : undefined,
                          outlineOffset: 2,
                        }}
                      />
                    </div>
                    {i < STEPS.length - 1 && (
                      <div
                        className="h-px w-3 shrink-0"
                        style={{ background: i < toIdx ? '#22c55e' : 'hsl(var(--border))' }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {STEPS.map((s) => (
                <span key={s} className="text-[8px] text-muted-foreground w-[calc(10%_-_3px)] text-center leading-tight" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</span>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            Clique fora para fechar · fecha automaticamente em {Math.ceil(progress / 100 * 6)}s
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
const PainelTV: React.FC = () => {
  const { orders, feed, popup, lastRefresh, dismissPopup } = usePainel();

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-display">
      {/* Header — cor primária do app (igual sidebar) */}
      <div className="bg-primary text-primary-foreground px-6 py-3 flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center gap-4">
          <span className="text-lg font-extrabold tracking-wider">CONCREM</span>
          <span className="text-sm font-semibold opacity-70">Painel de Pedidos</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_#4ade80] animate-pulse" />
            <span className="text-xs font-bold tracking-widest opacity-90">AO VIVO</span>
          </div>
          <Clock />
          <span className="text-xs opacity-50">Atualizado {fmtTime(lastRefresh)}</span>
        </div>
      </div>

      {/* Stats bar */}
      <div className="bg-muted/40 border-b border-border px-6 py-2 shrink-0">
        <StatsBar orders={orders} />
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Grid de cards */}
        <div className="flex-1 p-5 overflow-y-auto">
          {orders.length === 0 ? (
            <p className="text-muted-foreground text-center mt-16 text-base">Carregando pedidos…</p>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {orders.map((o) => <OrderCard key={o.id} order={o} />)}
            </div>
          )}
        </div>

        {/* Feed lateral */}
        <div className="w-72 shrink-0 border-l border-border bg-muted/20 p-4 overflow-hidden flex flex-col">
          <FeedPanel feed={feed} />
        </div>
      </div>

      {/* Popup centralizado */}
      {popup && <UpdatePopup entry={popup} onClose={dismissPopup} />}
    </div>
  );
};

export default PainelTV;
