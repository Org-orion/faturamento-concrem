import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, tableColumns } from '@/contexts/AppContext';
import { formatCurrency, getOrderTotal, loadStatusColors, StatusBadge, btnSecondary } from '@/components/shared';
import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import { rowToOrder } from '@/lib/pedidoMapper';
import type { Order, PedidoStatusRow } from '@/types';
import { Edit2, Plus, Package, FileText, Download } from 'lucide-react';
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
  { value: 'Cancelado', label: 'Cancelado' },
];

const LoadsPage = () => {
  const { loads, drivers, orders, supportOrders } = useApp();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [extraOrders, setExtraOrders] = useState<Order[]>([]);
  const [pedidoStatusMap, setPedidoStatusMap] = useState<Map<string, PedidoStatusRow>>(new Map());

  // Buscar pedidos extras (não estão no AppContext) e status de todos os pedidos dos carregamentos
  useEffect(() => {
    if (!loads.length) return;
    const allOrderIds = Array.from(new Set(loads.flatMap((l) => l.orderIds)));
    if (!allOrderIds.length) return;

    void (async () => {
      // Buscar status
      if (supabaseOps) {
        const { data } = await supabaseOps.from('pedidos_status').select('*').in('pedido_id', allOrderIds);
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

  const { sortState, toggleSort, sortItems } = useTableSort();
  const { query, setQuery, filterItems, activeStatus, setActiveStatus } = useQuickFilter<Load>();
  const colFilter = useColumnFilters();

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    setSelectedIds((prev) => (prev.length === loads.length ? [] : loads.map((l) => l.id)));
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
      orderValue: (l: Load) => {
        const all = [...orders, ...supportOrders as unknown as Order[], ...extraOrders];
        return all.filter((o) => l.orderIds.includes(o.id)).reduce((acc, o) => acc + (o.totalPedidoVenda || getOrderTotal(o)), 0);
      },
      freightValue: (l: Load) => l.freightValue || 0,
      status: (l: Load) => l.shipmentStatus,
    }),
    [drivers, orders, supportOrders],
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
    const sorted = sortItems(filtered, sortGetters);
    if (!sortState.key) {
      return [...sorted].sort((a, b) => (b.plannedDate || '').localeCompare(a.plannedDate || ''));
    }
    return sorted;
  }, [loads, filterItems, textGetters, sortItems, sortGetters, sortState.key, colFilter.filterItems, colDefs]);

  const reportGroups = useMemo((): ReportGroup[] => {
    const selected = loads.filter((l) => selectedIds.includes(l.id));
    const groups: ReportGroup[] = [];

    for (const load of selected) {
      const driver = drivers.find((d) => d.id === load.driverId);
      const driverName = (driver?.name || '-').toUpperCase();
      const dateStr = formatDateBR(load.plannedDate);
      const orderRows: ReportGroup['rows'] = [];

      for (const orderId of load.orderIds) {
        const order = orders.find((o) => o.id === orderId);
        const supOrder = order ? undefined : supportOrders.find((o) => o.id === orderId);
        const extra = (order || supOrder) ? undefined : extraOrders.find((o) => o.id === orderId);
        const src = order || supOrder || extra;
        if (!src) continue;

        orderRows.push({
          orderId: src.id,
          company: (src.clientName || src.clientCode || '-').toUpperCase(),
          uf: (src.clientUF || '-').toUpperCase(),
          value: getOrderTotal(src),
        });
      }

      if (orderRows.length > 0) {
        groups.push({ loadId: load.id, driverName, date: dateStr, rows: orderRows });
      }
    }

    groups.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.loadId.localeCompare(b.loadId));
    return groups;
  }, [selectedIds, loads, drivers, orders, supportOrders, extraOrders]);

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
          <Link to="/carregamento/novo">
            <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-display text-sm font-medium hover:opacity-90 active:opacity-80 transition-opacity">
              <Plus className="h-4 w-4" />
              Nova Programação
            </button>
          </Link>
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <QuickFilterBar
            query={query}
            onQueryChange={setQuery}
            placeholder="Buscar por motorista, carregamento, data..."
            statuses={shipmentStatuses}
            activeStatus={activeStatus}
            onStatusChange={setActiveStatus}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <ColumnFilterRow columns={colFilterSlots} values={colFilter.values} onChange={colFilter.setFilter} />
              <tr className="border-b border-border bg-muted/30">
                <th className="py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px] text-center w-[56px]">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === loads.length && loads.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <SortableHeader columnKey="id" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">
                  Carregamento
                </SortableHeader>
                <SortableHeader columnKey="driver" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">
                  Motorista
                </SortableHeader>
                <SortableHeader columnKey="date" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">
                  Data
                </SortableHeader>
                <SortableHeader columnKey="orderValue" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">
                  Valor do Pedido
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
                const allAvailable = [...orders, ...supportOrders as unknown as Order[], ...extraOrders];
                const loadOrders = allAvailable.filter((o) => load.orderIds.includes(o.id));
                const totalOrderValue = loadOrders.reduce((acc, o) => acc + (o.totalPedidoVenda || getOrderTotal(o)), 0);


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
                      <Link
                        to={`/carregamento/editar/${load.id}`}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/50 transition-all font-display text-xs font-bold uppercase tracking-tight shadow-sm"
                      >
                        <Edit2 className="h-3 w-3" />
                        Editar
                      </Link>
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
    </div>
  );
};

export default LoadsPage;
