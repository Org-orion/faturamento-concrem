import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { canDo, type UserRole } from '@/utils/access';
import { formatCurrency } from '@/components/shared';
import { todayBR, fmtDate } from '@/lib/dateUtils';
import { ChevronLeft, ChevronRight, Truck, Package, DollarSign, Weight, Search } from 'lucide-react';
import type { Load } from '@/types';
import { usePrioridades } from '@/contexts/PrioridadesContext';
import { PrioridadeDot } from '@/components/pedidos/PrioridadeBadge';
import { supabasePedidos } from '@/lib/supabase';

type ViewMode = 'semana' | 'mes' | 'lista';

const VIEW_LABELS: Record<ViewMode, string> = {
  semana: 'Semana',
  mes: 'Mês',
  lista: 'Lista',
};

const STATUS_COLORS: Record<string, string> = {
  'Aguardando Despacho': 'bg-amber-100 text-amber-800 border-amber-200',
  'Despachado':          'bg-blue-100 text-blue-800 border-blue-200',
  'Em Rota':             'bg-purple-100 text-purple-800 border-purple-200',
  'Entregue':            'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Cancelado':           'bg-red-100 text-red-800 border-red-200',
};

const STATUS_LEFT: Record<string, string> = {
  'Aguardando Despacho': 'bg-amber-400',
  'Despachado':          'bg-blue-500',
  'Em Rota':             'bg-purple-500',
  'Entregue':            'bg-emerald-500',
  'Cancelado':           'bg-red-500',
};

const DAYS_BR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_BR = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── date helpers ──────────────────────────────────────────────────────────────

