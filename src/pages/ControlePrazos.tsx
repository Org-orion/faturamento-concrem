import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { fmtDate } from '@/lib/dateUtils';
import { listPedidosEmProducao } from '@/lib/controlePrazoRepo';
import {
  comPrazo, ordenarOperacional, resumir,
  temCarregamento, carregamentoInfo, diasAteData,
  type PedidoPrazo, type PedidoTipo, type Criticidade,
} from '@/lib/prazoProducao';
import { PrazoBadge } from '@/components/prazos/PrazoBadge';
import { PrazoSummary } from '@/components/prazos/PrazoSummary';
import { Search, ArrowDownWideNarrow, Clock, AlertOctagon, Truck, X, CalendarClock } from 'lucide-react';

const inputCls =
  'px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors';

const PAGE_SIZE = 20;

type Aba = 'prazos' | 'carregamentos';
type SortMode = 'criticidade' | 'dias_desc' | 'dias_asc';
type CritFilter = 'todos' | Criticidade;
type CargaFilter = 'todos' | 'com' | 'sem';
type Periodo = 'todos' | 'hoje' | '7' | '15' | '30';

const ROW_ACCENT: Record<Criticidade, string> = {
  critico: 'border-l-red-500',
  atencao: 'border-l-amber-500',
  dentro: 'border-l-emerald-500',
};

// Rótulo curto do representante ("10005287 - WENDERSON..." → "WENDERSON...")
const repLabel = (rep: string) => {
  const m = /^\s*\d+\s*-\s*(.+)$/.exec(rep);
  return (m ? m[1] : rep).trim();
};

