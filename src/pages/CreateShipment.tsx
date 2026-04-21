import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useApp, getDataCorte } from '@/contexts/AppContext';
import { tableColumns } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import { Order } from '@/types';
import { supabasePedidos, supabaseOps } from '@/lib/supabase';
import { rowToOrder } from '@/lib/pedidoMapper';
import {
  FormField,
  inputClass,
  btnPrimary,
  btnDanger,
  formatCurrency,
  getOrderTotal
} from '@/components/shared';
import { ArrowLeft, Check, Search, Truck, Package, Info, Save, MoreVertical, FileText, Upload, Eye, Trash, FileCheck, ArrowUp, ArrowDown, ChevronRight, ChevronLeft, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { findRepresentanteContato, insertNotificacaoRepresentante, upsertEntregasDetalhesSafe, upsertRelatorioEntregaAnexo, listRelatorioEntregaAnexos, listEntregas, upsertRelatorioEntregaNotificacao, listRelatorioEntregaNotificacoes, type RelatorioEntregaNotificacao } from '@/lib/opsRepo';
import { setPedidoStatusWithOptionalNotify, syncEntregaStatusFromOps, listPedidosStatusByPedidoIds, updatePedidoStatus, normalizePhoneToE164, isLeroy } from '@/lib/pedidosStatusRepo';

import { usePrioridades } from '@/contexts/PrioridadesContext';
import { PrioridadeIcon, PrioridadeDot } from '@/components/pedidos/PrioridadeBadge';
import { todayBR, fmtDate, currentHourBR } from '@/lib/dateUtils';
import { sendEvolutionText, sendEvolutionMedia } from '@/lib/evolutionApi';
import type { FilterCondition, FilterField } from '@/lib/filters';
import { FilterConfiguratorDialog } from '@/components/filters/FilterConfiguratorDialog';
import { FilterTriggerButton } from '@/components/filters/FilterTriggerButton';
import { ActiveFiltersChips } from '@/components/filters/ActiveFiltersChips';
import { useTableSort } from '@/hooks/useTableSort';
import { useQuickFilter } from '@/hooks/useQuickFilter';
import { QuickFilterBar } from '@/components/table/QuickFilterBar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CreateShipment = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const { drivers, orders, supportOrders, loads, invoices, addLoad, updateLoad, deleteLoad, clients, user } = useApp();
  const { showToast } = useToast();

  const { map: prioMap } = usePrioridades();
  const isEditing = Boolean(id);
  const [driverId, setDriverId] = useState('');
  type ShipmentStatus = 'Aguardando Despacho' | 'Despachado' | 'Em Rota' | 'Entregue' | 'Cancelado';
  const [shipmentStatus, setShipmentStatus] = useState<ShipmentStatus>('Aguardando Despacho');
  const [freightValue, setFreightValue] = useState(0);
  const [freightManual, setFreightManual] = useState(false);
  const [freightRaw, setFreightRaw] = useState('');
  const [shipmentDate, setShipmentStatusDate] = useState(todayBR());
  const [previsaoEntregaDate, setPrevisaoEntregaDate] = useState(todayBR());
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [deliveredOrderIds, setDeliveredOrderIds] = useState<string[]>([]);

  type PendingAttachment = { url: string; nome: string; saved: boolean };
  type OrderAttachments = { boletos: PendingAttachment[]; nf?: PendingAttachment; comprovantes: PendingAttachment[] };
  type AttachmentType = 'boleto' | 'nf' | 'comprovante';
  const boletoTipo = (idx: number): string => idx === 0 ? 'boleto' : `boleto_${idx + 1}`;
  const isBoletoTipo = (tipo: string): boolean => tipo === 'boleto' || /^boleto_\d+$/.test(tipo);
  const comprovanteTipo = (idx: number): string => idx === 0 ? 'comprovante' : `comprovante_${idx + 1}`;
  const isComprovanteTipo = (tipo: string): boolean => tipo === 'comprovante' || /^comprovante_\d+$/.test(tipo);
  const [orderAttachments, setOrderAttachments] = useState<Record<string, OrderAttachments>>({});

  // --- Modal de envio WhatsApp ---
  type RepSendItem = {
    repKey: string;
    repName: string;
    repPhone: string;
    orders: Order[];
    previsao: string;       // data de previsão para esse rep (yyyy-mm-dd)
    checked: boolean;       // selecionado para envio
    notificacao?: RelatorioEntregaNotificacao; // se já foi notificado antes
  };
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendModalItems, setSendModalItems] = useState<RepSendItem[]>([]);
  const [sending, setSending] = useState(false);
  const [notificacoes, setNotificacoes] = useState<RelatorioEntregaNotificacao[]>([]);

  const [reportPage, setReportPage] = useState(0);
  const [filters, setFilters] = useState({
    id: '',
    client: '',
    representative: '',
    city: '',
    expiry: ''
  });

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [conditions, setConditions] = useState<FilterCondition[]>([]);

  const { sortState, toggleSort, sortItems } = useTableSort();
  const { query: quickQuery, setQuery: setQuickQuery, filterItems: quickFilterItems } = useQuickFilter<Order>();

  const quickTextGetters: Array<(item: Order) => unknown> = useMemo(() => [
    (o: Order) => o.id,
    (o: Order) => o.representativeName || '',
    (o: Order) => o.representativePhone || '',
    (o: Order) => o.clientName || '',
    (o: Order) => o.clientCode || '',
    (o: Order) => {
      const client = clients.find((c) => c.id === o.clientId);
      return `${o.clientCity || client?.address.city || ''} ${o.clientUF || client?.address.state || ''}`;
    },
    (o: Order) => o.previsaoCarregamento || o.expiryDate || '',
  ], [clients]);

  const sortGetters: Record<string, (item: Order) => unknown> = useMemo(() => ({
    id: (o: Order) => o.id,
    representative: (o: Order) => o.representativeName || '',
    phone: (o: Order) => o.representativePhone || '',
    city: (o: Order) => {
      const client = clients.find((c) => c.id === o.clientId);
      return `${o.clientCity || client?.address.city || ''}/${o.clientUF || client?.address.state || ''}`;
    },
    expiry: (o: Order) => o.previsaoCarregamento || o.expiryDate || '',
    value: (o: Order) => o.totalPedidoVenda || getOrderTotal(o),
  }), [clients]);

  const filterFields = useMemo(() => {
    return [
      { id: 'id', label: 'Filtrar Nº', type: 'text', getValue: (o: Order) => o.id, placeholder: 'Ex: PED-001' },
      {
        id: 'client',
        label: 'Filtrar Representante (nome)',
        type: 'text',
        getValue: (o: Order) => o.representativeName || '',
        placeholder: 'Nome do representante...',
      },
      {
        id: 'representative',
        label: 'Filtrar Repres. (telefone)',
        type: 'text',
        getValue: (o: Order) => o.representativePhone || '',
        placeholder: 'Telefone do representante...',
      },
      {
        id: 'city',
        label: 'Filtrar Cidade/UF',
        type: 'text',
        getValue: (o: Order) => {
          const client = clients.find((c) => c.id === o.clientId);
          return `${o.clientCity || client?.address.city || ''}/${o.clientUF || client?.address.state || ''}`;
        },
        placeholder: 'Cidade ou Estado...',
      },
      {
        id: 'expiry',
        label: 'Filtrar Previsão',
        type: 'text',
        getValue: (o: Order) => o.previsaoCarregamento || o.expiryDate || '',
        placeholder: 'Data...',
      },
    ] satisfies Array<FilterField<Order>>;
  }, [clients]);

  useEffect(() => {
    const byField = new Map<string, FilterCondition>();
    for (const c of conditions) byField.set(c.fieldId, c);
    setFilters({
      id: byField.get('id')?.value ?? '',
      client: byField.get('client')?.value ?? '',
      representative: byField.get('representative')?.value ?? '',
      city: byField.get('city')?.value ?? '',
      expiry: byField.get('expiry')?.value ?? '',
    });
  }, [conditions]);

  // Carregar dados se estiver em modo de edição ou se vier um pedido pré-selecionado
  useEffect(() => {
    if (isEditing && id) {
      const loadToEdit = loads.find(l => l.id === id);
      if (loadToEdit) {
        setDriverId(loadToEdit.driverId);
        setShipmentStatus(loadToEdit.shipmentStatus);
        setSelectedOrderIds(loadToEdit.orderIds);
        const storedFreight = loadToEdit.freightValue ?? 0;
        setFreightValue(storedFreight);
        setFreightRaw(storedFreight > 0 ? storedFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
        // Only lock manual if there's an actual stored freight value;
        // otherwise let auto-calc fill it from the orders
        setFreightManual(storedFreight > 0);
        setShipmentStatusDate(loadToEdit.plannedDate || todayBR());
        setPrevisaoEntregaDate(loadToEdit.previsaoEntrega || todayBR());
      } else {
        showToast('Carregamento não encontrado.', 'error');
        navigate('/carregamento');
      }
    } else if (location.state?.preselectedOrderId) {
      const orderId = location.state.preselectedOrderId;
      if (!selectedOrderIds.includes(orderId)) {
        setSelectedOrderIds([orderId]);
      }
    }
  }, [isEditing, id, loads, navigate, showToast, location.state]);

  // Carregar dados do relatório de entrega (ordem, NF, entregues, kits, pallets, volumes)
  useEffect(() => {
    if (!id) return;
    void listEntregas(id).then((rows) => {
      const seq: Record<string, number> = {};
      const nf: Record<string, string> = {};
      const delivered: string[] = [];
      const kits: Record<string, number> = {};
      const pallets: Record<string, number> = {};
      const volumes: Record<string, string> = {};
      for (const row of rows) {
        if (row.ordem_entrega != null) seq[row.pedido_id] = row.ordem_entrega;
        if (row.numero_nota) nf[row.pedido_id] = row.numero_nota;
        if (row.status === 'entregue') delivered.push(row.pedido_id);
        if (row.qtd_kits != null) kits[row.pedido_id] = row.qtd_kits;
        if (row.qtd_pallets != null) pallets[row.pedido_id] = row.qtd_pallets;
        if (row.qtd_volumes != null) volumes[row.pedido_id] = String(row.qtd_volumes);
      }
      setOrderSequence(seq);
      setInvoiceNumbers(nf);
      setDeliveredOrderIds(delivered);
      setQtdKits(kits);
      setQtdPallets(pallets);
      // Merge: preserva valores que o usuário já digitou antes do fetch terminar
      setQtdVolumes(prev => {
        const next = { ...volumes };
        for (const [k, v] of Object.entries(prev)) {
          if (v !== '' && v !== undefined) next[k] = v;
        }
        return next;
      });
    });
  }, [id]);

  // Carregar anexos salvos ao editar um carregamento existente
  useEffect(() => {
    if (!id) return;
    void listRelatorioEntregaAnexos(id).then((rows) => {
      const grouped: Record<string, OrderAttachments> = {};
      for (const row of rows) {
        if (!grouped[row.pedido_id]) grouped[row.pedido_id] = { boletos: [], comprovantes: [] };
        const att: PendingAttachment = { url: row.arquivo_url, nome: row.arquivo_nome, saved: true };
        if (isBoletoTipo(row.tipo)) {
          grouped[row.pedido_id].boletos.push(att);
        } else if (row.tipo === 'nf') {
          grouped[row.pedido_id].nf = att;
        } else if (isComprovanteTipo(row.tipo)) {
          grouped[row.pedido_id].comprovantes.push(att);
        }
      }
      setOrderAttachments(grouped);
    });
    void listRelatorioEntregaNotificacoes(id).then(setNotificacoes);
  }, [id]);

  // --- Pedidos disponíveis para carregamento (query direta, sem filtro de id_nota_conf) ---
  const CARREGAMENTO_ALLOWED_STATUSES: import('@/types').PedidoStatusValue[] = [
    'liberado_producao',
    'aguardando_mapeamento',
    'mapeamento_andamento',
    'mapeamento_concluido',
    'aguardando_ferragem',
    'ferragem_recebida',
    'em_producao',
    'producao_finalizada',
    'faturado',
    'em_entrega',
    'entregue',
  ];

  const [directPedidos, setDirectPedidos] = useState<Order[]>([]);
  const [editExtraOrders, setEditExtraOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (freightManual) return;
    const totalFreight = selectedOrderIds.reduce((acc, orderId) => {
      const order = orders.find(o => o.id === orderId)
        ?? (supportOrders as unknown as Order[]).find(o => o.id === orderId)
        ?? directPedidos.find(o => o.id === orderId);
      return acc + (order?.freightValue || 0);
    }, 0);
    const rounded = Math.round(totalFreight * 100) / 100;
    setFreightValue(rounded);
    setFreightRaw(rounded > 0 ? String(rounded).replace('.', ',') : '');
  }, [freightManual, selectedOrderIds, orders, supportOrders, directPedidos]);

  const selectedDriver = drivers.find(d => d.id === driverId);
  const [pedidoStatusRows, setPedidoStatusRows] = useState<import('@/types').PedidoStatusRow[]>([]);
  // Chave = numero_pedido (identificador ERP) para casar com o.id vindo do mapper.
  // Fallback para pedido_id caso numero_pedido esteja vazio.
  const pedidoStatusMap = useMemo(
    () => new Map(pedidoStatusRows.map(r => [String(r.numero_pedido || r.pedido_id || '').trim(), r] as const)),
    [pedidoStatusRows],
  );

  useEffect(() => {
    if (!supabasePedidos || !supabaseOps) return;
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';

    const STATUS_CS_COLS = 'id, pedido_id, numero_pedido, status_atual, atualizado_em';

    const normId = (v: unknown) => String(v ?? '').trim();

    const load = async () => {
      // Sem limit: liberado_producao tem 12k+ linhas, qualquer limit corta pedidos válidos.
      const { data: statusData, error: statusErr } = await supabaseOps!
        .from('concrem_pedidos_status')
        .select(STATUS_CS_COLS)
        .in('status_atual', CARREGAMENTO_ALLOWED_STATUSES)
        .order('atualizado_em', { ascending: false });

      if (statusErr) { console.error('[CreateShipment] status load error:', statusErr.message); return; }
      const statusRows = statusData || [];

      if (!statusRows.length) return;

      setPedidoStatusRows(statusRows as any);

      // Usa numero_pedido (identificador ERP) para o batch; fallback para pedido_id.
      const ids = statusRows.map((r: any) => normId(r.numero_pedido || r.pedido_id)).filter(Boolean);

      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));

      const results = await Promise.all(
        chunks.map((batch, i) =>
          supabasePedidos!.from(table).select(tableColumns).in('numero_pedido', batch)
            .then(({ data, error }) => {
              if (error) console.error(`[CreateShipment] ERP batch[${i}] error:`, error.message);
              return (data || []) as any[];
            })
        )
      );
      const allPedidos = results.flat();

      const mapped = allPedidos.map((row: any) => rowToOrder(row, 'CLI-001'));
      setDirectPedidos(mapped);
    };
    void load();
  }, []);

  // Also keep context orders' status tracked for editing existing carregamentos
  useEffect(() => {
    const ids = [...orders.map(o => o.id), ...supportOrders.map(o => o.id)];
    if (!ids.length) return;
    void listPedidosStatusByPedidoIds(ids).then(rows =>
      setPedidoStatusRows(prev => {
        const map = new Map(prev.map(r => [r.pedido_id, r] as const));
        for (const r of rows) map.set(r.pedido_id, r);
        return Array.from(map.values());
      })
    );
  }, [orders.length, supportOrders.length]);

  // Em modo de edição, busca do ERP os pedidos do carregamento que não estão em nenhuma fonte local.
  // Sem filtro de data — o carregamento salvo é a fonte de verdade.
  useEffect(() => {
    if (!isEditing || !supabasePedidos || !selectedOrderIds.length) return;
    const knownIds = new Set([
      ...directPedidos.map(o => o.id),
      ...orders.map(o => o.id),
      ...(supportOrders as unknown as Order[]).map(o => o.id),
    ]);
    const missingIds = selectedOrderIds.filter(id => !knownIds.has(id));
    if (!missingIds.length) return;
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
    void supabasePedidos.from(table).select(tableColumns)
      .in('numero_pedido', missingIds)
      .then(({ data, error }) => {
        if (error) console.error('[CreateShipment] editExtraOrders fetch error:', error.message);
        if (data?.length) setEditExtraOrders(data.map((row: any) => rowToOrder(row, 'CLI-001')));
      });
  }, [isEditing, selectedOrderIds, directPedidos, orders, supportOrders]);

  // Merge: editExtraOrders (fallback edição) + directPedidos + context orders, sem duplicatas
  const allCandidates = useMemo(() => {
    const map = new Map<string, Order>();
    for (const o of editExtraOrders) map.set(o.id, o);
    for (const o of directPedidos) map.set(o.id, o);
    for (const o of orders) if (!map.has(o.id)) map.set(o.id, o);
    for (const o of supportOrders as unknown as Order[]) if (!map.has(o.id)) map.set(o.id, o);
    return Array.from(map.values());
  }, [editExtraOrders, directPedidos, orders, supportOrders]);

  // Pré-preencher qtdKits com valores do pedido quando não há valor salvo
  useEffect(() => {
    if (selectedOrderIds.length === 0) return;
    setQtdKits(prev => {
      const next = { ...prev };
      for (const oid of selectedOrderIds) {
        if (next[oid] !== undefined && next[oid] !== '') continue;
        const order = allCandidates.find(o => o.id === oid);
        if (order?.totalQtd != null) next[oid] = String(order.totalQtd);
      }
      return next;
    });
  }, [selectedOrderIds, allCandidates]);

  // IDs de pedidos que já estão em outro carregamento (não o que está sendo editado)
  const idsInOtherLoads = useMemo(() => {
    const set = new Set<string>();
    for (const l of loads) {
      if (isEditing && l.id === id) continue;
      for (const oid of l.orderIds) set.add(oid);
    }
    return set;
  }, [loads, isEditing, id]);

  const clientsById = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);

  const allCandidatesById = useMemo(
    () => new Map(allCandidates.map(o => [o.id, o])),
    [allCandidates]
  );

  const orderIdToInvoice = useMemo(() => {
    const map = new Map<string, typeof invoices[0]>();
    for (const inv of invoices)
      for (const oid of inv.orderIds) map.set(oid, inv);
    return map;
  }, [invoices]);

  const availableOrders = useMemo(() => {
    const result = allCandidates.filter(o => {
      const pedidoStatus = pedidoStatusMap.get(o.id)?.status_atual;
      const isAllowedStatus = pedidoStatus
        ? CARREGAMENTO_ALLOWED_STATUSES.includes(pedidoStatus) && !idsInOtherLoads.has(o.id)
        : false;
      const isCurrentInEdit = isEditing && selectedOrderIds.includes(o.id);

      if (!(isAllowedStatus || isCurrentInEdit) || selectedOrderIds.includes(o.id)) return false;

      // Pedidos da Leroy Merlin anteriores a 2026 são ignorados (massa de dados históricos estale).
      if (
        (o.clientName || '').toUpperCase().includes('LEROY MERLIN') &&
        o.date < '2026-01-01'
      ) return false;

      const client = clientsById.get(o.clientId);
      const cityState = `${o.clientCity || client?.address.city || ''}/${o.clientUF || client?.address.state || ''}`;

      const matchesId = o.id.toLowerCase().includes(filters.id.toLowerCase());
      const matchesClient = (o.representativeName || '').toLowerCase().includes(filters.client.toLowerCase());
      const matchesRep = (o.representativePhone || '').toLowerCase().includes(filters.representative.toLowerCase());
      const matchesCity = cityState.toLowerCase().includes(filters.city.toLowerCase());
      const matchesExpiry = (o.previsaoCarregamento || o.expiryDate || '').toLowerCase().includes(filters.expiry.toLowerCase());

      return matchesId && matchesClient && matchesRep && matchesCity && matchesExpiry;
    });
    return result;
  }, [allCandidates, pedidoStatusMap, idsInOtherLoads, isEditing, selectedOrderIds, filters, clientsById]);

  const displayedOrders = useMemo(() => {
    const afterQuick = quickFilterItems(availableOrders, quickTextGetters);
    return sortItems(afterQuick, sortGetters);
  }, [availableOrders, quickFilterItems, quickTextGetters, sortItems, sortGetters]);

  const toggleOrder = (orderId: string) => {
    setSelectedOrderIds(prev =>
      prev.includes(orderId) ? prev.filter(oid => oid !== orderId) : [...prev, orderId]
    );
  };

  const selectOrder = (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    toggleOrder(orderId);
  };

  const moveOrder = (index: number, direction: 'up' | 'down') => {
    const newOrderIds = [...selectedOrderIds];
    if (direction === 'up' && index > 0) {
      const temp = newOrderIds[index];
      newOrderIds[index] = newOrderIds[index - 1];
      newOrderIds[index - 1] = temp;
    } else if (direction === 'down' && index < newOrderIds.length - 1) {
      const temp = newOrderIds[index];
      newOrderIds[index] = newOrderIds[index + 1];
      newOrderIds[index + 1] = temp;
    }
    setSelectedOrderIds(newOrderIds);
  };

  const toggleDelivered = (orderId: string) => {
    setDeliveredOrderIds(prev => 
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const removeOrder = (orderId: string) => {
    setSelectedOrderIds(prev => prev.filter(id => id !== orderId));
    setDeliveredOrderIds(prev => prev.filter(id => id !== orderId));
    setOrderAttachments((prev) => {
      const { [orderId]: _, ...rest } = prev;
      return rest;
    });
  };

  const handleGenerateFormulario = async (orderId: string) => {
    const order = allCandidates.find((o) => o.id === orderId);
    if (!order) return;

    const driver = drivers.find((d) => d.id === driverId);
    const client = clients.find((c) => c.id === order.clientId);

    const repId = String(order.representativeId || '').trim();
    const repName = String(order.representativeName || '').trim();
    const repContact = repContacts[repId] || repContacts[repName];

    let repAddress: any = null;
    if (repContact?.endereco) {
      try { repAddress = JSON.parse(repContact.endereco); } catch { repAddress = null; }
    }

    const driverName = driver?.name || '-';
    const driverCpf = driver?.cpf || '-';
    const driverPhone = driver?.phone || '-';
    const driverPlate = driver?.plate || '-';
    const representanteName = repContact?.nome || order.representativeName || '-';
    const representantePhone = repContact?.telefone || order.representativePhone || '-';

    const numeroPedido = order.id || '-';
    const nfNumber = invoiceNumbers[orderId] || '';

    const cidadeUfRaw = (order.clientCity && order.clientUF)
      ? `${order.clientCity} - ${order.clientUF}`
      : repAddress
        ? `${repAddress.city || ''} - ${repAddress.state || ''}`
        : client
          ? `${client.address.city || ''} - ${client.address.state || ''}`
          : '-';

    const enderecoRaw = order.clientEndereco
      ? `${order.clientEndereco}${order.clientBairro ? ' - ' + order.clientBairro : ''}${order.clientCep ? ' - CEP: ' + order.clientCep : ''}`
      : repAddress
        ? `${repAddress.street || ''}, ${repAddress.number || ''}${repAddress.neighborhood ? ' - ' + repAddress.neighborhood : ''}`
        : client
          ? `${client.address.street || ''}, ${client.address.number || ''}${client.address.neighborhood ? ' - ' + client.address.neighborhood : ''}`
          : '-';

    const empresaLabel = order.clientCode
      ? `${order.clientCode} - ${order.clientName || client?.name || '-'}`
      : (order.clientName || client?.name || '-');
    const cnpj = client?.cpfCnpj || '-';

    const kits = qtdKits[orderId] || '0';
    const pallets = qtdPallets[orderId] || '0';
    const volumes = qtdVolumes[orderId] || '0';

    const logoBase64 = await fetch('/logo-nova-tagline.png')
      .then(r => r.blob())
      .then(b => new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(b);
      }))
      .catch(() => '');

    const logoTag = logoBase64
      ? `<img src="${logoBase64}" />`
      : `<span style="font-weight:900;font-size:20px;letter-spacing:2px;">CONCREM</span>`;

    const dateStr = fmtDate(new Date().toISOString());

    const formHtml = `
<style>
  @page { size: A4 portrait; margin: 12mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #000; background: #fff; }
  .page { width: 100%; }

  /* HEADER */
  table.hdr { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 4px; }
  table.hdr td { vertical-align: middle; }
  .hdr-logo { width: 130px; border-right: 1px solid #000; padding: 6px 8px; text-align: center; }
  .hdr-logo img { width: 110px; height: auto; display: block; margin: 0 auto; }
  .hdr-title { text-align: center; padding: 6px 10px; border-right: 1px solid #000; }
  .hdr-title .t1 { font-weight: 900; font-size: 11pt; text-transform: uppercase; letter-spacing: .3px; }
  .hdr-title .t2 { font-size: 9pt; font-weight: 700; margin-top: 2px; }
  .hdr-date { width: 95px; text-align: center; padding: 6px 6px; }
  .hdr-date .dlbl { font-size: 7pt; font-weight: 700; text-transform: uppercase; color: #333; }
  .hdr-date .dv { font-size: 10pt; font-weight: 900; margin-top: 2px; }

  /* MANDATORY */
  .mandatory { text-align: center; font-weight: 900; font-size: 10pt; padding: 4px 0 5px; }

  /* SECTION */
  table.sec { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 4px; }
  table.sec td { padding: 0 6px; font-size: 9pt; border: 1px solid #000; vertical-align: middle; height: 22px; }
  td.sec-hdr { font-weight: 900; font-size: 9pt; text-transform: uppercase; background: #fff; border-bottom: 1px solid #000; padding: 3px 6px; height: auto; vertical-align: middle; }
  .lbl { font-weight: 400; }
  .val { font-weight: 700; }

  /* QTY */
  table.qty { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 4px; }
  table.qty td { padding: 0 6px; height: 22px; border: 1px solid #000; font-size: 9pt; vertical-align: middle; }
  .qlbl { font-weight: 700; }
  .qval { font-weight: 700; }

  /* CONDITIONS */
  table.cond { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 4px; }
  table.cond td { padding: 5px 6px; font-size: 9pt; }
  .cond-title { font-weight: 900; text-transform: uppercase; margin-bottom: 3px; }
  .cond-line { line-height: 1.6; }
  .cond-notice { font-weight: 900; margin-top: 4px; }

  /* OBS */
  table.obs { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 4px; }
  table.obs td { padding: 4px 6px; font-size: 9pt; }
  .obs-title { font-weight: 900; text-transform: uppercase; margin-bottom: 3px; }
  .obs-box { height: 50px; margin-top: 3px; }

  /* DECLARATION */
  table.decl { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 0; }
  table.decl td { padding: 5px 6px; font-size: 8.5pt; line-height: 1.55; text-align: justify; }

  /* SIGNATURES */
  .sigs { display: flex; gap: 80px; padding: 14px 60px 4px; }
  .sig { flex: 1; text-align: center; }
  .sig .line { border-top: 1px solid #000; padding-top: 3px; font-size: 9pt; font-weight: 400; margin-top: 18px; }

  /* FOOTER */
  table.ftr { width: 100%; border-collapse: collapse; border: 1px solid #000; border-top: none; }
  table.ftr td { padding: 5px 6px; font-size: 8.5pt; }
  .ftr-line { font-weight: 700; display: block; line-height: 1.5; }
  .ftr-contact { text-align: center; font-size: 8pt; margin-top: 5px; padding-top: 4px; border-top: 1px solid #ccc; }
</style>

<div class="page">

  <!-- HEADER -->
  <table class="hdr">
    <tr>
      <td class="hdr-logo">${logoTag}</td>
      <td class="hdr-title">
        <div class="t1">Formulário de Recebimento de Produtos</div>
        <div class="t2">CONCREM INDUSTRIAL LTDA</div>
      </td>
      <td class="hdr-date">
        <div class="dlbl">Data</div>
        <div class="dv">${dateStr}</div>
      </td>
    </tr>
  </table>

  <!-- MANDATORY -->
  <div class="mandatory">*****Preenchimento obrigatório!*****</div>

  <!-- DADOS DO MOTORISTA -->
  <table class="sec">
    <tr><td colspan="2" class="sec-hdr">Dados do Motorista</td></tr>
    <tr height="22">
      <td width="60%" height="22" valign="middle" style="width:60%;height:22px;padding:0 6px;vertical-align:middle;"><span class="lbl">Nome: </span><span class="val">${driverName}</span></td>
      <td width="40%" height="22" valign="middle" style="width:40%;height:22px;padding:0 6px;vertical-align:middle;"><span class="lbl">CPF: </span><span class="val">${driverCpf}</span></td>
    </tr>
    <tr height="22">
      <td height="22" valign="middle" style="height:22px;padding:0 6px;vertical-align:middle;"><span class="lbl">Placas: </span><span class="val">${driverPlate}</span></td>
      <td height="22" valign="middle" style="height:22px;padding:0 6px;vertical-align:middle;"><span class="lbl">Cel: </span><span class="val">${driverPhone}</span></td>
    </tr>
    <tr height="22">
      <td height="22" valign="middle" style="height:22px;padding:0 6px;vertical-align:middle;"><span class="lbl">Representante Comercial Concrem: </span><span class="val">${representanteName}</span></td>
      <td height="22" valign="middle" style="height:22px;padding:0 6px;vertical-align:middle;"><span class="lbl">Cel: </span><span class="val">${representantePhone}</span></td>
    </tr>
  </table>

  <!-- DADOS DA ENTREGA -->
  <table class="sec">
    <tr><td colspan="2" class="sec-hdr">Dados da Entrega</td></tr>
    <tr height="22">
      <td width="50%" height="22" valign="middle" style="width:50%;height:22px;padding:0 6px;vertical-align:middle;"><span class="lbl">Nº do Pedido: </span><span class="val">${numeroPedido}</span></td>
      <td height="22" valign="middle" style="height:22px;padding:0 6px;vertical-align:middle;"><span class="lbl">Nº da nota fiscal: </span><span class="val">${nfNumber}</span></td>
    </tr>
    <tr height="22">
      <td colspan="2" height="22" valign="middle" style="height:22px;padding:0 6px;vertical-align:middle;"><span class="lbl">Endereço de entrega: </span><span class="val">${enderecoRaw}</span></td>
    </tr>
    <tr height="22">
      <td colspan="2" height="22" valign="middle" style="height:22px;padding:0 6px;vertical-align:middle;"><span class="lbl">Cidade/UF: </span><span class="val">${cidadeUfRaw}</span></td>
    </tr>
  </table>

  <!-- DADOS DO CLIENTE -->
  <table class="sec">
    <tr><td colspan="2" class="sec-hdr">Dados do Cliente</td></tr>
    <tr height="22">
      <td width="60%" height="22" valign="middle" style="width:60%;height:22px;padding:0 6px;vertical-align:middle;"><span class="lbl">Empresa: </span><span class="val">${empresaLabel}</span></td>
      <td height="22" valign="middle" style="height:22px;padding:0 6px;vertical-align:middle;"><span class="lbl">CNPJ: </span><span class="val">${cnpj}</span></td>
    </tr>
    <tr height="22">
      <td colspan="2" height="22" valign="middle" style="height:22px;padding:0 6px;vertical-align:middle;"><span class="lbl">Responsável pelo Recebimento: </span></td>
    </tr>
    <tr height="22">
      <td height="22" valign="middle" style="height:22px;padding:0 6px;vertical-align:middle;"><span class="lbl">Cargo: </span></td>
      <td height="22" valign="middle" style="height:22px;padding:0 6px;vertical-align:middle;"><span class="lbl">CPF: </span></td>
    </tr>
    <tr height="22">
      <td colspan="2" height="22" valign="middle" style="height:22px;padding:0 6px;vertical-align:middle;"><span class="lbl">Data do recebimento: </span></td>
    </tr>
  </table>

  <!-- KITS / PALLETS / VOLUMES -->
  <table class="qty">
    <tr height="22">
      <td height="22" valign="middle" style="height:22px;padding:0 6px;vertical-align:middle;"><span class="qlbl">KITS:</span><span class="qval">${kits}</span></td>
      <td height="22" valign="middle" style="height:22px;padding:0 6px;vertical-align:middle;"><span class="qlbl">PALLETS: </span><span class="qval">${pallets}</span></td>
      <td height="22" valign="middle" style="height:22px;padding:0 6px;vertical-align:middle;"><span class="qlbl">VOLUMES: </span><span class="qval">${volumes}</span></td>
    </tr>
  </table>

  <!-- CONDITIONS -->
  <table class="cond">
    <tr><td>
      <div class="cond-title">Condições de Recebimento dos Produtos</div>
      <div class="cond-line">1. Os produtos recebidos estão de acordo com o pedido? ( ) Sim &nbsp; ( ) Não</div>
      <div class="cond-line">2. As embalagens/produtos/pallets chegaram em perfeito estado? ( ) Sim &nbsp; ( ) Não</div>
      <div class="cond-line">3. As quantidades recebidas estão de acordo com o pedido? ( ) Sim &nbsp; ( ) Não</div>
      <div class="cond-line">4. As quantidades de ferragens estão de acordo com o combinado? ( ) Sim &nbsp; ( ) Não &nbsp; ( ) N/A</div>
      <div class="cond-line">5. Todos os produtos recebidos foram conferidos corretamente na hora do desembarque? ( ) Sim &nbsp; ( ) Não</div>
      <div class="cond-notice">O não preenchimento deste formulário atesta o recebimento dos itens conforme o pedido/nota fiscal.</div>
    </td></tr>
  </table>

  <!-- OBS -->
  <table class="obs">
    <tr><td>
      <div class="obs-title">Observações do Cliente</div>
      <div class="obs-box"></div>
    </td></tr>
  </table>

  <!-- DECLARATION -->
  <table class="decl">
    <tr><td>
      EU, motorista citado a cima, declaro estar ciente de que OS PRODUTOS DA EMPRESA CONCREM INDUSTRIAL LTDA, estão de acordo com o pedido, todos embalados e etiquetados com suas devidas orientações e em perfeitas condições, estou ciente e orientado de como devo proceder no desembarque dos mesmos, para evitar danos aos produtos, sendo assim, comprometo-me pela entrega até o endereço a mim destinado, me responsabilizando em avisar ao setor responsável no ato da descarga qualquer tipo de avaria.
    </td></tr>
  </table>

  <!-- SIGNATURES -->
  <div class="sigs">
    <div class="sig"><div class="line">Motorista</div></div>
    <div class="sig"><div class="line">Responsável pelo Recebimento</div></div>
  </div>

  <!-- FOOTER -->
  <table class="ftr">
    <tr><td>
      <span class="ftr-line">ATENÇÃO CLIENTE, Em caso de dúvidas, sugestões ou reclamações, entrar em contato imediatamente com a Concrem.</span>
      <span class="ftr-line">ATENÇÃO MOTORISTA, enviar uma via digital deste formulário para a empresa, logo após seu preenchimento.</span>
      <div class="ftr-contact">
        E-mail: sac@concrem.com.br &nbsp;&nbsp; Whatsapp: (94) 99272-3890 &nbsp;&nbsp; Tel: (94) 98114-2020<br/>
        <strong>CONCREM INDUSTRIAL LTDA</strong><br/>
        www.concremportas.com.br
      </div>
    </td></tr>
  </table>

</div>`;

    const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Formulário de Recebimento — Pedido ${numeroPedido}</title>
  ${formHtml.match(/<style[\s\S]*?<\/style>/)?.[0] ?? ''}
</head>
<body>
  ${formHtml.replace(/<style[\s\S]*?<\/style>/, '')}
  <script>window.onload = () => { window.focus(); window.print(); };<\/script>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) {
      showToast('Pop-up bloqueado. Permita pop-ups para este site.', 'error');
      return;
    }
    w.document.open();
    w.document.write(fullHtml);
    w.document.close();

    // Formulário gerado → pedido Em Rota (somente se NF e boleto também estiverem anexados; nunca para LEROY;
    // e somente se TODOS os pedidos do embarque estiverem com status 'faturado')
    const attachs = orderAttachments[orderId] || {};
    const orderForStatus = allCandidates.find((o) => o.id === orderId);
    if (attachs.nf?.url && (attachs.boletos?.length ?? 0) > 0 && !isLeroy(orderForStatus?.clientName || orderForStatus?.clientCode, orderForStatus?.representativeName)) {
      const shipmentStatuses = await listPedidosStatusByPedidoIds(selectedOrderIds);
      const allFaturado = selectedOrderIds.every(oid => {
        const s = shipmentStatuses.find(r => r.pedido_id === oid);
        return s?.status_atual === 'faturado';
      });
      if (allFaturado) {
        void updatePedidoStatus({
          pedidoId: orderId,
          numeroPedido: orderId,
          statusNovo: 'em_entrega',
          alteradoPor: user?.username || null,
          observacao: 'Formulário de entrega gerado',
        });
      }
    }
  };

  // Abre o modal de seleção de representantes para envio
  const openSendModal = async () => {
    const reportOrders = selectedOrderIds
      .map((oid) => allCandidates.find((o) => o.id === oid))
      .filter(Boolean) as Order[];

    if (reportOrders.length === 0) {
      showToast('Nenhum pedido selecionado no relatório.', 'error');
      return;
    }

    // Agrupar pedidos por representante
    const byRep = new Map<string, Order[]>();
    for (const o of reportOrders) {
      const repKey = String(o.representativeId || o.representativeName || '').trim();
      const list = byRep.get(repKey) || [];
      list.push(o);
      byRep.set(repKey, list);
    }

    const notifMap = new Map(notificacoes.map(n => [n.representante_key, n]));

    const items: RepSendItem[] = [];
    for (const [repKey, repOrders] of byRep.entries()) {
      let repInfo = await findRepresentanteContato(repKey);
      const repNameFromPedido = String(repOrders[0]?.representativeName || '').trim();
      if (!repInfo && repNameFromPedido && repNameFromPedido !== repKey) {
        repInfo = await findRepresentanteContato(repNameFromPedido);
      }
      const repName = repInfo?.nome || repOrders[0]?.representativeName || 'Desconhecido';
      const repPhoneRaw = repInfo?.telefone || repOrders[0]?.representativePhone || '';
      const notif = notifMap.get(repKey);
      const jaNotificado = !!notif;
      // LEROY: não aparece no modal
      if (isLeroy(repOrders[0]?.clientName || repOrders[0]?.clientCode, repName)) continue;
      items.push({
        repKey,
        repName,
        repPhone: repPhoneRaw,
        orders: repOrders,
        previsao: notif?.previsao_entrega || previsaoEntregaDate,
        checked: !jaNotificado, // desmarcado se já foi notificado
        notificacao: notif,
      });
    }

    setSendModalItems(items);
    setSendModalOpen(true);
  };

  // Executa o envio para os representantes marcados no modal
  const executeSendWhatsapp = async () => {
    setSending(true);
    const driver = drivers.find((d) => d.id === driverId);
    const driverName = driver?.name || '-';
    const driverPhone = driver?.phone || '-';
    const [ay, am, ad] = shipmentDate.split('-');
    const dataEmbarque = `${ad}/${am}/${ay}`;
    const hora = currentHourBR();
    const saudacao = hora < 12 ? 'Bom dia!' : hora < 18 ? 'Boa tarde!' : 'Boa noite!';

    const toSend = sendModalItems.filter(item => item.checked);

    for (const item of toSend) {
      const { repKey, repName, repPhone: repPhoneRaw, orders: repOrders, previsao } = item;
      const [py, pm, pd] = previsao.split('-');
      const dataPrevisaoEntrega = `${pd}/${pm}/${py}`;
      const repDisplayName = repName.replace(/^\d+\s*[-–]\s*/, '').trim() || repName;

      // Montar mensagem
      let message = `${saudacao} 👋\n\n`;
      message += `🚚 Carregamento do dia ${dataEmbarque}\n\n`;
      message += `📦\n`;
      for (const order of repOrders) {
        const nf = invoiceNumbers[order.id] || 'S/N';
        message += `• ${nf} - ${repDisplayName}\n`;
      }
      message += `\n📅 Entrega prevista a partir de ${dataPrevisaoEntrega}\n\n`;
      message += `📞 Para mais detalhes, fale direto com o motorista:\n`;
      message += `${driverName} — ${driverPhone}\n\n`;
      message += `⚠️ Importante acompanhar a descarga no local\n\n`;
      message += `📎 Nota fiscal e boleto seguem em anexo`;

      // Coletar anexos
      const hasBoleto = repOrders.some(o => (orderAttachments[o.id]?.boletos?.length ?? 0) > 0);
      type DocAttach = { url: string; label: string };
      const docAttachs: DocAttach[] = [];
      for (const order of repOrders) {
        const attachs = orderAttachments[order.id] || { boletos: [] };
        (attachs.boletos || []).forEach((b, idx) => {
          const suffix = idx === 0 ? '' : `_${idx + 1}`;
          docAttachs.push({ url: b.url, label: `Boleto${suffix}-${order.id}.pdf` });
        });
        if (attachs.nf?.url) docAttachs.push({ url: attachs.nf.url, label: `NotaFiscal-${order.id}.pdf` });
      }

      // Enviar via Evolution API
      if (repPhoneRaw) {
        const phoneE164 = normalizePhoneToE164(repPhoneRaw);
        if (phoneE164) {
          const result = await sendEvolutionText(phoneE164, message);
          if (result.ok) {
            showToast(`Mensagem enviada para ${repDisplayName}.`);
          } else {
            showToast(`Falha ao enviar para ${repDisplayName}: ${result.error}`, 'error');
          }
          for (const doc of docAttachs) {
            try {
              const blob = await fetch(doc.url).then(r => r.blob());
              const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              await sendEvolutionMedia(phoneE164, base64, blob.type || 'application/pdf', doc.label);
            } catch (e) {
              console.error(`Erro ao enviar arquivo ${doc.label}:`, e);
            }
          }
        } else {
          showToast(`Número inválido para ${repDisplayName}: ${repPhoneRaw}`, 'error');
        }
      } else {
        showToast(`Representante ${repDisplayName} sem telefone cadastrado.`, 'error');
      }

      // Avançar status: faturado → em_entrega (em_entrega dispara mensagem 3 ao representante)
      const currentStatusesForSend = await listPedidosStatusByPedidoIds(repOrders.map(o => o.id));
      for (const order of repOrders) {
        const statusAtual = currentStatusesForSend.find(s => s.pedido_id === order.id)?.status_atual as string | undefined;
        const jaFaturado = ['faturado', 'em_entrega', 'parcialmente_entregue', 'entregue', 'aguardando_pagamento', 'finalizado'].includes(statusAtual || '');
        const jaEmEntrega = ['em_entrega', 'parcialmente_entregue', 'entregue', 'aguardando_pagamento', 'finalizado'].includes(statusAtual || '');

        if (!jaFaturado) {
          await updatePedidoStatus({
            pedidoId: order.id,
            numeroPedido: order.id,
            statusNovo: 'faturado',
            alteradoPor: user?.username || null,
            observacao: 'Relatório de entrega enviado ao representante',
          });
        }

        if (!jaEmEntrega) {
          await setPedidoStatusWithOptionalNotify({
            pedidoId: order.id,
            numeroPedido: order.id,
            statusNovo: 'em_entrega',
            alteradoPor: user?.username || null,
            observacao: `Relatório enviado via WhatsApp${hasBoleto ? ' com boleto' : ''}`,
            notifyRepresentante: true,
            representantePhoneRaw: repPhoneRaw || null,
            representanteNome: repName || null,
            clienteNome: order.clientName || order.clientCode || 'Cliente',
          });
        }
      }

      // Salvar notificação no banco
      if (id) {
        await upsertRelatorioEntregaNotificacao({
          carregamento_id: id,
          representante_key: repKey,
          representante_nome: repName,
          previsao_entrega: previsao || null,
          criado_por: user?.username || null,
        });
        void insertNotificacaoRepresentante(id, repKey);
      }
    }

    // Recarregar notificações para atualizar badges
    if (id) {
      const updated = await listRelatorioEntregaNotificacoes(id);
      setNotificacoes(updated);
      // Atualiza o modal para refletir quem foi notificado
      setSendModalItems(prev => prev.map(item => {
        const notif = updated.find(n => n.representante_key === item.repKey);
        return { ...item, notificacao: notif, checked: false };
      }));
    }

    setSending(false);
    setSendModalOpen(false);
  };

  const calculateTotals = () => {
    return selectedOrderIds.reduce((acc, orderId) => {
      const order = orders.find(o => o.id === orderId) ?? (supportOrders as unknown as Order[]).find(o => o.id === orderId) ?? directPedidos.find(o => o.id === orderId);
      if (!order) return acc;
      const orderVolume = order.totalQtdM3 || 0;
      const orderWeight = (order.pesoLiquidoItem || 0) * (order.totalQtd || 0);
      return {
        volume: acc.volume + orderVolume,
        weight: acc.weight + orderWeight
      };
    }, { volume: 0, weight: 0 });
  };

  const totals = calculateTotals();
  const volumePercentage = selectedDriver?.vehicleVolume ? Math.round((totals.volume / selectedDriver.vehicleVolume) * 100) : 0;
  const weightPercentage = selectedDriver?.vehicleWeight ? Math.round((totals.weight / selectedDriver.vehicleWeight) * 100) : 0;

  const handleFileUpload = (orderId: string, type: AttachmentType) => {
    if (!id) {
      showToast('Salve a programação antes de anexar documentos.', 'error');
      return;
    }
    if (!supabaseOps) {
      showToast('Conexão com o banco não disponível.', 'error');
      return;
    }
    const label = type === 'boleto' ? 'Boleto' : type === 'nf' ? 'Nota Fiscal' : 'Comprovante de Entrega';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf,.xml';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      // For boletos, use an indexed subfolder so multiple boletos can coexist
      const boletoIdx = type === 'boleto' ? (orderAttachments[orderId]?.boletos?.length ?? 0) : 0;
      const compIdx = type === 'comprovante' ? (orderAttachments[orderId]?.comprovantes?.length ?? 0) : 0;
      const storageTipo = type === 'boleto' ? boletoTipo(boletoIdx) : type === 'comprovante' ? comprovanteTipo(compIdx) : type;
      const path = `${id}/${orderId}/${storageTipo}/${sanitizedName}`;

      const { error: uploadErr } = await supabaseOps.storage
        .from('relatorio-entrega')
        .upload(path, file, { upsert: true });

      if (uploadErr) {
        showToast(`Erro ao carregar ${label}: ${uploadErr.message}`, 'error');
        return;
      }

      const { data: urlData } = supabaseOps.storage
        .from('relatorio-entrega')
        .getPublicUrl(path);

      const newAtt: PendingAttachment = { url: urlData.publicUrl, nome: file.name, saved: false };
      if (type === 'boleto') {
        setOrderAttachments((prev) => {
          const cur = prev[orderId] || { boletos: [], comprovantes: [] };
          return { ...prev, [orderId]: { ...cur, boletos: [...(cur.boletos || []), newAtt] } };
        });
      } else if (type === 'comprovante') {
        setOrderAttachments((prev) => {
          const cur = prev[orderId] || { boletos: [], comprovantes: [] };
          return { ...prev, [orderId]: { ...cur, comprovantes: [...(cur.comprovantes || []), newAtt] } };
        });
      } else {
        setOrderAttachments((prev) => ({
          ...prev,
          [orderId]: { ...(prev[orderId] || { boletos: [], comprovantes: [] }), [type]: newAtt },
        }));
      }

      // Comprovante anexado → status Entregue (nunca para LEROY)
      const orderForComp = allCandidates.find((o) => o.id === orderId);
      if (type === 'comprovante' && !isLeroy(orderForComp?.clientName || orderForComp?.clientCode, orderForComp?.representativeName)) {
        const repId = String(orderForComp?.representativeId || '').trim();
        const repNameComp = String(orderForComp?.representativeName || '').trim();
        const repContactComp = repContacts[repId] || repContacts[repNameComp];
        const repPhoneComp = repContactComp?.telefone || orderForComp?.representativePhone || null;
        const clienteNomeComp = orderForComp?.clientName || orderForComp?.clientCode || 'Cliente';
        await setPedidoStatusWithOptionalNotify({
          pedidoId: orderId,
          numeroPedido: orderId,
          statusNovo: 'entregue',
          alteradoPor: user?.username || null,
          observacao: null,
          notifyRepresentante: true,
          representantePhoneRaw: repPhoneComp,
          representanteNome: repContactComp?.nome || repNameComp || null,
          clienteNome: clienteNomeComp,
        });

        // Verifica se todos os pedidos do carregamento têm ao menos um comprovante
        const prevComps = orderAttachments[orderId]?.comprovantes || [];
        const updatedAttachments = { ...orderAttachments, [orderId]: { ...(orderAttachments[orderId] || { boletos: [], comprovantes: [] }), comprovantes: [...prevComps, { url: urlData.publicUrl, nome: file.name, saved: false }] } };
        const allDelivered = selectedOrderIds.length > 0 && selectedOrderIds.every(
          (sid) => (updatedAttachments[sid]?.comprovantes?.length ?? 0) > 0,
        );
        if (allDelivered) {
          if (id) {
            const old = loads.find((x) => x.id === id);
            if (old) void updateLoad({ ...old, shipmentStatus: 'Entregue' });
          }
          showToast('Todos os pedidos foram entregues! Carregamento pronto para levantamento financeiro.');
          return;
        }
      }

      showToast(`${label} carregado: ${file.name} — clique em Salvar para confirmar.`);
    };
    input.click();
  };

  const [orderSequence, setOrderSequence] = useState<Record<string, number>>({});
  const [invoiceNumbers, setInvoiceNumbers] = useState<Record<string, string>>({});
  const [qtdKits, setQtdKits] = useState<Record<string, string>>({});
  const [qtdPallets, setQtdPallets] = useState<Record<string, string>>({});
  const [qtdVolumes, setQtdVolumes] = useState<Record<string, string>>({});
  const [repContacts, setRepContacts] = useState<Record<string, { nome: string | null; telefone: string | null; endereco: string | null }>>({});

  const repKeysKey = useMemo(() => {
    return Array.from(
      new Set(
        selectedOrderIds
          .map(oid => allCandidatesById.get(oid))
          .filter(Boolean)
          .flatMap(o =>
            [String((o as any).representativeId || ''), String((o as any).representativeName || '')]
              .map(s => s.trim())
              .filter(Boolean)
          )
      )
    ).sort().join(',');
  }, [selectedOrderIds, allCandidatesById]);

  useEffect(() => {
    if (!repKeysKey) return;
    let cancelled = false;
    const repKeys = repKeysKey.split(',');

    const loadReps = async () => {
      const pairs = await Promise.all(
        repKeys.map(async (k) => {
          const info = await findRepresentanteContato(k);
          return [k, info ? { nome: info.nome ?? null, telefone: info.telefone ?? null, endereco: info.endereco ?? null } : { nome: null, telefone: null, endereco: null }] as const;
        }),
      );

      if (cancelled) return;
      setRepContacts((prev) => {
        const next = { ...prev };
        for (const [k, v] of pairs) next[k] = v;
        return next;
      });
    };

    void loadReps();
    return () => {
      cancelled = true;
    };
  }, [repKeysKey]);

  const saveReport = async () => {
    if (!id) {
      showToast('Salve a programação antes de salvar o relatório.', 'error');
      return;
    }

    // Sort selectedOrderIds based on the orderSequence
    const sortedOrderIds = [...selectedOrderIds].sort((a, b) => {
      const seqA = orderSequence[a] || 0;
      const seqB = orderSequence[b] || 0;
      return seqA - seqB;
    });

    setSelectedOrderIds(sortedOrderIds);

    if (id) {
      const old = loads.find((x) => x.id === id);
      if (old) {
        await updateLoad({
          ...old,
          orderIds: sortedOrderIds,
        });
      }

      const saveErr = await upsertEntregasDetalhesSafe(
        id,
        sortedOrderIds.map((pedidoId) => ({
          pedido_id: pedidoId,
          status: deliveredOrderIds.includes(pedidoId) ? 'entregue' : 'pendente',
          entregue_em: deliveredOrderIds.includes(pedidoId) ? new Date().toISOString() : null,
          numero_nota: invoiceNumbers[pedidoId] || null,
          ordem_entrega: orderSequence[pedidoId] ?? null,
          qtd_kits: (() => { const v = parseFloat(String(qtdKits[pedidoId] ?? '').replace(',', '.')); return isNaN(v) ? null : v; })(),
          qtd_pallets: (() => { const v = parseFloat(String(qtdPallets[pedidoId] ?? '').replace(',', '.')); return isNaN(v) ? null : v; })(),
          qtd_volumes: (() => { const v = parseFloat(String(qtdVolumes[pedidoId] ?? '').replace(',', '.')); return isNaN(v) ? null : v; })(),
        })),
      );
      if (saveErr) {
        showToast(`Erro ao salvar relatório: ${saveErr.message}`, 'error');
        return;
      }

      await Promise.all(
        sortedOrderIds.map(async (pedidoId) => {
          const order = allCandidates.find((o) => o.id === pedidoId);
          if (!order) return;
          const repId = String(order.representativeId || '').trim();
          const repName = String(order.representativeName || '').trim();
          const repContact = repContacts[repId] || repContacts[repName];
          const repPhone = repContact?.telefone || order.representativePhone || null;
          const clienteNome = order.clientName || order.clientCode || 'Cliente';
          await syncEntregaStatusFromOps({
            pedidoId,
            numeroPedido: pedidoId,
            alteradoPor: user?.username || null,
            clienteNome,
            representantePhoneRaw: repPhone,
          });
        }),
      );

      // Salvar anexos pendentes na tabela relatorio_entrega_anexos
      type PendingEntry = { pedidoId: string; tipo: string; info: PendingAttachment; boletoIdx?: number; compIdx?: number };
      const pendingEntries: PendingEntry[] = [];
      for (const [pedidoId, attachments] of Object.entries(orderAttachments)) {
        const atts = attachments || { boletos: [], comprovantes: [] };
        (atts.boletos || []).forEach((b, idx) => {
          if (!b.saved) pendingEntries.push({ pedidoId, tipo: boletoTipo(idx), info: b, boletoIdx: idx });
        });
        if (atts.nf && !atts.nf.saved) pendingEntries.push({ pedidoId, tipo: 'nf', info: atts.nf });
        (atts.comprovantes || []).forEach((c, idx) => {
          if (!c.saved) pendingEntries.push({ pedidoId, tipo: comprovanteTipo(idx), info: c, compIdx: idx });
        });
      }

      for (const { pedidoId, tipo, info, boletoIdx } of pendingEntries) {
        await upsertRelatorioEntregaAnexo({
          carregamento_id: id,
          pedido_id: pedidoId,
          tipo,
          arquivo_nome: info.nome,
          arquivo_url: info.url,
          criado_por: user?.username || null,
        });
        setOrderAttachments((prev) => {
          const cur = prev[pedidoId] || { boletos: [], comprovantes: [] };
          if (boletoIdx !== undefined) {
            const newBoletos = [...(cur.boletos || [])];
            newBoletos[boletoIdx] = { ...info, saved: true };
            return { ...prev, [pedidoId]: { ...cur, boletos: newBoletos } };
          }
          if (compIdx !== undefined) {
            const newComprovantes = [...(cur.comprovantes || [])];
            newComprovantes[compIdx] = { ...info, saved: true };
            return { ...prev, [pedidoId]: { ...cur, comprovantes: newComprovantes } };
          }
          return { ...prev, [pedidoId]: { ...cur, [tipo]: { ...info, saved: true } } };
        });
      }

      // Se todos os pedidos do carregamento estão marcados como entregues → avançar shipmentStatus para 'Entregue'
      if (sortedOrderIds.length > 0 && sortedOrderIds.every((pid) => deliveredOrderIds.includes(pid))) {
        const old = loads.find((x) => x.id === id);
        if (old && old.shipmentStatus !== 'Entregue') {
          await updateLoad({ ...old, shipmentStatus: 'Entregue' });
          showToast('Todos os pedidos entregues! Carregamento enviado para o Financeiro.');
          return;
        }
      }
    }
    showToast('Alterações salvas com sucesso!');
  };

  const handleOrderSequenceChange = (orderId: string, value: string) => {
    const seq = parseInt(value, 10);
    if (!isNaN(seq)) {
      setOrderSequence(prev => ({ ...prev, [orderId]: seq }));
    }
  };

  const handleDelete = () => {
    if (id) {
      deleteLoad(id);
      showToast('Programação excluída com sucesso!', 'error');
      navigate('/carregamento');
    }
  };

  const handleSave = async () => {
    if (!driverId) {
      showToast('Selecione um motorista.', 'error');
      return;
    }
    if (selectedOrderIds.length === 0) {
      showToast('Selecione pelo menos um pedido.', 'error');
      return;
    }

    // Parse freightRaw at save time to capture values typed without blurring first
    const parsedRaw = parseFloat(freightRaw.replace(/\./g, '').replace(',', '.'));
    const finalFreightValue = !isNaN(parsedRaw) ? parsedRaw : freightValue;

    try {
      if (isEditing && id) {
        const old = loads.find((x) => x.id === id);
        if (!old) return;
        await updateLoad({
          ...old,
          driverId,
          orderIds: selectedOrderIds,
          plannedDate: shipmentDate,
          previsaoEntrega: previsaoEntregaDate,
          shipmentStatus: shipmentStatus,
          estimatedWeight: totals.weight,
          freightValue: finalFreightValue,
        });
        showToast('Programação atualizada com sucesso!');
        return; // Permanecer na página de edição
      } else {
        const newId = await addLoad({
          driverId,
          orderIds: selectedOrderIds,
          plannedDate: shipmentDate,
          previsaoEntrega: previsaoEntregaDate,
          obs: '',
          productionStatus: 'Aguardando Produção',
          shipmentStatus: shipmentStatus,
          estimatedWeight: totals.weight,
          freightValue: finalFreightValue,
        });
        showToast('Programação criada com sucesso!');
        navigate(`/carregamento/editar/${newId}`);
        return;
      }

      // Auto-update pedido_status based on shipment status
      const username = user?.username || null;
      if (shipmentStatus === 'Em Rota') {
        const currentStatuses = await listPedidosStatusByPedidoIds(selectedOrderIds);
        for (const orderId of selectedOrderIds) {
          const orderForBulk = allCandidates.find((o) => o.id === orderId);
          if (isLeroy(orderForBulk?.clientName || orderForBulk?.clientCode, orderForBulk?.representativeName)) continue;
          const currentStatus = currentStatuses.find(s => s.pedido_id === orderId)?.status_atual;
          if (currentStatus !== 'faturado') continue;
          await updatePedidoStatus({
            pedidoId: orderId,
            numeroPedido: orderId,
            statusNovo: 'em_entrega',
            alteradoPor: username,
            observacao: 'Atualização automática: embarque Em Rota',
          });
        }
      } else if (shipmentStatus === 'Entregue') {
        for (const orderId of selectedOrderIds) {
          const orderForBulk = allCandidates.find((o) => o.id === orderId);
          if (isLeroy(orderForBulk?.clientName || orderForBulk?.clientCode, orderForBulk?.representativeName)) continue;
          await updatePedidoStatus({
            pedidoId: orderId,
            numeroPedido: orderId,
            statusNovo: 'entregue',
            alteradoPor: username,
            observacao: 'Atualização automática: embarque Entregue',
          });
        }
      }

      navigate('/carregamento');
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || 'Erro ao salvar programação.', 'error');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/carregamento')}
            className="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold font-sans tracking-tight">
              {isEditing ? `Editar Programação ${id}` : 'Programação de Novo Carregamento'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isEditing ? 'Altere as informações da programação selecionada' : 'Configure o motorista e selecione os pedidos para a programação'}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button className={btnDanger} onClick={() => navigate('/carregamento')}>Cancelar</button>
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-semibold shadow-lg shadow-primary/25"
          >
            <Save className="h-4 w-4" />
            Salvar Programação
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {/* Seleção de Motorista e Status */}
        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <div className="flex items-center gap-2 mb-6">
            <Truck className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold font-sans">Informações do Transporte</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FormField label="Selecionar Motorista">
              <select 
                className={inputClass} 
                value={driverId} 
                onChange={e => setDriverId(e.target.value)}
              >
                <option value="">Selecione um motorista...</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Data do Carregamento">
              <input 
                type="date" 
                className={inputClass} 
                value={shipmentDate} 
                onChange={e => setShipmentStatusDate(e.target.value)}
              />
            </FormField>

            <FormField label="Valor do Frete (R$)">
              <input
                type="text"
                className={inputClass}
                placeholder="0,00"
                value={freightRaw}
                onChange={e => {
                  setFreightRaw(e.target.value);
                  setFreightManual(true);
                }}
                onBlur={e => {
                  const raw = e.target.value.replace(/\./g, '').replace(',', '.');
                  const num = parseFloat(raw);
                  const val = isNaN(num) ? 0 : num;
                  setFreightValue(val);
                  setFreightRaw(val > 0 ? val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
                }}
              />
            </FormField>

            <FormField label="Status da Programação">
              <select 
                className={inputClass} 
                value={shipmentStatus} 
                onChange={e => setShipmentStatus(e.target.value as ShipmentStatus)}
              >
                <option value="Aguardando Despacho">Aguardando Despacho</option>
                <option value="Despachado">Despachado</option>
                <option value="Em Rota">Em Rota</option>
                <option value="Entregue">Entregue</option>
                <option value="Cancelado">Cancelado</option>
              </select>
            </FormField>
          </div>

          <div className="mt-6 pt-6 border-t border-border">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-1.5">
                <label className="text-sm font-medium font-display text-muted-foreground">CPF / Documento</label>
                <p className="px-3 py-2 rounded-lg border border-border bg-muted/20 text-foreground font-mono-data text-sm min-h-[38px]">
                  {selectedDriver?.id || '-'}
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium font-display text-muted-foreground">Telefone</label>
                <p className="px-3 py-2 rounded-lg border border-border bg-muted/20 text-foreground font-display text-sm min-h-[38px]">
                  {selectedDriver?.phone || '-'}
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium font-display text-muted-foreground">Tipo de Veículo</label>
                <div className="px-3 py-2 rounded-lg border border-border bg-muted/20 font-semibold text-sm min-h-[38px]">
                  {selectedDriver?.vehicleType || '-'}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium font-display text-muted-foreground">Placa</label>
                <div className="px-3 py-2 rounded-lg border border-border bg-muted/20 font-semibold font-mono-data text-sm min-h-[38px]">
                  {selectedDriver?.plate || '-'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Seleção de Pedidos (Meio) */}
        <div className="bg-card rounded-xl p-6 shadow-card border border-border flex flex-col max-h-[600px]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold font-sans">Lista de Pedidos</h3>
            </div>
          </div>

          <div className="mb-4 px-3 space-y-3">
            <QuickFilterBar
              query={quickQuery}
              onQueryChange={setQuickQuery}
              placeholder="Buscar pedido, representante, cidade..."
            >
              <FilterTriggerButton count={conditions.length} onClick={() => setFiltersOpen(true)} />
            </QuickFilterBar>
            <ActiveFiltersChips
              fields={filterFields}
              conditions={conditions}
              onRemove={(id) => setConditions((prev) => prev.filter((c) => c.id !== id))}
              onClear={() => setConditions([])}
              className="flex-1"
            />
          </div>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4 pb-2">
            {/* Seção de Selecionados — aparece ABAIXO dos disponíveis */}
            {false && (
              <div className="space-y-2">
                <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] px-1 mb-3">Pedidos Selecionados ({selectedOrderIds.length})</h4>
                <div className="grid grid-cols-1 gap-2">
                  {selectedOrderIds.map(id => {
                    const order = allCandidates.find(o => o.id === id);
                    if (!order) return null;
                    const client = clients.find(c => c.id === order.clientId);
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between p-3 rounded-lg border-2 border-primary bg-primary/5 transition-all group relative overflow-hidden"
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                        <div className="flex items-center gap-4 pl-2">
                          <button
                            type="button"
                            onClick={(e) => selectOrder(e, id)}
                            className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center shadow-sm hover:bg-primary/80 transition-colors shrink-0"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 flex-1 items-center">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-sm font-mono-data">{order.id}</p>
                                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Embarcado</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground font-medium">Nº Pedido</p>
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {prioMap.has(order.id) && <PrioridadeIcon nivel={prioMap.get(order.id)!.nivel} motivo={prioMap.get(order.id)!.motivo} />}
                                <p className="font-bold text-sm text-primary truncate max-w-[150px]">{order.clientName || order.clientCode || '-'}</p>
                              </div>
                              <p className="text-[10px] text-muted-foreground font-medium">Cliente</p>
                            </div>
                            <div>
                              <p className="font-bold text-sm font-mono-data">{(() => { const repId = String(order.representativeId || '').trim(); const repName = String(order.representativeName || '').trim(); const contact = repContacts[repId] || repContacts[repName]; return contact?.telefone || order.representativePhone || '-'; })()}</p>
                              <p className="text-[10px] text-muted-foreground font-medium">Tel. Rep.</p>
                            </div>
                            <div>
                              <p className="font-bold text-sm truncate">{order.clientCity || client?.address.city}/{order.clientUF || client?.address.state}</p>
                              <p className="text-[10px] text-muted-foreground font-medium">Cidade/UF</p>
                            </div>
                            <div>
                              <p className="font-bold text-sm text-amber-600">{order.previsaoCarregamento || order.expiryDate}</p>
                              <p className="text-[10px] text-muted-foreground font-medium">Previsão</p>
                            </div>
                          </div>
                        </div>
                        <div className="text-right min-w-[100px]">
                          <p className="font-bold text-sm text-[#1E3A5F]">{formatCurrency(order.totalPedidoVenda || getOrderTotal(order))}</p>
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight">Frete: {formatCurrency(order.freightValue || 0)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="h-px bg-border my-6" />
              </div>
            )}

            {/* Seção de Disponíveis (Vertical) */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-1 mb-3">Disponíveis para Adicionar ({displayedOrders.length})</h4>
              {/* Sortable column headers */}
              <div className="hidden md:grid grid-cols-[20px_1fr_8rem_1fr_1fr_1fr_1fr_100px] gap-4 items-center px-4 py-1">
                <span />
                {(['id','badge','representative','phone','city','expiry','value'] as const).map((col, i) => {
                  const labels: Record<string, string> = { id: 'Nº Pedido', badge: '', representative: 'Cliente', phone: 'Tel. Rep.', city: 'Cidade/UF', expiry: 'Previsão', value: 'Valor' };
                  if (col === 'badge') return <span key={col} />;
                  const active = sortState.key === col;
                  return (
                    <span key={col} onClick={() => toggleSort(col)} className={`inline-flex items-center gap-1 cursor-pointer select-none text-[10px] font-bold font-display uppercase tracking-wider transition-colors ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'} ${col === 'value' ? 'justify-end' : ''}`}>
                      {labels[col]}
                      {active && sortState.direction === 'asc' && <ArrowUp className="h-2.5 w-2.5" />}
                      {active && sortState.direction === 'desc' && <ArrowDown className="h-2.5 w-2.5" />}
                    </span>
                  );
                })}
              </div>
              {displayedOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground bg-muted/10 rounded-xl border border-dashed border-border">
                  <Package className="h-8 w-8 mb-2 opacity-20" />
                  <p className="italic text-sm">Nenhum pedido disponível no momento.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {displayedOrders.map(order => {
                    const client = clients.find(c => c.id === order.clientId);
                    return (
                      <div
                        key={order.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-border bg-card transition-all group"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <button
                            type="button"
                            onClick={(e) => selectOrder(e, order.id)}
                            className="w-5 h-5 rounded-full border-2 border-muted hover:border-primary hover:bg-primary/10 transition-colors bg-white shrink-0"
                          />
                          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 flex-1 items-center">
                            <div>
                              <p className="font-bold text-sm font-mono-data text-foreground/80">{order.id}</p>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Nº Pedido</p>
                            </div>
                            <div className="flex justify-center">
                              {prioMap.has(order.id) && <PrioridadeIcon nivel={prioMap.get(order.id)!.nivel} motivo={prioMap.get(order.id)!.motivo} />}
                            </div>
                            <div>
                              <p className="font-bold text-sm text-primary/80 truncate">{order.clientName || order.clientCode || '-'}</p>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Cliente</p>
                            </div>
                            <div>
                              <p className="font-bold text-sm font-mono-data">{(() => { const repId = String(order.representativeId || '').trim(); const repName = String(order.representativeName || '').trim(); const contact = repContacts[repId] || repContacts[repName]; return contact?.telefone || order.representativePhone || '-'; })()}</p>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Tel. Rep.</p>
                            </div>
                            <div>
                              <p className="font-bold text-sm truncate">{order.clientCity || client?.address.city}/{order.clientUF || client?.address.state}</p>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Cidade/UF</p>
                            </div>
                            <div>
                              <p className="font-bold text-sm text-foreground">{order.previsaoCarregamento || order.expiryDate}</p>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Previsão</p>
                            </div>
                          </div>
                        </div>
                        <div className="text-right min-w-[100px]">
                          <p className="font-bold text-sm text-[#1E3A5F] group-hover:text-primary transition-colors">{formatCurrency(order.totalPedidoVenda || getOrderTotal(order))}</p>
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight">Frete: {formatCurrency(order.freightValue || 0)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Seção de Selecionados — abaixo dos disponíveis */}
            {selectedOrderIds.length > 0 && (
              <div className="space-y-2">
                <div className="h-px bg-border my-2" />
                <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] px-1 mb-3">Pedidos Selecionados ({selectedOrderIds.length})</h4>
                <div className="grid grid-cols-1 gap-2">
                  {selectedOrderIds.map(id => {
                    const order = allCandidates.find(o => o.id === id);
                    if (!order) return null;
                    const client = clients.find(c => c.id === order.clientId);
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between p-3 rounded-lg border-2 border-primary bg-primary/5 transition-all group relative overflow-hidden"
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                        <div className="flex items-center gap-4 pl-2">
                          <button
                            type="button"
                            onClick={(e) => selectOrder(e, id)}
                            className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center shadow-sm hover:bg-primary/80 transition-colors shrink-0"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 flex-1 items-center">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-sm font-mono-data">{order.id}</p>
                                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Embarcado</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground font-medium">Nº Pedido</p>
                            </div>
                            <div className="flex justify-center">
                              {prioMap.has(order.id) && <PrioridadeIcon nivel={prioMap.get(order.id)!.nivel} motivo={prioMap.get(order.id)!.motivo} />}
                            </div>
                            <div>
                              <p className="font-bold text-sm text-primary truncate">{order.clientName || order.clientCode || '-'}</p>
                              <p className="text-[10px] text-muted-foreground font-medium">Cliente</p>
                            </div>
                            <div>
                              <p className="font-bold text-sm font-mono-data">{(() => { const repId = String(order.representativeId || '').trim(); const repName = String(order.representativeName || '').trim(); const contact = repContacts[repId] || repContacts[repName]; return contact?.telefone || order.representativePhone || '-'; })()}</p>
                              <p className="text-[10px] text-muted-foreground font-medium">Tel. Rep.</p>
                            </div>
                            <div>
                              <p className="font-bold text-sm truncate">{order.clientCity || client?.address.city}/{order.clientUF || client?.address.state}</p>
                              <p className="text-[10px] text-muted-foreground font-medium">Cidade/UF</p>
                            </div>
                            <div>
                              <p className="font-bold text-sm text-amber-600">{order.previsaoCarregamento || order.expiryDate}</p>
                              <p className="text-[10px] text-muted-foreground font-medium">Previsão</p>
                            </div>
                          </div>
                        </div>
                        <div className="text-right min-w-[100px]">
                          <p className="font-bold text-sm text-[#1E3A5F]">{formatCurrency(order.totalPedidoVenda || getOrderTotal(order))}</p>
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight">Frete: {formatCurrency(order.freightValue || 0)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Relatório de Entrega */}
        <div className="bg-card rounded-xl shadow-card border border-border overflow-hidden mb-6">
          <div className="p-6 border-b border-border bg-muted/30 flex items-center justify-between">
            <h3 className="text-lg font-semibold font-sans flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              Relatório de Entrega
            </h3>
            <div className="flex items-center gap-2">
              <div className="h-4 w-[1px] bg-border mx-1" />
              <button
                onClick={() => setReportPage(prev => Math.max(0, prev - 1))}
                disabled={reportPage === 0}
                className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-mono-data font-bold text-muted-foreground">
                Página {reportPage + 1}
              </span>
              <button
                onClick={() => setReportPage(prev => Math.min(3, prev + 1))}
                disabled={reportPage === 3}
                className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {reportPage === 0 && (
                    <>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px] text-center w-[100px]">Ordem de Entrega</th>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Cliente</th>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">CNPJ</th>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px] text-right">Valor Total</th>
                    </>
                  )}
                  {reportPage === 1 && (
                    <>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Número da NF</th>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Endereço</th>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Cidade</th>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">UF</th>
                    </>
                  )}
                  {reportPage === 2 && (
                    <>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">N° Pedido</th>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Representante</th>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Tel. Rep.</th>
                    </>
                  )}
                  {reportPage === 3 && (
                    <>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px] text-center w-[80px]">Entregue</th>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px] text-center">Qtd. Kits</th>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px] text-center">Qtd. Pallets</th>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px] text-center">Qtd. Volumes</th>
                    </>
                  )}
                  <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px] text-center sticky right-0 bg-muted/50 z-10 border-l border-border/50">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {selectedOrderIds.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground italic">
                      Nenhum pedido selecionado para o relatório.
                    </td>
                  </tr>
                ) : (
                  selectedOrderIds.map((id, index) => {
                    const order = allCandidatesById.get(id);
                    if (!order) return null;
                    const client = clientsById.get(order.clientId);
                    const invoice = orderIdToInvoice.get(id);
                    
                    return (
                      <tr key={id} className="hover:bg-muted/30 transition-colors group">
                        {(() => {
                          const repId = String(order.representativeId || '').trim();
                          const repName = String(order.representativeName || '').trim();
                          const repContact = repContacts[repId] || repContacts[repName];
                          
                          let repAddress: any = null;
                          if (repContact?.endereco) {
                            try {
                              repAddress = JSON.parse(repContact.endereco);
                            } catch (e) {
                              repAddress = null;
                            }
                          }

                          return (
                            <>
                              {reportPage === 0 && (
                                <>
                                  <td className="py-3 px-4">
                                    <div className="flex items-center justify-center gap-1">
                                      <input
                                        type="number"
                                        className="w-12 bg-transparent border-b border-border focus:border-primary focus:outline-none text-center font-mono-data font-bold text-muted-foreground text-sm no-spinner"
                                        placeholder="0"
                                        value={orderSequence[order.id] || ''}
                                        onChange={(e) => handleOrderSequenceChange(order.id, e.target.value)}
                                      />
                                    </div>
                                  </td>
                                  <td
                                    className="py-3 px-4 font-medium truncate max-w-[200px]"
                                    title={order?.clientName || client?.name}
                                  >
                                    {order?.clientName || client?.name || '-'}
                                  </td>
                                  <td className="py-3 px-4 font-mono-data text-xs">
                                    {client?.cpfCnpj || order?.clientCode || '-'}
                                  </td>
                                  <td className="py-3 px-4 font-mono-data font-bold text-right text-[#1E3A5F]">
                                    {formatCurrency(order?.totalPedidoVenda || getOrderTotal(order))}
                                  </td>
                                </>
                              )}

                              {reportPage === 1 && (
                                <>
                                  <td className="py-3 px-4 font-mono-data font-bold">
                                    <input
                                      type="text"
                                      className="w-full bg-transparent border-b border-border focus:border-primary focus:outline-none text-center font-mono-data text-sm"
                                      value={invoiceNumbers[order.id] || ''}
                                      onChange={(e) => setInvoiceNumbers(prev => ({ ...prev, [order.id]: e.target.value }))}
                                      placeholder="-"
                                    />
                                  </td>
                                  <td className="py-3 px-4 truncate max-w-[200px]" title={order.clientEndereco || repAddress?.street || client?.address.street || '-'}>
                                    {order.clientEndereco
                                      ? `${order.clientEndereco}${order.clientBairro ? ' - ' + order.clientBairro : ''}`
                                      : repAddress
                                        ? `${repAddress.street || ''}, ${repAddress.number || ''}`
                                        : client
                                          ? `${client.address.street || ''}, ${client.address.number || ''}`
                                          : '-'}
                                  </td>
                                  <td className="py-3 px-4 truncate max-w-[150px]" title={order.clientCity || repAddress?.city || client?.address.city}>
                                    {order.clientCity || repAddress?.city || client?.address.city || '-'}
                                  </td>
                                  <td className="py-3 px-4 font-mono-data font-bold text-center">
                                    {order.clientUF || repAddress?.state || client?.address.state || '-'}
                                  </td>
                                </>
                              )}

                              {reportPage === 2 && (
                                <>
                                  <td className="py-3 px-4 font-mono-data font-bold text-primary">
                                    <span className="inline-flex items-center gap-1.5">
                                      {prioMap.has(order.id) && <PrioridadeDot nivel={prioMap.get(order.id)!.nivel} />}
                                      {order.id}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 font-medium">
                                    {repContact?.nome || order.representativeName || '-'}
                                  </td>
                                  <td className="py-3 px-4 font-mono-data text-xs">
                                    {repContact?.telefone || order.representativePhone || '-'}
                                  </td>
                                </>
                              )}

                              {reportPage === 3 && (
                                <>
                                  <td className="py-3 px-4 text-center">
                                    <div className="flex justify-center">
                                      <button
                                        onClick={() => toggleDelivered(order.id)}
                                        className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                                          deliveredOrderIds.includes(order.id)
                                            ? 'bg-primary border-primary text-primary-foreground'
                                            : 'border-muted-foreground/30 hover:border-primary/50'
                                        }`}
                                      >
                                        {deliveredOrderIds.includes(order.id) && <Check className="h-3.5 w-3.5" />}
                                      </button>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      className="w-16 bg-transparent border-b border-border focus:border-primary focus:outline-none text-center font-mono-data text-sm"
                                      placeholder="0"
                                      value={qtdKits[order.id] ?? ''}
                                      onChange={(e) => setQtdKits((prev) => ({ ...prev, [order.id]: e.target.value }))}
                                    />
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      className="w-16 bg-transparent border-b border-border focus:border-primary focus:outline-none text-center font-mono-data text-sm"
                                      placeholder="0"
                                      value={qtdPallets[order.id] ?? ''}
                                      onChange={(e) => setQtdPallets((prev) => ({ ...prev, [order.id]: e.target.value }))}
                                    />
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      className="w-16 bg-transparent border-b border-border focus:border-primary focus:outline-none text-center font-mono-data text-sm"
                                      placeholder="0"
                                      value={qtdVolumes[order.id] ?? ''}
                                      onChange={(e) => setQtdVolumes((prev) => ({ ...prev, [order.id]: e.target.value }))}
                                    />
                                  </td>
                                </>
                              )}

                              <td className="py-3 px-4 text-center sticky right-0 bg-card group-hover:bg-muted/30 z-10 border-l border-border/50">
                                <div className="flex items-center justify-center gap-1">
                                  {/* Indicadores de anexo */}
                                  {orderAttachments[id]?.nf && (
                                    <span className={`text-[9px] font-bold px-1 rounded ${orderAttachments[id]?.nf?.saved ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`} title={orderAttachments[id]?.nf?.saved ? 'NF salva' : 'NF pendente'}>NF</span>
                                  )}
                                  {(orderAttachments[id]?.boletos?.length ?? 0) > 0 && (() => {
                                    const boletos = orderAttachments[id]?.boletos || [];
                                    const allSaved = boletos.every(b => b.saved);
                                    return (
                                      <span
                                        className={`text-[9px] font-bold px-1 rounded ${allSaved ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
                                        title={`${boletos.length} boleto(s) – ${allSaved ? 'salvos' : 'pendente(s)'}`}
                                      >
                                        B{boletos.length > 1 ? `(${boletos.length})` : ''}
                                      </span>
                                    );
                                  })()}
                                  {(orderAttachments[id]?.comprovantes?.length ?? 0) > 0 && (() => {
                                    const comps = orderAttachments[id]?.comprovantes || [];
                                    const allSaved = comps.every(c => c.saved);
                                    return (
                                      <span
                                        className={`text-[9px] font-bold px-1 rounded ${allSaved ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
                                        title={`${comps.length} comprovante(s) — ${allSaved ? 'salvos' : 'pendente(s)'}`}
                                      >
                                        C{comps.length > 1 ? `(${comps.length})` : ''}
                                      </span>
                                    );
                                  })()}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button className="p-1 hover:bg-muted rounded-full transition-colors">
                                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuLabel>Ações</DropdownMenuLabel>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem className="cursor-pointer" onClick={() => handleGenerateFormulario(id)}>
                                        <FileText className="mr-2 h-4 w-4" /> Gerar formulário
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem className="cursor-pointer" onClick={() => handleFileUpload(id, 'nf')}>
                                        <Upload className="mr-2 h-4 w-4" />
                                        {orderAttachments[id]?.nf ? 'Substituir Nota Fiscal' : 'Anexar Nota Fiscal'}
                                      </DropdownMenuItem>
                                      {orderAttachments[id]?.nf && (
                                        <DropdownMenuItem className="cursor-pointer" onClick={() => window.open(orderAttachments[id]?.nf?.url, '_blank')}>
                                          <FileCheck className="mr-2 h-4 w-4" /> Ver Nota Fiscal
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem className="cursor-pointer" onClick={() => handleFileUpload(id, 'boleto')}>
                                        <Upload className="mr-2 h-4 w-4" /> Adicionar Boleto
                                      </DropdownMenuItem>
                                      {(orderAttachments[id]?.boletos || []).map((b, bIdx) => (
                                        <DropdownMenuItem key={bIdx} className="cursor-pointer" onClick={() => window.open(b.url, '_blank')}>
                                          <Eye className="mr-2 h-4 w-4" /> Ver Boleto{(orderAttachments[id]?.boletos?.length ?? 0) > 1 ? ` ${bIdx + 1}` : ''}
                                        </DropdownMenuItem>
                                      ))}
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem className="cursor-pointer" onClick={() => handleFileUpload(id, 'comprovante')}>
                                        <Upload className="mr-2 h-4 w-4" /> Adicionar Comprovante de Entrega
                                      </DropdownMenuItem>
                                      {(orderAttachments[id]?.comprovantes || []).map((c, cIdx) => (
                                        <DropdownMenuItem key={cIdx} className="cursor-pointer" onClick={() => window.open(c.url, '_blank')}>
                                          <Eye className="mr-2 h-4 w-4" /> Ver Comprovante{(orderAttachments[id]?.comprovantes?.length ?? 0) > 1 ? ` ${cIdx + 1}` : ''}
                                        </DropdownMenuItem>
                                      ))}
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        className="text-destructive focus:text-destructive cursor-pointer"
                                        onClick={() => removeOrder(id)}
                                      >
                                        <Trash className="mr-2 h-4 w-4" /> Remover Pedido
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </td>
                            </>
                          );
                        })()}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ações do Relatório de Entrega */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            onClick={openSendModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors font-display text-sm font-bold uppercase tracking-tight"
          >
            <MessageCircle className="h-4 w-4" />
            Enviar
          </button>
          <button
            onClick={saveReport}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors font-display text-sm font-bold uppercase tracking-tight"
          >
            <Save className="h-4 w-4" />
            Salvar
          </button>
        </div>

        {/* Cards de Ocupação Lado a Lado (Final da Página) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-10">
          {/* Card Volume */}
          <div className="bg-card rounded-2xl p-6 shadow-card border border-border relative overflow-hidden group">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[#1E3A5F]">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <Package className="h-4 w-4 text-primary" />
                </div>
                <span className="text-xs font-black uppercase tracking-widest">Capacidade Volume</span>
              </div>
              <div className={cn(
                "text-[10px] font-black px-2.5 py-1 rounded-full border",
                volumePercentage > 100 ? "bg-red-50 text-red-600 border-red-100" :
                volumePercentage > 90  ? "bg-amber-50 text-amber-600 border-amber-100" :
                "bg-emerald-50 text-emerald-600 border-emerald-100"
              )}>
                {volumePercentage}%
              </div>
            </div>

            <div className="bg-[#F8FAFC] rounded-2xl p-6 mb-6 relative min-h-[160px] flex items-center justify-center border border-slate-100">
              <div className="relative w-full max-w-sm h-32">
                <svg viewBox="0 0 100 40" className="w-full h-full drop-shadow-md">
                  <defs>
                    <clipPath id="volumeFill">
                      <rect x="2" y="5" width={Math.min((78 * volumePercentage) / 100, 78)} height="20" />
                    </clipPath>
                    <linearGradient id="truckGradVol" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#10B981" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                  </defs>
                  
                  {/* Background Truck (Gray) - High Contrast */}
                  <g>
                    {/* Trailer Body (Gray Background) */}
                    <path d="M2 5h78v20H2z" fill="#E2E8F0" />
                    
                    {/* Cabin (Navy Blue) */}
                    <path d="M82 10h10a2 2 0 0 1 2 2v13h-12z" fill="#1E3A5F" />
                    {/* Window */}
                    <path d="M84 12h6v6h-6z" fill="#94A3B8" className="opacity-40" />
                    
                    {/* Wheels (Dark Gray with Hub) */}
                    {[10, 20, 65, 75, 88].map(cx => (
                      <g key={cx}>
                        <circle cx={cx} cy="30" r="3.5" fill="#334155" />
                        <circle cx={cx} cy="30" r="1.5" fill="#94A3B8" />
                      </g>
                    ))}
                  </g>

                  {/* Filled Truck (Green) */}
                  <g className="fill-[url(#truckGradVol)]" clipPath="url(#volumeFill)">
                    <path d="M2 5h78v20H2z" />
                  </g>

                  {/* Outline and Details */}
                  <g fill="none" stroke="#1E3A5F" strokeWidth="0.8" className="opacity-60">
                    <path d="M2 5h78v20H2z" />
                    <path d="M82 10h10a2 2 0 0 1 2 2v13h-12z" />
                    <path d="M82 10v15" />
                  </g>
                </svg>
              </div>
            </div>

            <div className="flex items-end justify-between">
              <div>
                <span className="text-3xl font-black text-[#1E3A5F] tracking-tighter">{totals.volume.toFixed(1)}</span>
                <span className="text-xs text-muted-foreground ml-1.5 font-black uppercase">m³</span>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter mb-0.5">Capacidade Total</p>
                <p className="text-sm font-black text-[#1E3A5F]">{selectedDriver?.vehicleVolume || 0} m³</p>
              </div>
            </div>
          </div>

          {/* Card Peso */}
          <div className="bg-card rounded-2xl p-6 shadow-card border border-border relative overflow-hidden group">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[#1E3A5F]">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M16 16c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v11Z"/><path d="M2 10h14"/><path d="M7 3v13"/><path d="M22 14v3a1 1 0 0 1-1 1h-5v-7h5a1 1 0 0 1 1 1v3Z"/></svg>
                </div>
                <span className="text-xs font-black uppercase tracking-widest">Capacidade Peso</span>
              </div>
              <div className={cn(
                "text-[10px] font-black px-2.5 py-1 rounded-full border",
                weightPercentage > 100 ? "bg-red-50 text-red-600 border-red-100" :
                weightPercentage > 90  ? "bg-amber-50 text-amber-600 border-amber-100" :
                "bg-emerald-50 text-emerald-600 border-emerald-100"
              )}>
                {weightPercentage}%
              </div>
            </div>
            
            <div className="bg-[#F8FAFC] rounded-2xl p-6 mb-6 relative min-h-[160px] flex items-center justify-center border border-slate-100">
              <div className="relative w-full max-w-sm h-32">
                <svg viewBox="0 0 100 40" className="w-full h-full drop-shadow-md">
                  <defs>
                    <clipPath id="weightFill">
                      <rect x="2" y="5" width={(78 * weightPercentage) / 100} height="20" />
                    </clipPath>
                    <linearGradient id="truckGradWeight" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#10B981" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                  </defs>
                  
                  {/* Background Truck (Gray) - High Contrast */}
                  <g>
                    {/* Trailer Body (Gray Background) */}
                    <path d="M2 5h78v20H2z" fill="#E2E8F0" />
                    
                    {/* Cabin (Navy Blue) */}
                    <path d="M82 10h10a2 2 0 0 1 2 2v13h-12z" fill="#1E3A5F" />
                    {/* Window */}
                    <path d="M84 12h6v6h-6z" fill="#94A3B8" className="opacity-40" />
                    
                    {/* Wheels (Dark Gray with Hub) */}
                    {[10, 20, 65, 75, 88].map(cx => (
                      <g key={cx}>
                        <circle cx={cx} cy="30" r="3.5" fill="#334155" />
                        <circle cx={cx} cy="30" r="1.5" fill="#94A3B8" />
                      </g>
                    ))}
                  </g>

                  {/* Filled Truck (Green) */}
                  <g className="fill-[url(#truckGradWeight)]" clipPath="url(#weightFill)">
                    <path d="M2 5h78v20H2z" />
                  </g>

                  {/* Outline and Details */}
                  <g fill="none" stroke="#1E3A5F" strokeWidth="0.8" className="opacity-60">
                    <path d="M2 5h78v20H2z" />
                    <path d="M82 10h10a2 2 0 0 1 2 2v13h-12z" />
                    <path d="M82 10v15" />
                  </g>
                </svg>
              </div>
            </div>

            <div className="flex items-end justify-between">
              <div>
                <span className="text-3xl font-black text-[#1E3A5F] tracking-tighter">{totals.weight.toFixed(0)}</span>
                <span className="text-xs text-muted-foreground ml-1.5 font-black uppercase">Kg</span>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter mb-0.5">Capacidade Total</p>
                <p className="text-sm font-black text-[#1E3A5F]">{selectedDriver?.vehicleWeight || 0} Kg</p>
              </div>
            </div>
          </div>
        </div>
        
        {isEditing && (
          <div className="flex justify-end pb-10">
            <button 
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors font-semibold"
            >
              <Trash className="h-4 w-4" />
              Deletar Programação
            </button>
          </div>
        )}

        <FilterConfiguratorDialog
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          fields={filterFields}
          value={conditions}
          onApply={setConditions}
        />

        {/* Modal de envio WhatsApp por representante */}
        {sendModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <h2 className="text-base font-bold font-display text-foreground">Enviar Relatório de Entrega</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Selecione quais representantes devem receber a notificação.</p>
                </div>
                <button onClick={() => setSendModalOpen(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                  ✕
                </button>
              </div>

              {/* Lista de representantes */}
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
                {sendModalItems.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhum representante encontrado nos pedidos selecionados.</p>
                )}
                {sendModalItems.map((item, idx) => {
                  const jaNotificado = !!item.notificacao;
                  const notifDate = item.notificacao?.notificado_em
                    ? new Date(item.notificacao.notificado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                    : null;
                  const displayName = item.repName.replace(/^\d+\s*[-–]\s*/, '').trim() || item.repName;
                  return (
                    <div key={item.repKey} className={cn('rounded-xl border p-4 transition-colors', item.checked ? 'border-primary/40 bg-primary/5' : 'border-border bg-card')}>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={e => setSendModalItems(prev => prev.map((it, i) => i === idx ? { ...it, checked: e.target.checked } : it))}
                          className="mt-1 h-4 w-4 accent-primary cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-foreground">{displayName}</span>
                            {jaNotificado && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">
                                ✓ Notificado {notifDate}
                              </span>
                            )}
                            {!item.repPhone && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                                Sem telefone
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {item.orders.length} pedido(s): {item.orders.map(o => o.id).join(' · ')}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <label className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">Prev. Entrega:</label>
                            <input
                              type="date"
                              value={item.previsao}
                              onChange={e => setSendModalItems(prev => prev.map((it, i) => i === idx ? { ...it, previsao: e.target.value } : it))}
                              className="px-2 py-0.5 rounded-lg border border-input bg-background text-foreground font-mono-data text-xs focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border gap-3">
                <span className="text-xs text-muted-foreground">
                  {sendModalItems.filter(i => i.checked).length} de {sendModalItems.length} selecionado(s)
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSendModalOpen(false)}
                    className="px-4 py-2 rounded-lg border border-border bg-card text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
                    disabled={sending}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={executeSendWhatsapp}
                    disabled={sending || sendModalItems.filter(i => i.checked).length === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 text-white text-sm font-bold hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <MessageCircle className="h-4 w-4" />
                    {sending ? 'Enviando...' : 'Enviar Marcados'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateShipment;
