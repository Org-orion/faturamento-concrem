import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import { btnPrimary, btnSecondary, inputClass } from '@/components/shared';
import { supabaseOps } from '@/lib/supabase';
import { updatePedidoStatus } from '@/lib/pedidosStatusRepo';
import { createBrandedWorkbook, createBrandedBase64, downloadBuffer } from '@/lib/excelBranded';
import type { BrandedColumn } from '@/lib/excelBranded';
import { ArrowLeft, CheckCircle2, Download, Mail, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
import type { Order } from '@/types';
import { fmtDate, fmtDateTime, todayBR } from '@/lib/dateUtils';

const formatDateBR = (iso?: string) => {
  if (!iso) return '-';
  return fmtDate(iso);
};

const formatDateTimeBR = (d: Date) =>
  fmtDateTime(d.toISOString());

const todayStr = () => todayBR();

type SheetType = 'engenharia' | 'diretoria';

const ComercialConfirmacao = () => {
  const { user, orders } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // --- Pedidos aguardando avaliação ---
  const awaitingOrders = useMemo(() => {
    return orders
      .filter((o) => o.status === 'Aguardando Avaliação')
      .sort(
        (a, b) =>
          (a.expiryDate || '').localeCompare(b.expiryDate || '') ||
          String(a.id).localeCompare(String(b.id)),
      );
  }, [orders]);

  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [conditions, setConditions] = useState<FilterCondition[]>([]);

  const { sortState, toggleSort, sortItems } = useTableSort();
  const { query, setQuery, filterItems: quickFilter } = useQuickFilter<Order>();
  const colFilter = useColumnFilters();

  const colFilterSlots: ColFilterSlot[] = useMemo(() => [
    { type: 'none' },
    { key: 'pedido', type: 'text', placeholder: 'Filtrar...' },
    { key: 'cliente', type: 'text', placeholder: 'Filtrar...' },
    { key: 'representante', type: 'text', placeholder: 'Filtrar...' },
    { key: 'cidadeUf', type: 'text', placeholder: 'Filtrar...' },
    { key: 'emissao', type: 'date' },
    { key: 'validade', type: 'date' },
  ], []);

  const colFilterDefs = useMemo(() => [
    { key: 'pedido', getter: (o: Order) => o.id },
    { key: 'cliente', getter: (o: Order) => `${o.clientCode || ''} ${o.clientName || ''}` },
    { key: 'representante', getter: (o: Order) => o.representativeName },
    { key: 'cidadeUf', getter: (o: Order) => `${o.clientCity || ''} - ${o.clientUF || ''}` },
    { key: 'emissao', getter: (o: Order) => o.date },
    { key: 'validade', getter: (o: Order) => o.expiryDate },
  ], []);

  const textGetters: Array<(item: Order) => unknown> = useMemo(
    () => [
      (o: Order) => o.id,
      (o: Order) => o.clientCode,
      (o: Order) => o.clientName,
      (o: Order) => o.representativeName,
      (o: Order) => o.clientCity,
      (o: Order) => o.clientUF,
    ],
    [],
  );

  const sortGetters: Record<string, (item: Order) => unknown> = useMemo(
    () => ({
      pedido: (o: Order) => o.id,
      cliente: (o: Order) => o.clientName,
      representante: (o: Order) => o.representativeName,
      cidadeUf: (o: Order) => `${o.clientCity || ''} - ${o.clientUF || ''}`,
      emissao: (o: Order) => o.date,
      validade: (o: Order) => o.expiryDate,
    }),
    [],
  );

  // --- Email modal ---
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [sheetType, setSheetType] = useState<SheetType>('engenharia');
  const [mesReferencia, setMesReferencia] = useState('');
  // Observação por pedido (Diretoria Janderson) — chave = pedido id, valor = texto
  const [observacoes, setObservacoes] = useState<Record<string, string>>({});

  // --- Load confirmed IDs from Supabase ---
  useEffect(() => {
    if (!supabaseOps) return;
    let cancelled = false;
    const load = async () => {
      const ids = awaitingOrders.map((o) => o.id);
      if (!ids.length) { setConfirmedIds([]); return; }
      const { data, error } = await supabaseOps
        .from('comercial_pedidos_acoes')
        .select('pedido_id')
        .in('pedido_id', ids)
        .eq('acao', 'confirmar_diretoria');
      if (cancelled) return;
      if (error || !data) return;
      setConfirmedIds(Array.from(new Set((data as any[]).map((r) => String(r.pedido_id)))));
    };
    void load();
    return () => { cancelled = true; };
  }, [awaitingOrders]);

  const pendingOrders = useMemo(() => {
    const confirmed = new Set(confirmedIds);
    return awaitingOrders.filter((o) => !confirmed.has(o.id));
  }, [awaitingOrders, confirmedIds]);

  const hasGrupoCliente = useMemo(() => pendingOrders.some((o) => Boolean((o as any).grupoCliente)), [pendingOrders]);

  const filterFields = useMemo(() => {
    const base: Array<FilterField<Order>> = [
      { id: 'pedido', label: 'Número do pedido', type: 'text', getValue: (o) => o.id, placeholder: 'Ex: PED-001' },
      {
        id: 'cliente',
        label: 'Cliente',
        type: 'text',
        getValue: (o) => `${o.clientCode || ''} ${o.clientName || ''}`.trim(),
        placeholder: 'Código ou nome...',
      },
      {
        id: 'representante',
        label: 'Representante',
        type: 'text',
        getValue: (o) => o.representativeName || '',
        placeholder: 'Nome do representante...',
      },
      {
        id: 'cidadeUf',
        label: 'Cidade / UF',
        type: 'text',
        getValue: (o) => `${o.clientCity || ''} - ${o.clientUF || ''}`.trim(),
        placeholder: 'Ex: Curitiba - PR',
      },
      { id: 'validade', label: 'Data validade', type: 'date', getValue: (o) => o.expiryDate || '' },
      { id: 'emissao', label: 'Data emissão', type: 'date', getValue: (o) => o.date || '' },
    ];

    if (hasGrupoCliente) {
      base.push({ id: 'grupoCliente', label: 'Grupo de Cliente', type: 'text', getValue: (o) => (o as any).grupoCliente || '' });
    }

    return base;
  }, [hasGrupoCliente]);

  const filtered = useMemo(
    () => sortItems(quickFilter(colFilter.filterItems(applyFilters(pendingOrders, filterFields, conditions), colFilterDefs), textGetters), sortGetters),
    [pendingOrders, filterFields, conditions, colFilter, colFilterDefs, quickFilter, textGetters, sortItems, sortGetters],
  );

  const toggleAll = () => {
    setSelected(selected.length === filtered.length && filtered.length > 0 ? [] : filtered.map((o) => o.id));
  };

  const getExportOrders = () => {
    if (selected.length > 0) return filtered.filter((o) => selected.includes(o.id));
    return filtered;
  };

  // --- Helpers ---
  const buildClientLabel = (o: (typeof orders)[0]) => {
    const code = o.clientCode || '';
    const name = o.clientName || '-';
    return code ? `${code} - ${name}` : name;
  };

  const sanitizeFilename = (s: string) => s.replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '').replace(/\s+/g, '-').toLowerCase();

  // --- Confirm selected orders ---
  const confirmSelected = async () => {
    if (!selected.length) return;
    const username = user?.username || null;
    const toConfirm = [...selected];
    setConfirmedIds((prev) => Array.from(new Set([...prev, ...toConfirm])));
    setSelected([]);

    // Update pedidos_status FIRST — this is the critical operation for the Liberação page
    await Promise.all(
      toConfirm.map((id) =>
        updatePedidoStatus({
          pedidoId: id,
          numeroPedido: id,
          statusNovo: 'confirmado_gerencia',
          alteradoPor: username,
          observacao: 'Confirmado pelo comercial',
        }),
      ),
    );

    // Log the action (non-critical)
    if (supabaseOps) {
      const rows = toConfirm.map((pedidoId) => ({
        pedido_id: pedidoId, acao: 'confirmar_diretoria',
        criado_em: new Date().toISOString(), criado_por: username, payload: null,
      }));
      const { error } = await supabaseOps.from('comercial_pedidos_acoes').insert(rows as any);
      if (error) console.error('[Supabase OPS] confirmar_diretoria:', error.message);
    }

    showToast('Pedidos confirmados e enviados para liberação!');
  };

  // ============================================================
  //  AJUSTE 3 — Exportar Planilha padrão (download direto)
  // ============================================================
  const handleExportPlanilha = async () => {
    const toExport = getExportOrders();
    if (!toExport.length) { showToast('Nenhum pedido para exportar.', 'error'); return; }

    const columns: BrandedColumn[] = [
      { header: 'Nº Pedido', key: 'pedido', width: 14 },
      { header: 'Cliente', key: 'cliente', width: 42 },
      { header: 'Valor', key: 'valor', width: 16, numFmt: '"R$ "#,##0.00' },
      { header: 'Cidade/UF', key: 'cidadeUf', width: 22 },
      { header: 'Representante', key: 'representante', width: 36 },
      { header: 'Observação', key: 'observacao', width: 28 },
    ];

    const rows = toExport.map((o) => ({
      pedido: o.id,
      cliente: buildClientLabel(o),
      valor: o.totalPedidoVenda || 0,
      cidadeUf: o.clientCity && o.clientUF ? `${o.clientCity}-${o.clientUF}` : (o.clientCity || '-'),
      representante: o.representativeName || '-',
      observacao: '',
    }));

    const totalValor = toExport.reduce((acc, o) => acc + (o.totalPedidoVenda || 0), 0);
    const totalRow = { pedido: '', cliente: 'TOTAL', valor: totalValor, cidadeUf: '', representante: '', observacao: '' };

    try {
      const buffer = await createBrandedWorkbook({
        sheetName: 'Pedidos',
        columns,
        rows,
        totalRow,
        subtitleText: 'CONCREM INDUSTRIAL LTDA',
      });
      downloadBuffer(buffer, `planilha-pedidos-${todayStr()}.xlsx`);
    } catch (err: any) {
      showToast(`Erro ao gerar planilha: ${err?.message || 'desconhecido'}`, 'error');
    }
  };

  // ============================================================
  //  Gerar planilha branded (Engenharia ou Diretoria Janderson)
  // ============================================================
  const buildSheetOptions = (type: SheetType, mes: string, perOrderObs: Record<string, string>, orderIds: string[]) => {
    const toExport = filtered.filter((o) => orderIds.includes(o.id));

    if (type === 'engenharia') {
      const columns: BrandedColumn[] = [
        { header: 'Mês de Referência', key: 'mes', width: 24.71 },
        { header: 'Nº Pedido', key: 'pedido', width: 13.29 },
        { header: 'Cliente', key: 'cliente', width: 73.43 },
      ];
      const rows = toExport.map((o) => ({
        mes,
        pedido: o.id,
        cliente: buildClientLabel(o),
      }));
      const totalRow = { mes: '', pedido: 'TOTAL', cliente: `${toExport.length} pedido(s)` };
      return {
        sheetName: 'Engenharia',
        columns,
        rows,
        totalRow,
        logoLayout: 'merged' as const,
        dataRowHeight: 15,
      };
    }

    // Gerência Janderson — larguras exatas, obs individual em vermelho negrito
    const columns: BrandedColumn[] = [
      { header: 'Mês de Referência', key: 'mes', width: 27.14 },
      { header: 'Nº Pedido', key: 'pedido', width: 13.29 },
      { header: 'Cliente', key: 'cliente', width: 60.57 },
      { header: 'Observação', key: 'obs', width: 64.29, dataStyle: { fontColor: 'FFFF0000', bold: true } },
    ];
    const rows = toExport.map((o) => ({
      mes,
      pedido: o.id,
      cliente: buildClientLabel(o),
      obs: perOrderObs[o.id] || '',
    }));
    const totalRow = { mes: '', pedido: 'TOTAL', cliente: `${toExport.length} pedido(s)`, obs: '' };
    return {
      sheetName: 'Gerência Janderson',
      columns,
      rows,
      totalRow,
      logoLayout: 'merged' as const,
      dataRowHeight: 15,
    };
  };

  // ============================================================
  //  AJUSTE 2 — Modal de envio com tipo de planilha
  // ============================================================
  const openEmailModal = () => {
    if (!selected.length) { showToast('Selecione ao menos um pedido para enviar.', 'error'); return; }
    const now = new Date();
    const dateStr = fmtDate(now.toISOString());
    const orderLines = filtered
      .filter((o) => selected.includes(o.id))
      .map((o) =>
        `· ${o.id} — ${o.clientName || '-'} — ${o.representativeName || '-'} — ${
          o.clientCity && o.clientUF ? `${o.clientCity}/${o.clientUF}` : '-'
        } — Validade: ${formatDateBR(o.expiryDate)}`,
      )
      .join('\n');
    const body = `Prezados,\n\nSegue a lista de pedidos aguardando confirmação da gerência:\n\n${orderLines}\n\nEnviado por: ${user?.username || '-'}\nData: ${formatDateTimeBR(now)}`;
    setEmailSubject(`Pedidos Aguardando Confirmação — ${dateStr}`);
    setEmailBody(body);
    setSheetType('engenharia');
    setMesReferencia('');
    setObservacoes({});
    setShowEmailModal(true);
  };

  // --- Enviar e-mail via Resend ---
  const handleSendEmail = async () => {
    const apiKey = import.meta.env.VITE_RESEND_API_KEY as string | undefined;
    if (!apiKey) {
      showToast('Envio de e-mail não configurado. Preencha VITE_RESEND_API_KEY para ativar.', 'error');
      return;
    }
    const toAddresses = emailTo.split(',').map((s) => s.trim()).filter(Boolean);
    if (!toAddresses.length) { showToast('Informe ao menos um e-mail destinatário.', 'error'); return; }
    if (!mesReferencia.trim()) { showToast('Informe o mês de referência.', 'error'); return; }

    setEmailSending(true);
    try {
      const opts = buildSheetOptions(sheetType, mesReferencia.trim(), observacoes, selected);
      const excelBase64 = await createBrandedBase64(opts);
      const filename = sheetType === 'engenharia'
        ? `planilha-engenharia-${sanitizeFilename(mesReferencia)}.xlsx`
        : `planilha-gerencia-janderson-${sanitizeFilename(mesReferencia)}.xlsx`;

      const { Resend } = await import('resend');
      const resend = new Resend(apiKey);
      const htmlBody = emailBody.replace(/\n/g, '<br>');

      const { error } = await resend.emails.send({
        from: 'Comercial Concrem <noreply@concrem.com.br>',
        to: toAddresses,
        subject: emailSubject,
        html: htmlBody,
        attachments: [{ filename, content: excelBase64 }],
      });

      if (error) showToast(`Erro ao enviar: ${(error as any).message}`, 'error');
      else { showToast('E-mail enviado com sucesso!'); setShowEmailModal(false); }
    } catch (err: any) {
      showToast(`Erro ao enviar: ${err?.message || 'desconhecido'}`, 'error');
    } finally {
      setEmailSending(false);
    }
  };

  // --- Download da planilha dentro do modal (sem enviar e-mail) ---
  const handleDownloadFromModal = async () => {
    if (!mesReferencia.trim()) { showToast('Informe o mês de referência.', 'error'); return; }
    if (!selected.length) { showToast('Nenhum pedido selecionado.', 'error'); return; }
    try {
      const opts = buildSheetOptions(sheetType, mesReferencia.trim(), observacoes, selected);
      const buffer = await createBrandedWorkbook(opts);
      const filename = sheetType === 'engenharia'
        ? `planilha-engenharia-${sanitizeFilename(mesReferencia)}.xlsx`
        : `planilha-gerencia-janderson-${sanitizeFilename(mesReferencia)}.xlsx`;
      downloadBuffer(buffer, filename);
    } catch (err: any) {
      showToast(`Erro ao gerar planilha: ${err?.message || 'desconhecido'}`, 'error');
    }
  };

  // ============================================================
  //  JSX
  // ============================================================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/comercial/liberacao')} className="p-2 hover:bg-muted rounded-full transition-colors">
              <ArrowLeft className="h-5 w-5 text-muted-foreground" />
            </button>
            <h1 className="text-2xl font-bold font-display text-foreground">Aguardando Confirmação</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-11">Pedidos aguardando avaliação da gerência</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={openEmailModal} disabled={selected.length === 0} className={btnSecondary}>
            <Mail className="h-4 w-4" />
            Enviar para Gerência
          </button>

          <button className={btnPrimary} disabled={selected.length === 0} onClick={() => void confirmSelected()}>
            <CheckCircle2 className="h-4 w-4" />
            Confirmar Pedidos
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold font-display uppercase tracking-wider text-muted-foreground">
            Pedidos Aguardando Confirmação
          </span>
          {selected.length > 0 && (
            <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              {selected.length} selecionado(s)
            </span>
          )}
        </div>
      </div>

      <QuickFilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder="Buscar pedido, cliente, representante..."
      >
        <FilterTriggerButton count={conditions.length} onClick={() => setFiltersOpen(true)} />
      </QuickFilterBar>

      <ActiveFiltersChips
        fields={filterFields}
        conditions={conditions}
        onRemove={(id) => setConditions((prev) => prev.filter((c) => c.id !== id))}
        onClear={() => setConditions([])}
      />

      {/* Table */}
      <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <ColumnFilterRow columns={colFilterSlots} values={colFilter.values} onChange={colFilter.setFilter} />
              <tr className="border-b border-border bg-muted/30">
                <th className="py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px] text-center w-[56px]">
                  <input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleAll} />
                </th>
                <SortableHeader columnKey="pedido" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">Pedido</SortableHeader>
                <SortableHeader columnKey="cliente" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">Cliente</SortableHeader>
                <SortableHeader columnKey="representante" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">Representante</SortableHeader>
                <SortableHeader columnKey="cidadeUf" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">Cidade / UF</SortableHeader>
                <SortableHeader columnKey="emissao" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">Emissão</SortableHeader>
                <SortableHeader columnKey="validade" sortState={sortState} onToggle={toggleSort} className="text-left py-4 px-6">Validade</SortableHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-muted-foreground italic">Nenhum pedido aguardando confirmação.</td></tr>
              ) : (
                filtered.map((o) => (
                  <tr key={o.id} className={`hover:bg-muted/20 transition-colors ${selected.includes(o.id) ? 'bg-primary/5' : ''}`}>
                    <td className="py-4 px-6 text-center">
                      <input type="checkbox" checked={selected.includes(o.id)}
                        onChange={() => setSelected((prev) => prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id])} />
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

      {/* ====== Email Modal ====== */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
            {/* Modal header */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-bold font-display text-foreground">Enviar para Gerência</h2>
              <button onClick={() => setShowEmailModal(false)} className="p-2 hover:bg-muted rounded-full transition-colors">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {!import.meta.env.VITE_RESEND_API_KEY && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                  <strong>Envio não configurado.</strong> Preencha a variável{' '}
                  <code className="font-mono bg-amber-100 px-1 rounded">VITE_RESEND_API_KEY</code>{' '}
                  no arquivo <code className="font-mono bg-amber-100 px-1 rounded">.env</code> para
                  ativar o envio de e-mails.
                </div>
              )}

              {/* 1. Para */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Para (separar por vírgula)</label>
                <input className={inputClass} type="text" placeholder="diretor@empresa.com, outro@empresa.com"
                  value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
              </div>

              {/* 2. Assunto */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Assunto</label>
                <input className={inputClass} type="text" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
              </div>

              {/* 3. Mensagem */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Mensagem</label>
                <textarea className={`${inputClass} min-h-[140px] resize-y`} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} />
              </div>

              {/* 4. Tipo de planilha */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tipo de planilha *</label>
                <select className={inputClass} value={sheetType} onChange={(e) => setSheetType(e.target.value as SheetType)}>
                  <option value="engenharia">Engenharia</option>
                  <option value="diretoria">Gerência Janderson</option>
                </select>
              </div>

              {/* 5. Mês de Referência */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Mês de Referência *</label>
                <input className={inputClass} type="text" placeholder="Ex: Março 2026"
                  value={mesReferencia} onChange={(e) => setMesReferencia(e.target.value)} />
              </div>

              {/* 6. Observações por pedido — apenas para Diretoria Janderson */}
              {sheetType === 'diretoria' && (
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Observações por pedido
                  </label>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="py-2 px-3 text-left text-[11px] font-display font-bold text-muted-foreground uppercase tracking-wider w-[100px]">Nº Pedido</th>
                          <th className="py-2 px-3 text-left text-[11px] font-display font-bold text-muted-foreground uppercase tracking-wider">Cliente</th>
                          <th className="py-2 px-3 text-left text-[11px] font-display font-bold text-muted-foreground uppercase tracking-wider w-[240px]">Observação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {filtered.filter((o) => selected.includes(o.id)).map((o) => (
                          <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                            <td className="py-2 px-3 font-mono-data font-bold text-primary text-xs">{o.id}</td>
                            <td className="py-2 px-3 text-xs text-foreground truncate max-w-[200px]">{buildClientLabel(o)}</td>
                            <td className="py-1 px-2">
                              <input
                                className={`${inputClass} !py-1 !text-xs`}
                                type="text"
                                placeholder="Observação..."
                                value={observacoes[o.id] || ''}
                                onChange={(e) => setObservacoes((prev) => ({ ...prev, [o.id]: e.target.value }))}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-4 py-3">
                <Download className="h-4 w-4 shrink-0" />
                <span>
                  Planilha <strong>{sheetType === 'engenharia' ? 'Engenharia' : 'Gerência Janderson'}</strong> com{' '}
                  {selected.length} pedido(s) será enviada como anexo.
                </span>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between p-6 border-t border-border">
              <button onClick={() => void handleDownloadFromModal()} className={btnSecondary}>
                <Download className="h-4 w-4" />
                Baixar Planilha
              </button>
              <div className="flex items-center gap-3">
                <button onClick={() => setShowEmailModal(false)} className={btnSecondary}>Cancelar</button>
                <button onClick={() => void handleSendEmail()} disabled={emailSending} className={btnPrimary}>
                  {emailSending ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <FilterConfiguratorDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        fields={filterFields}
        value={conditions}
        onApply={setConditions}
      />
    </div>
  );
};

export default ComercialConfirmacao;
