import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, ClipboardList } from 'lucide-react';
import { useApp, tableColumns } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import { PedidoStatusRow, PedidoStatusHistoricoRow, PedidoStatusValue } from '@/types';
import { ensurePedidosStatusInitializedBatch, listPedidosStatusByPedidoIds, listPedidosStatusHistorico } from '@/lib/pedidosStatusRepo'; // listPedidosStatusByPedidoIds used as fallback
import { listComercialPedidosMeta } from '@/lib/opsRepo';
import { pedidoStatusFlow, comparePedidoStatus } from '@/lib/pedidoStatusFlow';
import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabaseUtils'; // mantido para fallback listPedidosStatusByPedidoIds
import { rowToOrder } from '@/lib/pedidoMapper';
import { cn } from '@/lib/utils';
import { useQuickFilter } from '@/hooks/useQuickFilter';
import { useTableSort } from '@/hooks/useTableSort';
import { useColumnFilters, ColDef } from '@/hooks/useColumnFilters';
import { QuickFilterBar, StatusButton } from '@/components/table/QuickFilterBar';
import { PainelPedidosList } from '@/pages/painelPedidos/PainelPedidosList';
import { PainelPedidosDetails } from '@/pages/painelPedidos/PainelPedidosDetails';
import type { UnifiedPedido } from '@/pages/painelPedidos/types';

const STATUS_PAINEL_COLS = 'id, pedido_id, numero_pedido, status_atual, atualizado_em, atualizado_por, criado_em';
const STATUS_PAINEL_PAGE_SIZE = 500;

// Helpers de módulo — fora do componente para não recriar a cada render

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function fetchPainelStatusRows(): Promise<PedidoStatusRow[]> {
  if (!supabaseOps) return [];
  const { data, error } = await supabaseOps
    .from('concrem_pedidos_status')
    .select(STATUS_PAINEL_COLS)
    .order('atualizado_em', { ascending: false })
    .limit(STATUS_PAINEL_PAGE_SIZE);
  if (error) throw new Error(`[PainelPedidos] fetchPainelStatusRows: ${error.message}`);
  return (data || []) as PedidoStatusRow[];
}

async function fetchExtraPedidosInParallel(missingIds: string[]): Promise<UnifiedPedido[]> {
  if (!supabasePedidos || !missingIds.length) return [];
  const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
  const uniqueIds = Array.from(new Set(missingIds));
  const responses = await Promise.all(
    chunkArray(uniqueIds, 200).map((batch) =>
      supabasePedidos!.from(table).select(tableColumns).in('numero_pedido', batch),
    ),
  );
  const rows = responses.flatMap((res) => {
    if (res.error) { console.error('[PainelPedidos] fetchExtraPedidosInParallel batch error:', res.error.message); return []; }
    return (res.data || []) as any[];
  });
  return rows.map((row: any) => {
    const o = rowToOrder(row, 'CLI-001');
    return { id: o.id, numero: o.id, cliente: o.clientName || o.clientCode || 'Cliente', representante: o.representativeName || '-', valor: o.totalPedidoVenda ?? 0, identificacao: o.pedCompraCliente, grupoCliente: o.grupoCliente, previsaoEmbarque: o.previsaoCarregamento, cidade: o.clientCity, uf: o.clientUF };
  });
}

