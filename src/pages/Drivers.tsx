import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ToastProvider';
import { useApp } from '@/contexts/AppContext';
import Modal from '@/components/Modal';
import { Driver } from '@/types';
import { FormField, inputClass, btnPrimary, btnDanger } from '@/components/shared';
import {
  deleteMotorista, deleteMotoristaAvaliacao, insertMotorista, insertMotoristaAvaliacao,
  listMotoristaAvaliacoes, listMotoristas, setMotoristaBlacklisted, updateMotorista,
  type MotoristaAvaliacaoRow,
} from '@/lib/cadastrosOps';
import { useTableSort } from '@/hooks/useTableSort';
import { useQuickFilter } from '@/hooks/useQuickFilter';
import { useColumnFilters, ColDef } from '@/hooks/useColumnFilters';
import { SortableHeader } from '@/components/table/SortableHeader';
import { QuickFilterBar } from '@/components/table/QuickFilterBar';
import { ColumnFilterRow, ColFilterSlot } from '@/components/table/ColumnFilterRow';
import { can } from '@/utils/access';
import { StarRating, RatingLabel } from '@/components/drivers/StarRating';
import { AlertTriangle, Star, Trash2 } from 'lucide-react';
import { fmtDate } from '@/lib/dateUtils';

const emptyDriver = {
  name: '', cpf: '', cnh: '', cnhCategory: 'B', phone: '',
  vehicleType: 'Carreta Bau', vehicleVolume: 0, vehicleWeight: 0,
  plate: '', status: 'Disponível' as const,
};

