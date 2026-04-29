import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { canDo, type UserRole } from '@/utils/access';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import Modal from '@/components/Modal';
import { btnDanger, btnPrimary, btnSecondary, formatCurrency, getOrderTotal, inputClass } from '@/components/shared';
import { CheckCircle2, Eye, Plus } from 'lucide-react';
import { StatusBadge } from '@/components/shared';
import { useDebounce } from '@/hooks/useDebounce';
import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import { tableColumns, vendasOr, getDataCorte } from '@/contexts/AppContext';
import { rowToOrder } from '@/lib/pedidoMapper';
import { Order, SupportOrder, PedidoStatusRow } from '@/types';
import type { FilterCondition, FilterField } from '@/lib/filters';
import { FilterConfiguratorDialog } from '@/components/filters/FilterConfiguratorDialog';
import { FilterTriggerButton } from '@/components/filters/FilterTriggerButton';
import { ActiveFiltersChips } from '@/components/filters/ActiveFiltersChips';
import { listPedidosStatusByPedidoIds, updatePedidoStatus, isLeroy } from '@/lib/pedidosStatusRepo';
import { getPedidoStatusDef, comparePedidoStatus } from '@/lib/pedidoStatusFlow';

import { todayBR, fmtDate, fmtDateTime } from '@/lib/dateUtils';
import { PedidoStatusBadge } from '@/components/pedidos/PedidoStatusBadge';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader } from '@/components/table/SortableHeader';
import { usePrioridades } from '@/contexts/PrioridadesContext';
import { useAtencao } from '@/contexts/AtencaoContext';
import { PrioridadeIcon, AtencaoIcon } from '@/components/pedidos/PrioridadeBadge';

type ScheduleCandidate = {
  id: string;
  representativeName: string;
  total: number;
  kind: 'VENDA' | 'SUPORTE';
};

const commercialStatusColors: Record<string, string> = {
  'Aguardando Avaliação': 'bg-status-warning/15 text-status-warning',
  'Liberado p/ Produção': 'bg-status-success/15 text-status-success',
};

