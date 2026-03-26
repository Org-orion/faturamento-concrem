import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ClipboardList } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import { PedidoStatusRow, PedidoStatusHistoricoRow, PedidoStatusValue } from '@/types';
import { ensurePedidosStatusInitializedBatch, listPedidosStatusByPedidoIds, listPedidosStatusHistorico } from '@/lib/pedidosStatusRepo';
import { comparePedidoStatus } from '@/lib/pedidoStatusFlow';
import { cn } from '@/lib/utils';
import { PainelPedidosFilters } from '@/pages/painelPedidos/PainelPedidosFilters';
import { PainelPedidosList } from '@/pages/painelPedidos/PainelPedidosList';
import { PainelPedidosDetails } from '@/pages/painelPedidos/PainelPedidosDetails';
import type { UnifiedPedido } from '@/pages/painelPedidos/types';

const PainelPedidos = () => {
  const { orders, supportOrders, user } = useApp();
  const { showToast } = useToast();

  const pedidos = useMemo(() => {
    const venda: UnifiedPedido[] = (orders || []).map((o) => ({
      id: o.id,
      numero: o.id,
      cliente: o.clientName || o.clientCode || 'Cliente',
      representante: o.representativeName || '-',
      valor: o.totalPedidoVenda ?? 0,
    }));
    const sup: UnifiedPedido[] = (supportOrders || []).map((o) => ({
      id: o.id,
      numero: o.id,
      cliente: o.clientName || o.clientCode || 'Cliente',
      representante: o.representativeName || '-',
      valor: o.totalPedidoVenda ?? 0,
    }));
    const map = new Map<string, UnifiedPedido>();
    for (const p of [...venda, ...sup]) map.set(p.id, p);
    return Array.from(map.values()).sort((a, b) => a.numero.localeCompare(b.numero));
  }, [orders, supportOrders]);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PedidoStatusValue | ''>('');
  const [statusRows, setStatusRows] = useState<PedidoStatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<PedidoStatusHistoricoRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const statusByPedidoId = useMemo(() => new Map(statusRows.map((r) => [r.pedido_id, r] as const)), [statusRows]);

  const refresh = async () => {
    setLoading(true);
    try {
      const payload = pedidos.map((p) => ({ pedidoId: p.id, numeroPedido: p.numero }));
      await ensurePedidosStatusInitializedBatch(payload, user?.username || null);
      const rows = await listPedidosStatusByPedidoIds(payload.map((p) => p.pedidoId));
      setStatusRows(rows);
    } catch (e: any) {
      console.error(e);
      showToast('Erro ao carregar status dos pedidos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [pedidos.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (q) {
        const hay = `${p.numero} ${p.cliente} ${p.representante}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const st = statusByPedidoId.get(p.id)?.status_atual;
      if (statusFilter && st !== statusFilter) return false;
      return true;
    });
  }, [pedidos, query, statusByPedidoId, statusFilter]);

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

  const sortedForPanel = useMemo(() => {
    return filtered
      .slice()
      .sort((a, b) => {
        const sa = statusByPedidoId.get(a.id)?.status_atual || 'aguardando_confirmacao';
        const sb = statusByPedidoId.get(b.id)?.status_atual || 'aguardando_confirmacao';
        return comparePedidoStatus(sa, sb) || a.numero.localeCompare(b.numero);
      });
  }, [filtered, statusByPedidoId]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-foreground">Painel de Pedidos</h1>
            <p className="text-sm text-muted-foreground">Acompanhe status e histórico de movimentação.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border hover:bg-muted/30 transition-colors text-sm font-semibold"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          <PainelPedidosFilters
            query={query}
            onQueryChange={setQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            count={sortedForPanel.length}
          />
          <PainelPedidosList pedidos={sortedForPanel} statusByPedidoId={statusByPedidoId} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        <div className="lg:col-span-4 space-y-4">
          <PainelPedidosDetails pedido={selected} statusAtual={selectedStatus} history={history} historyLoading={historyLoading} />
        </div>
      </div>
    </div>
  );
};

export default PainelPedidos;
