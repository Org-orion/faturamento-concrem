import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Search, Link2, X, Trash2, AlertTriangle, ArrowRightLeft, Package, Loader2 } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import { useDebounce } from '@/hooks/useDebounce';
import { can } from '@/utils/access';
import { Order, PedidoStatusValue } from '@/types';
import { formatCurrency, btnPrimary, btnSecondary, btnDanger, inputClass, FormField } from '@/components/shared';
import { PedidoStatusBadge } from '@/components/pedidos/PedidoStatusBadge';
import Modal from '@/components/Modal';
import {
  obterGrupoPedido, criarVinculos, removerVinculo, dissolverGrupo, transferirVinculo,
  buscarPedidos, buscarPedidosPorNumeros, listarVinculosAtivos, buscarStatusPedidos,
  type GrupoPedido, type BloqueioVinculo, type OrigemVinculo, type ConfirmacoesVinculo, type VinculoRow,
} from '@/lib/vinculosRepo';

const isComplemento = (o: Order | undefined | null): boolean =>
  (o?.pedCompraCliente ?? '').trim().toUpperCase() === 'COMPLEMENTO';

const MAX_RESULTS = 12;

type ModalState =
  | { kind: 'none' }
  | { kind: 'principal-complemento'; order: Order }
  | { kind: 'confirm-add'; order: Order; naoSinalizado: boolean; clienteDivergente: boolean }
  | { kind: 'remover'; pedido: string }
  | { kind: 'dissolver' }
  | { kind: 'bloqueios'; bloqueios: BloqueioVinculo[] }
  | { kind: 'transferir'; pedido: string; grupoAtual: string };

const BLOQUEIO_LABEL: Record<BloqueioVinculo['motivo'], string> = {
  auto_vinculo: 'Não pode ser vinculado a si mesmo',
  inexistente_ou_excluido: 'Pedido inexistente ou excluído',
  e_principal_de_grupo: 'Já é principal de outro grupo',
  ja_vinculado: 'Já vinculado a outro grupo',
};

