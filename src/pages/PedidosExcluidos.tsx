/**
 * Lixeira de Pedidos (admin-only).
 *
 * Exclusão lógica e restauração de pedidos, com auditoria e janela de 30 dias.
 * Toda escrita passa pelas RPCs `excluir_pedido` / `restaurar_pedido`, que validam
 * `is_admin()` no banco — o gate de frontend aqui é defesa em profundidade, não a
 * única barreira. A rota já é bloqueada por `canAccessRoute` para não-admins.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { formatCurrencyBRL, formatDateTimeBR } from '@/lib/formatters';
import {
  listPedidosExcluidos,
  buscarPedidosAtivos,
  excluirPedido,
  restaurarPedido,
  listHistoricoPedido,
  situacaoRestauracao,
  PRAZO_RESTAURACAO_DIAS,
  type PedidoLixeira,
  type PedidoAtivoBusca,
  type HistoricoExclusao,
} from '@/lib/lixeiraRepo';
import {
  Trash2, RotateCcw, Search, Loader2, ShieldAlert, X, History,
  AlertTriangle, CheckCircle2, PackageSearch,
} from 'lucide-react';

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors';

type Aba = 'excluidos' | 'ativos';

const repLabel = (rep?: string | null) => {
  if (!rep) return '—';
  const m = /^\s*\d+\s*-\s*(.+)$/.exec(rep);
  return (m ? m[1] : rep).trim();
};

// ── Badge de situação da restauração ──────────────────────────────────────────
const SituacaoBadge: React.FC<{ excluidoEm: string }> = ({ excluidoEm }) => {
  const s = situacaoRestauracao(excluidoEm);
  if (!s.restauravel) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-destructive/10 text-destructive">
        <AlertTriangle className="h-3 w-3" /> Prazo expirado
      </span>
    );
  }
  const urgente = s.diasRestantes <= 5;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold',
        urgente ? 'bg-amber-500/15 text-amber-600' : 'bg-emerald-500/15 text-emerald-600',
      )}
    >
      <CheckCircle2 className="h-3 w-3" />
      {s.diasRestantes === 0 ? 'Último dia' : `Restaurável por ${s.diasRestantes} ${s.diasRestantes === 1 ? 'dia' : 'dias'}`}
    </span>
  );
};

const PedidosExcluidos: React.FC = () => {
  const { user, refreshPedidosExcluidos } = useApp();
  const { showToast } = useToast();

  const isAdmin =
    user?.role === 'ADMIN' || !!user?.funcionalidades?.includes('pedidos.gerenciar_lixeira');

  const [aba, setAba] = useState<Aba>('excluidos');

  // Lista de excluídos
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [excluidos, setExcluidos] = useState<PedidoLixeira[]>([]);
  const [filtroExcluidos, setFiltroExcluidos] = useState('');

  // Busca de ativos
  const [termoAtivos, setTermoAtivos] = useState('');
  const debTermo = useDebounce(termoAtivos, 350);
  const [buscandoAtivos, setBuscandoAtivos] = useState(false);
  const [ativos, setAtivos] = useState<PedidoAtivoBusca[]>([]);

  // Modais
  const [alvoExcluir, setAlvoExcluir] = useState<PedidoAtivoBusca | null>(null);
  const [motivo, setMotivo] = useState('');
  const [alvoRestaurar, setAlvoRestaurar] = useState<PedidoLixeira | null>(null);
  const [processando, setProcessando] = useState(false);

  // Histórico
  const [histAlvo, setHistAlvo] = useState<PedidoLixeira | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [historico, setHistorico] = useState<HistoricoExclusao[]>([]);

  const carregarExcluidos = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const rows = await listPedidosExcluidos();
      setExcluidos(rows);
    } catch (e) {
      console.error('[PedidosExcluidos] load:', e);
      setErro('Não foi possível carregar os pedidos excluídos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void carregarExcluidos();
  }, [isAdmin, carregarExcluidos]);

  // Busca de ativos (debounced)
  useEffect(() => {
    if (!isAdmin) return;
    const t = debTermo.trim();
    if (t.length < 2) { setAtivos([]); setBuscandoAtivos(false); return; }
    let cancelled = false;
    setBuscandoAtivos(true);
    buscarPedidosAtivos(t)
      .then((rows) => { if (!cancelled) setAtivos(rows); })
      .catch((e) => { console.error('[PedidosExcluidos] busca:', e); if (!cancelled) setAtivos([]); })
      .finally(() => { if (!cancelled) setBuscandoAtivos(false); });
    return () => { cancelled = true; };
  }, [debTermo, isAdmin]);

  const excluidosFiltrados = useMemo(() => {
    const t = filtroExcluidos.trim().toLowerCase();
    if (!t) return excluidos;
    return excluidos.filter(
      (p) =>
        p.numeroPedido.toLowerCase().includes(t) ||
        p.clienteNome.toLowerCase().includes(t) ||
        (p.motivo ?? '').toLowerCase().includes(t) ||
        (p.excluidoPorNome ?? '').toLowerCase().includes(t),
    );
  }, [excluidos, filtroExcluidos]);

  const indicadores = useMemo(() => {
    let restauraveis = 0, expirados = 0;
    for (const p of excluidos) {
      if (situacaoRestauracao(p.excluidoEm).restauravel) restauraveis++;
      else expirados++;
    }
    return { total: excluidos.length, restauraveis, expirados };
  }, [excluidos]);

  // ── Ações ───────────────────────────────────────────────────────────────────
  const confirmarExclusao = async () => {
    if (!alvoExcluir) return;
    if (motivo.trim().length < 3) { showToast('Informe um motivo (mín. 3 caracteres).', 'error'); return; }
    setProcessando(true);
    const r = await excluirPedido(alvoExcluir.pedidoId, motivo.trim());
    setProcessando(false);
    if (!r.ok) { showToast(r.error || 'Falha ao excluir.', 'error'); return; }
    showToast(`Pedido ${alvoExcluir.numeroPedido} movido para a lixeira.`, 'success');
    setAlvoExcluir(null);
    setMotivo('');
    setAtivos((prev) => prev.filter((p) => p.pedidoId !== alvoExcluir.pedidoId));
    refreshPedidosExcluidos(); // some das telas operacionais na mesma sessão
    void carregarExcluidos();
  };

  const confirmarRestauracao = async () => {
    if (!alvoRestaurar) return;
    setProcessando(true);
    const r = await restaurarPedido(alvoRestaurar.pedidoId);
    setProcessando(false);
    if (!r.ok) { showToast(r.error || 'Falha ao restaurar.', 'error'); return; }
    showToast(`Pedido ${alvoRestaurar.numeroPedido} restaurado.`, 'success');
    setAlvoRestaurar(null);
    refreshPedidosExcluidos(); // volta às telas operacionais na mesma sessão
    void carregarExcluidos();
  };

  const abrirHistorico = async (p: PedidoLixeira) => {
    setHistAlvo(p);
    setHistLoading(true);
    setHistorico([]);
    try {
      setHistorico(await listHistoricoPedido(p.pedidoId));
    } finally {
      setHistLoading(false);
    }
  };

  // ── Gate de admin ─────────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 flex items-start gap-3">
          <ShieldAlert className="h-6 w-6 text-destructive shrink-0" />
          <div>
            <h1 className="font-display font-bold text-lg text-foreground">Acesso restrito</h1>
            <p className="text-sm text-muted-foreground mt-1">
              A Lixeira de Pedidos é exclusiva para administradores.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Trash2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-display font-bold text-xl text-foreground leading-tight">Lixeira de Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Exclusão lógica e restauração — janela de {PRAZO_RESTAURACAO_DIAS} dias. Nenhum dado é apagado fisicamente.
          </p>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Na lixeira', value: indicadores.total, cls: 'text-foreground' },
          { label: 'Restauráveis', value: indicadores.restauraveis, cls: 'text-emerald-600' },
          { label: 'Prazo expirado', value: indicadores.expirados, cls: 'text-destructive' },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-3">
            <div className={cn('text-2xl font-bold font-display', k.cls)}>{k.value}</div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b border-border">
        {([
          { id: 'excluidos' as const, label: 'Pedidos Excluídos' },
          { id: 'ativos' as const, label: 'Excluir um Pedido' },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setAba(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-display font-semibold border-b-2 -mb-px transition-colors',
              aba === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Aba: Pedidos Excluídos ─────────────────────────────────────────────── */}
      {aba === 'excluidos' && (
        <div className="space-y-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={filtroExcluidos}
              onChange={(e) => setFiltroExcluidos(e.target.value)}
              placeholder="Filtrar por pedido, cliente, motivo ou responsável"
              className={cn(inputCls, 'pl-9')}
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
            </div>
          ) : erro ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center justify-between">
              <span>{erro}</span>
              <button onClick={() => void carregarExcluidos()} className="underline font-semibold">Tentar novamente</button>
            </div>
          ) : excluidosFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <PackageSearch className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">{excluidos.length === 0 ? 'Nenhum pedido na lixeira.' : 'Nenhum resultado para o filtro.'}</p>
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold">Pedido</th>
                      <th className="px-3 py-2 font-semibold">Cliente</th>
                      <th className="px-3 py-2 font-semibold">Excluído em</th>
                      <th className="px-3 py-2 font-semibold">Por</th>
                      <th className="px-3 py-2 font-semibold">Motivo</th>
                      <th className="px-3 py-2 font-semibold">Situação</th>
                      <th className="px-3 py-2 font-semibold text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {excluidosFiltrados.map((p) => {
                      const s = situacaoRestauracao(p.excluidoEm);
                      return (
                        <tr key={p.pedidoId} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-semibold text-foreground">{p.numeroPedido}</td>
                          <td className="px-3 py-2">
                            <div className="text-foreground">{p.clienteNome}</div>
                            <div className="text-[11px] text-muted-foreground">{repLabel(p.representante)}</div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{formatDateTimeBR(p.excluidoEm)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{p.excluidoPorNome ?? '—'}</td>
                          <td className="px-3 py-2 max-w-[220px] truncate" title={p.motivo ?? ''}>{p.motivo ?? '—'}</td>
                          <td className="px-3 py-2"><SituacaoBadge excluidoEm={p.excluidoEm} /></td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => void abrirHistorico(p)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                title="Ver histórico"
                              >
                                <History className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setAlvoRestaurar(p)}
                                disabled={!s.restauravel}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                title={s.restauravel ? 'Restaurar pedido' : 'Prazo de restauração expirado'}
                              >
                                <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="md:hidden space-y-2">
                {excluidosFiltrados.map((p) => {
                  const s = situacaoRestauracao(p.excluidoEm);
                  return (
                    <div key={p.pedidoId} className="rounded-xl border border-border bg-card p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-foreground">{p.numeroPedido}</div>
                          <div className="text-sm text-foreground">{p.clienteNome}</div>
                          <div className="text-[11px] text-muted-foreground">{repLabel(p.representante)}</div>
                        </div>
                        <SituacaoBadge excluidoEm={p.excluidoEm} />
                      </div>
                      <div className="text-[12px] text-muted-foreground">
                        Excluído em {formatDateTimeBR(p.excluidoEm)} por {p.excluidoPorNome ?? '—'}
                      </div>
                      {p.motivo && <div className="text-[12px] text-foreground/80"><span className="text-muted-foreground">Motivo:</span> {p.motivo}</div>}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => setAlvoRestaurar(p)}
                          disabled={!s.restauravel}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold bg-primary/10 text-primary disabled:opacity-40"
                        >
                          <RotateCcw className="h-4 w-4" /> Restaurar
                        </button>
                        <button
                          onClick={() => void abrirHistorico(p)}
                          className="px-3 py-2 rounded-lg text-sm font-semibold bg-muted text-muted-foreground"
                        >
                          <History className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Aba: Excluir um pedido (busca de ativos) ───────────────────────────── */}
      {aba === 'ativos' && (
        <div className="space-y-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={termoAtivos}
              onChange={(e) => setTermoAtivos(e.target.value)}
              placeholder="Buscar pedido ativo por número ou cliente"
              className={cn(inputCls, 'pl-9')}
              autoFocus
            />
          </div>

          {debTermo.trim().length < 2 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Digite ao menos 2 caracteres para buscar.</p>
          ) : buscandoAtivos ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Buscando…
            </div>
          ) : ativos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum pedido ativo encontrado.</p>
          ) : (
            <div className="space-y-2">
              {ativos.map((p) => (
                <div key={p.pedidoId} className="rounded-xl border border-border bg-card p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground">{p.numeroPedido} · <span className="font-normal">{p.clienteNome}</span></div>
                    <div className="text-[12px] text-muted-foreground truncate">
                      {repLabel(p.representante)} · {p.statusAtual} · {formatCurrencyBRL(p.valor)}
                    </div>
                  </div>
                  <button
                    onClick={() => { setAlvoExcluir(p); setMotivo(''); }}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors shrink-0"
                  >
                    <Trash2 className="h-4 w-4" /> Excluir
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal: excluir ─────────────────────────────────────────────────────── */}
      {alvoExcluir && (
        <Modal onClose={() => !processando && setAlvoExcluir(null)} titulo="Excluir pedido" icon={<Trash2 className="h-5 w-5 text-destructive" />}>
          <p className="text-sm text-muted-foreground">
            O pedido <strong className="text-foreground">{alvoExcluir.numeroPedido}</strong> ({alvoExcluir.clienteNome}) será
            movido para a lixeira. Ele deixa de aparecer nas telas operacionais e pode ser restaurado em até {PRAZO_RESTAURACAO_DIAS} dias.
          </p>
          <label className="block text-sm font-semibold text-foreground mt-3 mb-1">Motivo da exclusão *</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Descreva o motivo (obrigatório)"
            className={cn(inputCls, 'resize-none')}
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setAlvoExcluir(null)} disabled={processando} className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">Cancelar</button>
            <button
              onClick={() => void confirmarExclusao()}
              disabled={processando || motivo.trim().length < 3}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Confirmar exclusão
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: restaurar ───────────────────────────────────────────────────── */}
      {alvoRestaurar && (
        <Modal onClose={() => !processando && setAlvoRestaurar(null)} titulo="Restaurar pedido" icon={<RotateCcw className="h-5 w-5 text-primary" />}>
          <p className="text-sm text-muted-foreground">
            Restaurar o pedido <strong className="text-foreground">{alvoRestaurar.numeroPedido}</strong> ({alvoRestaurar.clienteNome})?
            Ele voltará a aparecer nas telas operacionais com o status <strong className="text-foreground">{alvoRestaurar.statusAtual}</strong>.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setAlvoRestaurar(null)} disabled={processando} className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">Cancelar</button>
            <button
              onClick={() => void confirmarRestauracao()}
              disabled={processando}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Restaurar
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: histórico ───────────────────────────────────────────────────── */}
      {histAlvo && (
        <Modal onClose={() => setHistAlvo(null)} titulo={`Histórico · ${histAlvo.numeroPedido}`} icon={<History className="h-5 w-5 text-primary" />}>
          {histLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…</div>
          ) : historico.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sem registros de auditoria.</p>
          ) : (
            <ul className="space-y-2 max-h-80 overflow-y-auto">
              {historico.map((h) => (
                <li key={h.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', h.acao === 'EXCLUIDO' ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/15 text-emerald-600')}>
                      {h.acao === 'EXCLUIDO' ? 'Excluído' : 'Restaurado'}
                    </span>
                    <span className="text-[12px] text-muted-foreground">{formatDateTimeBR(h.realizadoEm)}</span>
                  </div>
                  <div className="text-[12px] text-muted-foreground mt-1">
                    Por {h.realizadoPorNome ?? '—'}{h.statusAnterior ? ` · status anterior: ${h.statusAnterior}` : ''}
                  </div>
                  {h.motivo && <div className="text-[13px] text-foreground/80 mt-1">{h.motivo}</div>}
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
};

// ── Modal genérico ────────────────────────────────────────────────────────────
const Modal: React.FC<{ titulo: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode }> = ({ titulo, icon, onClose, children }) => (
  <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
    <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="font-display font-bold text-lg text-foreground">{titulo}</h2>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      {children}
    </div>
  </div>
);

export default PedidosExcluidos;
