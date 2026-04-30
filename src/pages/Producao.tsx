import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import Modal from '@/components/Modal';
import { btnPrimary, btnSecondary, btnDanger, formatCurrency, inputClass } from '@/components/shared';
import { ProductionSchedule, Order, SupportOrder, PedidoStatusRow } from '@/types';
import { Calendar, Eye, Play, CheckCircle2, Printer, Plus, Pencil, RotateCcw } from 'lucide-react';
import { desfazerProducaoConcluido, insertProducaoConcluido, listProducaoConcluidos } from '@/lib/opsRepo';
import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import type { FilterCondition, FilterField } from '@/lib/filters';
import { FilterConfiguratorDialog } from '@/components/filters/FilterConfiguratorDialog';
import { FilterTriggerButton } from '@/components/filters/FilterTriggerButton';
import { ActiveFiltersChips } from '@/components/filters/ActiveFiltersChips';
import { useTableSort } from '@/hooks/useTableSort';
import { useQuickFilter } from '@/hooks/useQuickFilter';
import { useColumnFilters } from '@/hooks/useColumnFilters';
import { SortableHeader } from '@/components/table/SortableHeader';
import { QuickFilterBar } from '@/components/table/QuickFilterBar';
import { ColumnFilterRow, type ColFilterSlot } from '@/components/table/ColumnFilterRow';
import { todayBR, fmtDate, currentYearMonthBR } from '@/lib/dateUtils';

function calcItemsTotal(items: { quantity: number; unitPrice: number }[]) {
  return items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
}

function scheduleTotal(erpValorMap: Map<string, number>, orderIds?: string[]) {
  if (!orderIds) return 0;
  return orderIds.reduce((s, id) => s + (erpValorMap.get(id) || 0), 0);
}

const ERP_TABLE = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';

async function fetchErpValores(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!supabasePedidos || !ids.length) return map;
  const unique = [...new Set(ids)];
  const BATCH = 200;
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += BATCH) chunks.push(unique.slice(i, i + BATCH));
  const results = await Promise.all(
    chunks.map(batch =>
      supabasePedidos!.from(ERP_TABLE).select('numero_pedido, total_pedido_venda').in('numero_pedido', batch).then(({ data }) => data || [])
    )
  );
  for (const row of results.flat()) {
    const v = Number(row.total_pedido_venda) || 0;
    map.set(String(row.numero_pedido), v);
  }
  return map;
}

function isOverdue(plannedDate: string, status: ProductionSchedule['status']) {
  if (status === 'Concluído') return false;
  const today = todayBR();
  return plannedDate < today;
}

type ConcluidoRow = {
  embarque_id?: string | number | null;
  pedido_id?: string | null;
  data_conclusao?: string | null;
  motorista_id?: string | null;
} & Record<string, unknown>;

type ConcludedItem = {
  carregamentoId: string;
  schedule: ProductionSchedule | null;
  row: ConcluidoRow | null;
};

