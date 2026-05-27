/**
 * valorPedido.ts
 * Funções centralizadas para cálculo de valores de pedidos.
 *
 * NUNCA usar total_qtd_m3 para valores financeiros — representa Volume em m³.
 * NUNCA somar frete + total_pedido_venda (dupla contagem).
 */

// id_nota_conf que não movimentam financeiro
const EXCLUDED_NOTA_CONF = new Set([613, 665]);

export type ErpValorRow = {
  id_nota_conf?:       number | null;
  total_pedido_venda?: number | null;
  total_produtos?:     number | null;
  desconto?:           number | null;
  frete?:              number | null;
};

/**
 * Função 1 — Valor do frete de um pedido.
 * Usar quando frete é exibido separadamente do valor do pedido.
 */
export function getValorFrete(erp: ErpValorRow): number {
  if (erp.id_nota_conf != null && EXCLUDED_NOTA_CONF.has(erp.id_nota_conf)) return 0;
  return Number(erp.frete ?? 0);
}

/**
 * Função 2 — Valor do pedido SEM frete (total_produtos - desconto).
 * Usar quando o frete é exibido em coluna separada na mesma tela.
 */
export function getValorPedidoSemFrete(erp: ErpValorRow): number {
  if (erp.id_nota_conf != null && EXCLUDED_NOTA_CONF.has(erp.id_nota_conf)) return 0;
  const produtos  = Number(erp.total_produtos ?? 0);
  const desconto  = Number(erp.desconto ?? 0);
  const resultado = produtos - desconto;
  return resultado > 0 ? resultado : 0;
}

/**
 * Função 3 — Valor total do pedido (total_produtos - desconto + frete).
 * Equivale à coluna total_pedido_venda.
 * Usar para somatórios de meta, faturamento e quando um único valor representa o pedido.
 */
export function getValorTotalPedido(erp: ErpValorRow): number {
  if (erp.id_nota_conf != null && EXCLUDED_NOTA_CONF.has(erp.id_nota_conf)) return 0;
  return Number(erp.total_pedido_venda ?? 0);
}

/**
 * Versão para objetos Order do AppContext (já mapeados pelo rowToOrder).
 * Equivalente à Função 3 para uso com dados já carregados.
 */
export function getValorTotalOrder(order: {
  totalPedidoVenda?: number | null;
  idNotaConf?: number | null;
}): number {
  if (order.idNotaConf != null && EXCLUDED_NOTA_CONF.has(order.idNotaConf)) return 0;
  return Number(order.totalPedidoVenda ?? 0);
}
