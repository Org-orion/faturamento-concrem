import React from 'react';
import { PedidoStatusBadge } from '@/components/pedidos/PedidoStatusBadge';
import { PedidoTimelineStages } from '@/components/pedidos/PedidoTimelineStages';
import { PedidoStatusValue } from '@/types';
import { cn } from '@/lib/utils';
import { UnifiedPedido, PedidoStatusById } from './types';
import { fmtDateTime } from '@/lib/dateUtils';

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

export function PainelPedidosList({
  pedidos,
  statusByPedidoId,
  selectedId,
  onSelect,
}: {
  pedidos: UnifiedPedido[];
  statusByPedidoId: PedidoStatusById;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!pedidos.length) {
    return (
      <div className="bg-card rounded-xl border border-border p-10 text-center text-muted-foreground">
        Nenhum pedido encontrado.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pedidos.map((p) => {
        const st: PedidoStatusValue = statusByPedidoId.get(p.id)?.status_atual || 'aguardando_avaliacao';
        const selected = selectedId === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={cn(
              'w-full text-left bg-card rounded-xl border border-border p-4 shadow-card hover:shadow-md hover:bg-muted/10 transition-all',
              selected && 'ring-2 ring-primary/30 border-primary/40',
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <div className="font-bold text-foreground truncate">{p.cliente}</div>
                  <PedidoStatusBadge value={st} />
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  <span className="font-mono-data font-bold text-primary">{p.numero}</span>
                  <span className="mx-2">•</span>
                  <span className="font-semibold">{p.representante}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold text-[#1E3A5F]">{formatCurrency(p.valor)}</div>
                <div className="text-[11px] text-muted-foreground font-mono-data">Atualizado: {fmtDateTime(statusByPedidoId.get(p.id)?.atualizado_em)}</div>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <div className="min-w-[620px]">
                <PedidoTimelineStages statusAtual={st} />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

