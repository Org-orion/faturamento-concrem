import React, { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { formatCurrency, getOrderTotal, statusColors, StatusBadge } from '@/components/shared';
import { inputClass, btnPrimary } from '@/components/shared';

const ReportsPage = () => {
  const { clients, orders } = useApp();
  const [dateFrom, setDateFrom] = useState('2026-03-01');
  const [dateTo, setDateTo] = useState('2026-03-31');
  const [clientFilter, setClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (dateFrom && o.date < dateFrom) return false;
      if (dateTo && o.date > dateTo) return false;
      if (clientFilter && o.clientId !== clientFilter) return false;
      if (statusFilter && o.status !== statusFilter) return false;
      return true;
    });
  }, [orders, dateFrom, dateTo, clientFilter, statusFilter]);

  const totalRevenue = filtered.reduce((s, o) => s + getOrderTotal(o), 0);
  const delivered = filtered.filter(o => o.status === 'Entregue').length;
  const cancelled = filtered.filter(o => o.status === 'Cancelado').length;
  const avgTicket = filtered.length > 0 ? totalRevenue / filtered.length : 0;

  const exportCSV = () => {
    const headers = 'Pedido,Cliente,Data,Valor,Status\n';
    const rows = filtered.map(o => {
      const c = clients.find(cl => cl.id === o.clientId);
      return `${o.id},${c?.name || '-'},${o.date},${getOrderTotal(o)},${o.status}`;
    }).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${dateFrom}-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cards = [
    { label: 'Faturamento Total', value: formatCurrency(totalRevenue), color: 'text-success' },
    { label: 'Pedidos Entregues', value: delivered, color: 'text-info' },
    { label: 'Pedidos Cancelados', value: cancelled, color: 'text-destructive' },
    { label: 'Ticket Médio', value: formatCurrency(avgTicket), color: 'text-primary' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold font-display text-foreground">Relatórios</h1>

      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="text-xs font-display text-muted-foreground">Data Início</label>
          <input type="date" className={inputClass} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-display text-muted-foreground">Data Fim</label>
          <input type="date" className={inputClass} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-display text-muted-foreground">Cliente</label>
          <select className={inputClass} value={clientFilter} onChange={e => setClientFilter(e.target.value)}>
            <option value="">Todos</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-display text-muted-foreground">Status</label>
          <select className={inputClass} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Todos</option>
            {['Aguardando', 'Separando', 'Em Rota', 'Entregue', 'Cancelado'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <div key={i} className="bg-card rounded-lg p-5 shadow-sm border border-border">
            <p className="text-sm text-muted-foreground font-display">{card.label}</p>
            <p className={`text-2xl font-bold font-mono-data mt-2 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button className={btnPrimary} onClick={exportCSV}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar CSV
        </button>
      </div>

      <div className="bg-card rounded-lg shadow-sm border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {['Pedido', 'Cliente', 'Data', 'Valor', 'Status'].map(h => (
                <th key={h} className="text-left py-3 px-4 font-display font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((o, i) => {
              const client = clients.find(c => c.id === o.clientId);
              return (
                <tr key={o.id} className={`border-b border-border/50 hover:bg-muted/50 transition-colors ${i % 2 ? 'bg-muted/20' : ''}`}>
                  <td className="py-3 px-4 font-mono-data">{o.id}</td>
                  <td className="py-3 px-4 font-display">{client?.name || '-'}</td>
                  <td className="py-3 px-4 font-mono-data">{new Date(o.date).toLocaleDateString('pt-BR')}</td>
                  <td className="py-3 px-4 font-mono-data">{formatCurrency(getOrderTotal(o))}</td>
                  <td className="py-3 px-4"><StatusBadge status={o.status} colorMap={statusColors} /></td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground font-display">Nenhum pedido encontrado no período.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportsPage;
