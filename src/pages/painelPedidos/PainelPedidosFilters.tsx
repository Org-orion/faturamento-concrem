import React from 'react';
import { Search } from 'lucide-react';
import { PedidoStatusValue } from '@/types';
import { pedidoStatusFlow } from '@/lib/pedidoStatusFlow';

const statusOptions = pedidoStatusFlow.slice().sort((a, b) => a.order - b.order);

export function PainelPedidosFilters({
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  count,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  statusFilter: PedidoStatusValue | '';
  onStatusFilterChange: (v: PedidoStatusValue | '') => void;
  count: number;
}) {
  return (
    <div className="bg-card rounded-xl p-4 border border-border shadow-card">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="h-10 w-full pl-9 pr-3 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Buscar por cliente, representante ou nº do pedido..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </div>

        <select
          className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-semibold"
          value={statusFilter}
          onChange={(e) => onStatusFilterChange((e.target.value as PedidoStatusValue) || '')}
        >
          <option value="">Todos os status</option>
          {statusOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/10 px-3">
          <div className="text-sm font-bold">{count}</div>
          <div className="text-xs text-muted-foreground font-bold uppercase tracking-tight">pedido(s)</div>
        </div>
      </div>
    </div>
  );
}

