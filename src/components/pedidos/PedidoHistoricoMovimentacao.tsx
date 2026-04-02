import React from 'react';
import { ArrowRight } from 'lucide-react';
import { PedidoStatusHistoricoRow } from '@/types';
import { getPedidoStatusBadgeClass, getPedidoStatusLabel } from '@/lib/pedidoStatusFlow';
import { cn } from '@/lib/utils';
import { fmtDateTime } from '@/lib/dateUtils';

export function PedidoHistoricoMovimentacao({ items }: { items: PedidoStatusHistoricoRow[] }) {
  if (!items.length) {
    return (
      <div className="rounded-xl border border-border bg-muted/10 p-6 text-sm text-muted-foreground">
        Nenhuma movimentação registrada.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((it) => {
        const prev = it.status_anterior ? getPedidoStatusLabel(it.status_anterior) : '—';
        const next = getPedidoStatusLabel(it.status_novo);
        const when = fmtDateTime(it.alterado_em);

        return (
          <div key={it.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold', it.status_anterior ? getPedidoStatusBadgeClass(it.status_anterior) : 'bg-muted text-muted-foreground border border-border')}>
                    {prev}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold', getPedidoStatusBadgeClass(it.status_novo))}>
                    {next}
                  </span>
                </div>
                {it.observacao && String(it.observacao).trim() && (
                  <div className="mt-2 text-sm text-foreground/90 whitespace-pre-wrap">{it.observacao}</div>
                )}
              </div>

              <div className="text-right shrink-0">
                <div className="text-xs font-bold text-foreground">{it.alterado_por || '-'}</div>
                <div className="text-[11px] text-muted-foreground font-mono-data">{when}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

