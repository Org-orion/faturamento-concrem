import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import { btnPrimary, btnSecondary, inputClass } from '@/components/shared';
import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import { tableColumns } from '@/contexts/AppContext';
import { rowToOrder } from '@/lib/pedidoMapper';
import { ArrowLeft, CheckCircle2, FileSpreadsheet, Plus, Trash2 } from 'lucide-react';
import { Order, SupportOrder } from '@/types';
import { createBrandedWorkbook, downloadBuffer } from '@/lib/excelBranded';
import type { FilterCondition, FilterField } from '@/lib/filters';
import { applyFilters } from '@/lib/filters';
// applyFilters used in s3CandProcessed
import { FilterConfiguratorDialog } from '@/components/filters/FilterConfiguratorDialog';


import { updatePedidoStatus, normalizePhoneToE164 } from '@/lib/pedidosStatusRepo';
import { fmtDate, currentHourBR } from '@/lib/dateUtils';
import { sendEvolutionText } from '@/lib/evolutionApi';
import { findRepresentanteContato } from '@/lib/opsRepo';
import { useTableSort } from '@/hooks/useTableSort';
import { useQuickFilter } from '@/hooks/useQuickFilter';
import { useColumnFilters } from '@/hooks/useColumnFilters';
import { SortableHeader } from '@/components/table/SortableHeader';
import type { ColDef } from '@/hooks/useColumnFilters';

const formatDateBR = (iso?: string) => {
  if (!iso) return '-';
  return fmtDate(iso);
};

type UnifiedOrder = { id: string; kind: 'VENDA' | 'SUPORTE'; clientCode?: string; clientName?: string; representativeName?: string; clientCity?: string; clientUF?: string; expiryDate?: string; totalPedidoVenda?: number; previsaoCarregamento?: string; grupoCliente?: string };

const toUnified = (o: Order): UnifiedOrder => ({
  id: o.id, kind: 'VENDA', clientCode: o.clientCode, clientName: o.clientName,
  representativeName: o.representativeName, clientCity: o.clientCity, clientUF: o.clientUF,
  expiryDate: o.expiryDate, totalPedidoVenda: o.totalPedidoVenda, previsaoCarregamento: o.previsaoCarregamento, grupoCliente: o.grupoCliente,
});

const toUnifiedSuport = (o: SupportOrder): UnifiedOrder => ({
  id: o.id, kind: 'SUPORTE', clientCode: o.clientCode, clientName: o.clientName,
  representativeName: o.representativeName, clientCity: o.clientCity, clientUF: o.clientUF,
  expiryDate: o.expiryDate, grupoCliente: o.grupoCliente,
});

type TabKey = 'gerencia' | 'confirmar' | 'producao';
const TAB_LABELS: Record<TabKey, string> = {
  gerencia: 'Enviar para Gerência',
  confirmar: 'Confirmar Gerência',
  producao: 'Prontos para Produção',
};
const ALL_TABS: TabKey[] = ['gerencia', 'confirmar', 'producao'];

