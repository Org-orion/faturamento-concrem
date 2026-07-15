import React, { useEffect, useMemo, useState } from 'react';
import { useApp, tableColumns } from '@/contexts/AppContext';
import { can } from '@/utils/access';
import { usePrioridades } from '@/contexts/PrioridadesContext';
import { useAtencao } from '@/contexts/AtencaoContext';
import { useToast } from '@/components/ToastProvider';
import Modal from '@/components/Modal';
import { btnPrimary, btnSecondary, btnDanger, inputClass } from '@/components/shared';
import { Flag, Plus, Trash2, Search, AlertTriangle, Bell, ChevronLeft, ChevronRight, CheckCircle2, RotateCcw, Clock } from 'lucide-react';
import { NivelPrioridade, upsertPrioridade, desativarPrioridade, marcarPrioridadeAtendida, reabrirPrioridade } from '@/lib/prioridadesRepo';
import { upsertAtencao, desativarAtencao } from '@/lib/atencaoRepo';
import { supabasePedidos } from '@/lib/supabase';
import { rowToOrder } from '@/lib/pedidoMapper';
import type { Order } from '@/types';
import { fmtDate, currentYearMonthBR, yearMonthOf } from '@/lib/dateUtils';
import { formatMonthYearBR, formatDateBR, formatTimeBR } from '@/lib/formatters';

