import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import { PedidoStatusHistoricoRow, PedidoStatusRow, PedidoStatusValue } from '@/types';
import { ensurePedidosStatusInitializedBatch, listPedidosStatusByPedidoIds, listPedidosStatusHistorico, updatePedidoStatus } from '@/lib/pedidosStatusRepo';
import { logisticaManualStatuses, getAutoFollowUpStatus } from '@/lib/pedidoStatusFlow';
import { AtualizacaoStatusList } from '@/pages/atualizacaoStatus/AtualizacaoStatusList';
import { AtualizacaoStatusDetails } from '@/pages/atualizacaoStatus/AtualizacaoStatusDetails';
import { StatusUpdateDialog } from '@/pages/atualizacaoStatus/StatusUpdateDialog';
import { useQueryParam } from '@/pages/atualizacaoStatus/useQueryParam';
import type { UnifiedPedido } from '@/pages/atualizacaoStatus/types';

const AtualizacaoStatus = () => {
  const { orders, supportOrders, user } = useApp();
  const { showToast } = useToast();
  const presetId = useQueryParam('pedido');

  const pedidos = useMemo(() => {
    const venda: UnifiedPedido[] = (orders || []).map((o) => ({
      id: o.id,
      numero: o.id,
      cliente: o.clientName || o.clientCode || 'Cliente',
      representante: o.representativeName || '-',
      repPhone: o.representativePhone || null,
    }));
    const sup: UnifiedPedido[] = (supportOrders || []).map((o) => ({
      id: o.id,
      numero: o.id,
      cliente: o.clientName || o.clientCode || 'Cliente',
      representante: o.representativeName || '-',
      repPhone: o.representativePhone || null,
    }));
    const map = new Map<string, UnifiedPedido>();
    for (const p of [...venda, ...sup]) map.set(p.id, p);
    return Array.from(map.values()).sort((a, b) => a.numero.localeCompare(b.numero));
  }, [orders, supportOrders]);

  const [query, setQuery] = useState('');
  const [statusRows, setStatusRows] = useState<PedidoStatusRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<PedidoStatusHistoricoRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const statusByPedidoId = useMemo(() => new Map(statusRows.map((r) => [r.pedido_id, r] as const)), [statusRows]);

  const refresh = async () => {
    const payload = pedidos.map((p) => ({ pedidoId: p.id, numeroPedido: p.numero }));
    await ensurePedidosStatusInitializedBatch(payload, user?.username || null);
    const rows = await listPedidosStatusByPedidoIds(payload.map((p) => p.pedidoId));
    setStatusRows(rows);
  };

  useEffect(() => {
    void refresh();
  }, [pedidos.length]);

  useEffect(() => {
    if (presetId) setSelectedId(presetId);
  }, [presetId]);

  // Filter: only show pedidos whose current status is in the logística manual statuses
  const logisticaPedidos = useMemo(() => {
    return pedidos.filter((p) => {
      const st = statusByPedidoId.get(p.id)?.status_atual;
      if (!st) return false;
      return logisticaManualStatuses.includes(st);
    });
  }, [pedidos, statusByPedidoId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logisticaPedidos.filter((p) => {
      if (!q) return true;
      const hay = `${p.numero} ${p.cliente} ${p.representante}`.toLowerCase();
      return hay.includes(q);
    });
  }, [logisticaPedidos, query]);

  const selected = useMemo(() => (selectedId ? pedidos.find((p) => p.id === selectedId) || null : null), [pedidos, selectedId]);
  const selectedStatus = (selectedId && statusByPedidoId.get(selectedId)?.status_atual) || null;

  useEffect(() => {
    let cancelled = false;
    const loadHist = async () => {
      if (!selectedId) {
        setHistory([]);
        return;
      }
      setHistoryLoading(true);
      const items = await listPedidosStatusHistorico(selectedId);
      if (cancelled) return;
      setHistory(items);
      setHistoryLoading(false);
    };
    void loadHist();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const [openUpdate, setOpenUpdate] = useState(false);

  const onSaved = async (newStatus?: PedidoStatusValue) => {
    // Handle auto follow-up transitions
    if (newStatus) {
      const followUp = getAutoFollowUpStatus(newStatus);
      if (followUp && selectedId) {
        const pedido = pedidos.find(p => p.id === selectedId);
        await updatePedidoStatus({
          pedidoId: selectedId,
          numeroPedido: pedido?.numero || selectedId,
          statusNovo: followUp,
          alteradoPor: 'sistema',
          observacao: `Transição automática: ${newStatus} → ${followUp}`,
        });
      }
    }

    await refresh();
    if (!selectedId) return;
    const items = await listPedidosStatusHistorico(selectedId);
    setHistory(items);
    showToast('Status atualizado com sucesso!');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
          <ClipboardCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Atualização de Status</h1>
          <p className="text-sm text-muted-foreground">Atualize etapas manuais de mapeamento, ferragem e produção.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6">
          <AtualizacaoStatusList
            query={query}
            onQueryChange={setQuery}
            pedidos={filtered}
            statusByPedidoId={statusByPedidoId}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        <div className="lg:col-span-6">
          <AtualizacaoStatusDetails
            pedido={selected}
            statusAtual={selectedStatus}
            history={history}
            historyLoading={historyLoading}
            onOpenUpdate={() => setOpenUpdate(true)}
          />
        </div>
      </div>

      <StatusUpdateDialog
        open={openUpdate}
        onOpenChange={setOpenUpdate}
        pedido={selected ? { id: selected.id, numero: selected.numero, cliente: selected.cliente, repPhone: selected.repPhone } : null}
        statusAtual={selectedStatus}
        userName={user?.username || null}
        onSaved={async (newStatus) => { await onSaved(newStatus); }}
        onNotifyResult={(res) => {
          if (!res.attempted) return;
          if (res.ok) showToast('Notificação enviada ao representante via WhatsApp.');
          else showToast(res.error || 'Falha ao enviar notificação via WhatsApp.', 'error');
        }}
      />
    </div>
  );
};

export default AtualizacaoStatus;