const Producao = () => {
  const {
    orders,
    drivers,
    loads,
    supportOrders,
    productionSchedules,
    createProductionSchedule,
    updateProductionSchedule,
    startProductionSchedule,
    concludeProductionSchedule,
    user,
  } = useApp();

  const [concluidos, setConcluidos] = useState<ConcluidoRow[]>([]);
  const [loadingConcluidos, setLoadingConcluidos] = useState(false);

  // Status real de cada pedido (fonte de verdade para exibição na lista de produção)
  const [statusRows, setStatusRows] = useState<PedidoStatusRow[]>([]);
  const statusByPedidoId = useMemo(() => new Map(statusRows.map(r => [r.pedido_id, r] as const)), [statusRows]);

  useEffect(() => {
    if (!supabaseOps) return;
    supabaseOps
      .from('concrem_pedidos_status')
      .select('pedido_id, status_atual')
      .in('status_atual', ['liberado_producao', 'em_producao', 'producao_finalizada'])
      .then(({ data }) => { if (data) setStatusRows(data as any); });
  }, []);

  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [openDetails, setOpenDetails] = useState(false);

  const [openCreate, setOpenCreate] = useState(false);
  const [plannedDate, setPlannedDate] = useState(todayBR());
  const [obs, setObs] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const [editId, setEditId] = useState<string | null>(null);
  const [openEdit, setOpenEdit] = useState(false);
  const [editPlannedDate, setEditPlannedDate] = useState(todayBR());
  const [editObs, setEditObs] = useState('');
  const [editSelected, setEditSelected] = useState<string[]>([]);

  const [printId, setPrintId] = useState<string | null>(null);
  const [erpValorMap, setErpValorMap] = useState<Map<string, number>>(new Map());

  // Filtros para tabela de concluídos
  const [qConcluidoPedido, setQConcluidoPedido] = useState('');
  const [qConcluidoMotorista, setQConcluidoMotorista] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [conditions, setConditions] = useState<FilterCondition[]>([]);

  // --- Sort & quick-filter hooks for PENDING table ---
  const pendingSort = useTableSort();
  const pendingFilter = useQuickFilter<ProductionSchedule>();

  // --- Sort & quick-filter hooks for CONCLUDED table ---
  const concludedSort = useTableSort();
  const concludedFilter = useQuickFilter<ConcludedItem>();

  const pendingStatusButtons = useMemo(() => [
    { value: 'Aguardando Início', label: 'Aguardando Início' },
    { value: 'Em Produção', label: 'Em Produção' },
  ], []);

  const filterFields = useMemo(() => {
    return [
      { id: 'pedido', label: 'Pedido', type: 'text', getValue: (_: unknown) => '', placeholder: 'Buscar pedido...' },
      { id: 'motorista', label: 'Motorista', type: 'text', getValue: (_: unknown) => '', placeholder: 'Buscar motorista...' },
      { id: 'data', label: 'Data', type: 'date', getValue: (_: unknown) => '' },
    ] satisfies Array<FilterField<unknown>>;
  }, []);

  useEffect(() => {
    let pedido = '';
    let motorista = '';
    let from = '';
    let to = '';

    for (const c of conditions) {
      if (c.fieldId === 'pedido') pedido = c.value;
      if (c.fieldId === 'motorista') motorista = c.value;

      if (c.fieldId === 'data') {
        if (c.operator === 'gte') from = c.value;
        if (c.operator === 'lte') to = c.value;
        if (c.operator === 'equals') {
          from = c.value;
          to = c.value;
        }
      }
    }

    setQConcluidoPedido(pedido);
    setQConcluidoMotorista(motorista);
    setDateFrom(from);
    setDateTo(to);
  }, [conditions]);

  const isLiberadoProducao = (o: Order | SupportOrder) => {
    const st = statusByPedidoId.get(o.id)?.status_atual;
    if (st) return st === 'liberado_producao';
    return o.status === 'Liberado p/ Produção';
  };

  // Busca total_pedido_venda do ERP para todos os pedidos dos cronogramas
  useEffect(() => {
    const allIds = [
      ...productionSchedules.flatMap(s => s.orderIds || []),
      ...orders.map(o => o.id),
      ...supportOrders.map(o => o.id),
    ];
    if (!allIds.length) return;
    fetchErpValores(allIds).then(setErpValorMap);
  }, [productionSchedules, orders, supportOrders]);

  const eligibleOrders = useMemo(() => {
    const sale = orders.filter((o) => isLiberadoProducao(o) && !o.carregamentoId);
    const sup = supportOrders.filter((o) => isLiberadoProducao(o) && !o.carregamentoId);
    return [...sale, ...sup].sort((a, b) => a.id.localeCompare(b.id));
  }, [orders, supportOrders, statusByPedidoId]);

  const summary = useMemo(() => {
    const awaiting = productionSchedules.filter((s) => s.status === 'Aguardando Início').length;
    const doing = productionSchedules.filter((s) => s.status === 'Em Produção').length;
    const ym = currentYearMonthBR();
    const doneMonth = productionSchedules.filter((s) => s.status === 'Concluído' && s.createdAt.startsWith(ym)).length;
    const queuedOrders =
      orders.filter((o) => { const st = statusByPedidoId.get(o.id)?.status_atual; return st ? st === 'liberado_producao' : ['Liberado p/ Produção', 'Em Carregamento'].includes(o.status); }).length +
      supportOrders.filter((o) => { const st = statusByPedidoId.get(o.id)?.status_atual; return st ? st === 'liberado_producao' : ['Liberado p/ Produção', 'Em Carregamento'].includes(o.status); }).length;
    return { awaiting, doing, doneMonth, queuedOrders };
  }, [orders, productionSchedules, supportOrders]);

  const sortedSchedules = useMemo(() => {
    return [...productionSchedules].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [productionSchedules]);

  const refreshConcluidos = async () => {
    setLoadingConcluidos(true);
    const rows = await listProducaoConcluidos();
    setConcluidos(rows);
    setLoadingConcluidos(false);
  };

  useEffect(() => {
    void refreshConcluidos();
  }, []);

  const concluidosCarregamentoIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of concluidos) {
      if (r?.embarque_id) s.add(String(r.embarque_id));
    }
    return s;
  }, [concluidos]);

  const pendingSchedules = useMemo(() => {
    return sortedSchedules.filter((s) => !concluidosCarregamentoIds.has(s.id));
  }, [sortedSchedules, concluidosCarregamentoIds]);

  const concludedSchedules = useMemo(() => {
    const unique = Array.from(concluidosCarregamentoIds);
    let list = unique
      .map((carregamentoId) => ({
        carregamentoId,
        schedule: productionSchedules.find((s) => s.id === carregamentoId) || null,
        row: concluidos.find((r) => r.embarque_id === carregamentoId) || null,
      }))
      .filter((x) => x.carregamentoId);

    if (qConcluidoPedido.trim()) {
      const q = qConcluidoPedido.toLowerCase().trim();
      list = list.filter((x) => {
        const ids = x.schedule?.orderIds || (x.row?.pedido_id ? [x.row.pedido_id] : []);
        return ids.some((id: string) => String(id).toLowerCase().includes(q));
      });
    }

    if (qConcluidoMotorista.trim()) {
      const q = qConcluidoMotorista.toLowerCase().trim();
      list = list.filter((x) => {
        const load = loads.find((l) => l.id === x.carregamentoId);
        const driverId = load?.driverId || x.row?.motorista_id;
        const driverName = driverId ? drivers.find((d) => d.id === driverId)?.name : '';
        return String(driverName || '').toLowerCase().includes(q);
      });
    }

    if (dateFrom) {
      list = list.filter((x) => {
        const date = x.schedule?.plannedDate || (x.row?.data_conclusao ? String(x.row.data_conclusao).slice(0, 10) : '');
        return date >= dateFrom;
      });
    }
    if (dateTo) {
      list = list.filter((x) => {
        const date = x.schedule?.plannedDate || (x.row?.data_conclusao ? String(x.row.data_conclusao).slice(0, 10) : '');
        return date <= dateTo;
      });
    }

    return list;
  }, [concluidosCarregamentoIds, concluidos, productionSchedules, qConcluidoPedido, qConcluidoMotorista, dateFrom, dateTo, loads, drivers]);

  // --- Pending table: text getters, sort getters, pipeline ---
  const pendingTextGetters = useMemo(() => [
    (s: ProductionSchedule) => s.num,
    (s: ProductionSchedule) => s.plannedDate,
    (s: ProductionSchedule) => s.createdBy,
    (s: ProductionSchedule) => s.status,
  ], []);

  const pendingSortGetters = useMemo(() => ({
    num: (s: ProductionSchedule) => s.num,
    plannedDate: (s: ProductionSchedule) => s.plannedDate,
    qtdPedidos: (s: ProductionSchedule) => s.orderIds?.length || 0,
    valorTotal: (s: ProductionSchedule) => scheduleTotal(erpValorMap, s.orderIds),
    createdBy: (s: ProductionSchedule) => s.createdBy,
    status: (s: ProductionSchedule) => s.status,
  }), [orders, supportOrders]);

  const visiblePending = useMemo(() => {
    const filtered = pendingFilter.filterItems(
      pendingSchedules,
      pendingTextGetters,
      (s) => s.status,
    );
    return pendingSort.sortItems(filtered, pendingSortGetters);
  }, [pendingSchedules, pendingFilter, pendingTextGetters, pendingSort, pendingSortGetters]);

  // --- Concluded table: text getters, sort getters, pipeline ---
  const concludedTextGetters = useMemo(() => [
    (x: ConcludedItem) => x.schedule?.num || x.carregamentoId,
    (x: ConcludedItem) => x.schedule?.plannedDate || (x.row?.data_conclusao ? String(x.row.data_conclusao).slice(0, 10) : ''),
    (x: ConcludedItem) => x.schedule?.createdBy || (x.row?.criado_por ? String(x.row.criado_por) : ''),
    (x: ConcludedItem) => x.schedule?.status || 'Concluído',
  ], []);

  const concludedSortGetters = useMemo(() => ({
    num: (x: ConcludedItem) => x.schedule?.num || x.carregamentoId,
    plannedDate: (x: ConcludedItem) => x.schedule?.plannedDate || (x.row?.data_conclusao ? String(x.row.data_conclusao).slice(0, 10) : ''),
    qtdPedidos: (x: ConcludedItem) => x.schedule?.orderIds?.length || 0,
    valorTotal: (x: ConcludedItem) => x.schedule ? scheduleTotal(erpValorMap, x.schedule.orderIds) : 0,
    createdBy: (x: ConcludedItem) => x.schedule?.createdBy || (x.row?.criado_por ? String(x.row.criado_por) : ''),
    status: (x: ConcludedItem) => x.schedule?.status || 'Concluído',
  }), [orders, supportOrders]);

  const visibleConcluded = useMemo(() => {
    const filtered = concludedFilter.filterItems(
      concludedSchedules,
      concludedTextGetters,
    );
    return concludedSort.sortItems(filtered, concludedSortGetters);
  }, [concludedSchedules, concludedFilter, concludedTextGetters, concludedSort, concludedSortGetters]);

  const details = useMemo(
    () => productionSchedules.find((s) => s.id === detailsId) || null,
    [detailsId, productionSchedules],
  );

  const detailsOrders = useMemo(() => {
    if (!details) return [];
    const list: Array<{ id: string; representativeName: string; items: { name: string; quantity: number; unitPrice: number }[]; status: string; note: string }> = [];
    for (const id of details.orderIds || []) {
      const o = orders.find((x) => x.id === id);
      if (o) {
        list.push({ id: o.id, representativeName: o.representativeName || '-', items: o.items, status: o.status, note: o.notes || '' });
        continue;
      }
      const s = supportOrders.find((x) => x.id === id);
      if (s) {
        list.push({ id: s.id, representativeName: s.representativeName, items: s.items, status: s.status, note: s.obs || '' });
      }
    }
    return list;
  }, [details, orders, supportOrders]);

  const editing = useMemo(
    () => productionSchedules.find((s) => s.id === editId) || null,
    [editId, productionSchedules],
  );

  const canEditOrders = editing?.status === 'Aguardando Início';

  const editEligibleOrders = useMemo(() => {
    if (!editing) return [];

    const sale = orders.filter((o) => {
      if ((editing.orderIds || []).includes(o.id)) return true;
      return isLiberadoProducao(o) && !o.carregamentoId;
    });
    const sup = supportOrders.filter((o) => {
      if ((editing.orderIds || []).includes(o.id)) return true;
      return isLiberadoProducao(o) && !o.carregamentoId;
    });

    return [...sale, ...sup].sort((a, b) => a.id.localeCompare(b.id));
  }, [editing, orders, supportOrders, statusByPedidoId]);

  useEffect(() => {
    const onAfterPrint = () => setPrintId(null);
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, []);

  useEffect(() => {
    if (!printId) return;
    const t = window.setTimeout(() => window.print(), 100);
    return () => window.clearTimeout(t);
  }, [printId]);

  const resetCreate = () => {
    setPlannedDate(todayBR());
    setObs('');
    setSelected([]);
  };

  const saveAvulso = () => {
    if (selected.length === 0) return;
    createProductionSchedule({ plannedDate, obs, orderIds: selected, kind: 'AVL' });
    setOpenCreate(false);
    resetCreate();
  };

  const openEditSchedule = (s: ProductionSchedule) => {
    setEditId(s.id);
    setEditPlannedDate(s.plannedDate);
    setEditObs(s.obs || '');
    setEditSelected([...(s.orderIds || [])]);
    setOpenEdit(true);
  };

  const saveEdit = () => {
    if (!editing) return;

    if (canEditOrders) {
      updateProductionSchedule(editing.id, { plannedDate: editPlannedDate, obs: editObs, orderIds: editSelected });
    } else {
      updateProductionSchedule(editing.id, { plannedDate: editPlannedDate, obs: editObs });
    }

    setOpenEdit(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Produção</h1>
          <p className="text-sm text-muted-foreground">Cronogramas e fila de produção</p>
        </div>
        <button className={btnPrimary} onClick={() => setOpenCreate(true)}>
          <Plus className="h-4 w-4" />
          Montar Produção Avulsa
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 no-print">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Aguardando Início</p>
          <p className="text-2xl font-bold mt-1">{summary.awaiting}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Em Produção Agora</p>
          <p className="text-2xl font-bold mt-1">{summary.doing}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Concluídos no Mês</p>
          <p className="text-2xl font-bold mt-1">{summary.doneMonth}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Pedidos na Fila</p>
          <p className="text-2xl font-bold mt-1">{summary.queuedOrders}</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-x-auto no-print">
        <div className="p-4 border-b border-border space-y-4">
          <h2 className="text-sm font-bold font-display uppercase tracking-wider text-foreground">Carregamentos Pendentes</h2>
          <QuickFilterBar
            query={pendingFilter.query}
            onQueryChange={pendingFilter.setQuery}
            placeholder="Buscar pendentes..."
            statuses={pendingStatusButtons}
            activeStatus={pendingFilter.activeStatus}
            onStatusChange={pendingFilter.setActiveStatus}
          />
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <SortableHeader columnKey="num" sortState={pendingSort.sortState} onToggle={pendingSort.toggleSort} className="text-left">Nº</SortableHeader>
              <SortableHeader columnKey="plannedDate" sortState={pendingSort.sortState} onToggle={pendingSort.toggleSort} className="text-left">Data Prevista</SortableHeader>
              <SortableHeader columnKey="qtdPedidos" sortState={pendingSort.sortState} onToggle={pendingSort.toggleSort} className="text-right">Qtd Pedidos</SortableHeader>
              <SortableHeader columnKey="valorTotal" sortState={pendingSort.sortState} onToggle={pendingSort.toggleSort} className="text-right">Valor Total</SortableHeader>
              <SortableHeader columnKey="createdBy" sortState={pendingSort.sortState} onToggle={pendingSort.toggleSort} className="text-left">Enviado por</SortableHeader>
              <SortableHeader columnKey="status" sortState={pendingSort.sortState} onToggle={pendingSort.toggleSort} className="text-left">Status</SortableHeader>
              <th className="text-right py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {visiblePending.map((s) => {
              const overdue = isOverdue(s.plannedDate, s.status);
              const total = scheduleTotal(erpValorMap, s.orderIds);
              return (
                <tr
                  key={s.id}
                  className={
                    overdue
                      ? 'bg-orange-50 hover:bg-orange-100/40 transition-colors'
                      : 'hover:bg-muted/20 transition-colors'
                  }
                >
                  <td className="py-3 px-4 font-mono-data font-bold text-primary">{s.num}</td>
                  <td className="py-3 px-4 font-mono-data text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {fmtDate(s.plannedDate)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono-data">{s.orderIds?.length || 0}</td>
                  <td className="py-3 px-4 text-right font-mono-data font-bold">{formatCurrency(total)}</td>
                  <td className="py-3 px-4 font-mono-data">{s.createdBy}</td>
                  <td className="py-3 px-4">
                    <span
                      className={
                        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ' +
                        (overdue ? 'bg-orange-100 text-orange-700' : 'bg-muted text-foreground')
                      }
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setDetailsId(s.id);
                          setOpenDetails(true);
                        }}
                        title="Ver detalhes"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        onClick={() => openEditSchedule(s)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {s.status === 'Aguardando Início' && (
                        <button
                          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          onClick={() => startProductionSchedule(s.id)}
                          title="Iniciar"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      )}
                      {s.status === 'Em Produção' && (
                        <button
                          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          onClick={async () => {
                            await concludeProductionSchedule(s.id);
                            const load = loads.find((l) => l.id === s.id);
                            await insertProducaoConcluido({
                              embarque_id: s.id,
                              motorista_id: load?.driverId || null,
                              criado_por: user?.username || null,
                            });
                            await refreshConcluidos();
                          }}
                          title="Concluir"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        onClick={() => setPrintId(s.id)}
                        title="Imprimir"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visiblePending.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted-foreground">Nenhum carregamento pendente.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-x-auto no-print">
        <div className="p-4 border-b border-border space-y-4">
          <h2 className="text-sm font-bold font-display uppercase tracking-wider text-foreground">Carregamentos Concluídos</h2>
          <QuickFilterBar
            query={concludedFilter.query}
            onQueryChange={concludedFilter.setQuery}
            placeholder="Buscar concluídos..."
          >
            <ActiveFiltersChips
              fields={filterFields}
              conditions={conditions}
              onRemove={(id) => setConditions((prev) => prev.filter((c) => c.id !== id))}
              onClear={() => setConditions([])}
              className="flex-1"
            />
            <FilterTriggerButton count={conditions.length} onClick={() => setFiltersOpen(true)} />
          </QuickFilterBar>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <SortableHeader columnKey="num" sortState={concludedSort.sortState} onToggle={concludedSort.toggleSort} className="text-left">Nº</SortableHeader>
              <SortableHeader columnKey="plannedDate" sortState={concludedSort.sortState} onToggle={concludedSort.toggleSort} className="text-left">Data</SortableHeader>
              <SortableHeader columnKey="qtdPedidos" sortState={concludedSort.sortState} onToggle={concludedSort.toggleSort} className="text-right">Qtd Pedidos</SortableHeader>
              <SortableHeader columnKey="valorTotal" sortState={concludedSort.sortState} onToggle={concludedSort.toggleSort} className="text-right">Valor Total</SortableHeader>
              <SortableHeader columnKey="createdBy" sortState={concludedSort.sortState} onToggle={concludedSort.toggleSort} className="text-left">Enviado por</SortableHeader>
              <SortableHeader columnKey="status" sortState={concludedSort.sortState} onToggle={concludedSort.toggleSort} className="text-left">Status</SortableHeader>
              <th className="text-right py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {loadingConcluidos && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted-foreground">Carregando...</td>
              </tr>
            )}
            {!loadingConcluidos && visibleConcluded.map((x) => {
              const s = x.schedule;
              const total = s ? scheduleTotal(erpValorMap, s.orderIds) : 0;
              const planned = s?.plannedDate || (x.row?.data_conclusao ? String(x.row.data_conclusao).slice(0, 10) : todayBR());
              return (
                <tr key={x.carregamentoId} className="hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-4 font-mono-data font-bold text-primary">{s?.num || x.carregamentoId}</td>
                  <td className="py-3 px-4 font-mono-data text-muted-foreground">
                    <span className="inline-flex items-center gap-2"><Calendar className="h-4 w-4" />{fmtDate(planned)}</span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono-data">{s?.orderIds.length || '-'}</td>
                  <td className="py-3 px-4 text-right font-mono-data font-bold">{formatCurrency(total)}</td>
                  <td className="py-3 px-4 font-mono-data">{s?.createdBy || (x.row?.criado_por ? String(x.row.criado_por) : '-')}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-status-success/15 text-status-success">Concluído</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      {s && (
                        <button
                          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setDetailsId(s.id);
                            setOpenDetails(true);
                          }}
                          title="Ver detalhes"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-orange-600"
                        onClick={async () => {
                          await desfazerProducaoConcluido(x.carregamentoId);
                          if (s) updateProductionSchedule(s.id, { status: 'Em Produção' });
                          await refreshConcluidos();
                        }}
                        title="Desfazer OK"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      {s && (
                        <button
                          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          onClick={() => setPrintId(s.id)}
                          title="Imprimir"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loadingConcluidos && visibleConcluded.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted-foreground">Nenhum carregamento concluído encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={openDetails && Boolean(details)}
        onClose={() => setOpenDetails(false)}
        title={details ? `Cronograma — ${details.num}` : 'Cronograma'}
        wide
      >
        {details && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-muted/20 rounded-xl border border-border p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Data Prevista</p>
                <p className="mt-1 font-semibold">{fmtDate(details.plannedDate)}</p>
              </div>
              <div className="bg-muted/20 rounded-xl border border-border p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Enviado por</p>
                <p className="mt-1 font-mono-data font-semibold">{details.createdBy}</p>
              </div>
              <div className="bg-muted/20 rounded-xl border border-border p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Emitido em</p>
                <p className="mt-1 font-mono-data font-semibold">{fmtDate(details.createdAt)}</p>
              </div>
              <div className="bg-muted/20 rounded-xl border border-border p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Status</p>
                <p className="mt-1 font-semibold">{details.status}</p>
              </div>
            </div>

            <div className="bg-muted/20 rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Observações</p>
              <p className="mt-2 text-sm whitespace-pre-wrap">{details.obs || '-'}</p>
            </div>

            <div className="bg-card rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Nº Pedido</th>
                    <th className="text-left py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Representante</th>
                    <th className="text-right py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Itens</th>
                    <th className="text-right py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Valor</th>
                    <th className="text-left py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {detailsOrders.map((o) => (
                    <tr key={o.id}>
                      <td className="py-3 px-4 font-mono-data font-bold text-primary">{o.id}</td>
                      <td className="py-3 px-4">{o.representativeName}</td>
                      <td className="py-3 px-4 text-right font-mono-data">{o.items.length}</td>
                      <td className="py-3 px-4 text-right font-mono-data font-bold">{formatCurrency(calcItemsTotal(o.items))}</td>
                      <td className="py-3 px-4">{o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button className={btnSecondary} onClick={() => setOpenDetails(false)}>Fechar</button>
              <button
                className={btnSecondary}
                onClick={() => {
                  setOpenDetails(false);
                  openEditSchedule(details);
                }}
              >
                Editar
              </button>
              {details.status === 'Aguardando Início' && (
                <button className={btnPrimary} onClick={() => startProductionSchedule(details.id)}>Iniciar Produção</button>
              )}
              {details.status === 'Em Produção' && (
                <button
                  className={btnPrimary}
                  onClick={async () => {
                    await concludeProductionSchedule(details.id);
                    const load = loads.find((l) => l.id === details.id);
                    await insertProducaoConcluido({
                      embarque_id: details.id,
                      motorista_id: load?.driverId || null,
                      criado_por: user?.username || null,
                    });
                    await refreshConcluidos();
                  }}
                >
                  Concluir Produção
                </button>
              )}
              <button className={btnPrimary} onClick={() => setPrintId(details.id)}>Imprimir Cronograma</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={openEdit && Boolean(editing)}
        onClose={() => setOpenEdit(false)}
        title={editing ? `Editar Cronograma — ${editing.num}` : 'Editar Cronograma'}
        wide
      >
        {editing && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium font-display text-foreground">Data Prevista</label>
                <input
                  type="date"
                  className={inputClass + ' mt-1'}
                  value={editPlannedDate}
                  onChange={(e) => setEditPlannedDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium font-display text-foreground">Enviado por</label>
                <div className={inputClass + ' mt-1'}>{editing.createdBy}</div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium font-display text-foreground">Observações</label>
              <textarea className={inputClass + ' mt-1'} rows={3} value={editObs} onChange={(e) => setEditObs(e.target.value)} />
            </div>

            {/* Pedidos já incluídos no cronograma */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Pedidos incluídos ({editSelected.length})</p>
                {!canEditOrders && (
                  <p className="text-xs text-muted-foreground">Lista bloqueada após início.</p>
                )}
              </div>
              <div className="bg-card rounded-xl border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {canEditOrders && <th className="text-left py-2 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Remover</th>}
                      <th className="text-left py-2 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Pedido</th>
                      <th className="text-left py-2 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Cliente</th>
                      <th className="text-right py-2 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Valor</th>
                      <th className="text-right py-2 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Qtd Kits</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {editEligibleOrders.filter(o => editSelected.includes(o.id)).map((o) => (
                      <tr key={o.id} className="bg-primary/5">
                        {canEditOrders && (
                          <td className="py-2 px-4">
                            <input type="checkbox" checked onChange={() => setEditSelected(prev => prev.filter(x => x !== o.id))} />
                          </td>
                        )}
                        <td className="py-2 px-4 font-mono-data font-bold text-primary">{o.id}</td>
                        <td className="py-2 px-4">{('clientName' in o ? o.clientName : null) || ('clientCode' in o ? o.clientCode : null) || '-'}</td>
                        <td className="py-2 px-4 text-right font-mono-data">{formatCurrency(erpValorMap.get(o.id) || 0)}</td>
                        <td className="py-2 px-4 text-right font-mono-data">{'totalQtd' in o ? (o.totalQtd || '-') : '-'}</td>
                      </tr>
                    ))}
                    {editSelected.length === 0 && (
                      <tr><td colSpan={canEditOrders ? 5 : 4} className="py-6 text-center text-muted-foreground text-xs">Nenhum pedido incluído.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pedidos disponíveis para adicionar */}
            {canEditOrders && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">Adicionar pedidos</p>
                <div className="bg-card rounded-xl border border-border overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0">
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left py-2 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Adicionar</th>
                        <th className="text-left py-2 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Pedido</th>
                        <th className="text-left py-2 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Cliente</th>
                        <th className="text-right py-2 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Valor</th>
                        <th className="text-right py-2 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Qtd Kits</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {editEligibleOrders.filter(o => !editSelected.includes(o.id)).map((o) => (
                        <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                          <td className="py-2 px-4">
                            <input type="checkbox" checked={false} onChange={() => setEditSelected(prev => [...prev, o.id])} />
                          </td>
                          <td className="py-2 px-4 font-mono-data font-bold text-primary">{o.id}</td>
                          <td className="py-2 px-4">{('clientName' in o ? o.clientName : null) || ('clientCode' in o ? o.clientCode : null) || '-'}</td>
                          <td className="py-2 px-4 text-right font-mono-data">{formatCurrency(erpValorMap.get(o.id) || 0)}</td>
                          <td className="py-2 px-4 text-right font-mono-data">{'totalQtd' in o ? (o.totalQtd || '-') : '-'}</td>
                        </tr>
                      ))}
                      {editEligibleOrders.filter(o => !editSelected.includes(o.id)).length === 0 && (
                        <tr><td colSpan={5} className="py-6 text-center text-muted-foreground text-xs">Nenhum pedido disponível para adicionar.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button className={btnDanger} onClick={() => setOpenEdit(false)}>
                Cancelar
              </button>
              <button className={btnPrimary} onClick={saveEdit} disabled={canEditOrders && editSelected.length === 0}>
                Salvar
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={openCreate} onClose={() => setOpenCreate(false)} title="Montar Produção Avulsa" wide>
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium font-display text-foreground">Data Prevista</label>
              <input type="date" className={inputClass + ' mt-1'} value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium font-display text-foreground">Criado por</label>
              <div className={inputClass + ' mt-1'}>{user?.username || '-'}</div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium font-display text-foreground">Observações</label>
            <textarea className={inputClass + ' mt-1'} rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
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
                {eligibleOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={selected.includes(o.id)}
                        onChange={() =>
                          setSelected((prev) =>
                            prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id],
                          )
                        }
                      />
                    </td>
                    <td className="py-3 px-4 font-mono-data font-bold text-primary">{o.id}</td>
                    <td className="py-3 px-4">{'representativeName' in o ? (o.representativeName || '-') : '-'}</td>
                    <td className="py-3 px-4 text-right font-mono-data font-bold">{formatCurrency(erpValorMap.get(o.id) || 0)}</td>
                  </tr>
                ))}
                {eligibleOrders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-muted-foreground">Nenhum pedido liberado para produção.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button className={btnDanger} onClick={() => setOpenCreate(false)}>Cancelar</button>
            <button className={btnPrimary} onClick={saveAvulso}>Salvar</button>
          </div>
        </div>
      </Modal>

      {printId && (
        <div className="print-only">
          {(() => {
            const s = productionSchedules.find((x) => x.id === printId);
            if (!s) return null;
            const sOrders = (s.orderIds || [])
              .map((id) => {
                const o = orders.find((x) => x.id === id);
                if (o) return { id: o.id, representativeName: o.representativeName || '-', items: o.items, note: o.notes || '' };
                const sup = supportOrders.find((x) => x.id === id);
                if (sup) return { id: sup.id, representativeName: sup.representativeName, items: sup.items, note: sup.obs || '' };
                return null;
              })
              .filter(Boolean) as Array<{ id: string; representativeName: string; items: { name: string; quantity: number; unitPrice: number }[]; note: string }>;
            const total = scheduleTotal(erpValorMap, s.orderIds);
            return (
              <div className="p-8">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-lg font-bold">CONCREM — Portas Premium</div>
                    <div className="text-sm font-semibold mt-1">CRONOGRAMA DE PRODUÇÃO</div>
                  </div>
                  <div className="text-right text-sm">
                    <div><span className="font-semibold">Nº:</span> {s.num}</div>
                    <div><span className="font-semibold">Data Prevista:</span> {fmtDate(s.plannedDate)}</div>
                    <div><span className="font-semibold">Enviado por:</span> {s.createdBy}</div>
                    <div><span className="font-semibold">Emitido em:</span> {fmtDate(new Date().toISOString())}</div>
                  </div>
                </div>

                <div className="mt-6 border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="text-left py-2 px-3">Nº Pedido</th>
                        <th className="text-left py-2 px-3">Representante</th>
                        <th className="text-right py-2 px-3">Qtd Itens</th>
                        <th className="text-left py-2 px-3">Observação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sOrders.map((o) => (
                        <tr key={o.id} className="border-b border-border/50">
                          <td className="py-2 px-3 font-mono-data font-semibold">{o.id}</td>
                          <td className="py-2 px-3">{o.representativeName || '-'}</td>
                          <td className="py-2 px-3 text-right font-mono-data">{o.items.length}</td>
                          <td className="py-2 px-3">{o.note || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6">
                  <div className="text-sm"><span className="font-semibold">Observações Gerais:</span> {s.obs || '—'}</div>
                  <div className="text-sm mt-1">
                    <span className="font-semibold">Total de Pedidos:</span> {s.orderIds?.length || 0} · <span className="font-semibold">Valor Total:</span> {formatCurrency(total)}
                  </div>
                </div>

                <div className="mt-10 grid grid-cols-2 gap-12">
                  <div>
                    <div className="border-b border-foreground/40 h-10" />
                    <div className="text-xs text-muted-foreground mt-2">Assinatura Produção</div>
                  </div>
                  <div>
                    <div className="border-b border-foreground/40 h-10" />
                    <div className="text-xs text-muted-foreground mt-2">Assinatura Supervisão</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

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

export default Producao;
