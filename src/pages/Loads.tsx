import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, tableColumns } from '@/contexts/AppContext';
import { can } from '@/utils/access';
import { formatCurrency, loadStatusColors, StatusBadge, btnSecondary } from '@/components/shared';
import { getValorTotalOrder, getValorTotalPedido } from '@/lib/valorPedido';
import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import { rowToOrder } from '@/lib/pedidoMapper';
import type { Order, PedidoStatusRow } from '@/types';
import { Edit2, Plus, Package, FileText, Download, Eye, X, Truck, Calendar, DollarSign } from 'lucide-react';
import * as XLSX from 'xlsx';
import logoSrc from '@/assets/logo-programacao.png';
import { useTableSort } from '@/hooks/useTableSort';
import { useQuickFilter } from '@/hooks/useQuickFilter';
import { useColumnFilters, ColDef } from '@/hooks/useColumnFilters';
import { SortableHeader } from '@/components/table/SortableHeader';
import { QuickFilterBar } from '@/components/table/QuickFilterBar';
import { ColumnFilterRow, ColFilterSlot } from '@/components/table/ColumnFilterRow';
import type { Load } from '@/types';
import { fmtDate, todayBR } from '@/lib/dateUtils';
import { usePrioridades } from '@/contexts/PrioridadesContext';
import { useAtencao } from '@/contexts/AtencaoContext';
import { PrioridadeDot, AtencaoDot } from '@/components/pedidos/PrioridadeBadge';

type ReportRow = {
  driverName: string;
  date: string;
  orderId: string;
  company: string;
  uf: string;
  value: number;
};

type ReportGroup = {
  loadId: string;
  driverName: string;
  date: string;
  rows: { orderId: string; company: string; uf: string; value: number }[];
};

const formatDateBR = (iso?: string) => {
  if (!iso) return '-';
  return fmtDate(iso);
};

const todayStr = () => todayBR();

