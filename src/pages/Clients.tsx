import React, { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import Modal from '@/components/Modal';
import { Client, Address } from '@/types';
import { FormField, inputClass, btnPrimary, btnSecondary, btnDanger } from '@/components/shared';

const emptyAddress: Address = { street: '', number: '', neighborhood: '', city: '', state: '', zip: '' };
const emptyClient = { name: '', cpfCnpj: '', phone: '', email: '', address: { ...emptyAddress } };

const ClientsPage = () => {
  const { clients, orders, addClient, updateClient, deleteClient } = useApp();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<Omit<Client, 'id'>>(emptyClient);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.cpfCnpj.includes(search)
  );

  const openNew = () => { setEditing(null); setForm(emptyClient); setErrors({}); setModalOpen(true); };
  const openEdit = (c: Client) => { setEditing(c); setForm({ name: c.name, cpfCnpj: c.cpfCnpj, phone: c.phone, email: c.email, address: { ...c.address } }); setErrors({}); setModalOpen(true); };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Obrigatório';
    if (!form.cpfCnpj.trim()) e.cpfCnpj = 'Obrigatório';
    if (!form.phone.trim()) e.phone = 'Obrigatório';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = () => {
    if (!validate()) return;
    if (editing) {
      updateClient({ ...form, id: editing.id });
      showToast('Cliente atualizado com sucesso!');
    } else {
      addClient(form);
      showToast('Cliente cadastrado com sucesso!');
    }
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Deseja realmente excluir este cliente?')) {
      deleteClient(id);
      showToast('Cliente excluído.', 'info');
    }
  };

  const setField = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  const setAddr = (key: string, value: string) => setForm(prev => ({ ...prev, address: { ...prev.address, [key]: value } }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold font-display text-foreground">Clientes</h1>
        <button className={btnPrimary} onClick={openNew}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Cliente
        </button>
      </div>

      <input
        type="text"
        placeholder="Buscar por nome ou documento..."
        className={inputClass + ' max-w-sm'}
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div className="bg-card rounded-lg shadow-sm border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {['Nome', 'CPF/CNPJ', 'Telefone', 'E-mail', 'Cidade', 'Pedidos', 'Ações'].map(h => (
                <th key={h} className="text-left py-3 px-4 font-display font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.id} className={`border-b border-border/50 hover:bg-muted/50 transition-colors ${i % 2 ? 'bg-muted/20' : ''}`}>
                <td className="py-3 px-4 font-display font-medium">{c.name}</td>
                <td className="py-3 px-4 font-mono-data">{c.cpfCnpj}</td>
                <td className="py-3 px-4 font-mono-data">{c.phone}</td>
                <td className="py-3 px-4 font-display">{c.email}</td>
                <td className="py-3 px-4 font-display">{c.address.city}</td>
                <td className="py-3 px-4 font-mono-data">{orders.filter(o => o.clientId === c.id).length}</td>
                <td className="py-3 px-4">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(c)} className="text-muted-foreground hover:text-primary transition-colors">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-muted-foreground font-display">Nenhum cliente encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Cliente' : 'Novo Cliente'} wide>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Nome Completo" error={errors.name}>
            <input className={inputClass} value={form.name} onChange={e => setField('name', e.target.value)} />
          </FormField>
          <FormField label="CPF/CNPJ" error={errors.cpfCnpj}>
            <input className={inputClass} value={form.cpfCnpj} onChange={e => setField('cpfCnpj', e.target.value)} />
          </FormField>
          <FormField label="Telefone" error={errors.phone}>
            <input className={inputClass} value={form.phone} onChange={e => setField('phone', e.target.value)} />
          </FormField>
          <FormField label="E-mail">
            <input className={inputClass} type="email" value={form.email} onChange={e => setField('email', e.target.value)} />
          </FormField>
          <FormField label="Rua">
            <input className={inputClass} value={form.address.street} onChange={e => setAddr('street', e.target.value)} />
          </FormField>
          <FormField label="Número">
            <input className={inputClass} value={form.address.number} onChange={e => setAddr('number', e.target.value)} />
          </FormField>
          <FormField label="Bairro">
            <input className={inputClass} value={form.address.neighborhood} onChange={e => setAddr('neighborhood', e.target.value)} />
          </FormField>
          <FormField label="Cidade">
            <input className={inputClass} value={form.address.city} onChange={e => setAddr('city', e.target.value)} />
          </FormField>
          <FormField label="Estado">
            <input className={inputClass} value={form.address.state} onChange={e => setAddr('state', e.target.value)} />
          </FormField>
          <FormField label="CEP">
            <input className={inputClass} value={form.address.zip} onChange={e => setAddr('zip', e.target.value)} />
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

export default ClientsPage;
