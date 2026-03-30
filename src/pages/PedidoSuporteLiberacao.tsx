import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import { btnPrimary, btnSecondary, inputClass } from '@/components/shared';
import { cn } from '@/lib/utils';
import { supabaseOps } from '@/lib/supabase';
import { insertComercialPedidoAcao, upsertComercialPedidoMeta } from '@/lib/opsRepo';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { SupportOrder } from '@/types';
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

type StatusOption = 'Aguardando liberação' | 'Liberado';

type DraftRow = {
  status?: StatusOption;
};

const formatDateBR = (iso?: string) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('pt-BR');
};

const PedidoSuporteLiberacao = () => {
  const { supportOrders, user, decideSupportOrderCommercial } = useApp();
  const { showToast } = useToast();

  const awaitingOrders = useMemo(() => {
    return supportOrders
      .filter((o) => o.status === 'Aguardando Avaliação')
      .sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || '') || String(a.id).localeCompare(String(b.id)));
  }, [supportOrders]);

  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  const [session1Selected, setSession1Selected] = useState<string[]>([]);

  const [loadIds, setLoadIds] = useState<string[]>([]);
  const [session3Selected, setSession3Selected] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, DraftRow>>({});

  const [s1FiltersOpen, setS1FiltersOpen] = useState(false);
  const [s1Conditions, setS1Conditions] = useState<FilterCondition[]>([]);

  const [s2FiltersOpen, setS2FiltersOpen] = useState(false);
  const [s2Conditions, setS2Conditions] = useState<FilterCondition[]>([]);

  const [s3FiltersOpen, setS3FiltersOpen] = useState(false);
  const [s3Conditions, setS3Conditions] = useState<FilterCondition[]>([]);

  const { sortState: s1Sort, toggleSort: s1Toggle, sortItems: s1SortItems } = useTableSort();
  const { query: s1Query, setQuery: s1SetQuery, filterItems: s1QuickFilter } = useQuickFilter<SupportOrder>();

  const { sortState: s2Sort, toggleSort: s2Toggle, sortItems: s2SortItems } = useTableSort();
  const { query: s2Query, setQuery: s2SetQuery, filterItems: s2QuickFilter } = useQuickFilter<SupportOrder>();

  const { sortState: s3Sort, toggleSort: s3Toggle, sortItems: s3SortItems } = useTableSort();
  const { query: s3Query, setQuery: s3SetQuery, filterItems: s3QuickFilter } = useQuickFilter<SupportOrder>();

  // --- Column filters ---
  const s1ColFilter = useColumnFilters();
  const s2ColFilter = useColumnFilters();
  const s3ColFilter = useColumnFilters();

  // S1 columns: checkbox, Pedido, Cliente, Representante, Cidade/UF, Emissao, Validade (7 cols)
  const s1ColDefs = useMemo<ColDef<SupportOrder>[]>(() => [
    { key: 'pedido', getter: (o) => o.id },
    { key: 'cliente', getter: (o) => `${o.clientCode || ''} ${o.clientName || ''}` },
    { key: 'representante', getter: (o) => o.representativeName },
    { key: 'cidadeUf', getter: (o) => o.clientCity && o.clientUF ? `${o.clientCity} - ${o.clientUF}` : '' },
    { key: 'emissao', getter: (o) => o.date },
    { key: 'validade', getter: (o) => o.expiryDate },
  ], []);

  const s1ColSlots = useMemo<ColFilterSlot[]>(() => [
    { type: 'none' },
    { key: 'pedido', type: 'text', placeholder: 'Filtrar pedido...' },
    { key: 'cliente', type: 'text', placeholder: 'Filtrar cliente...' },
    { key: 'representante', type: 'text', placeholder: 'Filtrar representante...' },
    { key: 'cidadeUf', type: 'text', placeholder: 'Filtrar cidade/UF...' },
    { key: 'emissao', type: 'date' },
    { key: 'validade', type: 'date' },
  ], []);

  // S2 columns: Pedido, Cliente, Representante, Cidade/UF, Emissao, Validade, Acoes (7 cols)
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

  // S3 columns: checkbox, Pedido, Cliente, Representante, Cidade/UF, Validade, Status, Acoes (8 cols)
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
    { type: 'none' },
  ], []);

  const s12TextGetters: Array<(item: SupportOrder) => unknown> = useMemo(
    () => [
      (o: SupportOrder) => o.id,
      (o: SupportOrder) => o.clientCode,
      (o: SupportOrder) => o.clientName,
      (o: SupportOrder) => o.representativeName,
      (o: SupportOrder) => o.clientCity,
      (o: SupportOrder) => o.clientUF,
    ],
    [],
  );

  const s12SortGetters: Record<string, (item: SupportOrder) => unknown> = useMemo(
    () => ({
      pedido: (o: SupportOrder) => o.id,
      cliente: (o: SupportOrder) => o.clientName,
      representante: (o: SupportOrder) => o.representativeName,
      cidadeUf: (o: SupportOrder) => `${o.clientCity || ''} - ${o.clientUF || ''}`,
      emissao: (o: SupportOrder) => o.date,
      validade: (o: SupportOrder) => o.expiryDate,
    }),
    [],
  );

  const s3TextGetters: Array<(item: SupportOrder) => unknown> = useMemo(
    () => [
      (o: SupportOrder) => o.id,
      (o: SupportOrder) => o.clientCode,
      (o: SupportOrder) => o.clientName,
      (o: SupportOrder) => o.representativeName,
      (o: SupportOrder) => o.clientCity,
      (o: SupportOrder) => o.clientUF,
    ],
    [],
  );

  const s3SortGetters: Record<string, (item: SupportOrder) => unknown> = useMemo(
    () => ({
      pedido: (o: SupportOrder) => o.id,
      cliente: (o: SupportOrder) => o.clientName,
      representante: (o: SupportOrder) => o.representativeName,
      cidadeUf: (o: SupportOrder) => `${o.clientCity || ''} - ${o.clientUF || ''}`,
      validade: (o: SupportOrder) => o.expiryDate,
    }),
    [],
  );

  const s12FilterFields = useMemo(() => {
    return [
      { id: 'pedido', label: 'Número do pedido', type: 'text', getValue: (o: SupportOrder) => o.id, placeholder: 'Ex: SUP-001' },
      {
        id: 'cliente',
        label: 'Cliente',
        type: 'text',
        getValue: (o: SupportOrder) => `${o.clientCode || ''} ${o.clientName || ''}`.trim(),
        placeholder: 'Código ou nome...',
      },
      {
        id: 'representante',
        label: 'Representante',
        type: 'text',
        getValue: (o: SupportOrder) => o.representativeName || '',
        placeholder: 'Nome do representante...',
      },
      {
        id: 'cidadeUf',
        label: 'Cidade / UF',
        type: 'text',
        getValue: (o: SupportOrder) => `${o.clientCity || ''} - ${o.clientUF || ''}`.trim(),
        placeholder: 'Ex: Curitiba - PR',
      },
      { id: 'validade', label: 'Data validade', type: 'date', getValue: (o: SupportOrder) => o.expiryDate || '' },
      { id: 'emissao', label: 'Data emissão', type: 'date', getValue: (o: SupportOrder) => o.date || '' },
    ] satisfies Array<FilterField<SupportOrder>>;
  }, []);

  const s3FilterFields = useMemo(() => {
    return [
      {
        id: 'representante',
        label: 'Representante',
        type: 'text',
        getValue: (o: SupportOrder) => o.representativeName || '',
        placeholder: 'Nome do representante...',
      },
      {
        id: 'cidadeUf',
        label: 'Cidade / UF',
        type: 'text',
        getValue: (o: SupportOrder) => `${o.clientCity || ''} - ${o.clientUF || ''}`.trim(),
        placeholder: 'Ex: Curitiba - PR',
      },
      { id: 'validade', label: 'Data validade', type: 'date', getValue: (o: SupportOrder) => o.expiryDate || '' },
      { id: 'emissao', label: 'Data emissão', type: 'date', getValue: (o: SupportOrder) => o.date || '' },
    ] satisfies Array<FilterField<SupportOrder>>;
  }, []);

  const s1Orders = useMemo(() => {
    const confirmed = new Set(confirmedIds);
    return awaitingOrders.filter((o) => !confirmed.has(o.id));
  }, [awaitingOrders, confirmedIds]);

  const s2Orders = useMemo(() => {
    const confirmed = new Set(confirmedIds);
    const inLoad = new Set(loadIds);
    return awaitingOrders.filter((o) => confirmed.has(o.id) && !inLoad.has(o.id));
  }, [awaitingOrders, confirmedIds, loadIds]);

  const s3Orders = useMemo(() => {
    const map = new Map(supportOrders.map((o) => [o.id, o] as const));
    return loadIds.map((id) => map.get(id)).filter(Boolean) as SupportOrder[];
  }, [loadIds, supportOrders]);

  const s1Filtered = useMemo(
    () => s1SortItems(s1QuickFilter(applyFilters(s1ColFilter.filterItems(s1Orders, s1ColDefs), s12FilterFields, s1Conditions), s12TextGetters), s12SortGetters),
    [s1Orders, s1ColFilter.filterItems, s1ColDefs, s12FilterFields, s1Conditions, s1QuickFilter, s12TextGetters, s1SortItems, s12SortGetters],
  );

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

  useEffect(() => {
    if (!supabaseOps) return;
    let cancelled = false;

    const loadMeta = async () => {
      const ids = Array.from(new Set([...awaitingOrders.map((o) => o.id), ...loadIds]));
      if (!ids.length) return;
      const { data, error } = await supabaseOps.from('comercial_pedidos_meta').select('*').in('pedido_id', ids);
      if (cancelled) return;
      if (error || !data) return;

      setDraft((prev) => {
        const next = { ...prev };
        for (const row of data as any[]) {
          const id = String(row.pedido_id);
          const s = row.status as StatusOption | undefined;
          if (s) next[id] = { ...(next[id] || {}), status: s };
        }
        return next;
      });
    };

    void loadMeta();
    return () => {
      cancelled = true;
    };
  }, [awaitingOrders, loadIds]);

  useEffect(() => {
    if (!supabaseOps) return;
    let cancelled = false;

    const loadConfirmations = async () => {
      const ids = awaitingOrders.map((o) => o.id);
      if (!ids.length) {
        setConfirmedIds([]);
        return;
      }

      const { data, error } = await supabaseOps
        .from('comercial_pedidos_acoes')
        .select('pedido_id')
        .in('pedido_id', ids)
        .eq('acao', 'confirmar_diretoria');

      if (cancelled) return;
      if (error || !data) return;

      const confirmed = Array.from(new Set((data as any[]).map((r) => String(r.pedido_id))));
      setConfirmedIds(confirmed);
    };

    void loadConfirmations();
    return () => {
      cancelled = true;
    };
  }, [awaitingOrders]);

  const confirmSelected = async () => {
    if (!session1Selected.length) return;
    const username = user?.username;

    setConfirmedIds((prev) => Array.from(new Set([...prev, ...session1Selected])));
    setSession1Selected([]);

    if (!supabaseOps || !username) return;

    const rows = session1Selected.map((pedidoId) => ({
      pedido_id: pedidoId,
      acao: 'confirmar_diretoria',
      criado_em: new Date().toISOString(),
      criado_por: username,
      payload: null,
    }));

    const { error } = await supabaseOps.from('comercial_pedidos_acoes').insert(rows as any);
    if (error) console.error('[Supabase OPS] confirmar_diretoria:', error.message);
  };

  const addToLoad = (id: string) => {
    setLoadIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setDraft((prev) => {
      if (prev[id]?.status) return prev;
      return { ...prev, [id]: { ...(prev[id] || {}), status: 'Liberado' } };
    });
    if (user?.username) {
      void insertComercialPedidoAcao({ pedido_id: id, acao: 'editar', criado_por: user.username, payload: { evento: 'add_to_carga' } });
    }
  };

  const removeFromLoad = (id: string) => {
    setLoadIds((prev) => prev.filter((x) => x !== id));
    setSession3Selected((prev) => prev.filter((x) => x !== id));
  };

  const setStatus = (id: string, status: StatusOption) => {
    setDraft((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), status } }));
  };

  const confirmarLiberacao = async () => {
    if (!loadIds.length) {
      showToast('Nenhum pedido na carga', 'error');
      return;
    }

    const username = user?.username || null;
    const toProcess = loadIds.filter((id) => (draft[id]?.status || 'Liberado') === 'Liberado');
    if (!toProcess.length) {
      showToast('Defina o status como Liberado para liberar', 'error');
      return;
    }

    for (const id of toProcess) {
      const order = supportOrders.find((o) => o.id === id);
      const status = (draft[id]?.status || 'Liberado') as StatusOption;

      if (order) {
        if (status === 'Liberado') decideSupportOrderCommercial(order.id, 'Liberado p/ Produção');
      }

      await upsertComercialPedidoMeta({ pedido_id: id, status, atualizado_por: username });

      if (username) {
        void insertComercialPedidoAcao({
          pedido_id: id,
          acao: 'liberar',
          criado_por: username,
          payload: { status },
        });
      }
    }

    const processed = new Set(toProcess);
    const remaining = loadIds.filter((id) => !processed.has(id));
    setLoadIds(remaining);
    setSession3Selected((prev) => prev.filter((id) => !processed.has(id)));
    showToast(remaining.length ? 'Pedidos liberados. Alguns ficaram aguardando liberação.' : 'Carga liberada para Produção');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold font-display text-foreground">Liberação de Pedidos Suporte</h1>
          <p className="text-sm text-muted-foreground">Confirme, monte a carga e libere para a produção</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-sm font-bold font-display uppercase tracking-wider text-muted-foreground">Aguardando Confirmação</h2>
          <button className={btnPrimary} disabled={session1Selected.length === 0} onClick={() => void confirmSelected()}>
            <CheckCircle2 className="h-4 w-4" />
            Confirmar Pedidos
          </button>
        </div>

        <QuickFilterBar
          query={s1Query}
          onQueryChange={s1SetQuery}
          placeholder="Buscar pedido, cliente, representante..."
        >
          <FilterTriggerButton count={s1Conditions.length} onClick={() => setS1FiltersOpen(true)} />
        </QuickFilterBar>

        <ActiveFiltersChips
          fields={s12FilterFields}
          conditions={s1Conditions}
          onRemove={(id) => setS1Conditions((prev) => prev.filter((c) => c.id !== id))}
          onClear={() => setS1Conditions([])}
        />

        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px] text-center w-[56px]">
                    <input
                      type="checkbox"
                      checked={session1Selected.length === s1Filtered.length && s1Filtered.length > 0}
                      onChange={() => toggleAll(session1Selected, setSession1Selected, s1Filtered.map((o) => o.id))}
                    />
                  </th>
                  <SortableHeader columnKey="pedido" sortState={s1Sort} onToggle={s1Toggle} className="text-left py-4 px-6">Pedido</SortableHeader>
                  <SortableHeader columnKey="cliente" sortState={s1Sort} onToggle={s1Toggle} className="text-left py-4 px-6">Cliente</SortableHeader>
                  <SortableHeader columnKey="representante" sortState={s1Sort} onToggle={s1Toggle} className="text-left py-4 px-6">Representante</SortableHeader>
                  <SortableHeader columnKey="cidadeUf" sortState={s1Sort} onToggle={s1Toggle} className="text-left py-4 px-6">Cidade / UF</SortableHeader>
                  <SortableHeader columnKey="emissao" sortState={s1Sort} onToggle={s1Toggle} className="text-left py-4 px-6">Emissão</SortableHeader>
                  <SortableHeader columnKey="validade" sortState={s1Sort} onToggle={s1Toggle} className="text-left py-4 px-6">Validade</SortableHeader>
                </tr>
                <ColumnFilterRow columns={s1ColSlots} values={s1ColFilter.values} onChange={s1ColFilter.setFilter} />
              </thead>
              <tbody className="divide-y divide-border/50">
                {s1Filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-muted-foreground italic">
                      Nenhum pedido aguardando confirmação.
                    </td>
                  </tr>
                ) : (
                  s1Filtered.map((o) => (
                    <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-4 px-6 text-center">
                        <input
                          type="checkbox"
                          checked={session1Selected.includes(o.id)}
                          onChange={() =>
                            setSession1Selected((prev) => (prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id]))
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
                      <td className="py-4 px-6 font-mono-data text-muted-foreground">{formatDateBR(o.date)}</td>
                      <td className="py-4 px-6 font-mono-data text-muted-foreground">{formatDateBR(o.expiryDate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-sm font-bold font-display uppercase tracking-wider text-muted-foreground">Pedidos Confirmados — Aguardando Liberação</h2>
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
                <tr className="border-b border-border bg-muted/30">
                  <SortableHeader columnKey="pedido" sortState={s2Sort} onToggle={s2Toggle} className="text-left py-4 px-6">Pedido</SortableHeader>
                  <SortableHeader columnKey="cliente" sortState={s2Sort} onToggle={s2Toggle} className="text-left py-4 px-6">Cliente</SortableHeader>
                  <SortableHeader columnKey="representante" sortState={s2Sort} onToggle={s2Toggle} className="text-left py-4 px-6">Representante</SortableHeader>
                  <SortableHeader columnKey="cidadeUf" sortState={s2Sort} onToggle={s2Toggle} className="text-left py-4 px-6">Cidade / UF</SortableHeader>
                  <SortableHeader columnKey="emissao" sortState={s2Sort} onToggle={s2Toggle} className="text-left py-4 px-6">Emissão</SortableHeader>
                  <SortableHeader columnKey="validade" sortState={s2Sort} onToggle={s2Toggle} className="text-left py-4 px-6">Validade</SortableHeader>
                  <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Ações</th>
                </tr>
                <ColumnFilterRow columns={s2ColSlots} values={s2ColFilter.values} onChange={s2ColFilter.setFilter} />
              </thead>
              <tbody className="divide-y divide-border/50">
                {s2Filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-muted-foreground italic">
                      Nenhum pedido confirmado aguardando liberação.
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

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-sm font-bold font-display uppercase tracking-wider text-muted-foreground">LIBERADOS PARA PRODUÇÃO</h2>
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
                  <th className="text-left py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Status</th>
                  <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Ações</th>
                </tr>
                <ColumnFilterRow columns={s3ColSlots} values={s3ColFilter.values} onChange={s3ColFilter.setFilter} />
              </thead>
              <tbody className="divide-y divide-border/50">
                {s3Filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-muted-foreground italic">
                      Nenhum pedido na carga.
                    </td>
                  </tr>
                ) : (
                  s3Filtered.map((o) => {
                    const statusValue = draft[o.id]?.status || 'Liberado';
                    return (
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
                        <td className="py-4 px-6">
                          <select
                            className={cn(inputClass, 'py-1 text-[11px] h-8')}
                            value={statusValue}
                            onChange={(e) => setStatus(o.id, e.target.value as StatusOption)}
                          >
                            <option value="Aguardando liberação">Aguardando liberação</option>
                            <option value="Liberado">Liberado</option>
                          </select>
                        </td>
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
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <FilterConfiguratorDialog
        open={s1FiltersOpen}
        onOpenChange={setS1FiltersOpen}
        fields={s12FilterFields}
        value={s1Conditions}
        onApply={setS1Conditions}
      />

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
