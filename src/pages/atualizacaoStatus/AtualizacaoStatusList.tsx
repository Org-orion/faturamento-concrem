import React from 'react';
import { PedidoStatusBadge } from '@/components/pedidos/PedidoStatusBadge';
import { PedidoStatusValue } from '@/types';
import { cn } from '@/lib/utils';
import { UnifiedPedido, PedidoStatusById } from './types';
import { fmtDateTime } from '@/lib/dateUtils';

export function AtualizacaoStatusList({
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
  return (
    <div className="space-y-3">
        {pedidos.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-10 text-center text-muted-foreground">Nenhum pedido confirmado encontrado.</div>
        ) : (
          pedidos.map((p) => {
            const st: PedidoStatusValue = statusByPedidoId.get(p.id)?.status_atual || 'aguardando_avaliacao';
            const sel = selectedId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p.id)}
                className={cn(
                  'w-full text-left bg-card rounded-xl border border-border p-4 shadow-card hover:bg-muted/10 transition-colors',
                  sel && 'ring-2 ring-primary/30 border-primary/40',
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{p.cliente}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      <span className="font-mono-data font-bold text-primary">{p.numero}</span>
                      <span className="mx-2">•</span>
                      <span className="font-semibold">{p.representante}</span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <PedidoStatusBadge value={st} />
                    <div className="mt-1 text-[11px] text-muted-foreground font-mono-data text-right">{fmtDateTime(statusByPedidoId.get(p.id)?.atualizado_em)}</div>
                  </div>
                </div>
              </button>
            );
          })
        )}
    </div>
  );
}

