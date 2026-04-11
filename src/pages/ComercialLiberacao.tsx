import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import { btnPrimary, btnSecondary, inputClass } from '@/components/shared';
import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import { tableColumns } from '@/contexts/AppContext';
import { rowToOrder } from '@/lib/pedidoMapper';
import { ArrowLeft, CheckCircle2, FileSpreadsheet, Printer, Plus, Trash2 } from 'lucide-react';
import logoProgramacao from '@/assets/logo-programacao.png';
import { Order, SupportOrder } from '@/types';
import { createBrandedWorkbook, downloadBuffer } from '@/lib/excelBranded';
import type { FilterCondition, FilterField } from '@/lib/filters';
import { applyFilters } from '@/lib/filters';
// applyFilters used in s3CandProcessed
import { FilterConfiguratorDialog } from '@/components/filters/FilterConfiguratorDialog';


import { updatePedidoStatus, normalizePhoneToE164, isLeroy } from '@/lib/pedidosStatusRepo';
import { fetchAllPages } from '@/lib/supabaseUtils';
import { fmtDate, currentHourBR } from '@/lib/dateUtils';
import { sendEvolutionText } from '@/lib/evolutionApi';
import { findRepresentanteContato, listComercialPedidosMeta, upsertComercialPedidoMeta } from '@/lib/opsRepo';
import { usePrioridades } from '@/contexts/PrioridadesContext';
import { PrioridadeIcon } from '@/components/pedidos/PrioridadeBadge';
import { useTableSort } from '@/hooks/useTableSort';
import { useQuickFilter } from '@/hooks/useQuickFilter';
import { useColumnFilters } from '@/hooks/useColumnFilters';
import { SortableHeader } from '@/components/table/SortableHeader';
import type { ColDef } from '@/hooks/useColumnFilters';

const formatDateBR = (iso?: string) => {
  if (!iso) return '-';
  return fmtDate(iso);
};

type UnifiedOrder = { id: string; kind: 'VENDA' | 'SUPORTE'; clientCode?: string; clientName?: string; representativeName?: string; clientCity?: string; clientUF?: string; expiryDate?: string; totalPedidoVenda?: number; previsaoCarregamento?: string; grupoCliente?: string; totalQtd?: number };

