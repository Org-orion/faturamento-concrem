import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ClipboardList } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import { PedidoStatusRow, PedidoStatusHistoricoRow, PedidoStatusValue } from '@/types';
import { ensurePedidosStatusInitializedBatch, listPedidosStatusByPedidoIds, listPedidosStatusHistorico } from '@/lib/pedidosStatusRepo';
import { pedidoStatusFlow, comparePedidoStatus } from '@/lib/pedidoStatusFlow';
import { supabaseOps } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useQuickFilter } from '@/hooks/useQuickFilter';
import { useTableSort } from '@/hooks/useTableSort';
import { useColumnFilters, ColDef } from '@/hooks/useColumnFilters';
import { QuickFilterBar, StatusButton } from '@/components/table/QuickFilterBar';
import { PainelPedidosList } from '@/pages/painelPedidos/PainelPedidosList';
import { PainelPedidosDetails } from '@/pages/painelPedidos/PainelPedidosDetails';
import type { UnifiedPedido } from '@/pages/painelPedidos/types';

const statusButtons: StatusButton[] = pedidoStatusFlow
  .filter((s) => ['aguardando_confirmacao', 'liberado_producao', 'em_producao', 'faturado', 'em_entrega', 'entregue', 'finalizado'].includes(s.value))
  .sort((a, b) => a.order - b.order)
  .map((s) => ({ value: s.value, label: s.label }));

const sortOptions = [
  { value: 'numero', label: 'Numero' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'representante', label: 'Representante' },
  { value: 'valor', label: 'Valor' },
  { value: 'atualizado_em', label: 'Atualização' },
] as const;

