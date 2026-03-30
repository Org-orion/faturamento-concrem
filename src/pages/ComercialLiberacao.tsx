import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import { btnPrimary, btnSecondary, inputClass } from '@/components/shared';
import { cn } from '@/lib/utils';
import { supabaseOps } from '@/lib/supabase';
import { CheckCircle2, FileSpreadsheet, Plus, Trash2 } from 'lucide-react';
import { Order } from '@/types';
import { createBrandedWorkbook, downloadBuffer } from '@/lib/excelBranded';
import type { FilterCondition, FilterField } from '@/lib/filters';
import { applyFilters } from '@/lib/filters';
import { FilterConfiguratorDialog } from '@/components/filters/FilterConfiguratorDialog';
import { FilterTriggerButton } from '@/components/filters/FilterTriggerButton';
import { ActiveFiltersChips } from '@/components/filters/ActiveFiltersChips';
import { updatePedidoStatus } from '@/lib/pedidosStatusRepo';
import { useTableSort } from '@/hooks/useTableSort';
import { useQuickFilter } from '@/hooks/useQuickFilter';
import { useColumnFilters } from '@/hooks/useColumnFilters';
import { SortableHeader } from '@/components/table/SortableHeader';
import { QuickFilterBar } from '@/components/table/QuickFilterBar';
import { ColumnFilterRow, type ColFilterSlot } from '@/components/table/ColumnFilterRow';
import type { ColDef } from '@/hooks/useColumnFilters';

const formatDateBR = (iso?: string) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('pt-BR');
};

