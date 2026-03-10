import React, { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import Modal from '@/components/Modal';
import { Load } from '@/types';
import { FormField, inputClass, btnPrimary, btnSecondary, loadStatusColors, StatusBadge } from '@/components/shared';

const LoadsPage = () => {
  const { loads, drivers, orders, clients, addLoad, updateLoad } = useApp();
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [driverId, setDriverId] = useState('');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [weight, setWeight] = useState(0);

  const availableOrders = orders.filter(o => o.status === 'Aguardando' || o.status === 'Separando');

  const openNew = () => {
    setDriverId('');
    setSelectedOrders([]);
    setWeight(0);
    setModalOpen(true);
  };

  const save = () => {
    if (!driverId || selectedOrders.length === 0) {
      showToast('Selecione motorista e pedidos.', 'error');
      return;
    }
    addLoad({ driverId, orderIds: selectedOrders, status: 'Aguardando Saída', estimatedWeight: weight });
    showToast('Carga criada com sucesso!');
    setModalOpen(false);
  };

  const toggleOrder = (id: string) => {
    setSelectedOrders(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const updateLoadStatus = (load: Load, status: Load['status']) => {
    updateLoad({ ...load, status });
    showToast(`Carga ${load.id} — ${status}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold font-display text-foreground">Cargas</h1>
        <button className={btnPrimary} onClick={openNew}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nova Carga
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loads.map(load => {
          const driver = drivers.find(d => d.id === load.driverId);
          const loadOrders = orders.filter(o => load.orderIds.includes(o.id));
          return (
            <div key={load.id} className="bg-card rounded-lg shadow-sm border border-border p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono-data text-sm text-muted-foreground">{load.id}</span>
                <StatusBadge status={load.status} colorMap={loadStatusColors} />
              </div>
              <div>
                <p className="font-display font-semibold text-foreground">{driver?.name || '-'}</p>
                <p className="text-sm text-muted-foreground font-display">{driver?.vehicleType} — {driver?.plate}</p>
              </div>
              <div className="flex gap-4 text-sm text-muted-foreground font-display">
                <span>{loadOrders.length} pedido(s)</span>
                {load.estimatedWeight > 0 && <span>{load.estimatedWeight}kg</span>}
              </div>
              <div className="space-y-2 border-t border-border pt-3">
                {loadOrders.map(o => {
                  const client = clients.find(c => c.id === o.clientId);
                  return (
                    <div key={o.id} className="text-sm">
                      <span className="font-mono-data text-muted-foreground">{o.id}</span>
                      <span className="font-display ml-2">{client?.name}</span>
                      <p className="text-xs text-muted-foreground ml-0">{client?.address.street}, {client?.address.number} — {client?.address.city}</p>
                    </div>
                  );
                })}
              </div>
              <select
                className={inputClass + ' text-xs'}
                value={load.status}
                onChange={e => updateLoadStatus(load, e.target.value as Load['status'])}
              >
                <option value="Aguardando Saída">Aguardando Saída</option>
                <option value="Em Rota">Em Rota</option>
                <option value="Finalizada">Finalizada</option>
              </select>
            </div>
          );
        })}
        {loads.length === 0 && (
          <p className="col-span-full text-center text-muted-foreground font-display py-12">Nenhuma carga criada.</p>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova Carga">
        <div className="space-y-4">
          <FormField label="Motorista">
            <select className={inputClass} value={driverId} onChange={e => setDriverId(e.target.value)}>
              <option value="">Selecionar...</option>
              {drivers.filter(d => d.status === 'Disponível').map(d => (
                <option key={d.id} value={d.id}>{d.name} — {d.vehicleType} ({d.plate})</option>
              ))}
            </select>
          </FormField>
          <FormField label="Peso Estimado (kg)">
            <input className={inputClass} type="number" value={weight} onChange={e => setWeight(Number(e.target.value))} />
          </FormField>
          <FormField label="Vincular Pedidos">
            <div className="border border-border rounded-lg max-h-48 overflow-y-auto">
              {availableOrders.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground text-center">Nenhum pedido disponível</p>}
              {availableOrders.map(o => {
                const client = clients.find(c => c.id === o.clientId);
                return (
                  <label key={o.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/50 last:border-0">
                    <input
                      type="checkbox"
                      checked={selectedOrders.includes(o.id)}
                      onChange={() => toggleOrder(o.id)}
                      className="accent-primary"
                    />
                    <span className="font-mono-data text-sm">{o.id}</span>
                    <span className="font-display text-sm">{client?.name}</span>
                  </label>
                );
              })}
            </div>
          </FormField>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button className={btnSecondary} onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className={btnPrimary} onClick={save}>Criar Carga</button>
        </div>
      </Modal>
    </div>
  );
};

export default LoadsPage;
