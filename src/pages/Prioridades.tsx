import React, { useEffect, useMemo, useState } from 'react';
import { useApp, tableColumns } from '@/contexts/AppContext';
import { can } from '@/utils/access';
import { usePrioridades } from '@/contexts/PrioridadesContext';
import { useAtencao } from '@/contexts/AtencaoContext';
import { useToast } from '@/components/ToastProvider';
import Modal from '@/components/Modal';
import { btnPrimary, btnSecondary, btnDanger, inputClass } from '@/components/shared';
import { Flag, Plus, Trash2, Search, AlertTriangle, Bell } from 'lucide-react';
import { NivelPrioridade, upsertPrioridade, desativarPrioridade } from '@/lib/prioridadesRepo';
import { upsertAtencao, desativarAtencao } from '@/lib/atencaoRepo';
import { supabasePedidos } from '@/lib/supabase';
import { rowToOrder } from '@/lib/pedidoMapper';
import type { Order } from '@/types';
import { fmtDate } from '@/lib/dateUtils';

const NIVEL_CONFIG: Record<NivelPrioridade, { label: string; color: string; bg: string; border: string; icon: string }> = {
  urgente: { label: 'Urgente', color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    icon: 'text-red-500' },
  alta:    { label: 'Alta',    color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', icon: 'text-orange-500' },
  media:   { label: 'Média',   color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', icon: 'text-yellow-500' },
};

const ATENCAO_CONFIG = {
  color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-500',
};

type Tab = 'prioridades' | 'atencoes';

const Prioridades = () => {
  const { user } = useApp();
  const canGerenciar = can(user, 'prioridades.gerenciar', 'prioridades', 'execute');
  const { map: prioMap, refresh: refreshPrio } = usePrioridades();
  const { map: atencaoMap, refresh: refreshAtencao } = useAtencao();
  const { showToast } = useToast();

  const [tab, setTab] = useState<Tab>('prioridades');

  // --- Shared add/remove modal state ---
  const [openAdd, setOpenAdd] = useState<Tab | null>(null);
  const [openRemove, setOpenRemove] = useState<{ id: string; tipo: Tab } | null>(null);

  // Add modal fields
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Order[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState<{ id: string; cliente: string } | null>(null);
  const [nivel, setNivel] = useState<NivelPrioridade>('alta');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  // Client info cache for listed items
  const [pedidoInfo, setPedidoInfo] = useState<Map<string, { cliente: string }>>(new Map());

  const prioList  = useMemo(() => Array.from(prioMap.values()),   [prioMap]);
  const atencList = useMemo(() => Array.from(atencaoMap.values()), [atencaoMap]);

  // Fetch client names for all displayed items
  const allIds = useMemo(() => {
    const set = new Set([...prioList.map(p => p.pedido_id), ...atencList.map(a => a.pedido_id)]);
    return Array.from(set);
  }, [prioList, atencList]);

  useEffect(() => {
    if (allIds.length === 0 || !supabasePedidos) return;
    const missingIds = allIds.filter(id => !pedidoInfo.has(id));
    if (missingIds.length === 0) return;
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
    void supabasePedidos
      .from(table)
      .select(tableColumns)
      .in('numero_pedido', missingIds)
      .then(({ data }) => {
        if (!data) return;
        setPedidoInfo(prev => {
          const next = new Map(prev);
          for (const row of data as any[]) {
            const o = rowToOrder(row, 'CLI-001');
            next.set(o.id, { cliente: o.clientName || o.clientCode || '-' });
          }
          return next;
        });
      });
  }, [allIds, pedidoInfo]);

  const handleSearch = async () => {
    if (!supabasePedidos || !searchQuery.trim()) return;
    setSearching(true);
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
    const { data } = await supabasePedidos
      .from(table)
      .select('numero_pedido, cliente_nome, cliente_codigo')
      .eq('numero_pedido', searchQuery.trim())
      .limit(10);
    setSearchResults((data || []).map((r: any) => rowToOrder(r, 'CLI-001')));
    setSearching(false);
  };

  const handleSave = async () => {
    if (!selectedPedido) { showToast('Selecione um pedido.', 'error'); return; }
    if (!motivo.trim()) { showToast('Informe o motivo.', 'error'); return; }
    setSaving(true);

    if (openAdd === 'prioridades') {
      const result = await upsertPrioridade({
        pedido_id: selectedPedido.id,
        nivel,
        motivo: motivo.trim(),
        criado_por: user?.username || user?.name || null,
      });
      if (result) { showToast('Prioridade adicionada!'); await refreshPrio(); resetModal(); }
      else showToast('Erro ao salvar prioridade.', 'error');
    } else {
      const result = await upsertAtencao({
        pedido_id: selectedPedido.id,
        motivo: motivo.trim(),
        criado_por: user?.username || user?.name || null,
      });
      if (result) { showToast('Atenção adicionada!'); await refreshAtencao(); resetModal(); }
      else showToast('Erro ao salvar atenção.', 'error');
    }
    setSaving(false);
  };

  const handleRemove = async () => {
    if (!openRemove) return;
    if (openRemove.tipo === 'prioridades') {
      await desativarPrioridade(openRemove.id);
      await refreshPrio();
      showToast('Prioridade removida.');
    } else {
      await desativarAtencao(openRemove.id);
      await refreshAtencao();
      showToast('Atenção removida.');
    }
    setOpenRemove(null);
  };

  const resetModal = () => {
    setOpenAdd(null);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedPedido(null);
    setNivel('alta');
    setMotivo('');
  };

  const thClass = 'py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-display">Prioridades & Atenções</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie bandeiras de prioridade e pontos de atenção dos pedidos</p>
        </div>
        {canGerenciar && (
          <button className={btnPrimary} onClick={() => setOpenAdd(tab)}>
            <Plus className="h-4 w-4" />
            {tab === 'prioridades' ? 'Adicionar Prioridade' : 'Adicionar Atenção'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab('prioridades')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors -mb-px ${tab === 'prioridades' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <span className="flex items-center gap-2">
            <Flag className="h-4 w-4" />
            Prioridades
            {prioList.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">{prioList.length}</span>}
          </span>
        </button>
        <button
          onClick={() => setTab('atencoes')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors -mb-px ${tab === 'atencoes' ? 'border-blue-500 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <span className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Atenções
            {atencList.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">{atencList.length}</span>}
          </span>
        </button>
      </div>

      {/* --- Prioridades tab --- */}
      {tab === 'prioridades' && (
        prioList.length === 0 ? (
          <div className="bg-card rounded-xl border border-border shadow-card p-10 text-center">
            <Flag className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <div className="text-muted-foreground">Nenhuma prioridade ativa no momento.</div>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className={thClass}>Pedido</th>
                    <th className={thClass}>Cliente</th>
                    <th className={thClass}>Nível</th>
                    <th className={thClass}>Motivo</th>
                    <th className={thClass}>Adicionado por</th>
                    <th className={thClass}>Data</th>
                    <th className={`${thClass} text-right`}>Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {prioList.map(p => {
                    const cfg = NIVEL_CONFIG[p.nivel] || NIVEL_CONFIG.alta;
                    const info = pedidoInfo.get(p.pedido_id);
                    return (
                      <tr key={p.pedido_id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-4 px-6 font-mono-data font-bold text-primary">{p.pedido_id}</td>
                        <td className="py-4 px-6">{info?.cliente || '-'}</td>
                        <td className="py-4 px-6">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                            <Flag className={`h-3 w-3 ${cfg.icon}`} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="py-4 px-6 max-w-[300px] truncate text-muted-foreground">{p.motivo}</td>
                        <td className="py-4 px-6 text-muted-foreground">{p.criado_por || '-'}</td>
                        <td className="py-4 px-6 font-mono-data text-muted-foreground">{fmtDate(p.criado_em)}</td>
                        <td className="py-4 px-6 text-right">
                          {canGerenciar && (
                            <button
                              className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-all"
                              onClick={() => setOpenRemove({ id: p.pedido_id, tipo: 'prioridades' })}
                              title="Remover prioridade"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* --- Atenções tab --- */}
      {tab === 'atencoes' && (
        atencList.length === 0 ? (
          <div className="bg-card rounded-xl border border-border shadow-card p-10 text-center">
            <Bell className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <div className="text-muted-foreground">Nenhum ponto de atenção ativo no momento.</div>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className={thClass}>Pedido</th>
                    <th className={thClass}>Cliente</th>
                    <th className={thClass}>Motivo</th>
                    <th className={thClass}>Adicionado por</th>
                    <th className={thClass}>Data</th>
                    <th className={`${thClass} text-right`}>Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {atencList.map(a => {
                    const info = pedidoInfo.get(a.pedido_id);
                    return (
                      <tr key={a.pedido_id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-4 px-6 font-mono-data font-bold text-primary">{a.pedido_id}</td>
                        <td className="py-4 px-6">{info?.cliente || '-'}</td>
                        <td className="py-4 px-6 max-w-[360px] truncate text-muted-foreground">{a.motivo}</td>
                        <td className="py-4 px-6 text-muted-foreground">{a.criado_por || '-'}</td>
                        <td className="py-4 px-6 font-mono-data text-muted-foreground">{fmtDate(a.criado_em)}</td>
                        <td className="py-4 px-6 text-right">
                          {canGerenciar && (
                            <button
                              className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-all"
                              onClick={() => setOpenRemove({ id: a.pedido_id, tipo: 'atencoes' })}
                              title="Remover atenção"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Modal Adicionar */}
      <Modal open={!!openAdd} onClose={resetModal} title={openAdd === 'prioridades' ? 'Adicionar Prioridade' : 'Adicionar Atenção'} wide>
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-tight mb-1.5">Buscar Pedido</label>
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="Número do pedido..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
              <button className={btnSecondary} onClick={handleSearch} disabled={searching}>
                <Search className="h-4 w-4" />
                {searching ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="mt-2 border border-border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                {searchResults.map(o => (
                  <button
                    key={o.id}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/30 transition-colors flex items-center gap-3 ${selectedPedido?.id === o.id ? 'bg-primary/10 border-l-2 border-primary' : ''}`}
                    onClick={() => setSelectedPedido({ id: o.id, cliente: o.clientName || o.clientCode || '-' })}
                  >
                    <span className="font-mono-data font-bold text-primary">{o.id}</span>
                    <span className="text-muted-foreground truncate">{o.clientName || o.clientCode || '-'}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedPedido && (
              <div className="mt-2 text-sm text-foreground font-semibold">
                Selecionado: <span className="text-primary">{selectedPedido.id}</span> — {selectedPedido.cliente}
              </div>
            )}
          </div>

          {/* Nível — só para prioridades */}
          {openAdd === 'prioridades' && (
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-tight mb-1.5">Nível de Prioridade</label>
              <div className="flex gap-2">
                {(Object.entries(NIVEL_CONFIG) as [NivelPrioridade, typeof NIVEL_CONFIG['urgente']][]).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setNivel(key)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-bold transition-all ${
                      nivel === key
                        ? `${cfg.bg} ${cfg.color} ${cfg.border} ring-2 ring-offset-1 ring-current/20`
                        : 'border-border text-muted-foreground hover:bg-muted/30'
                    }`}
                  >
                    <Flag className={`h-4 w-4 ${nivel === key ? cfg.icon : ''}`} />
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-tight mb-1.5">
              {openAdd === 'prioridades' ? 'Motivo da Prioridade *' : 'Ponto de Atenção *'}
            </label>
            <textarea
              className={`${inputClass} min-h-[80px] resize-y`}
              placeholder={openAdd === 'prioridades' ? 'Descreva o motivo da prioridade...' : 'Descreva o ponto de atenção...'}
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button className={btnSecondary} onClick={resetModal}>Cancelar</button>
            <button className={btnPrimary} onClick={handleSave} disabled={saving || !selectedPedido || !motivo.trim()}>
              {openAdd === 'prioridades' ? <Flag className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              {saving ? 'Salvando...' : openAdd === 'prioridades' ? 'Adicionar Prioridade' : 'Adicionar Atenção'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Confirmação de Remoção */}
      <Modal open={!!openRemove} onClose={() => setOpenRemove(null)} title={openRemove?.tipo === 'prioridades' ? 'Remover Prioridade' : 'Remover Atenção'}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">
              Tem certeza que deseja remover {openRemove?.tipo === 'prioridades' ? 'a prioridade' : 'a atenção'} do pedido{' '}
              <span className="font-bold">{openRemove?.id}</span>?
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button className={btnSecondary} onClick={() => setOpenRemove(null)}>Cancelar</button>
            <button className={btnDanger} onClick={handleRemove}>
              <Trash2 className="h-4 w-4" />
              Remover
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Prioridades;
