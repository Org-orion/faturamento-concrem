import React from 'react';
import type { PedidoElegivel } from '@/lib/protocoloFinanceiro';
import { fmtDate } from '@/lib/dateUtils';

export type ColunaFiltros = { cliente: string; pedido: string; nf: string; data: string };
export type ColunaOptions = { clientes: string[]; pedidos: string[]; nfs: string[]; datas: string[] };

type Props = {
  pedidos: PedidoElegivel[]; // já é a fatia da página atual
  selected: Set<string>;
  allSelected: boolean;
  someSelected: boolean;
  onToggle: (pedidoId: string) => void;
  onToggleAll: (checked: boolean) => void;
  loading?: boolean;
  filters: ColunaFiltros;
  onFilterChange: (key: keyof ColunaFiltros, value: string) => void;
  options: ColunaOptions;
};

const filterInputClass =
  'w-full px-2 py-1 rounded-md border border-input bg-card text-foreground font-display text-xs focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors';

export const PedidoSelectorTable: React.FC<Props> = ({
  pedidos, selected, allSelected, someSelected, onToggle, onToggleAll, loading, filters, onFilterChange, options,
}) => {
  return (
    <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
      <datalist id="pf-clientes-list">{options.clientes.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="pf-pedidos-list">{options.pedidos.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="pf-nfs-list">{options.nfs.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="pf-datas-list">{options.datas.map((d) => <option key={d} value={d} />)}</datalist>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="w-12 py-3 px-4 text-center align-middle">
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
            <tr className="border-b border-border bg-muted/10">
              <th className="py-2 px-2" />
              <th className="py-2 px-3">
                <input className={filterInputClass} list="pf-clientes-list" placeholder="Filtrar cliente..."
                  value={filters.cliente} onChange={(e) => onFilterChange('cliente', e.target.value)} />
              </th>
              <th className="py-2 px-3">
                <input className={filterInputClass} list="pf-pedidos-list" placeholder="Filtrar pedido..."
                  value={filters.pedido} onChange={(e) => onFilterChange('pedido', e.target.value)} />
              </th>
              <th className="py-2 px-3">
                <input className={filterInputClass} list="pf-nfs-list" placeholder="Filtrar NF-e..."
                  value={filters.nf} onChange={(e) => onFilterChange('nf', e.target.value)} />
              </th>
              <th className="py-2 px-3">
                <input className={filterInputClass} list="pf-datas-list" placeholder="Filtrar data..."
                  value={filters.data} onChange={(e) => onFilterChange('data', e.target.value)} />
              </th>
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