const ComercialLiberacao = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo<TabKey>(() => {
    const p = searchParams.get('tab') as TabKey | null;
    return p && ALL_TABS.includes(p) ? p : 'gerencia';
  }, [searchParams]);
  const setTab = (key: TabKey) => setSearchParams({ tab: key }, { replace: true });
  const { user } = useApp();
  const { showToast } = useToast();

  // --- Pedidos buscados diretamente do Supabase por status ---
  const [directOrders, setDirectOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';

  const refreshOrders = async () => {
    if (!supabaseOps || !supabasePedidos) return;
    setLoading(true);
    try {
      const { data: statusData } = await supabaseOps
        .from('pedidos_status')
        .select('*')
        .in('status_atual', ['liberado_comercial', 'aguardando_gerencia', 'confirmado_gerencia']);
      if (!statusData?.length) { setDirectOrders([]); return; }

      const ids = (statusData as any[]).map((r: any) => r.pedido_id);
      const { data: pedidosData, error: pedidosError } = await supabasePedidos
        .from(table)
        .select(tableColumns)
        .in('numero_pedido', ids);

      if (pedidosError) {
        console.error('[ComercialLiberacao] pedidos query error:', pedidosError.message);
        showToast(`Erro ao carregar pedidos: ${pedidosError.message}`, 'error');
        return;
      }

      const mapped = (pedidosData || []).map((row: any) => rowToOrder(row, 'CLI-001'));
      const statusMap = new Map((statusData as any[]).map((r: any) => [r.pedido_id, r] as const));
      setDirectOrders(mapped);
      setStatusRowsDirect(statusMap);
    } catch (e: any) {
      console.error('[ComercialLiberacao] refreshOrders error:', e);
      showToast('Erro ao carregar pedidos', 'error');
    } finally {
      setLoading(false);
    }
  };

  const [statusRowsDirect, setStatusRowsDirect] = useState<Map<string, any>>(new Map());

  useEffect(() => { void refreshOrders(); }, []);

  const s1Orders = useMemo(() =>
    directOrders.filter(o => statusRowsDirect.get(o.id)?.status_atual === 'liberado_comercial')
      .sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || '') || String(a.id).localeCompare(String(b.id))),
  [directOrders, statusRowsDirect]);

  const s2Orders = useMemo(() =>
    directOrders.filter(o => statusRowsDirect.get(o.id)?.status_atual === 'aguardando_gerencia')
      .sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || '') || String(a.id).localeCompare(String(b.id))),
  [directOrders, statusRowsDirect]);

  // --- Section 3: Carga atual ---
  const [loadIds, setLoadIds] = useState<string[]>([]);
  const [liberatedToProducaoIds, setLiberatedToProducaoIds] = useState<Set<string>>(new Set());

  const s3Candidates = useMemo(() =>
    directOrders
      .filter(o => {
        if (liberatedToProducaoIds.has(o.id)) return false;
        if (loadIds.includes(o.id)) return false;
        return statusRowsDirect.get(o.id)?.status_atual === 'confirmado_gerencia';
      })
      .map(toUnified)
      .sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || '') || a.id.localeCompare(b.id)),
  [directOrders, statusRowsDirect, loadIds, liberatedToProducaoIds]);

  const s3LoadOrders = useMemo(() => {
    const map = new Map(directOrders.map(o => [o.id, toUnified(o)] as const));
    return loadIds.map(id => map.get(id)).filter(Boolean) as UnifiedOrder[];
  }, [loadIds, directOrders]);

  // --- Filters for sections ---
  const [s1Selected, setS1Selected] = useState<string[]>([]);
  const [s2Selected, setS2Selected] = useState<string[]>([]);

  const [s2FiltersOpen, setS2FiltersOpen] = useState(false);
  const [s2Conditions, setS2Conditions] = useState<FilterCondition[]>([]);
  const [s3FiltersOpen, setS3FiltersOpen] = useState(false);
  const [s3Conditions, setS3Conditions] = useState<FilterCondition[]>([]);

  const filterFields = useMemo(() => [
    { id: 'pedido', label: 'Número do pedido', type: 'text', getValue: (o: UnifiedOrder) => o.id, placeholder: 'Ex: PED-001' },
    { id: 'cliente', label: 'Cliente', type: 'text', getValue: (o: UnifiedOrder) => `${o.clientCode || ''} ${o.clientName || ''}`.trim(), placeholder: 'Código ou nome...' },
    { id: 'representante', label: 'Representante', type: 'text', getValue: (o: UnifiedOrder) => o.representativeName || '', placeholder: 'Nome do representante...' },
    { id: 'cidadeUf', label: 'Cidade / UF', type: 'text', getValue: (o: UnifiedOrder) => `${o.clientCity || ''} - ${o.clientUF || ''}`.trim(), placeholder: 'Ex: Curitiba - PR' },
    { id: 'validade', label: 'Data validade', type: 'date', getValue: (o: UnifiedOrder) => o.expiryDate || '' },
  ] satisfies Array<FilterField<UnifiedOrder>>, []);

  // --- Sort & Quick Filter hooks ---
  const s1Sort = useTableSort();
  const s1Filter = useQuickFilter<UnifiedOrder>();
  const s2Sort = useTableSort();
  const s2Filter = useQuickFilter<UnifiedOrder>();
  const s3CandSort = useTableSort();
  const s3CandFilter = useQuickFilter<UnifiedOrder>();
  const s3Sort = useTableSort();
  const s3Filter = useQuickFilter<UnifiedOrder>();

  // --- Column filters ---
  const s1ColFilter = useColumnFilters();
  const s2ColFilter = useColumnFilters();
  const s3CandColFilter = useColumnFilters();
  const s3ColFilter = useColumnFilters();

  const baseColDefs = useMemo<ColDef<UnifiedOrder>[]>(() => [
    { key: 'pedido', getter: (o) => o.id },
    { key: 'cliente', getter: (o) => `${o.clientCode || ''} ${o.clientName || ''}` },
    { key: 'representante', getter: (o) => o.representativeName },
    { key: 'cidadeUf', getter: (o) => o.clientCity && o.clientUF ? `${o.clientCity} - ${o.clientUF}` : '' },
    { key: 'validade', getter: (o) => o.expiryDate },
    { key: 'grupo', getter: (o) => o.grupoCliente || '' },
  ], []);


  const textGetters: Array<(o: UnifiedOrder) => unknown> = [
    (o) => o.id, (o) => o.clientCode, (o) => o.clientName, (o) => o.representativeName, (o) => o.clientCity, (o) => o.clientUF,
  ];

  const sortGetters: Record<string, (o: UnifiedOrder) => unknown> = {
    pedido: (o) => o.id,
    cliente: (o) => (o.clientName || '').toLowerCase(),
    representante: (o) => (o.representativeName || '').toLowerCase(),
    cidadeUf: (o) => `${o.clientCity || ''} - ${o.clientUF || ''}`,
    validade: (o) => o.expiryDate || '',
    grupo: (o) => (o.grupoCliente || '').toLowerCase(),
  };

  const s1Unified = useMemo(() => s1Orders.map(toUnified), [s1Orders]);
  const s2Unified = useMemo(() => s2Orders.map(toUnified), [s2Orders]);

  const uniqueClientes = useMemo(() => {
    const set = new Set(directOrders.map((o) => `${o.clientCode || ''} ${o.clientName || ''}`.trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [directOrders]);

  const uniqueRepresentantes = useMemo(() => {
    const set = new Set(directOrders.map((o) => o.representativeName || '').filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [directOrders]);

  const s1Processed = useMemo(() => {
    const colFiltered = s1ColFilter.filterItems(s1Unified, baseColDefs);
    const filtered = s1Filter.filterItems(colFiltered, textGetters);
    return s1Sort.sortItems(filtered, sortGetters);
  }, [s1Unified, s1ColFilter.filterItems, baseColDefs, s1Filter.filterItems, s1Sort.sortItems]);

  const s2Processed = useMemo(() => {
    const colFiltered = s2ColFilter.filterItems(s2Unified, baseColDefs);
    const filtered = s2Filter.filterItems(colFiltered, textGetters);
    return s2Sort.sortItems(filtered, sortGetters);
  }, [s2Unified, s2ColFilter.filterItems, baseColDefs, s2Filter.filterItems, s2Sort.sortItems]);

  const s3CandProcessed = useMemo(() => {
    const colFiltered = s3CandColFilter.filterItems(s3Candidates, baseColDefs);
    const appFiltered = applyFilters(colFiltered, filterFields, s3Conditions);
    const filtered = s3CandFilter.filterItems(appFiltered, textGetters);
    return s3CandSort.sortItems(filtered, sortGetters);
  }, [s3Candidates, s3CandColFilter.filterItems, baseColDefs, filterFields, s3Conditions, s3CandFilter.filterItems, s3CandSort.sortItems]);

  const s3Processed = useMemo(() => {
    const colFiltered = s3ColFilter.filterItems(s3LoadOrders, baseColDefs);
    const filtered = s3Filter.filterItems(colFiltered, textGetters);
    return s3Sort.sortItems(filtered, sortGetters);
  }, [s3LoadOrders, s3ColFilter.filterItems, baseColDefs, s3Filter.filterItems, s3Sort.sortItems]);

  // --- Export ---
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportMes, setExportMes] = useState('');

  const handleExportLiberacao = async () => {
    const mesLabel = exportMes.trim() || 'REF';
    const rows = s2Orders.map(o => ({
      mes: mesLabel,
      cliente: [o.clientCode, o.clientName].filter(Boolean).join(' - ') || '-',
      valor: o.totalPedidoVenda ?? 0,
      carregamento: o.previsaoCarregamento ? formatDateBR(o.previsaoCarregamento) : '-',
      cidade: o.clientCity || '-',
      pedido: o.id,
      kits: o.totalQtdM3 ?? '',
      obs: '',
    }));

    const totalValor = s2Orders.reduce((acc, o) => acc + (o.totalPedidoVenda ?? 0), 0);

    const buffer = await createBrandedWorkbook({
      sheetName: 'Liberação',
      logoLayout: 'merged',
      dataRowHeight: 15,
      headerHeight: 22.5,
      columns: [
        { header: 'Mês Referência', key: 'mes', width: 23, align: 'center' },
        { header: 'Cliente', key: 'cliente', width: 81.71 },
        { header: 'Valor Total', key: 'valor', width: 17.29, numFmt: '"R$ "#,##0.00' },
        { header: 'Prev. Embarque', key: 'carregamento', width: 24.43, align: 'center' },
        { header: 'Cidade', key: 'cidade', width: 23.29 },
        { header: 'Nº Pedido', key: 'pedido', width: 13.29, align: 'center' },
        { header: 'Volume m³', key: 'kits', width: 11.29, align: 'center' },
        { header: 'Observação', key: 'obs', width: 57.57 },
      ],
      rows,
      totalRow: {
        mes: '', cliente: `${s2Orders.length} pedido(s)`, valor: totalValor, carregamento: '', cidade: '', pedido: 'TOTAL', kits: '', obs: '',
      },
    });

    const slug = mesLabel.replace(/\s+/g, '-').toLowerCase();
    downloadBuffer(buffer, `planilha-liberacao-${slug}.xlsx`);
    setShowExportModal(false);
  };

  // --- Actions ---

  const enviarParaGerencia = async () => {
    if (!s1Selected.length) { showToast('Selecione pedidos para enviar', 'error'); return; }
    const username = user?.username || null;

    for (const id of s1Selected) {
      await updatePedidoStatus({
        pedidoId: id,
        numeroPedido: id,
        statusNovo: 'aguardando_gerencia',
        alteradoPor: username,
        observacao: 'Enviado para aprovação da gerência',
      });
    }

    await refreshOrders();
    setS1Selected([]);
    showToast(`${s1Selected.length} pedido(s) enviado(s) para a gerência`);
  };

  const confirmarGerencia = async () => {
    if (!s2Selected.length) { showToast('Selecione pedidos para confirmar', 'error'); return; }
    const username = user?.username || null;

    for (const id of s2Selected) {
      await updatePedidoStatus({
        pedidoId: id,
        numeroPedido: id,
        statusNovo: 'confirmado_gerencia',
        alteradoPor: username,
        observacao: 'Confirmado pela gerência',
      });
    }

    await refreshOrders();
    setS2Selected([]);
    showToast(`${s2Selected.length} pedido(s) confirmados pela gerência`);
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

    // Agrupar por representante para enviar uma mensagem por rep
    const byRep = new Map<string, { orders: Order[]; phone: string | null }>();
    for (const id of loadIds) {
      const order = directOrders.find(o => o.id === id);
      if (!order) continue;
      await updatePedidoStatus({
        pedidoId: id,
        numeroPedido: id,
        statusNovo: 'liberado_producao',
        alteradoPor: username,
        observacao: 'Liberado para produção pelo comercial',
      });
      const repKey = String(order.representativeName || order.representativeId || '').trim();
      if (!byRep.has(repKey)) {
        const contact = await findRepresentanteContato(repKey);
        const phone = contact?.telefone || order.representativePhone || null;
        byRep.set(repKey, { orders: [], phone });
      }
      byRep.get(repKey)!.orders.push(order);
    }

    // Enviar notificação por representante
    for (const [, { orders, phone }] of byRep.entries()) {
      if (!phone) continue;
      const phoneE164 = normalizePhoneToE164(phone);
      if (!phoneE164) continue;

      const repName = orders[0].representativeName || '-';
      const hora = currentHourBR();
      const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
      let msg = `${saudacao}, ${repName}!\n\n`;
      msg += `Os seguintes pedidos foram *liberados para produção*:\n\n`;
      for (const o of orders) {
        msg += `· Pedido *${o.id}* — ${o.clientName || o.clientCode || 'Cliente'}\n`;
      }
      msg += `\nEm breve iniciaremos a fabricação. Qualquer dúvida, estamos à disposição.`;

      await sendEvolutionText(phoneE164, msg);
    }

    await refreshOrders();
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
          <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
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

      {/* Abas */}
      <div className="border-b border-border">
        <div className="flex gap-1">
          {ALL_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setTab(tab)}
              className={cn(
                'px-4 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px',
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
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
              <p className="text-xs text-muted-foreground">Serão exportados <strong>{s2Orders.length}</strong> pedido(s) aguardando gerência.</p>
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

      {/* Aba 1: Enviar para Gerência */}
      {activeTab === 'gerencia' && <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-sm font-bold font-display uppercase tracking-wider text-muted-foreground">Pedidos Liberados — Enviar para Gerência</h2>
          <button className={btnPrimary} onClick={() => void enviarParaGerencia()} disabled={!s1Selected.length}>
            <CheckCircle2 className="h-4 w-4" />
            Enviar para Gerência ({s1Selected.length})
          </button>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" value={s1ColFilter.values['pedido'] || ''} onChange={(e) => s1ColFilter.setFilter('pedido', e.target.value)} placeholder="Filtrar pedido..." className="w-40 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" />
          <input type="text" list="cl-clientes-list-s1" value={s1ColFilter.values['cliente'] || ''} onChange={(e) => s1ColFilter.setFilter('cliente', e.target.value)} placeholder="Filtrar cliente..." className="flex-1 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" /><datalist id="cl-clientes-list-s1">{uniqueClientes.map((c) => <option key={c} value={c} />)}</datalist>
          <input type="text" list="cl-reps-list-s1" value={s1ColFilter.values['representante'] || ''} onChange={(e) => s1ColFilter.setFilter('representante', e.target.value)} placeholder="Filtrar representante..." className="flex-1 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" /><datalist id="cl-reps-list-s1">{uniqueRepresentantes.map((r) => <option key={r} value={r} />)}</datalist>
          <input type="text" value={s1ColFilter.values['grupo'] || ''} onChange={(e) => s1ColFilter.setFilter('grupo', e.target.value)} placeholder="Filtrar grupo..." className="w-40 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" />
        </div>
        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-4 px-6 text-center w-[56px]">
                    <input type="checkbox" checked={s1Selected.length === s1Processed.length && s1Processed.length > 0} onChange={() => toggleAll(s1Selected, setS1Selected, s1Processed.map(o => o.id))} />
                  </th>
                  <SortableHeader columnKey="pedido" sortState={s1Sort.sortState} onToggle={s1Sort.toggleSort} className="text-left py-4 px-6">Pedido</SortableHeader>
                  <SortableHeader columnKey="cliente" sortState={s1Sort.sortState} onToggle={s1Sort.toggleSort} className="text-left py-4 px-6">Cliente</SortableHeader>
                  <SortableHeader columnKey="representante" sortState={s1Sort.sortState} onToggle={s1Sort.toggleSort} className="text-left py-4 px-6">Representante</SortableHeader>
                  <SortableHeader columnKey="grupo" sortState={s1Sort.sortState} onToggle={s1Sort.toggleSort} className="text-left py-4 px-6">Grupo</SortableHeader>
                  <SortableHeader columnKey="validade" sortState={s1Sort.sortState} onToggle={s1Sort.toggleSort} className="text-left py-4 px-6">Validade</SortableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {s1Processed.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-muted-foreground italic">Nenhum pedido aguardando envio para gerência.</td></tr>
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
                    <td className="py-4 px-6 text-muted-foreground">{o.grupoCliente || '-'}</td>
                    <td className="py-4 px-6 font-mono-data text-muted-foreground">{formatDateBR(o.expiryDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>}

      {/* Aba 2: Confirmar Gerência */}
      {activeTab === 'confirmar' && <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-sm font-bold font-display uppercase tracking-wider text-muted-foreground">Aguardando Gerência — Confirmar Aprovação</h2>
          <button className={btnPrimary} onClick={() => void confirmarGerencia()} disabled={!s2Selected.length}>
            <CheckCircle2 className="h-4 w-4" />
            Confirmar Gerência ({s2Selected.length})
          </button>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" value={s2ColFilter.values['pedido'] || ''} onChange={(e) => s2ColFilter.setFilter('pedido', e.target.value)} placeholder="Filtrar pedido..." className="w-40 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" />
          <input type="text" list="cl-clientes-list-s2" value={s2ColFilter.values['cliente'] || ''} onChange={(e) => s2ColFilter.setFilter('cliente', e.target.value)} placeholder="Filtrar cliente..." className="flex-1 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" /><datalist id="cl-clientes-list-s2">{uniqueClientes.map((c) => <option key={c} value={c} />)}</datalist>
          <input type="text" list="cl-reps-list-s2" value={s2ColFilter.values['representante'] || ''} onChange={(e) => s2ColFilter.setFilter('representante', e.target.value)} placeholder="Filtrar representante..." className="flex-1 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" /><datalist id="cl-reps-list-s2">{uniqueRepresentantes.map((r) => <option key={r} value={r} />)}</datalist>
        </div>
        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-4 px-6 text-center w-[56px]">
                    <input type="checkbox" checked={s2Selected.length === s2Processed.length && s2Processed.length > 0} onChange={() => toggleAll(s2Selected, setS2Selected, s2Processed.map(o => o.id))} />
                  </th>
                  <SortableHeader columnKey="pedido" sortState={s2Sort.sortState} onToggle={s2Sort.toggleSort} className="text-left py-4 px-6">Pedido</SortableHeader>
                  <SortableHeader columnKey="cliente" sortState={s2Sort.sortState} onToggle={s2Sort.toggleSort} className="text-left py-4 px-6">Cliente</SortableHeader>
                  <SortableHeader columnKey="representante" sortState={s2Sort.sortState} onToggle={s2Sort.toggleSort} className="text-left py-4 px-6">Representante</SortableHeader>
                  <SortableHeader columnKey="cidadeUf" sortState={s2Sort.sortState} onToggle={s2Sort.toggleSort} className="text-left py-4 px-6">Cidade / UF</SortableHeader>
                  <SortableHeader columnKey="validade" sortState={s2Sort.sortState} onToggle={s2Sort.toggleSort} className="text-left py-4 px-6">Validade</SortableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {s2Processed.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-muted-foreground italic">Nenhum pedido aguardando confirmação da gerência.</td></tr>
                ) : s2Processed.map(o => (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-4 px-6 text-center">
                      <input type="checkbox" checked={s2Selected.includes(o.id)} onChange={() => setS2Selected(prev => prev.includes(o.id) ? prev.filter(x => x !== o.id) : [...prev, o.id])} />
                    </td>
                    <td className="py-4 px-6 font-mono-data font-bold text-primary">{o.id}</td>
                    <td className="py-4 px-6">
                      <span className="font-mono-data font-bold text-muted-foreground">{o.clientCode || '-'}</span>
                      <span className="ml-2 font-display font-semibold text-foreground">{o.clientName || '-'}</span>
                    </td>
                    <td className="py-4 px-6">{o.representativeName || '-'}</td>
                    <td className="py-4 px-6">{o.clientCity && o.clientUF ? `${o.clientCity} - ${o.clientUF}` : '-'}</td>
                    <td className="py-4 px-6 font-mono-data text-muted-foreground">{formatDateBR(o.expiryDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>}

      {/* Aba 3: Prontos para Produção (montar carga + carga atual) */}
      {activeTab === 'producao' && <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-sm font-bold font-display uppercase tracking-wider text-muted-foreground">Prontos para Produção</h2>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" value={s3CandColFilter.values['pedido'] || ''} onChange={(e) => s3CandColFilter.setFilter('pedido', e.target.value)} placeholder="Filtrar pedido..." className="w-40 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" />
          <input type="text" list="cl-clientes-list-s3c" value={s3CandColFilter.values['cliente'] || ''} onChange={(e) => s3CandColFilter.setFilter('cliente', e.target.value)} placeholder="Filtrar cliente..." className="flex-1 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" /><datalist id="cl-clientes-list-s3c">{uniqueClientes.map((c) => <option key={c} value={c} />)}</datalist>
          <input type="text" list="cl-reps-list-s3c" value={s3CandColFilter.values['representante'] || ''} onChange={(e) => s3CandColFilter.setFilter('representante', e.target.value)} placeholder="Filtrar representante..." className="flex-1 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" /><datalist id="cl-reps-list-s3c">{uniqueRepresentantes.map((r) => <option key={r} value={r} />)}</datalist>
        </div>
        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <SortableHeader columnKey="pedido" sortState={s3CandSort.sortState} onToggle={s3CandSort.toggleSort} className="text-left py-4 px-6">Pedido</SortableHeader>
                  <SortableHeader columnKey="cliente" sortState={s3CandSort.sortState} onToggle={s3CandSort.toggleSort} className="text-left py-4 px-6">Cliente</SortableHeader>
                  <SortableHeader columnKey="representante" sortState={s3CandSort.sortState} onToggle={s3CandSort.toggleSort} className="text-left py-4 px-6">Representante</SortableHeader>
                  <SortableHeader columnKey="cidadeUf" sortState={s3CandSort.sortState} onToggle={s3CandSort.toggleSort} className="text-left py-4 px-6">Cidade / UF</SortableHeader>
                  <SortableHeader columnKey="validade" sortState={s3CandSort.sortState} onToggle={s3CandSort.toggleSort} className="text-left py-4 px-6">Validade</SortableHeader>
                  <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {s3CandProcessed.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-muted-foreground italic">Nenhum pedido pronto para carga.</td></tr>
                ) : s3CandProcessed.map(o => (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-4 px-6 font-mono-data font-bold text-primary">
                      {o.id}
                      <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${o.kind === 'SUPORTE' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>{o.kind}</span>
                    </td>
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

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-sm font-bold font-display uppercase tracking-wider text-muted-foreground">Liberar para Produção</h2>

          <button className={btnPrimary} onClick={() => void liberarParaProducao()}>
            <CheckCircle2 className="h-4 w-4" />
            Confirmar Liberação
          </button>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" value={s3ColFilter.values['pedido'] || ''} onChange={(e) => s3ColFilter.setFilter('pedido', e.target.value)} placeholder="Filtrar pedido..." className="w-40 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" />
          <input type="text" list="cl-clientes-list-s3" value={s3ColFilter.values['cliente'] || ''} onChange={(e) => s3ColFilter.setFilter('cliente', e.target.value)} placeholder="Filtrar cliente..." className="flex-1 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" /><datalist id="cl-clientes-list-s3">{uniqueClientes.map((c) => <option key={c} value={c} />)}</datalist>
          <input type="text" list="cl-reps-list-s3" value={s3ColFilter.values['representante'] || ''} onChange={(e) => s3ColFilter.setFilter('representante', e.target.value)} placeholder="Filtrar representante..." className="flex-1 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" /><datalist id="cl-reps-list-s3">{uniqueRepresentantes.map((r) => <option key={r} value={r} />)}</datalist>
        </div>
        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
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
                    <td className="py-4 px-6 font-mono-data font-bold text-primary">
                      {o.id}
                      <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${o.kind === 'SUPORTE' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>{o.kind}</span>
                    </td>
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
      </div>}

      <FilterConfiguratorDialog open={s2FiltersOpen} onOpenChange={setS2FiltersOpen} fields={filterFields} value={s2Conditions} onApply={setS2Conditions} />
      <FilterConfiguratorDialog open={s3FiltersOpen} onOpenChange={setS3FiltersOpen} fields={filterFields} value={s3Conditions} onApply={setS3Conditions} />
    </div>
  );
};

export default ComercialLiberacao;
