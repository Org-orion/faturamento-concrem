import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { formatCurrency } from '@/components/shared';
import { getValorTotalPedido } from '@/lib/valorPedido';
import { todayBR } from '@/lib/dateUtils';
import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  XCircle,
  Search,
  X,
} from 'lucide-react';
import { getPedidoStatusLabel, getPedidoStatusBadgeClass } from '@/lib/pedidoStatusFlow';
import { canFazer } from '@/utils/access';
import type { PedidoStatusValue } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const ERP_TABLE = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_venda';
const MONTHS_BR = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const PRODUCAO_STATUSES = [
  'liberado_producao','em_producao','producao_finalizada',
  'em_carregamento','despachado','faturado','em_entrega',
  'parcialmente_entregue','entregue','aguardando_pagamento','finalizado',
];

// ─── Types ────────────────────────────────────────────────────────────────────

type PedidoAnalise = {
  pedidoId:       string;
  numeroPedido:   string;
  clienteNome:    string;
  valor:          number;
  statusAtual:    string;
  dataEmissao:    string | null;
  loadId:         string | null;
  loadDate:       string | null;
  loadMonth:      string | null;
  hasLoad:        boolean;
  monthDivergent: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveValor(erp: { total_pedido_venda: number | null; id_nota_conf: number | null }): number {
  return getValorTotalPedido(erp);
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTHS_BR[Number(m) - 1]} ${y}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// ─── Data fetching ────────────────────────────────────────────────────────────

type LoadInfo = { id: string; plannedDate: string; pedidos: string[] };

async function fetchAllLoads(): Promise<LoadInfo[]> {
  if (!supabaseOps) return [];
  const { data } = await supabaseOps
    .from('concrem_programacoes_embarque')
    .select('id, planned_date, pedidos')
    .not('pedidos', 'is', null);
  return ((data ?? []) as any[]).map(r => ({
    id:          String(r.id),
    plannedDate: r.planned_date ?? '',
    pedidos:     (r.pedidos ?? []).map(String),
  }));
}

async function fetchPedidosDoMes(month: string): Promise<PedidoAnalise[]> {
  if (!supabaseOps || !supabasePedidos) return [];

  const allLoads = await fetchAllLoads();

  // pedidoId → first load found (any month)
  const pedidoToLoad = new Map<string, { loadId: string; loadDate: string; loadMonth: string }>();
  for (const load of allLoads) {
    const lm = load.plannedDate.slice(0, 7);
    for (const pid of load.pedidos) {
      if (!pedidoToLoad.has(pid)) {
        pedidoToLoad.set(pid, { loadId: load.id, loadDate: load.plannedDate, loadMonth: lm });
      }
    }
  }

  // pedidos present in carregamentos of this specific month (Leroy rule + Query B)
  const pedidosNoMes = new Set<string>();
  for (const load of allLoads) {
    if (load.plannedDate.slice(0, 7) === month) {
      for (const pid of load.pedidos) pedidosNoMes.add(pid);
    }
  }

  const PAGE = 1000;
  const opsRows: { pedido_id: string; numero_pedido: string; status_atual: string }[] = [];
  const seenIds = new Set<string>();

  // Query A — explicit mes_programacao
  let from = 0;
  while (true) {
    const { data, error } = await supabaseOps
      .from('concrem_pedidos_status')
      .select('pedido_id, numero_pedido, status_atual')
      .eq('mes_programacao', month)
      .range(from, from + PAGE - 1);
    if (error) break;
    const page = (data ?? []) as any[];
    for (const r of page) {
      const sid = String(r.pedido_id);
      if (!seenIds.has(sid)) {
        opsRows.push({ pedido_id: sid, numero_pedido: r.numero_pedido, status_atual: r.status_atual });
        seenIds.add(sid);
      }
    }
    if (page.length < PAGE) break;
    from += PAGE;
  }

  // Query B — inferred via carregamento (em_carregamento/despachado, mes_programacao null)
  let from2 = 0;
  while (true) {
    const { data, error } = await supabaseOps
      .from('concrem_pedidos_status')
      .select('pedido_id, numero_pedido, status_atual')
      .in('status_atual', PRODUCAO_STATUSES)
      .is('mes_programacao', null)
      .range(from2, from2 + PAGE - 1);
    if (error) break;
    const page = (data ?? []) as any[];
    for (const r of page) {
      const sid = String(r.pedido_id);
      if (
        !seenIds.has(sid) &&
        (r.status_atual === 'em_carregamento' || r.status_atual === 'despachado') &&
        pedidosNoMes.has(sid)
      ) {
        opsRows.push({ pedido_id: sid, numero_pedido: r.numero_pedido, status_atual: r.status_atual });
        seenIds.add(sid);
      }
    }
    if (page.length < PAGE) break;
    from2 += PAGE;
  }

  if (opsRows.length === 0) return [];

  // ERP lookup
  const allIds = opsRows.map(r => r.pedido_id);
  const erpMap = new Map<string, any>();
  for (const batch of chunk(allIds, 200)) {
    const { data } = await supabasePedidos
      .from(ERP_TABLE)
      .select('numero_pedido, cliente_nome, total_pedido_venda, id_nota_conf, data_emissao')
      .in('numero_pedido', batch);
    for (const row of (data ?? []) as any[]) {
      erpMap.set(String(row.numero_pedido), row);
    }
  }

  const result: PedidoAnalise[] = [];
  for (const ops of opsRows) {
    const erp = erpMap.get(ops.pedido_id);
    if (!erp) continue;

    const nc = erp.id_nota_conf;

    // Inclui apenas pedidos de venda reais (307 e 309) e os que não movimentam financeiro (613 e 665)
    if (nc !== 307 && nc !== 309 && nc !== 613 && nc !== 665) continue;

    // Regra Leroy — idêntica à Programacao.tsx: só aparece se estiver em carregamento do mesmo mês
    const isLeroy = (erp.cliente_nome ?? '').toUpperCase().includes('LEROY');
    if (isLeroy && !pedidosNoMes.has(ops.pedido_id)) continue;

    const loadInfo  = pedidoToLoad.get(ops.pedido_id) ?? null;
    const hasLoad   = loadInfo != null;
    const monthDiv  = hasLoad && loadInfo!.loadMonth !== month;

    result.push({
      pedidoId:       ops.pedido_id,
      numeroPedido:   ops.numero_pedido || ops.pedido_id,
      clienteNome:    erp.cliente_nome ?? '—',
      valor:          resolveValor(erp),
      statusAtual:    ops.status_atual,
      dataEmissao:    erp.data_emissao ?? null,
      loadId:         loadInfo?.loadId ?? null,
      loadDate:       loadInfo?.loadDate ?? null,
      loadMonth:      loadInfo?.loadMonth ?? null,
      hasLoad,
      monthDivergent: monthDiv,
    });
  }

  return result;
}

function getPedidoStatusDotClass(status: string): string {
  const map: Record<string, string> = {
    liberado_producao:      'bg-amber-400',
    em_producao:            'bg-orange-400',
    producao_finalizada:    'bg-blue-400',
    em_carregamento:        'bg-purple-400',
    despachado:             'bg-indigo-400',
    faturado:               'bg-teal-400',
    em_entrega:             'bg-cyan-400',
    parcialmente_entregue:  'bg-lime-400',
    entregue:               'bg-emerald-500',
    aguardando_pagamento:   'bg-yellow-400',
    finalizado:             'bg-gray-400',
    cancelado:              'bg-red-400',
  };
  return map[status] ?? 'bg-gray-300';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const label = getPedidoStatusLabel(status as PedidoStatusValue);
  const cls   = getPedidoStatusBadgeClass(status as PedidoStatusValue);
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

// ─── Tipos de ordenação ───────────────────────────────────────────────────────

type SortKey = 'numeroPedido' | 'clienteNome' | 'valor' | 'statusAtual' | 'dataEmissao';
type SortDir = 'asc' | 'desc';

function sortPedidos(pedidos: PedidoAnalise[], key: SortKey, dir: SortDir): PedidoAnalise[] {
  return [...pedidos].sort((a, b) => {
    let va: string | number = '';
    let vb: string | number = '';
    if (key === 'valor') { va = a.valor; vb = b.valor; }
    else if (key === 'dataEmissao') { va = a.dataEmissao ?? ''; vb = b.dataEmissao ?? ''; }
    else if (key === 'numeroPedido') { va = Number(a.numeroPedido) || a.numeroPedido; vb = Number(b.numeroPedido) || b.numeroPedido; }
    else { va = (a[key] as string) ?? ''; vb = (b[key] as string) ?? ''; }
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

// ─── Cabeçalho de coluna ordenável ───────────────────────────────────────────

function SortableTh({
  label, sortKey, currentKey, currentDir, onSort,
}: {
  label: string; sortKey: SortKey; currentKey: SortKey; currentDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none hover:text-foreground transition-colors group"
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        <span className={`text-[10px] transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>
          {active ? (currentDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </div>
    </th>
  );
}

// ─── GroupTable interativo ────────────────────────────────────────────────────

type GroupTableProps = {
  pedidos:      PedidoAnalise[];
  hasLoadGroup: boolean;
  search:       string;
  onDetail:     (p: PedidoAnalise) => void;
  onChangeMes:  (numeroPedido: string) => void;
};

function GroupTable({ pedidos, hasLoadGroup, search, onDetail, onChangeMes }: GroupTableProps) {
  // ── Ordenação ──
  const [sortKey, setSortKey] = useState<SortKey>('numeroPedido');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  // ── Filtros ──
  const allStatuses = useMemo(() =>
    Array.from(new Set(pedidos.map(p => p.statusAtual))).sort(),
  [pedidos]);

  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set());
  const [onlyDivergent, setOnlyDivergent]   = useState(false);

  const toggleStatus = (s: string) => {
    setActiveStatuses(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  // ── Linha expandida ──
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  // ── Paginação ──
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Reset página quando filtros mudam
  useEffect(() => { setPage(0); }, [search, activeStatuses, onlyDivergent, sortKey, sortDir]);

  // ── Pipeline: filtrar → ordenar → paginar ──
  const filtered = useMemo(() => {
    let result = pedidos;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.numeroPedido.toLowerCase().includes(q) ||
        p.clienteNome.toLowerCase().includes(q)
      );
    }
    if (activeStatuses.size > 0) {
      result = result.filter(p => activeStatuses.has(p.statusAtual));
    }
    if (onlyDivergent) {
      result = result.filter(p => p.monthDivergent);
    }
    return result;
  }, [pedidos, search, activeStatuses, onlyDivergent]);

  const sorted     = useMemo(() => sortPedidos(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated  = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const divergentCount  = pedidos.filter(p => p.monthDivergent).length;
  const totalValor      = pedidos.reduce((s, p) => s + p.valor, 0);
  const hasActiveFilter = activeStatuses.size > 0 || onlyDivergent;

  return (
    <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden mb-4">

      {/* ── Cabeçalho do grupo ── */}
      <div className={`px-4 py-3 border-b border-border flex flex-wrap items-center gap-3 ${
        hasLoadGroup ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-red-50 dark:bg-red-950/20'
      }`}>
        <div className="flex items-center gap-2">
          {hasLoadGroup
            ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            : <XCircle className="h-4 w-4 text-red-600" />
          }
          <span className={`text-sm font-bold ${hasLoadGroup ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
            {hasLoadGroup ? 'Com carregamento programado' : 'Sem carregamento programado'}
          </span>
        </div>
        <span className={`text-xs ${hasLoadGroup ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {pedidos.length} pedidos · {formatCurrency(totalValor)}
          {filtered.length !== pedidos.length && (
            <span className="ml-1 opacity-70">({filtered.length} exibidos)</span>
          )}
        </span>
        {hasLoadGroup && divergentCount > 0 && (
          <div className="flex items-center gap-1.5 ml-auto bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg px-2.5 py-1">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              {divergentCount} pedido{divergentCount > 1 ? 's' : ''} com carregamento em mês diferente do programado
            </span>
          </div>
        )}
      </div>

      {/* ── Barra de filtros ── */}
      <div className="px-4 py-2.5 border-b border-border bg-muted/20 flex flex-wrap items-center gap-2">
        {allStatuses.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => toggleStatus(s)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
              activeStatuses.has(s)
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${getPedidoStatusDotClass(s)}`} />
            {getPedidoStatusLabel(s as PedidoStatusValue)}
          </button>
        ))}
        {hasLoadGroup && divergentCount > 0 && (
          <button
            type="button"
            onClick={() => setOnlyDivergent(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
              onlyDivergent
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-background text-amber-600 border-amber-300 hover:bg-amber-50'
            }`}
          >
            <AlertTriangle className="h-3 w-3" />
            Só mês divergente
          </button>
        )}
        {hasActiveFilter && (
          <button
            type="button"
            onClick={() => { setActiveStatuses(new Set()); setOnlyDivergent(false); }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-border text-muted-foreground hover:bg-muted transition-colors ml-auto"
          >
            <X className="h-3 w-3" />
            Limpar
          </button>
        )}
      </div>

      {/* ── Tabela ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <SortableTh label="Pedido"  sortKey="numeroPedido" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableTh label="Cliente" sortKey="clienteNome"  currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <th
                className="px-4 py-2.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none hover:text-foreground transition-colors"
                onClick={() => handleSort('valor')}
              >
                <div className="flex items-center justify-end gap-1">
                  Valor
                  <span className={`text-[10px] ${sortKey === 'valor' ? 'opacity-100' : 'opacity-0'}`}>
                    {sortDir === 'asc' ? '↑' : '↓'}
                  </span>
                </div>
              </th>
              <SortableTh label="Status"  sortKey="statusAtual"  currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableTh label="Emissão" sortKey="dataEmissao"  currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              {hasLoadGroup && (
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Carregamento</th>
              )}
              <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Alerta</th>
              <th className="px-2 py-2.5 w-16" />
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={hasLoadGroup ? 8 : 7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {hasActiveFilter || search ? 'Nenhum pedido encontrado com os filtros aplicados.' : 'Nenhum pedido neste grupo.'}
                </td>
              </tr>
            ) : paginated.map(p => {
              const isExpanded = expandedId === p.pedidoId;
              return (
                <React.Fragment key={p.pedidoId}>
                  <tr
                    className={`border-b border-border/50 transition-colors cursor-pointer ${
                      p.monthDivergent
                        ? 'bg-amber-50/60 dark:bg-amber-950/10 hover:bg-amber-100/60 dark:hover:bg-amber-950/20'
                        : isExpanded
                          ? 'bg-primary/5 hover:bg-primary/8'
                          : 'hover:bg-muted/20'
                    }`}
                    onClick={() => toggleExpand(p.pedidoId)}
                  >
                    <td className="px-4 py-2.5 font-semibold text-foreground">
                      <div className="flex items-center gap-1.5">
                        <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                        {p.numeroPedido}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-foreground max-w-[200px] truncate" title={p.clienteNome}>{p.clienteNome}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-foreground">
                      {p.valor > 0 ? formatCurrency(p.valor) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5"><StatusBadge status={p.statusAtual} /></td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{fmtDate(p.dataEmissao)}</td>
                    {hasLoadGroup && (
                      <td className="px-4 py-2.5">
                        {p.loadId ? (
                          <span className={`text-xs font-semibold ${p.monthDivergent ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                            {p.loadId} · {fmtDate(p.loadDate)}
                            {p.monthDivergent && p.loadMonth && (
                              <span className="ml-1">({monthLabel(p.loadMonth)})</span>
                            )}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-center">
                      {p.monthDivergent
                        ? <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" />
                        : <span className="text-muted-foreground text-xs">—</span>
                      }
                    </td>
                    <td className="px-2 py-2.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button type="button" title="Ver detalhes" onClick={() => onDetail(p)}
                          className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted transition-colors">
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button type="button" title="Alterar mês de programação" onClick={() => onChangeMes(p.numeroPedido)}
                          className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted transition-colors text-[11px] font-bold text-muted-foreground">
                          ↗
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Linha expandida — detalhes inline */}
                  {isExpanded && (
                    <tr className="border-b border-border/50 bg-muted/10">
                      <td colSpan={hasLoadGroup ? 8 : 7} className="px-6 py-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-2 text-xs">
                          <div>
                            <p className="text-muted-foreground mb-0.5">Pedido</p>
                            <p className="font-semibold text-foreground">{p.numeroPedido}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-0.5">Cliente</p>
                            <p className="font-semibold text-foreground">{p.clienteNome}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-0.5">Valor</p>
                            <p className="font-semibold text-foreground">{p.valor > 0 ? formatCurrency(p.valor) : '—'}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-0.5">Status</p>
                            <StatusBadge status={p.statusAtual} />
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-0.5">Data de emissão</p>
                            <p className="font-semibold text-foreground">{fmtDate(p.dataEmissao)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-0.5">Carregamento</p>
                            <p className="font-semibold text-foreground">{p.loadId ? `${p.loadId} · ${fmtDate(p.loadDate)}` : '—'}</p>
                          </div>
                          {p.monthDivergent && p.loadMonth && (
                            <div className="col-span-2">
                              <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-2.5 py-1.5">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                <p className="text-amber-700 dark:text-amber-400">
                                  Carregamento em <strong>{monthLabel(p.loadMonth)}</strong>, mas pedido está programado para este mês.
                                  <button type="button" onClick={() => onChangeMes(p.numeroPedido)}
                                    className="ml-2 underline text-amber-700 dark:text-amber-400 hover:opacity-80">
                                    Corrigir programação ↗
                                  </button>
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Paginação ── */}
      {totalPages > 1 && (
        <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} de {sorted.length}
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="text-xs px-3 py-1 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors">
              ‹ Anterior
            </button>
            <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              className="text-xs px-3 py-1 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors">
              Próxima ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function DetalheModal({ pedido, onClose }: { pedido: PedidoAnalise; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <p className="text-xs text-muted-foreground">Pedido</p>
            <p className="text-lg font-bold text-foreground">{pedido.numeroPedido}</p>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center">
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <DetailRow label="Cliente"      value={pedido.clienteNome} />
          <DetailRow label="Valor"        value={pedido.valor > 0 ? formatCurrency(pedido.valor) : '—'} />
          <DetailRow label="Status"       value={getPedidoStatusLabel(pedido.statusAtual as PedidoStatusValue)} />
          <DetailRow label="Emissão"      value={fmtDate(pedido.dataEmissao)} />
          <DetailRow label="Carregamento" value={pedido.loadId ? `${pedido.loadId} · ${fmtDate(pedido.loadDate)}` : 'Sem carregamento'} />
          {pedido.monthDivergent && pedido.loadMonth && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Este pedido está programado para este mês, mas o carregamento está em <strong>{monthLabel(pedido.loadMonth)}</strong>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const AnalisePedidos = () => {
  const { user }    = useApp();
  const navigate    = useNavigate();
  const today       = todayBR();
  const currentMonth = today.slice(0, 7);

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [pedidos, setPedidos]             = useState<PedidoAnalise[]>([]);
  const [loading, setLoading]             = useState(false);
  const [search, setSearch]               = useState('');
  const [detailPedido, setDetailPedido]   = useState<PedidoAnalise | null>(null);

  useEffect(() => {
    if (!user) return;
    const isAdmin = user.role === 'ADMIN';
    const hasPerm = canFazer(user.funcionalidades ?? null, 'analise_pedidos.view');
    if (!isAdmin && !hasPerm) navigate('/', { replace: true });
  }, [user, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setPedidos([]);
    try {
      const data = await fetchPedidosDoMes(selectedMonth);
      setPedidos(data);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => { void load(); }, [load]);

  const { comCarregamento, semCarregamento } = useMemo(() => ({
    comCarregamento: pedidos.filter(p => p.hasLoad),
    semCarregamento: pedidos.filter(p => !p.hasLoad),
  }), [pedidos]);

  const totalValor       = pedidos.reduce((s, p) => s + p.valor, 0);
  const valorComCar      = comCarregamento.reduce((s, p) => s + p.valor, 0);
  const valorSemCar      = semCarregamento.reduce((s, p) => s + p.valor, 0);
  const divergentesTotal = pedidos.filter(p => p.monthDivergent).length;

  const changeMonth = (delta: number) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setSearch('');
  };

  const handleChangeMes = (numeroPedido: string) => {
    navigate(`/pedidos?tab=programacao&q=${encodeURIComponent(numeroPedido)}`);
  };

  const [y, m] = selectedMonth.split('-').map(Number);
  const label  = `${MONTHS_BR[m - 1]} ${y}`;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            className="h-8 w-8 rounded-lg border border-border hover:bg-muted flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            {label}
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </h2>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            className="h-8 w-8 rounded-lg border border-border hover:bg-muted flex items-center justify-center transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {selectedMonth === currentMonth && (
            <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">Mês atual</span>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar pedido ou cliente..."
            className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-input bg-background text-foreground w-52 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total programado', value: `${pedidos.length} pedidos`,           sub: formatCurrency(totalValor),  color: 'text-primary' },
          { label: 'Com carregamento', value: `${comCarregamento.length} pedidos`,    sub: formatCurrency(valorComCar), color: 'text-emerald-600' },
          { label: 'Sem carregamento', value: `${semCarregamento.length} pedidos`,    sub: formatCurrency(valorSemCar), color: 'text-red-600' },
          { label: 'Mês divergente',   value: `${divergentesTotal} pedido${divergentesTotal !== 1 ? 's' : ''}`, sub: 'Embarque em outro mês', color: 'text-amber-600' },
        ].map(({ label: l, value, sub, color }) => (
          <div key={l} className="bg-card rounded-xl p-4 border border-border shadow-card">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{l}</p>
            <p className={`text-base font-bold ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      {/* Divergence alert */}
      {divergentesTotal > 0 && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            <strong>{divergentesTotal} pedido{divergentesTotal > 1 ? 's estão' : ' está'} com carregamento em um mês diferente do programado.</strong>
            {' '}Verifique se o mês de programação está correto ou se o embarque precisa ser ajustado.
            Use o botão ↗ na linha do pedido para ir à tela de Programação e corrigir.
          </p>
        </div>
      )}

      {/* Groups */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : pedidos.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">
          Nenhum pedido programado para {label}.
        </div>
      ) : (
        <>
          <GroupTable
            pedidos={comCarregamento}
            hasLoadGroup={true}
            search={search}
            onDetail={setDetailPedido}
            onChangeMes={handleChangeMes}
          />
          <GroupTable
            pedidos={semCarregamento}
            hasLoadGroup={false}
            search={search}
            onDetail={setDetailPedido}
            onChangeMes={handleChangeMes}
          />
        </>
      )}

      {/* Detail modal */}
      {detailPedido && (
        <DetalheModal pedido={detailPedido} onClose={() => setDetailPedido(null)} />
      )}
    </div>
  );
};

export default AnalisePedidos;