const ControlePrazos = () => {
  const [aba, setAba] = useState<Aba>('prazos');
  const [tipo, setTipo] = useState<PedidoTipo>('VENDA');
  const [loading, setLoading] = useState(true);
  const [all, setAll] = useState<PedidoPrazo[]>([]);

  const [filterPedido, setFilterPedido] = useState('');
  const [filterCliente, setFilterCliente] = useState('');
  const [filterGrupo, setFilterGrupo] = useState('');
  const [filterRep, setFilterRep] = useState('');
  const [filterCarga, setFilterCarga] = useState<CargaFilter>('todos');
  const [critFilter, setCritFilter] = useState<CritFilter>('todos');
  const [sortMode, setSortMode] = useState<SortMode>('criticidade');
  const [periodo, setPeriodo] = useState<Periodo>('todos');
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

  useEffect(() => { setPage(1); }, [aba, tipo, debPedido, debCliente, filterGrupo, filterRep, filterCarga, critFilter, sortMode]);

  // Pedidos da visão ativa (venda OU suporte) — nunca misturados
  const doTipo = useMemo(() => all.filter((p) => p.tipo === tipo), [all, tipo]);

  // Opções de filtro derivadas dos dados reais
  const gruposDisponiveis = useMemo(
    () => Array.from(new Set(doTipo.map((p) => p.grupoCliente).filter((g): g is string => !!g))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [doTipo],
  );
  // Representantes dependem do grupo selecionado (baseado nos registros reais)
  const repsDisponiveis = useMemo(() => {
    const base = filterGrupo ? doTipo.filter((p) => p.grupoCliente === filterGrupo) : doTipo;
    return Array.from(new Set(base.map((p) => p.representante).filter((r): r is string => !!r))).sort((a, b) => repLabel(a).localeCompare(repLabel(b), 'pt-BR'));
  }, [doTipo, filterGrupo]);

  // Se o representante selecionado não existe mais no grupo, limpa
  useEffect(() => {
    if (filterRep && !repsDisponiveis.includes(filterRep)) setFilterRep('');
  }, [repsDisponiveis, filterRep]);

  // Escopo = tudo que respeita os filtros ativos, EXCETO criticidade (que quebra o resumo)
  const escopo = useMemo(() => {
    let r = doTipo;
    if (debPedido.trim()) r = r.filter((p) => p.numeroPedido.toLowerCase().includes(debPedido.trim().toLowerCase()));
    if (debCliente.trim()) r = r.filter((p) => (p.clienteNome || '').toLowerCase().includes(debCliente.trim().toLowerCase()));
    if (filterGrupo) r = r.filter((p) => p.grupoCliente === filterGrupo);
    if (filterRep) r = r.filter((p) => p.representante === filterRep);
    if (filterCarga === 'com') r = r.filter(temCarregamento);
    else if (filterCarga === 'sem') r = r.filter((p) => !temCarregamento(p));
    return r;
  }, [doTipo, debPedido, debCliente, filterGrupo, filterRep, filterCarga]);

  const resumo = useMemo(() => resumir(escopo), [escopo]);

  const prioridades = useMemo(
    () => escopo
      .filter((p) => p.prazo.criticidade === 'critico' || p.prazo.criticidade === 'atencao')
      .filter((p) => critFilter === 'todos' || p.prazo.criticidade === critFilter) // respeita o filtro de faixa
      .sort(ordenarOperacional).slice(0, 6),
    [escopo, critFilter],
  );

  const filtrados = useMemo(() => {
    let r = escopo;
    if (critFilter !== 'todos') r = r.filter((p) => p.prazo.criticidade === critFilter);
    const sorted = [...r];
    if (sortMode === 'dias_desc') sorted.sort((a, b) => b.dias - a.dias);
    else if (sortMode === 'dias_asc') sorted.sort((a, b) => a.dias - b.dias);
    else sorted.sort(ordenarOperacional);
    return sorted;
  }, [escopo, critFilter, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pageItems = useMemo(() => filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtrados, page]);

  // ── Visão de Carregamentos Programados: só pedidos com carga, dentro do período ──
  const janela: Record<Exclude<Periodo, 'todos'>, number> = { hoje: 0, '7': 7, '15': 15, '30': 30 };
  const carregamentos = useMemo(() => {
    let r = escopo.filter(temCarregamento);
    if (critFilter !== 'todos') r = r.filter((p) => p.prazo.criticidade === critFilter);
    if (periodo !== 'todos') {
      const lim = janela[periodo];
      r = r.filter((p) => { const d = diasAteData(p.carregamentoData); return d != null && (d < 0 || d <= lim); }); // atrasados sempre incluídos
    }
    return [...r].sort((a, b) => (a.carregamentoData || '').localeCompare(b.carregamentoData || '') || b.dias - a.dias);
  }, [escopo, critFilter, periodo]);

  // Agrupa por data de carregamento (agenda)
  const carregamentosPorData = useMemo(() => {
    const map = new Map<string, PedidoPrazo[]>();
    for (const p of carregamentos) {
      const k = p.carregamentoData || 'sem-data';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [carregamentos]);

  const hasActiveFilters = Boolean(debPedido || debCliente || filterGrupo || filterRep || filterCarga !== 'todos' || critFilter !== 'todos');
  const limparFiltros = () => {
    setFilterPedido(''); setFilterCliente(''); setFilterGrupo(''); setFilterRep('');
    setFilterCarga('todos'); setCritFilter('todos');
  };

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
        <div className="flex flex-wrap items-center gap-3">
          {/* Venda / Suporte */}
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
            {(['VENDA', 'SUPORTE'] as PedidoTipo[]).map((t) => (
              <button key={t} type="button" onClick={() => setTipo(t)}
                className={cn('px-4 py-1.5 rounded-md text-sm font-semibold transition-colors', tipo === t ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                {t === 'VENDA' ? 'Pedidos de Venda' : 'Pedidos de Suporte'}
              </button>
            ))}
          </div>
          {/* Prazos / Carregamentos */}
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
            {([['prazos', 'Controle de Prazos'], ['carregamentos', 'Carregamentos Programados']] as [Aba, string][]).map(([k, lbl]) => (
              <button key={k} type="button" onClick={() => setAba(k)}
                className={cn('px-4 py-1.5 rounded-md text-sm font-semibold transition-colors', aba === k ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Resumo operacional (respeita filtros) ── */}
      <PrazoSummary resumo={resumo} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 text-emerald-600 font-semibold"><Truck className="h-3.5 w-3.5" />Com carregamento: {resumo.comCarga}</span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground font-semibold"><Truck className="h-3.5 w-3.5" />Sem carregamento: {resumo.semCarga}</span>
      </div>

      {/* ── Filtros (compactos, empilham no mobile) ── */}
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={filterPedido} onChange={(e) => setFilterPedido(e.target.value)} placeholder="Nº pedido" className={cn(inputCls, 'w-full sm:w-32 pl-8')} />
          </div>
          <div className="relative sm:flex-1 sm:min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={filterCliente} onChange={(e) => setFilterCliente(e.target.value)} placeholder="Cliente" className={cn(inputCls, 'w-full pl-8')} />
          </div>
          <select value={filterGrupo} onChange={(e) => setFilterGrupo(e.target.value)} className={cn(inputCls, 'w-full sm:w-44')}>
            <option value="">Todos os grupos</option>
            {gruposDisponiveis.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={filterRep} onChange={(e) => setFilterRep(e.target.value)} className={cn(inputCls, 'w-full sm:w-48')}>
            <option value="">Todos os representantes</option>
            {repsDisponiveis.map((r) => <option key={r} value={r}>{repLabel(r)}</option>)}
          </select>
          <select value={filterCarga} onChange={(e) => setFilterCarga(e.target.value as CargaFilter)} className={cn(inputCls, 'w-full sm:w-52')}>
            <option value="todos">Carregamento: todos</option>
            <option value="com">Com carregamento programado</option>
            <option value="sem">Sem carregamento programado</option>
          </select>
          {aba === 'prazos' ? (
            <>
              <select value={critFilter} onChange={(e) => setCritFilter(e.target.value as CritFilter)} className={cn(inputCls, 'w-full sm:w-40')}>
                <option value="todos">Todas as faixas</option>
                <option value="dentro">Dentro do prazo</option>
                <option value="atencao">Atenção</option>
                <option value="critico">Críticos</option>
              </select>
              <div className="relative w-full sm:w-auto">
                <ArrowDownWideNarrow className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} className={cn(inputCls, 'w-full sm:w-48 pl-8')}>
                  <option value="criticidade">Ordenar: operacional</option>
                  <option value="dias_desc">Ordenar: mais dias</option>
                  <option value="dias_asc">Ordenar: menos dias</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <select value={critFilter} onChange={(e) => setCritFilter(e.target.value as CritFilter)} className={cn(inputCls, 'w-full sm:w-40')}>
                <option value="todos">Todas as faixas</option>
                <option value="dentro">Dentro do prazo</option>
                <option value="atencao">Atenção</option>
                <option value="critico">Críticos</option>
              </select>
              <div className="relative w-full sm:w-auto">
                <CalendarClock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} className={cn(inputCls, 'w-full sm:w-44 pl-8')}>
                  <option value="todos">Período: todos</option>
                  <option value="hoje">Hoje</option>
                  <option value="7">Próximos 7 dias</option>
                  <option value="15">Próximos 15 dias</option>
                  <option value="30">Próximos 30 dias</option>
                </select>
              </div>
            </>
          )}
        </div>
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5">
            {filterGrupo && <Chip label={`Grupo: ${filterGrupo}`} onClear={() => setFilterGrupo('')} />}
            {filterRep && <Chip label={`Rep.: ${repLabel(filterRep)}`} onClear={() => setFilterRep('')} />}
            {filterCarga !== 'todos' && <Chip label={filterCarga === 'com' ? 'Com carregamento' : 'Sem carregamento'} onClear={() => setFilterCarga('todos')} />}
            {critFilter !== 'todos' && <Chip label={`Faixa: ${critFilter}`} onClear={() => setCritFilter('todos')} />}
            {debPedido && <Chip label={`Pedido: ${debPedido}`} onClear={() => setFilterPedido('')} />}
            {debCliente && <Chip label={`Cliente: ${debCliente}`} onClear={() => setFilterCliente('')} />}
            <button type="button" onClick={limparFiltros} className="text-xs font-semibold text-muted-foreground hover:text-foreground underline ml-1">Limpar filtros</button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center text-muted-foreground font-display">Carregando pedidos em produção...</div>
      ) : doTipo.length === 0 ? (
        <EmptyState tipoLabel={tipoLabel} />
      ) : aba === 'prazos' ? (
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
                {prioridades.map((p) => {
                  const ci = carregamentoInfo(p);
                  return (
                    <div key={p.pedidoId} className={cn('bg-card p-3 border-l-4', ROW_ACCENT[p.prazo.criticidade])}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono-data font-bold text-primary">#{p.numeroPedido}</span>
                        <PrazoBadge criticidade={p.prazo.criticidade} />
                      </div>
                      <p className="mt-1 text-sm font-semibold text-foreground truncate" title={p.clienteNome}>{p.clienteNome}</p>
                      <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-bold text-foreground">{p.dias} dias em produção</span>
                      </div>
                      <p className={cn('mt-0.5 text-[11px] font-semibold', ci.tem ? (ci.atrasado ? 'text-red-600' : 'text-emerald-600') : 'text-amber-600')}>
                        {ci.tem ? cargaTexto(ci) : 'Sem carregamento programado'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Tabela (desktop) ── */}
          <div className="hidden md:block rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground font-display font-bold">
                    <th className="text-left py-3 px-4">Pedido</th>
                    <th className="text-left py-3 px-4">Cliente</th>
                    <th className="text-left py-3 px-4">Grupo / Rep.</th>
                    <th className="text-left py-3 px-4">Dias em Produção</th>
                    <th className="text-left py-3 px-4">Faixa de Prazo</th>
                    <th className="text-left py-3 px-4">Carregamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {pageItems.map((p) => {
                    const ci = carregamentoInfo(p);
                    return (
                      <tr key={p.pedidoId} className={cn('border-l-4 hover:bg-muted/30 transition-colors', ROW_ACCENT[p.prazo.criticidade])}>
                        <td className="py-2.5 px-4 font-mono-data font-bold text-primary">{p.numeroPedido}</td>
                        <td className="py-2.5 px-4 font-display font-semibold text-foreground max-w-[240px] truncate" title={p.clienteNome}>{p.clienteNome}</td>
                        <td className="py-2.5 px-4 text-muted-foreground text-xs max-w-[200px] truncate" title={`${p.grupoCliente || '—'} · ${p.representante || '—'}`}>
                          <span className="text-foreground">{p.grupoCliente || '—'}</span><br />{p.representante ? repLabel(p.representante) : '—'}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="font-bold text-foreground">{p.dias} dias</span>
                          {p.prazo.diasAcimaLimite > 0 && <span className="ml-2 text-[11px] font-semibold text-red-600">+{p.prazo.diasAcimaLimite}d acima</span>}
                        </td>
                        <td className="py-2.5 px-4"><PrazoBadge criticidade={p.prazo.criticidade} /></td>
                        <td className="py-2.5 px-4"><CargaBadge ci={ci} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} total={filtrados.length} shown={pageItems.length} onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
          </div>

          {/* ── Cards (mobile) ── */}
          <div className="md:hidden space-y-2">
            {pageItems.map((p) => {
              const ci = carregamentoInfo(p);
              return (
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
                  <div className="mt-2"><CargaBadge ci={ci} /></div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{p.grupoCliente || '—'}{p.representante ? ` · ${repLabel(p.representante)}` : ''}</p>
                </div>
              );
            })}
            <div className="rounded-xl border border-border bg-card">
              <Pagination page={page} totalPages={totalPages} total={filtrados.length} shown={pageItems.length} onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
            </div>
          </div>

          {filtrados.length === 0 && (
            <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">Nenhum pedido corresponde aos filtros aplicados.</div>
          )}
        </>
      ) : (
        /* ── Visão: Carregamentos Programados (agenda por data) ── */
        carregamentos.length === 0 ? (
          <div className="rounded-xl border border-border bg-card py-16 text-center">
            <CalendarClock className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-base font-bold font-display text-foreground">Nenhum carregamento programado</p>
            <p className="mt-1 text-sm text-muted-foreground">Nenhum {tipoLabel.toLowerCase()} monitorado com carregamento no período/filtros selecionados.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {carregamentosPorData.map(([data, itens]) => {
              const dias = data === 'sem-data' ? null : diasAteData(data);
              const atrasado = itens.some((p) => carregamentoInfo(p).atrasado);
              return (
                <section key={data}>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className={cn('text-sm font-bold font-display', atrasado ? 'text-red-600' : 'text-foreground')}>
                      {grupoDataLabel(data, dias)}
                    </h3>
                    {atrasado && <span className="text-[10px] font-bold uppercase tracking-tight px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">Carregamento atrasado · {Math.abs(dias!)} dia{Math.abs(dias!) !== 1 ? 's' : ''}</span>}
                    <span className="text-xs text-muted-foreground">{itens.length} pedido{itens.length !== 1 ? 's' : ''}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                    {itens.map((p) => (
                      <div key={p.pedidoId} className={cn('rounded-xl border border-border bg-card shadow-card p-3 border-l-4', ROW_ACCENT[p.prazo.criticidade])}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono-data font-bold text-primary">#{p.numeroPedido}</span>
                          <PrazoBadge criticidade={p.prazo.criticidade} />
                        </div>
                        <p className="mt-1 text-sm font-semibold text-foreground truncate" title={p.clienteNome}>{p.clienteNome}</p>
                        <p className="text-[11px] text-muted-foreground">{p.grupoCliente || '—'}{p.representante ? ` · ${repLabel(p.representante)}` : ''}</p>
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-foreground">{p.dias} dias em produção</span>
                          <span className={cn('font-semibold', atrasado ? 'text-red-600' : 'text-emerald-600')}>{fmtDate(p.carregamentoData)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )
      )}
    </div>
  );
};

// Texto complementar da situação do carregamento
function cargaTexto(ci: ReturnType<typeof carregamentoInfo>): string {
  if (!ci.tem) return 'Sem carregamento programado';
  if (ci.atrasado) return `Carregamento atrasado (${fmtDate(ci.data)}, ${Math.abs(ci.diasAte!)}d)`;
  if (ci.diasAte === 0) return `Carregamento programado para hoje (${fmtDate(ci.data)})`;
  return `Carregamento em ${ci.diasAte} dia${ci.diasAte !== 1 ? 's' : ''} · ${fmtDate(ci.data)}`;
}

function CargaBadge({ ci }: { ci: ReturnType<typeof carregamentoInfo> }) {
  if (!ci.tem) {
    return (
      <div>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-bold bg-muted/60 text-muted-foreground border-border">
          <Truck className="h-3 w-3" />Não programado
        </span>
        <p className="text-[11px] text-muted-foreground mt-0.5">Aguardando programação</p>
      </div>
    );
  }
  const cls = ci.atrasado ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return (
    <div>
      <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-bold', cls)}>
        <Truck className="h-3 w-3" />{ci.atrasado ? 'Atrasado' : 'Programado'}
      </span>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        {fmtDate(ci.data)}{ci.atrasado ? ` · ${Math.abs(ci.diasAte!)}d de atraso` : ci.diasAte === 0 ? ' · hoje' : ` · em ${ci.diasAte}d`}
      </p>
    </div>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-muted/40 text-[11px] font-semibold text-foreground">
      {label}
      <button type="button" onClick={onClear} className="hover:text-destructive"><X className="h-3 w-3" /></button>
    </span>
  );
}

function grupoDataLabel(data: string, dias: number | null): string {
  if (data === 'sem-data') return 'Sem data definida';
  const base = fmtDate(data);
  if (dias === 0) return `Hoje — ${base}`;
  if (dias === 1) return `Amanhã — ${base}`;
  if (dias === -1) return `Ontem — ${base}`;
  return base;
}

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
