/**
 * PAINEL TV — Rota: /painel-tv
 * Para remover: delete este arquivo e remova as 2 linhas marcadas em App.tsx
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import logoSidebar from '@/assets/logo-sidebar.png';

// ─── Status: mapeamento interno → label ──────────────────────────────────────
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

// Cores dos badges — usa as cores de card do app (hsl direto)
const STATUS_CFG: Record<string, { bg: string; fg: string; accent: string }> = {
  'AVALIAÇÃO':     { bg: 'hsl(214,32%,91%)',   fg: 'hsl(213,12%,52%)',  accent: 'hsl(213,12%,52%)' },
  'MAPEAMENTO':    { bg: 'hsl(204,71%,57%)',    fg: '#fff',              accent: 'hsl(204,71%,57%)' },
  'FERRAGEM':      { bg: 'hsl(27,90%,65%)',     fg: '#fff',              accent: 'hsl(27,90%,65%)' },
  'COMERCIAL':     { bg: 'hsl(262,52%,56%)',    fg: '#fff',              accent: 'hsl(262,52%,56%)' },
  'LIB. PRODUÇÃO': { bg: 'hsl(210,51%,24%)',    fg: 'hsl(204,71%,85%)', accent: 'hsl(204,71%,57%)' },
  'PRODUÇÃO':      { bg: 'hsl(45,93%,47%)',     fg: '#fff',              accent: 'hsl(45,93%,47%)' },
  'FATURADO':      { bg: 'hsl(210,51%,24%)',    fg: '#fff',              accent: 'hsl(204,71%,57%)' },
  'EM ROTA':       { bg: 'hsl(262,52%,40%)',    fg: '#fff',              accent: 'hsl(262,52%,56%)' },
  'ENTREGUE':      { bg: 'hsl(171,100%,40%)',   fg: '#fff',              accent: 'hsl(171,100%,40%)' },
  'FINALIZADO':    { bg: 'hsl(142,76%,36%)',    fg: '#fff',              accent: 'hsl(142,76%,36%)' },
};

const STEPS = [
  'AVALIAÇÃO', 'MAPEAMENTO', 'FERRAGEM', 'COMERCIAL',
  'LIB. PRODUÇÃO', 'PRODUÇÃO', 'FATURADO', 'EM ROTA', 'ENTREGUE', 'FINALIZADO',
];
const STEP_IDX = Object.fromEntries(STEPS.map((s, i) => [s, i]));

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
  d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' });

const POPUP_DURATION_MS = 8000;

const repShort = (rep: string) => rep.replace(/^\d+\s*[-–]\s*/, '').trim() || '—';

const erpTable = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';

// Todos os status ativos (exceto aguardando_avaliacao que é ruído)
const ACTIVE_STATUSES = [
  'aguardando_mapeamento', 'mapeamento_andamento', 'mapeamento_concluido',
  'aguardando_ferragem', 'ferragem_recebida',
  'liberado_comercial', 'aguardando_gerencia', 'confirmado_gerencia',
  'liberado_producao', 'em_producao', 'producao_finalizada',
  'faturado', 'em_entrega', 'parcialmente_entregue',
  'entregue', 'aguardando_pagamento', 'finalizado',
];

const PER_STATUS = 100; // cards exibidos por status

