import React from 'react';
import type { PedidoElegivel } from '@/lib/protocoloFinanceiro';
import { fmtDate } from '@/lib/dateUtils';

type Props = {
  pedidos: PedidoElegivel[];
  selected: Set<string>;
  onToggle: (pedidoId: string) => void;
  onToggleAll: (checked: boolean) => void;
  loading?: boolean;
};

export const PedidoSelectorTable: React.FC<Props> = ({ pedidos, selected, onToggle, onToggleAll, loading }) => {
  const allSelected = pedidos.length > 0 && pedidos.every((p) => selected.has(p.pedidoId));
  const someSelected = pedidos.some((p) => selected.has(p.pedidoId));

  return (
    <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="w-12 py-3 px-4 text-center">
                <input
                  type="checkbox"
                  aria-label="Selecionar todos"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                  onChange={(e) => onToggleAll(e.target.checked)}
                />
              </th>
              <th className="text-left py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Cliente</th>
              <th className="text-left py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Nº Pedido</th>
              <th className="text-left py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">NF-e</th>
              <th className="text-left py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Data da Entrega</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {loading ? (
              <tr><td colSpan={5} className="py-10 text-center text-muted-foreground font-display">Carregando pedidos...</td></tr>
            ) : pedidos.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-muted-foreground font-display">Nenhum pedido elegível encontrado.</td></tr>
            ) : (
              pedidos.map((p) => {
                const checked = selected.has(p.pedidoId);
                return (
                  <tr
                    key={p.pedidoId}
                    className={`transition-colors cursor-pointer ${checked ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
                    onClick={() => onToggle(p.pedidoId)}
                  >
                    <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checked} onChange={() => onToggle(p.pedidoId)} />
                    </td>
                    <td className="py-3 px-4 font-display font-semibold text-foreground">{p.nomeCliente || '—'}</td>
                    <td className="py-3 px-4 font-mono-data font-bold text-primary">{p.pedidoId}</td>
                    <td className="py-3 px-4 font-mono-data">{p.numeroNota}</td>
                    <td className="py-3 px-4 font-mono-data text-muted-foreground">{p.entregueEm ? fmtDate(p.entregueEm) : '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PedidoSelectorTable;
