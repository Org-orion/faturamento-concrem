/**
 * Lixeira de Pedidos — exclusão lógica e restauração (admin-only).
 *
 * As operações de escrita passam pelas RPCs `excluir_pedido` / `restaurar_pedido`
 * (SECURITY DEFINER), que validam `is_admin()` no banco e são atômicas. O frontend
 * NÃO faz update direto nos campos de exclusão.
 *
 * Regra dos 30 dias centralizada aqui (fonte: excluido_em, calendário de Brasília).
 */

import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import { getValorTotalPedido } from '@/lib/valorPedido';
import { diasDecorridosBR } from '@/lib/dateUtils';

const ERP_TABLE = (import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE as string) || 'concrem_pedidos_venda';
export const PRAZO_RESTAURACAO_DIAS = 30;

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export type SituacaoRestauracao = { diasDesde: number; diasRestantes: number; restauravel: boolean };

/** Regra única dos 30 dias a partir de excluido_em (dias no calendário de Brasília). */
export function situacaoRestauracao(excluidoEm?: string | null): SituacaoRestauracao {
  const diasDesde = diasDecorridosBR(excluidoEm);
  const diasRestantes = Math.max(0, PRAZO_RESTAURACAO_DIAS - diasDesde);
  return { diasDesde, diasRestantes, restauravel: diasDesde <= PRAZO_RESTAURACAO_DIAS };
}

export type PedidoLixeira = {
  pedidoId: string;
  numeroPedido: string;
  clienteNome: string;
  grupoCliente: string | null;
  representante: string | null;
  statusAtual: string;
  valor: number;
  excluidoEm: string;
  excluidoPorNome: string | null;
  motivo: string | null;
};

export type PedidoAtivoBusca = {
  pedidoId: string;
  numeroPedido: string;
  clienteNome: string;
  grupoCliente: string | null;
  representante: string | null;
  statusAtual: string;
  valor: number;
};

/** Junta detalhes do ERP a um conjunto de pedido_ids. */
async function fetchErp(ids: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (!supabasePedidos || !ids.length) return map;
  await Promise.all(
    chunk(ids, 200).map(async (batch) => {
      const { data } = await supabasePedidos!
        .from(ERP_TABLE)
        .select('numero_pedido, cliente_nome, grupo_cliente, representante, total_pedido_venda, id_nota_conf')
        .in('numero_pedido', batch);
      for (const r of (data ?? []) as any[]) map.set(String(r.numero_pedido), r);
    }),
  );
  return map;
}

/**
 * Conjunto de pedido_ids logicamente excluídos (excluido_em preenchido).
 * Usado para filtrar pedidos excluídos das telas/consultas operacionais.
 * Retorna poucas linhas (só os excluídos), então é barato paginar.
 */
export async function listExcludedPedidoIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!supabaseOps) return ids;
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseOps
      .from('concrem_pedidos_status')
      .select('pedido_id')
      .not('excluido_em', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) { console.error('[lixeiraRepo] excludedIds:', error.message); break; }
    const rows = (data ?? []) as { pedido_id: string }[];
    for (const r of rows) ids.add(String(r.pedido_id));
    if (rows.length < PAGE) break;
  }
  return ids;
}

/** Lista os pedidos logicamente excluídos (excluido_em preenchido). */
export async function listPedidosExcluidos(): Promise<PedidoLixeira[]> {
  if (!supabaseOps) return [];
  const { data, error } = await supabaseOps
    .from('concrem_pedidos_status')
    .select('pedido_id, status_atual, excluido_em, excluido_por_nome, motivo_exclusao')
    .not('excluido_em', 'is', null)
    .order('excluido_em', { ascending: false });
  if (error) { console.error('[lixeiraRepo] listExcluidos:', error.message); return []; }
  const rows = (data ?? []) as any[];
  const erp = await fetchErp(rows.map((r) => String(r.pedido_id)));
  return rows.map((r) => {
    const e = erp.get(String(r.pedido_id));
    return {
      pedidoId: String(r.pedido_id),
      numeroPedido: String(r.pedido_id),
      clienteNome: e?.cliente_nome || '—',
      grupoCliente: e?.grupo_cliente ?? null,
      representante: e?.representante ?? null,
      statusAtual: r.status_atual,
      valor: e ? getValorTotalPedido(e) : 0,
      excluidoEm: r.excluido_em,
      excluidoPorNome: r.excluido_por_nome ?? null,
      motivo: r.motivo_exclusao ?? null,
    };
  });
}

