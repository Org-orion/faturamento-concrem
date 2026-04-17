import React from 'react';
import { Check, Clock3 } from 'lucide-react';
import { PedidoStatusValue } from '@/types';
import { getStageState, getEffectiveStatusForTimeline, panelTimelineStages } from '@/lib/pedidoStatusFlow';
import { cn } from '@/lib/utils';

export function PedidoTimelineStages({
  statusAtual,
  history,
}: {
  statusAtual: PedidoStatusValue;
  history?: Array<{ status_novo: PedidoStatusValue }>;
}) {
  const effectiveStatus = history?.length
    ? getEffectiveStatusForTimeline(statusAtual, history)
    : statusAtual;

  return (
    <div className="flex items-center gap-3">
      {panelTimelineStages.map((st, idx) => {
        const state = getStageState(effectiveStatus, st.id, history);
        const circle =
          state === 'done'
            ? 'bg-emerald-500 text-white border-emerald-500'
            : state === 'current'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-muted text-muted-foreground border-border';
        const line = state === 'future' ? 'bg-border/60' : 'bg-primary/30';

        return (
          <div key={st.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={cn('w-6 h-6 rounded-full border flex items-center justify-center', circle)}>
                {state === 'done' ? <Check className="h-3.5 w-3.5" /> : state === 'current' ? <Clock3 className="h-3.5 w-3.5" /> : null}
              </div>
              <div className="mt-1 text-[10px] font-bold text-muted-foreground uppercase tracking-tight whitespace-nowrap">{st.label}</div>
            </div>
            {idx < panelTimelineStages.length - 1 && <div className={cn('h-[2px] w-8 mx-2 rounded-full', line)} />}
          </div>
        );
      })}
    </div>
  );
}