const statusButtons: StatusButton[] = pedidoStatusFlow
  .filter((s) => ['aguardando_avaliacao', 'liberado_producao', 'em_producao', 'faturado', 'em_entrega', 'entregue', 'finalizado'].includes(s.value))
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
  const { orders, supportOrders, user, pedidoStatusVersion } = useApp();
  const { showToast } = useToast();

  const [statusRows, setStatusRows] = useState<PedidoStatusRow[]>([]);
  const [extraPedidos, setExtraPedidos] = useState<UnifiedPedido[]>([]);
  const [loading, setLoading] = useState(false);
  const initialRefreshDone = useRef(false);
  // Map ref para O(1) lookup no realtime handler — espelha statusRows
  const statusRowsMapRef = useRef(new Map<string, PedidoStatusRow>());
  // Debounce refs para coalescer eventos realtime
  const pendingRowsRef = useRef<PedidoStatusRow[]>([]);
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<PedidoStatusHistoricoRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pedidoObs, setPedidoObs] = useState<string | null>(null);

  const pedidos = useMemo(() => {
    const venda: UnifiedPedido[] = (orders || []).map((o) => ({
      id: o.id,
      numero: o.id,
      cliente: o.clientName || o.clientCode || 'Cliente',
      representante: o.representativeName || '-',
      valor: o.totalPedidoVenda ?? 0,
      identificacao: o.pedCompraCliente,
      grupoCliente: o.grupoCliente,
      previsaoEmbarque: o.previsaoCarregamento,
      cidade: o.clientCity,
      uf: o.clientUF,
    }));
    const sup: UnifiedPedido[] = (supportOrders || []).map((o) => ({
      id: o.id,
      numero: o.id,
      cliente: o.clientName || o.clientCode || 'Cliente',
      representante: o.representativeName || '-',
      valor: o.totalPedidoVenda ?? 0,
      identificacao: o.pedCompraCliente,
      grupoCliente: o.grupoCliente,
      previsaoEmbarque: o.previsaoCarregamento,
      cidade: o.clientCity,
      uf: o.clientUF,
    }));
    const map = new Map<string, UnifiedPedido>();
    for (const p of [...venda, ...sup, ...extraPedidos]) map.set(p.id, p);
    return Array.from(map.values()).sort((a, b) => a.numero.localeCompare(b.numero));
  }, [orders, supportOrders, extraPedidos]);

  const { query, setQuery, activeStatus, setActiveStatus, filterItems } = useQuickFilter<UnifiedPedido>();
  const { sortState, setSortState, sortItems } = useTableSort();
  const colFilter = useColumnFilters();

  const statusByPedidoId = useMemo(() => new Map(statusRows.map((r) => [String(r.pedido_id), r] as const)), [statusRows]);

  const colDefs: ColDef<UnifiedPedido>[] = useMemo(() => [
    { key: 'pedido', getter: (p) => p.numero },
    { key: 'cliente', getter: (p) => p.cliente },
    { key: 'representante', getter: (p) => p.representante },
    { key: 'status', getter: (p) => statusByPedidoId.get(p.id)?.status_atual || '', match: 'exact' as const },
  ], [statusByPedidoId]);

  const refresh = async () => {
    setLoading(true);
    try {
      // 1. Busca rápida dos status já existentes — query única limitada
      let statusData: PedidoStatusRow[];
      if (supabaseOps) {
        statusData = await fetchPainelStatusRows();
      } else {
        const knownIds = [...(orders || []), ...(supportOrders || [])].map((o) => o.id);
        statusData = await listPedidosStatusByPedidoIds(knownIds);
      }

      // 2. Descobre quais pedidos do AppContext ainda não têm status no banco
      const statusPedidoIds = new Set(statusData.map((r) => String(r.pedido_id)));
      const allKnownOrders = [...(orders || []), ...(supportOrders || [])];
      const missingStatusOrders = allKnownOrders
        .filter((o) => !statusPedidoIds.has(String(o.id)))
        .map((o) => ({ pedidoId: o.id, numeroPedido: o.id, grupoCliente: (o as any).grupoCliente }));

      // 3. Inicializa status apenas para os faltantes — não percorre a lista inteira
      if (missingStatusOrders.length > 0) {
        await ensurePedidosStatusInitializedBatch(missingStatusOrders, user?.username || null);
        // Recarrega para incluir as linhas recém-criadas
        if (supabaseOps) statusData = await fetchPainelStatusRows();
      }

      // 4. Sincroniza Map ref para O(1) no realtime handler
      const newMap = new Map<string, PedidoStatusRow>();
      for (const r of statusData) newMap.set(String(r.pedido_id), r);
      statusRowsMapRef.current = newMap;

      // 5. Pedidos que estão no banco de status mas não no AppContext (ERP filtrado)
      const appOrderIds = new Set(allKnownOrders.map((o) => String(o.id)));
      const missingIds = [...new Set(
        statusData.map((r) => String(r.pedido_id)).filter((id) => !appOrderIds.has(id)),
      )];

      // 6. Busca pedidos extras do ERP em paralelo
      const fetchedExtras = await fetchExtraPedidosInParallel(missingIds);

      // 7. Atualiza estado — extras filtrados pelos IDs ativos para limpar stale entries
      const activeIds = new Set(statusData.map((r) => String(r.pedido_id)));
      setStatusRows(statusData);
      setExtraPedidos((prev) => {
        const map = new Map(prev.filter((p) => activeIds.has(p.id)).map((p) => [p.id, p]));
        for (const e of fetchedExtras) map.set(e.id, e);
        return Array.from(map.values());
      });
    } catch (e: any) {
      console.error('[PainelPedidos] refresh error:', e);
      showToast('Erro ao carregar status dos pedidos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Busca pontual no ERP quando o pedido não está na lista
  const searchErpByNumero = async (numero: string) => {
    if (!supabasePedidos || !numero.trim()) return;
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
    const { data } = await supabasePedidos.from(table).select(tableColumns).eq('numero_pedido', numero.trim()).limit(1);
    if (!data?.length) return;
    const o = rowToOrder((data as any[])[0], 'CLI-001');
    const found: UnifiedPedido = { id: o.id, numero: o.id, cliente: o.clientName || o.clientCode || 'Cliente', representante: o.representativeName || '-', valor: o.totalPedidoVenda ?? 0, identificacao: o.pedCompraCliente, grupoCliente: o.grupoCliente, previsaoEmbarque: o.previsaoCarregamento, cidade: o.clientCity, uf: o.clientUF };

    // Buscar/inicializar status ANTES de adicionar ao extraPedidos para evitar
    // que o pedido apareça sem status (causando flash de 0 resultados)
    let statusRow: PedidoStatusRow | null = null;
    if (supabaseOps) {
      await ensurePedidosStatusInitializedBatch([{ pedidoId: found.id, numeroPedido: found.numero, grupoCliente: found.grupoCliente }], user?.username || null);
      const { data, error: statusError } = await supabaseOps
        .from('concrem_pedidos_status')
        .select(STATUS_PAINEL_COLS)
        .eq('pedido_id', found.id)
        .maybeSingle();
      if (statusError) console.error('[PainelPedidos] searchErpByNumero status error:', statusError.message);
      else statusRow = data as PedidoStatusRow | null;
    }

    // Atualizar statusRows e extraPedidos juntos para evitar estado intermediário
    if (statusRow) {
      setStatusRows((prev) => {
        const exists = prev.some((r) => r.pedido_id === found.id);
        return exists ? prev : [...prev, statusRow!];
      });
    }
    setExtraPedidos((prev) => {
      if (prev.some((p) => p.id === found.id)) return prev;
      return [...prev, found];
    });
  };

  // Aguarda os pedidos do AppContext carregarem antes de fazer o refresh inicial,
  // para que ensurePedidosStatusInitializedBatch receba a lista completa.
  useEffect(() => {
    if (initialRefreshDone.current) return;
    const total = (orders?.length ?? 0) + (supportOrders?.length ?? 0);
    if (total === 0) return;
    initialRefreshDone.current = true;
    void refresh();
  }, [orders, supportOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh quando embarque é deletado ou status atualizado externamente
  useEffect(() => {
    if (pedidoStatusVersion === 0) return;
    void refresh();
  }, [pedidoStatusVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscription: auto-refresh when pedidos_status changes
  useEffect(() => {
    if (!supabaseOps) return;
    const ch = supabaseOps
      .channel('painel_pedidos_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'concrem_pedidos_status' },
        (payload) => {
          const row = (payload as any)?.new as PedidoStatusRow;
          if (!row?.pedido_id) return;
          pendingRowsRef.current.push(row);
          if (realtimeTimerRef.current) return;
          realtimeTimerRef.current = setTimeout(() => {
            const updates = [...pendingRowsRef.current];
            pendingRowsRef.current = [];
            realtimeTimerRef.current = null;
            setStatusRows((prev) => {
              const map = new Map(prev.map((item) => [String(item.pedido_id), item]));
              for (const r of updates) {
                map.set(String(r.pedido_id), r);
                statusRowsMapRef.current.set(String(r.pedido_id), r);
              }
              return Array.from(map.values());
            });
          }, 300);
        },
      )
      .subscribe();
    return () => {
      if (realtimeTimerRef.current) { clearTimeout(realtimeTimerRef.current); realtimeTimerRef.current = null; }
      void supabaseOps.removeChannel(ch);
    };
  }, []);

  const pedidosComStatus = useMemo(() => {
    // Pedidos do AppContext que têm registro de status
    const fromContext = pedidos.filter((p) => statusByPedidoId.has(p.id));
    const knownIds = new Set(fromContext.map((p) => p.id));
    // Pedidos que estão em pedidos_status mas não vieram do AppContext (ex: filtrados pelo ERP)
    const fromStatusOnly: UnifiedPedido[] = [];
    const seenInStatus = new Set<string>(knownIds);
    for (const row of statusRows) {
      const id = String(row.pedido_id);
      if (!seenInStatus.has(id)) {
        seenInStatus.add(id);
        fromStatusOnly.push({ id, numero: id, cliente: '-', representante: '-', valor: 0 });
      }
    }
    return [...fromContext, ...fromStatusOnly];
  }, [pedidos, statusByPedidoId, statusRows]);

  const uniqueClientes = useMemo(() => {
    const set = new Set(pedidosComStatus.map((p) => p.cliente).filter((c) => c && c !== '-'));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [pedidosComStatus]);

  const uniqueRepresentantes = useMemo(() => {
    const set = new Set(pedidosComStatus.map((p) => p.representante).filter((r) => r && r !== '-'));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [pedidosComStatus]);

  const filtered = useMemo(() => {
    const colFiltered = colFilter.filterItems(pedidosComStatus, colDefs);
    return filterItems(
      colFiltered,
      [(p) => p.numero, (p) => p.cliente, (p) => p.representante],
      (p) => statusByPedidoId.get(p.id)?.status_atual ?? null,
    );
  }, [pedidosComStatus, filterItems, statusByPedidoId, colFilter, colDefs]);

  const selected = useMemo(() => (selectedId ? pedidosComStatus.find((p) => p.id === selectedId) || null : null), [pedidosComStatus, selectedId]);
  const selectedStatus = (selectedId && statusByPedidoId.get(selectedId)?.status_atual) || null;

  useEffect(() => {
    let cancelled = false;
    const loadHist = async () => {
      if (!selectedId) {
        setHistory([]);
        setPedidoObs(null);
        return;
      }
      setHistoryLoading(true);
      const [items, meta] = await Promise.all([
        listPedidosStatusHistorico(selectedId),
        listComercialPedidosMeta([selectedId]),
      ]);
      if (cancelled) return;
      setHistory(items);
      setHistoryLoading(false);
      setPedidoObs(meta[selectedId]?.observacao ?? null);
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
        const sa = statusByPedidoId.get(a.id)?.status_atual || 'aguardando_avaliacao';
        const sb = statusByPedidoId.get(b.id)?.status_atual || 'aguardando_avaliacao';
        return comparePedidoStatus(sa, sb) || a.numero.localeCompare(b.numero);
      });
  }, [filtered, statusByPedidoId, sortState, sortItems]);

  return (
    <div className="space-y-6">
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
              onQueryChange={(v) => { setQuery(v); const nums = v.split(/[,;]+/).map(n => n.trim()).filter(n => /^\d{3,}$/.test(n)); nums.forEach(n => void searchErpByNumero(n)); }}
              placeholder="Buscar por cliente, representante ou n. do pedido..."
              statuses={statusButtons}
              activeStatus={activeStatus}
              onStatusChange={(s) => { setActiveStatus(s); colFilter.setFilter('status', '', true); }}
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
                <input type="text" value={colFilter.values.pedido || ''} onChange={e => { const v = e.target.value; colFilter.setFilter('pedido', v); const nums = v.split(/[,;]+/).map(n => n.trim()).filter(n => n.length >= 3); nums.forEach(n => void searchErpByNumero(n)); }} placeholder="Filtrar..." className="w-full text-[11px] bg-background border border-border/60 rounded-md px-2 py-1 text-foreground font-normal placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Cliente</label>
                <input type="text" list="painel-clientes-list" value={colFilter.values.cliente || ''} onChange={e => colFilter.setFilter('cliente', e.target.value)} placeholder="Filtrar..." className="w-full text-[11px] bg-background border border-border/60 rounded-md px-2 py-1 text-foreground font-normal placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors" />
                <datalist id="painel-clientes-list">
                  {uniqueClientes.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Representante</label>
                <input type="text" list="painel-representantes-list" value={colFilter.values.representante || ''} onChange={e => colFilter.setFilter('representante', e.target.value)} placeholder="Filtrar..." className="w-full text-[11px] bg-background border border-border/60 rounded-md px-2 py-1 text-foreground font-normal placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors" />
                <datalist id="painel-representantes-list">
                  {uniqueRepresentantes.map((r) => <option key={r} value={r} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Status</label>
                <select value={colFilter.values.status || ''} onChange={e => { colFilter.setFilter('status', e.target.value, true); if (e.target.value) setActiveStatus(null); }} className="w-full text-[11px] bg-background border border-border/60 rounded-md px-2 py-1 text-foreground font-normal focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors">
                  <option value="">Todos</option>
                  {pedidoStatusFlow.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <PainelPedidosList pedidos={sortedForPanel} statusByPedidoId={statusByPedidoId} selectedId={selectedId} selectedHistory={history} onSelect={setSelectedId} />
        </div>

        <div className="lg:col-span-4 space-y-4">
          <PainelPedidosDetails pedido={selected} statusAtual={selectedStatus} history={history} historyLoading={historyLoading} observacao={pedidoObs} />
        </div>
      </div>
    </div>
  );
};

export default PainelPedidos;
