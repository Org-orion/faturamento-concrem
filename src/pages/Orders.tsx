import React, { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import Modal from '@/components/Modal';
import { OrderItem, OrderStatus } from '@/types';
import { FormField, inputClass, btnPrimary, btnSecondary, statusColors, StatusBadge, formatCurrency, getOrderTotal } from '@/components/shared';

const allStatuses: OrderStatus[] = ['Aguardando', 'Separando', 'Em Rota', 'Entregue', 'Cancelado'];

const OrdersPage = () => {
  const { clients, drivers, orders, addOrder, updateOrderStatus, assignDriver } = useApp();
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [clientId, setClientId] = useState('');
  const [items, setItems] = useState<OrderItem[]>([{ name: '', quantity: 1, unitPrice: 0 }]);
  const [notes, setNotes] = useState('');
  const [clientSearch, setClientSearch] = useState('');

  const addItem = () => setItems(prev => [...prev, { name: '', quantity: 1, unitPrice: 0 }]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, key: keyof OrderItem, value: any) => {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [key]: value } : item));
  };

  const total = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);

  const openNew = () => {
    setClientId('');
    setItems([{ name: '', quantity: 1, unitPrice: 0 }]);
    setNotes('');
    setClientSearch('');
    setModalOpen(true);
  };

  const save = () => {
    if (!clientId || items.some(it => !it.name.trim())) {
      showToast('Preencha todos os campos obrigatórios.', 'error');
      return;
    }
    addOrder({ clientId, date: new Date().toISOString().split('T')[0], items, notes, status: 'Aguardando', driverId: null });
    showToast('Pedido criado com sucesso!');
    setModalOpen(false);
  };

  const filteredClients = clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold font-display text-foreground">Pedidos</h1>
        <button className={btnPrimary} onClick={openNew}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Pedido
        </button>
      </div>

      <div className="bg-card rounded-lg shadow-sm border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {['Nº Pedido', 'Cliente', 'Data', 'Itens', 'Valor Total', 'Status', 'Motorista', 'Ações'].map(h => (
                <th key={h} className="text-left py-3 px-4 font-display font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((o, i) => {
              const client = clients.find(c => c.id === o.clientId);
              const driver = drivers.find(d => d.id === o.driverId);
              return (
                <tr key={o.id} className={`border-b border-border/50 hover:bg-muted/50 transition-colors ${i % 2 ? 'bg-muted/20' : ''}`}>
                  <td className="py-3 px-4 font-mono-data">{o.id}</td>
                  <td className="py-3 px-4 font-display">{client?.name || '-'}</td>
                  <td className="py-3 px-4 font-mono-data">{new Date(o.date).toLocaleDateString('pt-BR')}</td>
                  <td className="py-3 px-4 font-mono-data">{o.items.length}</td>
                  <td className="py-3 px-4 font-mono-data">{formatCurrency(getOrderTotal(o))}</td>
                  <td className="py-3 px-4">
                    <select
                      className="bg-transparent border-none text-xs font-medium font-display cursor-pointer focus:outline-none"
                      value={o.status}
                      onChange={e => { updateOrderStatus(o.id, e.target.value as OrderStatus); showToast(`Status alterado para ${e.target.value}`); }}
                    >
                      {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <select
                      className="bg-transparent border-none text-xs font-display cursor-pointer focus:outline-none"
                      value={o.driverId || ''}
                      onChange={e => { assignDriver(o.id, e.target.value); showToast('Motorista atribuído!'); }}
                    >
                      <option value="">Sem motorista</option>
                      {drivers.filter(d => d.status !== 'Inativo').map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={o.status} colorMap={statusColors} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo Pedido" wide>
        <div className="space-y-5">
          <FormField label="Cliente">
            <input
              className={inputClass}
              placeholder="Buscar cliente..."
              value={clientSearch}
              onChange={e => { setClientSearch(e.target.value); setClientId(''); }}
            />
            {clientSearch && !clientId && (
              <div className="border border-border rounded-lg mt-1 max-h-32 overflow-y-auto bg-card shadow-md">
                {filteredClients.map(c => (
                  <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm font-display transition-colors"
                    onClick={() => { setClientId(c.id); setClientSearch(c.name); }}>
                    {c.name} — <span className="text-muted-foreground font-mono-data">{c.cpfCnpj}</span>
                  </button>
                ))}
                {filteredClients.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum cliente encontrado</p>}
              </div>
            )}
          </FormField>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium font-display text-foreground">Itens</label>
              <button className="text-sm text-primary font-display hover:underline" onClick={addItem}>+ Adicionar Item</button>
            </div>
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <input className={inputClass} placeholder="Produto" value={item.name} onChange={e => updateItem(i, 'name', e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <input className={inputClass} type="number" min="1" placeholder="Qtd" value={item.quantity} onChange={e => updateItem(i, 'quantity', parseInt(e.target.value) || 0)} />
                  </div>
                  <div className="col-span-3">
                    <input className={inputClass} type="number" min="0" step="0.01" placeholder="Valor" value={item.unitPrice} onChange={e => updateItem(i, 'unitPrice', parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="col-span-1 text-right font-mono-data text-sm text-muted-foreground py-2">
                    {formatCurrency(item.quantity * item.unitPrice)}
                  </div>
                  <div className="col-span-1">
                    {items.length > 1 && (
                      <button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-destructive p-1">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-right font-display font-semibold text-foreground">
              Total: <span className="font-mono-data">{formatCurrency(total)}</span>
            </div>
          </div>

          <FormField label="Observações">
            <textarea className={inputClass + ' min-h-[80px]'} value={notes} onChange={e => setNotes(e.target.value)} />
          </FormField>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button className={btnSecondary} onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className={btnPrimary} onClick={save}>Criar Pedido</button>
        </div>
      </Modal>
    </div>
  );
};

export default OrdersPage;