const Commercial = () => {
  const { orders, supportOrders, user, updateOrderCommercialNotes, updateSupportOrderCommercialNotes, createProductionSchedule, pedidoStatusVersion } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const { map: prioMap } = usePrioridades();
  const { map: atencaoMap } = useAtencao();
  const [moveOverride, setMoveOverride] = useState<Record<string, 'VENDA' | 'SUPORTE'>>({});

  const { sortState, toggleSort } = useTableSort();

  const [filterPedido, setFilterPedido] = useState<string>('');
  const [filterCliente, setFilterCliente] = useState<string>('');
  const [filterConf, setFilterConf] = useState<string>('');
  const [filterRep, setFilterRep] = useState<string>('');
  const [issueDate, setIssueDate] = useState<string>('');
  const [validDate, setValidDate] = useState<string>('');

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [conditions, setConditions] = useState<FilterCondition[]>([]);

  const [page, setPage] = useState(1);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [extraSearchOrders, setExtraSearchOrders] = useState<Order[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<Order | null>(null);

  // --- Pedido status tracking ---
  const [statusRows, setStatusRows] = useState<PedidoStatusRow[]>([]);
  const statusByPedidoId = useMemo(() => new Map(statusRows.map(r => [r.pedido_id, r] as const)), [statusRows]);

  // Stable ID array — efeito de status só dispara quando os IDs realmente mudam
  const allOrderIds = useMemo(() => allOrders.map(o => o.id), [allOrders]);
  // Serialized para uso como dep primitiva
  const allOrderIdsKey = useMemo(() => allOrderIds.join(','), [allOrderIds]);

  const refreshStatusRows = async (ids: string[]) => {
    const safe = ids.slice(0, 500); // cap defensivo
    if (!safe.length) return;
    const rows = await listPedidosStatusByPedidoIds(safe);
    setStatusRows(rows);
  };

  // Load status rows when allOrders change or when batch upgrades run
  useEffect(() => {
    if (allOrderIds.length) void refreshStatusRows(allOrderIds);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOrderIdsKey, pedidoStatusVersion]);

  // Self-healing: auto-upgrade any LEROY orders still stuck before liberado_producao
  useEffect(() => {
    if (!statusRows.length || !allOrders.length) return;
    const LEROY_TARGET_ORDER = getPedidoStatusDef('liberado_producao').order; // = 9
    const toUpgrade = allOrders.filter((o) => {
      const st = statusRows.find((r) => r.pedido_id === o.id)?.status_atual;
      if (!st) return false;
      return isLeroy(o.clientName, o.representativeName) && getPedidoStatusDef(st).order < LEROY_TARGET_ORDER;
    });
    if (!toUpgrade.length) return;

    const doUpgrade = async () => {
      for (const o of toUpgrade) {
        await updatePedidoStatus({
          pedidoId: o.id,
          numeroPedido: o.id,
          statusNovo: 'liberado_producao',
          alteradoPor: user?.username || null,
          observacao: 'LEROY — liberado automaticamente para produção',
        });
      }
      const ids = allOrders.map((x) => x.id);
      if (ids.length) {
        const rows = await listPedidosStatusByPedidoIds(ids);
        setStatusRows(rows);
      }
    };
    void doUpgrade();
  }, [statusRows, allOrders, user?.username]);

  // filteredOrders / displayedOrders are declared after debouncedFilterCliente (line ~287) to avoid TDZ

  useEffect(() => {
    if (!supabaseOps) return;

    const ch = supabaseOps
      .channel('commercial_realtime_status')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'concrem_pedidos_status' },
        (payload) => {
          const row = (payload as any)?.new as any;
          const pedidoId = String(row?.pedido_id || '');
          if (!pedidoId) return;

          setStatusRows((prev) => {
            const idx = prev.findIndex((r) => r.pedido_id === pedidoId);
            if (idx === -1) return [...prev, row as PedidoStatusRow];
            const next = prev.slice();
            next[idx] = row as PedidoStatusRow;
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      void supabaseOps.removeChannel(ch);
    };
  }, []);

  const debouncedFilterPedido = useDebounce(filterPedido, 400);
  const debouncedFilterConf = useDebounce(filterConf, 400);
  const debouncedFilterRep = useDebounce(filterRep, 400);

  // Busca direta por número de pedido — sem filtro de id_nota_conf nem categoria
  useEffect(() => {
    if (!supabasePedidos || !debouncedFilterPedido) { setExtraSearchOrders([]); return; }
    const nums = debouncedFilterPedido.split(/[,;]+/).map(v => v.trim()).filter(v => /^\d+$/.test(v));
    if (!nums.length) { setExtraSearchOrders([]); return; }
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
    void (async () => {
      const allExtra: any[] = [];
      for (let i = 0; i < nums.length; i += 200) {
        const batch = nums.slice(i, i + 200);
        const { data } = await supabasePedidos.from(table).select(tableColumns).in('numero_pedido', batch);
        if (data) allExtra.push(...data);
      }
      setExtraSearchOrders(allExtra.map((row: any) => rowToOrder(row, 'CLI-001')));
    })();
  }, [debouncedFilterPedido]);

  const [openDetail, setOpenDetail] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openConfirm, setOpenConfirm] = useState<null | { type: 'liberar' }>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [tempNotes, setTempNotes] = useState('');

  const [openSchedule, setOpenSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(todayBR());
  const [scheduleObs, setScheduleObs] = useState('');
  const [scheduleSelected, setScheduleSelected] = useState<string[]>([]);

  const eligibleForSchedule = useMemo(() => {
    const sale: ScheduleCandidate[] = orders
      .filter((o) => o.status === 'Liberado p/ Produção' && !o.carregamentoId)
      .map((o) => ({
        id: o.id,
        representativeName: o.representativeName || '-',
        total: getOrderTotal(o),
        kind: 'VENDA' as const,
      }));

    const support: ScheduleCandidate[] = supportOrders
      .filter((o) => o.status === 'Liberado p/ Produção' && !o.carregamentoId)
      .map((o) => ({
        id: o.id,
        representativeName: o.representativeName || '-',
        total: o.items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0),
        kind: 'SUPORTE' as const,
      }));

    return [...sale, ...support].sort((a, b) => a.id.localeCompare(b.id));
  }, [orders, supportOrders]);

  useEffect(() => {
    if (!supabaseOps) return;
    let cancelled = false;

    const loadOverrides = async () => {
      const ids = Array.from(new Set([...orders.map((o) => o.id), ...supportOrders.map((o) => o.id)]));
      if (!ids.length) {
        setMoveOverride({});
        return;
      }

      const { data, error } = await supabaseOps
        .from('concrem_comercial_pedidos_acoes')
        .select('pedido_id, acao, criado_em')
        .in('pedido_id', ids)
        .in('acao', ['mover_para_suporte', 'mover_para_venda']);

      if (cancelled) return;
      if (error || !data) return;

      const latest: Record<string, { at: string; to: 'VENDA' | 'SUPORTE' }> = {};
      for (const r of data as any[]) {
        const id = String(r.pedido_id);
        const at = String(r.criado_em || '');
        const to = String(r.acao) === 'mover_para_suporte' ? 'SUPORTE' : 'VENDA';
        if (!latest[id] || at > latest[id].at) latest[id] = { at, to };
      }

      const map: Record<string, 'VENDA' | 'SUPORTE'> = {};
      for (const id of Object.keys(latest)) map[id] = latest[id].to;
      setMoveOverride(map);
    };

    void loadOverrides();
    return () => {
      cancelled = true;
    };
  }, [orders, supportOrders]);

  const isSupport = (o: Order | SupportOrder): o is SupportOrder => {
    return 'num' in o;
  };

  const debouncedFilterCliente = useDebounce(filterCliente, 400);

  // Merge allOrders + extraSearchOrders (deduped) — extraSearchOrders bypasses category filters
  const allOrdersMerged = useMemo(() => {
    if (!extraSearchOrders.length) return allOrders;
    const map = new Map(allOrders.map(o => [o.id, o]));
    for (const o of extraSearchOrders) if (!map.has(o.id)) map.set(o.id, o);
    return Array.from(map.values());
  }, [allOrders, extraSearchOrders]);

  // Trigger status refresh when extra orders are fetched
  useEffect(() => {
    const ids = extraSearchOrders.map(o => o.id);
    if (ids.length) void refreshStatusRows([...allOrderIds, ...ids]);
  }, [extraSearchOrders]);

  // Client-side filtering: move overrides, data de emissão (LEROY vs demais), text filters, sort
  const filteredOrders = useMemo(() => {
    const movedToSupportSet = new Set(
      Object.entries(moveOverride).filter((x) => x[1] === 'SUPORTE').map((x) => x[0])
    );

    let result = allOrdersMerged.filter((o) => {
      if (movedToSupportSet.has(o.id)) return false;
      // Regra de data por cliente: LEROY >= 2026-01-01, demais >= 2025-01-06
      const clientUpper = (o.clientName || '').toUpperCase();
      const dateCorte = clientUpper.includes('LEROY MERLIN') ? '2026-01-01' : '2025-01-06';
      if ((o.date || '') < dateCorte) return false;
      return true;
    });

    console.log(`[Commercial] allOrdersMerged=${allOrdersMerged.length} → após filtro data/override=${result.length}`);

    if (debouncedFilterPedido) {
      const nums = debouncedFilterPedido.split(/[,;]+/).map((v) => v.trim()).filter(Boolean);
      if (nums.length > 1) result = result.filter((o) => nums.some((n) => o.id.includes(n)));
      else result = result.filter((o) => o.id.toLowerCase().includes(debouncedFilterPedido.toLowerCase()));
    }
    if (debouncedFilterCliente) {
      result = result.filter((o) => (o.clientName || '').toLowerCase().includes(debouncedFilterCliente.toLowerCase()));
    }
    if (debouncedFilterConf) {
      result = result.filter((o) => String(o.idNotaConf ?? '') === debouncedFilterConf);
    }
    if (debouncedFilterRep) {
      result = result.filter((o) => (o.representativeName || '').toLowerCase().includes(debouncedFilterRep.toLowerCase()));
    }
    if (issueDate) result = result.filter((o) => (o.date || '').startsWith(issueDate));
    if (validDate) result = result.filter((o) => (o.expiryDate || '').startsWith(validDate));

    if (sortState.key) {
      const dir = sortState.direction === 'asc' ? 1 : -1;
      result = [...result].sort((a, b) => {
        let av: any, bv: any;
        switch (sortState.key) {
          case 'id': av = a.id; bv = b.id; break;
          case 'cliente': av = a.clientName || ''; bv = b.clientName || ''; break;
          case 'date': av = a.date || ''; bv = b.date || ''; break;
          case 'expiryDate': av = a.expiryDate || ''; bv = b.expiryDate || ''; break;
          case 'value': av = getOrderTotal(a); bv = getOrderTotal(b); break;
          case 'status': {
            const sa = statusByPedidoId.get(a.id)?.status_atual || 'aguardando_avaliacao';
            const sb = statusByPedidoId.get(b.id)?.status_atual || 'aguardando_avaliacao';
            return comparePedidoStatus(sa, sb) * dir;
          }
          default: return 0;
        }
        if (av < bv) return -dir;
        if (av > bv) return dir;
        return 0;
      });
    } else {
      result = [...result].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    return result;
  }, [allOrdersMerged, statusByPedidoId, moveOverride, debouncedFilterPedido, debouncedFilterCliente, debouncedFilterConf, debouncedFilterRep, issueDate, validDate, sortState]);

  // Client-side pagination slice
  const displayedOrders = useMemo(() => {
    const from = (page - 1) * 20;
    return filteredOrders.slice(from, from + 20);
  }, [filteredOrders, page]);

  // Reset page when filters/sort change
  useEffect(() => { setPage(1); }, [debouncedFilterPedido, debouncedFilterCliente, debouncedFilterConf, debouncedFilterRep, issueDate, validDate, sortState]);

  const uniqueClientes = useMemo(() => {
    const set = new Set(allOrders.map((o) => o.clientName).filter((c): c is string => Boolean(c)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allOrders]);

  const uniqueRepresentantes = useMemo(() => {
    const set = new Set(allOrders.map((o) => o.representativeName).filter((r): r is string => Boolean(r)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allOrders]);

  const filterFields = useMemo(() => {
    return [
      { id: 'conf', label: 'Config. Doc.', type: 'text', getValue: (o: Order) => String(o.idNotaConf ?? ''), placeholder: 'id_nota_conf' },
      {
        id: 'rep',
        label: 'Representante',
        type: 'text',
        getValue: (o: Order) => o.representativeName || '',
        placeholder: 'Nome do representante...',
      },
      { id: 'emissao', label: 'Emissão', type: 'date', getValue: (o: Order) => o.date || '' },
      { id: 'validade', label: 'Validade', type: 'date', getValue: (o: Order) => o.expiryDate || '' },
    ] satisfies Array<FilterField<Order>>;
  }, []);

  useEffect(() => {
    const byField = new Map<string, FilterCondition>();
    for (const c of conditions) byField.set(c.fieldId, c);
    setFilterConf(byField.get('conf')?.value ?? '');
    setFilterRep(byField.get('rep')?.value ?? '');
    setIssueDate(byField.get('emissao')?.value ?? '');
    setValidDate(byField.get('validade')?.value ?? '');
    setPage(1);
  }, [conditions]);

  // Fetch venda orders — data_emissao >= 2025-01-06, paginado para superar max_rows=1000
  useEffect(() => {
    if (!supabasePedidos) return;
    let cancelled = false;

    const fetchAll = async () => {
      setLoadingList(true);
      try {
        const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
        const DATA_CORTE = getDataCorte(14); // últimos 14 meses

        const movedToVenda = Object.entries(moveOverride).filter((x) => x[1] === 'VENDA').map((x) => x[0]);
        let finalOr = vendasOr;
        if (movedToVenda.length > 0) {
          finalOr += `,numero_pedido.in.(${movedToVenda.map((x) => `"${x}"`).join(',')})`;
        }

        const PAGE = 300;
        let from = 0;
        const allData: any[] = [];
        while (true) {
          const { data, error } = await supabasePedidos
            .from(table)
            .select(tableColumns)
            .or(finalOr)
            .gte('data_emissao', DATA_CORTE)
            .order('data_emissao', { ascending: false })
            .range(from, from + PAGE - 1);
          if (cancelled) return;
          if (error) throw error;
          const page = data || [];
          allData.push(...page);
          console.log(`[Commercial] página ${from / PAGE + 1}: ${page.length} pedidos (total acumulado: ${allData.length})`);
          if (page.length < PAGE) break;
          from += PAGE;
        }

        console.log(`[Commercial] fetchAll concluído: ${allData.length} pedidos de venda carregados (corte ${DATA_CORTE})`);
        setAllOrders(allData.map((row: any) => rowToOrder(row, 'CLI-001')));
      } catch (e: any) {
        if (cancelled) return;
        console.error('[Commercial] fetchAll error:', e?.message || e);
        showToast(`Erro ao carregar pedidos: ${e?.message || 'timeout ou falha de rede'}`, 'error');
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    };

    fetchAll();
    return () => { cancelled = true; };
  }, [moveOverride]);

  const totals = useMemo(() => {
    const awaiting = orders.filter((o) => o.status === 'Aguardando Avaliação');
    const today = todayBR();
    const releasedToday = orders.filter((o) => {
      const last = (o.history || []).slice(-1)[0];
      return o.status === 'Liberado p/ Produção' && last?.action === 'Liberou pedido para produção' && (last.at || '').slice(0, 10) === today;
    });
    const inAnalysisValue = awaiting.reduce((sum, o) => sum + getOrderTotal(o), 0);

    return {
      awaitingCount: awaiting.length,
      releasedTodayCount: releasedToday.length,
      inAnalysisValue,
    };
  }, [orders]);



  const openDetails = async (id: string) => {
    const o = allOrdersMerged.find((x) => x.id === id);
    if (!o) return;
    
    setSelectedId(id);
    setTempNotes(o?.commercialNotes || '');
    setDecisionNote('');
    setOpenConfirm(null);
    setOpenDetail(true);
    setLoadingDetails(true);
    setSelectedOrderDetails(o);

    try {
      if (supabasePedidos) {
        const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
        const { data, error } = await supabasePedidos
          .from(table)
          .select('dados_tabela, cliente_fantasia, ped_compra_cliente')
          .eq('numero_pedido', id)
          .single();

        if (!error && data) {
          const fullRow = { ...o, ...data };
          const tempOrder = rowToOrder(fullRow as any, 'CLI-001');
          setSelectedOrderDetails((prev) =>
            prev
              ? {
                  ...prev,
                  items: tempOrder.items,
                  clienteFantasia: tempOrder.clienteFantasia,
                  pedCompraCliente: tempOrder.pedCompraCliente,
                }
              : null,
          );
        }

        const prec = await supabasePedidos.from(table).select('precisao_embarque').eq('numero_pedido', id).single();
        if (!prec.error && prec.data && prec.data.precisao_embarque != null) {
          const v = String(prec.data.precisao_embarque);
          setSelectedOrderDetails((prev) => (prev ? { ...prev, previsaoCarregamento: v } : null));
        }
      }
    } finally {
      setLoadingDetails(false);
    }
  };

  const canDecide = user ? canDo(user.role as UserRole, user.permissions ?? null, 'comercial', 'execute') : false;
  const canCreateSchedule = canDecide;

  const saveSchedule = () => {
    if (scheduleSelected.length === 0) return;
    createProductionSchedule({ plannedDate: scheduleDate, obs: scheduleObs, orderIds: scheduleSelected, kind: 'CRN' });
    showToast('Cronograma criado e enviado para Produção');
    setOpenSchedule(false);
    setScheduleObs('');
    setScheduleSelected([]);
    setScheduleDate(todayBR());
  };

  const handleSaveNotes = () => {
    if (!selectedOrderDetails) return;
    if (isSupport(selectedOrderDetails)) updateSupportOrderCommercialNotes(selectedOrderDetails.id, tempNotes);
    else updateOrderCommercialNotes(selectedOrderDetails.id, tempNotes);
    
    // update local state
    setSelectedOrderDetails(prev => prev ? { ...prev, commercialNotes: tempNotes } : null);
    showToast('Observações atualizadas');
  };

  const confirmRelease = async () => {
    if (!selectedOrderDetails) return;
    // Refresh status rows
    await refreshStatusRows(allOrders.map(o => o.id));

    showToast(`Pedido ${selectedOrderDetails.id} liberado para o comercial`);
    setOpenConfirm(null);
    setOpenDetail(false);
  };

  const moveToSupport = async () => {
    if (!selectedOrderDetails) return;
    setMoveOverride((prev) => ({ ...prev, [selectedOrderDetails.id]: 'SUPORTE' }));
    setAllOrders(prev => prev.filter(o => o.id !== selectedOrderDetails.id));
    setOpenDetail(false);

    const username = user?.username;
    if (!supabaseOps || !username) return;
    const { error } = await supabaseOps.from('concrem_comercial_pedidos_acoes').insert([
      {
        pedido_id: selectedOrderDetails.id,
        acao: 'mover_para_suporte',
        criado_em: new Date().toISOString(),
        criado_por: username,
        payload: { de: 'VENDA', para: 'SUPORTE' },
      },
    ] as any);
    if (error) console.error('[Supabase OPS] mover_para_suporte:', error.message);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold font-display text-foreground">Pedidos de Venda</h1>
          <p className="text-sm text-muted-foreground">Libere pedidos de venda para o comercial</p>
        </div>
        {canCreateSchedule && (
          <button className={btnPrimary} onClick={() => navigate('/comercial/liberacao')}>
            <Plus className="h-4 w-4" />
            Criar Conograma
          </button>
        )}
      </div>


      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={filterPedido}
            onChange={(e) => { setFilterPedido(e.target.value); setPage(1); }}
            placeholder="Filtrar pedido..."
            className="w-40 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors"
          />
          <input
            type="text"
            value={filterCliente}
            onChange={(e) => { setFilterCliente(e.target.value); setPage(1); }}
            placeholder="Filtrar cliente..."
            list="comm-clientes-list"
            className="flex-1 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors"
          />
          <datalist id="comm-clientes-list">
            {uniqueClientes.map((c) => <option key={c} value={c} />)}
          </datalist>
          <input
            type="text"
            value={filterRep}
            onChange={(e) => { setFilterRep(e.target.value); setPage(1); }}
            placeholder="Filtrar representante..."
            list="comm-reps-list"
            className="flex-1 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors"
          />
          <datalist id="comm-reps-list">
            {uniqueRepresentantes.map((r) => <option key={r} value={r} />)}
          </datalist>
          <FilterTriggerButton count={conditions.length} onClick={() => setFiltersOpen(true)} />
        </div>
        <ActiveFiltersChips
          fields={filterFields}
          conditions={conditions}
          onRemove={(id) => setConditions((prev) => prev.filter((c) => c.id !== id))}
          onClear={() => setConditions([])}
          onEdit={() => setFiltersOpen(true)}
        />
      </div>

      <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <SortableHeader columnKey="id" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">Nº Pedido</SortableHeader>
                <th className="w-32 py-2 text-center" />
                <SortableHeader columnKey="cliente" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">Cliente</SortableHeader>
                <SortableHeader columnKey="date" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">Emissão</SortableHeader>
                <SortableHeader columnKey="expiryDate" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">Validade</SortableHeader>
                <SortableHeader columnKey="value" sortState={sortState} onToggle={toggleSort} className="text-right py-4 px-6">Valor</SortableHeader>
                <SortableHeader columnKey="status" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">Status</SortableHeader>
                <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loadingList ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-muted-foreground font-display">
                    Carregando pedidos...
                  </td>
                </tr>
              ) : displayedOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-muted-foreground font-display">
                    Nenhum pedido aguardando avaliação encontrado.
                  </td>
                </tr>
              ) : (
                displayedOrders.map((o) => {
                  return (
                    <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-4 px-6 font-mono-data font-bold text-primary">
                        {o.id}
                        <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-blue-200 text-blue-900">
                          Venda
                        </span>
                      </td>
                      <td className="w-32 py-2 text-center align-middle">
                        {prioMap.has(o.id) && <PrioridadeIcon nivel={prioMap.get(o.id)!.nivel} motivo={prioMap.get(o.id)!.motivo} />}{atencaoMap.has(o.id) && <AtencaoIcon motivo={atencaoMap.get(o.id)!.motivo} />}
                      </td>
                      <td className="py-4 px-6 font-display font-semibold text-foreground">{o.clientName || o.clientCode || '-'}</td>
                      <td className="py-4 px-6 font-mono-data text-muted-foreground">{o.date ? fmtDate(o.date) : '-'}</td>
                      <td className="py-4 px-6 text-muted-foreground">{o.expiryDate ? fmtDate(o.expiryDate) : '-'}</td>
                      <td className="py-4 px-6 text-right font-mono-data font-bold">{formatCurrency(getOrderTotal(o))}</td>
                      <td className="py-4 px-6">
                        <PedidoStatusBadge value={statusByPedidoId.get(o.id)?.status_atual || 'aguardando_avaliacao'} />
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => void openDetails(o.id)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/50 transition-all font-display text-xs font-bold uppercase tracking-tight shadow-sm"
                        >
                          <Eye className="h-3 w-3" />
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!loadingList && filteredOrders.length > 0 && (
          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Mostrando {Math.min(page * 20, filteredOrders.length)} de {filteredOrders.length} pedidos
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded border border-border bg-card text-xs font-semibold disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                disabled={page * 20 >= filteredOrders.length}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded border border-border bg-card text-xs font-semibold disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>



      <Modal open={openDetail} onClose={() => setOpenDetail(false)} title={selectedOrderDetails ? `Pedido ${selectedOrderDetails.id}` : 'Pedido'} wide>
        {!selectedOrderDetails ? (
          <div className="text-sm text-muted-foreground">Pedido não encontrado.</div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-muted/20 border border-border rounded-lg p-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Representante</p>
                <p className="mt-1 font-semibold text-foreground">{selectedOrderDetails.representativeName || '-'}</p>
                <p className="text-xs text-muted-foreground mt-1">Código: {selectedOrderDetails.representativeId || '-'}</p>
                <p className="text-xs text-muted-foreground mt-2">Data Emissão: {selectedOrderDetails.date ? fmtDate(selectedOrderDetails.date) : '-'}</p>
                <p className="text-xs text-muted-foreground">Validade: {selectedOrderDetails.expiryDate ? fmtDate(selectedOrderDetails.expiryDate) : '-'}</p>
                {selectedOrderDetails.pedCompraCliente && <p className="text-xs text-muted-foreground mt-1">Identificação: <span className="font-semibold text-foreground">{selectedOrderDetails.pedCompraCliente}</span></p>}
                {selectedOrderDetails.grupoCliente && <p className="text-xs text-muted-foreground mt-1">Grupo do Cliente: <span className="font-semibold text-foreground">{selectedOrderDetails.grupoCliente}</span></p>}
              </div>
              <div className="bg-muted/20 border border-border rounded-lg p-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</p>
                <div className="mt-2">
                  <StatusBadge status={selectedOrderDetails.status} colorMap={commercialStatusColors} />
                </div>
                {selectedOrderDetails.previsaoCarregamento && <p className="text-xs text-muted-foreground mt-3">Previsão de Embarque: <span className="font-semibold text-foreground">{selectedOrderDetails.previsaoCarregamento}</span></p>}
                <p className="text-xs text-muted-foreground mt-3">Valor total: <span className="font-mono-data font-bold text-foreground">{formatCurrency(getOrderTotal(selectedOrderDetails))}</span></p>
                <p className="text-xs text-muted-foreground mt-1">Frete: <span className="font-mono-data font-bold text-foreground">{formatCurrency(selectedOrderDetails.freightValue || 0)}</span></p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-muted/30">
                <p className="text-sm font-bold font-display">Itens</p>
              </div>
              <div className="overflow-auto max-h-[360px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="text-left py-3 px-5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Produto</th>
                      <th className="text-right py-3 px-5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Qtd</th>
                      <th className="text-right py-3 px-5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Unit</th>
                      <th className="text-right py-3 px-5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {loadingDetails ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-muted-foreground text-xs">Carregando itens...</td>
                      </tr>
                    ) : selectedOrderDetails.items.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-muted-foreground text-xs">Nenhum item detalhado encontrado.</td>
                      </tr>
                    ) : (
                      selectedOrderDetails.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="py-3 px-5 font-display font-medium">{it.name}</td>
                          <td className="py-3 px-5 text-right font-mono-data">{it.quantity}</td>
                          <td className="py-3 px-5 text-right font-mono-data">{formatCurrency(it.unitPrice)}</td>
                          <td className="py-3 px-5 text-right font-mono-data font-bold">{formatCurrency((it.total ?? it.unitPrice * it.quantity) as number)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-muted/20 border border-border rounded-xl p-4">
              <p className="text-sm font-bold font-display text-foreground">Histórico</p>
              <div className="mt-3 space-y-2">
                {(selectedOrderDetails.history || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum histórico registrado.</p>
                ) : (
                  (selectedOrderDetails.history || []).slice().reverse().map((h, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{h.action}</p>
                        {h.note && <p className="text-xs text-muted-foreground mt-0.5">{h.note}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground font-mono-data">{fmtDateTime(h.at)}</p>
                        <p className="text-xs text-muted-foreground">{h.by}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
              <button
                onClick={() => void moveToSupport()}
                className="px-4 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors font-semibold"
              >
                Mover para Pedido Suporte
              </button>
            </div>

          </div>
        )}
      </Modal>


      <Modal open={openSchedule} onClose={() => setOpenSchedule(false)} title="Criar Cronograma de Produção" wide>
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium font-display text-foreground">Data Prevista Produção</label>
              <input type="date" className={inputClass + ' mt-1'} value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium font-display text-foreground">Nº Cronograma</label>
              <div className={inputClass + ' mt-1'}>Auto (CRN-xxx)</div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium font-display text-foreground">Observações</label>
            <textarea className={inputClass + ' mt-1'} rows={3} value={scheduleObs} onChange={(e) => setScheduleObs(e.target.value)} />
          </div>

          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Selecionar</th>
                  <th className="text-left py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Pedido</th>
                  <th className="text-left py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Representante</th>
                  <th className="text-right py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {eligibleForSchedule.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={scheduleSelected.includes(o.id)}
                        onChange={() =>
                          setScheduleSelected((prev) =>
                            prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id],
                          )
                        }
                      />
                    </td>
                    <td className="py-3 px-4 font-mono-data font-bold text-primary">
                      {prioMap.has(o.id) && <PrioridadeIcon nivel={prioMap.get(o.id)!.nivel} motivo={prioMap.get(o.id)!.motivo} />}{atencaoMap.has(o.id) && <AtencaoIcon motivo={atencaoMap.get(o.id)!.motivo} />}
                      {o.id}
                      {o.kind === 'SUPORTE' && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">
                          SUPORTE
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">{o.representativeName}</td>
                    <td className="py-3 px-4 text-right font-mono-data font-bold">{formatCurrency(o.total)}</td>
                  </tr>
                ))}
                {eligibleForSchedule.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-muted-foreground">Nenhum pedido liberado para produção.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button className={btnDanger} onClick={() => setOpenSchedule(false)}>Cancelar</button>
            <button className={btnPrimary} onClick={saveSchedule}>Salvar</button>
          </div>
        </div>
      </Modal>

      <FilterConfiguratorDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        fields={filterFields}
        value={conditions}
        onApply={setConditions}
      />
    </div>
  );
};

export default Commercial;
