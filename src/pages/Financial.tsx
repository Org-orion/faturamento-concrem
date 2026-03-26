import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import Modal from '@/components/Modal';
import { useToast } from '@/components/ToastProvider';
import { btnDanger, btnPrimary, btnSecondary, formatCurrency, getOrderTotal, inputClass } from '@/components/shared';
import { ExpenseType, FreightEntry, FreightEntryStatus, FreightExpenseLine, Order, PedidoStatusRow } from '@/types';
import { CheckCircle2, Eye, Plus, Printer, Settings2, Edit, Trash2, AlertTriangle } from 'lucide-react';
import { listPedidosStatusByPedidoIds } from '@/lib/pedidosStatusRepo';

function sumExpenses(lines: FreightExpenseLine[]) {
  return lines.reduce((s, l) => s + (Number(l.value) || 0), 0);
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

const Financial = () => {
  const { orders, drivers, freightEntries, expenseTypes, addExpenseType, updateExpenseType, addFreightEntry, updateFreightEntry, setFreightEntryStatus, deleteFreightEntry } = useApp();
  const { showToast } = useToast();

  const [q, setQ] = useState('');
  const [qLaunched, setQLaunched] = useState('');
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

  // Load pedido statuses to filter by entregue/finalizado
  const [pedidoStatusRows, setPedidoStatusRows] = useState<PedidoStatusRow[]>([]);
  const pedidoStatusMap = useMemo(() => new Map(pedidoStatusRows.map(r => [r.pedido_id, r] as const)), [pedidoStatusRows]);

  useEffect(() => {
    const ids = orders.map(o => o.id);
    if (!ids.length) return;
    void listPedidosStatusByPedidoIds(ids).then(setPedidoStatusRows);
  }, [orders.length]);

  const deliveredOrders = useMemo(
    () => orders.filter((o) => {
      const st = pedidoStatusMap.get(o.id)?.status_atual;
      return st === 'entregue' || st === 'finalizado' || st === 'faturado' || st === 'aguardando_pagamento';
    }),
    [orders, pedidoStatusMap],
  );

  const entryByOrderId = useMemo(() => {
    const m = new Map<string, FreightEntry>();
    for (const e of freightEntries) m.set(e.orderId, e);
    return m;
  }, [freightEntries]);

  const pendingOrders = useMemo(
    () => deliveredOrders.filter((o) => !entryByOrderId.has(o.id)),
    [deliveredOrders, entryByOrderId],
  );

  const allPendingRows = useMemo(() => {
    const rows = pendingOrders.map(o => ({ kind: 'pending' as const, order: o }));

    const query = q.trim().toLowerCase();
    const filtered = query
      ? rows.filter((r) => {
          const rep = r.order.representativeName;
          return `${r.order.id} ${rep || ''}`.toLowerCase().includes(query);
        })
      : rows;

    return filtered.sort((a, b) => b.order.date.localeCompare(a.order.date));
  }, [pendingOrders, q]);

  const allLaunchedRows = useMemo(() => {
    const rows = freightEntries.map(e => ({
      kind: 'entry' as const,
      entry: e,
      order: orders.find((o) => o.id === e.orderId)
    }));

    const query = qLaunched.trim().toLowerCase();
    const filtered = query
      ? rows.filter((r) => {
          const rep = r.order?.representativeName;
          return `${r.entry.orderId} ${rep || ''}`.toLowerCase().includes(query);
        })
      : rows;

    return filtered.sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt));
  }, [freightEntries, orders, qLaunched]);

  const summary = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const entriesMonth = freightEntries.filter((e) => monthKey(e.createdAt) === ym);
    const fretesLancados = entriesMonth.length;
    const pagoMotoristas = entriesMonth.reduce((s, e) => s + (Number(e.driverValue) || 0), 0);
    const outrasDespesas = entriesMonth.reduce((s, e) => s + sumExpenses(e.expenses), 0);
    return {
      fretesLancados,
      pagoMotoristas,
      outrasDespesas,
      pendentes: pendingOrders.length,
    };
  }, [freightEntries, pendingOrders.length]);

  const activeExpenseTypes = useMemo(() => expenseTypes.filter((t) => t.active), [expenseTypes]);

  const [orderId, setOrderId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [freightValue, setFreightValue] = useState(0);
  const [driverValue, setDriverValue] = useState(0);
  const [lines, setLines] = useState<FreightExpenseLine[]>([]);

  const selectedOrder = useMemo(() => deliveredOrders.find((o) => o.id === orderId) || null, [deliveredOrders, orderId]);
  const selectedDriver = useMemo(
    () => (selectedOrder?.driverId ? drivers.find((d) => d.id === selectedOrder.driverId) : undefined),
    [drivers, selectedOrder?.driverId],
  );

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
    setDeliveryDate(new Date().toISOString().split('T')[0]);
    setFreightValue(0);
    setDriverValue(0);
    setLines([]);
  };

  const openNewForOrder = (o: Order) => {
    setOrderId(o.id);
    setDeliveryDate(new Date().toISOString().split('T')[0]);
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
    setOrderId(e.orderId);
    setDeliveryDate(e.deliveryDate);
    setFreightValue(e.freightValue);
    setDriverValue(e.driverValue);
    setLines([...e.expenses]);
    setOpenNew(true);
  };

  const saveEntry = () => {
    if (!selectedOrder) return;
    if (!selectedOrder.driverId) {
      showToast('Pedido sem motorista vinculado', 'error');
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
    } else {
      addFreightEntry({
        orderId: selectedOrder.id,
        driverId: selectedOrder.driverId,
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
              const first = pendingOrders[0];
              if (!first) return;
              openNewForOrder(first);
            }}
            disabled={pendingOrders.length === 0}
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
        <div className="p-5 border-b border-border flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Pendentes de Lançamento</h2>
            <p className="text-xs text-muted-foreground mt-1">Pedidos entregues aguardando lançamento de frete.</p>
          </div>
          <div className="w-full max-w-sm relative">
            <input className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pedido ou representante" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Nº Pedido</th>
                <th className="text-left py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Representante</th>
                <th className="text-left py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Motorista</th>
                <th className="text-left py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Data</th>
                <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Valor Frete</th>
                <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Valor Motorista</th>
                <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Outras Despesas</th>
                <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Saldo</th>
                <th className="text-left py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Status</th>
                <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {allPendingRows.map((r) => {
                const o = r.order;
                const driver = o.driverId ? drivers.find((d) => d.id === o.driverId) : undefined;
                const frete = Number(o.freightValue) || 0;
                return (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-4 px-6 font-mono-data font-bold text-primary">{o.id}</td>
                    <td className="py-4 px-6">{o.representativeName || '-'}</td>
                    <td className="py-4 px-6">{driver?.name || '-'}</td>
                    <td className="py-4 px-6 font-mono-data text-muted-foreground">-</td>
                    <td className="py-4 px-6 text-right font-mono-data font-bold">{formatCurrency(frete)}</td>
                    <td className="py-4 px-6 text-right font-mono-data">-</td>
                    <td className="py-4 px-6 text-right font-mono-data">-</td>
                    <td className="py-4 px-6 text-right font-mono-data">-</td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-status-warning/15 text-status-warning">Pendente</span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button className={btnPrimary} onClick={() => openNewForOrder(o)}>Lançar</button>
                    </td>
                  </tr>
                );
              })}
              {allPendingRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-muted-foreground">Nenhum pedido pendente.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden no-print">
        <div className="p-5 border-b border-border flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Fretes Lançados</h2>
            <p className="text-xs text-muted-foreground mt-1">Pedidos entregues com distribuição de frete e despesas.</p>
          </div>
          <div className="w-full max-w-sm relative">
            <input className={inputClass} value={qLaunched} onChange={(e) => setQLaunched(e.target.value)} placeholder="Buscar pedido ou representante" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Nº Pedido</th>
                <th className="text-left py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Representante</th>
                <th className="text-left py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Motorista</th>
                <th className="text-left py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Data</th>
                <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Valor Frete</th>
                <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Valor Motorista</th>
                <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Outras Despesas</th>
                <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Saldo</th>
                <th className="text-left py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Status</th>
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
                    <td className="py-4 px-6 font-mono-data text-muted-foreground">{new Date(e.deliveryDate).toLocaleDateString('pt-BR')}</td>
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

      <Modal open={openNew} onClose={() => { setOpenNew(false); setEditingId(null); resetNew(); }} title={editingId ? `Editar Lançamento: ${orderId}` : 'Novo Lançamento'} wide>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold font-display text-foreground">Pedido Entregue</label>
              <select
                className={inputClass + ' mt-2'}
                value={orderId}
                onChange={(e) => {
                  const id = e.target.value;
                  setOrderId(id);
                  const o = deliveredOrders.find((x) => x.id === id);
                  setFreightValue(Number(o?.freightValue) || 0);
                }}
              >
                <option value="">Selecione...</option>
                {pendingOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id} — {o.representativeName || '-'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold font-display text-foreground">Data de Entrega</label>
              <input className={inputClass + ' mt-2'} type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>
          </div>

          {selectedOrder && (
            <div className="bg-muted/20 rounded-xl border border-border p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Representante</p>
                <p className="mt-1 font-semibold">{selectedOrder.representativeName || '-'}</p>
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
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total do Pedido</p>
                <p className="mt-1 font-mono-data font-bold">{formatCurrency(getOrderTotal(selectedOrder))}</p>
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
            <button className={btnPrimary} onClick={saveEntry} disabled={!selectedOrder}>Salvar Lançamento</button>
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
                <p className="text-xs text-muted-foreground mt-1">Entrega: {new Date(details.deliveryDate).toLocaleDateString('pt-BR')}</p>
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
                    <div><span className="font-semibold">Emitido em:</span> {new Date().toLocaleDateString('pt-BR')}</div>
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