function parseISO(d: string) {
  return new Date(d + 'T12:00:00');
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function mondayOfWeek(dateStr: string) {
  const d = parseISO(dateStr);
  const day = d.getDay(); // 0=sun
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return toISO(d);
}

function addDays(dateStr: string, n: number) {
  const d = parseISO(dateStr);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function addMonths(dateStr: string, n: number) {
  const d = parseISO(dateStr);
  d.setMonth(d.getMonth() + n);
  return toISO(d);
}

function firstDayOfMonth(dateStr: string) {
  return dateStr.slice(0, 7) + '-01';
}

function daysInMonth(dateStr: string) {
  const d = parseISO(dateStr);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

// ── sub-components ────────────────────────────────────────────────────────────

interface LoadCardProps {
  load: Load;
  driverName: string;
  compact?: boolean;
  canEdit?: boolean;
  priorityNivel?: string;
}

function LoadCard({ load, driverName, compact, canEdit = true, priorityNivel }: LoadCardProps) {
  const status = load.shipmentStatus || 'Aguardando Despacho';
  const colorClass = STATUS_COLORS[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  const leftClass = STATUS_LEFT[status] || 'bg-gray-400';

  if (compact) {
    const cls = `flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-semibold truncate ${colorClass} hover:opacity-80 transition-opacity`;
    const content = <>{priorityNivel && <PrioridadeDot nivel={priorityNivel as any} />}<Truck className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{driverName}</span></>;
    return canEdit ? (
      <Link to={`/carregamento/editar/${load.id}`} className={cls} title={`${driverName} — ${formatCurrency(load.freightValue || 0)}`}>{content}</Link>
    ) : (
      <div className={cls} title={`${driverName} — ${formatCurrency(load.freightValue || 0)}`}>{content}</div>
    );
  }

  const innerContent = (
    <>
      <div className={`w-1 shrink-0 ${leftClass}`} />
      <div className="flex-1 p-3 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-xs font-semibold truncate text-foreground group-hover:text-primary">{driverName}</span>
          </div>
          <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colorClass}`}>{status}</span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {priorityNivel && <span className="flex items-center gap-1"><PrioridadeDot nivel={priorityNivel as any} /></span>}
          <span className="flex items-center gap-1"><Package className="h-3 w-3" />{load.orderIds.length} pedido{load.orderIds.length !== 1 ? 's' : ''}</span>
          <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{formatCurrency(load.freightValue || 0)}</span>
          {(load.estimatedWeight || 0) > 0 && (
            <span className="flex items-center gap-1"><Weight className="h-3 w-3" />{(load.estimatedWeight || 0).toLocaleString('pt-BR')} kg</span>
          )}
        </div>
      </div>
    </>
  );

  return canEdit ? (
    <Link to={`/carregamento/editar/${load.id}`} className="flex rounded-lg border border-border bg-card overflow-hidden hover:shadow-md transition-shadow group">{innerContent}</Link>
  ) : (
    <div className="flex rounded-lg border border-border bg-card overflow-hidden group">{innerContent}</div>
  );
}

// ── day column (week view) ────────────────────────────────────────────────────

function getLoadPriorityNivel(load: Load, prioMap: Map<string, { nivel: string }>): string | undefined {
  for (const nivel of ['urgente', 'alta', 'media'] as const) {
    if (load.orderIds.some(id => prioMap.get(id)?.nivel === nivel)) return nivel;
  }
  return undefined;
}

function DayColumn({ dateStr, loads, driverMap, today, canEdit, prioMap }: { dateStr: string; loads: Load[]; driverMap: Map<string, string>; today: string; canEdit: boolean; prioMap: Map<string, { nivel: string }> }) {
  const d = parseISO(dateStr);
  const dayName = DAYS_BR[d.getDay()];
  const dayNum = d.getDate();
  const isToday = dateStr === today;
  const totalFreight = loads.reduce((s, l) => s + (l.freightValue || 0), 0);

  return (
    <div className={`flex flex-col min-h-[120px] ${isToday ? 'bg-primary/5 rounded-xl ring-1 ring-primary/30' : ''}`}>
      <div className={`px-2 py-2 text-center border-b border-border ${isToday ? 'border-primary/20' : ''}`}>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{dayName}</div>
        <div className={`text-lg font-bold leading-none mt-0.5 ${isToday ? 'text-primary' : 'text-foreground'}`}>{dayNum}</div>
        {loads.length > 0 && (
          <div className="text-[9px] font-semibold text-emerald-600 mt-1">{formatCurrency(totalFreight)}</div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 p-2">
        {loads.length === 0 ? (
          <div className="text-[10px] text-muted-foreground/50 text-center py-2">—</div>
        ) : (
          loads.map((l) => (
            <LoadCard key={l.id} load={l} driverName={driverMap.get(l.driverId) || 'Sem motorista'} canEdit={canEdit} priorityNivel={getLoadPriorityNivel(l, prioMap)} />
          ))
        )}
      </div>
    </div>
  );
}

// ── month cell ────────────────────────────────────────────────────────────────

function MonthCell({ dateStr, loads, driverMap, today, currentMonth, canEdit, prioMap }: { dateStr: string; loads: Load[]; driverMap: Map<string, string>; today: string; currentMonth: string; canEdit: boolean; prioMap: Map<string, { nivel: string }> }) {
  const d = parseISO(dateStr);
  const dayNum = d.getDate();
  const isToday = dateStr === today;
  const isCurrentMonth = dateStr.slice(0, 7) === currentMonth;
  const totalFreight = loads.reduce((s, l) => s + (l.freightValue || 0), 0);

  return (
    <div className={`min-h-[90px] p-1.5 border-b border-r border-border/50 ${!isCurrentMonth ? 'bg-muted/30' : ''}`}>
      <div className={`flex items-center justify-between mb-1`}>
        <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-primary-foreground' : isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/40'}`}>
          {dayNum}
        </span>
        {loads.length > 0 && isCurrentMonth && (
          <span className="text-[9px] font-semibold text-emerald-600">{formatCurrency(totalFreight)}</span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        {loads.slice(0, 3).map((l) => (
          <LoadCard key={l.id} load={l} driverName={driverMap.get(l.driverId) || 'Sem motorista'} compact canEdit={canEdit} priorityNivel={getLoadPriorityNivel(l, prioMap)} />
        ))}
        {loads.length > 3 && (
          <span className="text-[10px] text-muted-foreground font-semibold pl-1">+{loads.length - 3} mais</span>
        )}
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

const CarregamentoDashboard = () => {
  const { loads, drivers, user } = useApp();
  const { map: prioMap } = usePrioridades();
  const today = todayBR();

  const canEditLoad = useMemo(() => {
    if (!user) return false;
    return canDo(user.role as UserRole, user.permissions ?? null, 'programacao', 'edit');
  }, [user]);

  const [view, setView] = useState<ViewMode>('semana');
  const [anchor, setAnchor] = useState(today); // week: monday, month: first of month, list: any
  const [pedidoFilter, setPedidoFilter] = useState('');

  const driverMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of drivers) m.set(d.id, d.name);
    return m;
  }, [drivers]);

  // ── week view ──
  const weekStart = useMemo(() => mondayOfWeek(anchor), [anchor]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // ── month view ──
  const monthStr = useMemo(() => anchor.slice(0, 7), [anchor]);
  const monthFirst = useMemo(() => firstDayOfMonth(anchor), [anchor]);
  const calendarCells = useMemo(() => {
    const first = parseISO(monthFirst);
    const startDay = first.getDay(); // 0=sun
    const startOffset = startDay === 0 ? 6 : startDay - 1; // monday-based
    const total = daysInMonth(monthFirst);
    const cells: string[] = [];
    for (let i = startOffset; i > 0; i--) cells.push(addDays(monthFirst, -i));
    for (let i = 0; i < total; i++) cells.push(addDays(monthFirst, i));
    while (cells.length % 7 !== 0) cells.push(addDays(cells[cells.length - 1], 1));
    return cells;
  }, [monthFirst]);

  // ── filtered loads ──
  const filteredLoads = useMemo(() => {
    const q = pedidoFilter.trim();
    if (!q) return loads;
    return loads.filter((l) => l.orderIds.some((id) => id.includes(q)));
  }, [loads, pedidoFilter]);

  // ── loads by date ──
  const loadsByDate = useMemo(() => {
    const m = new Map<string, Load[]>();
    for (const l of filteredLoads) {
      const d = l.plannedDate?.slice(0, 10);
      if (!d) continue;
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(l);
    }
    return m;
  }, [filteredLoads]);

  // ── list view: all dates with loads, sorted ──
  const listDates = useMemo(() => {
    return Array.from(loadsByDate.keys()).sort();
  }, [loadsByDate]);

  // ── navigation ──
  function prev() {
    if (view === 'semana') setAnchor(addDays(weekStart, -7));
    else if (view === 'mes') setAnchor(addMonths(monthFirst, -1));
    else setAnchor(addDays(anchor, -30));
  }
  function next() {
    if (view === 'semana') setAnchor(addDays(weekStart, 7));
    else if (view === 'mes') setAnchor(addMonths(monthFirst, 1));
    else setAnchor(addDays(anchor, 30));
  }
  function goToday() { setAnchor(today); }

  function periodLabel() {
    if (view === 'semana') {
      const from = parseISO(weekStart);
      const to = parseISO(addDays(weekStart, 6));
      if (from.getMonth() === to.getMonth()) {
        return `${from.getDate()} – ${to.getDate()} de ${MONTHS_BR[from.getMonth()]} ${from.getFullYear()}`;
      }
      return `${from.getDate()} ${MONTHS_BR[from.getMonth()].slice(0, 3)} – ${to.getDate()} ${MONTHS_BR[to.getMonth()].slice(0, 3)} ${to.getFullYear()}`;
    }
    if (view === 'mes') {
      const d = parseISO(monthFirst);
      return `${MONTHS_BR[d.getMonth()]} ${d.getFullYear()}`;
    }
    return 'Todos os carregamentos';
  }

  // ── busca valores dos pedidos da semana diretamente no ERP ──
  const [weekOrderValueMap, setWeekOrderValueMap] = useState<Map<string, number>>(new Map());
  const lastFetchKey = useRef('');

  const weekOrderIds = useMemo(() => {
    const wLoads = weekDays.flatMap((d) => loadsByDate.get(d) || []);
    return [...new Set(wLoads.flatMap((l) => l.orderIds))];
  }, [weekDays, loadsByDate]);

  useEffect(() => {
    const fetchKey = weekOrderIds.join(',');
    if (!fetchKey || fetchKey === lastFetchKey.current || !supabasePedidos) return;
    lastFetchKey.current = fetchKey;

    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
    const BATCH = 200;
    const chunks: string[][] = [];
    for (let i = 0; i < weekOrderIds.length; i += BATCH) chunks.push(weekOrderIds.slice(i, i + BATCH));

    Promise.all(
      chunks.map((batch) =>
        supabasePedidos!.from(table)
          .select('numero_pedido, total_pedido_venda, total_produtos, frete')
          .in('numero_pedido', batch)
          .then(({ data }) => data || [])
      )
    ).then((results) => {
      const m = new Map<string, number>();
      for (const row of results.flat()) {
        const orderVal = (row.total_pedido_venda > 0 ? row.total_pedido_venda : row.total_produtos) || 0;
        const frete = row.frete || 0;
        m.set(String(row.numero_pedido), orderVal + frete);
      }
      setWeekOrderValueMap(m);
    });
  }, [weekOrderIds]);

  // ── week totals ──
  const weekTotals = useMemo(() => {
    const wLoads = weekDays.flatMap((d) => loadsByDate.get(d) || []);
    return {
      count: wLoads.length,
      freight: wLoads.reduce((s, l) => s + (l.freightValue || 0), 0),
      orders: wLoads.reduce((s, l) => s + l.orderIds.length, 0),
      total: wLoads.reduce((s, l) => s + l.orderIds.reduce((a, id) => a + (weekOrderValueMap.get(id) || 0), 0), 0),
    };
  }, [weekDays, loadsByDate, weekOrderValueMap]);

  // ── busca valores dos pedidos do mês diretamente no ERP ──
  const [monthOrderValueMap, setMonthOrderValueMap] = useState<Map<string, number>>(new Map());
  const lastMonthFetchKey = useRef('');

  const monthOrderIds = useMemo(() => {
    const mLoads = calendarCells
      .filter((d) => d.startsWith(monthStr))
      .flatMap((d) => loadsByDate.get(d) || []);
    return [...new Set(mLoads.flatMap((l) => l.orderIds))];
  }, [calendarCells, monthStr, loadsByDate]);

  useEffect(() => {
    const fetchKey = monthOrderIds.join(',');
    if (!fetchKey || fetchKey === lastMonthFetchKey.current || !supabasePedidos) return;
    lastMonthFetchKey.current = fetchKey;

    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
    const BATCH = 200;
    const chunks: string[][] = [];
    for (let i = 0; i < monthOrderIds.length; i += BATCH) chunks.push(monthOrderIds.slice(i, i + BATCH));

    Promise.all(
      chunks.map((batch) =>
        supabasePedidos!.from(table)
          .select('numero_pedido, total_pedido_venda, total_produtos, frete')
          .in('numero_pedido', batch)
          .then(({ data }) => data || [])
      )
    ).then((results) => {
      const m = new Map<string, number>();
      for (const row of results.flat()) {
        const orderVal = (row.total_pedido_venda > 0 ? row.total_pedido_venda : row.total_produtos) || 0;
        const frete = row.frete || 0;
        m.set(String(row.numero_pedido), orderVal + frete);
      }
      setMonthOrderValueMap(m);
    });
  }, [monthOrderIds]);

  // ── month totals ──
  const monthTotals = useMemo(() => {
    const mLoads = calendarCells
      .filter((d) => d.startsWith(monthStr))
      .flatMap((d) => loadsByDate.get(d) || []);
    return {
      count: mLoads.length,
      orders: mLoads.reduce((s, l) => s + l.orderIds.length, 0),
      total: mLoads.reduce((s, l) => s + l.orderIds.reduce((a, id) => a + (monthOrderValueMap.get(id) || 0), 0), 0),
    };
  }, [calendarCells, monthStr, loadsByDate, monthOrderValueMap]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* View mode */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(Object.keys(VIEW_LABELS) as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === v ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>

        {/* Navigation */}
        {view !== 'lista' && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prev}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="h-7 px-3 text-xs font-semibold rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={next}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="ml-2 text-sm font-semibold text-foreground">{periodLabel()}</span>
          </div>
        )}

        {/* Filtro por pedido */}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={pedidoFilter}
            onChange={(e) => setPedidoFilter(e.target.value)}
            placeholder="Filtrar por nº pedido..."
            className="pl-8 pr-3 py-1.5 w-48 text-xs rounded-lg border border-input bg-card text-foreground font-display focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors"
          />
        </div>

        {/* Week summary chips */}
        {view === 'semana' && weekTotals.count > 0 && (
          <div className="flex gap-2">
            <Chip icon={Truck} value={String(weekTotals.count)} label="carreg." />
            <Chip icon={Package} value={String(weekTotals.orders)} label="pedidos" />
            <Chip icon={DollarSign} value={formatCurrency(weekTotals.total)} label="total" color="text-emerald-600" />
          </div>
        )}

        {/* Month summary chips */}
        {view === 'mes' && monthTotals.count > 0 && (
          <div className="flex gap-2">
            <Chip icon={Truck} value={String(monthTotals.count)} label="carreg." />
            <Chip icon={Package} value={String(monthTotals.orders)} label="pedidos" />
            <Chip icon={DollarSign} value={formatCurrency(monthTotals.total)} label="total" color="text-emerald-600" />
          </div>
        )}
      </div>

      {/* ── WEEK VIEW ── */}
      {view === 'semana' && (
        <div className="grid grid-cols-7 gap-1 rounded-xl border border-border overflow-hidden bg-card">
          {weekDays.map((d) => (
            <DayColumn
              key={d}
              dateStr={d}
              loads={loadsByDate.get(d) || []}
              driverMap={driverMap}
              today={today}
              canEdit={canEditLoad}
              prioMap={prioMap}
            />
          ))}
        </div>
      )}

      {/* ── MONTH VIEW ── */}
      {view === 'mes' && (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border bg-muted/40">
            {DAYS_BR.slice(1).concat(DAYS_BR[0]).map((d) => (
              <div key={d} className="px-2 py-2 text-[11px] font-semibold text-muted-foreground text-center">{d}</div>
            ))}
          </div>
          {/* Cells */}
          <div className="grid grid-cols-7">
            {calendarCells.map((d) => (
              <MonthCell
                key={d}
                dateStr={d}
                loads={loadsByDate.get(d) || []}
                driverMap={driverMap}
                today={today}
                currentMonth={monthStr}
                canEdit={canEditLoad}
                prioMap={prioMap}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {view === 'lista' && (
        <div className="space-y-6">
          {listDates.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-12">Nenhum carregamento cadastrado.</div>
          ) : (
            listDates.map((d) => {
              const dayLoads = loadsByDate.get(d) || [];
              const totalFreight = dayLoads.reduce((s, l) => s + (l.freightValue || 0), 0);
              const totalOrders = dayLoads.reduce((s, l) => s + l.orderIds.length, 0);
              return (
                <div key={d}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`text-sm font-bold ${d === today ? 'text-primary' : 'text-foreground'}`}>
                      {fmtDate(d)}
                      {d === today && <span className="ml-2 text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full">Hoje</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">{dayLoads.length} carreg. · {totalOrders} pedidos · {formatCurrency(totalFreight)}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {dayLoads.map((l) => (
                      <LoadCard key={l.id} load={l} driverName={driverMap.get(l.driverId) || 'Sem motorista'} canEdit={canEditLoad} priorityNivel={getLoadPriorityNivel(l, prioMap)} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

function Chip({ icon: Icon, value, label, color = 'text-foreground' }: { icon: React.ElementType; value: string; label: string; color?: string }) {
  return (
    <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-xs font-semibold">
      <Icon className={`h-3 w-3 ${color}`} />
      <span className={color}>{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

export default CarregamentoDashboard;
