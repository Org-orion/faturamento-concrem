import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { formatCurrency, getOrderTotal, statusColors, StatusBadge } from '@/components/shared';
import { roleLabel } from '@/utils/access';
import { useTableSort } from '@/hooks/useTableSort';
import { useQuickFilter } from '@/hooks/useQuickFilter';
import { useColumnFilters } from '@/hooks/useColumnFilters';
import { SortableHeader } from '@/components/table/SortableHeader';
import { QuickFilterBar } from '@/components/table/QuickFilterBar';
import { ColumnFilterRow, type ColFilterSlot } from '@/components/table/ColumnFilterRow';
import type { Order } from '@/types';

const AnimatedCounter = ({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) => {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    const start = 0;
    const duration = 800;
    const startTime = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.floor(start + (value - start) * eased));
      if (progress < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [value]);

  return <span className="animate-count-up">{prefix}{typeof value === 'number' && prefix === 'R$ ' ? display.toLocaleString('pt-BR') : display}{suffix}</span>;
};

const SimpleBarChart = ({ data }: { data: { label: string; value: number }[] }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-3 h-48 px-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2">
          <span className="text-xs font-mono-data text-muted-foreground">{formatCurrency(d.value)}</span>
          <div
            className="w-full bg-primary/80 rounded-t-md transition-all duration-700 ease-out"
            style={{ height: `${(d.value / max) * 100}%`, minHeight: 4, animationDelay: `${i * 100}ms` }}
          />
          <span className="text-xs font-display text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

const Dashboard = () => {
  const { orders, invoices, drivers, user } = useApp();
  const role = user?.role || 'ADMIN';

  const activeDrivers = drivers.filter(d => d.status === 'Em Trânsito').length;

  const totalInvoiced = invoices.filter(i => i.paymentStatus === 'Pago').reduce((s, i) => s + i.value, 0);
  const visibleOrders = orders.filter((o) => {
    if (role === 'FATURAMENTO') return ['Liberado p/ Produção', 'Em Carregamento', 'Produção Concluída', 'Despachado', 'Em Rota', 'Entregue', 'Cancelado'].includes(o.status);
    if (role === 'COMERCIAL') return o.status === 'Aguardando Avaliação' || o.status === 'Liberado p/ Produção';
    if (role === 'PRODUCAO') return ['Liberado p/ Produção', 'Em Carregamento', 'Produção Concluída'].includes(o.status);
    return true;
  });

  const delivered = visibleOrders.filter(o => o.status === 'Entregue').length;
  const inTransit = visibleOrders.filter(o => o.status === 'Em Rota').length;
  const inPrep = visibleOrders.filter(o => o.status === 'Em Carregamento' || o.status === 'Despachado').length;
  const awaitingEval = orders.filter(o => o.status === 'Aguardando Avaliação').length;
  const releasedForProd = orders.filter(o => o.status === 'Liberado p/ Produção').length;
  const openInvoices = invoices.filter(i => i.paymentStatus === 'Pendente' || i.paymentStatus === 'Vencido').length;
  const activeRepresentatives = new Set(orders.map(o => o.representativeName || o.representativeId || o.clientId)).size;

  const months = ['Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar'];
  const chartData = months.map((m, i) => ({ label: m, value: Math.floor(Math.random() * 15000) + 5000 + (i * 2000) }));
  chartData[5] = { label: 'Mar', value: totalInvoiced || 2300 };

  const lastOrders = [...visibleOrders].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  const { sortState, toggleSort, sortItems } = useTableSort();
  const { query, setQuery, filterItems } = useQuickFilter<Order>();

  const textGetters: Array<(item: Order) => unknown> = useMemo(
    () => [
      (o: Order) => o.id,
      (o: Order) => o.representativeName,
      (o: Order) => o.status,
    ],
    [],
  );

  const sortGetters: Record<string, (item: Order) => unknown> = useMemo(
    () => ({
      pedido: (o: Order) => o.id,
      representante: (o: Order) => o.representativeName,
      data: (o: Order) => o.date,
      valor: (o: Order) => getOrderTotal(o),
      status: (o: Order) => o.status,
    }),
    [],
  );

  const colFilter = useColumnFilters();

  const colFilterSlots: ColFilterSlot[] = useMemo(() => [
    { key: 'pedido', type: 'text', placeholder: 'Pedido...' },
    { key: 'representante', type: 'text', placeholder: 'Representante...' },
    { key: 'data', type: 'date' },
    { key: 'valor', type: 'number', placeholder: 'Valor...' },
    { key: 'status', type: 'select', options: [
      { value: 'Aguardando Avaliação', label: 'Aguardando Avaliação' },
      { value: 'Liberado p/ Produção', label: 'Liberado p/ Produção' },
      { value: 'Em Carregamento', label: 'Em Carregamento' },
      { value: 'Produção Concluída', label: 'Produção Concluída' },
      { value: 'Despachado', label: 'Despachado' },
      { value: 'Em Rota', label: 'Em Rota' },
      { value: 'Entregue', label: 'Entregue' },
      { value: 'Cancelado', label: 'Cancelado' },
    ]},
  ], []);

  const colFilterDefs = useMemo(() => [
    { key: 'pedido', getter: (o: Order) => o.id },
    { key: 'representante', getter: (o: Order) => o.representativeName },
    { key: 'data', getter: (o: Order) => o.date },
    { key: 'valor', getter: (o: Order) => String(getOrderTotal(o)) },
    { key: 'status', getter: (o: Order) => o.status, match: 'exact' as const },
  ], []);

  const displayedOrders = useMemo(
    () => sortItems(filterItems(colFilter.filterItems(lastOrders, colFilterDefs), textGetters), sortGetters),
    [lastOrders, filterItems, textGetters, sortItems, sortGetters, colFilter.filterItems, colFilterDefs],
  );

  const representativeVolume = (() => {
    const acc = new Map<string, number>();
    for (const o of visibleOrders) {
      const key = o.representativeName || o.representativeId || o.clientId;
      if (!key) continue;
      acc.set(key, (acc.get(key) || 0) + getOrderTotal(o));
    }
    return [...acc.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  })();

  const cards = role === 'ADMIN'
    ? [
        { label: 'Total Faturado', value: totalInvoiced, prefix: 'R$ ', color: 'bg-card-green' },
        { label: 'Aguardando Avaliação', value: awaitingEval, color: 'bg-card-orange' },
        { label: 'Em Programação', value: releasedForProd + inPrep + inTransit, color: 'bg-card-blue' },
        { label: 'Representantes Ativos', value: activeRepresentatives, color: 'bg-card-dark-blue' },
      ]
    : role === 'FATURAMENTO'
      ? [
          { label: 'Em Programação', value: inPrep + inTransit, color: 'bg-card-blue' },
          { label: 'Entregues', value: delivered, color: 'bg-card-green' },
          { label: 'Faturas Pendentes', value: openInvoices, color: 'bg-card-purple' },
          { label: 'Total Faturado', value: totalInvoiced, prefix: 'R$ ', color: 'bg-card-green' },
        ]
      : role === 'PRODUCAO'
        ? [
            { label: 'Liberados p/ Produção', value: releasedForProd, color: 'bg-card-orange' },
            { label: 'Em Carregamento', value: orders.filter(o => o.status === 'Em Carregamento').length, color: 'bg-card-red' },
            { label: 'Produção Concluída', value: orders.filter(o => o.status === 'Produção Concluída').length, color: 'bg-card-green' },
            { label: 'Total de Pedidos', value: visibleOrders.length, color: 'bg-card-dark-blue' },
          ]
      : [
          { label: 'Aguardando Avaliação', value: awaitingEval, color: 'bg-card-orange' },
          { label: 'Liberados', value: releasedForProd, color: 'bg-card-green' },
          { label: 'Total de Pedidos', value: visibleOrders.length, color: 'bg-card-red' },
          { label: 'Valor em Análise', value: orders.filter(o => o.status === 'Aguardando Avaliação').reduce((s, o) => s + getOrderTotal(o), 0), prefix: 'R$ ', color: 'bg-card-dark-blue' },
        ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold font-sans text-foreground tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral — perfil {roleLabel[role]}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, i) => (
          <div key={i} className={`${card.color} rounded-xl p-6 shadow-card hover:shadow-card-hover transition-all duration-300 text-white relative overflow-hidden group`}>
            <div className="relative z-10">
              <p className="text-sm font-medium opacity-90 mb-1">{card.label}</p>
              <h3 className="text-3xl font-bold tracking-tight">
                <AnimatedCounter value={card.value} prefix={card.prefix || ''} />
              </h3>
            </div>
            {/* Decorative background element */}
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-500" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-card rounded-xl p-6 shadow-card border border-border hover:shadow-card-hover transition-all">
          <h3 className="text-lg font-semibold font-sans text-foreground mb-6">Faturamento — Últimos 6 Meses</h3>
          <SimpleBarChart data={chartData} />
        </div>

        <div className="bg-card rounded-xl p-6 shadow-card border border-border hover:shadow-card-hover transition-all">
          <h3 className="text-lg font-semibold font-sans text-foreground mb-6">Top 5 Representantes por Volume</h3>
          <div className="space-y-4">
            {representativeVolume.map((c, i) => (
              <div key={c.name} className="flex items-center justify-between group">
                <div className="flex items-center gap-4">
                  <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary text-xs font-bold flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">{i + 1}</span>
                  <span className="text-sm font-medium text-foreground">{c.name}</span>
                </div>
                <span className="text-sm font-semibold text-foreground">{formatCurrency(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl p-6 shadow-card border border-border hover:shadow-card-hover transition-all">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold font-sans text-foreground">Últimos Pedidos</h3>
          <button className="text-sm font-medium text-primary hover:text-primary-hover transition-colors">Ver todos</button>
        </div>
        <QuickFilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Buscar pedido, representante, status..."
        />
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead>
              <ColumnFilterRow columns={colFilterSlots} values={colFilter.values} onChange={colFilter.setFilter} />
              <tr className="border-b border-border">
                <SortableHeader columnKey="pedido" sortState={sortState} onToggle={toggleSort} className="text-left py-3 px-4">Pedido</SortableHeader>
                <SortableHeader columnKey="representante" sortState={sortState} onToggle={toggleSort} className="text-left py-3 px-4">Representante</SortableHeader>
                <SortableHeader columnKey="data" sortState={sortState} onToggle={toggleSort} className="text-left py-3 px-4">Data</SortableHeader>
                <SortableHeader columnKey="valor" sortState={sortState} onToggle={toggleSort} className="text-right py-3 px-4">Valor</SortableHeader>
                <SortableHeader columnKey="status" sortState={sortState} onToggle={toggleSort} className="text-left py-3 px-4">Status</SortableHeader>
              </tr>
            </thead>
            <tbody>
              {displayedOrders.map((o) => (
                <tr key={o.id} className="border-b border-border/50 hover:bg-muted transition-colors">
                  <td className="py-4 px-4 font-medium text-foreground">{o.id}</td>
                  <td className="py-4 px-4 text-foreground">{o.representativeName || '-'}</td>
                  <td className="py-4 px-4 text-muted-foreground">{new Date(o.date).toLocaleDateString('pt-BR')}</td>
                  <td className="py-4 px-4 text-right font-semibold text-foreground">{formatCurrency(getOrderTotal(o))}</td>
                  <td className="py-4 px-4"><StatusBadge status={o.status} colorMap={statusColors} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
