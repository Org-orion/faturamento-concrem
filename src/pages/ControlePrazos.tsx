import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { fmtDate } from '@/lib/dateUtils';
import { formatCurrency } from '@/components/shared';
import { listPedidosEmProducao } from '@/lib/controlePrazoRepo';
import {
  comPrazo, ordenarPorCriticidade, resumir,
  type PedidoPrazo, type PedidoTipo, type Criticidade,
} from '@/lib/prazoProducao';
import { PrazoBadge } from '@/components/prazos/PrazoBadge';
import { PrazoSummary } from '@/components/prazos/PrazoSummary';
import { Search, ArrowDownWideNarrow, Clock, AlertOctagon } from 'lucide-react';

const inputCls =
  'px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors';

const PAGE_SIZE = 20;

type SortMode = 'criticidade' | 'dias_desc' | 'dias_asc';
type CritFilter = 'todos' | Criticidade;

// realce por criticidade (borda esquerda) — reforça a prioridade visual
const ROW_ACCENT: Record<Criticidade, string> = {
  critico: 'border-l-red-500',
  atencao: 'border-l-amber-500',
  dentro: 'border-l-emerald-500',
};

const ControlePrazos = () => {
  const [tipo, setTipo] = useState<PedidoTipo>('VENDA');
  const [loading, setLoading] = useState(true);
  const [all, setAll] = useState<PedidoPrazo[]>([]);

  const [filterPedido, setFilterPedido] = useState('');
  const [filterCliente, setFilterCliente] = useState('');
  const [critFilter, setCritFilter] = useState<CritFilter>('todos');
  const [sortMode, setSortMode] = useState<SortMode>('criticidade');
  const [page, setPage] = useState(1);

  const debPedido = useDebounce(filterPedido, 300);
  const debCliente = useDebounce(filterCliente, 300);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listPedidosEmProducao()
      .then((rows) => { if (!cancelled) setAll(rows.map(comPrazo)); })
      .catch((e) => console.error('[ControlePrazos] load:', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Reset de página quando visão/filtros mudam
  useEffect(() => { setPage(1); }, [tipo, debPedido, debCliente, critFilter, sortMode]);

  // Pedidos da visão ativa (venda OU suporte) — nunca misturados
  const doTipo = useMemo(() => all.filter((p) => p.tipo === tipo), [all, tipo]);

  const resumo = useMemo(() => resumir(doTipo), [doTipo]);

  const prioridades = useMemo(
    () => doTipo
      .filter((p) => p.prazo.criticidade === 'critico' || p.prazo.criticidade === 'atencao')
      .sort(ordenarPorCriticidade)
      .slice(0, 6),
    [doTipo],
  );

  const filtrados = useMemo(() => {
    let r = doTipo;
    if (debPedido.trim()) r = r.filter((p) => p.numeroPedido.toLowerCase().includes(debPedido.trim().toLowerCase()));
    if (debCliente.trim()) r = r.filter((p) => (p.clienteNome || '').toLowerCase().includes(debCliente.trim().toLowerCase()));
    if (critFilter !== 'todos') r = r.filter((p) => p.prazo.criticidade === critFilter);

    const sorted = [...r];
    if (sortMode === 'dias_desc') sorted.sort((a, b) => b.dias - a.dias);
    else if (sortMode === 'dias_asc') sorted.sort((a, b) => a.dias - b.dias);
    else sorted.sort(ordenarPorCriticidade);
    return sorted;
  }, [doTipo, debPedido, debCliente, critFilter, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pageItems = useMemo(
    () => filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtrados, page],
  );

  const tipoLabel = tipo === 'VENDA' ? 'Pedidos de Venda' : 'Pedidos de Suporte';

  return (
    <div className="space-y-5">
      {/* ── Cabeçalho ── */}
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Controle de Prazos</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe os pedidos liberados em produção e identifique prioridades operacionais.
          </p>
        </div>
        {/* Segmented control Venda / Suporte */}
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
          {(['VENDA', 'SUPORTE'] as PedidoTipo[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-semibold transition-colors',
                tipo === t ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'VENDA' ? 'Pedidos de Venda' : 'Pedidos de Suporte'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Resumo operacional ── */}
      <PrazoSummary resumo={resumo} />

      {loading ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center text-muted-foreground font-display">
          Carregando pedidos em produção...
        </div>
      ) : doTipo.length === 0 ? (
        <EmptyState tipoLabel={tipoLabel} />
      ) : (
        <>
          {/* ── Prioridades de Produção ── */}
          {prioridades.length > 0 && (
            <section className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                <AlertOctagon className="h-4 w-4 text-red-600" />
                <h2 className="text-sm font-bold font-display text-foreground">Prioridades de Produção</h2>
                <span className="text-xs text-muted-foreground">· resolver primeiro</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-border">
                {prioridades.map((p) => (
                  <div key={p.pedidoId} className={cn('bg-card p-3 border-l-4', ROW_ACCENT[p.prazo.criticidade])}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-data font-bold text-primary">#{p.numeroPedido}</span>
                      <PrazoBadge criticidade={p.prazo.criticidade} />
                    </div>
                    <p className="mt-1 text-sm font-semibold text-foreground truncate" title={p.clienteNome}>{p.clienteNome}</p>
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-bold text-foreground">{p.dias} dias em produção</span>
                      <span>Liberado em {fmtDate(p.liberadoEm)}</span>
                    </div>
                    {p.prazo.diasAcimaLimite > 0 && (
                      <p className="mt-0.5 text-[11px] font-semibold text-red-600">
                        {p.prazo.diasAcimaLimite} dia{p.prazo.diasAcimaLimite !== 1 ? 's' : ''} acima do limite
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Filtros ── */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input value={filterPedido} onChange={(e) => setFilterPedido(e.target.value)}
                placeholder="Nº pedido" className={cn(inputCls, 'w-36 pl-8')} />
            </div>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input value={filterCliente} onChange={(e) => setFilterCliente(e.target.value)}
                placeholder="Cliente" className={cn(inputCls, 'w-full pl-8')} />
            </div>
            <select value={critFilter} onChange={(e) => setCritFilter(e.target.value as CritFilter)} className={cn(inputCls, 'w-40')}>
              <option value="todos">Todas as faixas</option>
              <option value="dentro">Dentro do prazo</option>
              <option value="atencao">Atenção</option>
              <option value="critico">Críticos</option>
            </select>
            <div className="relative">
              <ArrowDownWideNarrow className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} className={cn(inputCls, 'w-48 pl-8')}>
                <option value="criticidade">Ordenar: criticidade</option>
                <option value="dias_desc">Ordenar: mais dias</option>
                <option value="dias_asc">Ordenar: menos dias</option>
              </select>
            </div>
          </div>

          {/* ── Tabela (desktop) ── */}
          <div className="hidden md:block rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground font-display font-bold">
                    <th className="text-left py-3 px-4">Pedido</th>
                    <th className="text-left py-3 px-4">Cliente</th>
                    <th className="text-left py-3 px-4">Cidade/UF</th>
                    <th className="text-left py-3 px-4">Liberado em</th>
                    <th className="text-left py-3 px-4">Dias em Produção</th>
                    <th className="text-left py-3 px-4">Faixa de Prazo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {pageItems.map((p) => (
                    <tr key={p.pedidoId} className={cn('border-l-4 hover:bg-muted/30 transition-colors', ROW_ACCENT[p.prazo.criticidade])}>
                      <td className="py-2.5 px-4 font-mono-data font-bold text-primary">{p.numeroPedido}</td>
                      <td className="py-2.5 px-4 font-display font-semibold text-foreground max-w-[280px] truncate" title={p.clienteNome}>{p.clienteNome}</td>
                      <td className="py-2.5 px-4 text-muted-foreground text-xs">{[p.cidade, p.uf].filter(Boolean).join(' / ') || '—'}</td>
                      <td className="py-2.5 px-4 font-mono-data text-muted-foreground">{fmtDate(p.liberadoEm)}</td>
                      <td className="py-2.5 px-4">
                        <span className="font-bold text-foreground">{p.dias} dias</span>
                        {p.prazo.diasAcimaLimite > 0 && (
                          <span className="ml-2 text-[11px] font-semibold text-red-600">+{p.prazo.diasAcimaLimite}d acima</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4"><PrazoBadge criticidade={p.prazo.criticidade} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} total={filtrados.length} shown={pageItems.length} onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
          </div>

          {/* ── Cards (mobile) ── */}
          <div className="md:hidden space-y-2">
            {pageItems.map((p) => (
              <div key={p.pedidoId} className={cn('rounded-xl border border-border bg-card shadow-card p-3 border-l-4', ROW_ACCENT[p.prazo.criticidade])}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono-data font-bold text-primary">#{p.numeroPedido}</span>
                  <PrazoBadge criticidade={p.prazo.criticidade} />
                </div>
                <p className="mt-1 text-sm font-semibold text-foreground">{p.clienteNome}</p>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="font-bold text-foreground">{p.dias} dias em produção</span>
                  {p.prazo.diasAcimaLimite > 0 && <span className="font-semibold text-red-600">(+{p.prazo.diasAcimaLimite}d)</span>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">Liberado em {fmtDate(p.liberadoEm)} · {formatCurrency(p.valor)}</p>
              </div>
            ))}
            <div className="rounded-xl border border-border bg-card">
              <Pagination page={page} totalPages={totalPages} total={filtrados.length} shown={pageItems.length} onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
            </div>
          </div>

          {filtrados.length === 0 && (
            <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
              Nenhum pedido corresponde aos filtros aplicados.
            </div>
          )}
        </>
      )}
    </div>
  );
};

function Pagination({ page, totalPages, total, shown, onPrev, onNext }: {
  page: number; totalPages: number; total: number; shown: number; onPrev: () => void; onNext: () => void;
}) {
  if (total === 0) return null;
  return (
    <div className="px-4 py-3 border-t border-border flex items-center justify-between">
      <p className="text-xs text-muted-foreground">Mostrando {shown} de {total} pedido{total !== 1 ? 's' : ''}</p>
      <div className="flex items-center gap-2">
        <button disabled={page === 1} onClick={onPrev} className="px-3 py-1.5 rounded border border-border bg-card text-xs font-semibold disabled:opacity-50">Anterior</button>
        <span className="text-xs text-muted-foreground">{page}/{totalPages}</span>
        <button disabled={page >= totalPages} onClick={onNext} className="px-3 py-1.5 rounded border border-border bg-card text-xs font-semibold disabled:opacity-50">Próxima</button>
      </div>
    </div>
  );
}

function EmptyState({ tipoLabel }: { tipoLabel: string }) {
  return (
    <div className="rounded-xl border border-border bg-card py-16 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
        <Clock className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-base font-bold font-display text-foreground">Nenhum pedido em produção</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Não existem {tipoLabel.toLowerCase()} atualmente no status Liberado em Produção.
      </p>
    </div>
  );
}

export default ControlePrazos;
