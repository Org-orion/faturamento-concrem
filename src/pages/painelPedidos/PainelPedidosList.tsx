import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { PedidoStatusBadge } from '@/components/pedidos/PedidoStatusBadge';
import { PedidoTimelineStages } from '@/components/pedidos/PedidoTimelineStages';
import { PedidoStatusValue, PedidoStatusHistoricoRow } from '@/types';
import { cn } from '@/lib/utils';
import { UnifiedPedido, PedidoStatusById } from './types';
import { fmtDateTime } from '@/lib/dateUtils';
import { usePrioridades } from '@/contexts/PrioridadesContext';
import { useAtencao } from '@/contexts/AtencaoContext';
import { PrioridadeIcon, AtencaoIcon } from '@/components/pedidos/PrioridadeBadge';

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function PainelPedidosList({
  pedidos,
  statusByPedidoId,
  selectedId,
  selectedHistory,
  onSelect,
}: {
  pedidos: UnifiedPedido[];
  statusByPedidoId: PedidoStatusById;
  selectedId: string | null;
  selectedHistory?: PedidoStatusHistoricoRow[];
  onSelect: (id: string) => void;
}) {
  const { map: prioMap } = usePrioridades();
  const { map: atencaoMap } = useAtencao();
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: pedidos.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 164, // card (~76px) + timeline row (~76px) + gap 12px
    overscan: 5,
    gap: 12,
  });

  if (!pedidos.length) {
    return (
      <div className="bg-card rounded-xl border border-border p-10 text-center text-muted-foreground">
        Nenhum pedido encontrado.
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
          const selected = selectedId === p.id;
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
                  'w-full text-left bg-card rounded-xl border border-border p-4 shadow-card hover:shadow-md hover:bg-muted/10 transition-all',
                  selected && 'ring-2 ring-primary/30 border-primary/40',
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="font-bold text-foreground truncate">{p.cliente}</div>
                      {prioMap.has(p.id) && (<PrioridadeIcon nivel={prioMap.get(p.id)!.nivel} motivo={prioMap.get(p.id)!.motivo} />)}{atencaoMap.has(p.id) && (<AtencaoIcon motivo={atencaoMap.get(p.id)!.motivo} />)}
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
                    <div className="text-[11px] text-muted-foreground font-mono-data">
                      Atualizado: {fmtDateTime(statusByPedidoId.get(p.id)?.atualizado_em)}
                    </div>
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <div className="min-w-[620px]">
                    <PedidoTimelineStages
                      statusAtual={st}
                      history={selected ? selectedHistory : undefined}
                    />
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