const toUnified = (o: Order): UnifiedOrder => ({
  id: o.id, kind: 'VENDA', clientCode: o.clientCode, clientName: o.clientName,
  representativeName: o.representativeName, clientCity: o.clientCity, clientUF: o.clientUF,
  expiryDate: o.expiryDate, totalPedidoVenda: o.totalPedidoVenda, previsaoCarregamento: o.previsaoCarregamento, grupoCliente: o.grupoCliente, totalQtd: o.totalQtd,
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
  const { map: prioMap } = usePrioridades();
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

  const chunkArr = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const refreshOrders = async () => {
    if (!supabaseOps || !supabasePedidos) return;
    setLoading(true);
    try {
      const statusData = await fetchAllPages((from, to) =>
        supabaseOps!.from('concrem_pedidos_status')
          .select('*')
          .in('status_atual', ['liberado_comercial', 'aguardando_gerencia', 'confirmado_gerencia'])
          .range(from, to) as any
      );
      if (!statusData.length) { setDirectOrders([]); return; }

      const ids = statusData.map((r: any) => r.pedido_id);

      // Chunk .in() to avoid URL length limits
      const allPedidos: any[] = [];
      for (const batch of chunkArr(ids, 200)) {
        const { data: batchData, error: batchErr } = await supabasePedidos
          .from(table)
          .select(tableColumns)
          .in('numero_pedido', batch);
        if (batchErr) {
          console.error('[ComercialLiberacao] pedidos query error:', batchErr.message);
          showToast(`Erro ao carregar pedidos: ${batchErr.message}`, 'error');
          return;
        }
        allPedidos.push(...(batchData || []));
      }

      // Mirror of suporteOr logic — totalPedidoVenda has fallback from pedidoMapper
      const isSuporteRow = (o: Order) => {
        const conf = o.idNotaConf;
        if (conf === 613 || conf === 665) return true;
        if (conf === 307 || conf === 309) {
          const pc = (o.pedCompraCliente ?? '').toUpperCase().trim();
          // APTO MODELO and COMPLEMENTO always go to Venda regardless of value
          if (pc.includes('APTO MODELO') || pc.includes('COMPLEMENTO')) return false;
          const tv = o.totalPedidoVenda ?? 0;
          if (tv < 20000) return true;
        }
        return false;
      };
      const mapped = allPedidos.map((row: any) => rowToOrder(row, 'CLI-001')).filter(o => !isSuporteRow(o));
      const statusMap = new Map(statusData.map((r: any) => [r.pedido_id, r] as const));
      setDirectOrders(mapped);
      setStatusRowsDirect(statusMap);
      const meta = await listComercialPedidosMeta(ids);
      setPedidoMetaMap(meta);
    } catch (e: any) {
      console.error('[ComercialLiberacao] refreshOrders error:', e);
      showToast('Erro ao carregar pedidos', 'error');
    } finally {
      setLoading(false);
    }
  };

  const [statusRowsDirect, setStatusRowsDirect] = useState<Map<string, any>>(new Map());
  const [pedidoMetaMap, setPedidoMetaMap] = useState<Record<string, { observacao?: string | null }>>({});

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

  const uniqueGrupos = useMemo(() => {
    const set = new Set(directOrders.map((o) => (o as any).grupoCliente || '').filter(Boolean));
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

  // --- PDF Programação ---
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfMesRef, setPdfMesRef] = useState('');
  const [pdfDataEmbarque, setPdfDataEmbarque] = useState('');
  const [pdfDataLiberacao, setPdfDataLiberacao] = useState('');

  // --- PDF Gerência ---
  const [showPdfGerenciaModal, setShowPdfGerenciaModal] = useState(false);
  const [pdfGerenciaMesRef, setPdfGerenciaMesRef] = useState('');
  const [pdfGerenciaObs, setPdfGerenciaObs] = useState<Record<string, string>>({});

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

    // Enviar notificação por representante (skip LEROY)
    for (const [, { orders, phone }] of byRep.entries()) {
      if (!phone) continue;
      const repName = orders[0].representativeName || '-';

      // Filtra pedidos LEROY (cliente ou representante)
      const notifiable = orders.filter((o) => !isLeroy(o.clientName || o.clientCode, repName));
      if (!notifiable.length) continue;

      const phoneE164 = normalizePhoneToE164(phone);
      if (!phoneE164) continue;

      const hora = currentHourBR();
      const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
      let msg = `${saudacao}, ${repName}!\n\n`;
      msg += `Os seguintes pedidos foram *liberados para produção*:\n\n`;
      for (const o of notifiable) {
        msg += `· Pedido *${o.id}* — ${o.clientName || o.clientCode || 'Cliente'}\n`;
      }
      msg += `\nEm breve iniciaremos a fabricação. Qualquer dúvida, estamos à disposição.`;

      await sendEvolutionText(phoneE164, msg);
    }

    await refreshOrders();
    setLoadIds([]);
    showToast('Carga liberada para Produção');
  };

  const handleExportProgramacaoPDF = () => {
    const pedidos = s3Processed;
    if (pedidos.length === 0) { showToast('Nenhum pedido na carga para exportar.', 'error'); return; }
    if (!pdfMesRef.trim()) { showToast('Informe o mês de referência.', 'error'); return; }
    if (!pdfDataEmbarque || !pdfDataLiberacao) { showToast('Informe as datas de embarque e liberação.', 'error'); return; }

    const now = new Date();
    const mesRef = pdfMesRef.trim();

    const dtEmbarque = new Date(pdfDataEmbarque + 'T00:00:00');
    const dtLiberacao = new Date(pdfDataLiberacao + 'T00:00:00');
    const diasCorridosVal = Math.max(0, Math.ceil((dtEmbarque.getTime() - dtLiberacao.getTime()) / 86400000));

    const fmtCurrency = (v?: number) => v != null ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-';

    let totalValor = 0;
    let totalQtdKits = 0;
    const rows = pedidos.map((o) => {
      totalValor += o.totalPedidoVenda || 0;
      totalQtdKits += o.totalQtd || 0;
      return `<tr>
        <td>${mesRef}</td>
        <td style="text-align:center">${diasCorridosVal}</td>
        <td>${o.clientName || o.clientCode || '-'}</td>
        <td style="text-align:right">${fmtCurrency(o.totalPedidoVenda)}</td>
        <td style="text-align:center;font-weight:700">${o.id}</td>
        <td style="text-align:center">${o.totalQtd || '-'}</td>
      </tr>`;
    }).join('');

    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Programação de Produção</title>
<style>
  @page { size: A4 landscape; margin: 12mm 14mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; font-size: 11px; }
  .header { display: flex; align-items: center; justify-content: space-between; padding: 16px 0; border-bottom: 3px solid #0a2315; margin-bottom: 12px; }
  .header img { height: 52px; }
  .header .title { text-align: right; }
  .header .title h1 { font-size: 18px; color: #0a2315; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
  .header .title p { font-size: 11px; color: #666; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  thead th { background: #0a2315; color: #fff; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; white-space: nowrap; }
  tbody td { padding: 6px 10px; border-bottom: 1px solid #e0e0e0; font-size: 11px; }
  tbody tr:nth-child(even) { background: #f5f7f5; }
  tbody tr:hover { background: #e8f0e8; }
  tfoot td { padding: 10px; font-weight: 800; font-size: 12px; border-top: 3px solid #0a2315; background: #f0f2f0; }
  .info { display: flex; gap: 24px; font-size: 10px; color: #555; margin-bottom: 8px; }
  .info span { font-weight: 600; color: #0a2315; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
<script>window.onload = () => { window.focus(); window.print(); };</script>
</head><body>
<div class="header">
  <img src="${logoProgramacao}" alt="Concrem" />
  <div class="title">
    <h1>Programação de Produção</h1>
    <p>${mesRef} &mdash; ${pedidos.length} pedido(s) &mdash; ${diasCorridosVal} dias corridos</p>
  </div>
</div>
<div class="info">
  <div>Emissão: <span>${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></div>
  <div>Total Valor: <span>${fmtCurrency(totalValor)}</span></div>
  <div>Total Kits: <span>${totalQtdKits || '-'}</span></div>
</div>
<table>
  <thead><tr>
    <th style="text-align:left">Mês Referência</th>
    <th style="text-align:center">Dias Corridos</th>
    <th style="text-align:left">Cliente</th>
    <th style="text-align:right">Valor Pedido</th>
    <th style="text-align:center">Nº Pedido</th>
    <th style="text-align:center">Qtd Kits</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr>
    <td colspan="3" style="text-align:right">TOTAL</td>
    <td style="text-align:right">${fmtCurrency(totalValor)}</td>
    <td></td>
    <td style="text-align:center">${totalQtdKits || '-'}</td>
  </tr></tfoot>
</table>
</body></html>`;

    const w = window.open('', '_blank', 'width=1100,height=700');
    if (!w) { showToast('Pop-up bloqueado. Permita pop-ups para este site.', 'error'); return; }
    w.document.open();
    w.document.write(fullHtml);
    w.document.close();
    setShowPdfModal(false);
  };

  const handleExportGerenciaPDF = () => {
    const pedidos = s1Processed.filter(o => s1Selected.includes(o.id));
    if (pedidos.length === 0) { showToast('Selecione ao menos um pedido.', 'error'); return; }
    if (!pdfGerenciaMesRef.trim()) { showToast('Informe o mês de referência.', 'error'); return; }

    const now = new Date();
    const mesRef = pdfGerenciaMesRef.trim();

    const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fmtCurrency = (v?: number) => v != null ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-';

    let totalValor = 0;
    const rows = pedidos.map((o) => {
      totalValor += o.totalPedidoVenda || 0;
      const obs = pdfGerenciaObs[o.id] || '-';
      return `<tr>
        <td>${mesRef}</td>
        <td style="text-align:center;font-weight:700">${o.id}</td>
        <td>${o.clientName || o.clientCode || '-'}</td>
        <td style="text-align:right">${fmtCurrency(o.totalPedidoVenda)}</td>
        <td>${escHtml(obs)}</td>
      </tr>`;
    }).join('');

    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Pedidos para Gerência</title>
<style>
  @page { size: A4 landscape; margin: 12mm 14mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; font-size: 11px; }
  .header { display: flex; align-items: center; justify-content: space-between; padding: 16px 0; border-bottom: 3px solid #0a2315; margin-bottom: 12px; }
  .header img { height: 52px; }
  .header .title { text-align: right; }
  .header .title h1 { font-size: 18px; color: #0a2315; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
  .header .title p { font-size: 11px; color: #666; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  thead th { background: #0a2315; color: #fff; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; white-space: nowrap; }
  tbody td { padding: 6px 10px; border-bottom: 1px solid #e0e0e0; font-size: 11px; }
  tbody tr:nth-child(even) { background: #f5f7f5; }
  tbody tr:hover { background: #e8f0e8; }
  .info { display: flex; gap: 24px; font-size: 10px; color: #555; margin-bottom: 8px; }
  .info span { font-weight: 600; color: #0a2315; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
<script>window.onload = () => { window.focus(); window.print(); };</script>
</head><body>
<div class="header">
  <img src="${logoProgramacao}" alt="Concrem" />
  <div class="title">
    <h1>Pedidos para Gerência</h1>
    <p>${mesRef} &mdash; ${pedidos.length} pedido(s)</p>
  </div>
</div>
<div class="info">
  <div>Emissão: <span>${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></div>
  <div>Total Valor: <span>${fmtCurrency(totalValor)}</span></div>
</div>
<table>
  <thead><tr>
    <th style="text-align:left">Mês Referência</th>
    <th style="text-align:center">Nº Pedido</th>
    <th style="text-align:left">Cliente</th>
    <th style="text-align:right">Valor</th>
    <th style="text-align:left">Observação</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr>
    <td colspan="3" style="text-align:right;font-weight:800;border-top:3px solid #0a2315;padding:10px">TOTAL</td>
    <td style="text-align:right;font-weight:800;border-top:3px solid #0a2315;padding:10px">${fmtCurrency(totalValor)}</td>
    <td style="border-top:3px solid #0a2315"></td>
  </tr></tfoot>
</table>
</body></html>`;

    const w = window.open('', '_blank', 'width=1100,height=700');
    if (!w) { showToast('Pop-up bloqueado. Permita pop-ups para este site.', 'error'); return; }
    w.document.open();
    w.document.write(fullHtml);
    w.document.close();

    // Persist observations
    for (const o of pedidos) {
      const obs = pdfGerenciaObs[o.id]?.trim();
      if (obs) void upsertComercialPedidoMeta({ pedido_id: o.id, observacao: obs, atualizado_por: user?.name || null });
    }

    setShowPdfGerenciaModal(false);
    setPdfGerenciaObs({});
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

      {showPdfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <h2 className="text-lg font-bold font-display text-foreground">Exportar Programação de Produção</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Mês de Referência</label>
                <input className={inputClass} placeholder="ex: Março/2026" value={pdfMesRef} onChange={(e) => setPdfMesRef(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Data de Liberação para Produção</label>
                <input type="date" className={inputClass} value={pdfDataLiberacao} onChange={(e) => setPdfDataLiberacao(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Data de Embarque</label>
                <input type="date" className={inputClass} value={pdfDataEmbarque} onChange={(e) => setPdfDataEmbarque(e.target.value)} />
              </div>
              {pdfDataEmbarque && pdfDataLiberacao && (
                <p className="text-sm text-muted-foreground">
                  Dias corridos: <strong className="text-foreground">{Math.max(0, Math.ceil((new Date(pdfDataEmbarque + 'T00:00:00').getTime() - new Date(pdfDataLiberacao + 'T00:00:00').getTime()) / 86400000))}</strong>
                </p>
              )}
              <p className="text-xs text-muted-foreground">Serão exportados <strong>{s3Processed.length}</strong> pedido(s) prontos para produção.</p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button className={btnSecondary} onClick={() => setShowPdfModal(false)}>Cancelar</button>
              <button className={btnPrimary} onClick={handleExportProgramacaoPDF}>
                <Printer className="h-4 w-4" />
                Gerar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {showPdfGerenciaModal && (() => {
        const selectedOrders = s1Processed.filter(o => s1Selected.includes(o.id));
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-5 max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-bold font-display text-foreground">Exportar PDF — Pedidos para Gerência</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Mês de Referência</label>
                <input className={inputClass} placeholder="ex: Março/2026" value={pdfGerenciaMesRef} onChange={(e) => setPdfGerenciaMesRef(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Observações por Pedido</label>
                <div className="space-y-2 max-h-[40vh] overflow-y-auto border border-border rounded-lg p-3">
                  {selectedOrders.map(o => (
                    <div key={o.id} className="flex items-center gap-3">
                      {prioMap.has(o.id) && <PrioridadeIcon nivel={prioMap.get(o.id)!.nivel} motivo={prioMap.get(o.id)!.motivo} />}
                      <span className="font-mono-data font-bold text-primary text-sm w-20 shrink-0">{o.id}</span>
                      <span className="text-sm text-muted-foreground truncate w-40 shrink-0">{o.clientName || o.clientCode || '-'}</span>
                      <input
                        type="text"
                        className="flex-1 px-2 py-1.5 rounded border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors"
                        placeholder="Observação..."
                        value={pdfGerenciaObs[o.id] || ''}
                        onChange={(e) => setPdfGerenciaObs(prev => ({ ...prev, [o.id]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Serão exportados <strong>{selectedOrders.length}</strong> pedido(s) selecionado(s).</p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button className={btnSecondary} onClick={() => { setShowPdfGerenciaModal(false); setPdfGerenciaObs({}); }}>Cancelar</button>
              <button className={btnPrimary} onClick={handleExportGerenciaPDF}>
                <Printer className="h-4 w-4" />
                Gerar PDF
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Aba 1: Enviar para Gerência */}
      {activeTab === 'gerencia' && <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-sm font-bold font-display uppercase tracking-wider text-muted-foreground">Pedidos Liberados — Enviar para Gerência</h2>
          <div className="flex items-center gap-2">
            <button className={btnSecondary} onClick={async () => {
              const saved = await listComercialPedidosMeta(s1Selected);
              const obs: Record<string, string> = {};
              for (const id of s1Selected) {
                if (saved[id]?.observacao) obs[id] = saved[id].observacao!;
              }
              setPdfGerenciaObs(obs);
              setShowPdfGerenciaModal(true);
            }} disabled={!s1Selected.length}>
              <Printer className="h-4 w-4" />
              Exportar PDF ({s1Selected.length})
            </button>
            <button className={btnPrimary} onClick={() => void enviarParaGerencia()} disabled={!s1Selected.length}>
              <CheckCircle2 className="h-4 w-4" />
              Enviar para Gerência ({s1Selected.length})
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" value={s1ColFilter.values['pedido'] || ''} onChange={(e) => s1ColFilter.setFilter('pedido', e.target.value)} placeholder="Filtrar pedido..." className="w-40 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" />
          <input type="text" list="cl-clientes-list-s1" value={s1ColFilter.values['cliente'] || ''} onChange={(e) => s1ColFilter.setFilter('cliente', e.target.value)} placeholder="Filtrar cliente..." className="flex-1 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" /><datalist id="cl-clientes-list-s1">{uniqueClientes.map((c) => <option key={c} value={c} />)}</datalist>
          <input type="text" list="cl-reps-list-s1" value={s1ColFilter.values['representante'] || ''} onChange={(e) => s1ColFilter.setFilter('representante', e.target.value)} placeholder="Filtrar representante..." className="flex-1 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" /><datalist id="cl-reps-list-s1">{uniqueRepresentantes.map((r) => <option key={r} value={r} />)}</datalist>
          <select value={s1ColFilter.values['grupo'] || ''} onChange={(e) => s1ColFilter.setFilter('grupo', e.target.value, true)} className="w-44 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors">
            <option value="">Todos os grupos</option>
            {uniqueGrupos.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-4 px-6 text-center w-[56px]">
                    <input type="checkbox" checked={s1Selected.length === s1Processed.length && s1Processed.length > 0} onChange={() => toggleAll(s1Selected, setS1Selected, s1Processed.map(o => o.id))} />
                  </th>
                  <SortableHeader columnKey="pedido" sortState={s1Sort.sortState} onToggle={s1Sort.toggleSort} className="text-left py-4 px-6">Pedido</SortableHeader>
                  <th className="w-32 py-2 text-center" />
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
                    <td className="w-32 py-2 text-center align-middle">{prioMap.has(o.id) && <PrioridadeIcon nivel={prioMap.get(o.id)!.nivel} motivo={prioMap.get(o.id)!.motivo} />}</td>
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
          <select value={s2ColFilter.values['grupo'] || ''} onChange={(e) => s2ColFilter.setFilter('grupo', e.target.value, true)} className="w-44 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors">
            <option value="">Todos os grupos</option>
            {uniqueGrupos.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-4 px-6 text-center w-[56px]">
                    <input type="checkbox" checked={s2Selected.length === s2Processed.length && s2Processed.length > 0} onChange={() => toggleAll(s2Selected, setS2Selected, s2Processed.map(o => o.id))} />
                  </th>
                  <SortableHeader columnKey="pedido" sortState={s2Sort.sortState} onToggle={s2Sort.toggleSort} className="text-left py-4 px-6">Pedido</SortableHeader>
                  <th className="w-32 py-2 text-center" />
                  <SortableHeader columnKey="cliente" sortState={s2Sort.sortState} onToggle={s2Sort.toggleSort} className="text-left py-4 px-6">Cliente</SortableHeader>
                  <SortableHeader columnKey="representante" sortState={s2Sort.sortState} onToggle={s2Sort.toggleSort} className="text-left py-4 px-6">Representante</SortableHeader>
                  <SortableHeader columnKey="cidadeUf" sortState={s2Sort.sortState} onToggle={s2Sort.toggleSort} className="text-left py-4 px-6">Cidade / UF</SortableHeader>
                  <SortableHeader columnKey="validade" sortState={s2Sort.sortState} onToggle={s2Sort.toggleSort} className="text-left py-4 px-6">Validade</SortableHeader>
                  <th className="py-4 px-6 text-left font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {s2Processed.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-muted-foreground italic">Nenhum pedido aguardando confirmação da gerência.</td></tr>
                ) : s2Processed.map(o => (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-4 px-6 text-center">
                      <input type="checkbox" checked={s2Selected.includes(o.id)} onChange={() => setS2Selected(prev => prev.includes(o.id) ? prev.filter(x => x !== o.id) : [...prev, o.id])} />
                    </td>
                    <td className="py-4 px-6 font-mono-data font-bold text-primary">{o.id}</td>
                    <td className="w-32 py-2 text-center align-middle">{prioMap.has(o.id) && <PrioridadeIcon nivel={prioMap.get(o.id)!.nivel} motivo={prioMap.get(o.id)!.motivo} />}</td>
                    <td className="py-4 px-6">
                      <span className="font-mono-data font-bold text-muted-foreground">{o.clientCode || '-'}</span>
                      <span className="ml-2 font-display font-semibold text-foreground">{o.clientName || '-'}</span>
                    </td>
                    <td className="py-4 px-6">{o.representativeName || '-'}</td>
                    <td className="py-4 px-6">{o.clientCity && o.clientUF ? `${o.clientCity} - ${o.clientUF}` : '-'}</td>
                    <td className="py-4 px-6 font-mono-data text-muted-foreground">{formatDateBR(o.expiryDate)}</td>
                    <td className="py-4 px-6 text-muted-foreground italic">{pedidoMetaMap[o.id]?.observacao || '-'}</td>
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
          <select value={s3CandColFilter.values['grupo'] || ''} onChange={(e) => s3CandColFilter.setFilter('grupo', e.target.value, true)} className="w-44 px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors">
            <option value="">Todos os grupos</option>
            {uniqueGrupos.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <SortableHeader columnKey="pedido" sortState={s3CandSort.sortState} onToggle={s3CandSort.toggleSort} className="text-left py-4 px-6">Pedido</SortableHeader>
                  <th className="w-32 py-2 text-center" />
                  <SortableHeader columnKey="cliente" sortState={s3CandSort.sortState} onToggle={s3CandSort.toggleSort} className="text-left py-4 px-6">Cliente</SortableHeader>
                  <SortableHeader columnKey="representante" sortState={s3CandSort.sortState} onToggle={s3CandSort.toggleSort} className="text-left py-4 px-6">Representante</SortableHeader>
                  <SortableHeader columnKey="cidadeUf" sortState={s3CandSort.sortState} onToggle={s3CandSort.toggleSort} className="text-left py-4 px-6">Cidade / UF</SortableHeader>
                  <SortableHeader columnKey="validade" sortState={s3CandSort.sortState} onToggle={s3CandSort.toggleSort} className="text-left py-4 px-6">Validade</SortableHeader>
                  <th className="py-4 px-6 text-left font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Observação</th>
                  <th className="text-right py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {s3CandProcessed.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-muted-foreground italic">Nenhum pedido pronto para carga.</td></tr>
                ) : s3CandProcessed.map(o => (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-4 px-6 font-mono-data font-bold text-primary">
                      {o.id}
                      <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${o.kind === 'SUPORTE' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>{o.kind}</span>
                    </td>
                    <td className="w-32 py-2 text-center align-middle">{prioMap.has(o.id) && <PrioridadeIcon nivel={prioMap.get(o.id)!.nivel} motivo={prioMap.get(o.id)!.motivo} />}</td>
                    <td className="py-4 px-6">
                      <span className="font-mono-data font-bold text-muted-foreground">{o.clientCode || '-'}</span>
                      <span className="ml-2 font-display font-semibold text-foreground">{o.clientName || '-'}</span>
                    </td>
                    <td className="py-4 px-6">{o.representativeName || '-'}</td>
                    <td className="py-4 px-6">{o.clientCity && o.clientUF ? `${o.clientCity} - ${o.clientUF}` : '-'}</td>
                    <td className="py-4 px-6 font-mono-data text-muted-foreground">{formatDateBR(o.expiryDate)}</td>
                    <td className="py-4 px-6 text-muted-foreground italic">{pedidoMetaMap[o.id]?.observacao || '-'}</td>
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

          <div className="flex items-center gap-2">
            <button className={btnSecondary} onClick={() => setShowPdfModal(true)}>
              <Printer className="h-4 w-4" />
              Exportar PDF
            </button>
            <button className={btnPrimary} onClick={() => void liberarParaProducao()}>
              <CheckCircle2 className="h-4 w-4" />
              Confirmar Liberação
            </button>
          </div>
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
                  <th className="w-32 py-2 text-center" />
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
                    <td className="w-32 py-2 text-center align-middle">{prioMap.has(o.id) && <PrioridadeIcon nivel={prioMap.get(o.id)!.nivel} motivo={prioMap.get(o.id)!.motivo} />}</td>
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
