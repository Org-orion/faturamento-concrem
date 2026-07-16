import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { can } from '@/utils/access';
import Modal from '@/components/Modal';
import { btnPrimary, btnSecondary, btnDanger, formatCurrency, inputClass } from '@/components/shared';
import { getValorTotalPedido } from '@/lib/valorPedido';
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
import logoProgramacao from '@/assets/logo-programacao.png';

function calcItemsTotal(items: { quantity: number; unitPrice: number }[]) {
  return items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
}

function scheduleTotal(erpValorMap: Map<string, number>, orderIds?: string[]) {
  if (!orderIds) return 0;
  return orderIds.reduce((s, id) => s + (erpValorMap.get(id) || 0), 0);
}

const ERP_TABLE = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';

type ErpMaps = { valorMap: Map<string, number>; clienteMap: Map<string, string>; qtdMap: Map<string, number | null>; previsaoMap: Map<string, string> };

async function fetchErpValores(ids: string[]): Promise<ErpMaps> {
  const valorMap = new Map<string, number>();
  const clienteMap = new Map<string, string>();
  const qtdMap = new Map<string, number | null>();
  const previsaoMap = new Map<string, string>();
  if (!supabasePedidos || !ids.length) return { valorMap, clienteMap, qtdMap, previsaoMap };
  const unique = [...new Set(ids)];
  const BATCH = 200;
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += BATCH) chunks.push(unique.slice(i, i + BATCH));
  const results = await Promise.all(
    chunks.map(batch =>
      supabasePedidos!.from(ERP_TABLE).select('numero_pedido, total_pedido_venda, id_nota_conf, cliente_nome, total_qtd, previsao_embarque').in('numero_pedido', batch).then(({ data }) => data || [])
    )
  );
  for (const row of results.flat()) {
    const key = String(row.numero_pedido);
    valorMap.set(key, getValorTotalPedido(row));
    clienteMap.set(key, String(row.cliente_nome || ''));
    qtdMap.set(key, row.total_qtd != null ? Number(row.total_qtd) : null);
    if (row.previsao_embarque) previsaoMap.set(key, String(row.previsao_embarque).slice(0, 10));
  }
  return { valorMap, clienteMap, qtdMap, previsaoMap };
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
    revertProductionSchedule,
    concludeProductionSchedule,
    user,
  } = useApp();

  const canCriarAvulsa     = can(user, 'producao.criar_avulsa',      'producao', 'execute');
  const canIniciar         = can(user, 'producao.iniciar',           'producao', 'execute');
  const canConcluir        = can(user, 'producao.concluir',          'producao', 'execute');
  const canReverter        = can(user, 'producao.reverter',          'producao', 'execute');
  const canDesfazerConc    = can(user, 'producao.desfazer_conclusao','producao', 'execute');
  const canImprimir        = can(user, 'producao.imprimir',          'producao', 'view');

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
      .is('excluido_em', null) // ignora pedidos na lixeira
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

  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const toggleBulk = (id: string) => setBulkSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });


  const [erpValorMap, setErpValorMap] = useState<Map<string, number>>(new Map());
  const [erpClienteMap, setErpClienteMap] = useState<Map<string, string>>(new Map());
  const [erpQtdMap, setErpQtdMap] = useState<Map<string, number | null>>(new Map());
  const [erpPrevisaoMap, setErpPrevisaoMap] = useState<Map<string, string>>(new Map());

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
    fetchErpValores(allIds).then(({ valorMap, clienteMap, qtdMap, previsaoMap }) => {
      setErpValorMap(valorMap);
      setErpClienteMap(clienteMap);
      setErpQtdMap(qtdMap);
      setErpPrevisaoMap(previsaoMap);
    });
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

  const allPendingSelected = visiblePending.length > 0 && visiblePending.every(s => bulkSelected.has(s.id));
  const toggleAllPending = () => {
    if (allPendingSelected) {
      setBulkSelected(prev => { const next = new Set(prev); visiblePending.forEach(s => next.delete(s.id)); return next; });
    } else {
      setBulkSelected(prev => { const next = new Set(prev); visiblePending.forEach(s => next.add(s.id)); return next; });
    }
  };
  const printBulk = () => openPrintWindow(visiblePending.filter(s => bulkSelected.has(s.id)));

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
    const editingIdSet = new Set((editing.orderIds || []).map(String));

    const sale = orders.filter((o) => {
      if (editingIdSet.has(String(o.id))) return true;
      return isLiberadoProducao(o) && !o.carregamentoId;
    });
    const sup = supportOrders.filter((o) => {
      if (editingIdSet.has(String(o.id))) return true;
      return isLiberadoProducao(o) && !o.carregamentoId;
    });

    return [...sale, ...sup].sort((a, b) => a.id.localeCompare(b.id));
  }, [editing, orders, supportOrders, statusByPedidoId]);

  const buildCronogramaBlock = (s: ProductionSchedule, fmtCurrency: (v: number) => string, fmtDateLocal: (iso: string) => string) => {
    let totalValor = 0;
    let totalQtd = 0;
    const rows = (s.orderIds || []).map((rawId) => {
      const id = String(rawId);
      const valor = erpValorMap.get(id) || 0;
      const cliente = erpClienteMap.get(id) || '-';
      const qtdRaw = erpQtdMap.get(id);
      const previsao = erpPrevisaoMap.get(id);
      totalValor += valor;
      totalQtd += qtdRaw != null ? qtdRaw : 0;
      return `<tr>
        <td style="font-weight:700">${id}</td>
        <td>${cliente}</td>
        <td style="text-align:center">${qtdRaw != null ? qtdRaw : '-'}</td>
        <td style="text-align:right">${fmtCurrency(valor)}</td>
        <td style="text-align:center">${previsao ? fmtDateLocal(previsao) : '-'}</td>
      </tr>`;
    }).join('');

    const orderCount = (s.orderIds || []).length;
    const showTotal = orderCount > 1;

    return `<div class="schedule-block">
  <div class="schedule-id">
    <span class="schedule-num">${s.num}</span>
    <span>Prev. ${fmtDateLocal(s.plannedDate)}</span>
    <span>por ${s.createdBy}</span>
    <span>${orderCount} pedido(s)</span>
    ${showTotal ? `<span style="margin-left:auto">${fmtCurrency(totalValor)}</span>` : ''}
  </div>
  <table>
    <thead><tr>
      <th style="text-align:left">Nº Pedido</th>
      <th style="text-align:left">Cliente</th>
      <th style="text-align:center">Qtd Kits</th>
      <th style="text-align:right">Valor</th>
      <th style="text-align:center">Prev. Embarque</th>
    </tr></thead>
    <tbody>${rows}${showTotal ? `<tr class="total-row">
      <td colspan="2" style="text-align:right">TOTAL</td>
      <td style="text-align:center">${totalQtd || '-'}</td>
      <td style="text-align:right">${fmtCurrency(totalValor)}</td>
      <td></td>
    </tr>` : ''}</tbody>
  </table>
  ${s.obs ? `<div class="obs-row">Obs.: ${s.obs}</div>` : ''}
</div>`;
  };

  const openPrintWindow = (schedules: ProductionSchedule[]) => {
    if (!schedules.length) return;
    const now = new Date();
    const fmtCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    const fmtDateLocal = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('pt-BR');
    const emissao = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    const blocks = schedules.map(s => buildCronogramaBlock(s, fmtCurrency, fmtDateLocal)).join('\n');

    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Cronograma de Produção</title>
<style>
  @page { size: A4 portrait; margin: 12mm 14mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; font-size: 11px; }

  /* Outer wrapper table — thead repeats natively on every printed page */
  .outer { width: 100%; border-collapse: collapse; }
  .outer thead td { padding-bottom: 10px; border-bottom: 3px solid #0a2315; }
  .outer tbody > tr > td { padding-top: 8px; vertical-align: top; }
  .page-header { display: flex; align-items: center; justify-content: space-between; }
  .page-header img { height: 44px; }
  .page-header .ph-title { text-align: right; }
  .page-header .ph-title h1 { font-size: 15px; color: #0a2315; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
  .page-header .ph-title p { font-size: 9px; color: #888; margin-top: 2px; }

  /* Per-schedule compact identifier */
  .schedule-block { margin-bottom: 14px; }
  .schedule-id {
    display: flex; align-items: center; gap: 14px;
    background: #f0f5f0; border-left: 4px solid #0a2315;
    padding: 5px 10px; margin-bottom: 3px;
    font-size: 10px; color: #333;
  }
  .schedule-num { font-weight: 800; font-size: 11px; color: #0a2315; }

  table { width: 100%; border-collapse: collapse; }
  thead th { background: #0a2315; color: #fff; padding: 6px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; white-space: nowrap; }
  tbody td { padding: 5px 10px; border-bottom: 1px solid #e0e0e0; font-size: 11px; }
  tbody tr:nth-child(even) { background: #f5f7f5; }
  .total-row td { padding: 7px 10px; font-weight: 800; font-size: 11px; border-top: 2px solid #0a2315; background: #f0f2f0; white-space: nowrap; }
  .obs-row { margin-top: 6px; padding: 6px 10px; background: #fff5f5; border-left: 4px solid #dc2626; border-radius: 3px; font-size: 10px; color: #dc2626; font-weight: 600; }

  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
<script>window.onload = () => { window.focus(); window.print(); };</script>
</head><body>
<table class="outer">
  <thead>
    <tr><td>
      <div class="page-header">
        <img src="${logoProgramacao}" alt="Concrem" />
        <div class="ph-title">
          <h1>Cronograma de Produção</h1>
          <p>Emissão: ${emissao} &nbsp;·&nbsp; ${schedules.length} carregamento(s)</p>
        </div>
      </div>
    </td></tr>
  </thead>
  <tbody>
    <tr><td>${blocks}</td></tr>
  </tbody>
</table>
</body></html>`;

    const w = window.open('', '_blank', 'width=1000,height=700');
    if (!w) return;
    w.document.open();
    w.document.write(fullHtml);
    w.document.close();
  };

  const handlePrintCronograma = (s: ProductionSchedule) => openPrintWindow([s]);

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
    setEditSelected([...(s.orderIds || [])].map(String));
    setOpenEdit(true);
  };

  const saveEdit = () => {
    if (!editing) return;
    updateProductionSchedule(editing.id, { plannedDate: editPlannedDate, obs: editObs });
    setOpenEdit(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Produção</h1>
          <p className="text-sm text-muted-foreground">Cronogramas e fila de produção</p>
        </div>
        {canCriarAvulsa && (
          <button className={btnPrimary} onClick={() => setOpenCreate(true)}>
            <Plus className="h-4 w-4" />
            Montar Produção Avulsa
          </button>
        )}
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
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-bold font-display uppercase tracking-wider text-foreground">Carregamentos Pendentes</h2>
            {bulkSelected.size > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{bulkSelected.size} selecionado(s)</span>
                <button
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
                  onClick={printBulk}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Imprimir selecionados
                </button>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={() => setBulkSelected(new Set())}
                >
                  Limpar
                </button>
              </div>
            )}
          </div>
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
              <th className="py-3 px-4 w-10">
                <input
                  type="checkbox"
                  checked={allPendingSelected}
                  onChange={toggleAllPending}
                  className="rounded border-border cursor-pointer"
                />
              </th>
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
                      : bulkSelected.has(s.id)
                        ? 'bg-primary/5 hover:bg-primary/10 transition-colors'
                        : 'hover:bg-muted/20 transition-colors'
                  }
                >
                  <td className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={bulkSelected.has(s.id)}
                      onChange={() => toggleBulk(s.id)}
                      className="rounded border-border cursor-pointer"
                    />
                  </td>
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
                      {canIniciar && s.status === 'Aguardando Início' && (
                        <button
                          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          onClick={() => startProductionSchedule(s.id)}
                          title="Iniciar"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      )}
                      {canConcluir && s.status === 'Em Produção' && (
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
                      {canImprimir && (
                        <button
                          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          onClick={() => handlePrintCronograma(s)}
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
            {visiblePending.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-muted-foreground">Nenhum carregamento pendente.</td>
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
                      {canDesfazerConc && (
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
                      )}
                      {canImprimir && s && (
                        <button
                          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          onClick={() => s && handlePrintCronograma(s)}
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
              {canIniciar && details.status === 'Aguardando Início' && (
                <button className={btnPrimary} onClick={() => startProductionSchedule(details.id)}>Iniciar Produção</button>
              )}
              {canConcluir && details.status === 'Em Produção' && (
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
              {canImprimir && (
                <button className={btnPrimary} onClick={() => handlePrintCronograma(details)}>Imprimir Cronograma</button>
              )}
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

            {/* Pedidos do cronograma — somente visualização */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">
                Pedidos incluídos ({(editing?.orderIds || []).length})
              </p>
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="overflow-y-auto max-h-72">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left py-2 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Pedido</th>
                        <th className="text-left py-2 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Cliente</th>
                        <th className="text-right py-2 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Valor</th>
                        <th className="text-right py-2 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Qtd Kits</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50 bg-card">
                      {(editing?.orderIds || []).map((rawId) => {
                        const id = String(rawId);
                        const clienteName = erpClienteMap.get(id) || '-';
                        const qtdRaw = erpQtdMap.get(id);
                        const qtdKits = qtdRaw != null ? qtdRaw : '-';
                        return (
                          <tr key={id} className="hover:bg-muted/20 transition-colors">
                            <td className="py-2 px-4 font-mono-data font-bold text-primary">{id}</td>
                            <td className="py-2 px-4">{clienteName}</td>
                            <td className="py-2 px-4 text-right font-mono-data">{formatCurrency(erpValorMap.get(id) || 0)}</td>
                            <td className="py-2 px-4 text-right font-mono-data">{qtdKits}</td>
                          </tr>
                        );
                      })}
                      {(editing?.orderIds || []).length === 0 && (
                        <tr><td colSpan={4} className="py-6 text-center text-muted-foreground text-xs">Nenhum pedido incluído.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              {canReverter && editing?.status === 'Em Produção' && (
                <button
                  className={btnSecondary}
                  onClick={() => { revertProductionSchedule(editing.id); setOpenEdit(false); }}
                >
                  <RotateCcw className="h-4 w-4" />
                  Reverter para Aguardando Início
                </button>
              )}
              <div className="flex gap-3 ml-auto">
                <button className={btnDanger} onClick={() => setOpenEdit(false)}>Cancelar</button>
                <button className={btnPrimary} onClick={saveEdit}>Salvar</button>
              </div>
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
