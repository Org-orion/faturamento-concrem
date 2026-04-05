import React, { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { formatCurrency } from '@/components/shared';
import { todayBR, fmtDate } from '@/lib/dateUtils';
import { Truck, DollarSign, Weight, Package, TrendingUp, Calendar } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area,
} from 'recharts';

type Period = 'today' | 'week' | 'month' | 'all' | 'custom';

const PERIOD_LABELS: Record<Exclude<Period, 'custom'>, string> = {
  today: 'Hoje',
  week: 'Semana',
  month: 'Mês',
  all: 'Todos',
};

const STATUS_COLORS: Record<string, string> = {
  'Aguardando Despacho': '#f59e0b',
  'Despachado': '#3b82f6',
  'Em Rota': '#8b5cf6',
  'Entregue': '#22c55e',
  'Cancelado': '#ef4444',
};

function startOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday-based week
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function startOfMonth(dateStr: string): string {
  return dateStr.slice(0, 7) + '-01';
}

const CarregamentoDashboard = () => {
  const { loads, drivers, orders, supportOrders } = useApp();
  const [period, setPeriod] = useState<Period>('month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const today = todayBR();

  const filtered = useMemo(() => {
    if (period === 'custom') {
      if (!dateFrom && !dateTo) return loads;
      return loads.filter((l) => {
        const d = l.plannedDate?.slice(0, 10);
        if (!d) return false;
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
      });
    }
    if (period === 'all') return loads;
    const todayDate = new Date(today + 'T12:00:00');
    return loads.filter((l) => {
      const d = l.plannedDate?.slice(0, 10);
      if (!d) return false;
      if (period === 'today') return d === today;
      if (period === 'week') {
        const loadDate = new Date(d + 'T12:00:00');
        const diff = (todayDate.getTime() - loadDate.getTime()) / 86400000;
        return diff >= 0 && diff < 7;
      }
      // month
      return d.slice(0, 7) === today.slice(0, 7);
    });
  }, [loads, period, today, dateFrom, dateTo]);

  // KPIs
  const totalLoads = filtered.length;
  const totalFreight = filtered.reduce((s, l) => s + (l.freightValue || 0), 0);
  const totalWeight = filtered.reduce((s, l) => s + (l.estimatedWeight || 0), 0);
  const totalOrders = filtered.reduce((s, l) => s + l.orderIds.length, 0);
  const avgOrdersPerLoad = totalLoads > 0 ? (totalOrders / totalLoads).toFixed(1) : '0';

  // Status distribution (pie)
  const statusData = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of filtered) {
      const s = l.shipmentStatus || 'Aguardando Despacho';
      map.set(s, (map.get(s) || 0) + 1);
    }
    return Array.from(map, ([name, value]) => ({ name, value }));
  }, [filtered]);

  // Loads over time (bar)
  const loadsOverTime = useMemo(() => {
    const map = new Map<string, { date: string; count: number; freight: number }>();
    for (const l of filtered) {
      const d = l.plannedDate?.slice(0, 10);
      if (!d) continue;
      const key = period === 'all' ? d.slice(0, 7) : d;
      if (!map.has(key)) map.set(key, { date: key, count: 0, freight: 0 });
      const entry = map.get(key)!;
      entry.count += 1;
      entry.freight += l.freightValue || 0;
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered, period]);

  // Top drivers (bar)
  const topDrivers = useMemo(() => {
    const map = new Map<string, { name: string; count: number; freight: number }>();
    for (const l of filtered) {
      const driver = drivers.find((d) => d.id === l.driverId);
      const name = driver?.name || 'Sem motorista';
      if (!map.has(name)) map.set(name, { name, count: 0, freight: 0 });
      const entry = map.get(name)!;
      entry.count += 1;
      entry.freight += l.freightValue || 0;
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filtered, drivers]);

  const formatDateLabel = (d: string) => {
    if (d.length === 7) {
      const [y, m] = d.split('-');
      const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      return `${months[Number(m) - 1]}/${y.slice(2)}`;
    }
    return fmtDate(d);
  };

  const tooltipStyle = {
    contentStyle: { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' },
    labelStyle: { fontWeight: 600 },
  };

  return (
    <div className="space-y-6">
      {/* Period filter */}
      <div className="flex flex-wrap items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-muted-foreground">Período:</span>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(PERIOD_LABELS) as Exclude<Period, 'custom'>[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPeriod('custom')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              period === 'custom'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Personalizado
          </button>
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2 ml-1">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-7 px-2 text-xs rounded-lg border border-border bg-background text-foreground"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-7 px-2 text-xs rounded-lg border border-border bg-background text-foreground"
            />
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={Truck} label="Carregamentos" value={String(totalLoads)} color="text-primary" />
        <KpiCard icon={DollarSign} label="Frete Total" value={formatCurrency(totalFreight)} color="text-emerald-600" />
        <KpiCard icon={Weight} label="Peso Total" value={`${totalWeight.toLocaleString('pt-BR')} kg`} color="text-blue-600" />
        <KpiCard icon={Package} label="Pedidos" value={String(totalOrders)} color="text-orange-600" />
        <KpiCard icon={TrendingUp} label="Méd. Pedidos/Carreg." value={avgOrdersPerLoad} color="text-purple-600" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Status pie chart */}
        <div className="bg-card rounded-xl p-4 border border-border shadow-card">
          <h3 className="text-sm font-semibold text-foreground mb-3">Status dos Carregamentos</h3>
          {statusData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2}>
                  {statusData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Loads over time */}
        <div className="bg-card rounded-xl p-4 border border-border shadow-card lg:col-span-2">
          <h3 className="text-sm font-semibold text-foreground mb-3">Carregamentos por Período</h3>
          {loadsOverTime.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={loadsOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip {...tooltipStyle} labelFormatter={formatDateLabel} formatter={(v: number) => [v, 'Carregamentos']} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Freight value over time */}
        <div className="bg-card rounded-xl p-4 border border-border shadow-card">
          <h3 className="text-sm font-semibold text-foreground mb-3">Valor de Frete por Período</h3>
          {loadsOverTime.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={loadsOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...tooltipStyle} labelFormatter={formatDateLabel} formatter={(v: number) => [formatCurrency(v), 'Frete']} />
                <Area type="monotone" dataKey="freight" fill="hsl(var(--primary) / 0.15)" stroke="hsl(var(--primary))" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top drivers */}
        <div className="bg-card rounded-xl p-4 border border-border shadow-card">
          <h3 className="text-sm font-semibold text-foreground mb-3">Top Motoristas</h3>
          {topDrivers.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topDrivers} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [name === 'freight' ? formatCurrency(v) : v, name === 'freight' ? 'Frete' : 'Carregamentos']} />
                <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

function KpiCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div className="bg-card rounded-xl p-4 border border-border shadow-card flex items-center gap-3">
      <div className={`p-2.5 rounded-lg bg-muted ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide truncate">{label}</p>
        <p className="text-lg font-bold text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
      Nenhum dado para o período selecionado.
    </div>
  );
}

export default CarregamentoDashboard;