const DriversPage = () => {
  const { showToast } = useToast();
  const { addDriver, updateDriver: updateAppDriver, deleteDriver: deleteAppDriver, user } = useApp();
  const canCriarEditar = can(user, 'motoristas.criar_editar', 'motoristas', 'execute');
  const canExcluir     = can(user, 'motoristas.excluir',      'motoristas', 'execute');
  const canAvaliar     = can(user, 'motoristas.avaliar',      'motoristas', 'execute');
  const canBlacklist   = can(user, 'motoristas.blacklist',    'motoristas', 'execute');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [form, setForm] = useState<Omit<Driver, 'id'>>(emptyDriver);
  const [items, setItems] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);

  // Avaliação modal
  const [avalModal, setAvalModal] = useState<Driver | null>(null);
  const [avalEstrelas, setAvalEstrelas] = useState(5);
  const [avalComentario, setAvalComentario] = useState('');
  const [avalHistorico, setAvalHistorico] = useState<MotoristaAvaliacaoRow[]>([]);
  const [avalLoading, setAvalLoading] = useState(false);
  const [avalSaving, setAvalSaving] = useState(false);

  const { sortState, toggleSort, sortItems } = useTableSort();
  const { query, setQuery, filterItems } = useQuickFilter<Driver>();
  const colFilter = useColumnFilters();

  const load = async () => {
    setLoading(true);
    try {
      const rows = await listMotoristas();
      const next: Driver[] = rows.map((r) => ({
        id: r.id,
        name: r.nome || '',
        cpf: r.cpf || '',
        cnh: r.cnh_numero || '',
        cnhCategory: r.cnh_categoria || 'B',
        phone: r.telefone || '',
        vehicleType: r.tipo_veiculo || 'Carreta Bau',
        vehicleVolume: Number(r.volume_suportado_m3 || 0),
        vehicleWeight: Number(r.peso_suportado_kg || 0),
        plate: r.placa_veiculo || '',
        status: 'Disponível',
        blacklisted: r.blacklisted ?? false,
        rating: r.avaliacao_media ?? null,
        ratingCount: r.avaliacao_count ?? 0,
      }));
      setItems(next);
    } catch (e: any) {
      showToast(e?.message || 'Falha ao carregar motoristas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const textGetters: Array<(d: Driver) => unknown> = [
    (d) => d.name, (d) => d.phone, (d) => d.vehicleType, (d) => d.plate,
  ];
  const sortGetters: Record<string, (d: Driver) => unknown> = {
    name: (d) => d.name,
    phone: (d) => d.phone,
    vehicleType: (d) => d.vehicleType,
    vehicleVolume: (d) => d.vehicleVolume,
    vehicleWeight: (d) => d.vehicleWeight,
    plate: (d) => d.plate,
    rating: (d) => d.rating ?? -1,
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
    { type: 'none' }, { type: 'none' },
    { key: 'plate', type: 'text', placeholder: 'Placa...' },
    { type: 'none' }, { type: 'none' },
  ];

  const filtered = useMemo(
    () => sortItems(filterItems(colFilter.filterItems(items, colDefs), textGetters), sortGetters),
    [items, filterItems, sortItems, colFilter.filterItems],
  );

  const openNew = () => { setEditing(null); setForm(emptyDriver); setModalOpen(true); };
  const openEdit = (d: Driver) => {
    setEditing(d);
    setForm({
      name: d.name, cpf: d.cpf || '', cnh: d.cnh, cnhCategory: d.cnhCategory,
      phone: d.phone, vehicleType: d.vehicleType || 'Carreta Bau',
      vehicleVolume: d.vehicleVolume || 0, vehicleWeight: d.vehicleWeight || 0,
      plate: d.plate, status: d.status,
    });
    setModalOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) return;
    if (editing) {
      void (async () => {
        try {
          const row = await updateMotorista(editing.id, {
            nome: form.name.trim(), cpf: (form.cpf || '').trim() || null,
            telefone: form.phone.trim(), cnh_numero: form.cnh.trim(),
            cnh_categoria: String(form.cnhCategory || 'B'), placa_veiculo: form.plate.trim(),
            tipo_veiculo: String(form.vehicleType || 'Carreta Bau'),
            volume_suportado_m3: Number(form.vehicleVolume || 0),
            peso_suportado_kg: Number(form.vehicleWeight || 0),
          });
          const updated: Driver = {
            id: editing.id, name: row.nome || '', cpf: row.cpf || '', phone: row.telefone || '',
            cnh: row.cnh_numero || '', cnhCategory: row.cnh_categoria || 'B',
            plate: row.placa_veiculo || '', vehicleType: row.tipo_veiculo || 'Carreta Bau',
            vehicleVolume: Number(row.volume_suportado_m3 || 0),
            vehicleWeight: Number(row.peso_suportado_kg || 0),
            status: editing.status, blacklisted: editing.blacklisted,
            rating: editing.rating, ratingCount: editing.ratingCount,
          };
          setItems(prev => prev.map(d => d.id === editing.id ? updated : d));
          updateAppDriver(updated);
          showToast('Motorista atualizado!');
          setModalOpen(false);
        } catch (e: any) { showToast(e?.message || 'Falha ao salvar.', 'error'); }
      })();
    } else {
      void (async () => {
        try {
          const row = await insertMotorista({
            nome: form.name.trim(), cpf: (form.cpf || '').trim() || null,
            telefone: form.phone.trim(), cnh_numero: form.cnh.trim(),
            cnh_categoria: String(form.cnhCategory || 'B'), placa_veiculo: form.plate.trim(),
            tipo_veiculo: String(form.vehicleType || 'Carreta Bau'),
            volume_suportado_m3: Number(form.vehicleVolume || 0),
            peso_suportado_kg: Number(form.vehicleWeight || 0),
          });
          const newDriver: Driver = {
            id: row.id, name: row.nome || '', cpf: row.cpf || '',
            cnh: row.cnh_numero || '', cnhCategory: row.cnh_categoria || 'B',
            phone: row.telefone || '', vehicleType: row.tipo_veiculo || 'Carreta Bau',
            vehicleVolume: Number(row.volume_suportado_m3 || 0),
            vehicleWeight: Number(row.peso_suportado_kg || 0),
            plate: row.placa_veiculo || '', status: 'Disponível',
            blacklisted: false, rating: null, ratingCount: 0,
          };
          setItems(prev => [...prev, newDriver]);
          addDriver(newDriver);
          showToast('Motorista cadastrado!');
          setModalOpen(false);
        } catch (e: any) { showToast(e?.message || 'Falha ao salvar.', 'error'); }
      })();
    }
  };

  const toggleBlacklist = (d: Driver) => {
    const next = !d.blacklisted;
    void (async () => {
      try {
        await setMotoristaBlacklisted(d.id, next);
        const updated = { ...d, blacklisted: next };
        setItems(prev => prev.map(x => x.id === d.id ? updated : x));
        updateAppDriver(updated);
        showToast(next ? `${d.name} adicionado à lista negra.` : `${d.name} removido da lista negra.`);
      } catch (e: any) { showToast(e?.message || 'Falha ao atualizar.', 'error'); }
    })();
  };

  const openAvalModal = async (d: Driver) => {
    setAvalModal(d);
    setAvalEstrelas(5);
    setAvalComentario('');
    setAvalLoading(true);
    try {
      const hist = await listMotoristaAvaliacoes(d.id);
      setAvalHistorico(hist);
    } catch { setAvalHistorico([]); }
    finally { setAvalLoading(false); }
  };

  const submitAvaliacao = async () => {
    if (!avalModal) return;
    setAvalSaving(true);
    try {
      await insertMotoristaAvaliacao(avalModal.id, avalEstrelas, avalComentario.trim() || null, user?.name || null);
      // Recarrega histórico e média
      const [hist, rows] = await Promise.all([
        listMotoristaAvaliacoes(avalModal.id),
        listMotoristas(),
      ]);
      setAvalHistorico(hist);
      const freshRow = rows.find(r => r.id === avalModal.id);
      if (freshRow) {
        const updated: Driver = {
          ...avalModal,
          rating: freshRow.avaliacao_media ?? null,
          ratingCount: freshRow.avaliacao_count ?? 0,
        };
        setItems(prev => prev.map(x => x.id === avalModal.id ? updated : x));
        updateAppDriver(updated);
        setAvalModal(updated);
      }
      setAvalEstrelas(5);
      setAvalComentario('');
      showToast('Avaliação registrada!');
    } catch (e: any) { showToast(e?.message || 'Falha ao salvar avaliação.', 'error'); }
    finally { setAvalSaving(false); }
  };

  const removeAvaliacao = async (avalId: string) => {
    if (!avalModal) return;
    try {
      await deleteMotoristaAvaliacao(avalId);
      const [hist, rows] = await Promise.all([
        listMotoristaAvaliacoes(avalModal.id),
        listMotoristas(),
      ]);
      setAvalHistorico(hist);
      const freshRow = rows.find(r => r.id === avalModal.id);
      if (freshRow) {
        const updated: Driver = {
          ...avalModal,
          rating: freshRow.avaliacao_media ?? null,
          ratingCount: freshRow.avaliacao_count ?? 0,
        };
        setItems(prev => prev.map(x => x.id === avalModal.id ? updated : x));
        updateAppDriver(updated);
        setAvalModal(updated);
      }
      showToast('Avaliação removida.');
    } catch (e: any) { showToast(e?.message || 'Falha ao remover avaliação.', 'error'); }
  };

  const setField = <K extends keyof Omit<Driver, 'id'>>(key: K, value: Omit<Driver, 'id'>[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold font-display text-foreground">Motoristas</h1>
        {canCriarEditar && (
          <button className={btnPrimary} onClick={openNew}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Novo Motorista
          </button>
        )}
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
              <SortableHeader columnKey="rating" sortState={sortState} onToggle={toggleSort}>Avaliação</SortableHeader>
              <th className="text-left py-3 px-4 font-display font-medium text-muted-foreground">Status</th>
              <th className="text-left py-3 px-4 font-display font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => (
              <tr
                key={d.id}
                className={`border-b border-border/50 hover:bg-muted/50 transition-colors ${i % 2 ? 'bg-muted/20' : ''} ${d.blacklisted ? 'bg-red-50/60 dark:bg-red-950/10' : ''}`}
              >
                <td className={`py-3 px-4 font-display font-medium ${d.blacklisted ? 'text-red-700 dark:text-red-400 font-bold' : ''}`}>
                  <div className="flex items-center gap-1.5">
                    {d.blacklisted && <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />}
                    {d.name}
                    {d.blacklisted && (
                      <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white">
                        BLACKLIST
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4 font-mono-data">{d.phone}</td>
                <td className="py-3 px-4 font-display">{d.vehicleType}</td>
                <td className="py-3 px-4 font-mono-data">{d.vehicleVolume || 0} m³</td>
                <td className="py-3 px-4 font-mono-data">{d.vehicleWeight || 0} Kg</td>
                <td className="py-3 px-4 font-mono-data">{d.plate}</td>
                <td className="py-3 px-4">
                  <RatingLabel rating={d.rating} count={d.ratingCount} />
                </td>
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${d.blacklisted ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                    {d.blacklisted ? 'Lista Negra' : 'Ativo'}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex gap-2 items-center">
                    {/* Avaliar */}
                    {canAvaliar && (
                      <button
                        title="Avaliar motorista"
                        onClick={() => void openAvalModal(d)}
                        className="text-muted-foreground hover:text-amber-500 transition-colors"
                      >
                        <Star className="h-4 w-4" />
                      </button>
                    )}

                    {/* Blacklist toggle */}
                    {canBlacklist && (
                      <button
                        title={d.blacklisted ? 'Remover da lista negra' : 'Adicionar à lista negra'}
                        onClick={() => toggleBlacklist(d)}
                        className={`transition-colors ${d.blacklisted ? 'text-red-600 hover:text-muted-foreground' : 'text-muted-foreground hover:text-red-600'}`}
                      >
                        <AlertTriangle className="h-4 w-4" />
                      </button>
                    )}

                    {/* Editar */}
                    {canCriarEditar && (
                      <button onClick={() => openEdit(d)} className="text-muted-foreground hover:text-primary transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    )}

                    {/* Excluir */}
                    {canExcluir && (
                      <button
                        onClick={() => {
                          void (async () => {
                            try {
                              await deleteMotorista(d.id);
                              setItems(prev => prev.filter(x => x.id !== d.id));
                              deleteAppDriver(d.id);
                              showToast('Motorista excluído.', 'info');
                            } catch (e: any) { showToast(e?.message || 'Falha ao excluir.', 'error'); }
                          })();
                        }}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={9} className="py-8 text-center text-muted-foreground italic">Nenhum motorista encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <div className="text-sm text-muted-foreground font-display">Carregando...</div>}

      {/* Modal: Criar/Editar motorista */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Motorista' : 'Novo Motorista'}>
        <div className="space-y-4">
          <FormField label="Nome"><input className={inputClass} value={form.name} onChange={e => setField('name', e.target.value)} /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="CPF"><input className={inputClass} value={form.cpf || ''} onChange={e => setField('cpf', e.target.value)} placeholder="000.000.000-00" /></FormField>
            <FormField label="Telefone"><input className={inputClass} value={form.phone} onChange={e => setField('phone', e.target.value)} /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="CNH"><input className={inputClass} value={form.cnh} onChange={e => setField('cnh', e.target.value)} /></FormField>
            <FormField label="Categoria">
              <select className={inputClass} value={form.cnhCategory} onChange={e => setField('cnhCategory', e.target.value)}>
                {['A', 'B', 'C', 'D', 'E', 'AB'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>
          </div>
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

      {/* Modal: Avaliação */}
      {avalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Cabeçalho */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold font-display text-foreground flex items-center gap-2">
                  <Star className="h-5 w-5 text-amber-500" />
                  Avaliação — {avalModal.name}
                </h2>
                <div className="mt-1">
                  <RatingLabel rating={avalModal.rating} count={avalModal.ratingCount} size="md" />
                </div>
              </div>
              <button onClick={() => setAvalModal(null)} className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none">×</button>
            </div>

            {/* Nova avaliação */}
            <div className="border border-border rounded-xl p-4 space-y-3 bg-muted/20">
              <p className="text-sm font-semibold text-foreground">Nova avaliação</p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Nota:</span>
                <StarRating
                  value={avalEstrelas}
                  size="lg"
                  interactive
                  onChange={setAvalEstrelas}
                />
                <span className="text-sm font-bold text-amber-600 ml-1">{avalEstrelas}/5</span>
              </div>
              <textarea
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary resize-none"
                placeholder="Comentário opcional..."
                value={avalComentario}
                onChange={e => setAvalComentario(e.target.value)}
              />
              <button
                className={btnPrimary}
                onClick={() => void submitAvaliacao()}
                disabled={avalSaving}
              >
                <Star className="h-4 w-4" />
                {avalSaving ? 'Salvando...' : 'Registrar Avaliação'}
              </button>
            </div>

            {/* Histórico */}
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                Histórico de Avaliações ({avalHistorico.length})
              </p>
              {avalLoading ? (
                <p className="text-sm text-muted-foreground italic">Carregando...</p>
              ) : avalHistorico.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Nenhuma avaliação registrada ainda.</p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {avalHistorico.map(a => (
                    <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background">
                      <StarRating value={a.estrelas} size="sm" />
                      <div className="flex-1 min-w-0">
                        {a.comentario && <p className="text-sm text-foreground">{a.comentario}</p>}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {a.avaliado_por ? `Por ${a.avaliado_por} · ` : ''}{fmtDate(a.criado_em)}
                        </p>
                      </div>
                      {canCriarEditar && (
                        <button
                          onClick={() => void removeAvaliacao(a.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                          title="Remover avaliação"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriversPage;
