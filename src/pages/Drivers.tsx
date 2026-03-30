import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ToastProvider';
import { useApp } from '@/contexts/AppContext';
import Modal from '@/components/Modal';
import { Driver } from '@/types';
import { FormField, inputClass, btnPrimary, btnDanger, driverStatusColors, StatusBadge } from '@/components/shared';
import { deleteMotorista, insertMotorista, listMotoristas, updateMotorista } from '@/lib/cadastrosOps';
import { useTableSort } from '@/hooks/useTableSort';
import { useQuickFilter } from '@/hooks/useQuickFilter';
import { useColumnFilters, ColDef } from '@/hooks/useColumnFilters';
import { SortableHeader } from '@/components/table/SortableHeader';
import { QuickFilterBar } from '@/components/table/QuickFilterBar';
import { ColumnFilterRow, ColFilterSlot } from '@/components/table/ColumnFilterRow';

const emptyDriver = { name: '', cnh: '', cnhCategory: 'B', phone: '', vehicleType: 'Carreta Bau', vehicleVolume: 0, vehicleWeight: 0, plate: '', status: 'Disponível' as const };

const DriversPage = () => {
  const { showToast } = useToast();
  const { addDriver, updateDriver: updateAppDriver, deleteDriver: deleteAppDriver } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [form, setForm] = useState<Omit<Driver, 'id'>>(emptyDriver);
  const [items, setItems] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const { sortState, toggleSort, sortItems } = useTableSort();
  const { query, setQuery, filterItems } = useQuickFilter<Driver>();
  const colFilter = useColumnFilters();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const rows = await listMotoristas();
        if (cancelled) return;
        const next: Driver[] = rows.map((r) => ({
          id: r.id,
          name: r.nome || '',
          cnh: r.cnh_numero || '',
          cnhCategory: r.cnh_categoria || 'B',
          phone: r.telefone || '',
          vehicleType: r.tipo_veiculo || 'Carreta Bau',
          vehicleVolume: Number(r.volume_suportado_m3 || 0),
          vehicleWeight: Number(r.peso_suportado_kg || 0),
          plate: r.placa_veiculo || '',
          status: 'Disponível',
        }));
        setItems(next);
      } catch (e: any) {
        showToast(e?.message || 'Falha ao carregar motoristas.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const textGetters: Array<(d: Driver) => unknown> = [
    (d) => d.name, (d) => d.phone, (d) => d.vehicleType, (d) => d.plate,
  ];
  const sortGetters: Record<string, (d: Driver) => unknown> = {
    name: (d) => d.name, phone: (d) => d.phone, vehicleType: (d) => d.vehicleType,
    vehicleVolume: (d) => d.vehicleVolume, vehicleWeight: (d) => d.vehicleWeight, plate: (d) => d.plate,
  };
  const colDefs: ColDef<Driver>[] = [
    { key: 'name', getter: (d) => d.name },
    { key: 'phone', getter: (d) => d.phone },
    { key: 'vehicleType', getter: (d) => d.vehicleType },
    { key: 'plate', getter: (d) => d.plate },
  ];
  const colFilterSlots: ColFilterSlot[] = [
    { key: 'name', type: 'text', placeholder: 'Nome...' },
    { key: 'phone', type: 'text', placeholder: 'Telefone...' },
    { key: 'vehicleType', type: 'text', placeholder: 'Veículo...' },
    { type: 'none' },
    { type: 'none' },
    { key: 'plate', type: 'text', placeholder: 'Placa...' },
    { type: 'none' },
  ];
  const filtered = useMemo(
    () => sortItems(filterItems(colFilter.filterItems(items, colDefs), textGetters), sortGetters),
    [items, filterItems, sortItems, colFilter.filterItems],
  );

  const openNew = () => { setEditing(null); setForm(emptyDriver); setModalOpen(true); };
  const openEdit = (d: Driver) => { 
    setEditing(d); 
    setForm({ 
      name: d.name, 
      cnh: d.cnh, 
      cnhCategory: d.cnhCategory, 
      phone: d.phone, 
      vehicleType: d.vehicleType || 'Carreta Bau', 
      vehicleVolume: d.vehicleVolume || 0,
      vehicleWeight: d.vehicleWeight || 0,
      plate: d.plate, 
      status: d.status 
    }); 
    setModalOpen(true); 
  };

  const save = () => {
    if (!form.name.trim()) return;
    if (editing) {
      void (async () => {
        try {
          const row = await updateMotorista(editing.id, {
            nome: form.name.trim(),
            telefone: form.phone.trim(),
            cnh_numero: form.cnh.trim(),
            cnh_categoria: String(form.cnhCategory || 'B'),
            placa_veiculo: form.plate.trim(),
            tipo_veiculo: String(form.vehicleType || 'Carreta Bau'),
            volume_suportado_m3: Number(form.vehicleVolume || 0),
            peso_suportado_kg: Number(form.vehicleWeight || 0),
          });
          const updatedDriver: Driver = {
            id: editing.id,
            name: row.nome || '',
            phone: row.telefone || '',
            cnh: row.cnh_numero || '',
            cnhCategory: row.cnh_categoria || 'B',
            plate: row.placa_veiculo || '',
            vehicleType: row.tipo_veiculo || 'Carreta Bau',
            vehicleVolume: Number(row.volume_suportado_m3 || 0),
            vehicleWeight: Number(row.peso_suportado_kg || 0),
            status: editing.status,
          };
          setItems((prev) =>
            prev.map((d) => (d.id === editing.id ? updatedDriver : d))
          );
          updateAppDriver(updatedDriver);
          showToast('Motorista atualizado!');
          setModalOpen(false);
        } catch (e: any) {
          showToast(e?.message || 'Falha ao salvar.', 'error');
        }
      })();
    } else {
      void (async () => {
        try {
          const row = await insertMotorista({
            nome: form.name.trim(),
            telefone: form.phone.trim(),
            cnh_numero: form.cnh.trim(),
            cnh_categoria: String(form.cnhCategory || 'B'),
            placa_veiculo: form.plate.trim(),
            tipo_veiculo: String(form.vehicleType || 'Carreta Bau'),
            volume_suportado_m3: Number(form.vehicleVolume || 0),
            peso_suportado_kg: Number(form.vehicleWeight || 0),
          });
          const newDriver: Driver = {
            id: row.id,
            name: row.nome || '',
            cnh: row.cnh_numero || '',
            cnhCategory: row.cnh_categoria || 'B',
            phone: row.telefone || '',
            vehicleType: row.tipo_veiculo || 'Carreta Bau',
            vehicleVolume: Number(row.volume_suportado_m3 || 0),
            vehicleWeight: Number(row.peso_suportado_kg || 0),
            plate: row.placa_veiculo || '',
            status: 'Disponível',
          };
          setItems((prev) => [...prev, newDriver]);
          addDriver(newDriver);
          showToast('Motorista cadastrado!');
          setModalOpen(false);
        } catch (e: any) {
          showToast(e?.message || 'Falha ao salvar.', 'error');
        }
      })();
    }
  };

  const setField = <K extends keyof Omit<Driver, 'id'>>(key: K, value: Omit<Driver, 'id'>[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold font-display text-foreground">Motoristas</h1>
        <button className={btnPrimary} onClick={openNew}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Motorista
        </button>
      </div>

      <QuickFilterBar query={query} onQueryChange={setQuery} placeholder="Buscar por nome, telefone, placa..." />

      <div className="bg-card rounded-lg shadow-sm border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <ColumnFilterRow columns={colFilterSlots} values={colFilter.values} onChange={colFilter.setFilter} />
            <tr className="border-b border-border bg-muted/30">
              <SortableHeader columnKey="name" sortState={sortState} onToggle={toggleSort}>Nome</SortableHeader>
              <SortableHeader columnKey="phone" sortState={sortState} onToggle={toggleSort}>Telefone</SortableHeader>
              <SortableHeader columnKey="vehicleType" sortState={sortState} onToggle={toggleSort}>Veículo</SortableHeader>
              <SortableHeader columnKey="vehicleVolume" sortState={sortState} onToggle={toggleSort}>Volume (m³)</SortableHeader>
              <SortableHeader columnKey="vehicleWeight" sortState={sortState} onToggle={toggleSort}>Peso (Kg)</SortableHeader>
              <SortableHeader columnKey="plate" sortState={sortState} onToggle={toggleSort}>Placa</SortableHeader>
              <th className="text-left py-3 px-4 font-display font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => (
              <tr key={d.id} className={`border-b border-border/50 hover:bg-muted/50 transition-colors ${i % 2 ? 'bg-muted/20' : ''}`}>
                <td className="py-3 px-4 font-display font-medium">{d.name}</td>
                <td className="py-3 px-4 font-mono-data">{d.phone}</td>
                <td className="py-3 px-4 font-display">{d.vehicleType}</td>
                <td className="py-3 px-4 font-mono-data">{d.vehicleVolume || 0} m³</td>
                <td className="py-3 px-4 font-mono-data">{d.vehicleWeight || 0} Kg</td>
                <td className="py-3 px-4 font-mono-data">{d.plate}</td>
                <td className="py-3 px-4">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(d)} className="text-muted-foreground hover:text-primary transition-colors">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button
                      onClick={() => {
                        void (async () => {
                          try {
                            await deleteMotorista(d.id);
                            setItems((prev) => prev.filter((x) => x.id !== d.id));
                            deleteAppDriver(d.id);
                            showToast('Motorista excluído.', 'info');
                          } catch (e: any) {
                            showToast(e?.message || 'Falha ao excluir.', 'error');
                          }
                        })();
                      }}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading && (
        <div className="text-sm text-muted-foreground font-display">
          Carregando...
        </div>
      )}

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
            <FormField label="Tipo de Veículo">
              <select className={inputClass} value={form.vehicleType} onChange={e => setField('vehicleType', e.target.value)}>
                {['Carreta Bau', 'Carreta Sider', 'Truck Bau', 'Truck Sider'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </FormField>
            <FormField label="Placa"><input className={inputClass} value={form.plate} onChange={e => setField('plate', e.target.value)} /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Volume Carga (m³)"><input className={inputClass} type="number" value={form.vehicleVolume} onChange={e => setField('vehicleVolume', Number(e.target.value))} /></FormField>
            <FormField label="Peso Carga (Kg)"><input className={inputClass} type="number" value={form.vehicleWeight} onChange={e => setField('vehicleWeight', Number(e.target.value))} /></FormField>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button className={btnDanger} onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className={btnPrimary} onClick={save}>Salvar</button>
        </div>
      </Modal>
    </div>
  );
};

export default DriversPage;
