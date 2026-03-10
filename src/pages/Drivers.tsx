import React, { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import Modal from '@/components/Modal';
import { Driver } from '@/types';
import { FormField, inputClass, btnPrimary, btnSecondary, driverStatusColors, StatusBadge } from '@/components/shared';

const emptyDriver = { name: '', cnh: '', cnhCategory: 'B', phone: '', vehicleType: '', plate: '', status: 'Disponível' as const };

const DriversPage = () => {
  const { drivers, addDriver, updateDriver, deleteDriver } = useApp();
  const { showToast } = useToast();
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [form, setForm] = useState<Omit<Driver, 'id'>>(emptyDriver);

  const filtered = drivers.filter(d => !statusFilter || d.status === statusFilter);

  const openNew = () => { setEditing(null); setForm(emptyDriver); setModalOpen(true); };
  const openEdit = (d: Driver) => { setEditing(d); setForm({ name: d.name, cnh: d.cnh, cnhCategory: d.cnhCategory, phone: d.phone, vehicleType: d.vehicleType, plate: d.plate, status: d.status }); setModalOpen(true); };

  const save = () => {
    if (!form.name.trim()) return;
    if (editing) {
      updateDriver({ ...form, id: editing.id });
      showToast('Motorista atualizado!');
    } else {
      addDriver(form);
      showToast('Motorista cadastrado!');
    }
    setModalOpen(false);
  };

  const setField = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold font-display text-foreground">Motoristas</h1>
        <button className={btnPrimary} onClick={openNew}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Motorista
        </button>
      </div>

      <select className={inputClass + ' max-w-xs'} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
        <option value="">Todos os Status</option>
        <option value="Disponível">Disponível</option>
        <option value="Em Rota">Em Rota</option>
        <option value="Inativo">Inativo</option>
      </select>

      <div className="bg-card rounded-lg shadow-sm border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {['Nome', 'CNH', 'Telefone', 'Veículo', 'Placa', 'Status', 'Ações'].map(h => (
                <th key={h} className="text-left py-3 px-4 font-display font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => (
              <tr key={d.id} className={`border-b border-border/50 hover:bg-muted/50 transition-colors ${i % 2 ? 'bg-muted/20' : ''}`}>
                <td className="py-3 px-4 font-display font-medium">{d.name}</td>
                <td className="py-3 px-4 font-mono-data">{d.cnh} ({d.cnhCategory})</td>
                <td className="py-3 px-4 font-mono-data">{d.phone}</td>
                <td className="py-3 px-4 font-display">{d.vehicleType}</td>
                <td className="py-3 px-4 font-mono-data">{d.plate}</td>
                <td className="py-3 px-4"><StatusBadge status={d.status} colorMap={driverStatusColors} /></td>
                <td className="py-3 px-4">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(d)} className="text-muted-foreground hover:text-primary transition-colors">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button onClick={() => { deleteDriver(d.id); showToast('Motorista excluído.', 'info'); }} className="text-muted-foreground hover:text-destructive transition-colors">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Motorista' : 'Novo Motorista'}>
        <div className="space-y-4">
          <FormField label="Nome"><input className={inputClass} value={form.name} onChange={e => setField('name', e.target.value)} /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="CNH"><input className={inputClass} value={form.cnh} onChange={e => setField('cnh', e.target.value)} /></FormField>
            <FormField label="Categoria">
              <select className={inputClass} value={form.cnhCategory} onChange={e => setField('cnhCategory', e.target.value)}>
                {['A', 'B', 'C', 'D', 'E', 'AB'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Telefone"><input className={inputClass} value={form.phone} onChange={e => setField('phone', e.target.value)} /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Tipo de Veículo"><input className={inputClass} value={form.vehicleType} onChange={e => setField('vehicleType', e.target.value)} /></FormField>
            <FormField label="Placa"><input className={inputClass} value={form.plate} onChange={e => setField('plate', e.target.value)} /></FormField>
          </div>
          <FormField label="Status">
            <select className={inputClass} value={form.status} onChange={e => setField('status', e.target.value)}>
              <option value="Disponível">Disponível</option>
              <option value="Em Rota">Em Rota</option>
              <option value="Inativo">Inativo</option>
            </select>
          </FormField>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button className={btnSecondary} onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className={btnPrimary} onClick={save}>Salvar</button>
        </div>
      </Modal>
    </div>
  );
};

export default DriversPage;
