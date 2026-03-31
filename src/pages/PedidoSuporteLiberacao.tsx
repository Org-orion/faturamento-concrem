import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import { btnPrimary } from '@/components/shared';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { SupportOrder, PedidoStatusRow } from '@/types';
import type { FilterCondition, FilterField } from '@/lib/filters';
import { applyFilters } from '@/lib/filters';
import { FilterConfiguratorDialog } from '@/components/filters/FilterConfiguratorDialog';
import { FilterTriggerButton } from '@/components/filters/FilterTriggerButton';
import { ActiveFiltersChips } from '@/components/filters/ActiveFiltersChips';
import { useTableSort } from '@/hooks/useTableSort';
import { useQuickFilter } from '@/hooks/useQuickFilter';
import { useColumnFilters } from '@/hooks/useColumnFilters';
import { SortableHeader } from '@/components/table/SortableHeader';
import { QuickFilterBar } from '@/components/table/QuickFilterBar';
import { ColumnFilterRow, type ColFilterSlot } from '@/components/table/ColumnFilterRow';
import type { ColDef } from '@/hooks/useColumnFilters';
import { listPedidosStatusByPedidoIds, updatePedidoStatus } from '@/lib/pedidosStatusRepo';

const formatDateBR = (iso?: string) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('pt-BR');
};

