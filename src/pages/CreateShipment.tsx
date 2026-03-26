import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import { Order } from '@/types';
import { 
  FormField, 
  inputClass, 
  btnPrimary, 
  btnDanger, 
  formatCurrency, 
  getOrderTotal 
} from '@/components/shared';
import { ArrowLeft, Check, Search, Truck, Package, Info, Save, MoreVertical, FileText, Upload, Eye, Trash, FileCheck, ArrowUp, ArrowDown, ChevronRight, ChevronLeft, MessageCircle, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { findRepresentanteContato, insertNotificacaoRepresentante, upsertEntregasDetalhesSafe } from '@/lib/opsRepo';
import { setPedidoStatusWithOptionalNotify, syncEntregaStatusFromOps, listPedidosStatusByPedidoIds, updatePedidoStatus } from '@/lib/pedidosStatusRepo';
import type { FilterCondition, FilterField } from '@/lib/filters';
import { FilterConfiguratorDialog } from '@/components/filters/FilterConfiguratorDialog';
import { FilterTriggerButton } from '@/components/filters/FilterTriggerButton';
import { ActiveFiltersChips } from '@/components/filters/ActiveFiltersChips';
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

  const isEditing = Boolean(id);
  const [driverId, setDriverId] = useState('');
  type ShipmentStatus = 'Aguardando Despacho' | 'Despachado' | 'Em Rota' | 'Entregue' | 'Cancelado';
  const [shipmentStatus, setShipmentStatus] = useState<ShipmentStatus>('Aguardando Despacho');
  const [freightValue, setFreightValue] = useState(0);
  const [shipmentDate, setShipmentStatusDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [deliveredOrderIds, setDeliveredOrderIds] = useState<string[]>([]);
  const [orderAttachments, setOrderAttachments] = useState<Record<string, { proof?: File; invoice?: File }>>({});
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
          return `${client?.address.city || ''}/${client?.address.state || ''}`;
        },
        placeholder: 'Cidade ou Estado...',
      },
      {
        id: 'expiry',
        label: 'Filtrar Previsão',
        type: 'text',
        getValue: (o: Order) => o.expiryDate || '',
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
        setFreightValue(loadToEdit.freightValue || 0);
        setShipmentStatusDate(loadToEdit.plannedDate || new Date().toISOString().split('T')[0]);
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

  useEffect(() => {
    const totalFreight = selectedOrderIds.reduce((acc, orderId) => {
      const order = orders.find(o => o.id === orderId);
      return acc + (order?.freightValue || 0);
    }, 0);
    setFreightValue(totalFreight);
  }, [selectedOrderIds, orders]);

  const selectedDriver = drivers.find(d => d.id === driverId);

  // --- Pedido status tracking for new flow ---
  const [pedidoStatusRows, setPedidoStatusRows] = useState<import('@/types').PedidoStatusRow[]>([]);
  const pedidoStatusMap = useMemo(() => new Map(pedidoStatusRows.map(r => [r.pedido_id, r] as const)), [pedidoStatusRows]);

  useEffect(() => {
    const ids = orders.map(o => o.id);
    if (!ids.length) return;
    void listPedidosStatusByPedidoIds(ids).then(setPedidoStatusRows);
  }, [orders.length]);

  const availableOrders = orders.filter(o => {
    const pedidoStatus = pedidoStatusMap.get(o.id)?.status_atual;
    const isAllowedStatus = pedidoStatus === 'liberado_producao' && !o.carregamentoId;
    const isCurrentInEdit = isEditing && selectedOrderIds.includes(o.id);

    if (!(isAllowedStatus || isCurrentInEdit) || selectedOrderIds.includes(o.id)) return false;

    const client = clients.find(c => c.id === o.clientId);
    const cityState = `${client?.address.city || ''}/${client?.address.state || ''}`;

    const matchesId = o.id.toLowerCase().includes(filters.id.toLowerCase());
    const matchesClient = (o.representativeName || '').toLowerCase().includes(filters.client.toLowerCase());
    const matchesRep = (o.representativePhone || '').toLowerCase().includes(filters.representative.toLowerCase());
    const matchesCity = cityState.toLowerCase().includes(filters.city.toLowerCase());
    const matchesExpiry = (o.expiryDate || '').toLowerCase().includes(filters.expiry.toLowerCase());

    return matchesId && matchesClient && matchesRep && matchesCity && matchesExpiry;
  });

  const toggleOrder = (orderId: string) => {
    setSelectedOrderIds(prev => 
      prev.includes(orderId) ? prev.filter(oid => oid !== orderId) : [...prev, orderId]
    );
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

  const handlePrint = () => {
    const driver = drivers.find((d) => d.id === driverId);
    const driverName = driver?.name || 'NÃO SELECIONADO';
    const vehicleType = driver?.vehicleType || '-';

    const totalGeral = selectedOrderIds.reduce((acc, orderId) => {
      const order = orders.find((o) => o.id === orderId);
      return acc + (order ? (order.totalPedidoVenda || getOrderTotal(order)) : 0);
    }, 0);

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>RELATÓRIO GERAL DE CARREGAMENTOS</title>
          <style>
            @page { size: A4; margin: 14mm; }
            body { font-family: Arial, Helvetica, sans-serif; color: #000; }
            .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 14px; }
            .logo { font-weight: 900; font-size: 18px; }
            .title { text-align:center; font-weight: 900; font-size: 14px; letter-spacing: .6px; }
            .meta { text-align:right; font-weight: 700; font-size: 11px; }
            .info { display:flex; justify-content:space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 14px; }
            .info div { font-weight: 800; font-size: 12px; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; text-transform: uppercase; }
            th, td { border: 1px solid #000; padding: 8px; }
            th { font-weight: 900; background: #fff; }
            tfoot td { font-weight: 900; }
            .right { text-align:right; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">CONCREM</div>
            <div class="title">RELATÓRIO GERAL DE CARREGAMENTOS / CONCREM INDUSTRIAL LTDA</div>
            <div class="meta">
              <div>DATA: ${new Date(shipmentDate).toLocaleDateString('pt-BR')}</div>
              <div>MOTORISTA: ${String(driverName).toUpperCase()}</div>
            </div>
          </div>

          <div class="info">
            <div>MOTORISTA: ${String(driverName).toUpperCase()}</div>
            <div>DATA: ${new Date(shipmentDate).toLocaleDateString('pt-BR')}</div>
            <div>VEÍCULO: ${String(vehicleType).toUpperCase()}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>MOTORISTA</th>
                <th>DATA</th>
                <th>Nº PEDIDO</th>
                <th>EMPRESA</th>
                <th class="right">VALOR</th>
              </tr>
            </thead>
            <tbody>
              ${selectedOrderIds
                .map((orderId) => {
                  const order = orders.find((o) => o.id === orderId);
                  const client = order ? clients.find((c) => c.id === order.clientId) : undefined;
                  const total = order ? (order.totalPedidoVenda || getOrderTotal(order)) : 0;
                  const company = client ? `${client.id} - ${client.name}` : '-';
                  const dateStr = new Date(shipmentDate).toLocaleDateString('pt-BR');
                  return `
                    <tr>
                      <td>${String(driverName).toUpperCase()}</td>
                      <td>${dateStr}</td>
                      <td>${String(orderId).toUpperCase()}</td>
                      <td>${String(company).toUpperCase()}</td>
                      <td class="right">${formatCurrency(total)}</td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4" class="right">TOTAL GERAL</td>
                <td class="right">${formatCurrency(totalGeral)}</td>
              </tr>
            </tfoot>
          </table>

          <script>
            window.onload = () => window.print();
          </script>
        </body>
      </html>
    `;

    const w = window.open('', '_blank');
    if (!w) {
      showToast('Popup bloqueado ao gerar PDF. Permita popups para este site.', 'error');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const sendReportWhatsapp = async () => {
    const deliveredOrders = deliveredOrderIds
      .map((id) => orders.find((o) => o.id === id))
      .filter(Boolean) as Order[];

    if (deliveredOrders.length === 0) {
      showToast('Selecione pedidos como Entregue para enviar no WhatsApp', 'error');
      return;
    }

    const driver = drivers.find((d) => d.id === driverId);
    const driverName = driver?.name || '-';
    const driverPhone = driver?.phone || '-';

    const byRep = new Map<string, Order[]>();
    for (const o of deliveredOrders) {
      const repKey = String(o.representativeId || o.representativeName || '').trim();
      const list = byRep.get(repKey) || [];
      list.push(o);
      byRep.set(repKey, list);
    }

    for (const [repKey, repOrders] of byRep.entries()) {
      let repInfo = await findRepresentanteContato(repKey);
      const repNameFromPedido = String(repOrders[0]?.representativeName || '').trim();
      if (!repInfo && repNameFromPedido && repNameFromPedido !== repKey) {
        repInfo = await findRepresentanteContato(repNameFromPedido);
      }
      const repName = repInfo?.nome || repOrders[0]?.representativeName || 'Desconhecido';
      const repPhoneRaw = repInfo?.telefone || repOrders[0]?.representativePhone || '';

      let message = `Boa tarde\nCarregamento Referente ao dia ${new Date(shipmentDate).toLocaleDateString('pt-BR')}\n\n`;

      for (const order of repOrders) {
        const client = clients.find((c) => c.id === order.clientId);
        const nf = invoiceNumbers[order.id] || 'S/N';
        message += `· ${nf} - ${client?.name || 'Cliente'}\n`;
      }

      message += `\nPrevisão de entrega a partir do dia ${new Date(shipmentDate).toLocaleDateString('pt-BR')}.\n\n`;
      message += `Gentileza contatar o motorista para informações sobre o local de entrega.\nLembrando a importância do representante sempre acompanhar a descarga.\n\n`;
      message += `MOTORISTA / CONTATO\n${driverName} - ${driverPhone}\n`;

      if (repPhoneRaw) {
        const digits = String(repPhoneRaw).replace(/\D/g, '');
        const phoneE164 = digits.startsWith('55') ? digits : `55${digits}`;
        const whatsappUrl = `https://wa.me/${phoneE164}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
      } else {
        showToast(`Representante ${repName} sem telefone cadastrado.`, 'error');
      }

      if (id) {
        void insertNotificacaoRepresentante(id, repKey);
      }
    }
  };

  const calculateTotals = () => {
    return selectedOrderIds.reduce((acc, orderId) => {
      const order = orders.find(o => o.id === orderId) ?? supportOrders.find(o => o.id === orderId);
      if (!order) return acc;
      const orderVolume = order.totalQtdM3 || 0;
      const orderWeight = 0; // Placeholder — conectar ao campo de peso quando adicionado no Supabase
      return {
        volume: acc.volume + orderVolume,
        weight: acc.weight + orderWeight
      };
    }, { volume: 0, weight: 0 });
  };

  const totals = calculateTotals();
  const volumePercentage = selectedDriver?.vehicleVolume ? Math.round((totals.volume / selectedDriver.vehicleVolume) * 100) : 0;
  const weightPercentage = selectedDriver?.vehicleWeight ? Math.round((totals.weight / selectedDriver.vehicleWeight) * 100) : 0;

  const handleFileUpload = (orderId: string, type: 'proof' | 'invoice') => {
    // In a real app, this would trigger a file picker and upload
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = type === 'proof' ? 'image/*,application/pdf' : '.xml,.pdf';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        setOrderAttachments((prev) => ({
          ...prev,
          [orderId]: { ...(prev[orderId] || {}), [type]: file },
        }));
        showToast(`${type === 'proof' ? 'Comprovante' : 'Nota Fiscal'} anexada: ${file.name}`);
        const order = orders.find((o) => o.id === orderId);
        if (order) {
          const repId = String(order.representativeId || '').trim();
          const repName = String(order.representativeName || '').trim();
          const repContact = repContacts[repId] || repContacts[repName];
          const repPhone = repContact?.telefone || order.representativePhone || null;
          const clienteNome = order.clientName || order.clientCode || 'Cliente';
          const statusNovo = type === 'invoice' ? 'faturado' : 'aguardando_pagamento';
          void setPedidoStatusWithOptionalNotify({
            pedidoId: orderId,
            numeroPedido: orderId,
            statusNovo,
            alteradoPor: user?.username || null,
            observacao: null,
            notifyRepresentante: true,
            representantePhoneRaw: repPhone,
            clienteNome,
          });
        }
      }
    };
    input.click();
  };

  const [orderSequence, setOrderSequence] = useState<Record<string, number>>({});
  const [invoiceNumbers, setInvoiceNumbers] = useState<Record<string, string>>({});
  const [repContacts, setRepContacts] = useState<Record<string, { nome: string | null; telefone: string | null; endereco: string | null }>>({});

  useEffect(() => {
    let cancelled = false;
    const loadReps = async () => {
      const repKeys = Array.from(
        new Set(
          selectedOrderIds
            .map((oid) => orders.find((o) => o.id === oid))
            .filter(Boolean)
            .flatMap((o) => {
              const id = String((o as any).representativeId || '').trim();
              const name = String((o as any).representativeName || '').trim();
              return [id, name].filter(Boolean);
            })
            .filter(Boolean),
        ),
      );

      if (repKeys.length === 0) return;

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
  }, [orders, selectedOrderIds]);

  const saveReport = async () => {
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

      await upsertEntregasDetalhesSafe(
        id,
        sortedOrderIds.map((pedidoId) => ({
          pedido_id: pedidoId,
          status: deliveredOrderIds.includes(pedidoId) ? 'entregue' : 'pendente',
          entregue_em: deliveredOrderIds.includes(pedidoId) ? new Date().toISOString() : null,
          numero_nota: invoiceNumbers[pedidoId] || null,
          ordem_entrega: orderSequence[pedidoId] ?? null,
        })),
      );

      await Promise.all(
        sortedOrderIds.map(async (pedidoId) => {
          const order = orders.find((o) => o.id === pedidoId);
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

    try {
      if (isEditing && id) {
        const old = loads.find((x) => x.id === id);
        if (!old) return;
        await updateLoad({
          ...old,
          driverId,
          orderIds: selectedOrderIds,
          plannedDate: shipmentDate,
          shipmentStatus: shipmentStatus,
          estimatedWeight: totals.weight,
          freightValue,
        });
        showToast('Programação atualizada com sucesso!');
      } else {
        await addLoad({
          driverId,
          orderIds: selectedOrderIds,
          plannedDate: shipmentDate,
          obs: '',
          productionStatus: 'Aguardando Produção',
          shipmentStatus: shipmentStatus,
          estimatedWeight: totals.weight,
          freightValue,
        });
        showToast('Programação criada com sucesso!');
      }

      // Auto-update pedido_status based on shipment status
      const statusMap: Record<string, import('@/types').PedidoStatusValue> = {
        'Em Rota': 'em_entrega',
        'Entregue': 'entregue',
      };
      const targetStatus = statusMap[shipmentStatus];
      if (targetStatus) {
        const username = user?.username || null;
        for (const orderId of selectedOrderIds) {
          await updatePedidoStatus({
            pedidoId: orderId,
            numeroPedido: orderId,
            statusNovo: targetStatus,
            alteradoPor: username,
            observacao: `Atualização automática: embarque ${shipmentStatus}`,
          });
        }
      }

      navigate('/carregamento');
    } catch (e: any) {
      console.error(e);
      showToast('Erro ao salvar programação.', 'error');
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
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

            <FormField label="Data da Embarcação">
              <input 
                type="date" 
                className={inputClass} 
                value={shipmentDate} 
                onChange={e => setShipmentStatusDate(e.target.value)}
              />
            </FormField>

            <FormField label="Valor do Frete (R$)">
              <input 
                type="number" 
                className={inputClass} 
                placeholder="0,00"
                value={freightValue} 
                onChange={e => setFreightValue(Number(e.target.value))}
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
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Search className="h-3 w-3" />
              Use o botão para filtrar
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 mb-4 px-3">
            <ActiveFiltersChips
              fields={filterFields}
              conditions={conditions}
              onRemove={(id) => setConditions((prev) => prev.filter((c) => c.id !== id))}
              onClear={() => setConditions([])}
              className="flex-1"
            />
            <FilterTriggerButton count={conditions.length} onClick={() => setFiltersOpen(true)} />
          </div>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4 pb-2">
            {/* Seção de Selecionados (Vertical) */}
            {selectedOrderIds.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] px-1 mb-3">Pedidos Selecionados ({selectedOrderIds.length})</h4>
                <div className="grid grid-cols-1 gap-2">
                  {selectedOrderIds.map(id => {
                    const order = orders.find(o => o.id === id);
                    if (!order) return null;
                    const client = clients.find(c => c.id === order.clientId);
                    return (
                      <div 
                        key={id} 
                        onClick={() => toggleOrder(id)}
                        className="flex items-center justify-between p-3 rounded-lg border-2 border-primary bg-primary/5 cursor-pointer hover:bg-primary/10 transition-all group relative overflow-hidden"
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                        <div className="flex items-center gap-4 pl-2">
                          <div className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center shadow-sm">
                            <Check className="h-3 w-3" />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 flex-1 items-center">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-sm font-mono-data">{order.id}</p>
                                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Embarcado</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground font-medium">Nº Pedido</p>
                            </div>
                            <div>
                              <p className="font-bold text-sm text-primary truncate max-w-[150px]">{order.representativeName || '-'}</p>
                              <p className="text-[10px] text-muted-foreground font-medium">Representante</p>
                            </div>
                            <div>
                              <p className="font-bold text-sm font-mono-data">{order.representativePhone || '-'}</p>
                              <p className="text-[10px] text-muted-foreground font-medium">Tel. Rep.</p>
                            </div>
                            <div>
                              <p className="font-bold text-sm truncate">{client?.address.city}/{client?.address.state}</p>
                              <p className="text-[10px] text-muted-foreground font-medium">Cidade/UF</p>
                            </div>
                            <div>
                              <p className="font-bold text-sm text-amber-600">{order.expiryDate}</p>
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
              <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-1 mb-3">Disponíveis para Adicionar</h4>
              {availableOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground bg-muted/10 rounded-xl border border-dashed border-border">
                  <Package className="h-8 w-8 mb-2 opacity-20" />
                  <p className="italic text-sm">Nenhum pedido disponível no momento.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {availableOrders.map(order => {
                    const client = clients.find(c => c.id === order.clientId);
                    return (
                      <div 
                        key={order.id} 
                        onClick={() => toggleOrder(order.id)}
                        className="flex items-center justify-between p-3 rounded-lg border border-border bg-card cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all group"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className="w-5 h-5 rounded-full border-2 border-muted group-hover:border-primary transition-colors bg-white shrink-0" />
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 flex-1 items-center">
                            <div>
                              <p className="font-bold text-sm font-mono-data text-foreground/80 group-hover:text-foreground">{order.id}</p>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Nº Pedido</p>
                            </div>
                            <div>
                              <p className="font-bold text-sm text-primary/80 group-hover:text-primary truncate max-w-[150px]">{order.representativeName || '-'}</p>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Representante</p>
                            </div>
                            <div>
                              <p className="font-bold text-sm font-mono-data">{order.representativePhone || '-'}</p>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Tel. Rep.</p>
                            </div>
                            <div>
                              <p className="font-bold text-sm truncate">{client?.address.city}/{client?.address.state}</p>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Cidade/UF</p>
                            </div>
                            <div>
                              <p className="font-bold text-sm text-foreground">{order.expiryDate}</p>
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
              <button 
                onClick={sendReportWhatsapp}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors font-display text-xs font-bold uppercase tracking-tight"
                title="Enviar para o motorista"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Enviar
              </button>
              <button 
                onClick={saveReport}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors font-display text-xs font-bold uppercase tracking-tight"
              >
                <Save className="h-3.5 w-3.5" />
                Salvar
              </button>
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
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">N° Pedido</th>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Representante</th>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Tel. Rep.</th>
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
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Representante</th>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Contato</th>
                      <th className="py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px] text-right">Valor Total</th>
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
                    const order = orders.find(o => o.id === id);
                    if (!order) return null;
                    const client = clients.find(c => c.id === order.clientId);
                    // Find invoice that contains this order
                    const invoice = invoices.find(inv => inv.orderIds.includes(id));
                    
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
                                  <td className="py-3 px-4 font-mono-data font-bold text-primary">{order.id}</td>
                                  <td className="py-3 px-4 font-medium">
                                    {repContact?.nome || order.representativeName || '-'}
                                  </td>
                                  <td className="py-3 px-4 font-mono-data text-xs">
                                    {repContact?.telefone || order.representativePhone || '-'}
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
                                  <td className="py-3 px-4 truncate max-w-[200px]" title={repAddress ? `${repAddress.street}, ${repAddress.number} - ${repAddress.neighborhood}` : `${client?.address.street}, ${client?.address.number} - ${client?.address.neighborhood}`}>
                                    {repAddress ? `${repAddress.street}, ${repAddress.number}` : (client ? `${client.address.street}, ${client.address.number}` : '-')}
                                  </td>
                                  <td className="py-3 px-4 truncate max-w-[150px]" title={repAddress?.city || client?.address.city}>
                                    {repAddress?.city || client?.address.city || '-'}
                                  </td>
                                  <td className="py-3 px-4 font-mono-data font-bold text-center">
                                    {repAddress?.state || client?.address.state || '-'}
                                  </td>
                                </>
                              )}

                              {reportPage === 2 && (
                                <>
                                  <td
                                    className="py-3 px-4 font-medium truncate max-w-[150px]"
                                    title={repContact?.nome || order?.representativeName}
                                  >
                                    {repContact?.nome || order?.representativeName || '-'}
                                  </td>
                                  <td className="py-3 px-4 font-mono-data text-xs">
                                    {repContact?.telefone || order?.representativePhone || '-'}
                                  </td>
                                  <td className="py-3 px-4 font-mono-data font-bold text-right text-[#1E3A5F]">
                                    {formatCurrency(order?.totalPedidoVenda || getOrderTotal(order))}
                                  </td>
                                </>
                              )}

                              {reportPage === 3 && (
                                <>
                                  <td className="py-3 px-4 text-center">
                                    <div className="flex justify-center">
                                      <button 
                                        onClick={() => toggleDelivered(id)}
                                        className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                                          deliveredOrderIds.includes(id) 
                                            ? 'bg-primary border-primary text-primary-foreground' 
                                            : 'border-muted-foreground/30 hover:border-primary/50'
                                        }`}
                                      >
                                        {deliveredOrderIds.includes(id) && <Check className="h-3.5 w-3.5" />}
                                      </button>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <input 
                                      type="number" 
                                      className="w-16 bg-transparent border-b border-border focus:border-primary focus:outline-none text-center font-mono-data text-sm no-spinner"
                                      placeholder="0"
                                    />
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <input 
                                      type="number" 
                                      className="w-16 bg-transparent border-b border-border focus:border-primary focus:outline-none text-center font-mono-data text-sm no-spinner"
                                      placeholder="0"
                                    />
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <input 
                                      type="number" 
                                      className="w-16 bg-transparent border-b border-border focus:border-primary focus:outline-none text-center font-mono-data text-sm no-spinner"
                                      placeholder="0"
                                    />
                                  </td>
                                </>
                              )}

                              <td className="py-3 px-4 text-center sticky right-0 bg-card group-hover:bg-muted/30 z-10 border-l border-border/50">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button className="p-1 hover:bg-muted rounded-full transition-colors">
                                      <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Ações</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="cursor-pointer">
                                      <FileText className="mr-2 h-4 w-4" /> Gerar formulário
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer" onClick={() => handleFileUpload(id, 'proof')}>
                                      <Upload className="mr-2 h-4 w-4" /> Anexar comprovante
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer">
                                      <Eye className="mr-2 h-4 w-4" /> Ver comprovante
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="cursor-pointer" onClick={() => handleFileUpload(id, 'invoice')}>
                                      <Upload className="mr-2 h-4 w-4" /> Anexar Nota Fiscal
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer">
                                      <FileCheck className="mr-2 h-4 w-4" /> Ver Nota Fiscal
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      className="text-destructive focus:text-destructive cursor-pointer"
                                      onClick={() => removeOrder(id)}
                                    >
                                      <Trash className="mr-2 h-4 w-4" /> Remover Pedido
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
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
      </div>
    </div>
  );
};

export default CreateShipment;
