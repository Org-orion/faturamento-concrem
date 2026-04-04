import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useApp, tableColumns } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import { rowToOrder } from '@/lib/pedidoMapper';
import { PedidoStatusHistoricoRow, PedidoStatusRow, PedidoStatusValue } from '@/types';
import { ensurePedidosStatusInitializedBatch, listPedidosStatusByPedidoIds, listPedidosStatusHistorico, updatePedidoStatus } from '@/lib/pedidosStatusRepo';
import { logisticaManualStatuses, getAutoFollowUpStatus, pedidoStatusFlow, shouldAutoLiberarComercial } from '@/lib/pedidoStatusFlow';
import { useQuickFilter } from '@/hooks/useQuickFilter';
import { useTableSort } from '@/hooks/useTableSort';
import { useColumnFilters, ColDef } from '@/hooks/useColumnFilters';
import { QuickFilterBar, StatusButton } from '@/components/table/QuickFilterBar';
import { AtualizacaoStatusList } from '@/pages/atualizacaoStatus/AtualizacaoStatusList';
import { AtualizacaoStatusDetails } from '@/pages/atualizacaoStatus/AtualizacaoStatusDetails';
import { StatusUpdateDialog } from '@/pages/atualizacaoStatus/StatusUpdateDialog';
import { useQueryParam } from '@/pages/atualizacaoStatus/useQueryParam';
import type { UnifiedPedido } from '@/pages/atualizacaoStatus/types';

const statusButtons: StatusButton[] = pedidoStatusFlow
  .filter((s) => s.value !== 'finalizado')
  .sort((a, b) => a.order - b.order)
  .map((s) => ({ value: s.value, label: s.label }));

const sortOptions = [
  { value: 'numero', label: 'Numero' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'representante', label: 'Representante' },
  { value: 'atualizado_em', label: 'Atualização' },
] as const;