/** Busca pedidos ATIVOS (não excluídos) por número ou cliente, para exclusão. */
export async function buscarPedidosAtivos(termo: string): Promise<PedidoAtivoBusca[]> {
  if (!supabaseOps || !supabasePedidos || !termo.trim()) return [];
  const t = termo.trim();
  // Busca no ERP por número (ilike) ou cliente (ilike), limitada.
  const { data: erp } = await supabasePedidos
    .from(ERP_TABLE)
    .select('numero_pedido, cliente_nome, grupo_cliente, representante, total_pedido_venda, id_nota_conf')
    .or(`numero_pedido.ilike.%${t}%,cliente_nome.ilike.%${t}%`)
    .limit(50);
  const erpRows = (erp ?? []) as any[];
  if (!erpRows.length) return [];
  const ids = erpRows.map((r) => String(r.numero_pedido));
  // Status + exclui os já excluídos
  const statusMap = new Map<string, { status_atual: string; excluido_em: string | null }>();
  await Promise.all(
    chunk(ids, 200).map(async (batch) => {
      const { data } = await supabaseOps!
        .from('concrem_pedidos_status')
        .select('pedido_id, status_atual, excluido_em')
        .in('pedido_id', batch);
      for (const r of (data ?? []) as any[]) statusMap.set(String(r.pedido_id), { status_atual: r.status_atual, excluido_em: r.excluido_em });
    }),
  );
  return erpRows
    .filter((r) => (statusMap.get(String(r.numero_pedido))?.excluido_em ?? null) === null)
    .map((r) => ({
      pedidoId: String(r.numero_pedido),
      numeroPedido: String(r.numero_pedido),
      clienteNome: r.cliente_nome || '—',
      grupoCliente: r.grupo_cliente ?? null,
      representante: r.representante ?? null,
      statusAtual: statusMap.get(String(r.numero_pedido))?.status_atual || 'sem status',
      valor: getValorTotalPedido(r),
    }));
}

export type HistoricoExclusao = {
  id: number;
  acao: 'EXCLUIDO' | 'RESTAURADO';
  motivo: string | null;
  statusAnterior: string | null;
  realizadoPorNome: string | null;
  realizadoEm: string;
};

/**
 * Histórico de exclusão/restauração de um pedido (auditoria).
 * A tabela tem RLS: só admin autenticado lê. Para anon/não-admin retorna [].
 */
export async function listHistoricoPedido(pedidoId: string): Promise<HistoricoExclusao[]> {
  if (!supabaseOps) return [];
  const { data, error } = await supabaseOps
    .from('concrem_pedido_exclusao_historico')
    .select('id, acao, motivo, status_anterior, realizado_por_nome, realizado_em')
    .eq('pedido_id', pedidoId)
    .order('realizado_em', { ascending: false });
  if (error) { console.error('[lixeiraRepo] historico:', error.message); return []; }
  return ((data ?? []) as any[]).map((r) => ({
    id: Number(r.id),
    acao: r.acao,
    motivo: r.motivo ?? null,
    statusAnterior: r.status_anterior ?? null,
    realizadoPorNome: r.realizado_por_nome ?? null,
    realizadoEm: r.realizado_em,
  }));
}

/** Traduz erros das RPCs em mensagens amigáveis (sem expor detalhes técnicos). */
function mensagemErro(msg?: string): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('acesso negado') || m.includes('permission denied')) return 'Você não tem permissão para esta ação (apenas administradores).';
  if (m.includes('motivo')) return 'Informe o motivo da exclusão.';
  if (m.includes('já excluíd') || m.includes('inexistente')) return 'Pedido inexistente ou já excluído.';
  if (m.includes('30 dias') || m.includes('expir')) return 'O prazo de 30 dias para restauração expirou.';
  return 'Não foi possível concluir a operação. Tente novamente.';
}

export async function excluirPedido(pedidoId: string, motivo: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseOps) return { ok: false, error: 'Serviço indisponível.' };
  const { error } = await supabaseOps.rpc('excluir_pedido', { p_pedido_id: pedidoId, p_motivo: motivo });
  if (error) { console.error('[lixeiraRepo] excluir:', error.message); return { ok: false, error: mensagemErro(error.message) }; }
  return { ok: true };
}

export async function restaurarPedido(pedidoId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseOps) return { ok: false, error: 'Serviço indisponível.' };
  const { error } = await supabaseOps.rpc('restaurar_pedido', { p_pedido_id: pedidoId });
  if (error) { console.error('[lixeiraRepo] restaurar:', error.message); return { ok: false, error: mensagemErro(error.message) }; }
  return { ok: true };
}
