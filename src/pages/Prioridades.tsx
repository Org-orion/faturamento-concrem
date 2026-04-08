import React, { useEffect, useMemo, useState } from 'react';
import { useApp, tableColumns } from '@/contexts/AppContext';
import { usePrioridades } from '@/contexts/PrioridadesContext';
import { useToast } from '@/components/ToastProvider';
import Modal from '@/components/Modal';
import { btnPrimary, btnSecondary, btnDanger, inputClass } from '@/components/shared';
import { Flag, Plus, Trash2, Search, AlertTriangle } from 'lucide-react';
import { NivelPrioridade, upsertPrioridade, desativarPrioridade } from '@/lib/prioridadesRepo';
import { supabasePedidos } from '@/lib/supabase';
import { rowToOrder } from '@/lib/pedidoMapper';
import type { Order } from '@/types';
import { fmtDate } from '@/lib/dateUtils';

const NIVEL_CONFIG: Record<NivelPrioridade, { label: string; color: string; bg: string; border: string; icon: string }> = {
  urgente: { label: 'Urgente', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-500' },
  alta:    { label: 'Alta',    color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', icon: 'text-orange-500' },
  media:   { label: 'Média',   color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', icon: 'text-yellow-500' },
};

const Prioridades = () => {
  const { user } = useApp();
  const { map: prioMap, refresh } = usePrioridades();
  const { showToast } = useToast();

  const [openAdd, setOpenAdd] = useState(false);
  const [openRemove, setOpenRemove] = useState<string | null>(null);

  // Add modal state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Order[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState<{ id: string; cliente: string } | null>(null);
  const [nivel, setNivel] = useState<NivelPrioridade>('alta');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch client info for listed priorities (for display)
  const [pedidoInfo, setPedidoInfo] = useState<Map<string, { cliente: string }>>(new Map());

  const prioList = useMemo(() => Array.from(prioMap.values()), [prioMap]);

  useEffect(() => {
    if (prioList.length === 0 || !supabasePedidos) return;
    const ids = prioList.map(p => p.pedido_id);
    const missingIds = ids.filter(id => !pedidoInfo.has(id));
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
  }, [prioList, pedidoInfo]);

  const handleSearch = async () => {
    if (!supabasePedidos || !searchQuery.trim()) return;
    setSearching(true);
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
    const { data } = await supabasePedidos
      .from(table)
      .select(tableColumns)
      .ilike('numero_pedido', `%${searchQuery.trim()}%`)
      .limit(10);
    setSearchResults((data || []).map((r: any) => rowToOrder(r, 'CLI-001')));
    setSearching(false);
  };

  const handleSave = async () => {
    if (!selectedPedido) { showToast('Selecione um pedido.', 'error'); return; }
    if (!motivo.trim()) { showToast('Informe o motivo da prioridade.', 'error'); return; }
    setSaving(true);
    const result = await upsertPrioridade({
      pedido_id: selectedPedido.id,
      nivel,
      motivo: motivo.trim(),
      criado_por: user?.username || user?.name || null,
    });
    setSaving(false);
    if (result) {
      showToast('Prioridade adicionada!');
      await refresh();
      resetModal();
    } else {
      showToast('Erro ao salvar prioridade.', 'error');
    }
  };

  const handleRemove = async (pedidoId: string) => {
    await desativarPrioridade(pedidoId);
    await refresh();
    setOpenRemove(null);
    showToast('Prioridade removida.');
  };

  const resetModal = () => {
    setOpenAdd(false);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedPedido(null);
    setNivel('alta');
    setMotivo('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-display">Prioridades</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie as bandeiras de prioridade dos pedidos</p>
        </div>
        <button className={btnPrimary} onClick={() => setOpenAdd(true)}>
          <Plus className="h-4 w-4" />
          Adicionar Prioridade
        </button>
      </div>

      {prioList.length === 0 ? (
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
                  <th className="py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Pedido</th>
                  <th className="py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Cliente</th>
                  <th className="py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Nível</th>
                  <th className="py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Motivo</th>
                  <th className="py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Adicionado por</th>
                  <th className="py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Data</th>
                  <th className="py-4 px-6 text-right font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Ações</th>
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
                        <button
                          className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-all"
                          onClick={() => setOpenRemove(p.pedido_id)}
                          title="Remover prioridade"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Adicionar */}
      <Modal open={openAdd} onClose={resetModal} title="Adicionar Prioridade" wide>
        <div className="space-y-5">
          {/* Search pedido */}
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

          {/* Nível */}
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

          {/* Motivo */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-tight mb-1.5">Motivo da Prioridade *</label>
            <textarea
              className={`${inputClass} min-h-[80px] resize-y`}
              placeholder="Descreva o motivo da prioridade..."
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button className={btnSecondary} onClick={resetModal}>Cancelar</button>
            <button className={btnPrimary} onClick={handleSave} disabled={saving || !selectedPedido || !motivo.trim()}>
              <Flag className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Adicionar Prioridade'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Confirmação de Remoção */}
      <Modal open={!!openRemove} onClose={() => setOpenRemove(null)} title="Remover Prioridade">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">
              Tem certeza que deseja remover a prioridade do pedido <span className="font-bold">{openRemove}</span>?
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button className={btnSecondary} onClick={() => setOpenRemove(null)}>Cancelar</button>
            <button className={btnDanger} onClick={() => openRemove && handleRemove(openRemove)}>
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
