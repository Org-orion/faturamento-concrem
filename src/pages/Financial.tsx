import React, { useEffect, useMemo, useState } from 'react';
import { useApp, getDataCorte } from '@/contexts/AppContext';
import Modal from '@/components/Modal';
import { useToast } from '@/components/ToastProvider';
import { btnDanger, btnPrimary, btnSecondary, formatCurrency, getOrderTotal, inputClass } from '@/components/shared';
import { ExpenseType, FreightEntry, FreightEntryStatus, FreightExpenseLine, Load, Order } from '@/types';
import { CheckCircle2, Eye, Plus, Printer, Settings2, Edit, Trash2, AlertTriangle } from 'lucide-react';
import { useTableSort } from '@/hooks/useTableSort';
import { useQuickFilter } from '@/hooks/useQuickFilter';
import { useColumnFilters } from '@/hooks/useColumnFilters';
import { SortableHeader } from '@/components/table/SortableHeader';
import { QuickFilterBar } from '@/components/table/QuickFilterBar';
import { ColumnFilterRow, ColFilterSlot } from '@/components/table/ColumnFilterRow';
import { supabaseOps } from '@/lib/supabase';
import type { PedidoStatusRow } from '@/types';
import { todayBR, fmtDate, currentYearMonthBR } from '@/lib/dateUtils';

