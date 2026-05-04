import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ToastProvider';
import { useApp } from '@/contexts/AppContext';
import Modal from '@/components/Modal';
import { Client, Address } from '@/types';
import { FormField, inputClass, btnPrimary, btnSecondary, btnDanger } from '@/components/shared';
import { deleteRepresentante, insertRepresentante, listRepresentantes, normalizeCpf, safeJsonParse, updateRepresentante } from '@/lib/cadastrosOps';
import { useTableSort } from '@/hooks/useTableSort';
import { useQuickFilter } from '@/hooks/useQuickFilter';
import { useColumnFilters } from '@/hooks/useColumnFilters';
import { SortableHeader } from '@/components/table/SortableHeader';
import { QuickFilterBar } from '@/components/table/QuickFilterBar';
import { ColumnFilterRow, type ColFilterSlot } from '@/components/table/ColumnFilterRow';
import { can } from '@/utils/access';

const emptyAddress: Address = { street: '', number: '', neighborhood: '', city: '', state: '', zip: '' };
const emptyClient = { registryNumber: '', name: '', cpfCnpj: '', phone: '', email: '', address: { ...emptyAddress } };

const ClientsPage = ({
  title = 'Cadastro de Representantes',
  primaryActionLabel = 'Novo Representante',
  modalNewTitle = 'Novo Representante',
  modalEditTitle = 'Editar Representante',
}: {
  title?: string;
  primaryActionLabel?: string;
  modalNewTitle?: string;
  modalEditTitle?: string;
} = {}) => {
  const { showToast } = useToast();
  const { user } = useApp();
  const canCriarEditar = can(user, 'representantes.criar_editar', 'representantes', 'execute');
  const canExcluir     = can(user, 'representantes.excluir',      'representantes', 'execute');
  const entityLabel = title.toLowerCase().includes('cliente') ? 'Cliente' : 'Representante';
  const { sortState, toggleSort, sortItems } = useTableSort();
  const { query, setQuery, filterItems } = useQuickFilter<Client>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<Omit<Client, 'id'>>(emptyClient);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [items, setItems] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const rows = await listRepresentantes();
        if (cancelled) return;
        const next = rows.map((r) => {
          const address = safeJsonParse<Address>(r.endereco, { ...emptyAddress });
          return {
            id: r.id,
            registryNumber: r.codigo_representante || '',
            name: r.nome || '',
            cpfCnpj: r.cpf || '',
            phone: r.telefone_whatsapp || '',
            email: '',
            address,
          } satisfies Client;
        });
        setItems(next);
      } catch (e: any) {
        showToast(e?.message || 'Falha ao carregar cadastros.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const textGetters: Array<(c: Client) => unknown> = [
    (c) => c.name,
    (c) => c.cpfCnpj,
    (c) => c.registryNumber,
    (c) => c.phone,
    (c) => c.address.city,
    (c) => c.address.state,
  ];

  const sortGetters: Record<string, (c: Client) => unknown> = {
    registryNumber: (c) => c.registryNumber,
    name: (c) => c.name,
    cpfCnpj: (c) => c.cpfCnpj,
    phone: (c) => c.phone,
    city: (c) => c.address.city,
    state: (c) => c.address.state,
  };

  const colFilter = useColumnFilters();

  const colFilterSlots: ColFilterSlot[] = useMemo(() => [
    ...(entityLabel === 'Representante' ? [{ key: 'registryNumber', type: 'text' as const, placeholder: 'Nº Cadastro...' }] : []),
    { key: 'name', type: 'text' as const, placeholder: 'Nome...' },
    { key: 'cpfCnpj', type: 'text' as const, placeholder: 'CPF/CNPJ...' },
    { key: 'phone', type: 'text' as const, placeholder: 'Telefone...' },
    ...(entityLabel !== 'Representante' ? [
      { key: 'city', type: 'text' as const, placeholder: 'Cidade...' },
      { key: 'state', type: 'text' as const, placeholder: 'UF...' },
    ] : []),
    { type: 'none' as const },
  ], [entityLabel]);

  const colFilterDefs = useMemo(() => [
    { key: 'registryNumber', getter: (c: Client) => c.registryNumber },
    { key: 'name', getter: (c: Client) => c.name },
    { key: 'cpfCnpj', getter: (c: Client) => c.cpfCnpj },
    { key: 'phone', getter: (c: Client) => c.phone },
    { key: 'city', getter: (c: Client) => c.address.city },
    { key: 'state', getter: (c: Client) => c.address.state },
  ], []);

  const filtered = useMemo(
    () => sortItems(filterItems(colFilter.filterItems(items, colFilterDefs), textGetters), sortGetters),
    [items, filterItems, sortItems, colFilter.filterItems, colFilterDefs],
  );

  const openNew = () => { setEditing(null); setForm(emptyClient); setErrors({}); setModalOpen(true); };
  const openEdit = (c: Client) => { setEditing(c); setForm({ registryNumber: c.registryNumber || '', name: c.name, cpfCnpj: c.cpfCnpj, phone: c.phone, email: c.email, address: { ...c.address } }); setErrors({}); setModalOpen(true); };

  const validate = () => {
    const e: Record<string, string> = {};
    if (entityLabel === 'Representante' && !String(form.registryNumber || '').trim()) e.registryNumber = 'Obrigatório';
    if (!form.name.trim()) e.name = 'Obrigatório';
    if (!form.cpfCnpj.trim()) e.cpfCnpj = 'Obrigatório';
    if (!form.phone.trim()) e.phone = 'Obrigatório';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = () => {
    if (!validate()) return;
    if (editing) {
      const enderecoJson = JSON.stringify(form.address);
      const cpf = normalizeCpf(form.cpfCnpj.trim()) || form.cpfCnpj.trim();
      void (async () => {
        try {
          const row = await updateRepresentante(editing.id, {
            codigo_representante: String(form.registryNumber || '').trim() || null,
            nome: form.name.trim(),
            cpf,
            telefone_whatsapp: form.phone.trim(),
            endereco: enderecoJson,
          });
          const address = safeJsonParse<Address>(row.endereco, { ...emptyAddress });
          setItems((prev) =>
            prev.map((x) =>
              x.id === editing.id
                ? { ...x, registryNumber: row.codigo_representante || '', name: row.nome || '', cpfCnpj: row.cpf || '', phone: row.telefone_whatsapp || '', address }
                : x,
            ),
          );
          showToast(`${entityLabel} atualizado com sucesso!`);
          setModalOpen(false);
        } catch (e: any) {
          showToast(e?.message || 'Falha ao salvar.', 'error');
        }
      })();
    } else {
      const enderecoJson = JSON.stringify(form.address);
      const cpf = normalizeCpf(form.cpfCnpj.trim()) || form.cpfCnpj.trim();
      void (async () => {
        try {
          const row = await insertRepresentante({
            codigo_representante: String(form.registryNumber || '').trim() || null,
            nome: form.name.trim(),
            cpf,
            telefone_whatsapp: form.phone.trim(),
            endereco: enderecoJson,
          });
          const address = safeJsonParse<Address>(row.endereco, { ...emptyAddress });
          setItems((prev) => [
            ...prev,
            { id: row.id, registryNumber: row.codigo_representante || '', name: row.nome || '', cpfCnpj: row.cpf || '', phone: row.telefone_whatsapp || '', email: '', address },
          ]);
          showToast(`${entityLabel} cadastrado com sucesso!`);
          setModalOpen(false);
        } catch (e: any) {
          showToast(e?.message || 'Falha ao salvar.', 'error');
        }
      })();
    }
  };

  const handleDelete = (id: string) => {
    if (confirm(`Deseja realmente excluir este ${entityLabel.toLowerCase()}?`)) {
      void (async () => {
        try {
          await deleteRepresentante(id);
          setItems((prev) => prev.filter((x) => x.id !== id));
          showToast(`${entityLabel} excluído.`, 'info');
        } catch (e: any) {
          showToast(e?.message || 'Falha ao excluir.', 'error');
        }
      })();
    }
  };

  const setField = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  const setAddr = (key: string, value: string) => setForm(prev => ({ ...prev, address: { ...prev.address, [key]: value } }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold font-display text-foreground">{title}</h1>
        {canCriarEditar && (
          <button className={btnPrimary} onClick={openNew}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {primaryActionLabel}
          </button>
        )}
      </div>

      <QuickFilterBar query={query} onQueryChange={setQuery} placeholder="Buscar por nome, documento, telefone..." />
      {loading && (
        <div className="text-sm text-muted-foreground font-display">
          Carregando...
        </div>
      )}

      <div className="bg-card rounded-lg shadow-sm border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {entityLabel === 'Representante' && (
                <SortableHeader columnKey="registryNumber" sortState={sortState} onToggle={toggleSort}>Nº Cadastro</SortableHeader>
              )}
              <SortableHeader columnKey="name" sortState={sortState} onToggle={toggleSort}>Nome</SortableHeader>
              <SortableHeader columnKey="cpfCnpj" sortState={sortState} onToggle={toggleSort}>CPF/CNPJ</SortableHeader>
              <SortableHeader columnKey="phone" sortState={sortState} onToggle={toggleSort}>Telefone</SortableHeader>
              {entityLabel !== 'Representante' && <>
                <SortableHeader columnKey="city" sortState={sortState} onToggle={toggleSort}>Cidade</SortableHeader>
                <SortableHeader columnKey="state" sortState={sortState} onToggle={toggleSort}>UF</SortableHeader>
              </>}
              <th className="text-left py-3 px-4 font-display font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.id} className={`border-b border-border/50 hover:bg-muted/50 transition-colors ${i % 2 ? 'bg-muted/20' : ''}`}>
                {entityLabel === 'Representante' && (
                  <td className="py-3 px-4 font-mono-data">{c.registryNumber || '-'}</td>
                )}
                <td className="py-3 px-4 font-display font-medium">{c.name}</td>
                <td className="py-3 px-4 font-mono-data">{c.cpfCnpj}</td>
                <td className="py-3 px-4 font-mono-data">{c.phone}</td>
                {entityLabel !== 'Representante' && <>
                  <td className="py-3 px-4 font-display">{c.address.city}</td>
                  <td className="py-3 px-4 font-mono-data">{c.address.state}</td>
                </>}
                <td className="py-3 px-4">
                  <div className="flex gap-2">
                    {canCriarEditar && (
                      <button onClick={() => openEdit(c)} className="text-muted-foreground hover:text-primary transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    )}
                    {canExcluir && (
                      <button onClick={() => handleDelete(c.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={entityLabel === 'Representante' ? 7 : 6} className="py-8 text-center text-muted-foreground font-display">Nenhum {entityLabel.toLowerCase()} encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? modalEditTitle : modalNewTitle} wide>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Número de Cadastro" error={errors.registryNumber}>
            <input className={inputClass} value={String(form.registryNumber || '')} onChange={e => setField('registryNumber', e.target.value)} />
          </FormField>
          <FormField label="Nome Completo" error={errors.name}>
            <input className={inputClass} value={form.name} onChange={e => setField('name', e.target.value)} />
          </FormField>
          <FormField label="CPF/CNPJ" error={errors.cpfCnpj}>
            <input className={inputClass} value={form.cpfCnpj} onChange={e => setField('cpfCnpj', e.target.value)} />
          </FormField>
          <FormField label="Telefone" error={errors.phone}>
            <input className={inputClass} value={form.phone} onChange={e => setField('phone', e.target.value)} />
          </FormField>
          {entityLabel !== 'Representante' && (<>
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
          </>)}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button className={btnDanger} onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className={btnPrimary} onClick={save}>Salvar</button>
        </div>
      </Modal>
    </div>
  );
};

export default ClientsPage;