const ComercialLiberacao = () => {
  const { orders, user } = useApp();
  const { showToast } = useToast();

  // Track orders liberated to production (so they disappear from Sections 1/2 immediately)
  const [liberatedIds, setLiberatedIds] = useState<Set<string>>(new Set());

  // All venda orders awaiting evaluation, not yet liberated to production
  const aguardandoLiberacao = useMemo(() => {
    return orders
      .filter(o => o.status === 'Aguardando Avaliação' && !liberatedIds.has(o.id))
      .sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || '') || String(a.id).localeCompare(String(b.id)));
  }, [orders, liberatedIds]);

  // --- Section 1: Pedidos aguardando confirmação (not yet sent to diretoria) ---
  const [confirmedByDiretoriaIds, setConfirmedByDiretoriaIds] = useState<Set<string>>(new Set());
  const [s1Selected, setS1Selected] = useState<string[]>([]);

  useEffect(() => {
    if (!supabaseOps) return;
    let cancelled = false;
    const load = async () => {
      const ids = aguardandoLiberacao.map(o => o.id);
      if (!ids.length) { setConfirmedByDiretoriaIds(new Set()); return; }

      const { data } = await supabaseOps
        .from('confirmacao_diretoria')
        .select('pedido_id, status')
        .in('pedido_id', ids);
      if (cancelled || !data) return;

      const confirmed = new Set<string>();
      for (const r of data as any[]) {
        const id = String(r.pedido_id);
        if (r.status === 'confirmado') confirmed.add(id);
      }
      setConfirmedByDiretoriaIds(confirmed);
    };
    void load();
    return () => { cancelled = true; };
  }, [aguardandoLiberacao]);

  const s1Orders = useMemo(() => aguardandoLiberacao.filter(o => !confirmedByDiretoriaIds.has(o.id)), [aguardandoLiberacao, confirmedByDiretoriaIds]);
  const s2Orders = useMemo(() => aguardandoLiberacao.filter(o => confirmedByDiretoriaIds.has(o.id)), [aguardandoLiberacao, confirmedByDiretoriaIds]);

  // --- Section 3: Carga atual ---
  const [loadIds, setLoadIds] = useState<string[]>([]);

  const s3Orders = useMemo(() => {
    const map = new Map(orders.map(o => [o.id, o] as const));
    return loadIds.map(id => map.get(id)).filter(Boolean) as Order[];
  }, [loadIds, orders]);

  // --- Filters ---
  const [s2FiltersOpen, setS2FiltersOpen] = useState(false);
  const [s2Conditions, setS2Conditions] = useState<FilterCondition[]>([]);
  const [s3FiltersOpen, setS3FiltersOpen] = useState(false);
  const [s3Conditions, setS3Conditions] = useState<FilterCondition[]>([]);

  const filterFields = useMemo(() => [
    { id: 'pedido', label: 'Número do pedido', type: 'text', getValue: (o: Order) => o.id, placeholder: 'Ex: PED-001' },
    { id: 'cliente', label: 'Cliente', type: 'text', getValue: (o: Order) => `${o.clientCode || ''} ${o.clientName || ''}`.trim(), placeholder: 'Código ou nome...' },
    { id: 'representante', label: 'Representante', type: 'text', getValue: (o: Order) => o.representativeName || '', placeholder: 'Nome do representante...' },
    { id: 'cidadeUf', label: 'Cidade / UF', type: 'text', getValue: (o: Order) => `${o.clientCity || ''} - ${o.clientUF || ''}`.trim(), placeholder: 'Ex: Curitiba - PR' },
    { id: 'validade', label: 'Data validade', type: 'date', getValue: (o: Order) => o.expiryDate || '' },
  ] satisfies Array<FilterField<Order>>, []);

  const s2Filtered = useMemo(() => applyFilters(s2Orders, filterFields, s2Conditions), [s2Orders, filterFields, s2Conditions]);
  const s3Filtered = useMemo(() => applyFilters(s3Orders, filterFields, s3Conditions), [s3Orders, filterFields, s3Conditions]);

  // --- Sort & Quick Filter hooks ---
  const s1Sort = useTableSort();
  const s1Filter = useQuickFilter<Order>();
  const s2Sort = useTableSort();
  const s2Filter = useQuickFilter<Order>();
  const s3Sort = useTableSort();
  const s3Filter = useQuickFilter<Order>();

  // --- Column filters ---
  const s1ColFilter = useColumnFilters();
  const s2ColFilter = useColumnFilters();
  const s3ColFilter = useColumnFilters();

  const s1ColDefs = useMemo<ColDef<Order>[]>(() => [
    { key: 'pedido', getter: (o) => o.id },
    { key: 'cliente', getter: (o) => `${o.clientCode || ''} ${o.clientName || ''}` },
    { key: 'representante', getter: (o) => o.representativeName },
    { key: 'validade', getter: (o) => o.expiryDate },
  ], []);

  const s2ColDefs = useMemo<ColDef<Order>[]>(() => [
    { key: 'pedido', getter: (o) => o.id },
    { key: 'cliente', getter: (o) => `${o.clientCode || ''} ${o.clientName || ''}` },
    { key: 'representante', getter: (o) => o.representativeName },
    { key: 'cidadeUf', getter: (o) => o.clientCity && o.clientUF ? `${o.clientCity} - ${o.clientUF}` : '' },
    { key: 'validade', getter: (o) => o.expiryDate },
  ], []);

  const s3ColDefs = useMemo<ColDef<Order>[]>(() => [
    { key: 'pedido', getter: (o) => o.id },
    { key: 'cliente', getter: (o) => `${o.clientCode || ''} ${o.clientName || ''}` },
    { key: 'representante', getter: (o) => o.representativeName },
    { key: 'cidadeUf', getter: (o) => o.clientCity && o.clientUF ? `${o.clientCity} - ${o.clientUF}` : '' },
    { key: 'validade', getter: (o) => o.expiryDate },
  ], []);

  const s1ColSlots = useMemo<ColFilterSlot[]>(() => [
    { type: 'none' },
    { key: 'pedido', type: 'text', placeholder: 'Filtrar pedido...' },
    { key: 'cliente', type: 'text', placeholder: 'Filtrar cliente...' },
    { key: 'representante', type: 'text', placeholder: 'Filtrar representante...' },
    { key: 'validade', type: 'date' },
  ], []);

  const s2ColSlots = useMemo<ColFilterSlot[]>(() => [
    { key: 'pedido', type: 'text', placeholder: 'Filtrar pedido...' },
    { key: 'cliente', type: 'text', placeholder: 'Filtrar cliente...' },
    { key: 'representante', type: 'text', placeholder: 'Filtrar representante...' },
    { key: 'cidadeUf', type: 'text', placeholder: 'Filtrar cidade/UF...' },
    { key: 'validade', type: 'date' },
    { type: 'none' },
  ], []);

  const s3ColSlots = useMemo<ColFilterSlot[]>(() => [
    { key: 'pedido', type: 'text', placeholder: 'Filtrar pedido...' },
    { key: 'cliente', type: 'text', placeholder: 'Filtrar cliente...' },
    { key: 'representante', type: 'text', placeholder: 'Filtrar representante...' },
    { key: 'cidadeUf', type: 'text', placeholder: 'Filtrar cidade/UF...' },
    { key: 'validade', type: 'date' },
    { type: 'none' },
  ], []);

  // --- Text getters (for quick filter search) ---
  const textGetters: Array<(o: Order) => unknown> = [
    (o) => o.id,
    (o) => o.clientCode,
    (o) => o.clientName,
    (o) => o.representativeName,
    (o) => o.clientCity,
    (o) => o.clientUF,
  ];

  // --- Sort getters ---
  const sortGetters: Record<string, (o: Order) => unknown> = {
    pedido: (o) => o.id,
    cliente: (o) => (o.clientName || '').toLowerCase(),
    representante: (o) => (o.representativeName || '').toLowerCase(),
    cidadeUf: (o) => `${o.clientCity || ''} - ${o.clientUF || ''}`,
    validade: (o) => o.expiryDate || '',
  };

  // --- Processed data for each section ---
  const s1Processed = useMemo(() => {
    const colFiltered = s1ColFilter.filterItems(s1Orders, s1ColDefs);
    const filtered = s1Filter.filterItems(colFiltered, textGetters);
    return s1Sort.sortItems(filtered, sortGetters);
  }, [s1Orders, s1ColFilter.filterItems, s1ColDefs, s1Filter.filterItems, s1Sort.sortItems]);

  const s2Processed = useMemo(() => {
    const colFiltered = s2ColFilter.filterItems(s2Filtered, s2ColDefs);
    const filtered = s2Filter.filterItems(colFiltered, textGetters);
    return s2Sort.sortItems(filtered, sortGetters);
  }, [s2Filtered, s2ColFilter.filterItems, s2ColDefs, s2Filter.filterItems, s2Sort.sortItems]);

  const s3Processed = useMemo(() => {
    const colFiltered = s3ColFilter.filterItems(s3Filtered, s3ColDefs);
    const filtered = s3Filter.filterItems(colFiltered, textGetters);
    return s3Sort.sortItems(filtered, sortGetters);
  }, [s3Filtered, s3ColFilter.filterItems, s3ColDefs, s3Filter.filterItems, s3Sort.sortItems]);

  // --- Export ---
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportMes, setExportMes] = useState('');

  const handleExportLiberacao = async () => {
    const mesLabel = exportMes.trim() || 'REF';
    const rows = s2Filtered.map(o => ({
      mes: mesLabel,
      cliente: [o.clientCode, o.clientName].filter(Boolean).join(' - ') || '-',
      valor: o.totalPedidoVenda ?? 0,
      carregamento: o.previsaoCarregamento ? formatDateBR(o.previsaoCarregamento) : '-',
      cidade: o.clientCity || '-',
      pedido: o.id,
      kits: o.totalQtdM3 ?? '',
      obs: '',
    }));

    const totalValor = s2Filtered.reduce((acc, o) => acc + (o.totalPedidoVenda ?? 0), 0);

    const buffer = await createBrandedWorkbook({
      sheetName: 'Liberação',
      logoLayout: 'merged',
      dataRowHeight: 15,
      headerHeight: 22.5,
      columns: [
        { header: 'Mês Referência', key: 'mes', width: 23, align: 'center' },
        { header: 'Cliente', key: 'cliente', width: 81.71 },
        { header: 'Valor Total', key: 'valor', width: 17.29, numFmt: '"R$ "#,##0.00' },
        { header: 'Data Carregamento', key: 'carregamento', width: 24.43, align: 'center' },
        { header: 'Cidade', key: 'cidade', width: 23.29 },
        { header: 'Nº Pedido', key: 'pedido', width: 13.29, align: 'center' },
        { header: 'Qtd Kits', key: 'kits', width: 11.29, align: 'center' },
        { header: 'Observação', key: 'obs', width: 57.57 },
      ],
      rows,
      totalRow: {
        mes: '', cliente: `${s2Filtered.length} pedido(s)`, valor: totalValor, carregamento: '', cidade: '', pedido: 'TOTAL', kits: '', obs: '',
      },
    });

    const slug = mesLabel.replace(/\s+/g, '-').toLowerCase();
    downloadBuffer(buffer, `planilha-liberacao-${slug}.xlsx`);
    setShowExportModal(false);
  };

  // --- Actions ---
  const enviarParaDiretoria = async () => {
    if (!s1Selected.length) { showToast('Selecione pedidos para enviar', 'error'); return; }
    if (!supabaseOps) return;
    const now = new Date().toISOString();
    const username = user?.username || null;

    const rows = s1Selected.map(id => ({
      pedido_id: id,
      status: 'confirmado',
      enviado_em: now,
      enviado_por: username,
    }));

    const { error } = await supabaseOps.from('confirmacao_diretoria').upsert(rows as any, { onConflict: 'pedido_id' });
    if (error) { console.error('[Supabase OPS] enviar diretoria:', error.message); showToast('Erro ao enviar para diretoria', 'error'); return; }

    setConfirmedByDiretoriaIds(prev => { const next = new Set(prev); s1Selected.forEach(id => next.add(id)); return next; });
    setS1Selected([]);
    showToast(`${rows.length} pedido(s) enviado(s) para a diretoria`);
  };

  const addToLoad = (id: string) => {
    setLoadIds(prev => prev.includes(id) ? prev : [...prev, id]);
  };

  const removeFromLoad = (id: string) => {
    setLoadIds(prev => prev.filter(x => x !== id));
  };

  const liberarParaProducao = async () => {
    if (!loadIds.length) { showToast('Nenhum pedido na carga', 'error'); return; }
    const username = user?.username || null;

    for (const id of loadIds) {
      await updatePedidoStatus({
        pedidoId: id,
        numeroPedido: id,
        statusNovo: 'liberado_producao',
        alteradoPor: username,
        observacao: 'Liberado para produção pelo comercial',
      });
    }

    setLiberatedIds(prev => { const next = new Set(prev); loadIds.forEach(id => next.add(id)); return next; });
    setConfirmedByDiretoriaIds(prev => { const next = new Set(prev); loadIds.forEach(id => next.delete(id)); return next; });
    setLoadIds([]);
    showToast('Carga liberada para Produção');
  };

  const toggleAll = (current: string[], setter: (v: string[]) => void, ids: string[]) => {
    setter(current.length === ids.length ? [] : ids);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold font-display text-foreground">Liberação de Pedidos</h1>
          <p className="text-sm text-muted-foreground">Confirme, monte a carga e libere para a produção</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowExportModal(true)} className={btnSecondary}>
            <FileSpreadsheet className="h-4 w-4" />
            Exportar Planilha
          </button>
        </div>
      </div>

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <h2 className="text-lg font-bold font-display text-foreground">Exportar Planilha de Liberação</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Mês de Referência</label>
                <input className={inputClass} placeholder="ex: Março/2025" value={exportMes} onChange={(e) => setExportMes(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">Serão exportados <strong>{s2Filtered.length}</strong> pedido(s) confirmados pela diretoria.</p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button className={btnSecondary} onClick={() => setShowExportModal(false)}>Cancelar</button>
              <button className={btnPrimary} onClick={() => void handleExportLiberacao()}>
                <FileSpreadsheet className="h-4 w-4" />
                Exportar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sessão 1: Pedidos aguardando confirmação → enviar para diretoria */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-sm font-bold font-display uppercase tracking-wider text-muted-foreground">Pedidos Aguardando Confirmação</h2>
          <button className={btnPrimary} onClick={() => void enviarParaDiretoria()} disabled={!s1Selected.length}>
            <CheckCircle2 className="h-4 w-4" />
            Enviar para Diretoria ({s1Selected.length})
          </button>
        </div>
        <QuickFilterBar
          query={s1Filter.query}
          onQueryChange={s1Filter.setQuery}
          placeholder="Buscar pedidos aguardando..."
        />
        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <ColumnFilterRow columns={s1ColSlots} values={s1ColFilter.values} onChange={s1ColFilter.setFilter} />
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-4 px-6 text-center w-[56px]">
                    <input type="checkbox" checked={s1Selected.length === s1Processed.length && s1Processed.length > 0} onChange={() => toggleAll(s1Selected, setS1Selected, s1Processed.map(o => o.id))} />
                  </th>
                  <SortableHeader columnKey="pedido" sortState={s1Sort.sortState} onToggle={s1Sort.toggleSort} className="text-left py-4 px-6">Pedido</SortableHeader>
                  <SortableHeader columnKey="cliente" sortState={s1Sort.sortState} onToggle={s1Sort.toggleSort} className="text-left py-4 px-6">Cliente</SortableHeader>
                  <SortableHeader columnKey="representante" sortState={s1Sort.sortState} onToggle={s1Sort.toggleSort} className="text-left py-4 px-6">Representante</SortableHeader>
                  <SortableHeader columnKey="validade" sortState={s1Sort.sortState} onToggle={s1Sort.toggleSort} className="text-left py-4 px-6">Validade</SortableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {s1Processed.length === 0 ? (
                  <tr><td colSpan={5} className="py-10 text-center text-muted-foreground italic">Nenhum pedido aguardando confirmação.</td></tr>
                ) : s1Processed.map(o => (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-4 px-6 text-center">
                      <input type="checkbox" checked={s1Selected.includes(o.id)} onChange={() => setS1Selected(prev => prev.includes(o.id) ? prev.filter(x => x !== o.id) : [...prev, o.id])} />
                    </td>
                    <td className="py-4 px-6 font-mono-data font-bold text-primary">{o.id}</td>
                    <td className="py-4 px-6">
                      <span className="font-mono-data font-bold text-muted-foreground">{o.clientCode || '-'}</span>
                      <span className="ml-2 font-display font-semibold text-foreground">{o.clientName || '-'}</span>
                    </td>
                    <td className="py-4 px-6">{o.representativeName || '-'}</td>
                    <td className="py-4 px-6 font-mono-data text-muted-foreground">{formatDateBR(o.expiryDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Sessão 2: Confirmados pela diretoria — aguardando liberação */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-sm font-bold font-display uppercase tracking-wider text-muted-foreground">Confirmados pela Diretoria — Aguardando Liberação</h2>
        </div>
        <QuickFilterBar
          query={s2Filter.query}
          onQueryChange={s2Filter.setQuery}
          placeholder="Buscar pedidos confirmados..."
        >
          <FilterTriggerButton count={s2Conditions.length} onClick={() => setS2FiltersOpen(true)} />
        </QuickFilterBar>
        <ActiveFiltersChips fields={filterFields} conditions={s2Conditions} onRemove={(id) => setS2Conditions(prev => prev.filter(c => c.id !== id))} onClear={() => setS2Conditions([])} />
        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <ColumnFilterRow columns={s2ColSlots} values={s2ColFilter.values} onChange={s2ColFilter.setFilter} />
                <tr className="border-b border-border bg-muted/30">
                  <SortableHeader columnKey="pedido" sortState={s2Sort.sortState} onToggle={s2Sort.toggleSort} className="text-left py-4 px-6">Pedido</SortableHeader>
                  <SortableHeader columnKey="cliente" sortState={s2Sort.sortState} onToggle={s2Sort.toggleSort} className="text-left py-4 px-6">Cliente</SortableHeader>
                  <SortableHeader columnKey="representante" sortState={s2Sort.sortState} onToggle={s2Sort.toggleSort} className="text-left py-4 px-6">Representante</SortableHeader>
                  <SortableHeader columnKey="cidadeUf" sortState={s2Sort.sortState} onToggle={s2Sort.toggleSort} className="text-left py-4 px-6">Cidade / UF</SortableHeader>
                  <SortableHeader columnKey="validade" sortState={s2Sort.sortState} onToggle={s2Sort.toggleSort} className="text-left py-4 px-6">Validade</SortableHeader>
                  <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {s2Processed.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-muted-foreground italic">Nenhum pedido confirmado pela diretoria aguardando liberação.</td></tr>
                ) : s2Processed.map(o => (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-4 px-6 font-mono-data font-bold text-primary">{o.id}</td>
                    <td className="py-4 px-6">
                      <span className="font-mono-data font-bold text-muted-foreground">{o.clientCode || '-'}</span>
                      <span className="ml-2 font-display font-semibold text-foreground">{o.clientName || '-'}</span>
                    </td>
                    <td className="py-4 px-6">{o.representativeName || '-'}</td>
                    <td className="py-4 px-6">{o.clientCity && o.clientUF ? `${o.clientCity} - ${o.clientUF}` : '-'}</td>
                    <td className="py-4 px-6 font-mono-data text-muted-foreground">{formatDateBR(o.expiryDate)}</td>
                    <td className="py-4 px-6 text-right">
                      <button className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/50 transition-all" onClick={() => addToLoad(o.id)} title="Adicionar à carga">
                        <Plus className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Sessão 3: Carga atual */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-sm font-bold font-display uppercase tracking-wider text-muted-foreground">Carga Atual — Liberados para Produção</h2>
          <button className={btnPrimary} onClick={() => void liberarParaProducao()}>
            <CheckCircle2 className="h-4 w-4" />
            Confirmar Liberação
          </button>
        </div>
        <QuickFilterBar
          query={s3Filter.query}
          onQueryChange={s3Filter.setQuery}
          placeholder="Buscar na carga..."
        >
          <FilterTriggerButton count={s3Conditions.length} onClick={() => setS3FiltersOpen(true)} />
        </QuickFilterBar>
        <ActiveFiltersChips fields={filterFields} conditions={s3Conditions} onRemove={(id) => setS3Conditions(prev => prev.filter(c => c.id !== id))} onClear={() => setS3Conditions([])} />
        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <ColumnFilterRow columns={s3ColSlots} values={s3ColFilter.values} onChange={s3ColFilter.setFilter} />
                <tr className="border-b border-border bg-muted/30">
                  <SortableHeader columnKey="pedido" sortState={s3Sort.sortState} onToggle={s3Sort.toggleSort} className="text-left py-4 px-6">Pedido</SortableHeader>
                  <SortableHeader columnKey="cliente" sortState={s3Sort.sortState} onToggle={s3Sort.toggleSort} className="text-left py-4 px-6">Cliente</SortableHeader>
                  <SortableHeader columnKey="representante" sortState={s3Sort.sortState} onToggle={s3Sort.toggleSort} className="text-left py-4 px-6">Representante</SortableHeader>
                  <SortableHeader columnKey="cidadeUf" sortState={s3Sort.sortState} onToggle={s3Sort.toggleSort} className="text-left py-4 px-6">Cidade / UF</SortableHeader>
                  <SortableHeader columnKey="validade" sortState={s3Sort.sortState} onToggle={s3Sort.toggleSort} className="text-left py-4 px-6">Validade</SortableHeader>
                  <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {s3Processed.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-muted-foreground italic">Nenhum pedido na carga.</td></tr>
                ) : s3Processed.map(o => (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-4 px-6 font-mono-data font-bold text-primary">{o.id}</td>
                    <td className="py-4 px-6">
                      <span className="font-mono-data font-bold text-muted-foreground">{o.clientCode || '-'}</span>
                      <span className="ml-2 font-display font-semibold text-foreground">{o.clientName || '-'}</span>
                    </td>
                    <td className="py-4 px-6">{o.representativeName || '-'}</td>
                    <td className="py-4 px-6">{o.clientCity && o.clientUF ? `${o.clientCity} - ${o.clientUF}` : '-'}</td>
                    <td className="py-4 px-6 font-mono-data text-muted-foreground">{formatDateBR(o.expiryDate)}</td>
                    <td className="py-4 px-6 text-right">
                      <button className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-all" onClick={() => removeFromLoad(o.id)} title="Remover pedido">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <FilterConfiguratorDialog open={s2FiltersOpen} onOpenChange={setS2FiltersOpen} fields={filterFields} value={s2Conditions} onApply={setS2Conditions} />
      <FilterConfiguratorDialog open={s3FiltersOpen} onOpenChange={setS3FiltersOpen} fields={filterFields} value={s3Conditions} onApply={setS3Conditions} />
    </div>
  );
};

export default ComercialLiberacao;
