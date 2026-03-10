import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { formatCurrency, getOrderTotal, statusColors, StatusBadge } from '@/components/shared';

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
  const { clients, orders, invoices } = useApp();

  const totalInvoiced = invoices.filter(i => i.paymentStatus === 'Pago').reduce((s, i) => s + i.value, 0);
  const openOrders = orders.filter(o => o.status !== 'Entregue' && o.status !== 'Cancelado').length;
  const delivered = orders.filter(o => o.status === 'Entregue').length;
  const activeClients = new Set(orders.map(o => o.clientId)).size;

  const months = ['Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar'];
  const chartData = months.map((m, i) => ({ label: m, value: Math.floor(Math.random() * 15000) + 5000 + (i * 2000) }));
  chartData[5] = { label: 'Mar', value: totalInvoiced || 2300 };

  const lastOrders = [...orders].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  const clientVolume = clients.map(c => ({
    ...c,
    total: orders.filter(o => o.clientId === c.id).reduce((s, o) => s + getOrderTotal(o), 0),
  })).sort((a, b) => b.total - a.total).slice(0, 5);

  const cards = [
    { label: 'Total Faturado', value: totalInvoiced, prefix: 'R$ ', color: 'text-success' },
    { label: 'Pedidos em Aberto', value: openOrders, color: 'text-warning' },
    { label: 'Pedidos Entregues', value: delivered, color: 'text-info' },
    { label: 'Clientes Ativos', value: activeClients, color: 'text-primary' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold font-display text-foreground">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <div key={i} className="bg-card rounded-lg p-5 shadow-sm border border-border">
            <p className="text-sm text-muted-foreground font-display">{card.label}</p>
            <p className={`text-2xl font-bold font-mono-data mt-2 ${card.color}`}>
              <AnimatedCounter value={card.value} prefix={card.prefix || ''} />
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg p-5 shadow-sm border border-border">
          <h3 className="text-sm font-semibold font-display text-foreground mb-4">Faturamento — Últimos 6 Meses</h3>
          <SimpleBarChart data={chartData} />
        </div>

        <div className="bg-card rounded-lg p-5 shadow-sm border border-border">
          <h3 className="text-sm font-semibold font-display text-foreground mb-4">Top 5 Clientes por Volume</h3>
          <div className="space-y-3">
            {clientVolume.map((c, i) => (
              <div key={c.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="text-sm font-display">{c.name}</span>
                </div>
                <span className="text-sm font-mono-data text-muted-foreground">{formatCurrency(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg p-5 shadow-sm border border-border">
        <h3 className="text-sm font-semibold font-display text-foreground mb-4">Últimos Pedidos</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 font-display font-medium text-muted-foreground">Pedido</th>
                <th className="text-left py-2 px-3 font-display font-medium text-muted-foreground">Cliente</th>
                <th className="text-left py-2 px-3 font-display font-medium text-muted-foreground">Data</th>
                <th className="text-right py-2 px-3 font-display font-medium text-muted-foreground">Valor</th>
                <th className="text-left py-2 px-3 font-display font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {lastOrders.map((o, i) => {
                const client = clients.find(c => c.id === o.clientId);
                return (
                  <tr key={o.id} className={`border-b border-border/50 hover:bg-muted/50 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                    <td className="py-2.5 px-3 font-mono-data">{o.id}</td>
                    <td className="py-2.5 px-3 font-display">{client?.name || '-'}</td>
                    <td className="py-2.5 px-3 font-mono-data">{new Date(o.date).toLocaleDateString('pt-BR')}</td>
                    <td className="py-2.5 px-3 font-mono-data text-right">{formatCurrency(getOrderTotal(o))}</td>
                    <td className="py-2.5 px-3"><StatusBadge status={o.status} colorMap={statusColors} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
