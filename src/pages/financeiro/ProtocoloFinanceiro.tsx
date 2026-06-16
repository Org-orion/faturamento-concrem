import React, { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import { can } from '@/utils/access';
import { btnPrimary } from '@/components/shared';
import {
  fetchPedidosElegiveis,
  gerarNumeroProtocolo,
  salvarProtocolo,
  listarProtocolos,
  cancelarProtocolo,
  gerarPdfProtocolo,
  ProtocoloError,
  type PedidoElegivel,
  type ProtocoloComPedidos,
} from '@/lib/protocoloFinanceiro';
import { PedidoSelectorTable, type ColunaFiltros } from '@/components/financeiro/PedidoSelectorTable';
import { ProtocoloPreview } from '@/components/financeiro/ProtocoloPreview';
import { HistoricoProtocolos } from '@/components/financeiro/HistoricoProtocolos';
import { fmtDate } from '@/lib/dateUtils';

const PAGE_SIZE = 15;

type Tab = 'novo' | 'historico';

const ProtocoloFinanceiro: React.FC = () => {
  const { user } = useApp();
  const { showToast } = useToast();

  const canView = can(user, 'protocolo_financeiro.view', 'protocolo-financeiro', 'view');
  const canGerar = can(user, 'protocolo_financeiro.gerar', 'protocolo-financeiro', 'execute');
  const isAdmin = user?.role === 'ADMIN';

  const [tab, setTab] = useState<Tab>('novo');

  // --- Aba Novo Protocolo ---
  const [elegiveis, setElegiveis] = useState<PedidoElegivel[]>([]);
  const [loadingElegiveis, setLoadingElegiveis] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<ColunaFiltros>({ cliente: '', pedido: '', nf: '', data: '' });
  const [page, setPage] = useState(1);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [numeroPreview, setNumeroPreview] = useState('');
  const [gerando, setGerando] = useState(false);

  // --- Aba Histórico ---
  const [protocolos, setProtocolos] = useState<ProtocoloComPedidos[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [baixandoId, setBaixandoId] = useState<string | null>(null);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);

  const loadElegiveis = async () => {
    setLoadingElegiveis(true);
    try {
      const list = await fetchPedidosElegiveis();
      setElegiveis(list);
      setSelected((prev) => {
        const valid = new Set(list.map((p) => p.pedidoId));
        return new Set([...prev].filter((id) => valid.has(id)));
      });
    } catch (e) {
      showToast(e instanceof ProtocoloError ? e.message : 'Erro ao carregar pedidos. Tente novamente.', 'error');
    } finally {
      setLoadingElegiveis(false);
    }
  };

  const loadHistorico = async () => {
    setLoadingHist(true);
    try {
      setProtocolos(await listarProtocolos());
    } catch (e) {
      showToast(e instanceof ProtocoloError ? e.message : 'Erro ao carregar o histórico.', 'error');
    } finally {
      setLoadingHist(false);
    }
  };

  useEffect(() => {
    if (!canView) return;
    void loadElegiveis();
    void loadHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  const dataStrOf = (o: PedidoElegivel) => (o.entregueEm ? fmtDate(o.entregueEm) : '');

  const options = useMemo(() => {
    const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return {
      clientes: uniq(elegiveis.map((e) => e.nomeCliente)),
      pedidos: uniq(elegiveis.map((e) => e.pedidoId)),
      nfs: uniq(elegiveis.map((e) => e.numeroNota)),
      datas: uniq(elegiveis.map((e) => dataStrOf(e))),
    };
  }, [elegiveis]);

  const filtered = useMemo(() => {
    const c = filters.cliente.trim().toLowerCase();
    const p = filters.pedido.trim().toLowerCase();
    const n = filters.nf.trim().toLowerCase();
    const d = filters.data.trim().toLowerCase();
    return elegiveis.filter((o) => {
      if (c && !(o.nomeCliente || '').toLowerCase().includes(c)) return false;
      if (p && !o.pedidoId.toLowerCase().includes(p)) return false;
      if (n && !(o.numeroNota || '').toLowerCase().includes(n)) return false;
      if (d && !dataStrOf(o).toLowerCase().includes(d)) return false;
      return true;
    });
  }, [elegiveis, filters]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, (page - 1) * PAGE_SIZE + PAGE_SIZE), [filtered, page]);

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.pedidoId));
  const someSelected = filtered.some((p) => selected.has(p.pedidoId));

  // Volta para a primeira página quando os filtros mudam ou a lista recarrega
  useEffect(() => { setPage(1); }, [filters, elegiveis]);

  const selectedPedidos = useMemo(() => elegiveis.filter((p) => selected.has(p.pedidoId)), [elegiveis, selected]);

  const toggle = (pedidoId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pedidoId)) next.delete(pedidoId);
      else next.add(pedidoId);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of filtered) {
        if (checked) next.add(p.pedidoId);
        else next.delete(p.pedidoId);
      }
      return next;
    });
  };

  const limparFiltros = () => setFilters({ cliente: '', pedido: '', nf: '', data: '' });

  const abrirPreview = async () => {
    if (!selected.size) return;
    try {
      const numero = await gerarNumeroProtocolo(new Date().getFullYear());
      setNumeroPreview(numero);
      setPreviewOpen(true);
    } catch (e) {
      showToast(e instanceof ProtocoloError ? e.message : 'Erro ao preparar o protocolo.', 'error');
    }
  };

  const confirmarGeracao = async () => {
    setGerando(true);
    try {
      const saved = await salvarProtocolo({
        pedidos: selectedPedidos.map((p) => ({
          pedido_id: p.pedidoId,
          programacao_id: p.programacaoId,
          numero_nota: p.numeroNota,
          nome_cliente: p.nomeCliente,
        })),
        criadoPor: user?.username ?? null,
        criadoPorNome: user?.name ?? null,
      });

      try {
        await gerarPdfProtocolo(saved, saved.pedidos, user?.name);
      } catch {
        showToast(`Protocolo ${saved.numero_protocolo} gerado, mas houve falha ao baixar o PDF. Baixe novamente na aba Histórico.`, 'error');
      }

      showToast(`Protocolo ${saved.numero_protocolo} gerado com sucesso.`, 'success');
      setPreviewOpen(false);
      setSelected(new Set());
      await Promise.all([loadElegiveis(), loadHistorico()]);
    } catch (e) {
      setPreviewOpen(false);
      showToast(e instanceof ProtocoloError ? e.message : 'Erro ao gerar o protocolo. Tente novamente.', 'error');
      void loadElegiveis(); // refaz a lista caso outro usuário tenha protocolado
    } finally {
      setGerando(false);
    }
  };

  const baixarPdf = async (p: ProtocoloComPedidos) => {
    setBaixandoId(p.id);
    try {
      await gerarPdfProtocolo(p, p.pedidos, p.criado_por_nome);
    } catch {
      showToast('Falha ao gerar o PDF. Tente novamente.', 'error');
    } finally {
      setBaixandoId(null);
    }
  };

  const cancelar = async (p: ProtocoloComPedidos) => {
    if (!window.confirm(`Cancelar o protocolo ${p.numero_protocolo}? Os pedidos permanecem bloqueados.`)) return;
    setCancelandoId(p.id);
    try {
      await cancelarProtocolo(p.id);
      showToast(`Protocolo ${p.numero_protocolo} cancelado.`, 'success');
      await loadHistorico();
    } catch (e) {
      showToast(e instanceof ProtocoloError ? e.message : 'Erro ao cancelar o protocolo.', 'error');
    } finally {
      setCancelandoId(null);
    }
  };

  if (!canView) {
    return <div className="p-6 text-sm text-muted-foreground">Você não tem permissão para acessar esta tela.</div>;
  }

  const tabBtn = (key: Tab, label: string) =>
    `px-4 py-2 text-sm font-display font-semibold border-b-2 transition-colors ${
      tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Protocolo Financeiro</h1>
          <p className="text-sm text-muted-foreground">Geração de protocolos de entrega de notas fiscais</p>
        </div>
      </div>

      <div className="border-b border-border flex items-center gap-2">
        <button className={tabBtn('novo', 'Novo Protocolo')} onClick={() => setTab('novo')}>Novo Protocolo</button>
        <button className={tabBtn('historico', 'Histórico')} onClick={() => setTab('historico')}>Histórico</button>
      </div>

      {tab === 'novo' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{filtered.length} pedido(s) elegível(is)</p>
            <button
              onClick={limparFiltros}
              className="px-4 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors font-display text-sm font-medium"
            >
              Limpar filtros
            </button>
          </div>

          <PedidoSelectorTable
            pedidos={pageItems}
            selected={selected}
            allSelected={allSelected}
            someSelected={someSelected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            loading={loadingElegiveis}
            filters={filters}
            onFilterChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
            options={options}
          />

          {!loadingElegiveis && filtered.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded border border-border bg-card text-xs font-semibold disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="text-xs text-muted-foreground">Página {page} de {pageCount}</span>
                <button
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  className="px-3 py-1.5 rounded border border-border bg-card text-xs font-semibold disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">{selected.size} pedido(s) selecionado(s)</p>
            <div className="flex flex-col items-end gap-1">
              <button
                className={btnPrimary}
                disabled={selected.size === 0 || !canGerar}
                onClick={() => void abrirPreview()}
              >
                Gerar Protocolo
              </button>
              {!canGerar && (
                <p className="text-xs text-muted-foreground">Você não tem permissão para gerar protocolos.</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <HistoricoProtocolos
          protocolos={protocolos}
          loading={loadingHist}
          isAdmin={isAdmin}
          baixandoId={baixandoId}
          cancelandoId={cancelandoId}
          onBaixarPdf={(p) => void baixarPdf(p)}
          onCancelar={(p) => void cancelar(p)}
        />
      )}

      <ProtocoloPreview
        open={previewOpen}
        numeroProtocolo={numeroPreview}
        pedidos={selectedPedidos}
        loading={gerando}
        onClose={() => setPreviewOpen(false)}
        onConfirm={() => void confirmarGeracao()}
      />
    </div>
  );
};

export default ProtocoloFinanceiro;