const getLogoDataUrl = async (): Promise<string> => {
  try {
    const response = await fetch(logoSrc);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
};

const shipmentStatuses = [
  { value: 'Aguardando Despacho', label: 'Aguardando Despacho' },
  { value: 'Despachado', label: 'Despachado' },
  { value: 'Em Rota', label: 'Em Rota' },
  { value: 'Entregue', label: 'Entregue' },
  { value: 'Cancelado', label: 'Cancelado' },
];

const LoadsPage = () => {
  const { loads, drivers, orders, supportOrders, user } = useApp();
  const canCriarEditar = can(user, 'carregamento.criar_editar', 'programacao', 'execute');
  const canExcluirCarg = can(user, 'carregamento.excluir',      'programacao', 'execute');
  const { map: prioMap } = usePrioridades();
  const { map: atencaoMap } = useAtencao();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [extraOrders, setExtraOrders] = useState<Order[]>([]);
  const [pedidoStatusMap, setPedidoStatusMap] = useState<Map<string, PedidoStatusRow>>(new Map());
  const [quickViewLoad, setQuickViewLoad] = useState<Load | null>(null);

  // Buscar pedidos extras (não estão no AppContext) e status de todos os pedidos dos carregamentos
  useEffect(() => {
    if (!loads.length) return;
    const allOrderIds = Array.from(new Set(loads.flatMap((l) => l.orderIds)));
    if (!allOrderIds.length) return;

    void (async () => {
      // Buscar status
      if (supabaseOps) {
        const { data } = await supabaseOps.from('concrem_pedidos_status').select('*').in('pedido_id', allOrderIds);
        if (data) {
          setPedidoStatusMap(new Map((data as PedidoStatusRow[]).map((r) => [r.pedido_id, r])));
        }
      }

      // Buscar pedidos extras
      if (supabasePedidos) {
        const knownIds = new Set([...orders.map((o) => o.id), ...supportOrders.map((o) => o.id)]);
        const missingIds = allOrderIds.filter((id) => !knownIds.has(id));
        if (missingIds.length > 0) {
          const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
          const { data } = await supabasePedidos.from(table).select(tableColumns).in('numero_pedido', missingIds);
          if (data) setExtraOrders((data as any[]).map((row) => rowToOrder(row, 'CLI-001')));
        }
      }
    })();
  }, [loads, orders.length, supportOrders.length]);

  // Mapa direto ao ERP para total_pedido_venda — fonte autoritativa de valor
  const [loadsOrderValueMap, setLoadsOrderValueMap] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!loads.length || !supabasePedidos) return;
    const allOrderIds = Array.from(new Set(loads.flatMap((l) => l.orderIds)));
    if (!allOrderIds.length) return;
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_venda';
    const BATCH = 200;
    const chunks: string[][] = [];
    for (let i = 0; i < allOrderIds.length; i += BATCH) chunks.push(allOrderIds.slice(i, i + BATCH));
    Promise.all(chunks.map((batch) =>
      supabasePedidos!.from(table)
        .select('numero_pedido, total_pedido_venda, id_nota_conf')
        .in('numero_pedido', batch)
        .then(({ data }) => data || [])
    )).then((results) => {
      const m = new Map<string, number>();
      for (const row of results.flat()) m.set(String(row.numero_pedido), getValorTotalPedido(row));
      setLoadsOrderValueMap(m);
    }).catch((err) => console.error('[Loads] loadsOrderValueMap:', err));
  }, [loads]);

  const { sortState, toggleSort, sortItems } = useTableSort();
  const { query, setQuery, filterItems, activeStatus, setActiveStatus } = useQuickFilter<Load>('Aguardando Despacho');
  const colFilter = useColumnFilters();
  const [orderNumFilter, setOrderNumFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const textGetters: Array<(item: Load) => unknown> = useMemo(
    () => [
      (l: Load) => l.id,
      (l: Load) => drivers.find((d) => d.id === l.driverId)?.name ?? '',
      (l: Load) => l.plannedDate ? formatDateBR(l.plannedDate) : '',
      (l: Load) => l.shipmentStatus,
      (l: Load) => l.productionStatus,
    ],
    [drivers],
  );

  const sortGetters: Record<string, (item: Load) => unknown> = useMemo(
    () => ({
      id: (l: Load) => l.id,
      driver: (l: Load) => drivers.find((d) => d.id === l.driverId)?.name ?? '',
      date: (l: Load) => l.plannedDate,
      orderValue: (l: Load) => l.orderIds.reduce((acc, id) => acc + (loadsOrderValueMap.get(id) || 0), 0),
      freightValue: (l: Load) => l.freightValue || 0,
      status: (l: Load) => l.shipmentStatus,
    }),
    [drivers, loadsOrderValueMap],
  );

  const colDefs: ColDef<Load>[] = useMemo(() => [
    { key: 'id', getter: (l) => l.id },
    { key: 'driver', getter: (l) => drivers.find((d) => d.id === l.driverId)?.name ?? '' },
    { key: 'date', getter: (l) => l.plannedDate ? formatDateBR(l.plannedDate) : '' },
    { key: 'shipmentStatus', getter: (l) => l.shipmentStatus, match: 'exact' as const },
  ], [drivers]);
  const colFilterSlots: ColFilterSlot[] = [
    { type: 'none' },
    { key: 'id', type: 'text', placeholder: 'Código...' },
    { type: 'none' },
    { key: 'driver', type: 'text', placeholder: 'Motorista...' },
    { key: 'date', type: 'text', placeholder: 'Data...' },
    { type: 'none' },
    { type: 'none' },
    { key: 'shipmentStatus', type: 'select', options: shipmentStatuses },
    { type: 'none' },
  ];

  const filteredAndSorted = useMemo(() => {
    const colFiltered = colFilter.filterItems(loads, colDefs);
    const filtered = filterItems(
      colFiltered,
      textGetters,
      (l) => l.shipmentStatus,
    );
    const byOrder = orderNumFilter.trim()
      ? filtered.filter((l) =>
          l.orderIds.some((oid) => oid.toLowerCase().includes(orderNumFilter.trim().toLowerCase()))
        )
      : filtered;
    const byDate = byOrder.filter((l) => {
      const d = l.plannedDate?.slice(0, 10) ?? '';
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
    const sorted = sortItems(byDate, sortGetters);
    if (!sortState.key) {
      return [...sorted].sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
    }
    return sorted;
  }, [loads, filterItems, textGetters, sortItems, sortGetters, sortState.key, colFilter.filterItems, colDefs, orderNumFilter, dateFrom, dateTo]);

  const toggleAll = () => {
    const visibleIds = filteredAndSorted.map((l) => l.id);
    const allVisibleSelected = visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) =>
      allVisibleSelected
        ? prev.filter((id) => !visibleIds.includes(id))
        : [...new Set([...prev, ...visibleIds])]
    );
  };

  const allOrdersMap = useMemo(() => {
    const m = new Map<string, Order>();
    // Insert in ascending priority: extraOrders < supportOrders < orders
    for (const o of extraOrders) m.set(o.id, o);
    for (const o of supportOrders as unknown as Order[]) m.set(o.id, o);
    for (const o of orders) m.set(o.id, o);
    return m;
  }, [orders, supportOrders, extraOrders]);

  const reportGroups = useMemo((): ReportGroup[] => {
    const selected = loads.filter((l) => selectedIds.includes(l.id));
    const groups: ReportGroup[] = [];

    for (const load of selected) {
      const driver = drivers.find((d) => d.id === load.driverId);
      const driverName = (driver?.name || '-').toUpperCase();
      const dateStr = formatDateBR(load.plannedDate);
      const orderRows: ReportGroup['rows'] = [];

      for (const orderId of load.orderIds) {
        const src = allOrdersMap.get(orderId);
        if (!src) continue;

        orderRows.push({
          orderId: src.id,
          company: (src.clientName || src.clientCode || '-').toUpperCase(),
          uf: (src.clientUF || '-').toUpperCase(),
          value: loadsOrderValueMap.get(src.id) || 0,
        });
      }

      if (orderRows.length > 0) {
        groups.push({ loadId: load.id, driverName, date: dateStr, rows: orderRows });
      }
    }

    groups.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.loadId.localeCompare(b.loadId));
    return groups;
  }, [selectedIds, loads, drivers, allOrdersMap, loadsOrderValueMap]);

  // Flat rows for Excel export
  const reportRows = useMemo((): ReportRow[] => {
    return reportGroups.flatMap((g) =>
      g.rows.map((r) => ({ driverName: g.driverName, date: g.date, ...r })),
    );
  }, [reportGroups]);

  const totalGeral = useMemo(() => reportRows.reduce((acc, r) => acc + r.value, 0), [reportRows]);

  const handleGeneratePdf = async () => {
    const logoDataUrl = await getLogoDataUrl();

    // Group by load — each carregamento gets a merged motorista cell
    const tableRows = reportGroups
      .map((g) =>
        g.rows
          .map(
            (r, i) => `
        <tr>
          ${i === 0 ? `<td rowspan="${g.rows.length}" class="driver">${g.driverName}</td>` : ''}
          ${i === 0 ? `<td rowspan="${g.rows.length}">${g.date}</td>` : ''}
          <td>${r.uf}</td>
          <td>${r.orderId}</td>
          <td class="left">${r.company}</td>
          <td class="right">${formatCurrency(r.value)}</td>
        </tr>`,
          )
          .join(''),
      )
      .join('');

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>RELATÓRIO GERAL DE EMBARQUES</title>
  <style>
    @page { size: A4; margin: 10mm 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 10px; }
    .header { display: flex; align-items: center; border: 2px solid #000; margin-bottom: 0; }
    .header-logo { padding: 8px 14px; border-right: 2px solid #000; display: flex; align-items: center; }
    .header-logo img { height: 48px; }
    .header-title { flex: 1; text-align: center; padding: 8px 14px; }
    .header-title h1 { font-size: 13px; font-weight: 900; letter-spacing: .5px; margin: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; text-transform: uppercase; }
    th, td { border: 1px solid #000; padding: 5px 6px; }
    th { font-weight: 900; background: #e8e8e8; text-align: center; font-size: 9px; }
    td { text-align: center; vertical-align: middle; }
    td.driver { font-weight: 700; text-align: center; vertical-align: middle; font-size: 9px; }
    .right { text-align: right !important; }
    .left { text-align: left !important; }
    tfoot td { font-weight: 900; background: #f0f0f0; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-logo">
      ${logoDataUrl ? `<img src="${logoDataUrl}" alt="CONCREM" />` : '<strong style="font-size:18px;">CONCREM</strong>'}
    </div>
    <div class="header-title">
      <h1>RELATÓRIO GERAL DE EMBARQUES CONCREM INDUSTRIAL LTDA</h1>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:14%">MOTORISTA</th>
        <th style="width:7%">DATA</th>
        <th style="width:5%">UF</th>
        <th style="width:9%">Nº PEDIDO</th>
        <th style="width:42%">EMPRESA</th>
        <th style="width:13%">VALOR</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5" class="right">R$</td>
        <td class="right">${formatCurrency(totalGeral)}</td>
      </tr>
    </tfoot>
  </table>

  <script>window.onload = () => { window.focus(); window.print(); };</script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const handleGenerateExcel = () => {
    const data = reportRows.map((r) => ({
      MOTORISTA: r.driverName,
      DATA: r.date,
      UF: r.uf,
      'Nº PEDIDO': r.orderId,
      EMPRESA: r.company,
      VALOR: r.value,
    }));

    data.push({
      MOTORISTA: '',
      DATA: '',
      UF: '',
      'Nº PEDIDO': '',
      EMPRESA: 'TOTAL GERAL',
      VALOR: totalGeral,
    });

    const ws = XLSX.utils.json_to_sheet(data);

    const colWidths = [
      { wch: 30 },
      { wch: 12 },
      { wch: 6 },
      { wch: 12 },
      { wch: 45 },
      { wch: 16 },
    ];
    ws['!cols'] = colWidths;

    const lastRowIdx = data.length;
    const valCol = 'F';
    for (let i = 2; i <= lastRowIdx + 1; i++) {
      const cell = ws[`${valCol}${i}`];
      if (cell) cell.z = '#,##0.00';
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Carregamentos');
    XLSX.writeFile(wb, `relatorio-carregamentos-${todayStr()}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold font-display text-foreground">Programação de Carregamentos</h1>
        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <>
              <button onClick={() => void handleGeneratePdf()} className={btnSecondary}>
                <FileText className="h-4 w-4" />
                Gerar PDF
              </button>
              <button onClick={handleGenerateExcel} className={btnSecondary}>
                <Download className="h-4 w-4" />
                Gerar Excel
              </button>
            </>
          )}
          {canCriarEditar && (
            <Link to="/carregamento/novo">
              <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-display text-sm font-medium hover:opacity-90 active:opacity-80 transition-opacity">
                <Plus className="h-4 w-4" />
                Nova Programação
              </button>
            </Link>
          )}
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border space-y-3">
          <QuickFilterBar
            query={query}
            onQueryChange={setQuery}
            placeholder="Buscar por motorista, carregamento, data..."
            statuses={shipmentStatuses}
            activeStatus={activeStatus}
            onStatusChange={setActiveStatus}
          />
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={orderNumFilter}
              onChange={(e) => setOrderNumFilter(e.target.value)}
              placeholder="Buscar por número do pedido..."
              className="w-64 h-9 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Período</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 px-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 px-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
              />
            </div>
            {(orderNumFilter || dateFrom || dateTo) && (
              <button
                onClick={() => { setOrderNumFilter(''); setDateFrom(''); setDateTo(''); }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <ColumnFilterRow columns={colFilterSlots} values={colFilter.values} onChange={colFilter.setFilter} />
              <tr className="border-b border-border bg-muted/30">
                <th className="py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px] text-center w-[56px]">
                  <input
                    type="checkbox"
                    checked={filteredAndSorted.length > 0 && filteredAndSorted.every((l) => selectedIds.includes(l.id))}
                    onChange={toggleAll}
                  />
                </th>
                <SortableHeader columnKey="id" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">
                  Carregamento
                </SortableHeader>
                <th className="w-32 py-2 text-center" />
                <SortableHeader columnKey="driver" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">
                  Motorista
                </SortableHeader>
                <SortableHeader columnKey="date" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">
                  Data
                </SortableHeader>
                <SortableHeader columnKey="orderValue" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">
                  Valor Total
                </SortableHeader>
                <SortableHeader columnKey="freightValue" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">
                  Valor do Frete
                </SortableHeader>
                <SortableHeader columnKey="status" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">
                  Status
                </SortableHeader>
                <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredAndSorted.map((load, index) => {
                const driver = drivers.find((d) => d.id === load.driverId);
                const totalOrderValue = load.orderIds.reduce((acc, id) => acc + (loadsOrderValueMap.get(id) || 0), 0);


                return (
                  <tr key={`${load.id}-${index}`} className="hover:bg-muted/30 transition-colors group">
                    <td className="py-4 px-6 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(load.id)}
                        onChange={() => toggleSelect(load.id)}
                      />
                    </td>
                    <td className="py-4 px-6 font-mono-data font-bold text-primary">{load.id}</td>
                    <td className="w-32 py-2 text-center align-middle">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {load.orderIds.filter(id => prioMap.has(id)).map(id => (
                          <PrioridadeDot key={id} nivel={prioMap.get(id)!.nivel} />
                        ))}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-col">
                        <span className="font-display font-bold text-foreground">{driver?.name || '-'}</span>
                        <span className="text-[11px] text-muted-foreground font-display uppercase tracking-tight">
                          {driver?.vehicleType} — <span className="font-mono-data font-bold">{driver?.plate}</span>
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6 font-mono-data text-muted-foreground">
                      {load.plannedDate ? fmtDate(load.plannedDate) : '-'}
                    </td>
                    <td className="py-4 px-6 font-mono-data font-bold text-foreground">
                      {formatCurrency(totalOrderValue)}
                    </td>
                    <td className="py-4 px-6 font-mono-data font-bold text-primary">
                      {formatCurrency(load.freightValue || 0)}
                    </td>
                    <td className="py-4 px-6">
                      <StatusBadge status={load.shipmentStatus} colorMap={loadStatusColors} />
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setQuickViewLoad(load)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/50 transition-all font-display text-xs font-bold uppercase tracking-tight shadow-sm"
                        >
                          <Eye className="h-3 w-3" />
                          Ver
                        </button>
                        {canCriarEditar && (
                          <Link
                            to={`/carregamento/editar/${load.id}`}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/50 transition-all font-display text-xs font-bold uppercase tracking-tight shadow-sm"
                          >
                            <Edit2 className="h-3 w-3" />
                            Editar
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredAndSorted.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Package className="h-12 w-12 mb-4 opacity-10" />
            <p className="font-display text-sm italic">Nenhuma programação criada até o momento.</p>
          </div>
        )}
      </div>

      {/* Modal de visualização rápida */}
      {quickViewLoad && (() => {
        const allAvailable = [...orders, ...supportOrders as unknown as Order[], ...extraOrders];
        const loadOrders = allAvailable.filter(o => quickViewLoad.orderIds.includes(o.id));
        const driver = drivers.find(d => d.id === quickViewLoad.driverId);
        const totalOrderValue = quickViewLoad.orderIds.reduce((acc, id) => acc + (loadsOrderValueMap.get(id) || 0), 0);
        const priorityOrders = loadOrders.filter(o => prioMap.has(o.id));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setQuickViewLoad(null)}>
            <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Truck className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-bold text-foreground font-mono-data">{quickViewLoad.id}</div>
                    <div className="text-xs text-muted-foreground">{driver?.name || 'Sem motorista'} · {driver?.vehicleType || '-'}</div>
                  </div>
                  <span className={`ml-2 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${loadStatusColors[quickViewLoad.shipmentStatus || ''] || 'bg-muted text-muted-foreground border-border'}`}>
                    {quickViewLoad.shipmentStatus || 'Aguardando Despacho'}
                  </span>
                </div>
                <button type="button" onClick={() => setQuickViewLoad(null)} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Summary */}
              <div className="flex items-center gap-6 px-5 py-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-1.5 text-sm">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{quickViewLoad.plannedDate ? fmtDate(quickViewLoad.plannedDate) : '-'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <Package className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{quickViewLoad.orderIds.length} pedido{quickViewLoad.orderIds.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono-data font-bold text-foreground">{formatCurrency(totalOrderValue)}</span>
                  <span className="text-muted-foreground text-xs">pedidos</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="font-mono-data font-bold text-emerald-700">{formatCurrency(quickViewLoad.freightValue || 0)}</span>
                  <span className="text-muted-foreground text-xs">frete</span>
                </div>
              </div>

              {/* Priority alert */}
              {priorityOrders.length > 0 && (
                <div className="px-5 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-red-700 uppercase tracking-wide">Atenção — pedidos prioritários:</span>
                  {priorityOrders.map(o => (
                    <span key={o.id} className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                      <PrioridadeDot nivel={prioMap.get(o.id)!.nivel} />
                      {o.id} · {prioMap.get(o.id)!.nivel}
                    </span>
                  ))}
                </div>
              )}

              {/* Order list */}
              <div className="flex-1 overflow-y-auto">
                {loadOrders.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground text-sm italic">Pedidos não encontrados.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/50 border-b border-border">
                      <tr>
                        <th className="py-2 px-4 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Nº Pedido</th>
                        <th className="py-2 px-4 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cliente</th>
                        <th className="py-2 px-4 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cidade/UF</th>
                        <th className="py-2 px-4 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {loadOrders.map(o => (
                        <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-4 font-mono-data font-bold text-primary">
                            <div className="flex items-center gap-1.5">
                              {prioMap.has(o.id) && <PrioridadeDot nivel={prioMap.get(o.id)!.nivel} />}{atencaoMap.has(o.id) && <AtencaoDot />}
                              {o.id}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-medium truncate max-w-[180px]">{o.clientName || o.clientCode || '-'}</td>
                          <td className="py-3 px-4 text-muted-foreground">{o.clientCity && o.clientUF ? `${o.clientCity}/${o.clientUF}` : '-'}</td>
                          <td className="py-3 px-4 text-right font-mono-data font-bold">{formatCurrency(loadsOrderValueMap.get(o.id) || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
                <button type="button" onClick={() => setQuickViewLoad(null)} className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted transition-colors">Fechar</button>
                {canCriarEditar && (
                  <Link to={`/carregamento/editar/${quickViewLoad.id}`} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
                    <Edit2 className="h-3.5 w-3.5" />
                    Editar
                  </Link>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default LoadsPage;
