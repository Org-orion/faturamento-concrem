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
        .select('numero_pedido, cliente_nome, cliente_cidade, cliente_uf, representante, grupo_cliente, id_nota_conf, total_pedido_venda, total_produtos, frete')
        .in('numero_pedido', batch);
      if (error) { console.error('[controlePrazoRepo] erp:', error.message); return; }
      for (const row of (data ?? []) as any[]) erpMap.set(String(row.numero_pedido), row);
    }),
  );

  // 5) Carregamentos programados ativos → pedido_id → carga mais iminente
  //    Ativo = shipment_status diferente de Cancelado/Entregue (concluído).
  //    Um carregamento tem vários pedidos; um pedido em várias cargas → menor planned_date.
  const CARGA_INATIVA = new Set(['Cancelado', 'Entregue']);
  const cargaMap = new Map<string, { id: string; data: string | null; status: string | null }>();
  {
    const { data, error } = await supabaseOps
      .from('concrem_programacoes_embarque')
      .select('id, planned_date, shipment_status, pedidos')
      .not('pedidos', 'is', null);
    if (error) console.error('[controlePrazoRepo] carregamentos:', error.message);
    for (const l of (data ?? []) as { id: string; planned_date: string | null; shipment_status: string | null; pedidos: string[] | null }[]) {
      if (CARGA_INATIVA.has(String(l.shipment_status ?? ''))) continue;
      const data0 = l.planned_date ? String(l.planned_date).slice(0, 10) : null;
      for (const pid of l.pedidos ?? []) {
        const key = String(pid);
        const prev = cargaMap.get(key);
        // mantém a carga com data mais próxima (menor planned_date)
        if (!prev || (data0 && (!prev.data || data0 < prev.data))) {
          cargaMap.set(key, { id: String(l.id), data: data0, status: l.shipment_status ?? null });
        }
      }
    }
  }

  // 6) Monta a lista final classificada
  const result: PedidoPrazoBase[] = [];
  for (const id of ids) {
    const erp = erpMap.get(id);
    if (!erp) continue; // sem correspondência no ERP → não listar
    const tipo = classificarTipo(erp.id_nota_conf ?? null, overrideMap.get(id));
    if (!tipo) continue;
    const liberadoEm = liberadoEmMap.get(id) || fallbackDate.get(id) || '';
    if (!liberadoEm) continue; // sem data confiável → não listar (não inventar)
    const carga = cargaMap.get(id) ?? null;
    result.push({
      pedidoId: id,
      numeroPedido: String(erp.numero_pedido ?? id),
      clienteNome: erp.cliente_nome || '—',
      cidade: erp.cliente_cidade ?? null,
      uf: erp.cliente_uf ?? null,
      representante: erp.representante ?? null,
      grupoCliente: erp.grupo_cliente ?? null,
      tipo,
      liberadoEm,
      valor: getValorTotalPedido(erp),
      carregamentoId: carga?.id ?? null,
      carregamentoData: carga?.data ?? null,
      carregamentoStatus: carga?.status ?? null,
    });
  }
  return result;
}