function sumExpenses(lines: FreightExpenseLine[]) {
  return lines.reduce((s, l) => s + (Number(l.value) || 0), 0);
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

const Financial = () => {
  const { orders, loads, drivers, freightEntries, expenseTypes, addExpenseType, updateExpenseType, addFreightEntry, updateFreightEntry, setFreightEntryStatus, deleteFreightEntry } = useApp();
  const { showToast } = useToast();

  const { sortState: sortPending, toggleSort: togglePending, sortItems: sortPendingItems } = useTableSort();
  const { query: qPending, setQuery: setQPending, filterItems: filterPendingItems } = useQuickFilter();
  const { sortState: sortLaunched, toggleSort: toggleLaunched, sortItems: sortLaunchedItems } = useTableSort();
  const { query: qLaunched, setQuery: setQLaunched, filterItems: filterLaunchedItems, activeStatus: activeLaunchedStatus, setActiveStatus: setActiveLaunchedStatus } = useQuickFilter();
  const colFilterPending = useColumnFilters();
  const colFilterLaunched = useColumnFilters();

  const [openTypes, setOpenTypes] = useState(false);
  const [openNew, setOpenNew] = useState(false);
  const [openDetails, setOpenDetails] = useState(false);
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [printId, setPrintId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeDesc, setNewTypeDesc] = useState('');
  const [newTypeActive, setNewTypeActive] = useState(true);

  // Fetch pedidos_status to detect loads where all orders are 'entregue'
  const [pedidoStatusRows, setPedidoStatusRows] = useState<PedidoStatusRow[]>([]);
  useEffect(() => {
    if (!supabaseOps) return;
    const isoCorte = getDataCorte(3);
    void supabaseOps.from('concrem_pedidos_status')
      .select('pedido_id, status_atual')
      .gte('atualizado_em', isoCorte)
      .limit(500)
      .then(({ data }) => {
        if (data) setPedidoStatusRows(data as PedidoStatusRow[]);
      });
  }, []);
  const pedidoStatusMap = useMemo(() => new Map(pedidoStatusRows.map(r => [r.pedido_id, r.status_atual])), [pedidoStatusRows]);

  // FreightEntry lookup by loadId (or orderId for backwards compat)
  const entryByLoadId = useMemo(() => {
    const m = new Map<string, FreightEntry>();
    for (const e of freightEntries) {
      const key = e.loadId || e.orderId;
      m.set(key, e);
    }
    return m;
  }, [freightEntries]);

  // A load is pending when: shipmentStatus === 'Entregue' OR all its orders have status 'entregue'
  // AND it has no FreightEntry yet
  const pendingLoads = useMemo(() => {
    return loads.filter(l => {
      if (entryByLoadId.has(l.id)) return false;
      if (l.orderIds.length === 0) return false;
      if (l.shipmentStatus === 'Entregue') return true;
      return l.orderIds.every(oid => pedidoStatusMap.get(oid) === 'entregue');
    });
  }, [loads, entryByLoadId, pedidoStatusMap]);

  // For backward compat: keep deliveredOrders/pendingOrders for the form dropdown
  const deliveredOrOrderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const l of loads) {
      if (l.shipmentStatus === 'Entregue' || l.orderIds.every(oid => pedidoStatusMap.get(oid) === 'entregue')) {
        for (const id of l.orderIds) ids.add(id);
      }
    }
    return ids;
  }, [loads, pedidoStatusMap]);

  const deliveredOrders = useMemo(
    () => orders.filter((o) => deliveredOrOrderIds.has(o.id)),
    [orders, deliveredOrOrderIds],
  );

  const pendingColSlots: ColFilterSlot[] = [
    { key: 'loadId', type: 'text', placeholder: 'Carregamento...' },
    { type: 'none' },
    { key: 'driver', type: 'text', placeholder: 'Motorista...' },
    { type: 'none' },
    { type: 'none' },
    { type: 'none' },
    { type: 'none' },
    { type: 'none' },
    { type: 'none' },
    { type: 'none' },
  ];

  // --- Launched table: text getters, sort getters, data pipeline ---
  type LaunchedRow = { kind: 'entry'; entry: FreightEntry; order: Order | undefined };

  const launchedTextGetters: Array<(item: LaunchedRow) => unknown> = [
    (r) => r.entry.orderId,
    (r) => r.order?.representativeName,
    (r) => {
      const d = drivers.find((x) => x.id === r.entry.driverId);
      return d?.name;
    },
    (r) => r.entry.freightValue,
    (r) => r.entry.driverValue,
    (r) => r.entry.status,
  ];

  const launchedStatusGetter = (r: LaunchedRow) => r.entry.status;

  const launchedSortGetters: Record<string, (item: LaunchedRow) => unknown> = {
    orderId: (r) => r.entry.orderId,
    representative: (r) => r.order?.representativeName,
    driver: (r) => {
      const d = drivers.find((x) => x.id === r.entry.driverId);
      return d?.name;
    },
    date: (r) => r.entry.deliveryDate,
    freightValue: (r) => Number(r.entry.freightValue) || 0,
    driverValue: (r) => Number(r.entry.driverValue) || 0,
    expenses: (r) => sumExpenses(r.entry.expenses),
    saldo: (r) => (Number(r.entry.freightValue) || 0) - (Number(r.entry.driverValue) || 0) - sumExpenses(r.entry.expenses),
    status: (r) => r.entry.status,
  };

  const launchedColDefs = useMemo(() => [
    { key: 'orderId', getter: (r: LaunchedRow) => r.entry.orderId },
    { key: 'representative', getter: (r: LaunchedRow) => r.order?.representativeName ?? '' },
    { key: 'driver', getter: (r: LaunchedRow) => {
      const d = drivers.find((x) => x.id === r.entry.driverId);
      return d?.name ?? '';
    }},
    { key: 'status', getter: (r: LaunchedRow) => r.entry.status, match: 'exact' as const },
  ], [drivers]);
  const launchedColSlots: ColFilterSlot[] = [
    { key: 'orderId', type: 'text', placeholder: 'Nº Pedido...' },
    { key: 'representative', type: 'text', placeholder: 'Representante...' },
    { key: 'driver', type: 'text', placeholder: 'Motorista...' },
    { type: 'none' },
    { type: 'none' },
    { type: 'none' },
    { type: 'none' },
    { type: 'none' },
    { key: 'status', type: 'select', options: [
      { value: 'Pendente', label: 'Pendente' },
      { value: 'Lançado', label: 'Lançado' },
      { value: 'Conferido', label: 'Conferido' },
    ]},
    { type: 'none' },
  ];

  const allLaunchedRows = useMemo(() => {
    const rows: LaunchedRow[] = freightEntries.map(e => ({
      kind: 'entry' as const,
      entry: e,
      order: orders.find((o) => o.id === e.orderId)
    }));
    const colFiltered = colFilterLaunched.filterItems(rows, launchedColDefs);
    const filtered = filterLaunchedItems(colFiltered, launchedTextGetters, launchedStatusGetter);
    return sortLaunchedItems(filtered, launchedSortGetters);
  }, [freightEntries, orders, filterLaunchedItems, sortLaunchedItems, drivers, colFilterLaunched.filterItems, launchedColDefs]);

  const summary = useMemo(() => {
    const ym = currentYearMonthBR();
    const entriesMonth = freightEntries.filter((e) => monthKey(e.createdAt) === ym);
    const fretesLancados = entriesMonth.length;
    const pagoMotoristas = entriesMonth.reduce((s, e) => s + (Number(e.driverValue) || 0), 0);
    const outrasDespesas = entriesMonth.reduce((s, e) => s + sumExpenses(e.expenses), 0);
    return {
      fretesLancados,
      pagoMotoristas,
      outrasDespesas,
      pendentes: pendingLoads.length,
    };
  }, [freightEntries, pendingLoads.length]);

  const activeExpenseTypes = useMemo(() => expenseTypes.filter((t) => t.active), [expenseTypes]);

  const [orderId, setOrderId] = useState('');
  const [loadId, setLoadId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(todayBR());
  const [freightValue, setFreightValue] = useState(0);
  const [driverValue, setDriverValue] = useState(0);
  const [lines, setLines] = useState<FreightExpenseLine[]>([]);

  const selectedOrder = useMemo(() => deliveredOrders.find((o) => o.id === orderId) || null, [deliveredOrders, orderId]);
  const selectedLoad = useMemo(() => loads.find((l) => l.id === loadId) || null, [loads, loadId]);
  const selectedDriver = useMemo(() => {
    const dId = selectedLoad?.driverId || selectedOrder?.driverId;
    return dId ? drivers.find((d) => d.id === dId) : undefined;
  }, [drivers, selectedLoad, selectedOrder]);

  const saldo = useMemo(() => freightValue - driverValue - sumExpenses(lines), [driverValue, freightValue, lines]);

  const details = useMemo(
    () => (detailsId ? freightEntries.find((e) => e.id === detailsId) || null : null),
    [detailsId, freightEntries],
  );

  const detailsOrder = useMemo(
    () => (details ? orders.find((o) => o.id === details.orderId) : undefined),
    [details, orders],
  );

  const detailsDriver = useMemo(
    () => (details ? drivers.find((d) => d.id === details.driverId) : undefined),
    [details, drivers],
  );

  const resetNew = () => {
    setOrderId('');
    setLoadId('');
    setDeliveryDate(todayBR());
    setFreightValue(0);
    setDriverValue(0);
    setLines([]);
  };

  const openNewForLoad = (l: Load) => {
    setLoadId(l.id);
    setOrderId('');
    setDeliveryDate(todayBR());
    setFreightValue(Number(l.freightValue) || 0);
    setDriverValue(Math.max(0, Math.round((Number(l.freightValue) || 0) * 0.6)));
    setLines([]);
    setOpenNew(true);
  };

  const openNewForOrder = (o: Order) => {
    setOrderId(o.id);
    setLoadId('');
    setDeliveryDate(todayBR());
    setFreightValue(Number(o.freightValue) || 0);
    setDriverValue(Math.max(0, Math.round((Number(o.freightValue) || 0) * 0.6)));
    setLines([]);
    setOpenNew(true);
  };

  const addLine = () => {
    const first = activeExpenseTypes[0];
    if (!first) return;
    setLines((prev) => [...prev, { expenseTypeId: first.id, value: 0, note: '' }]);
  };

  const setLine = (idx: number, patch: Partial<FreightExpenseLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const saveType = () => {
    if (!newTypeName.trim()) return;
    addExpenseType({ name: newTypeName.trim(), description: newTypeDesc, active: newTypeActive });
    setNewTypeName('');
    setNewTypeDesc('');
    setNewTypeActive(true);
    showToast('Tipo de despesa criado');
  };

  const openEditEntry = (e: FreightEntry) => {
    setEditingId(e.id);
    setLoadId(e.loadId || '');
    setOrderId(e.loadId ? '' : e.orderId);
    setDeliveryDate(e.deliveryDate);
    setFreightValue(e.freightValue);
    setDriverValue(e.driverValue);
    setLines([...e.expenses]);
    setOpenNew(true);
  };

  const saveEntry = () => {
    const dId = selectedLoad?.driverId || selectedOrder?.driverId;
    if (!selectedLoad && !selectedOrder) return;
    if (!dId) {
      showToast('Carregamento sem motorista vinculado', 'error');
      return;
    }

    if (editingId) {
      updateFreightEntry(editingId, {
        deliveryDate,
        freightValue,
        driverValue,
        expenses: lines,
      });
      showToast('Lançamento atualizado');
    } else if (selectedLoad) {
      addFreightEntry({
        orderId: selectedLoad.id,
        loadId: selectedLoad.id,
        driverId: dId,
        deliveryDate,
        freightValue,
        driverValue,
        expenses: lines,
        status: 'Lançado',
      });
      showToast('Lançamento salvo');
    } else if (selectedOrder) {
      addFreightEntry({
        orderId: selectedOrder.id,
        driverId: dId,
        deliveryDate,
        freightValue,
        driverValue,
        expenses: lines,
        status: 'Lançado',
      });
      showToast('Lançamento salvo');
    }

    setOpenNew(false);
    resetNew();
    setEditingId(null);
  };

  const confirmDeleteEntry = () => {
    if (editingId) {
      deleteFreightEntry(editingId);
      showToast('Lançamento excluído com sucesso');
      setOpenDeleteConfirm(false);
      setEditingId(null);
    }
  };

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

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Controle de despesas de frete por pedido</p>
        </div>
        <div className="flex items-center gap-3">
          <button className={btnSecondary} onClick={() => setOpenTypes(true)}>
            <Settings2 className="h-4 w-4" />
            Gerenciar Tipos de Despesa
          </button>
          <button
            className={btnPrimary}
            onClick={() => {
              const first = pendingLoads[0];
              if (!first) return;
              openNewForLoad(first);
            }}
            disabled={pendingLoads.length === 0}
          >
            <Plus className="h-4 w-4" />
            Novo Lançamento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 no-print">
        <div className="bg-card border border-border rounded-xl p-5 shadow-card">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Fretes lançados no mês</p>
          <p className="text-2xl font-bold mt-2">{summary.fretesLancados}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-card">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total pago a motoristas</p>
          <p className="text-2xl font-bold mt-2">{formatCurrency(summary.pagoMotoristas)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-card">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Outras despesas</p>
          <p className="text-2xl font-bold mt-2">{formatCurrency(summary.outrasDespesas)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-card">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pendentes de lançamento</p>
          <p className="text-2xl font-bold mt-2">{summary.pendentes}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden no-print">
        <div className="p-5 border-b border-border space-y-4">
          <div>
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Pendentes de Lançamento</h2>
            <p className="text-xs text-muted-foreground mt-1">Carregamentos entregues aguardando lançamento de frete.</p>
          </div>
          <QuickFilterBar
            query={qPending}
            onQueryChange={setQPending}
            placeholder="Buscar pedido, representante ou motorista"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <ColumnFilterRow columns={pendingColSlots} values={colFilterPending.values} onChange={colFilterPending.setFilter} />
              <tr className="border-b border-border bg-muted/30">
                <SortableHeader columnKey="orderId" sortState={sortPending} onToggle={togglePending} className="text-left py-4 px-6">Carregamento</SortableHeader>
                <th className="text-left py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Pedidos</th>
                <SortableHeader columnKey="driver" sortState={sortPending} onToggle={togglePending} className="text-left py-4 px-6">Motorista</SortableHeader>
                <SortableHeader columnKey="date" sortState={sortPending} onToggle={togglePending} className="text-left py-4 px-6">Data</SortableHeader>
                <SortableHeader columnKey="freightValue" sortState={sortPending} onToggle={togglePending} className="text-right py-4 px-6">Valor Frete</SortableHeader>
                <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Valor Motorista</th>
                <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Outras Despesas</th>
                <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Saldo</th>
                <th className="text-left py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Status</th>
                <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {pendingLoads.map((l) => {
                const driver = drivers.find((d) => d.id === l.driverId);
                const frete = Number(l.freightValue) || 0;
                const [y, m, d] = (l.plannedDate || '').split('-');
                const dataStr = l.plannedDate ? `${d}/${m}/${y}` : '-';
                return (
                  <tr key={l.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-4 px-6 font-mono-data font-bold text-primary">{l.id}</td>
                    <td className="py-4 px-6 text-xs text-muted-foreground">{l.orderIds.join(', ')}</td>
                    <td className="py-4 px-6">{driver?.name || '-'}</td>
                    <td className="py-4 px-6 font-mono-data text-muted-foreground">{dataStr}</td>
                    <td className="py-4 px-6 text-right font-mono-data font-bold">{formatCurrency(frete)}</td>
                    <td className="py-4 px-6 text-right font-mono-data">-</td>
                    <td className="py-4 px-6 text-right font-mono-data">-</td>
                    <td className="py-4 px-6 text-right font-mono-data">-</td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-status-warning/15 text-status-warning">Pendente</span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button className={btnPrimary} onClick={() => openNewForLoad(l)}>Lançar</button>
                    </td>
                  </tr>
                );
              })}
              {pendingLoads.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-muted-foreground">Nenhum carregamento pendente.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden no-print">
        <div className="p-5 border-b border-border space-y-4">
          <div>
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Fretes Lançados</h2>
            <p className="text-xs text-muted-foreground mt-1">Pedidos entregues com distribuição de frete e despesas.</p>
          </div>
          <QuickFilterBar
            query={qLaunched}
            onQueryChange={setQLaunched}
            placeholder="Buscar pedido, representante ou motorista"
            statuses={[
              { value: 'Pendente', label: 'Pendente' },
              { value: 'Lançado', label: 'Lançado' },
              { value: 'Conferido', label: 'Conferido' },
            ]}
            activeStatus={activeLaunchedStatus}
            onStatusChange={setActiveLaunchedStatus}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <ColumnFilterRow columns={launchedColSlots} values={colFilterLaunched.values} onChange={colFilterLaunched.setFilter} />
              <tr className="border-b border-border bg-muted/30">
                <SortableHeader columnKey="orderId" sortState={sortLaunched} onToggle={toggleLaunched} className="text-left py-4 px-6">Nº Pedido</SortableHeader>
                <SortableHeader columnKey="representative" sortState={sortLaunched} onToggle={toggleLaunched} className="text-left py-4 px-6">Representante</SortableHeader>
                <SortableHeader columnKey="driver" sortState={sortLaunched} onToggle={toggleLaunched} className="text-left py-4 px-6">Motorista</SortableHeader>
                <SortableHeader columnKey="date" sortState={sortLaunched} onToggle={toggleLaunched} className="text-left py-4 px-6">Data</SortableHeader>
                <SortableHeader columnKey="freightValue" sortState={sortLaunched} onToggle={toggleLaunched} className="text-right py-4 px-6">Valor Frete</SortableHeader>
                <SortableHeader columnKey="driverValue" sortState={sortLaunched} onToggle={toggleLaunched} className="text-right py-4 px-6">Valor Motorista</SortableHeader>
                <SortableHeader columnKey="expenses" sortState={sortLaunched} onToggle={toggleLaunched} className="text-right py-4 px-6">Outras Despesas</SortableHeader>
                <SortableHeader columnKey="saldo" sortState={sortLaunched} onToggle={toggleLaunched} className="text-right py-4 px-6">Saldo</SortableHeader>
                <SortableHeader columnKey="status" sortState={sortLaunched} onToggle={toggleLaunched} className="text-left py-4 px-6">Status</SortableHeader>
                <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {allLaunchedRows.map((r) => {
                const e = r.entry;
                const o = r.order;
                const driver = drivers.find((d) => d.id === e.driverId);
                const other = sumExpenses(e.expenses);
                const saldoRow = (Number(e.freightValue) || 0) - (Number(e.driverValue) || 0) - other;
                const negative = saldoRow < 0;
                return (
                  <tr key={e.id} className={negative ? 'bg-red-50 hover:bg-red-100/40 transition-colors' : 'hover:bg-muted/20 transition-colors'}>
                    <td className="py-4 px-6 font-mono-data font-bold text-primary">{e.orderId}</td>
                    <td className="py-4 px-6">{o?.representativeName || '-'}</td>
                    <td className="py-4 px-6">{driver?.name || '-'}</td>
                    <td className="py-4 px-6 font-mono-data text-muted-foreground">{fmtDate(e.deliveryDate)}</td>
                    <td className="py-4 px-6 text-right font-mono-data font-bold">{formatCurrency(e.freightValue)}</td>
                    <td className="py-4 px-6 text-right font-mono-data">{formatCurrency(e.driverValue)}</td>
                    <td className="py-4 px-6 text-right font-mono-data">{formatCurrency(other)}</td>
                    <td className={"py-4 px-6 text-right font-mono-data font-bold " + (negative ? 'text-destructive' : 'text-foreground')}>{formatCurrency(saldoRow)}</td>
                    <td className="py-4 px-6">
                      <span
                        className={
                          'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ' +
                          (e.status === 'Conferido'
                            ? 'bg-status-success/15 text-status-success'
                            : e.status === 'Lançado'
                              ? 'bg-status-info/15 text-status-info'
                              : 'bg-status-warning/15 text-status-warning')
                        }
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setDetailsId(e.id);
                            setOpenDetails(true);
                          }}
                          title="Detalhes"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          onClick={() => setPrintId(e.id)}
                          title="Imprimir"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        <button
                          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-blue-600"
                          onClick={() => openEditEntry(e)}
                          title="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-red-600"
                          onClick={() => {
                            setEditingId(e.id);
                            setOpenDeleteConfirm(true);
                          }}
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {allLaunchedRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-muted-foreground">Nenhum lançamento encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={openTypes} onClose={() => setOpenTypes(false)} title="Tipos de Despesa" wide>
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input className={inputClass} placeholder="Nome *" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} />
            <input className={inputClass} placeholder="Descrição" value={newTypeDesc} onChange={(e) => setNewTypeDesc(e.target.value)} />
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={newTypeActive} onChange={(e) => setNewTypeActive(e.target.checked)} />
                Ativo
              </label>
              <button className={btnPrimary} onClick={saveType}>Adicionar</button>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Nome</th>
                  <th className="text-left py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Descrição</th>
                  <th className="text-left py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Ativo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {expenseTypes.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4">
                      <input
                        className={inputClass + ' py-1 h-9'}
                        value={t.name}
                        onChange={(e) => updateExpenseType(t.id, { name: e.target.value })}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        className={inputClass + ' py-1 h-9'}
                        value={t.description}
                        onChange={(e) => updateExpenseType(t.id, { description: e.target.value })}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={t.active} onChange={(e) => updateExpenseType(t.id, { active: e.target.checked })} />
                        {t.active ? 'Ativo' : 'Inativo'}
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button className={btnSecondary} onClick={() => setOpenTypes(false)}>Fechar</button>
          </div>
        </div>
      </Modal>

      <Modal open={openNew} onClose={() => { setOpenNew(false); setEditingId(null); resetNew(); }} title={editingId ? `Editar Lançamento: ${loadId || orderId}` : 'Novo Lançamento'} wide>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold font-display text-foreground">Carregamento</label>
              <select
                className={inputClass + ' mt-2'}
                value={loadId}
                onChange={(e) => {
                  const id = e.target.value;
                  setLoadId(id);
                  setOrderId('');
                  const l = loads.find((x) => x.id === id);
                  setFreightValue(Number(l?.freightValue) || 0);
                  setDriverValue(Math.max(0, Math.round((Number(l?.freightValue) || 0) * 0.6)));
                }}
              >
                <option value="">Selecione...</option>
                {pendingLoads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.id} — {drivers.find(d => d.id === l.driverId)?.name || '-'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold font-display text-foreground">Data de Entrega</label>
              <input className={inputClass + ' mt-2'} type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>
          </div>

          {selectedLoad && (
            <div className="bg-muted/20 rounded-xl border border-border p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pedidos</p>
                <p className="mt-1 font-semibold text-xs">{selectedLoad.orderIds.join(', ')}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Motorista</p>
                <p className="mt-1 font-semibold">{selectedDriver?.name || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Valor do Frete</p>
                <p className="mt-1 font-mono-data font-bold">{formatCurrency(freightValue)}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Nº de Pedidos</p>
                <p className="mt-1 font-mono-data font-bold">{selectedLoad.orderIds.length}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold font-display text-foreground">Valor para o Motorista</label>
              <input type="number" className={inputClass + ' mt-2'} value={driverValue} onChange={(e) => setDriverValue(Number(e.target.value))} />
            </div>
            <div className="flex items-end justify-end">
              <button className={btnSecondary} onClick={addLine} disabled={activeExpenseTypes.length === 0}>
                + Adicionar Despesa
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-[220px_140px_1fr_44px] gap-3 items-end">
                <div>
                  <label className="text-sm font-medium font-display text-foreground">Tipo</label>
                  <select
                    className={inputClass + ' mt-2'}
                    value={l.expenseTypeId}
                    onChange={(e) => setLine(idx, { expenseTypeId: e.target.value })}
                  >
                    {activeExpenseTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium font-display text-foreground">Valor</label>
                  <input type="number" className={inputClass + ' mt-2'} value={l.value} onChange={(e) => setLine(idx, { value: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-sm font-medium font-display text-foreground">Observação</label>
                  <input className={inputClass + ' mt-2'} value={l.note} onChange={(e) => setLine(idx, { note: e.target.value })} />
                </div>
                <button className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition-colors" onClick={() => removeLine(idx)}>
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="bg-muted/20 rounded-xl border border-border p-4 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Valor Total do Frete:</span>
              <span className="font-mono-data font-bold">{formatCurrency(freightValue)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">(−) Valor Motorista:</span>
              <span className="font-mono-data">{formatCurrency(driverValue)}</span>
            </div>
            {lines.map((l, idx) => {
              const t = expenseTypes.find((x) => x.id === l.expenseTypeId);
              return (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">(−) {t?.name || 'Despesa'}:</span>
                  <span className="font-mono-data">{formatCurrency(l.value)}</span>
                </div>
              );
            })}
            <div className="h-px bg-border my-2" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-semibold">Saldo Restante:</span>
              <span className={"font-mono-data font-bold " + (saldo < 0 ? 'text-destructive' : 'text-emerald-700')}>{formatCurrency(saldo)}</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button className={btnDanger} onClick={() => { setOpenNew(false); setEditingId(null); resetNew(); }}>Cancelar</button>
            <button className={btnPrimary} onClick={saveEntry} disabled={!selectedLoad && !selectedOrder}>Salvar Lançamento</button>
          </div>
        </div>
      </Modal>

      <Modal open={openDeleteConfirm} onClose={() => { setOpenDeleteConfirm(false); setEditingId(null); }} title="Excluir Lançamento">
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-status-warning p-4 bg-status-warning/10 rounded-xl border border-status-warning/20">
            <AlertTriangle className="h-6 w-6" />
            <p className="text-sm font-medium">Tem certeza que deseja excluir este lançamento?</p>
          </div>
          <p className="text-sm text-muted-foreground">
            O pedido será removido da lista de "Fretes Lançados" e voltará para a lista de "Pendentes de Lançamento" aguardando um novo frete. As despesas registradas também serão perdidas.
          </p>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button className={btnSecondary} onClick={() => { setOpenDeleteConfirm(false); setEditingId(null); }}>Cancelar</button>
            <button className={btnDanger} onClick={confirmDeleteEntry}>Excluir Lançamento</button>
          </div>
        </div>
      </Modal>

      <Modal open={openDetails && Boolean(details)} onClose={() => setOpenDetails(false)} title={details ? `Detalhes — ${details.id}` : 'Detalhes'} wide>
        {details && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-muted/20 rounded-xl border border-border p-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pedido</p>
                <p className="mt-1 font-mono-data font-bold text-primary">{details.orderId}</p>
                <p className="text-xs text-muted-foreground mt-1">{detailsOrder?.representativeName || '-'}</p>
              </div>
              <div className="bg-muted/20 rounded-xl border border-border p-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Motorista</p>
                <p className="mt-1 font-semibold">{detailsDriver?.name || '-'}</p>
                <p className="text-xs text-muted-foreground mt-1">{detailsDriver?.plate || '-'}</p>
              </div>
              <div className="bg-muted/20 rounded-xl border border-border p-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Frete</p>
                <p className="mt-1 font-mono-data font-bold">{formatCurrency(details.freightValue)}</p>
                <p className="text-xs text-muted-foreground mt-1">Entrega: {fmtDate(details.deliveryDate)}</p>
              </div>
              <div className="bg-muted/20 rounded-xl border border-border p-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</p>
                <p className="mt-1 font-semibold">{details.status}</p>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Tipo</th>
                    <th className="text-right py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Valor</th>
                    <th className="text-left py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Obs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  <tr>
                    <td className="py-3 px-4 font-semibold">Motorista</td>
                    <td className="py-3 px-4 text-right font-mono-data">{formatCurrency(details.driverValue)}</td>
                    <td className="py-3 px-4 text-muted-foreground">-</td>
                  </tr>
                  {details.expenses.map((l, idx) => {
                    const t = expenseTypes.find((x) => x.id === l.expenseTypeId);
                    return (
                      <tr key={idx}>
                        <td className="py-3 px-4">{t?.name || '-'}</td>
                        <td className="py-3 px-4 text-right font-mono-data">{formatCurrency(l.value)}</td>
                        <td className="py-3 px-4 text-muted-foreground">{l.note || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Saldo: <span className="font-mono-data font-bold text-foreground">{formatCurrency(details.freightValue - details.driverValue - sumExpenses(details.expenses))}</span>
              </div>
              <div className="flex items-center gap-3">
                <button className={btnSecondary} onClick={() => setPrintId(details.id)}>
                  <Printer className="h-4 w-4" />
                  Imprimir
                </button>
                <button
                  className={btnPrimary}
                  onClick={() => {
                    setFreightEntryStatus(details.id, 'Conferido');
                    showToast('Marcado como Conferido');
                    setOpenDetails(false);
                  }}
                  disabled={details.status === 'Conferido'}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Marcar como Conferido
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {printId && (
        <div className="print-only">
          {(() => {
            const e = freightEntries.find((x) => x.id === printId);
            if (!e) return null;
            const o = orders.find((x) => x.id === e.orderId);
            const d = drivers.find((x) => x.id === e.driverId);
            const other = sumExpenses(e.expenses);
            const saldoPrint = e.freightValue - e.driverValue - other;
            return (
              <div className="p-8">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-lg font-bold">CONCREM — Controle de Frete</div>
                    <div className="text-sm font-semibold mt-1">LANÇAMENTO DE FRETE</div>
                  </div>
                  <div className="text-right text-sm">
                    <div><span className="font-semibold">Nº:</span> {e.id}</div>
                    <div><span className="font-semibold">Pedido:</span> {e.orderId}</div>
                    <div><span className="font-semibold">Emitido em:</span> {fmtDate(new Date().toISOString())}</div>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
                  <div className="border border-border rounded-lg p-4">
                    <div className="font-semibold">Representante</div>
                    <div className="mt-1">{o?.representativeName || '-'}</div>
                  </div>
                  <div className="border border-border rounded-lg p-4">
                    <div className="font-semibold">Motorista</div>
                    <div className="mt-1">{d?.name || '-'} ({d?.plate || '-'})</div>
                  </div>
                </div>

                <div className="mt-6 border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="text-left py-2 px-3">Tipo</th>
                        <th className="text-right py-2 px-3">Valor</th>
                        <th className="text-left py-2 px-3">Obs</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/50">
                        <td className="py-2 px-3">Valor do Frete</td>
                        <td className="py-2 px-3 text-right font-mono-data font-semibold">{formatCurrency(e.freightValue)}</td>
                        <td className="py-2 px-3">-</td>
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="py-2 px-3">Motorista</td>
                        <td className="py-2 px-3 text-right font-mono-data">{formatCurrency(e.driverValue)}</td>
                        <td className="py-2 px-3">-</td>
                      </tr>
                      {e.expenses.map((l, idx) => {
                        const t = expenseTypes.find((x) => x.id === l.expenseTypeId);
                        return (
                          <tr key={idx} className="border-b border-border/50">
                            <td className="py-2 px-3">{t?.name || '-'}</td>
                            <td className="py-2 px-3 text-right font-mono-data">{formatCurrency(l.value)}</td>
                            <td className="py-2 px-3">{l.note || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 text-sm">
                  <div><span className="font-semibold">Outras Despesas:</span> {formatCurrency(other)}</div>
                  <div className={"mt-1 " + (saldoPrint < 0 ? 'text-destructive' : '')}><span className="font-semibold">Saldo:</span> {formatCurrency(saldoPrint)}</div>
                </div>

                <div className="mt-10 grid grid-cols-2 gap-12">
                  <div>
                    <div className="border-b border-foreground/40 h-10" />
                    <div className="text-xs text-muted-foreground mt-2">Assinatura Financeiro</div>
                  </div>
                  <div>
                    <div className="border-b border-foreground/40 h-10" />
                    <div className="text-xs text-muted-foreground mt-2">Assinatura Conferência</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default Financial;