export default function AgrupamentoPedidos() {
  const { orders, user } = useApp();
  const { showToast } = useToast();

  const canGerenciar = can(user, 'vinculos.gerenciar', 'agrupamento-pedidos', 'execute');
  const canDissolver = can(user, 'vinculos.dissolver', 'agrupamento-pedidos', 'execute');

  const ordersById = useMemo(() => {
    const m = new Map<string, Order>();
    for (const o of orders) m.set(o.id, o);
    return m;
  }, [orders]);

  // ── Estado principal ───────────────────────────────────────────────────────
  const [principal, setPrincipal] = useState<Order | null>(null);
  const [grupo, setGrupo] = useState<GrupoPedido | null>(null);
  const [selected, setSelected] = useState<Map<string, Order>>(new Map());
  const [naoSinalizado, setNaoSinalizado] = useState<Set<string>>(new Set());
  const [clienteDivergente, setClienteDivergente] = useState<Set<string>>(new Set());

  const [buscaPrincipal, setBuscaPrincipal] = useState('');
  const [buscaCandidato, setBuscaCandidato] = useState('');
  const qPrincipal = useDebounce(buscaPrincipal, 400).trim().toLowerCase();
  const qCandidato = useDebounce(buscaCandidato, 400).trim().toLowerCase();

  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [motivoInput, setMotivoInput] = useState('');
  const [busy, setBusy] = useState(false);

  // Grupos existentes (tabela sempre visível) + enriquecimento de nomes
  const [grupos, setGrupos] = useState<{ principal: string; vinculados: VinculoRow[] }[]>([]);
  const [enrich, setEnrich] = useState<Map<string, Order>>(new Map());
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const getOrder = useCallback((id: string) => ordersById.get(id) ?? enrich.get(id), [ordersById, enrich]);

  // Status operacional REAL (concrem_pedidos_status) — o do ERP não reflete o fluxo.
  const [statusById, setStatusById] = useState<Map<string, string>>(new Map());
  const statusRef = useRef<Map<string, string>>(new Map());
  const carregarStatus = useCallback(async (ids: string[]) => {
    const missing = [...new Set(ids.filter(Boolean))].filter((id) => !statusRef.current.has(id));
    if (missing.length === 0) return;
    for (const id of missing) statusRef.current.set(id, ''); // reserva p/ não refazer
    try {
      const map = await buscarStatusPedidos(missing);
      for (const [k, v] of Object.entries(map)) statusRef.current.set(k, v);
    } catch { /* mantém reserva vazia */ }
    setStatusById(new Map(statusRef.current));
  }, []);

  // ── Área 1: busca do principal (DIRETO no banco, não só o conjunto carregado)
  const [principalResults, setPrincipalResults] = useState<Order[]>([]);
  const [loadingPrincipal, setLoadingPrincipal] = useState(false);
  useEffect(() => {
    if (!qPrincipal) { setPrincipalResults([]); return; }
    let cancel = false;
    setLoadingPrincipal(true);
    buscarPedidos(qPrincipal, MAX_RESULTS)
      .then((rows) => { if (!cancel) setPrincipalResults(rows); })
      .catch((e: any) => { if (!cancel) { setPrincipalResults([]); showToast(`Erro na busca: ${e?.message ?? e}`, 'error'); } })
      .finally(() => { if (!cancel) setLoadingPrincipal(false); });
    return () => { cancel = true; };
  }, [qPrincipal, showToast]);

  const reloadGrupo = useCallback(async (pid: string) => {
    try {
      const g = await obterGrupoPedido(pid);
      setGrupo(g);
    } catch (e: any) {
      showToast(`Erro ao carregar grupo: ${e?.message ?? e}`, 'error');
    }
  }, [showToast]);

  const recarregarGrupos = useCallback(async () => {
    setLoadingGrupos(true);
    try {
      const rows = await listarVinculosAtivos();
      const byPrincipal = new Map<string, VinculoRow[]>();
      for (const r of rows) {
        const arr = byPrincipal.get(r.pedido_principal_id) ?? [];
        arr.push(r); byPrincipal.set(r.pedido_principal_id, arr);
      }
      setGrupos([...byPrincipal.entries()].map(([principal, vinculados]) => ({ principal, vinculados })));
      const ids = new Set<string>();
      for (const r of rows) { ids.add(r.pedido_principal_id); ids.add(r.pedido_vinculado_id); }
      const faltando = [...ids].filter((id) => !ordersById.has(id));
      if (faltando.length > 0) {
        const fetched = await buscarPedidosPorNumeros(faltando);
        setEnrich((prev) => { const n = new Map(prev); for (const o of fetched) n.set(o.id, o); return n; });
      }
    } catch (e: any) {
      showToast(`Erro ao carregar grupos: ${e?.message ?? e}`, 'error');
    } finally {
      setLoadingGrupos(false);
    }
  }, [ordersById, showToast]);

  useEffect(() => { void recarregarGrupos(); }, [recarregarGrupos]);

  const abrirGrupo = useCallback(async (principalId: string) => {
    const o = getOrder(principalId) ?? ({ id: principalId, status: 'Aguardando Avaliação' } as Order);
    setPrincipal(o);
    setSelected(new Map()); setNaoSinalizado(new Set()); setClienteDivergente(new Set());
    setBuscaPrincipal(''); setBuscaCandidato('');
    await reloadGrupo(principalId);
  }, [getOrder, reloadGrupo]);

  const escolherPrincipal = useCallback(async (o: Order) => {
    setBusy(true);
    try {
      const g = await obterGrupoPedido(o.id);
      if (g.em_grupo && g.posicao === 'vinculado') {
        // pertence ao grupo de outro principal → abrir o grupo existente
        const principalId = g.principal;
        const principalOrder = ordersById.get(principalId) ?? ({ ...o, id: principalId } as Order);
        setPrincipal(principalOrder);
        await reloadGrupo(principalId);
        showToast(`Este pedido pertence ao grupo do principal ${principalId}. Abrindo grupo existente.`);
      } else {
        setPrincipal(o);
        setGrupo(g);
        if (!g.em_grupo && isComplemento(o)) {
          setModal({ kind: 'principal-complemento', order: o });
        }
      }
      setSelected(new Map());
      setNaoSinalizado(new Set());
      setClienteDivergente(new Set());
      setBuscaPrincipal('');
    } catch (e: any) {
      showToast(`Erro ao validar pedido principal: ${e?.message ?? e}`, 'error');
    } finally {
      setBusy(false);
    }
  }, [ordersById, reloadGrupo, showToast]);

  const limparPrincipal = () => {
    setPrincipal(null); setGrupo(null); setSelected(new Map());
    setNaoSinalizado(new Set()); setClienteDivergente(new Set());
  };

  // ── Área 2: candidatos a vincular ───────────────────────────────────────────
  const idsNoGrupo = useMemo(() => {
    const s = new Set<string>();
    if (grupo?.em_grupo) { s.add(grupo.principal); for (const v of grupo.vinculados) s.add(v.pedido_vinculado_id); }
    if (principal) s.add(principal.id);
    return s;
  }, [grupo, principal]);

  // ── Área 2: sugestões (memória, priorizadas) + busca geral (DIRETO no banco)
  const [dbCandidatos, setDbCandidatos] = useState<Order[]>([]);
  const [loadingCandidatos, setLoadingCandidatos] = useState(false);
  useEffect(() => {
    if (!qCandidato) { setDbCandidatos([]); return; }
    let cancel = false;
    setLoadingCandidatos(true);
    buscarPedidos(qCandidato, MAX_RESULTS)
      .then((rows) => { if (!cancel) setDbCandidatos(rows); })
      .catch((e: any) => { if (!cancel) { setDbCandidatos([]); showToast(`Erro na busca: ${e?.message ?? e}`, 'error'); } })
      .finally(() => { if (!cancel) setLoadingCandidatos(false); });
    return () => { cancel = true; };
  }, [qCandidato, showToast]);

  const sugestoes = useMemo(() => {
    if (!principal) return [];
    const score = (o: Order) =>
      (isComplemento(o) ? 8 : 0) +
      (o.clientCode && o.clientCode === principal.clientCode ? 4 : 0) +
      (o.grupoCliente && o.grupoCliente === principal.grupoCliente ? 2 : 0) +
      (o.representativeName && o.representativeName === principal.representativeName ? 1 : 0);
    return orders
      .filter((o) => !idsNoGrupo.has(o.id) && score(o) > 0)
      .sort((a, b) => (score(b) - score(a)) || (b.date ?? '').localeCompare(a.date ?? ''))
      .slice(0, MAX_RESULTS);
  }, [orders, principal, idsNoGrupo]);

  const candidatos = useMemo(() => {
    if (!principal) return [];
    if (!qCandidato) return sugestoes;
    return dbCandidatos.filter((o) => !idsNoGrupo.has(o.id));
  }, [principal, qCandidato, sugestoes, dbCandidatos, idsNoGrupo]);

  // Carrega o status real de todos os pedidos visíveis (busca, sugestões, grupos)
  useEffect(() => {
    const ids: string[] = [];
    if (principal) ids.push(principal.id);
    for (const o of principalResults) ids.push(o.id);
    for (const o of candidatos) ids.push(o.id);
    if (grupo?.em_grupo) { ids.push(grupo.principal); for (const v of grupo.vinculados) ids.push(v.pedido_vinculado_id); }
    for (const g of grupos) { ids.push(g.principal); for (const v of g.vinculados) ids.push(v.pedido_vinculado_id); }
    void carregarStatus(ids);
  }, [principal, principalResults, candidatos, grupo, grupos, carregarStatus]);

  const StatusCell = ({ id }: { id: string }) => {
    const s = statusById.get(id);
    return s ? <PedidoStatusBadge value={s as PedidoStatusValue} /> : <span className="text-xs text-muted-foreground">—</span>;
  };

  const attemptAdd = (o: Order) => {
    if (selected.has(o.id)) { // desmarcar
      setSelected((prev) => { const n = new Map(prev); n.delete(o.id); return n; });
      setNaoSinalizado((prev) => { const n = new Set(prev); n.delete(o.id); return n; });
      setClienteDivergente((prev) => { const n = new Set(prev); n.delete(o.id); return n; });
      return;
    }
    const naoSin = !isComplemento(o);
    const divergente = !!principal && (
      (!!o.clientCode && !!principal.clientCode && o.clientCode !== principal.clientCode) ||
      (!!o.grupoCliente && !!principal.grupoCliente && o.grupoCliente !== principal.grupoCliente)
    );
    if (naoSin || divergente) {
      setModal({ kind: 'confirm-add', order: o, naoSinalizado: naoSin, clienteDivergente: divergente });
    } else {
      addToSelection(o, false, false);
    }
  };

  const addToSelection = (o: Order, naoSin: boolean, divergente: boolean) => {
    setSelected((prev) => new Map(prev).set(o.id, o));
    if (naoSin) setNaoSinalizado((prev) => new Set(prev).add(o.id));
    if (divergente) setClienteDivergente((prev) => new Set(prev).add(o.id));
  };

  // ── Criar vínculo (atômico) ─────────────────────────────────────────────────
  const criar = async () => {
    if (!principal || selected.size === 0) return;
    setBusy(true);
    try {
      const items = [...selected.values()].map((o) => ({
        pedido_id: o.id, origem: (isComplemento(o) ? 'complemento' : 'manual') as OrigemVinculo,
      }));
      const confirm: ConfirmacoesVinculo = {
        nao_sinalizado: [...naoSinalizado],
        cliente_divergente: [...clienteDivergente],
      };
      const res = await criarVinculos(principal.id, items, confirm);
      if (res.ok) {
        showToast(`Vínculo criado: ${res.vinculados.length} pedido(s) vinculado(s) ao principal ${principal.id}.`);
        setSelected(new Map()); setNaoSinalizado(new Set()); setClienteDivergente(new Set());
        await reloadGrupo(principal.id);
        await recarregarGrupos();
      } else if ('bloqueios' in res) {
        setModal({ kind: 'bloqueios', bloqueios: res.bloqueios });
      } else {
        showToast(res.error || 'Falha ao criar vínculo.', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmarRemover = async (pedido: string) => {
    setBusy(true);
    try {
      const res = await removerVinculo(pedido, motivoInput || undefined);
      if (res.ok && principal) { showToast(`Pedido ${pedido} removido do grupo.`); await reloadGrupo(principal.id); await recarregarGrupos(); }
      else if (!res.ok) showToast(res.error, 'error');
    } finally { setBusy(false); setMotivoInput(''); setModal({ kind: 'none' }); }
  };

  const confirmarDissolver = async () => {
    if (!principal || !motivoInput.trim()) return;
    setBusy(true);
    try {
      const res = await dissolverGrupo(principal.id, motivoInput.trim());
      if (res.ok) { showToast(`Grupo do pedido ${principal.id} dissolvido.`); limparPrincipal(); await recarregarGrupos(); }
      else showToast(res.error, 'error');
    } finally { setBusy(false); setMotivoInput(''); setModal({ kind: 'none' }); }
  };

  const confirmarTransferir = async (pedido: string) => {
    if (!principal) return;
    setBusy(true);
    try {
      const res = await transferirVinculo(pedido, principal.id);
      if (res.ok) {
        showToast(`Pedido ${pedido} transferido para o grupo do principal ${principal.id}.`);
        setSelected((prev) => { const n = new Map(prev); n.delete(pedido); return n; });
        await reloadGrupo(principal.id);
        await recarregarGrupos();
      } else showToast(res.error, 'error');
    } finally { setBusy(false); setModal({ kind: 'none' }); }
  };

  // ── Render helpers ───────────────────────────────────────────────────────────
  const OrderMini = ({ o, id }: { o?: Order; id: string }) => (
    <div className="min-w-0">
      <div className="font-mono-data font-bold text-foreground truncate">{id}</div>
      <div className="text-xs text-muted-foreground truncate">{o?.clientName || o?.clientCode || '—'}</div>
    </div>
  );

  const totalGrupoValor = useMemo(() => {
    let t = principal?.totalPedidoVenda ?? 0;
    for (const o of selected.values()) t += o.totalPedidoVenda ?? 0;
    return t;
  }, [principal, selected]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground flex items-center gap-2">
            <Link2 className="h-6 w-6 text-primary" /> Agrupamento de Pedidos
          </h1>
          <p className="text-sm text-muted-foreground">
            Vincule pedidos complementares a um pedido principal. O vínculo é a fonte oficial do grupo —
            <span className="font-medium"> ped_compra_cliente = COMPLEMENTO</span> é apenas sugestão.
          </p>
        </div>
        {principal && (
          <button className={btnSecondary} onClick={limparPrincipal} type="button">
            <X className="h-4 w-4" /> Trocar principal
          </button>
        )}
      </div>

      {!canGerenciar && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm px-4 py-3">
          Você tem acesso somente de leitura ao agrupamento de pedidos.
        </div>
      )}

      {/* ── ÁREA 1: Pedido Principal ─────────────────────────────────────────── */}
      {!principal && (
        <section className="bg-card border border-border rounded-xl shadow-card p-4 space-y-3">
          <h2 className="font-display font-semibold text-foreground">1. Selecione o Pedido Principal</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              className={`${inputClass} pl-9`}
              placeholder="Buscar por número, cliente, grupo ou representante…"
              value={buscaPrincipal}
              onChange={(e) => setBuscaPrincipal(e.target.value)}
              autoFocus
            />
          </div>
          {(loadingPrincipal || busy) && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {loadingPrincipal ? 'Buscando…' : 'Validando…'}</p>}
          {!loadingPrincipal && !busy && qPrincipal && principalResults.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum pedido encontrado para “{buscaPrincipal}”.</p>
          )}
          {principalResults.length > 0 && (
            <div className="border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left py-2 px-3">Pedido</th>
                    <th className="text-left py-2 px-3">Cliente</th>
                    <th className="text-left py-2 px-3">Grupo</th>
                    <th className="text-left py-2 px-3">Status</th>
                    <th className="text-right py-2 px-3">Valor</th>
                    <th className="py-2 px-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {principalResults.map((o) => (
                    <tr key={o.id} className="hover:bg-muted/30">
                      <td className="py-2 px-3 font-mono-data font-bold">
                        {o.id} {isComplemento(o) && <span className="ml-1 text-[10px] px-1 rounded bg-sky-100 text-sky-700 font-bold">COMPLEMENTO</span>}
                      </td>
                      <td className="py-2 px-3 truncate max-w-[180px]">{o.clientName || o.clientCode || '—'}</td>
                      <td className="py-2 px-3 truncate max-w-[120px]">{o.grupoCliente || '—'}</td>
                      <td className="py-2 px-3"><StatusCell id={o.id} /></td>
                      <td className="py-2 px-3 text-right font-mono-data">{formatCurrency(o.totalPedidoVenda ?? 0)}</td>
                      <td className="py-2 px-3 text-right">
                        <button className={btnPrimary} type="button" onClick={() => void escolherPrincipal(o)}>Selecionar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Resumo do principal */}
      {principal && (
        <section className="bg-card border border-border rounded-xl shadow-card p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <span className="text-xs text-muted-foreground">Pedido Principal</span>
              <div className="font-mono-data font-bold text-lg text-primary">{principal.id}</div>
            </div>
            <div><span className="text-xs text-muted-foreground">Cliente</span><div className="font-medium">{principal.clientName || principal.clientCode || '—'}</div></div>
            <div><span className="text-xs text-muted-foreground">Grupo</span><div className="font-medium">{principal.grupoCliente || '—'}</div></div>
            <div><span className="text-xs text-muted-foreground">Representante</span><div className="font-medium">{principal.representativeName || '—'}</div></div>
            <div><span className="text-xs text-muted-foreground">Status</span><div><StatusCell id={principal.id} /></div></div>
            <div><span className="text-xs text-muted-foreground">Valor</span><div className="font-mono-data font-bold">{formatCurrency(principal.totalPedidoVenda ?? 0)}</div></div>
            <div><span className="text-xs text-muted-foreground">Itens</span><div className="font-medium">{principal.items?.length ?? 0}</div></div>
            <div><span className="text-xs text-muted-foreground">Vinculados</span><div className="font-medium">{grupo?.em_grupo ? grupo.vinculados.length : 0}</div></div>
          </div>
        </section>
      )}

      {/* ── Grupos existentes (sempre visível) ────────────────────────────────── */}
      <section className="bg-card border border-border rounded-xl shadow-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
            <Package className="h-4 w-4" /> Grupos existentes ({grupos.length})
          </h2>
          {loadingGrupos && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {grupos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum grupo criado ainda. Selecione um pedido principal acima para começar.</p>
        ) : (
          <div className="border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left py-2 px-3">Pedido Principal</th>
                  <th className="text-left py-2 px-3">Cliente</th>
                  <th className="text-left py-2 px-3">Status</th>
                  <th className="text-left py-2 px-3">Pedidos vinculados</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {grupos.map((g) => {
                  const po = getOrder(g.principal);
                  return (
                    <tr key={g.principal} className={`hover:bg-muted/30 ${principal?.id === g.principal ? 'bg-primary/5' : ''}`}>
                      <td className="py-2 px-3 font-mono-data font-bold">{g.principal}</td>
                      <td className="py-2 px-3 truncate max-w-[220px]">{po?.clientName || po?.clientCode || '—'}</td>
                      <td className="py-2 px-3"><StatusCell id={g.principal} /></td>
                      <td className="py-2 px-3">
                        <span className="text-xs text-muted-foreground">{g.vinculados.length} pedido(s): </span>
                        <span className="font-mono-data text-xs">{g.vinculados.map((v) => v.pedido_vinculado_id).join(', ')}</span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button type="button" className={btnSecondary} onClick={() => void abrirGrupo(g.principal)}>Abrir</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── ÁREA 2 + 3 lado a lado no desktop ────────────────────────────────── */}
      {principal && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Candidatos */}
          <section className="lg:col-span-2 bg-card border border-border rounded-xl shadow-card p-4 space-y-3">
            <h2 className="font-display font-semibold text-foreground">2. Pedidos complementares</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                className={`${inputClass} pl-9`}
                placeholder="Buscar outros pedidos (número, cliente, grupo, representante)…"
                value={buscaCandidato}
                onChange={(e) => setBuscaCandidato(e.target.value)}
                disabled={!canGerenciar}
              />
            </div>
            {!qCandidato && (
              <p className="text-xs text-muted-foreground">
                Sugestões priorizadas (complementos, mesmo cliente/grupo/representante). Use a busca para localizar qualquer pedido.
              </p>
            )}
            <div className="border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 px-3 w-8"></th>
                    <th className="text-left py-2 px-3">Pedido</th>
                    <th className="text-left py-2 px-3">Cliente</th>
                    <th className="text-left py-2 px-3">Status</th>
                    <th className="text-right py-2 px-3">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {loadingCandidatos && (
                    <tr><td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Buscando…</span>
                    </td></tr>
                  )}
                  {!loadingCandidatos && candidatos.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      {qCandidato ? 'Nenhum pedido encontrado.' : 'Nenhuma sugestão de complemento. Use a busca acima.'}
                    </td></tr>
                  )}
                  {candidatos.map((o) => {
                    const sel = selected.has(o.id);
                    return (
                      <tr key={o.id} className={`hover:bg-muted/30 ${sel ? 'bg-primary/5' : ''}`}>
                        <td className="py-2 px-3 text-center">
                          <input type="checkbox" checked={sel} disabled={!canGerenciar} onChange={() => attemptAdd(o)} className="cursor-pointer" />
                        </td>
                        <td className="py-2 px-3 font-mono-data font-bold">
                          {o.id}{' '}
                          {isComplemento(o)
                            ? <span className="text-[10px] px-1 rounded bg-sky-100 text-sky-700 font-bold">complemento</span>
                            : <span className="text-[10px] px-1 rounded bg-muted text-muted-foreground font-bold">manual</span>}
                        </td>
                        <td className="py-2 px-3 truncate max-w-[180px]">{o.clientName || o.clientCode || '—'}</td>
                        <td className="py-2 px-3"><StatusCell id={o.id} /></td>
                        <td className="py-2 px-3 text-right font-mono-data">{formatCurrency(o.totalPedidoVenda ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Resumo da seleção + grupo atual */}
          <section className="space-y-6">
            {/* Seleção a vincular */}
            <div className="bg-card border border-border rounded-xl shadow-card p-4 space-y-3">
              <h2 className="font-display font-semibold text-foreground">3. Resumo da seleção</h2>
              {selected.size === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum pedido selecionado.</p>
              ) : (
                <ul className="space-y-1.5">
                  {[...selected.values()].map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                      <OrderMini o={o} id={o.id} />
                      <div className="flex items-center gap-1">
                        {naoSinalizado.has(o.id) && <span title="Não sinalizado como complemento" className="text-[10px] px-1 rounded bg-amber-100 text-amber-700 font-bold">?</span>}
                        {clienteDivergente.has(o.id) && <span title="Cliente/grupo divergente" className="text-[10px] px-1 rounded bg-orange-100 text-orange-700 font-bold">≠</span>}
                        <button type="button" className="p-1 hover:bg-muted rounded" onClick={() => attemptAdd(o)}><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {selected.size > 0 && (
                <div className="text-sm border-t border-border pt-2 space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Pedidos</span><span className="font-medium">{selected.size}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Valor do grupo</span><span className="font-mono-data font-bold">{formatCurrency(totalGrupoValor)}</span></div>
                  {naoSinalizado.size > 0 && <div className="flex justify-between text-amber-700"><span>Não sinalizados</span><span>{naoSinalizado.size}</span></div>}
                  {clienteDivergente.size > 0 && <div className="flex justify-between text-orange-700"><span>Clientes divergentes</span><span>{clienteDivergente.size}</span></div>}
                </div>
              )}
              <button className={`${btnPrimary} w-full justify-center`} type="button" disabled={!canGerenciar || busy || selected.size === 0} onClick={() => void criar()}>
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando…</> : <><Link2 className="h-4 w-4" /> Criar vínculo</>}
              </button>
            </div>

            {/* Grupo atual */}
            {grupo?.em_grupo && (
              <div className="bg-card border border-border rounded-xl shadow-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-semibold text-foreground flex items-center gap-2"><Package className="h-4 w-4" /> Grupo atual ({grupo.total})</h2>
                  {canDissolver && (
                    <button type="button" className="text-xs text-destructive hover:underline" onClick={() => { setMotivoInput(''); setModal({ kind: 'dissolver' }); }}>
                      Dissolver grupo
                    </button>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {grupo.vinculados.map((v) => {
                    const o = getOrder(v.pedido_vinculado_id);
                    return (
                      <li key={v.pedido_vinculado_id} className="flex items-center justify-between gap-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <OrderMini o={o} id={v.pedido_vinculado_id} />
                          <span className={`text-[10px] px-1 rounded font-bold ${v.origem === 'complemento' ? 'bg-sky-100 text-sky-700' : 'bg-muted text-muted-foreground'}`}>
                            {v.origem === 'complemento' ? 'complemento' : 'manual'}
                          </span>
                        </div>
                        {canGerenciar && (
                          <button type="button" className="p-1 hover:bg-muted rounded text-destructive" title="Remover do grupo"
                            onClick={() => { setMotivoInput(''); setModal({ kind: 'remover', pedido: v.pedido_vinculado_id }); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── MODAIS ────────────────────────────────────────────────────────────── */}
      <Modal open={modal.kind === 'principal-complemento'} onClose={() => setModal({ kind: 'none' })} title="Este pedido está identificado como complemento">
        {modal.kind === 'principal-complemento' && (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <p>O campo <span className="font-mono-data">ped_compra_cliente</span> indica que o pedido <b>{modal.order.id}</b> pode ter sido criado como complemento. Verifique se ele realmente deve ser o <b>Pedido Principal</b>.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => { limparPrincipal(); setModal({ kind: 'none' }); }}>Cancelar</button>
              <button type="button" className={btnPrimary} onClick={() => setModal({ kind: 'none' })}>Continuar mesmo assim</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={modal.kind === 'confirm-add'} onClose={() => setModal({ kind: 'none' })}
        title={modal.kind === 'confirm-add' && modal.clienteDivergente ? 'Clientes diferentes' : 'Pedido não identificado como complemento'}>
        {modal.kind === 'confirm-add' && (
          <div className="space-y-4">
            {modal.naoSinalizado && (
              <div className="flex gap-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <p>O sistema não identifica o pedido <b>{modal.order.id}</b> como complemento pelo campo de compra do cliente. Confirme se ele realmente deve ser vinculado ao principal <b>{principal?.id}</b>.</p>
              </div>
            )}
            {modal.clienteDivergente && (
              <div className="flex gap-3 rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <p>O pedido principal pertence ao cliente <b>{principal?.clientName || principal?.clientCode}</b>, enquanto o pedido <b>{modal.order.id}</b> pertence ao cliente <b>{modal.order.clientName || modal.order.clientCode}</b>.</p>
              </div>
            )}
            <div className="text-sm grid grid-cols-2 gap-2 bg-muted/30 rounded-lg p-3">
              <div><span className="text-muted-foreground">Selecionado</span><div className="font-mono-data font-bold">{modal.order.id}</div><div className="text-xs">{modal.order.clientName || modal.order.clientCode}</div></div>
              <div><span className="text-muted-foreground">Principal</span><div className="font-mono-data font-bold">{principal?.id}</div><div className="text-xs">{principal?.clientName || principal?.clientCode}</div></div>
              <div><span className="text-muted-foreground">Valor</span><div className="font-mono-data">{formatCurrency(modal.order.totalPedidoVenda ?? 0)}</div></div>
              <div><span className="text-muted-foreground">Status</span><div><StatusCell id={modal.order.id} /></div></div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setModal({ kind: 'none' })}>Cancelar</button>
              <button type="button" className={btnPrimary} onClick={() => { addToSelection(modal.order, modal.naoSinalizado, modal.clienteDivergente); setModal({ kind: 'none' }); }}>
                Vincular mesmo assim
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={modal.kind === 'remover'} onClose={() => setModal({ kind: 'none' })} title="Remover pedido do grupo?">
        {modal.kind === 'remover' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              O pedido <b>{modal.pedido}</b> deixará de ser tratado como complemento do pedido principal <b>{principal?.id}</b>.
              Essa ação <b>não</b> exclui o pedido nem seus documentos.
            </p>
            <FormField label="Motivo (opcional)">
              <input className={inputClass} value={motivoInput} onChange={(e) => setMotivoInput(e.target.value)} placeholder="Ex.: pedido não faz parte do complemento" />
            </FormField>
            <div className="flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setModal({ kind: 'none' })}>Cancelar</button>
              <button type="button" className={btnDanger} disabled={busy} onClick={() => void confirmarRemover(modal.pedido)}>Remover vínculo</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={modal.kind === 'dissolver'} onClose={() => setModal({ kind: 'none' })} title="Dissolver grupo?">
        {modal.kind === 'dissolver' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Todos os pedidos vinculados deixarão de pertencer ao grupo do pedido <b>{principal?.id}</b>.
              Os pedidos e documentos <b>não</b> serão excluídos e os status não mudam.
            </p>
            <FormField label="Motivo (obrigatório)">
              <input className={inputClass} value={motivoInput} onChange={(e) => setMotivoInput(e.target.value)} placeholder="Informe o motivo da dissolução" />
            </FormField>
            <div className="flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setModal({ kind: 'none' })}>Cancelar</button>
              <button type="button" className={btnDanger} disabled={busy || !motivoInput.trim()} onClick={() => void confirmarDissolver()}>Dissolver grupo</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={modal.kind === 'bloqueios'} onClose={() => setModal({ kind: 'none' })} title="Alguns pedidos não puderam ser vinculados">
        {modal.kind === 'bloqueios' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Nenhum vínculo foi criado. Corrija os itens abaixo e tente novamente (a seleção foi mantida).</p>
            <ul className="space-y-2">
              {modal.bloqueios.map((b) => (
                <li key={b.pedido_id} className="flex items-center justify-between gap-2 text-sm rounded-lg bg-muted/40 p-2">
                  <div>
                    <span className="font-mono-data font-bold">{b.pedido_id}</span>
                    <div className="text-xs text-destructive">
                      {BLOQUEIO_LABEL[b.motivo]}{b.motivo === 'ja_vinculado' && b.grupo_atual ? ` (principal ${b.grupo_atual})` : ''}
                    </div>
                  </div>
                  {b.motivo === 'ja_vinculado' && b.grupo_atual && canGerenciar && (
                    <button type="button" className={btnSecondary}
                      onClick={() => setModal({ kind: 'transferir', pedido: b.pedido_id, grupoAtual: b.grupo_atual! })}>
                      <ArrowRightLeft className="h-4 w-4" /> Transferir
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button type="button" className={btnPrimary} onClick={() => setModal({ kind: 'none' })}>Entendi</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={modal.kind === 'transferir'} onClose={() => setModal({ kind: 'none' })} title="Transferir pedido de grupo?">
        {modal.kind === 'transferir' && (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              <ArrowRightLeft className="h-5 w-5 shrink-0" />
              <p>O pedido <b>{modal.pedido}</b> está vinculado ao principal <b>{modal.grupoAtual}</b>. Ao transferir, o vínculo anterior será removido e ele passará ao grupo do principal <b>{principal?.id}</b>. A operação é registrada na auditoria.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setModal({ kind: 'none' })}>Cancelar</button>
              <button type="button" className={btnPrimary} disabled={busy} onClick={() => void confirmarTransferir(modal.pedido)}>Confirmar transferência</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