const PedidoSuporteLiberacao = () => {
  const { supportOrders, user } = useApp();
  const { showToast } = useToast();

  const [loadIds, setLoadIds] = useState<string[]>([]);
  const [session3Selected, setSession3Selected] = useState<string[]>([]);

  const [statusRows, setStatusRows] = useState<PedidoStatusRow[]>([]);
  const statusByPedidoId = useMemo(() => new Map(statusRows.map(r => [r.pedido_id, r] as const)), [statusRows]);

  const [liberatedToProducaoIds, setLiberatedToProducaoIds] = useState<Set<string>>(new Set());

  const [s2FiltersOpen, setS2FiltersOpen] = useState(false);
  const [s2Conditions, setS2Conditions] = useState<FilterCondition[]>([]);

  const [s3FiltersOpen, setS3FiltersOpen] = useState(false);
  const [s3Conditions, setS3Conditions] = useState<FilterCondition[]>([]);

  const { sortState: s2Sort, toggleSort: s2Toggle, sortItems: s2SortItems } = useTableSort();
  const { query: s2Query, setQuery: s2SetQuery, filterItems: s2QuickFilter } = useQuickFilter<SupportOrder>();

  const { sortState: s3Sort, toggleSort: s3Toggle, sortItems: s3SortItems } = useTableSort();
  const { query: s3Query, setQuery: s3SetQuery, filterItems: s3QuickFilter } = useQuickFilter<SupportOrder>();

  const s2ColFilter = useColumnFilters();
  const s3ColFilter = useColumnFilters();

  const s2ColDefs = useMemo<ColDef<SupportOrder>[]>(() => [
    { key: 'pedido', getter: (o) => o.id },
    { key: 'cliente', getter: (o) => `${o.clientCode || ''} ${o.clientName || ''}` },
    { key: 'representante', getter: (o) => o.representativeName },
    { key: 'cidadeUf', getter: (o) => o.clientCity && o.clientUF ? `${o.clientCity} - ${o.clientUF}` : '' },
    { key: 'emissao', getter: (o) => o.date },
    { key: 'validade', getter: (o) => o.expiryDate },
  ], []);

  const s2ColSlots = useMemo<ColFilterSlot[]>(() => [
    { key: 'pedido', type: 'text', placeholder: 'Filtrar pedido...' },
    { key: 'cliente', type: 'text', placeholder: 'Filtrar cliente...' },
    { key: 'representante', type: 'text', placeholder: 'Filtrar representante...' },
    { key: 'cidadeUf', type: 'text', placeholder: 'Filtrar cidade/UF...' },
    { key: 'emissao', type: 'date' },
    { key: 'validade', type: 'date' },
    { type: 'none' },
  ], []);

  const s3ColDefs = useMemo<ColDef<SupportOrder>[]>(() => [
    { key: 'pedido', getter: (o) => o.id },
    { key: 'cliente', getter: (o) => `${o.clientCode || ''} ${o.clientName || ''}` },
    { key: 'representante', getter: (o) => o.representativeName },
    { key: 'cidadeUf', getter: (o) => o.clientCity && o.clientUF ? `${o.clientCity} - ${o.clientUF}` : '' },
    { key: 'validade', getter: (o) => o.expiryDate },
  ], []);

  const s3ColSlots = useMemo<ColFilterSlot[]>(() => [
    { type: 'none' },
    { key: 'pedido', type: 'text', placeholder: 'Filtrar pedido...' },
    { key: 'cliente', type: 'text', placeholder: 'Filtrar cliente...' },
    { key: 'representante', type: 'text', placeholder: 'Filtrar representante...' },
    { key: 'cidadeUf', type: 'text', placeholder: 'Filtrar cidade/UF...' },
    { key: 'validade', type: 'date' },
    { type: 'none' },
  ], []);

  const s12TextGetters: Array<(item: SupportOrder) => unknown> = useMemo(() => [
    (o) => o.id,
    (o) => o.clientCode,
    (o) => o.clientName,
    (o) => o.representativeName,
    (o) => o.clientCity,
    (o) => o.clientUF,
  ], []);

  const s12SortGetters: Record<string, (item: SupportOrder) => unknown> = useMemo(() => ({
    pedido: (o) => o.id,
    cliente: (o) => o.clientName,
    representante: (o) => o.representativeName,
    cidadeUf: (o) => `${o.clientCity || ''} - ${o.clientUF || ''}`,
    emissao: (o) => o.date,
    validade: (o) => o.expiryDate,
  }), []);

  const s3TextGetters: Array<(item: SupportOrder) => unknown> = useMemo(() => [
    (o) => o.id,
    (o) => o.clientCode,
    (o) => o.clientName,
    (o) => o.representativeName,
    (o) => o.clientCity,
    (o) => o.clientUF,
  ], []);

  const s3SortGetters: Record<string, (item: SupportOrder) => unknown> = useMemo(() => ({
    pedido: (o) => o.id,
    cliente: (o) => o.clientName,
    representante: (o) => o.representativeName,
    cidadeUf: (o) => `${o.clientCity || ''} - ${o.clientUF || ''}`,
    validade: (o) => o.expiryDate,
  }), []);

  const s12FilterFields = useMemo(() => [
    { id: 'pedido', label: 'Número do pedido', type: 'text', getValue: (o: SupportOrder) => o.id, placeholder: 'Ex: SUP-001' },
    { id: 'cliente', label: 'Cliente', type: 'text', getValue: (o: SupportOrder) => `${o.clientCode || ''} ${o.clientName || ''}`.trim(), placeholder: 'Código ou nome...' },
    { id: 'representante', label: 'Representante', type: 'text', getValue: (o: SupportOrder) => o.representativeName || '', placeholder: 'Nome do representante...' },
    { id: 'cidadeUf', label: 'Cidade / UF', type: 'text', getValue: (o: SupportOrder) => `${o.clientCity || ''} - ${o.clientUF || ''}`.trim(), placeholder: 'Ex: Curitiba - PR' },
    { id: 'validade', label: 'Data validade', type: 'date', getValue: (o: SupportOrder) => o.expiryDate || '' },
    { id: 'emissao', label: 'Data emissão', type: 'date', getValue: (o: SupportOrder) => o.date || '' },
  ] satisfies Array<FilterField<SupportOrder>>, []);

  const s3FilterFields = useMemo(() => [
    { id: 'representante', label: 'Representante', type: 'text', getValue: (o: SupportOrder) => o.representativeName || '', placeholder: 'Nome do representante...' },
    { id: 'cidadeUf', label: 'Cidade / UF', type: 'text', getValue: (o: SupportOrder) => `${o.clientCity || ''} - ${o.clientUF || ''}`.trim(), placeholder: 'Ex: Curitiba - PR' },
    { id: 'validade', label: 'Data validade', type: 'date', getValue: (o: SupportOrder) => o.expiryDate || '' },
    { id: 'emissao', label: 'Data emissão', type: 'date', getValue: (o: SupportOrder) => o.date || '' },
  ] satisfies Array<FilterField<SupportOrder>>, []);

  // Load status rows when supportOrders change
  useEffect(() => {
    const ids = supportOrders.map(o => o.id);
    if (!ids.length) return;
    void listPedidosStatusByPedidoIds(ids).then(setStatusRows);
  }, [supportOrders]);

  // Section 1 candidates: supportOrders with liberado_comercial status, not in load
  const s2Orders = useMemo(() => {
    return supportOrders
      .filter(o => {
        if (liberatedToProducaoIds.has(o.id)) return false;
        if (loadIds.includes(o.id)) return false;
        const st = statusByPedidoId.get(o.id)?.status_atual;
        return st === 'liberado_comercial';
      })
      .sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || '') || String(a.id).localeCompare(String(b.id)));
  }, [supportOrders, statusByPedidoId, loadIds, liberatedToProducaoIds]);

  // Section 2: current load
  const s3Orders = useMemo(() => {
    const map = new Map(supportOrders.map((o) => [o.id, o] as const));
    return loadIds.map((id) => map.get(id)).filter(Boolean) as SupportOrder[];
  }, [loadIds, supportOrders]);

  const s2Filtered = useMemo(
    () => s2SortItems(s2QuickFilter(applyFilters(s2ColFilter.filterItems(s2Orders, s2ColDefs), s12FilterFields, s2Conditions), s12TextGetters), s12SortGetters),
    [s2Orders, s2ColFilter.filterItems, s2ColDefs, s12FilterFields, s2Conditions, s2QuickFilter, s12TextGetters, s2SortItems, s12SortGetters],
  );

  const s3Filtered = useMemo(
    () => s3SortItems(s3QuickFilter(applyFilters(s3ColFilter.filterItems(s3Orders, s3ColDefs), s3FilterFields, s3Conditions), s3TextGetters), s3SortGetters),
    [s3Orders, s3ColFilter.filterItems, s3ColDefs, s3FilterFields, s3Conditions, s3QuickFilter, s3TextGetters, s3SortItems, s3SortGetters],
  );

  const toggleAll = (current: string[], setter: (v: string[]) => void, ids: string[]) => {
    setter(current.length === ids.length ? [] : ids);
  };

  const addToLoad = (id: string) => {
    setLoadIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const removeFromLoad = (id: string) => {
    setLoadIds((prev) => prev.filter((x) => x !== id));
    setSession3Selected((prev) => prev.filter((x) => x !== id));
  };

  const confirmarLiberacao = async () => {
    if (!loadIds.length) {
      showToast('Nenhum pedido na carga', 'error');
      return;
    }
    const username = user?.username || null;

    for (const id of loadIds) {
      await updatePedidoStatus({
        pedidoId: id,
        numeroPedido: id,
        statusNovo: 'liberado_producao',
        alteradoPor: username,
        observacao: 'Suporte liberado para produção pelo comercial',
      });
    }

    setLiberatedToProducaoIds(prev => { const next = new Set(prev); loadIds.forEach(id => next.add(id)); return next; });
    setLoadIds([]);
    setSession3Selected([]);
    showToast('Carga liberada para Produção');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold font-display text-foreground">Liberação de Pedidos Suporte</h1>
          <p className="text-sm text-muted-foreground">Confirme, monte a carga e libere para a produção</p>
        </div>
      </div>

      {/* Seção 1: Pedidos aguardando liberação para produção (liberado_comercial) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-sm font-bold font-display uppercase tracking-wider text-muted-foreground">Aguardando Liberação para Produção</h2>
        </div>

        <QuickFilterBar
          query={s2Query}
          onQueryChange={s2SetQuery}
          placeholder="Buscar pedido, cliente, representante..."
        >
          <FilterTriggerButton count={s2Conditions.length} onClick={() => setS2FiltersOpen(true)} />
        </QuickFilterBar>

        <ActiveFiltersChips
          fields={s12FilterFields}
          conditions={s2Conditions}
          onRemove={(id) => setS2Conditions((prev) => prev.filter((c) => c.id !== id))}
          onClear={() => setS2Conditions([])}
        />

        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <ColumnFilterRow columns={s2ColSlots} values={s2ColFilter.values} onChange={s2ColFilter.setFilter} />
                <tr className="border-b border-border bg-muted/30">
                  <SortableHeader columnKey="pedido" sortState={s2Sort} onToggle={s2Toggle} className="text-left py-4 px-6">Pedido</SortableHeader>
                  <SortableHeader columnKey="cliente" sortState={s2Sort} onToggle={s2Toggle} className="text-left py-4 px-6">Cliente</SortableHeader>
                  <SortableHeader columnKey="representante" sortState={s2Sort} onToggle={s2Toggle} className="text-left py-4 px-6">Representante</SortableHeader>
                  <SortableHeader columnKey="cidadeUf" sortState={s2Sort} onToggle={s2Toggle} className="text-left py-4 px-6">Cidade / UF</SortableHeader>
                  <SortableHeader columnKey="emissao" sortState={s2Sort} onToggle={s2Toggle} className="text-left py-4 px-6">Emissão</SortableHeader>
                  <SortableHeader columnKey="validade" sortState={s2Sort} onToggle={s2Toggle} className="text-left py-4 px-6">Validade</SortableHeader>
                  <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {s2Filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-muted-foreground italic">
                      Nenhum pedido aguardando liberação.
                    </td>
                  </tr>
                ) : (
                  s2Filtered.map((o) => (
                    <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-4 px-6 font-mono-data font-bold text-primary">{o.id}</td>
                      <td className="py-4 px-6">
                        <span className="font-mono-data font-bold text-muted-foreground">{o.clientCode || '-'}</span>
                        <span className="ml-2 font-display font-semibold text-foreground">{o.clientName || '-'}</span>
                      </td>
                      <td className="py-4 px-6">{o.representativeName || '-'}</td>
                      <td className="py-4 px-6">{o.clientCity && o.clientUF ? `${o.clientCity} - ${o.clientUF}` : '-'}</td>
                      <td className="py-4 px-6 font-mono-data text-muted-foreground">{formatDateBR(o.date)}</td>
                      <td className="py-4 px-6 font-mono-data text-muted-foreground">{formatDateBR(o.expiryDate)}</td>
                      <td className="py-4 px-6 text-right">
                        <button
                          className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/50 transition-all"
                          onClick={() => addToLoad(o.id)}
                          title="Adicionar à carga"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Seção 2: Liberados para produção (load atual) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-sm font-bold font-display uppercase tracking-wider text-muted-foreground">Liberados para Produção</h2>
          <button className={btnPrimary} onClick={() => void confirmarLiberacao()}>
            <CheckCircle2 className="h-4 w-4" />
            Confirmar Liberação
          </button>
        </div>

        <QuickFilterBar
          query={s3Query}
          onQueryChange={s3SetQuery}
          placeholder="Buscar pedido, cliente, representante..."
        >
          <FilterTriggerButton count={s3Conditions.length} onClick={() => setS3FiltersOpen(true)} />
        </QuickFilterBar>

        <ActiveFiltersChips
          fields={s3FilterFields}
          conditions={s3Conditions}
          onRemove={(id) => setS3Conditions((prev) => prev.filter((c) => c.id !== id))}
          onClear={() => setS3Conditions([])}
        />

        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <ColumnFilterRow columns={s3ColSlots} values={s3ColFilter.values} onChange={s3ColFilter.setFilter} />
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px] text-center w-[56px]">
                    <input
                      type="checkbox"
                      checked={session3Selected.length === s3Filtered.length && s3Filtered.length > 0}
                      onChange={() => toggleAll(session3Selected, setSession3Selected, s3Filtered.map((o) => o.id))}
                    />
                  </th>
                  <SortableHeader columnKey="pedido" sortState={s3Sort} onToggle={s3Toggle} className="text-left py-4 px-6">Pedido</SortableHeader>
                  <SortableHeader columnKey="cliente" sortState={s3Sort} onToggle={s3Toggle} className="text-left py-4 px-6">Cliente</SortableHeader>
                  <SortableHeader columnKey="representante" sortState={s3Sort} onToggle={s3Toggle} className="text-left py-4 px-6">Representante</SortableHeader>
                  <SortableHeader columnKey="cidadeUf" sortState={s3Sort} onToggle={s3Toggle} className="text-left py-4 px-6">Cidade / UF</SortableHeader>
                  <SortableHeader columnKey="validade" sortState={s3Sort} onToggle={s3Toggle} className="text-left py-4 px-6">Validade</SortableHeader>
                  <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {s3Filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-muted-foreground italic">
                      Nenhum pedido na carga.
                    </td>
                  </tr>
                ) : (
                  s3Filtered.map((o) => (
                    <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-4 px-6 text-center">
                        <input
                          type="checkbox"
                          checked={session3Selected.includes(o.id)}
                          onChange={() =>
                            setSession3Selected((prev) => (prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id]))
                          }
                        />
                      </td>
                      <td className="py-4 px-6 font-mono-data font-bold text-primary">{o.id}</td>
                      <td className="py-4 px-6">
                        <span className="font-mono-data font-bold text-muted-foreground">{o.clientCode || '-'}</span>
                        <span className="ml-2 font-display font-semibold text-foreground">{o.clientName || '-'}</span>
                      </td>
                      <td className="py-4 px-6">{o.representativeName || '-'}</td>
                      <td className="py-4 px-6">{o.clientCity && o.clientUF ? `${o.clientCity} - ${o.clientUF}` : '-'}</td>
                      <td className="py-4 px-6 font-mono-data text-muted-foreground">{formatDateBR(o.expiryDate)}</td>
                      <td className="py-4 px-6 text-right">
                        <button
                          className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-all"
                          onClick={() => removeFromLoad(o.id)}
                          title="Remover pedido"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <FilterConfiguratorDialog
        open={s2FiltersOpen}
        onOpenChange={setS2FiltersOpen}
        fields={s12FilterFields}
        value={s2Conditions}
        onApply={setS2Conditions}
      />

      <FilterConfiguratorDialog
        open={s3FiltersOpen}
        onOpenChange={setS3FiltersOpen}
        fields={s3FilterFields}
        value={s3Conditions}
        onApply={setS3Conditions}
      />
    </div>
  );
};

export default PedidoSuporteLiberacao;
