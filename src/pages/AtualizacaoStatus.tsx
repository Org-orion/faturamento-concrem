import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useApp, tableColumns } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import { rowToOrder } from '@/lib/pedidoMapper';
import { PedidoStatusHistoricoRow, PedidoStatusRow, PedidoStatusValue } from '@/types';
import { ensurePedidosStatusInitializedBatch, listPedidosStatusByPedidoIds, listPedidosStatusHistorico, updatePedidoStatus } from '@/lib/pedidosStatusRepo';
import { listComercialPedidosMeta } from '@/lib/opsRepo';
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
  const [hasMoreStatus, setHasMoreStatus] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const statusCursorRef = useRef<string | null>(null);
  const statusRowsMapRef = useRef(new Map<string, PedidoStatusRow>());
  // Debounce refs for realtime batch updates
  const pendingRowsRef = useRef<PedidoStatusRow[]>([]);
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [extraPedidos, setExtraPedidos] = useState<UnifiedPedido[]>([]);
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

  // preserveId: garante que o status row desse pedido nunca seja perdido no refresh
  const refresh = async (preserveId?: string | null) => {
    try {
      let allRows: PedidoStatusRow[] = [];
      const knownIdList = [
        ...(orders || []).map((o) => o.id),
        ...(supportOrders || []).map((o) => o.id),
      ];
      const STATUS_PAGE = 200;
      if (supabaseOps) {
        try {
          const { data, error } = await supabaseOps!
            .from('concrem_pedidos_status')
            .select('id, pedido_id, numero_pedido, status_atual, atualizado_em, atualizado_por, criado_em')
            .neq('status_atual', 'finalizado')
            .order('atualizado_em', { ascending: false })
            .limit(STATUS_PAGE);
          if (error) { console.error('[AtualizacaoStatus] refresh query error:', error); return; }
          allRows = (data || []) as PedidoStatusRow[];
          // Complementa com status de TODOS os pedidos do AppContext (sem limite por atualizado_em)
          const knownIdList = [...(orders || []).map((o) => o.id), ...(supportOrders || []).map((o) => o.id)];
          if (knownIdList.length > 0) {
            const appRows = await listPedidosStatusByPedidoIds(knownIdList);
            const merged = new Map<string, PedidoStatusRow>(allRows.map((r) => [String(r.pedido_id), r]));
            for (const r of appRows) merged.set(String(r.pedido_id), r);
            allRows = Array.from(merged.values());
            console.log(`[AtualizacaoStatus] statusRows: ${(data || []).length} recentes + ${appRows.length} app = ${allRows.length} total`);
          }
          const newHasMore = (data || []).length >= STATUS_PAGE;
          setHasMoreStatus(newHasMore);
          statusCursorRef.current = newHasMore && allRows.length > 0
            ? (allRows[allRows.length - 1]?.atualizado_em || null)
            : null;
        } catch (err) {
          console.error('[AtualizacaoStatus] refresh query error:', err);
          return;
        }
      } else {
        allRows = await listPedidosStatusByPedidoIds(knownIdList);
      }

      if (supabasePedidos && allRows.length > 0) {
        // Exclui IDs já conhecidos: AppContext + extraPedidos já buscados
        const alreadyKnownIds = new Set([...knownIdList, ...extraPedidos.map((p) => p.id)]);
        const missingIds = allRows.map((r) => String(r.pedido_id)).filter((id) => !alreadyKnownIds.has(id));
        if (preserveId && !alreadyKnownIds.has(preserveId) && !missingIds.includes(preserveId)) {
          missingIds.push(preserveId);
        }
        if (missingIds.length > 0) {
          const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
          const { data: byNumero } = await supabasePedidos.from(table).select(tableColumns).in('numero_pedido', missingIds);
          const foundByNumero = new Set(((byNumero || []) as any[]).map((r: any) => r.numero_pedido != null ? String(r.numero_pedido) : null).filter(Boolean));
          const stillMissing = missingIds.filter((id) => !foundByNumero.has(id));
          const { data: byId } = stillMissing.length > 0
            ? await supabasePedidos.from(table).select(tableColumns).in('id', stillMissing)
            : { data: [] };
          const allExtra = [...(byNumero || []), ...(byId || [])] as any[];
          const fetched: UnifiedPedido[] = allExtra.map((row: any) => {
            const o = rowToOrder(row, 'CLI-001');
            const canonicalId = row.numero_pedido != null ? String(row.numero_pedido) : (row.id != null ? String(row.id) : o.id);
            const matchedId = missingIds.find((id) => id === canonicalId) || canonicalId;
            return { id: matchedId, numero: matchedId, cliente: o.clientName || o.clientCode || 'Cliente', representante: o.representativeName || '-', repPhone: o.representativePhone || null };
          });
          if (fetched.length > 0) {
            // Nunca remove extras existentes — apenas adiciona novos
            setExtraPedidos((prev) => {
              const map = new Map(prev.map((p) => [p.id, p]));
              for (const e of fetched) map.set(e.id, e);
              return Array.from(map.values());
            });
          }
        }
      }

      // Preserva status rows de pedidos buscados manualmente (extraPedidos) e do preserveId
      // caso não constem no allRows (race condition, limite de 5000 ou inicialização pendente)
      const extraIds = new Set(extraPedidos.map((p) => p.id));
      setStatusRows((prev) => {
        const freshIds = new Set(allRows.map((r) => String(r.pedido_id)));
        const toPreserve = prev.filter((r) => {
          const id = String(r.pedido_id);
          return !freshIds.has(id) && (extraIds.has(id) || id === preserveId);
        });
        const result = toPreserve.length > 0 ? [...allRows, ...toPreserve] : allRows;
        const m = new Map<string, PedidoStatusRow>();
        for (const r of result) m.set(String(r.pedido_id), r);
        statusRowsMapRef.current = m;
        return result;
      });
    } catch (e) {
      console.error('[AtualizacaoStatus] refresh error:', e);
    }
  };

  const loadMoreStatus = useCallback(async () => {
    if (!supabaseOps || loadingMore || !hasMoreStatus || !statusCursorRef.current) return;
    setLoadingMore(true);
    try {
      const { data, error } = await supabaseOps!
        .from('concrem_pedidos_status')
        .select('id, pedido_id, numero_pedido, status_atual, atualizado_em, atualizado_por, criado_em')
        .neq('status_atual', 'finalizado')
        .order('atualizado_em', { ascending: false })
        .lt('atualizado_em', statusCursorRef.current!)
        .limit(200);
      if (error) { console.error('[AtualizacaoStatus] loadMoreStatus error:', error); return; }
      const rows = (data || []) as PedidoStatusRow[];
      const newHasMore = rows.length >= 200;
      setHasMoreStatus(newHasMore);
      statusCursorRef.current = newHasMore && rows.length > 0 ? (rows[rows.length - 1]?.atualizado_em || null) : null;
      if (rows.length > 0) {
        setStatusRows((prev) => {
          const map = new Map(prev.map((r) => [String(r.pedido_id), r]));
          for (const r of rows) { map.set(String(r.pedido_id), r); statusRowsMapRef.current.set(String(r.pedido_id), r); }
          return Array.from(map.values());
        });
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMoreStatus]);

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
      const { data: statusData } = await supabaseOps.from('concrem_pedidos_status').select('*').eq('pedido_id', found.id).limit(1);
      if (statusData?.length) {
        setStatusRows((prev) => {
          const key = String(found.id);
          if (statusRowsMapRef.current.has(key)) return prev;
          const row = (statusData as any[])[0] as PedidoStatusRow;
          statusRowsMapRef.current.set(key, row);
          return [...prev, row];
        });
      }
    }
  };

  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscription: auto-refresh when pedidos_status changes externally
  useEffect(() => {
    if (!supabaseOps) return;
    const ch = supabaseOps
      .channel('atualizacao_status_realtime')
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

  // Busca dados de pedidos que aparecem no status table mas não no AppContext/extraPedidos
  useEffect(() => {
    if (!supabasePedidos || statusRows.length === 0) return;
    const knownIds = new Set([
      ...(orders || []).map((o) => o.id),
      ...(supportOrders || []).map((o) => o.id),
      ...extraPedidos.map((p) => p.id),
    ]);
    const missingIds = statusRows
      .map((r) => String(r.pedido_id))
      .filter((id) => !knownIds.has(id));
    if (missingIds.length === 0) return;
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
    void (async () => {
      const { data: byNumero } = await supabasePedidos!.from(table).select(tableColumns).in('numero_pedido', missingIds);
      const foundByNumero = new Set(((byNumero || []) as any[]).map((r: any) => r.numero_pedido != null ? String(r.numero_pedido) : null).filter(Boolean));
      const stillMissing = missingIds.filter((id) => !foundByNumero.has(id));
      const { data: byId } = stillMissing.length > 0
        ? await supabasePedidos!.from(table).select(tableColumns).in('id', stillMissing)
        : { data: [] };
      const data = [...(byNumero || []), ...(byId || [])];
      const fetched: UnifiedPedido[] = (data as any[]).map((row: any) => {
        const o = rowToOrder(row, 'CLI-001');
        const canonicalId = row.numero_pedido != null ? String(row.numero_pedido) : (row.id != null ? String(row.id) : o.id);
        const matchedId = missingIds.find((id) => id === canonicalId) || canonicalId;
        return { id: matchedId, numero: matchedId, cliente: o.clientName || o.clientCode || 'Cliente', representante: o.representativeName || '-', repPhone: o.representativePhone || null };
      });
      if (fetched.length > 0) {
        setExtraPedidos((prev) => {
          const map = new Map(prev.map((p) => [p.id, p]));
          for (const e of fetched) map.set(e.id, e);
          return Array.from(map.values());
        });
      }
    })();
  }, [statusRows]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Mostrar apenas pedidos que já têm registro de status (exceto finalizados).
  // O pedido atualmente selecionado nunca é removido da lista enquanto estiver em foco.
  const logisticaPedidos = useMemo(() => {
    return allPedidosComStatus.filter((p) => {
      if (p.id === selectedId) return true; // nunca oculta o pedido em foco
      const st = statusByPedidoId.get(p.id)?.status_atual;
      if (!st) return false;
      return st !== 'finalizado';
    });
  }, [allPedidosComStatus, statusByPedidoId, selectedId]);

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
    const result = filterItems(
      colFiltered,
      [(p) => p.numero, (p) => p.cliente, (p) => p.representante],
      (p) => statusByPedidoId.get(p.id)?.status_atual ?? null,
    );
    const liberadoProducaoRows = logisticaPedidos.filter(
      (p) => statusByPedidoId.get(p.id)?.status_atual === 'liberado_producao'
    );
    const ghostCount = logisticaPedidos.filter((p) => p.cliente === '-').length;
    console.log('[AtualizacaoStatus]', {
      statusRows: statusRows.length,
      pedidosComStatus: logisticaPedidos.length,
      ghostOrders: ghostCount,
      liberadoProducaoTotal: liberadoProducaoRows.length,
      filtradosLiberadoProducao: colFilter.values.status === 'liberado_producao' || activeStatus === 'liberado_producao' ? result.length : '(filtro não ativo)',
      totalUI: result.length,
      activeStatus,
      colFilterStatus: colFilter.values.status,
    });
    // Garante que o pedido em foco nunca desaparece da lista por efeito de filtros
    if (selectedId && !result.some((p) => p.id === selectedId)) {
      const pinned = logisticaPedidos.find((p) => p.id === selectedId);
      if (pinned) return [pinned, ...result];
    }
    return result;
  }, [logisticaPedidos, filterItems, statusByPedidoId, colFilter.filterItems, colDefs, selectedId]);

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
      // Reseta filtro de status rápido para que o pedido com novo status não fique oculto
      setActiveStatus(null);
      colFilter.setFilter('status', '', true);

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

    await refresh(selectedId);
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
          onQueryChange={(v) => { setQuery(v); const nums = v.split(/[,;]+/).map(n => n.trim()).filter(n => /^\d{3,}$/.test(n)); nums.forEach(n => void searchErpByNumero(n)); }}
          placeholder="Filtrar por cliente, representante ou n. do pedido..."
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
                const nums = v.split(/[,;]+/).map((n: string) => n.trim()).filter((n: string) => n.length >= 3); nums.forEach((n: string) => void searchErpByNumero(n));
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
          {hasMoreStatus && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={loadMoreStatus}
                disabled={loadingMore}
                className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
              >
                {loadingMore ? 'Carregando...' : 'Carregar mais pedidos'}
              </button>
            </div>
          )}
        </div>

        <div className="lg:col-span-6">
          <AtualizacaoStatusDetails
            pedido={selected}
            statusAtual={selectedStatus}
            history={history}
            historyLoading={historyLoading}
            onOpenUpdate={() => setOpenUpdate(true)}
            observacao={pedidoObs}
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
          else if (res.error) showToast(res.error, 'error');
        }}
      />
    </div>
  );
};

export default AtualizacaoStatus;