const AtualizacaoStatus = () => {
  const { orders, supportOrders, user } = useApp();
  const { showToast } = useToast();
  const presetId = useQueryParam('pedido');

  const [statusRows, setStatusRows] = useState<PedidoStatusRow[]>([]);
  const [extraPedidos, setExtraPedidos] = useState<UnifiedPedido[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<PedidoStatusHistoricoRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const pedidos = useMemo(() => {
    const venda: UnifiedPedido[] = (orders || []).map((o) => ({
      id: o.id,
      numero: o.id,
      cliente: o.clientName || o.clientCode || 'Cliente',
      representante: o.representativeName || '-',
      repPhone: o.representativePhone || null,
    }));
    const sup: UnifiedPedido[] = (supportOrders || []).map((o) => ({
      id: o.id,
      numero: o.id,
      cliente: o.clientName || o.clientCode || 'Cliente',
      representante: o.representativeName || '-',
      repPhone: o.representativePhone || null,
    }));
    const map = new Map<string, UnifiedPedido>();
    for (const p of [...venda, ...sup, ...extraPedidos]) map.set(p.id, p);
    return Array.from(map.values()).sort((a, b) => a.numero.localeCompare(b.numero));
  }, [orders, supportOrders, extraPedidos]);

  const { query, setQuery, activeStatus, setActiveStatus, filterItems } = useQuickFilter<UnifiedPedido>();
  const { sortState, setSortState, sortItems } = useTableSort();
  const colFilter = useColumnFilters();

  const statusByPedidoId = useMemo(() => new Map(statusRows.map((r) => [String(r.pedido_id), r] as const)), [statusRows]);

  const refresh = async () => {
    try {
      let allRows: PedidoStatusRow[] = [];
      const knownIdList = [
        ...(orders || []).map((o) => o.id),
        ...(supportOrders || []).map((o) => o.id),
      ];
      if (supabaseOps) {
        const { data, error } = await supabaseOps.from('pedidos_status').select('*').limit(5000);
        if (error) {
          console.error('[AtualizacaoStatus] refresh query error:', error.message);
          return; // não sobrescreve o estado com dados vazios em caso de erro
        }
        allRows = (data || []) as PedidoStatusRow[];
      } else {
        allRows = await listPedidosStatusByPedidoIds(knownIdList);
      }

      if (supabasePedidos && allRows.length > 0) {
        const knownIds = new Set(knownIdList);
        const missingIds = allRows.map((r) => String(r.pedido_id)).filter((id) => !knownIds.has(id));
        if (missingIds.length > 0) {
          const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
          const { data: extraData } = await supabasePedidos.from(table).select(tableColumns).in('numero_pedido', missingIds);
          const fetched: UnifiedPedido[] = ((extraData || []) as any[]).map((row: any) => {
            const o = rowToOrder(row, 'CLI-001');
            return { id: o.id, numero: o.id, cliente: o.clientName || o.clientCode || 'Cliente', representante: o.representativeName || '-', repPhone: o.representativePhone || null };
          });
          // Preserva extras já adicionados via busca pontual; mescla com os recém-buscados
          const activeIds = new Set(allRows.map((r) => String(r.pedido_id)));
          setExtraPedidos((prev) => {
            const map = new Map(prev.filter((p) => activeIds.has(p.id)).map((p) => [p.id, p]));
            for (const e of fetched) map.set(e.id, e);
            return Array.from(map.values());
          });
          // No missingIds: extraPedidos already in AppContext, preserve as-is
        }
      }

      setStatusRows(allRows);
    } catch (e) {
      console.error('[AtualizacaoStatus] refresh error:', e);
    }
  };

  // Busca pontual no ERP quando o pedido não está na lista
  const searchErpByNumero = async (numero: string) => {
    if (!supabasePedidos || !numero.trim()) return;
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
    const { data } = await supabasePedidos.from(table).select(tableColumns).eq('numero_pedido', numero.trim()).limit(1);
    if (!data?.length) return;
    const o = rowToOrder((data as any[])[0], 'CLI-001');
    const found: UnifiedPedido = { id: o.id, numero: o.id, cliente: o.clientName || o.clientCode || 'Cliente', representante: o.representativeName || '-', repPhone: o.representativePhone || null };
    setExtraPedidos((prev) => {
      if (prev.some((p) => p.id === found.id)) return prev;
      return [...prev, found];
    });
    // Inicializa status se ainda não existir
    if (supabaseOps) {
      await ensurePedidosStatusInitializedBatch([{ pedidoId: found.id, numeroPedido: found.numero }], user?.username || null);
      const { data: statusData } = await supabaseOps.from('pedidos_status').select('*').eq('pedido_id', found.id).limit(1);
      if (statusData?.length) {
        setStatusRows((prev) => {
          const exists = prev.some((r) => r.pedido_id === found.id);
          return exists ? prev : [...prev, (statusData as any[])[0] as PedidoStatusRow];
        });
      }
    }
  };

  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (presetId) setSelectedId(presetId);
  }, [presetId]);

  // Pedidos do AppContext/extraPedidos que têm status + pedidos que só estão no banco (fromStatusOnly)
  const allPedidosComStatus = useMemo(() => {
    const fromContext = pedidos.filter((p) => statusByPedidoId.has(p.id));
    const knownIds = new Set(fromContext.map((p) => p.id));
    const fromStatusOnly: UnifiedPedido[] = [];
    for (const row of statusRows) {
      const id = String(row.pedido_id);
      if (!knownIds.has(id) && row.status_atual !== 'finalizado') {
        fromStatusOnly.push({ id, numero: id, cliente: '-', representante: '-', repPhone: null });
      }
    }
    return [...fromContext, ...fromStatusOnly];
  }, [pedidos, statusByPedidoId, statusRows]);

  // Mostrar apenas pedidos que já têm registro de status (exceto finalizados)
  const logisticaPedidos = useMemo(() => {
    return allPedidosComStatus.filter((p) => {
      const st = statusByPedidoId.get(p.id)?.status_atual;
      if (!st) return false;
      return st !== 'finalizado';
    });
  }, [allPedidosComStatus, statusByPedidoId]);

  const uniqueClientes = useMemo(() => {
    const set = new Set(logisticaPedidos.map((p) => p.cliente).filter((c) => c && c !== '-'));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [logisticaPedidos]);

  const colDefs: ColDef<UnifiedPedido>[] = useMemo(() => [
    { key: 'numero', getter: (p) => p.numero },
    { key: 'cliente', getter: (p) => p.cliente },
    { key: 'status', getter: (p) => statusByPedidoId.get(p.id)?.status_atual ?? '', match: 'exact' as const },
  ], [statusByPedidoId]);

  const filtered = useMemo(() => {
    const colFiltered = colFilter.filterItems(logisticaPedidos, colDefs);
    return filterItems(
      colFiltered,
      [(p) => p.numero, (p) => p.cliente, (p) => p.representante],
      (p) => statusByPedidoId.get(p.id)?.status_atual ?? null,
    );
  }, [logisticaPedidos, filterItems, statusByPedidoId, colFilter.filterItems, colDefs]);

  const sortedFiltered = useMemo(() => {
    return sortItems(filtered, {
      numero: (p) => p.numero,
      cliente: (p) => p.cliente,
      representante: (p) => p.representante,
      atualizado_em: (p) => statusByPedidoId.get(p.id)?.atualizado_em ?? '',
    });
  }, [filtered, sortItems, statusByPedidoId]);

  const selected = useMemo(() => (selectedId ? allPedidosComStatus.find((p) => p.id === selectedId) || null : null), [allPedidosComStatus, selectedId]);
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

  const [openUpdate, setOpenUpdate] = useState(false);

  const onSaved = async (newStatus?: PedidoStatusValue) => {
    if (newStatus && selectedId) {
      // Optimistically update status so the pedido stays visible during async operations
      const nowStr = new Date().toISOString();
      setStatusRows((prev) =>
        prev.map((r) =>
          String(r.pedido_id) === String(selectedId)
            ? { ...r, status_atual: newStatus, atualizado_em: nowStr }
            : r,
        ),
      );

      const pedido = pedidos.find(p => p.id === selectedId);

      // Auto follow-up genérico
      const followUp = getAutoFollowUpStatus(newStatus);
      if (followUp) {
        await updatePedidoStatus({
          pedidoId: selectedId,
          numeroPedido: pedido?.numero || selectedId,
          statusNovo: followUp,
          alteradoPor: 'sistema',
          observacao: `Transição automática: ${newStatus} → ${followUp}`,
        });
      }

      // Auto-liberar para comercial quando mapeamento + ferragem concluídos
      if (newStatus === 'mapeamento_concluido' || newStatus === 'ferragem_recebida') {
        const currentHistory = await listPedidosStatusHistorico(selectedId);
        // Inclui o status que acabou de ser salvo (pode ainda não estar no histórico)
        const historyWithNew = [...currentHistory, { status_novo: newStatus, alterado_em: new Date().toISOString() }];
        if (shouldAutoLiberarComercial(historyWithNew)) {
          await updatePedidoStatus({
            pedidoId: selectedId,
            numeroPedido: pedido?.numero || selectedId,
            statusNovo: 'liberado_comercial',
            alteradoPor: 'sistema',
            observacao: 'Liberado automaticamente: mapeamento e ferragem concluídos',
          });
        }
      }
    }

    await refresh();
    if (!selectedId) return;
    const items = await listPedidosStatusHistorico(selectedId);
    setHistory(items);
    showToast('Status atualizado com sucesso!');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
          <ClipboardCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Atualização de Status</h1>
          <p className="text-sm text-muted-foreground">Atualize etapas manuais de mapeamento, ferragem e produção.</p>
        </div>
      </div>

      <div className="bg-card rounded-xl p-4 border border-border shadow-card">
        <QuickFilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Filtrar por cliente, representante ou n. do pedido..."
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
          <span className="text-xs font-bold text-muted-foreground whitespace-nowrap">{sortedFiltered.length} pedido(s)</span>
        </QuickFilterBar>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Nº Pedido</label>
            <input
              type="text"
              value={colFilter.values.numero || ''}
              onChange={e => {
                const v = e.target.value;
                colFilter.setFilter('numero', v);
                if (v.length >= 4) void searchErpByNumero(v);
              }}
              placeholder="Filtrar..."
              className="w-full text-[11px] bg-background border border-border/60 rounded-md px-2 py-1 text-foreground font-normal placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Cliente</label>
            <input type="text" list="status-clientes-list" value={colFilter.values.cliente || ''} onChange={e => colFilter.setFilter('cliente', e.target.value)} placeholder="Filtrar..." className="w-full text-[11px] bg-background border border-border/60 rounded-md px-2 py-1 text-foreground font-normal placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors" />
            <datalist id="status-clientes-list">
              {uniqueClientes.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Status</label>
            <select value={colFilter.values.status || ''} onChange={e => colFilter.setFilter('status', e.target.value, true)} className="w-full text-[11px] bg-background border border-border/60 rounded-md px-2 py-1 text-foreground font-normal focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors">
              <option value="">Todos</option>
              {pedidoStatusFlow.filter((s) => s.value !== 'finalizado').map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6">
          <AtualizacaoStatusList
            pedidos={sortedFiltered}
            statusByPedidoId={statusByPedidoId}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        <div className="lg:col-span-6">
          <AtualizacaoStatusDetails
            pedido={selected}
            statusAtual={selectedStatus}
            history={history}
            historyLoading={historyLoading}
            onOpenUpdate={() => setOpenUpdate(true)}
          />
        </div>
      </div>

      <StatusUpdateDialog
        open={openUpdate}
        onOpenChange={setOpenUpdate}
        pedido={selected ? { id: selected.id, numero: selected.numero, cliente: selected.cliente, representante: selected.representante, repPhone: selected.repPhone } : null}
        statusAtual={selectedStatus}
        userName={user?.username || null}
        onSaved={async (newStatus) => { await onSaved(newStatus); }}
        onNotifyResult={(res) => {
          if (!res.attempted) return;
          if (res.ok) showToast('Notificação enviada ao representante via WhatsApp.');
          else showToast(res.error || 'Falha ao enviar notificação via WhatsApp.', 'error');
        }}
      />
    </div>
  );
};

export default AtualizacaoStatus;
