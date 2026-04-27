import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { PedidoStatusBadge } from '@/components/pedidos/PedidoStatusBadge';
import { PedidoStatusValue } from '@/types';
import { cn } from '@/lib/utils';
import { UnifiedPedido, PedidoStatusById } from './types';
import { fmtDateTime } from '@/lib/dateUtils';
import { usePrioridades } from '@/contexts/PrioridadesContext';
import { useAtencao } from '@/contexts/AtencaoContext';
import { PrioridadeIcon, AtencaoIcon } from '@/components/pedidos/PrioridadeBadge';

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
  const { map: prioMap } = usePrioridades();
  const { map: atencaoMap } = useAtencao();
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: pedidos.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88, // card height ~76px + gap 12px
    overscan: 5,
    gap: 12,
  });

  if (pedidos.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-10 text-center text-muted-foreground">
        Nenhum pedido confirmado encontrado.
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="overflow-auto"
      style={{ height: 'calc(100vh - 310px)', minHeight: '400px' }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: 'relative',
          width: '100%',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const p = pedidos[virtualRow.index];
          const st: PedidoStatusValue = statusByPedidoId.get(p.id)?.status_atual || 'aguardando_avaliacao';
          const sel = selectedId === p.id;
          return (
            <div
              key={p.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                className={cn(
                  'w-full text-left bg-card rounded-xl border border-border p-4 shadow-card hover:bg-muted/10 transition-colors',
                  sel && 'ring-2 ring-primary/30 border-primary/40',
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">{p.cliente}</span>
                      {prioMap.has(p.id) && (<PrioridadeIcon nivel={prioMap.get(p.id)!.nivel} motivo={prioMap.get(p.id)!.motivo} />)}{atencaoMap.has(p.id) && (<AtencaoIcon motivo={atencaoMap.get(p.id)!.motivo} />)}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      <span className="font-mono-data font-bold text-primary">{p.numero}</span>
                      <span className="mx-2">•</span>
                      <span className="font-semibold">{p.representante}</span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <PedidoStatusBadge value={st} />
                    <div className="mt-1 text-[11px] text-muted-foreground font-mono-data text-right">
                      {fmtDateTime(statusByPedidoId.get(p.id)?.atualizado_em)}
                    </div>
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
