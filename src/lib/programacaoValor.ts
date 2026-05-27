/**
 * programacaoValor.ts
 * Busca o valor total dos pedidos programados para um mês,
 * usando exatamente a mesma lógica da tela Programacao.tsx.
 *
 * Regras (alinhadas com Programacao.tsx):
 *   - Fonte A: concrem_pedidos_status com mes_programacao = month
 *   - Fonte B: concrem_pedidos_status com mes_programacao = null,
 *              status em_carregamento ou despachado,
 *              e pedido presente em carregamento do mês
 *   - Valor: total_pedido_venda (sem fallback)
 *   - Exclui id_nota_conf 613 e 665 (não movimentam financeiro)
 *   - Pedidos Leroy só contam se estiverem em carregamento do mês
 *   - totalPedidos conta todos os pedidos do grupo (igual a pedidos.length)
 */

import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import { getValorTotalPedido } from '@/lib/valorPedido';

const ERP_TABLE = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_venda';

// Idêntico a PRODUCAO_STATUSES da Programacao.tsx
const PRODUCAO_STATUSES = [
  'liberado_producao', 'em_producao', 'producao_finalizada',
  'em_carregamento', 'despachado',
  'faturado', 'em_entrega', 'parcialmente_entregue',
  'entregue', 'aguardando_pagamento', 'finalizado',
];

type ErpRow = {
  numero_pedido: string;
  cliente_nome: string | null;
  total_pedido_venda: number | null;
  id_nota_conf: number | null;
};

/**
 * Busca todos os pedidos presentes em carregamentos com planned_date no mês.
 * Usado tanto para a regra Leroy quanto para inferir mês de pedidos sem mes_programacao.
 */
async function fetchPedidosEmCarregamentoDoMes(month: string): Promise<Set<string>> {
  if (!supabaseOps) return new Set();
  const [y, m] = month.split('-').map(Number);
  const firstDay = `${month}-01`;
  const lastDay  = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

  const { data, error } = await supabaseOps
    .from('concrem_programacoes_embarque')
    .select('pedidos')
    .gte('planned_date', firstDay)
    .lte('planned_date', lastDay)
    .not('pedidos', 'is', null);

  if (error || !data) return new Set();

  const set = new Set<string>();
  for (const row of data as { pedidos: string[] | null }[]) {
    for (const id of row.pedidos ?? []) set.add(String(id));
  }
  return set;
}

export type ProgramacaoMesResult = {
  totalProgramado: number;  // soma dos valores dos pedidos programados para o mês
  totalPedidos: number;     // contagem de todos os pedidos (igual a pedidos.length da Programacao.tsx)
  gap: number | null;       // totalProgramado - goalValue (null se sem meta)
};

/**
 * Busca o valor total programado para um mês.
 * Resultado idêntico ao exibido pela Programacao.tsx para o mês.
 *
 * @param month      Formato 'YYYY-MM'
 * @param goalValue  Valor da meta do mês (para calcular gap). Pode ser null.
 */
export async function fetchProgramacaoMes(
  month: string,
  goalValue: number | null = null,
): Promise<ProgramacaoMesResult> {
  const empty: ProgramacaoMesResult = {
    totalProgramado: 0,
    totalPedidos: 0,
    gap: goalValue != null ? -goalValue : null,
  };

  if (!supabaseOps || !supabasePedidos) return empty;

  // ── 1. Carregamentos do mês (regra Leroy + inferência de mês da Query B) ───
  const pedidosEmCarregamento = await fetchPedidosEmCarregamentoDoMes(month);

  // ── 2. Query A — pedidos com mes_programacao = month ──────────────────────
  const PAGE = 1000;
  const opsRows: { pedido_id: string; numero_pedido: string }[] = [];
  const seenIds = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await supabaseOps
      .from('concrem_pedidos_status')
      .select('pedido_id, numero_pedido')
      .eq('mes_programacao', month)
      .range(from, from + PAGE - 1);

    if (error) { console.error('[programacaoValor] query A:', error.message); break; }

    const page = (data ?? []) as { pedido_id: string; numero_pedido: string }[];
    for (const row of page) {
      const sid = String(row.pedido_id);
      if (!seenIds.has(sid)) { opsRows.push(row); seenIds.add(sid); }
    }
    if (page.length < PAGE) break;
    from += PAGE;
  }

  // ── 3. Query B — pedidos sem mes_programacao mas em carregamento do mês ───
  // Idêntico à segunda query de fetchOpsRows + inferência de groupedMonths
  // da Programacao.tsx: só entra se status for em_carregamento ou despachado
  // e o pedido estiver em um carregamento do mês (pedidoToLoadMonth).
  let from2 = 0;
  while (true) {
    const { data, error } = await supabaseOps
      .from('concrem_pedidos_status')
      .select('pedido_id, numero_pedido, status_atual')
      .in('status_atual', PRODUCAO_STATUSES)
      .is('mes_programacao', null)
      .range(from2, from2 + PAGE - 1);

    if (error) { console.error('[programacaoValor] query B:', error.message); break; }

    const page = (data ?? []) as {
      pedido_id: string;
      numero_pedido: string;
      status_atual: string;
    }[];

    for (const row of page) {
      const sid = String(row.pedido_id);
      // Apenas em_carregamento e despachado permitem inferência de mês (igual à Programacao.tsx)
      if (
        !seenIds.has(sid) &&
        (row.status_atual === 'em_carregamento' || row.status_atual === 'despachado') &&
        pedidosEmCarregamento.has(sid)
      ) {
        opsRows.push({ pedido_id: sid, numero_pedido: row.numero_pedido });
        seenIds.add(sid);
      }
    }

    if (page.length < PAGE) break;
    from2 += PAGE;
  }

  if (opsRows.length === 0) return empty;

  // ── 4. Busca dados do ERP em lotes ────────────────────────────────────────
  const CHUNK = 200;
  const allIds = opsRows.map(r => String(r.pedido_id));

  let totalProgramado = 0;
  let totalPedidos    = 0;

  for (let i = 0; i < allIds.length; i += CHUNK) {
    const batch = allIds.slice(i, i + CHUNK);

    const { data, error } = await supabasePedidos
      .from(ERP_TABLE)
      .select('numero_pedido, cliente_nome, total_pedido_venda, id_nota_conf')
      .in('numero_pedido', batch);

    if (error || !data) continue;

    for (const row of data as ErpRow[]) {
      // ── Regra Leroy ────────────────────────────────────────────────────────
      // Pedidos Leroy só contam se estiverem em um carregamento do mês.
      // Idêntico à Programacao.tsx linha ~882.
      const isLeroy = (row.cliente_nome ?? '').toUpperCase().includes('LEROY');
      if (isLeroy && !pedidosEmCarregamento.has(String(row.numero_pedido))) continue;

      const val = getValorTotalPedido(row);

      // ── Contagem (igual a pedidos.length da Programacao.tsx) ──────────────
      // Conta todos os pedidos do grupo, inclusive os com valor = 0.
      totalPedidos    += 1;
      totalProgramado += val;
    }
  }

  const gap = goalValue != null ? totalProgramado - goalValue : null;

  return { totalProgramado, totalPedidos, gap };
}
