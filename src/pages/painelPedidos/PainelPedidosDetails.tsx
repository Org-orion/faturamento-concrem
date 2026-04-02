import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PedidoStatusBadge } from '@/components/pedidos/PedidoStatusBadge';
import { PedidoHistoricoMovimentacao } from '@/components/pedidos/PedidoHistoricoMovimentacao';
import { PedidoStatusHistoricoRow, PedidoStatusValue } from '@/types';
import { toStageDates } from '@/lib/pedidoStatusFlow';
import { UnifiedPedido } from './types';

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('pt-BR');
};

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

export function PainelPedidosDetails({
  pedido,
  statusAtual,
  history,
  historyLoading,
}: {
  pedido: UnifiedPedido | null;
  statusAtual: PedidoStatusValue | null;
  history: PedidoStatusHistoricoRow[];
  historyLoading: boolean;
}) {
  const stageDates = useMemo(() => {
    return toStageDates(
      history
        .slice()
        .sort((a, b) => new Date(a.alterado_em).getTime() - new Date(b.alterado_em).getTime())
        .map((h) => ({ status_novo: h.status_novo, alterado_em: h.alterado_em })),
    );
  }, [history]);

  return (
    <div className="bg-card rounded-xl border border-border shadow-card p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold font-display">Detalhes do Pedido</div>
        {pedido && (
          <Link
            to={`/atualizacao-status?pedido=${encodeURIComponent(pedido.id)}`}
            className="text-xs font-bold uppercase tracking-tight text-primary hover:underline"
          >
            Atualizar Status
          </Link>
        )}
      </div>

      {!pedido || !statusAtual ? (
        <div className="mt-4 text-sm text-muted-foreground">Selecione um pedido na lista.</div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-border bg-muted/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground font-bold uppercase tracking-tight">Pedido</div>
                <div className="text-lg font-mono-data font-bold text-primary truncate">{pedido.numero}</div>
                <div className="mt-1 text-sm font-bold text-foreground truncate">{pedido.cliente}</div>
                <div className="text-xs text-muted-foreground truncate">{pedido.representante}</div>
                {pedido.identificacao && <div className="text-xs text-muted-foreground mt-1">Identificação: <span className="font-semibold text-foreground">{pedido.identificacao}</span></div>}
                {pedido.grupoCliente && <div className="text-xs text-muted-foreground">Grupo: <span className="font-semibold text-foreground">{pedido.grupoCliente}</span></div>}
                {pedido.cidade && <div className="text-xs text-muted-foreground">{pedido.cidade}{pedido.uf ? ` - ${pedido.uf}` : ''}</div>}
                {pedido.previsaoEmbarque && <div className="text-xs text-muted-foreground">Prev. Embarque: <span className="font-semibold text-foreground">{pedido.previsaoEmbarque}</span></div>}
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground font-bold uppercase tracking-tight">Valor</div>
                <div className="text-sm font-bold">{formatCurrency(pedido.valor)}</div>
              </div>
            </div>
            <div className="mt-3">
              <PedidoStatusBadge value={statusAtual} className="w-full justify-center" />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-bold uppercase tracking-tight text-muted-foreground">Datas do Pedido</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Aprovação</span><span className="font-mono-data">{fmtDateTime(stageDates.dataAprovacao)}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Lib. Comercial</span><span className="font-mono-data">{fmtDateTime(stageDates.dataLiberacaoComercial)}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Mapeamento</span><span className="font-mono-data">{fmtDateTime(stageDates.dataMapeamento)}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Ferragem</span><span className="font-mono-data">{fmtDateTime(stageDates.dataFerragem)}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Liberação p/ Produção</span><span className="font-mono-data">{fmtDateTime(stageDates.dataLiberacaoProducao)}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Conclusão Produção</span><span className="font-mono-data">{fmtDateTime(stageDates.dataConclusaoProducao)}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Faturamento</span><span className="font-mono-data">{fmtDateTime(stageDates.dataFaturamento)}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Em Rota</span><span className="font-mono-data">{fmtDateTime(stageDates.dataExpedicao)}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Entrega</span><span className="font-mono-data">{fmtDateTime(stageDates.dataEntrega)}</span></div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-bold uppercase tracking-tight text-muted-foreground">Histórico de Movimentação</div>
            <div className="mt-3">
              {historyLoading ? <div className="text-sm text-muted-foreground">Carregando...</div> : <PedidoHistoricoMovimentacao items={history} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