const NIVEL_CONFIG: Record<NivelPrioridade, { label: string; color: string; bg: string; border: string; icon: string }> = {
  urgente: { label: 'Urgente', color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    icon: 'text-red-500' },
  alta:    { label: 'Alta',    color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', icon: 'text-orange-500' },
  media:   { label: 'Média',   color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', icon: 'text-yellow-500' },
};

const ATENCAO_CONFIG = {
  color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-500',
};

// Ordem de criticidade da regra atual (para ordenação operacional).
const NIVEL_ORDER: Record<NivelPrioridade, number> = { urgente: 0, alta: 1, media: 2 };

// "julho de 2026" → "Julho de 2026"
const capMes = (ym: string) => {
  const s = formatMonthYearBR(ym);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
};

type Tab = 'prioridades' | 'atencoes';
type StatusFiltro = 'pendentes' | 'atendidas' | 'todas';

const Prioridades = () => {
  const { user } = useApp();
  const canGerenciar = can(user, 'prioridades.gerenciar', 'prioridades', 'execute');
  const { map: prioMap, refresh: refreshPrio } = usePrioridades();
  const { map: atencaoMap, refresh: refreshAtencao } = useAtencao();
  const { showToast } = useToast();

  const [tab, setTab] = useState<Tab>('prioridades');

  // --- Shared add/remove modal state ---
  const [openAdd, setOpenAdd] = useState<Tab | null>(null);
  const [openRemove, setOpenRemove] = useState<{ id: string; tipo: Tab } | null>(null);

  // Add modal fields
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Order[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState<{ id: string; cliente: string } | null>(null);
  const [nivel, setNivel] = useState<NivelPrioridade>('alta');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  // Client info cache for listed items
  const [pedidoInfo, setPedidoInfo] = useState<Map<string, { cliente: string }>>(new Map());

  const prioList  = useMemo(() => Array.from(prioMap.values()),   [prioMap]);
  const atencList = useMemo(() => Array.from(atencaoMap.values()), [atencaoMap]);

  // ── Controle de prazos: filtro por mês + status de atendimento (aba Prioridades) ──
  const mesAtual = currentYearMonthBR();
  const [mesFiltro, setMesFiltro] = useState<string>(mesAtual);
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>('pendentes');
  const [confirmAtender, setConfirmAtender] = useState<string | null>(null);
  const [confirmReabrir, setConfirmReabrir] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const isAtendida = (p: { atendida?: boolean | null }) => Boolean(p.atendida);

  // Meses com prioridades registradas (por criado_em) ∪ mês atual, do mais recente ao mais antigo.
  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>([mesAtual, mesFiltro]);
    for (const p of prioList) { const ym = yearMonthOf(p.criado_em); if (ym) set.add(ym); }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [prioList, mesAtual, mesFiltro]);

  // Prioridades do mês selecionado (data de registro = criado_em).
  const prioDoMes = useMemo(
    () => prioList.filter(p => yearMonthOf(p.criado_em) === mesFiltro),
    [prioList, mesFiltro],
  );

  const totalMes     = prioDoMes.length;
  const atendidasMes = prioDoMes.filter(isAtendida).length;
  const pendentesMes = totalMes - atendidasMes;
  const taxaMes      = totalMes > 0 ? Math.round((atendidasMes / totalMes) * 100) : 0;

  // Filtro de status + ordenação operacional.
  const prioExibidas = useMemo(() => {
    let r = prioDoMes;
    if (statusFiltro === 'pendentes') r = r.filter(p => !isAtendida(p));
    else if (statusFiltro === 'atendidas') r = r.filter(isAtendida);
    return [...r].sort((a, b) => {
      const aa = isAtendida(a) ? 1 : 0, ba = isAtendida(b) ? 1 : 0;
      if (aa !== ba) return aa - ba;                                   // pendentes primeiro
      const na = NIVEL_ORDER[a.nivel] ?? 9, nb = NIVEL_ORDER[b.nivel] ?? 9;
      if (na !== nb) return na - nb;                                   // maior criticidade
      if (aa === 0) return (a.criado_em || '').localeCompare(b.criado_em || ''); // mais antigas primeiro
      return (b.atendida_em || '').localeCompare(a.atendida_em || ''); // atendidas: mais recentes primeiro
    });
  }, [prioDoMes, statusFiltro]);

  const canPrevMes = mesesDisponiveis.length > 0 && mesFiltro > mesesDisponiveis[mesesDisponiveis.length - 1];
  const canNextMes = mesFiltro < mesAtual; // não avançar para o futuro sem dados

  const changeMes = (delta: number) => {
    const [y, m] = mesFiltro.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMesFiltro(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleAtender = async () => {
    if (!confirmAtender || updatingId) return;
    setUpdatingId(confirmAtender);
    const ok = await marcarPrioridadeAtendida(confirmAtender, user?.username || user?.name || null);
    setUpdatingId(null);
    if (ok) { showToast('Prioridade marcada como atendida.'); setConfirmAtender(null); await refreshPrio(); }
    else showToast('Não foi possível atualizar a prioridade. Tente novamente.', 'error');
  };

  const handleReabrir = async () => {
    if (!confirmReabrir || updatingId) return;
    setUpdatingId(confirmReabrir);
    const ok = await reabrirPrioridade(confirmReabrir);
    setUpdatingId(null);
    if (ok) { showToast('Prioridade reaberta.'); setConfirmReabrir(null); await refreshPrio(); }
    else showToast('Não foi possível atualizar a prioridade. Tente novamente.', 'error');
  };

  // ── Aba Atenções: mesmo filtro por mês (data-base: criado_em; sem status "atendida") ──
  const mesesDisponiveisAtenc = useMemo(() => {
    const set = new Set<string>([mesAtual, mesFiltro]);
    for (const a of atencList) { const ym = yearMonthOf(a.criado_em); if (ym) set.add(ym); }
    return Array.from(set).sort((x, y) => y.localeCompare(x));
  }, [atencList, mesAtual, mesFiltro]);
  const atencDoMes = useMemo(
    () => atencList.filter(a => yearMonthOf(a.criado_em) === mesFiltro),
    [atencList, mesFiltro],
  );
  const canPrevMesAtenc = mesesDisponiveisAtenc.length > 0 && mesFiltro > mesesDisponiveisAtenc[mesesDisponiveisAtenc.length - 1];

  // Fetch client names for all displayed items
  const allIds = useMemo(() => {
    const set = new Set([...prioList.map(p => p.pedido_id), ...atencList.map(a => a.pedido_id)]);
    return Array.from(set);
  }, [prioList, atencList]);

  useEffect(() => {
    if (allIds.length === 0 || !supabasePedidos) return;
    const missingIds = allIds.filter(id => !pedidoInfo.has(id));
    if (missingIds.length === 0) return;
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
    void supabasePedidos
      .from(table)
      .select(tableColumns)
      .in('numero_pedido', missingIds)
      .then(({ data }) => {
        if (!data) return;
        setPedidoInfo(prev => {
          const next = new Map(prev);
          for (const row of data as any[]) {
            const o = rowToOrder(row, 'CLI-001');
            next.set(o.id, { cliente: o.clientName || o.clientCode || '-' });
          }
          return next;
        });
      });
  }, [allIds, pedidoInfo]);

  const handleSearch = async () => {
    if (!supabasePedidos || !searchQuery.trim()) return;
    setSearching(true);
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
    const { data } = await supabasePedidos
      .from(table)
      .select('numero_pedido, cliente_nome, cliente_codigo')
      .eq('numero_pedido', searchQuery.trim())
      .limit(10);
    setSearchResults((data || []).map((r: any) => rowToOrder(r, 'CLI-001')));
    setSearching(false);
  };

  const handleSave = async () => {
    if (!selectedPedido) { showToast('Selecione um pedido.', 'error'); return; }
    if (!motivo.trim()) { showToast('Informe o motivo.', 'error'); return; }
    setSaving(true);

    if (openAdd === 'prioridades') {
      const result = await upsertPrioridade({
        pedido_id: selectedPedido.id,
        nivel,
        motivo: motivo.trim(),
        criado_por: user?.username || user?.name || null,
      });
      if (result) { showToast('Prioridade adicionada!'); await refreshPrio(); resetModal(); }
      else showToast('Erro ao salvar prioridade.', 'error');
    } else {
      const result = await upsertAtencao({
        pedido_id: selectedPedido.id,
        motivo: motivo.trim(),
        criado_por: user?.username || user?.name || null,
      });
      if (result) { showToast('Atenção adicionada!'); await refreshAtencao(); resetModal(); }
      else showToast('Erro ao salvar atenção.', 'error');
    }
    setSaving(false);
  };

  const handleRemove = async () => {
    if (!openRemove) return;
    if (openRemove.tipo === 'prioridades') {
      await desativarPrioridade(openRemove.id);
      await refreshPrio();
      showToast('Prioridade removida.');
    } else {
      await desativarAtencao(openRemove.id);
      await refreshAtencao();
      showToast('Atenção removida.');
    }
    setOpenRemove(null);
  };

  const resetModal = () => {
    setOpenAdd(null);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedPedido(null);
    setNivel('alta');
    setMotivo('');
  };

  const thClass = 'py-4 px-6 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-display">Prioridades & Atenções</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie bandeiras de prioridade e pontos de atenção dos pedidos</p>
        </div>
        {canGerenciar && (
          <button className={btnPrimary} onClick={() => setOpenAdd(tab)}>
            <Plus className="h-4 w-4" />
            {tab === 'prioridades' ? 'Adicionar Prioridade' : 'Adicionar Atenção'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab('prioridades')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors -mb-px ${tab === 'prioridades' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <span className="flex items-center gap-2">
            <Flag className="h-4 w-4" />
            Prioridades
            {prioList.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">{prioList.length}</span>}
          </span>
        </button>
        <button
          onClick={() => setTab('atencoes')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors -mb-px ${tab === 'atencoes' ? 'border-blue-500 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <span className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Atenções
            {atencList.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">{atencList.length}</span>}
          </span>
        </button>
      </div>

      {/* --- Prioridades tab --- */}
      {tab === 'prioridades' && (
        <div className="space-y-4">
          {/* Navegação de mês */}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => changeMes(-1)} disabled={!canPrevMes}
              className="h-9 w-9 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-muted disabled:opacity-40 transition-colors" title="Mês anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <select value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)}
              className="h-9 px-3 rounded-lg border border-input bg-card text-foreground font-display text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary">
              {mesesDisponiveis.map(ym => <option key={ym} value={ym}>{capMes(ym)}</option>)}
            </select>
            <button type="button" onClick={() => changeMes(1)} disabled={!canNextMes}
              className="h-9 w-9 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-muted disabled:opacity-40 transition-colors" title="Próximo mês">
              <ChevronRight className="h-4 w-4" />
            </button>
            {mesFiltro === mesAtual && <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">Mês atual</span>}
          </div>

          {/* Indicadores */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total de Prioridades', value: `${totalMes}`, color: 'text-foreground' },
              { label: 'Pendentes', value: `${pendentesMes}`, color: 'text-amber-600' },
              { label: 'Atendidas', value: `${atendidasMes}`, color: 'text-emerald-600' },
              { label: 'Taxa de Atendimento', value: `${taxaMes}%`, color: 'text-primary' },
            ].map(k => (
              <div key={k.label} className="rounded-xl border border-border bg-card px-4 py-3 shadow-card">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground truncate">{k.label}</p>
                <p className={`text-xl font-bold font-display leading-tight ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Segmented Pendentes / Atendidas / Todas */}
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
            {([['pendentes', 'Pendentes'], ['atendidas', 'Atendidas'], ['todas', 'Todas']] as [StatusFiltro, string][]).map(([key, lbl]) => (
              <button key={key} type="button" onClick={() => setStatusFiltro(key)}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${statusFiltro === key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                {lbl}
              </button>
            ))}
          </div>

          {prioExibidas.length === 0 ? (
            <div className="bg-card rounded-xl border border-border shadow-card p-10 text-center">
              <Flag className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <div className="text-muted-foreground">
                {statusFiltro === 'pendentes' ? 'Nenhuma prioridade pendente' : statusFiltro === 'atendidas' ? 'Nenhuma prioridade atendida' : 'Nenhuma prioridade'} em {capMes(mesFiltro)}.
              </div>
            </div>
          ) : (
            <>
              {/* Tabela (desktop) */}
              <div className="hidden md:block bg-card rounded-xl border border-border shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className={thClass}>Pedido</th>
                        <th className={thClass}>Cliente</th>
                        <th className={thClass}>Nível</th>
                        <th className={thClass}>Motivo</th>
                        <th className={thClass}>Registrada</th>
                        <th className={thClass}>Status</th>
                        <th className={`${thClass} text-right`}>Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {prioExibidas.map(p => {
                        const cfg = NIVEL_CONFIG[p.nivel] || NIVEL_CONFIG.alta;
                        const info = pedidoInfo.get(p.pedido_id);
                        const atend = isAtendida(p);
                        return (
                          <tr key={p.pedido_id} className={`hover:bg-muted/20 transition-colors border-l-4 ${atend ? 'border-l-emerald-400/60' : 'border-l-amber-400'}`}>
                            <td className="py-3 px-6 font-mono-data font-bold text-primary">{p.pedido_id}</td>
                            <td className="py-3 px-6">{info?.cliente || '-'}</td>
                            <td className="py-3 px-6">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                                <Flag className={`h-3 w-3 ${cfg.icon}`} />{cfg.label}
                              </span>
                            </td>
                            <td className="py-3 px-6 max-w-[280px] truncate text-muted-foreground" title={p.motivo}>{p.motivo}</td>
                            <td className="py-3 px-6 font-mono-data text-muted-foreground text-xs">{fmtDate(p.criado_em)}<span className="block text-[11px]">{p.criado_por || '-'}</span></td>
                            <td className="py-3 px-6">
                              {atend ? (
                                <div>
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <CheckCircle2 className="h-3 w-3" />Atendida
                                  </span>
                                  <p className="text-[11px] text-muted-foreground mt-1">{formatDateBR(p.atendida_em)} às {formatTimeBR(p.atendida_em)}{p.atendida_por ? ` · por ${p.atendida_por}` : ''}</p>
                                </div>
                              ) : (
                                <div>
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    <Clock className="h-3 w-3" />Pendente
                                  </span>
                                  <p className="text-[11px] text-muted-foreground mt-1">Aguardando atendimento</p>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-6 text-right">
                              {canGerenciar && (
                                <div className="inline-flex items-center gap-1.5">
                                  {atend ? (
                                    <button onClick={() => setConfirmReabrir(p.pedido_id)} title="Reabrir prioridade"
                                      className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-all">
                                      <RotateCcw className="h-3.5 w-3.5" />Reabrir
                                    </button>
                                  ) : (
                                    <button onClick={() => setConfirmAtender(p.pedido_id)} title="Marcar como atendida"
                                      className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-all">
                                      <CheckCircle2 className="h-3.5 w-3.5" />Atender
                                    </button>
                                  )}
                                  <button onClick={() => setOpenRemove({ id: p.pedido_id, tipo: 'prioridades' })} title="Remover prioridade"
                                    className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-all">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cards (mobile) */}
              <div className="md:hidden space-y-2">
                {prioExibidas.map(p => {
                  const cfg = NIVEL_CONFIG[p.nivel] || NIVEL_CONFIG.alta;
                  const info = pedidoInfo.get(p.pedido_id);
                  const atend = isAtendida(p);
                  return (
                    <div key={p.pedido_id} className={`rounded-xl border border-border bg-card shadow-card p-3 border-l-4 ${atend ? 'border-l-emerald-400/60' : 'border-l-amber-400'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono-data font-bold text-primary">#{p.pedido_id}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${cfg.bg} ${cfg.color} border ${cfg.border}`}><Flag className={`h-3 w-3 ${cfg.icon}`} />{cfg.label}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-foreground">{info?.cliente || '-'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.motivo}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        {atend ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="h-3 w-3" />Atendida</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200"><Clock className="h-3 w-3" />Pendente</span>
                        )}
                        {canGerenciar && (atend ? (
                          <button onClick={() => setConfirmReabrir(p.pedido_id)} className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground"><RotateCcw className="h-3.5 w-3.5" />Reabrir</button>
                        ) : (
                          <button onClick={() => setConfirmAtender(p.pedido_id)} className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Atender</button>
                        ))}
                      </div>
                      {atend && <p className="text-[11px] text-muted-foreground mt-1">{formatDateBR(p.atendida_em)} às {formatTimeBR(p.atendida_em)}{p.atendida_por ? ` · por ${p.atendida_por}` : ''}</p>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* --- Atenções tab --- */}
      {tab === 'atencoes' && (
        <div className="space-y-4">
          {/* Navegação de mês (mesma da aba Prioridades) */}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => changeMes(-1)} disabled={!canPrevMesAtenc}
              className="h-9 w-9 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-muted disabled:opacity-40 transition-colors" title="Mês anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <select value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)}
              className="h-9 px-3 rounded-lg border border-input bg-card text-foreground font-display text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary">
              {mesesDisponiveisAtenc.map(ym => <option key={ym} value={ym}>{capMes(ym)}</option>)}
            </select>
            <button type="button" onClick={() => changeMes(1)} disabled={!canNextMes}
              className="h-9 w-9 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-muted disabled:opacity-40 transition-colors" title="Próximo mês">
              <ChevronRight className="h-4 w-4" />
            </button>
            {mesFiltro === mesAtual && <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">Mês atual</span>}
            <span className="text-xs text-muted-foreground ml-1">{atencDoMes.length} ponto{atencDoMes.length !== 1 ? 's' : ''} de atenção</span>
          </div>

          {atencDoMes.length === 0 ? (
          <div className="bg-card rounded-xl border border-border shadow-card p-10 text-center">
            <Bell className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <div className="text-muted-foreground">Nenhum ponto de atenção em {capMes(mesFiltro)}.</div>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className={thClass}>Pedido</th>
                    <th className={thClass}>Cliente</th>
                    <th className={thClass}>Motivo</th>
                    <th className={thClass}>Adicionado por</th>
                    <th className={thClass}>Data</th>
                    <th className={`${thClass} text-right`}>Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {atencDoMes.map(a => {
                    const info = pedidoInfo.get(a.pedido_id);
                    return (
                      <tr key={a.pedido_id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-4 px-6 font-mono-data font-bold text-primary">{a.pedido_id}</td>
                        <td className="py-4 px-6">{info?.cliente || '-'}</td>
                        <td className="py-4 px-6 max-w-[360px] truncate text-muted-foreground">{a.motivo}</td>
                        <td className="py-4 px-6 text-muted-foreground">{a.criado_por || '-'}</td>
                        <td className="py-4 px-6 font-mono-data text-muted-foreground">{fmtDate(a.criado_em)}</td>
                        <td className="py-4 px-6 text-right">
                          {canGerenciar && (
                            <button
                              className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-all"
                              onClick={() => setOpenRemove({ id: a.pedido_id, tipo: 'atencoes' })}
                              title="Remover atenção"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </div>
      )}

      {/* Modal Adicionar */}
      <Modal open={!!openAdd} onClose={resetModal} title={openAdd === 'prioridades' ? 'Adicionar Prioridade' : 'Adicionar Atenção'} wide>
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-tight mb-1.5">Buscar Pedido</label>
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="Número do pedido..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
              <button className={btnSecondary} onClick={handleSearch} disabled={searching}>
                <Search className="h-4 w-4" />
                {searching ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="mt-2 border border-border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                {searchResults.map(o => (
                  <button
                    key={o.id}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/30 transition-colors flex items-center gap-3 ${selectedPedido?.id === o.id ? 'bg-primary/10 border-l-2 border-primary' : ''}`}
                    onClick={() => setSelectedPedido({ id: o.id, cliente: o.clientName || o.clientCode || '-' })}
                  >
                    <span className="font-mono-data font-bold text-primary">{o.id}</span>
                    <span className="text-muted-foreground truncate">{o.clientName || o.clientCode || '-'}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedPedido && (
              <div className="mt-2 text-sm text-foreground font-semibold">
                Selecionado: <span className="text-primary">{selectedPedido.id}</span> — {selectedPedido.cliente}
              </div>
            )}
          </div>

          {/* Nível — só para prioridades */}
          {openAdd === 'prioridades' && (
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-tight mb-1.5">Nível de Prioridade</label>
              <div className="flex gap-2">
                {(Object.entries(NIVEL_CONFIG) as [NivelPrioridade, typeof NIVEL_CONFIG['urgente']][]).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setNivel(key)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-bold transition-all ${
                      nivel === key
                        ? `${cfg.bg} ${cfg.color} ${cfg.border} ring-2 ring-offset-1 ring-current/20`
                        : 'border-border text-muted-foreground hover:bg-muted/30'
                    }`}
                  >
                    <Flag className={`h-4 w-4 ${nivel === key ? cfg.icon : ''}`} />
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-tight mb-1.5">
              {openAdd === 'prioridades' ? 'Motivo da Prioridade *' : 'Ponto de Atenção *'}
            </label>
            <textarea
              className={`${inputClass} min-h-[80px] resize-y`}
              placeholder={openAdd === 'prioridades' ? 'Descreva o motivo da prioridade...' : 'Descreva o ponto de atenção...'}
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button className={btnSecondary} onClick={resetModal}>Cancelar</button>
            <button className={btnPrimary} onClick={handleSave} disabled={saving || !selectedPedido || !motivo.trim()}>
              {openAdd === 'prioridades' ? <Flag className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              {saving ? 'Salvando...' : openAdd === 'prioridades' ? 'Adicionar Prioridade' : 'Adicionar Atenção'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Confirmação de Remoção */}
      <Modal open={!!openRemove} onClose={() => setOpenRemove(null)} title={openRemove?.tipo === 'prioridades' ? 'Remover Prioridade' : 'Remover Atenção'}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">
              Tem certeza que deseja remover {openRemove?.tipo === 'prioridades' ? 'a prioridade' : 'a atenção'} do pedido{' '}
              <span className="font-bold">{openRemove?.id}</span>?
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button className={btnSecondary} onClick={() => setOpenRemove(null)}>Cancelar</button>
            <button className={btnDanger} onClick={handleRemove}>
              <Trash2 className="h-4 w-4" />
              Remover
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Marcar como atendida */}
      <Modal open={!!confirmAtender} onClose={() => updatingId ? null : setConfirmAtender(null)} title="Marcar prioridade como atendida?">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Esta prioridade sairá da lista de pendências e ficará registrada como atendida.
            O pedido continua no seu fluxo normal.
          </p>
          <div className="flex justify-end gap-3">
            <button className={btnSecondary} onClick={() => setConfirmAtender(null)} disabled={!!updatingId}>Cancelar</button>
            <button className={btnPrimary} onClick={handleAtender} disabled={!!updatingId}>
              <CheckCircle2 className="h-4 w-4" />
              {updatingId ? 'Salvando...' : 'Marcar como atendida'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Reabrir prioridade */}
      <Modal open={!!confirmReabrir} onClose={() => updatingId ? null : setConfirmReabrir(null)} title="Reabrir prioridade?">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A prioridade voltará para <strong>Pendente</strong> e a data de atendimento será removida.
          </p>
          <div className="flex justify-end gap-3">
            <button className={btnSecondary} onClick={() => setConfirmReabrir(null)} disabled={!!updatingId}>Cancelar</button>
            <button className={btnPrimary} onClick={handleReabrir} disabled={!!updatingId}>
              <RotateCcw className="h-4 w-4" />
              {updatingId ? 'Salvando...' : 'Reabrir prioridade'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Prioridades;
