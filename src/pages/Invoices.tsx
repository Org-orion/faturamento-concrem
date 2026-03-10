import React, { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import Modal from '@/components/Modal';
import { PaymentMethod, PaymentStatus } from '@/types';
import { FormField, inputClass, btnPrimary, btnSecondary, paymentStatusColors, StatusBadge, formatCurrency, getOrderTotal } from '@/components/shared';

const paymentMethods: PaymentMethod[] = ['Boleto', 'PIX', 'Cartão', 'Dinheiro', 'Transferência'];

const InvoicesPage = () => {
  const { invoices, clients, orders, addInvoice, updateInvoiceStatus } = useApp();
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState<string | null>(null);
  const [orderId, setOrderId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Boleto');

  const selectedOrder = orders.find(o => o.id === orderId);
  const selectedClient = selectedOrder ? clients.find(c => c.id === selectedOrder.clientId) : null;
  const invoiceValue = selectedOrder ? getOrderTotal(selectedOrder) : 0;

  const openNew = () => {
    setOrderId('');
    setDueDate('');
    setPaymentMethod('Boleto');
    setModalOpen(true);
  };

  const save = () => {
    if (!orderId || !dueDate) {
      showToast('Preencha todos os campos.', 'error');
      return;
    }
    addInvoice({
      clientId: selectedOrder!.clientId,
      orderIds: [orderId],
      issueDate: new Date().toISOString().split('T')[0],
      dueDate,
      value: invoiceValue,
      paymentMethod,
      paymentStatus: 'Pendente',
    });
    showToast('Fatura emitida com sucesso!');
    setModalOpen(false);
  };

  const viewInvoice = invoices.find(i => i.id === viewModal);
  const viewClient = viewInvoice ? clients.find(c => c.id === viewInvoice.clientId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold font-display text-foreground">Faturas</h1>
        <button className={btnPrimary} onClick={openNew}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Emitir Fatura
        </button>
      </div>

      <div className="bg-card rounded-lg shadow-sm border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {['Nº Fatura', 'Cliente', 'Pedido(s)', 'Emissão', 'Vencimento', 'Valor', 'Pagamento', 'Status', ''].map(h => (
                <th key={h} className="text-left py-3 px-4 font-display font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv, i) => {
              const client = clients.find(c => c.id === inv.clientId);
              return (
                <tr key={inv.id} className={`border-b border-border/50 hover:bg-muted/50 transition-colors ${i % 2 ? 'bg-muted/20' : ''}`}>
                  <td className="py-3 px-4 font-mono-data">{inv.id}</td>
                  <td className="py-3 px-4 font-display">{client?.name || '-'}</td>
                  <td className="py-3 px-4 font-mono-data">{inv.orderIds.join(', ')}</td>
                  <td className="py-3 px-4 font-mono-data">{new Date(inv.issueDate).toLocaleDateString('pt-BR')}</td>
                  <td className="py-3 px-4 font-mono-data">{new Date(inv.dueDate).toLocaleDateString('pt-BR')}</td>
                  <td className="py-3 px-4 font-mono-data">{formatCurrency(inv.value)}</td>
                  <td className="py-3 px-4 font-display">{inv.paymentMethod}</td>
                  <td className="py-3 px-4">
                    <select
                      className="bg-transparent border-none text-xs font-medium font-display cursor-pointer focus:outline-none"
                      value={inv.paymentStatus}
                      onChange={e => { updateInvoiceStatus(inv.id, e.target.value as PaymentStatus); showToast('Status atualizado!'); }}
                    >
                      <option value="Pendente">Pendente</option>
                      <option value="Pago">Pago</option>
                      <option value="Vencido">Vencido</option>
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <button onClick={() => setViewModal(inv.id)} className="text-sm text-primary hover:underline font-display">
                      Visualizar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* New Invoice Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Emitir Fatura">
        <div className="space-y-4">
          <FormField label="Pedido">
            <select className={inputClass} value={orderId} onChange={e => setOrderId(e.target.value)}>
              <option value="">Selecionar pedido...</option>
              {orders.filter(o => o.status === 'Entregue').map(o => {
                const c = clients.find(cl => cl.id === o.clientId);
                return <option key={o.id} value={o.id}>{o.id} — {c?.name} — {formatCurrency(getOrderTotal(o))}</option>;
              })}
            </select>
          </FormField>
          {selectedClient && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm font-display">
              <p className="font-medium">{selectedClient.name}</p>
              <p className="text-muted-foreground">{selectedClient.cpfCnpj}</p>
              <p className="text-muted-foreground font-mono-data mt-1">Valor: {formatCurrency(invoiceValue)}</p>
            </div>
          )}
          <FormField label="Data de Vencimento">
            <input className={inputClass} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </FormField>
          <FormField label="Forma de Pagamento">
            <select className={inputClass} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}>
              {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </FormField>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button className={btnSecondary} onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className={btnPrimary} onClick={save}>Emitir</button>
        </div>
      </Modal>

      {/* View Invoice Modal */}
      <Modal open={!!viewModal} onClose={() => setViewModal(null)} title="Fatura" wide>
        {viewInvoice && viewClient && (
          <div className="print-only space-y-6" id="invoice-print">
            <div className="flex justify-between items-start border-b border-border pb-4">
              <div>
                <h2 className="text-xl font-bold font-display">FATURA {viewInvoice.id}</h2>
                <p className="text-sm text-muted-foreground font-display mt-1">Emissão: {new Date(viewInvoice.issueDate).toLocaleDateString('pt-BR')}</p>
              </div>
              <StatusBadge status={viewInvoice.paymentStatus} colorMap={paymentStatusColors} />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h4 className="text-xs text-muted-foreground font-display uppercase tracking-wider mb-1">Cliente</h4>
                <p className="font-display font-medium">{viewClient.name}</p>
                <p className="text-sm text-muted-foreground font-mono-data">{viewClient.cpfCnpj}</p>
                <p className="text-sm text-muted-foreground font-display">{viewClient.address.street}, {viewClient.address.number}</p>
                <p className="text-sm text-muted-foreground font-display">{viewClient.address.city}/{viewClient.address.state}</p>
              </div>
              <div className="text-right">
                <h4 className="text-xs text-muted-foreground font-display uppercase tracking-wider mb-1">Pagamento</h4>
                <p className="font-display">{viewInvoice.paymentMethod}</p>
                <p className="text-sm text-muted-foreground font-display">Vencimento: {new Date(viewInvoice.dueDate).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <h4 className="text-xs text-muted-foreground font-display uppercase tracking-wider mb-2">Pedidos vinculados</h4>
              {viewInvoice.orderIds.map(oId => {
                const order = orders.find(o => o.id === oId);
                return order ? (
                  <div key={oId} className="space-y-1 mb-3">
                    <p className="font-mono-data text-sm">{order.id}</p>
                    {order.items.map((it, i) => (
                      <div key={i} className="flex justify-between text-sm pl-4">
                        <span className="font-display">{it.name} × {it.quantity}</span>
                        <span className="font-mono-data">{formatCurrency(it.quantity * it.unitPrice)}</span>
                      </div>
                    ))}
                  </div>
                ) : null;
              })}
            </div>
            <div className="border-t border-border pt-4 flex justify-between items-center">
              <span className="font-display font-semibold text-lg">Total</span>
              <span className="font-mono-data font-bold text-xl">{formatCurrency(viewInvoice.value)}</span>
            </div>
            <div className="flex justify-end no-print">
              <button className={btnPrimary} onClick={() => window.print()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Imprimir
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default InvoicesPage;
