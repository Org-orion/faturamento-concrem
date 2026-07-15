/**
 * Fonte de dados — Controle de Prazos de Produção.
 *
 * Retorna os pedidos que estão ATUALMENTE em `liberado_producao`, com a data real
 * de entrada nesse status (via histórico) e a classificação Venda/Suporte.
 *
 * Sem dados mockados: tudo vem de concrem_pedidos_status (+ _historico),
 * concrem_pedidos_venda (ERP) e concrem_comercial_pedidos_acoes (overrides).
 */

import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import { getValorTotalPedido } from '@/lib/valorPedido';
import type { PedidoPrazoBase, PedidoTipo } from '@/lib/prazoProducao';

const ERP_TABLE = (import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE as string) || 'concrem_pedidos_venda';

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/** Classificação Venda/Suporte — mesma regra das telas Comercial/Suporte. */
function classificarTipo(idNotaConf: number | null, override?: 'VENDA' | 'SUPORTE'): PedidoTipo | null {
  if (override) return override;
  if (idNotaConf === 613 || idNotaConf === 665) return 'SUPORTE';
  if (idNotaConf === 307 || idNotaConf === 309) return 'VENDA';
  return null; // fora das classes conhecidas → não listado (igual às telas atuais)
}

export async function listPedidosEmProducao(): Promise<PedidoPrazoBase[]> {
  if (!supabaseOps || !supabasePedidos) return [];

  // 1) Pedidos atualmente em liberado_producao (paginado p/ superar max_rows)
  const statusRows: { pedido_id: string; atualizado_em: string | null }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseOps
      .from('concrem_pedidos_status')
      .select('pedido_id, atualizado_em')
      .eq('status_atual', 'liberado_producao')
      .range(from, from + PAGE - 1);
    if (error) { console.error('[controlePrazoRepo] status:', error.message); break; }
    const page = (data ?? []) as { pedido_id: string; atualizado_em: string | null }[];
    statusRows.push(...page);
    if (page.length < PAGE) break;
  }
  const ids = [...new Set(statusRows.map((r) => String(r.pedido_id)))];
  if (!ids.length) return [];
  const fallbackDate = new Map(statusRows.map((r) => [String(r.pedido_id), r.atualizado_em || '']));

  // 2) Data real de entrada em liberado_producao: maior alterado_em no histórico
  const liberadoEmMap = new Map<string, string>();
  await Promise.all(
    chunk(ids, 200).map(async (batch) => {
      const { data, error } = await supabaseOps!
        .from('concrem_pedidos_status_historico')
        .select('pedido_id, alterado_em, status_novo')
        .eq('status_novo', 'liberado_producao')
        .in('pedido_id', batch);
      if (error) { console.error('[controlePrazoRepo] historico:', error.message); return; }
      for (const row of (data ?? []) as { pedido_id: string; alterado_em: string }[]) {
        const id = String(row.pedido_id);
        const prev = liberadoEmMap.get(id);
        if (!prev || row.alterado_em > prev) liberadoEmMap.set(id, row.alterado_em);
      }
    }),
  );

  // 3) Overrides manuais Venda/Suporte (ação mais recente por pedido)
  const overrideMap = new Map<string, 'VENDA' | 'SUPORTE'>();
  {
    const { data } = await supabaseOps
      .from('concrem_comercial_pedidos_acoes')
      .select('pedido_id, acao, criado_em')
      .in('acao', ['mover_para_suporte', 'mover_para_venda'])
      .order('criado_em', { ascending: false })
      .limit(2000);
    const latest: Record<string, string> = {};
    for (const r of (data ?? []) as { pedido_id: string; acao: string; criado_em: string }[]) {
      const id = String(r.pedido_id);
      if (!latest[id] || r.criado_em > latest[id]) {
        latest[id] = r.criado_em;
        overrideMap.set(id, r.acao === 'mover_para_suporte' ? 'SUPORTE' : 'VENDA');
      }
    }
  }

  // 4) Detalhes do ERP
  const erpMap = new Map<string, any>();
  await Promise.all(
    chunk(ids, 200).map(async (batch) => {
      const { data, error } = await supabasePedidos!
        .from(ERP_TABLE)
        .select('numero_pedido, cliente_nome, cliente_cidade, cliente_uf, representante, id_nota_conf, total_pedido_venda, total_produtos, frete')
        .in('numero_pedido', batch);
      if (error) { console.error('[controlePrazoRepo] erp:', error.message); return; }
      for (const row of (data ?? []) as any[]) erpMap.set(String(row.numero_pedido), row);
    }),
  );

  // 5) Monta a lista final classificada
  const result: PedidoPrazoBase[] = [];
  for (const id of ids) {
    const erp = erpMap.get(id);
    if (!erp) continue; // sem correspondência no ERP → não listar
    const tipo = classificarTipo(erp.id_nota_conf ?? null, overrideMap.get(id));
    if (!tipo) continue;
    const liberadoEm = liberadoEmMap.get(id) || fallbackDate.get(id) || '';
    if (!liberadoEm) continue; // sem data confiável → não listar (não inventar)
    result.push({
      pedidoId: id,
      numeroPedido: String(erp.numero_pedido ?? id),
      clienteNome: erp.cliente_nome || '—',
      cidade: erp.cliente_cidade ?? null,
      uf: erp.cliente_uf ?? null,
      representante: erp.representante ?? null,
      tipo,
      liberadoEm,
      valor: getValorTotalPedido(erp),
    });
  }
  return result;
}