const PainelPedidos = () => {
  const { orders, supportOrders, user } = useApp();
  const { showToast } = useToast();

  const pedidos = useMemo(() => {
    const venda: UnifiedPedido[] = (orders || []).map((o) => ({
      id: o.id,
      numero: o.id,
      cliente: o.clientName || o.clientCode || 'Cliente',
      representante: o.representativeName || '-',
      valor: o.totalPedidoVenda ?? 0,
    }));
    const sup: UnifiedPedido[] = (supportOrders || []).map((o) => ({
      id: o.id,
      numero: o.id,
      cliente: o.clientName || o.clientCode || 'Cliente',
      representante: o.representativeName || '-',
      valor: o.totalPedidoVenda ?? 0,
    }));
    const map = new Map<string, UnifiedPedido>();
    for (const p of [...venda, ...sup]) map.set(p.id, p);
    return Array.from(map.values()).sort((a, b) => a.numero.localeCompare(b.numero));
  }, [orders, supportOrders]);

  const { query, setQuery, activeStatus, setActiveStatus, filterItems } = useQuickFilter<UnifiedPedido>();
  const { sortState, setSortState, sortItems } = useTableSort();
  const colFilter = useColumnFilters();

  const [statusRows, setStatusRows] = useState<PedidoStatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<PedidoStatusHistoricoRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const statusByPedidoId = useMemo(() => new Map(statusRows.map((r) => [r.pedido_id, r] as const)), [statusRows]);

  const colDefs: ColDef<UnifiedPedido>[] = useMemo(() => [
    { key: 'pedido', getter: (p) => p.numero },
    { key: 'cliente', getter: (p) => p.cliente },
    { key: 'representante', getter: (p) => p.representante },
    { key: 'status', getter: (p) => statusByPedidoId.get(p.id)?.status_atual || '', match: 'exact' as const },
  ], [statusByPedidoId]);

  const refresh = async () => {
    setLoading(true);
    try {
      const payload = pedidos.map((p) => ({ pedidoId: p.id, numeroPedido: p.numero }));
      await ensurePedidosStatusInitializedBatch(payload, user?.username || null);
      const rows = await listPedidosStatusByPedidoIds(payload.map((p) => p.pedidoId));
      setStatusRows(rows);
    } catch (e: any) {
      console.error(e);
      showToast('Erro ao carregar status dos pedidos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [pedidos.length]);

  // Realtime subscription: auto-refresh when pedidos_status changes
  useEffect(() => {
    if (!supabaseOps) return;
    const ch = supabaseOps
      .channel('painel_pedidos_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos_status' },
        (payload) => {
          const row = (payload as any)?.new as any;
          if (!row?.pedido_id) return;
          setStatusRows((prev) => {
            const idx = prev.findIndex((r) => r.pedido_id === row.pedido_id);
            if (idx === -1) return [...prev, row as PedidoStatusRow];
            const next = prev.slice();
            next[idx] = row as PedidoStatusRow;
            return next;
          });
        },
      )
      .subscribe();
    return () => { void supabaseOps.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    const colFiltered = colFilter.filterItems(pedidos, colDefs);
    return filterItems(
      colFiltered,
      [(p) => p.numero, (p) => p.cliente, (p) => p.representante],
      (p) => statusByPedidoId.get(p.id)?.status_atual ?? null,
    );
  }, [pedidos, filterItems, statusByPedidoId, colFilter, colDefs]);

  const selected = useMemo(() => (selectedId ? pedidos.find((p) => p.id === selectedId) || null : null), [pedidos, selectedId]);
  const selectedStatus = (selectedId && statusByPedidoId.get(selectedId)?.status_atual) || null;

  useEffect(() => {
    let cancelled = false;
    const loadHist = async () => {
      if (!selectedId) {
        setHistory([]);
        return;
      }
      setHistoryLoading(true);
      const items = await listPedidosStatusHistorico(selectedId);
      if (cancelled) return;
      setHistory(items);
      setHistoryLoading(false);
    };
    void loadHist();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const sortedForPanel = useMemo(() => {
    // If the user has picked a sort column, honour it; otherwise fall back to status + numero
    if (sortState.key && sortState.direction) {
      return sortItems(filtered, {
        numero: (p) => p.numero,
        cliente: (p) => p.cliente,
        representante: (p) => p.representante,
        valor: (p) => p.valor,
        atualizado_em: (p) => statusByPedidoId.get(p.id)?.atualizado_em ?? '',
      });
    }
    return filtered
      .slice()
      .sort((a, b) => {
        const sa = statusByPedidoId.get(a.id)?.status_atual || 'aguardando_confirmacao';
        const sb = statusByPedidoId.get(b.id)?.status_atual || 'aguardando_confirmacao';
        return comparePedidoStatus(sa, sb) || a.numero.localeCompare(b.numero);
      });
  }, [filtered, statusByPedidoId, sortState, sortItems]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-foreground">Painel de Pedidos</h1>
            <p className="text-sm text-muted-foreground">Acompanhe status e histórico de movimentação.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border hover:bg-muted/30 transition-colors text-sm font-semibold"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-card rounded-xl p-4 border border-border shadow-card space-y-3">
            <QuickFilterBar
              query={query}
              onQueryChange={setQuery}
              placeholder="Buscar por cliente, representante ou n. do pedido..."
              statuses={statusButtons}
              activeStatus={activeStatus}
              onStatusChange={setActiveStatus}
            >
              {/* Sort dropdown */}
              <select
                value={sortState.key && sortState.direction ? `${sortState.key}:${sortState.direction}` : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    setSortState({ key: null, direction: null });
                    return;
                  }
                  const [key, dir] = val.split(':');
                  setSortState({ key, direction: dir as 'asc' | 'desc' });
                }}
                className="h-9 rounded-lg border border-input bg-muted text-foreground text-sm font-semibold px-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Ordenar: Padrão</option>
                {sortOptions.map((o) => (
                  <React.Fragment key={o.value}>
                    <option value={`${o.value}:asc`}>{o.label} ↑</option>
                    <option value={`${o.value}:desc`}>{o.label} ↓</option>
                  </React.Fragment>
                ))}
              </select>
              <span className="text-xs font-bold text-muted-foreground whitespace-nowrap">{sortedForPanel.length} pedido(s)</span>
            </QuickFilterBar>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Nº Pedido</label>
                <input type="text" value={colFilter.values.pedido || ''} onChange={e => colFilter.setFilter('pedido', e.target.value)} placeholder="Filtrar..." className="w-full text-[11px] bg-background border border-border/60 rounded-md px-2 py-1 text-foreground font-normal placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Cliente</label>
                <input type="text" value={colFilter.values.cliente || ''} onChange={e => colFilter.setFilter('cliente', e.target.value)} placeholder="Filtrar..." className="w-full text-[11px] bg-background border border-border/60 rounded-md px-2 py-1 text-foreground font-normal placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Representante</label>
                <input type="text" value={colFilter.values.representante || ''} onChange={e => colFilter.setFilter('representante', e.target.value)} placeholder="Filtrar..." className="w-full text-[11px] bg-background border border-border/60 rounded-md px-2 py-1 text-foreground font-normal placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Status</label>
                <select value={colFilter.values.status || ''} onChange={e => colFilter.setFilter('status', e.target.value, true)} className="w-full text-[11px] bg-background border border-border/60 rounded-md px-2 py-1 text-foreground font-normal focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors">
                  <option value="">Todos</option>
                  {pedidoStatusFlow.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <PainelPedidosList pedidos={sortedForPanel} statusByPedidoId={statusByPedidoId} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        <div className="lg:col-span-4 space-y-4">
          <PainelPedidosDetails pedido={selected} statusAtual={selectedStatus} history={history} historyLoading={historyLoading} />
        </div>
      </div>
    </div>
  );
};

export default PainelPedidos;