// ─── Contagem real por status (query leve, sem dados) ────────────────────────
async function loadStatusCounts(): Promise<Record<string, number>> {
  if (!supabaseOps) return {};
  const results = await Promise.all(
    ACTIVE_STATUSES.map(async (status) => {
      const { count } = await supabaseOps!
        .from('concrem_pedidos_status')
        .select('*', { count: 'exact', head: true })
        .eq('status_atual', status);
      return [status, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(results);
}

// ─── Fetch de cards ───────────────────────────────────────────────────────────
async function loadPainelOrders(): Promise<PainelOrder[]> {
  if (!supabaseOps || !supabasePedidos) return [];

  // Busca os N mais recentes por status em paralelo — garante todos os status visíveis
  const pages = await Promise.all(
    ACTIVE_STATUSES.map((status) =>
      supabaseOps!
        .from('concrem_pedidos_status')
        .select('pedido_id, status_atual, atualizado_em')
        .eq('status_atual', status)
        .order('atualizado_em', { ascending: false })
        .limit(PER_STATUS)
        .then(({ data }) => data || []),
    ),
  );

  // Mescla e ordena globalmente por mais recente
  const statusRows = (pages.flat() as any[]).sort(
    (a, b) => new Date(b.atualizado_em).getTime() - new Date(a.atualizado_em).getTime(),
  );

  if (!statusRows.length) return [];

  const ids = statusRows.map((r: any) => String(r.pedido_id));

  // Busca ERP em lotes de 200
  const chunkArr = <T,>(arr: T[], n: number) =>
    Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  const erpBatches = await Promise.all(
    chunkArr(ids, 200).map((batch) =>
      supabasePedidos!
        .from(erpTable)
        .select('numero_pedido, cliente_nome, representante, total_pedido_venda')
        .in('numero_pedido', batch)
        .then(({ data }) => data || []),
    ),
  );
  const erpMap = new Map(erpBatches.flat().map((r: any) => [String(r.numero_pedido), r]));

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

type HistRow = { pedido_id: string; status_anterior: string | null; status_novo: string; alterado_em: string };

// Busca os N mais recentes do histórico (sem filtro de data — filtragem via Set)
async function loadRecentHistory(limit = 50): Promise<HistRow[]> {
  if (!supabaseOps) return [];
  const { data } = await supabaseOps
    .from('concrem_pedidos_status_historico')
    .select('pedido_id, status_anterior, status_novo, alterado_em')
    .order('alterado_em', { ascending: false })
    .limit(limit);
  return (data || []) as HistRow[];
}

// ─── Hook polling ─────────────────────────────────────────────────────────────
function usePainel() {
  const [orders, setOrders]           = useState<PainelOrder[]>([]);
  const [counts, setCounts]           = useState<Record<string, number>>({});
  const [feed, setFeed]               = useState<FeedEntry[]>([]);
  const [popup, setPopup]             = useState<FeedEntry | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const popupTimer  = useRef<ReturnType<typeof setTimeout>>();
  const feedKey     = useRef(0);
  // Set de chaves `pedido_id_alterado_em` já processadas — imune a clock skew
  const seenKeys    = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  // Último status exibido no popup por pedido
  const shownStatus = useRef<Record<string, string>>({});

  const poll = useCallback(async () => {
    // Primeiro poll: popula seenKeys com TODO o histórico existente sem notificar
    if (!initialized.current) {
      const [data, rawCounts, existingHist] = await Promise.all([
        loadPainelOrders(),
        loadStatusCounts(),
        loadRecentHistory(2000),
      ]);
      existingHist.forEach((h) => seenKeys.current.add(`${h.pedido_id}_${h.alterado_em}`));
      initialized.current = true;
      if (!data.length) return;
      const lc: Record<string, number> = {};
      for (const [s, n] of Object.entries(rawCounts)) {
        const lb = STATUS_LABEL[s] || s.toUpperCase();
        lc[lb] = (lc[lb] || 0) + n;
      }
      setCounts(lc);
      setOrders(data);
      setLastRefresh(new Date());
      return;
    }

    // Polls seguintes: busca os 50 mais recentes e filtra pelo Set
    const [data, rawCounts, recentHist] = await Promise.all([
      loadPainelOrders(),
      loadStatusCounts(),
      loadRecentHistory(50),
    ]);

    if (!data.length) return;

    const newHist = recentHist.filter((h) => {
      const key = `${h.pedido_id}_${h.alterado_em}`;
      if (seenKeys.current.has(key)) return false;
      seenKeys.current.add(key);
      return true;
    });

    const lc: Record<string, number> = {};
    for (const [s, n] of Object.entries(rawCounts)) {
      const lb = STATUS_LABEL[s] || s.toUpperCase();
      lc[lb] = (lc[lb] || 0) + n;
    }
    setCounts(lc);

    if (newHist.length > 0) {
      const erpMap = new Map(data.map((o) => [o.id, o]));
      const changeEntries: FeedEntry[] = newHist.map((h) => {
        const order = erpMap.get(String(h.pedido_id));
        return {
          key:     `hist-${h.pedido_id}-${++feedKey.current}`,
          time:    new Date(h.alterado_em),
          orderId: String(h.pedido_id),
          from:    h.status_anterior ? (STATUS_LABEL[h.status_anterior] || h.status_anterior) : null,
          to:      STATUS_LABEL[h.status_novo] || h.status_novo,
          client:  order?.client || '—',
          isNew:   false,
        };
      });

      setFeed((prev) => [...changeEntries, ...prev].slice(0, 40));

      const candidate = changeEntries.find(
        (e) => shownStatus.current[e.orderId] !== e.to,
      );
      if (candidate) {
        shownStatus.current[candidate.orderId] = candidate.to;
        setPopup(candidate);
        clearTimeout(popupTimer.current);
        popupTimer.current = setTimeout(() => setPopup(null), POPUP_DURATION_MS);
      }
    }

    setOrders(data);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 5000);
    return () => { clearInterval(interval); clearTimeout(popupTimer.current); };
  }, [poll]);

  return { orders, counts, feed, popup, lastRefresh, dismissPopup: () => setPopup(null) };
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="font-mono text-lg tabular-nums text-primary-foreground/90 tracking-wider">
      {time.toLocaleTimeString('pt-BR')}
    </span>
  );
}

function StatusBadge({ label, size = 'sm' }: { label: string; size?: 'sm' | 'lg' }) {
  const cfg = STATUS_CFG[label] ?? STATUS_CFG['AVALIAÇÃO'];
  return (
    <span
      className={cn(
        'rounded-md font-bold tracking-wider whitespace-nowrap leading-none',
        size === 'lg' ? 'px-4 py-2 text-sm' : 'px-2.5 py-1 text-[10px]',
      )}
      style={{ background: cfg.bg, color: cfg.fg }}
    >
      {label}
    </span>
  );
}

function StepTrack({ statusLabel }: { statusLabel: string }) {
  const current = STEP_IDX[statusLabel] ?? -1;
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => {
        const isCurrent = i === current;
        const isDone    = i < current;
        const cfg       = STATUS_CFG[statusLabel] ?? STATUS_CFG['AVALIAÇÃO'];
        return (
          <React.Fragment key={s}>
            {/* Dot */}
            <div
              title={s}
              className="rounded-full shrink-0 transition-all duration-300"
              style={{
                width:      isCurrent ? 11 : 7,
                height:     isCurrent ? 11 : 7,
                background: isCurrent ? cfg.accent : isDone ? 'hsl(171,100%,40%)' : 'hsl(214,32%,85%)',
                boxShadow:  isCurrent ? `0 0 7px ${cfg.accent}` : undefined,
              }}
            />
            {/* Conector */}
            {i < STEPS.length - 1 && (
              <div
                className="h-px shrink-0"
                style={{
                  width: 8,
                  background: isDone ? 'hsl(171,100%,40%)' : 'hsl(214,32%,85%)',
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function OrderCard({ order }: { order: PainelOrder }) {
  const cfg = STATUS_CFG[order.statusLabel] ?? STATUS_CFG['AVALIAÇÃO'];
  return (
    <div
      className="bg-card rounded-xl shadow-card border border-border p-4 flex flex-col gap-3 transition-shadow hover:shadow-card-hover"
      style={{ borderLeftWidth: 3, borderLeftColor: cfg.accent }}
    >
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-[15px] font-mono text-foreground leading-none">
            #{order.id}
          </p>
          <p className="text-xs text-muted-foreground mt-1 truncate">{order.client}</p>
        </div>
        <StatusBadge label={order.statusLabel} />
      </div>

      {/* Progresso */}
      <StepTrack statusLabel={order.statusLabel} />

      {/* Rodapé */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground truncate max-w-[55%]">
          {repShort(order.rep)}
        </p>
        <p className="text-sm font-bold font-mono text-foreground tabular-nums">
          {fmtCurrency(order.value)}
        </p>
      </div>

      <p className="text-[10px] text-muted-foreground/70">{fmtRelative(order.updatedAt)}</p>
    </div>
  );
}

function StatsBar({
  counts,
  activeFilters,
  onToggle,
}: {
  counts: Record<string, number>;
  activeFilters: Set<string>;
  onToggle: (label: string) => void;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const hasFilter = activeFilters.size > 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Total geral */}
      <div className="flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-bold tracking-wider bg-foreground text-background mr-1">
        <span>TOTAL</span>
        <span className="rounded-full w-5 h-5 flex items-center justify-center text-[11px] font-extrabold bg-white/20">
          {total}
        </span>
      </div>

      <div className="h-4 w-px bg-border mx-0.5" />

      {/* Badge por status — clicável para filtrar */}
      {Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => {
          const cfg      = STATUS_CFG[label] ?? STATUS_CFG['AVALIAÇÃO'];
          const isActive = activeFilters.has(label);
          const isDimmed = hasFilter && !isActive;
          return (
            <button
              key={label}
              onClick={() => onToggle(label)}
              className="flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-bold tracking-wider transition-all"
              style={{
                background: cfg.bg,
                color:      cfg.fg,
                opacity:    isDimmed ? 0.35 : 1,
                outline:    isActive ? `2px solid ${cfg.accent}` : undefined,
                outlineOffset: isActive ? 2 : undefined,
              }}
            >
              <span>{label}</span>
              <span
                className="rounded-full w-5 h-5 flex items-center justify-center text-[11px] font-extrabold"
                style={{ background: 'rgba(255,255,255,0.25)', color: cfg.fg }}
              >
                {count}
              </span>
            </button>
          );
        })}

      {/* Botão limpar filtro */}
      {hasFilter && (
        <button
          onClick={() => onToggle('__clear__')}
          className="ml-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
        >
          limpar filtro
        </button>
      )}
    </div>
  );
}

function FeedPanel({ feed }: { feed: FeedEntry[] }) {
  return (
    <div className="flex flex-col h-full gap-0">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 shrink-0">
        Atualizações Recentes
      </p>
      <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-0.5">
        {feed.length === 0 && (
          <p className="text-muted-foreground text-xs text-center mt-8">Aguardando mudanças…</p>
        )}
        {feed.map((entry) => {
          const cfg = STATUS_CFG[entry.to] ?? STATUS_CFG['AVALIAÇÃO'];
          return (
            <div
              key={entry.key}
              className="bg-card rounded-lg p-2.5 border border-border shadow-card"
              style={{ borderLeftWidth: 3, borderLeftColor: entry.isNew ? 'hsl(214,32%,85%)' : cfg.accent }}
            >
              <p className="text-[10px] text-muted-foreground mb-1">{fmtTime(entry.time)}</p>
              <p className="text-xs font-bold font-mono text-foreground">#{entry.orderId}</p>
              <p className="text-[10px] text-muted-foreground truncate">{entry.client}</p>
              {entry.isNew ? (
                <p className="text-[10px] text-muted-foreground mt-1 italic">Entrou no painel</p>
              ) : (
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <span className="text-[10px] text-muted-foreground">{entry.from}</span>
                  <span className="text-[10px] text-muted-foreground">→</span>
                  <span className="text-[10px] font-bold" style={{ color: cfg.accent }}>{entry.to}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Popup centralizado ───────────────────────────────────────────────────────
function UpdatePopup({ entry, onClose }: { entry: FeedEntry; onClose: () => void }) {
  const [progress, setProgress] = useState(100);
  const cfg     = STATUS_CFG[entry.to]   ?? STATUS_CFG['AVALIAÇÃO'];
  const cfgFrom = entry.from ? (STATUS_CFG[entry.from] ?? STATUS_CFG['AVALIAÇÃO']) : null;
  const toIdx   = STEP_IDX[entry.to] ?? -1;
  const fromIdx = entry.from ? (STEP_IDX[entry.from] ?? -1) : -1;

  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      const pct = Math.max(0, 100 - ((Date.now() - start) / POPUP_DURATION_MS) * 100);
      setProgress(pct);
      if (pct === 0) clearInterval(tick);
    }, 50);
    return () => clearInterval(tick);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl border border-border overflow-hidden"
        style={{ width: '50vw', maxHeight: '80vh', overflowY: 'auto' }}
        style={{ borderTopWidth: 4, borderTopColor: cfg.accent }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de progresso */}
        <div className="h-1.5 bg-muted">
          <div
            className="h-full transition-none"
            style={{ width: `${progress}%`, background: cfg.accent }}
          />
        </div>

        <div className="p-8 space-y-6">
          {/* Topo */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">
                Atualização de Pedido
              </p>
              <p className="text-5xl font-extrabold font-mono text-foreground leading-none">
                #{entry.orderId}
              </p>
              <p className="text-base text-muted-foreground mt-2 leading-snug">
                {entry.client}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors text-3xl leading-none w-10 h-10 flex items-center justify-center rounded-lg hover:bg-muted/50 shrink-0"
            >
              ×
            </button>
          </div>

          {/* Transição de status */}
          <div className="flex items-center justify-center gap-8 py-5 bg-muted/30 rounded-xl">
            {cfgFrom && entry.from && (
              <>
                <div className="text-center">
                  <StatusBadge label={entry.from} size="lg" />
                  <p className="text-xs text-muted-foreground mt-2 font-medium">Anterior</p>
                </div>
                <span className="text-4xl text-muted-foreground font-light">→</span>
              </>
            )}
            <div className="text-center">
              <StatusBadge label={entry.to} size="lg" />
              <p className="text-xs text-muted-foreground mt-2 font-medium">
                {entry.from ? 'Novo status' : 'Status atual'}
              </p>
            </div>
          </div>

          {/* Progresso de etapas */}
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">
              Progresso do Pedido
            </p>
            <div className="flex items-center gap-0">
              {STEPS.map((s, i) => {
                const isCurrent = i === toIdx;
                const isDone    = i < toIdx;
                const wasFrom   = i === fromIdx;
                return (
                  <React.Fragment key={s}>
                    <div className="flex flex-col items-center" style={{ flex: isCurrent ? '0 0 auto' : '1 1 0' }}>
                      <div
                        className="rounded-full transition-all duration-300"
                        style={{
                          width:       isCurrent ? 20 : wasFrom ? 14 : 10,
                          height:      isCurrent ? 20 : wasFrom ? 14 : 10,
                          background:  isCurrent ? cfg.accent : isDone ? 'hsl(171,100%,40%)' : 'hsl(214,32%,85%)',
                          boxShadow:   isCurrent ? `0 0 12px ${cfg.accent}` : undefined,
                          outline:     wasFrom && !isCurrent ? '2px solid hsl(27,90%,65%)' : undefined,
                          outlineOffset: 3,
                        }}
                      />
                    </div>
                    {i < STEPS.length - 1 && (
                      <div
                        className="h-0.5 flex-1"
                        style={{ background: isDone ? 'hsl(171,100%,40%)' : 'hsl(214,32%,85%)' }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <div className="flex mt-2" style={{ gap: 0 }}>
              {STEPS.map((s, i) => (
                <p
                  key={s}
                  className={cn(
                    'text-center leading-tight',
                    i === toIdx ? 'text-[10px] font-bold text-foreground' : 'text-[9px] text-muted-foreground',
                  )}
                  style={{ flex: '1 1 0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {s}
                </p>
              ))}
            </div>
          </div>

          <p className="text-sm text-muted-foreground text-center">
            Fecha em {Math.ceil((progress / 100) * (POPUP_DURATION_MS / 1000))}s — ou clique fora
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
const PainelTV: React.FC = () => {
  const { orders, counts, feed, popup, lastRefresh, dismissPopup } = usePainel();
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const toggleFilter = useCallback((label: string) => {
    if (label === '__clear__') { setActiveFilters(new Set()); return; }
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }, []);

  const visibleOrders = activeFilters.size > 0
    ? orders.filter((o) => activeFilters.has(o.statusLabel))
    : orders;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-display">

      {/* Header — igual à sidebar do app */}
      <header className="bg-primary text-primary-foreground px-6 py-0 flex items-center justify-between shrink-0 h-16 shadow-md">
        <div className="flex items-center gap-4">
          <img src={logoSidebar} alt="Concrem" className="h-8 object-contain" />
          <div className="h-5 w-px bg-primary-foreground/20" />
          <span className="text-sm font-semibold text-primary-foreground/80 tracking-wide">
            Painel de Pedidos
          </span>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_#4ade80] animate-pulse" />
            <span className="text-xs font-bold tracking-widest text-primary-foreground/90">AO VIVO</span>
          </div>
          <Clock />
          <span className="text-xs text-primary-foreground/50">
            Atualizado {fmtTime(lastRefresh)}
          </span>
        </div>
      </header>

      {/* Stats bar */}
      <div className="bg-card border-b border-border px-6 py-2.5 shrink-0 shadow-sm">
        <StatsBar counts={counts} activeFilters={activeFilters} onToggle={toggleFilter} />
      </div>

      {/* Conteúdo */}
      <div className="flex flex-1 overflow-hidden">

        {/* Grid de cards */}
        <div className="flex-1 p-5 overflow-y-auto">
          {orders.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground text-base">Carregando pedidos…</p>
            </div>
          ) : (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))' }}
            >
              {visibleOrders.map((o) => <OrderCard key={o.id} order={o} />)}
            </div>
          )}
        </div>

        {/* Feed lateral */}
        <aside className="w-72 shrink-0 border-l border-border bg-background p-4 overflow-hidden flex flex-col">
          <FeedPanel feed={feed} />
        </aside>
      </div>

      {/* Popup de atualização */}
      {popup && <UpdatePopup entry={popup} onClose={dismissPopup} />}
    </div>
  );
};

export default PainelTV;
