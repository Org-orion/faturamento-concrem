/**
 * Regras de negócio — Controle de Prazos de Produção.
 *
 * Fonte única da lógica de prazo: dias decorridos, criticidade, label e prioridade
 * de ordenação. Nenhum componente deve reimplementar `dias <= 30` / `dias <= 35`.
 *
 * Contagem: a partir da data em que o pedido entrou em `liberado_producao`
 * (concrem_pedidos_status_historico.status_novo = 'liberado_producao', alterado_em
 * mais recente) até hoje, no calendário de Brasília (America/Sao_Paulo).
 */

import { diasDecorridosBR, toBRDateStr, todayBR } from '@/lib/dateUtils';

/** Faixas de prazo (dias decorridos em produção). */
export const LIMITE_DENTRO = 30;  // 0..30  → dentro do prazo
export const LIMITE_ATENCAO = 35; // 31..35 → atenção; > 35 → crítico

export type Criticidade = 'dentro' | 'atencao' | 'critico';
export type PedidoTipo = 'VENDA' | 'SUPORTE';

export type PrazoInfo = {
  criticidade: Criticidade;
  label: string;            // "Dentro do prazo" | "Atenção" | "Crítico"
  ordemPrioridade: number;  // 0 = mais crítico (crítico), 1 = atenção, 2 = dentro
  diasAcimaLimite: number;  // dias além de LIMITE_ATENCAO (0 quando não crítico)
};

/** Classifica um número de dias decorridos em produção. Regra única do sistema. */
export function classificarPrazo(dias: number): PrazoInfo {
  if (dias > LIMITE_ATENCAO) {
    return { criticidade: 'critico', label: 'Crítico', ordemPrioridade: 0, diasAcimaLimite: dias - LIMITE_ATENCAO };
  }
  if (dias > LIMITE_DENTRO) {
    return { criticidade: 'atencao', label: 'Atenção', ordemPrioridade: 1, diasAcimaLimite: 0 };
  }
  return { criticidade: 'dentro', label: 'Dentro do prazo', ordemPrioridade: 2, diasAcimaLimite: 0 };
}

/** Pedido monitorado (bruto, vindo do repo). */
export type PedidoPrazoBase = {
  pedidoId: string;
  numeroPedido: string;
  clienteNome: string;
  cidade: string | null;
  uf: string | null;
  representante: string | null;
  grupoCliente: string | null;
  tipo: PedidoTipo;
  liberadoEm: string; // ISO timestamp da entrada em liberado_producao
  valor: number;
  // Carregamento programado ativo (não cancelado/concluído). Null quando não houver.
  carregamentoId: string | null;
  carregamentoData: string | null;   // planned_date (data civil YYYY-MM-DD)
  carregamentoStatus: string | null; // shipment_status do embarque
};

/** Pedido monitorado + cálculo de prazo já resolvido. */
export type PedidoPrazo = PedidoPrazoBase & {
  dias: number;
  prazo: PrazoInfo;
};

/** Enriquece o pedido base com dias decorridos e criticidade (calendário BR). */
export function comPrazo(base: PedidoPrazoBase): PedidoPrazo {
  const dias = diasDecorridosBR(base.liberadoEm);
  return { ...base, dias, prazo: classificarPrazo(dias) };
}

/**
 * Ordenação operacional: criticidade primeiro (crítico → atenção → dentro),
 * depois mais dias → menos dias, e por fim número do pedido (desempate estável).
 */
export function ordenarPorCriticidade(a: PedidoPrazo, b: PedidoPrazo): number {
  if (a.prazo.ordemPrioridade !== b.prazo.ordemPrioridade) {
    return a.prazo.ordemPrioridade - b.prazo.ordemPrioridade;
  }
  if (a.dias !== b.dias) return b.dias - a.dias;
  return a.numeroPedido.localeCompare(b.numeroPedido, 'pt-BR');
}

/** Pedido possui carregamento programado ativo? */
export function temCarregamento(p: PedidoPrazoBase): boolean {
  return Boolean(p.carregamentoData);
}

/**
 * Ordenação operacional combinada (regra única): dentro de cada faixa de criticidade,
 * quem NÃO tem carregamento programado vem antes (maior necessidade de intervenção).
 * Resultado: crítico s/carga → crítico c/carga → atenção s/carga → atenção c/carga →
 * dentro s/carga → dentro c/carga. Dentro de cada grupo, mais dias primeiro.
 */
export function ordenarOperacional(a: PedidoPrazo, b: PedidoPrazo): number {
  const ka = a.prazo.ordemPrioridade * 2 + (temCarregamento(a) ? 1 : 0);
  const kb = b.prazo.ordemPrioridade * 2 + (temCarregamento(b) ? 1 : 0);
  if (ka !== kb) return ka - kb;
  if (a.dias !== b.dias) return b.dias - a.dias;
  return a.numeroPedido.localeCompare(b.numeroPedido, 'pt-BR');
}

/** Dias entre hoje e uma data civil (BR): positivo = futuro, negativo = passado, 0 = hoje. */
export function diasAteData(iso?: string | null): number | null {
  const alvo = toBRDateStr(iso);
  if (!alvo) return null;
  const hoje = todayBR();
  const [hy, hm, hd] = hoje.split('-').map(Number);
  const [ay, am, ad] = alvo.split('-').map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(hy, hm - 1, hd)) / 86400000);
}

export type CarregamentoInfo = {
  tem: boolean;
  data: string | null;      // YYYY-MM-DD
  diasAte: number | null;   // + futuro, − atraso, 0 hoje
  atrasado: boolean;        // programado no passado e ainda ativo
};

// "Atrasado" só se aplica a carga ainda PENDENTE de despacho com data no passado.
// Cargas já "Despachado"/"Em Rota" saíram — não são atraso; canceladas/entregues nem entram.
const CARGA_PENDENTE_DESPACHO = new Set(['Aguardando Despacho']);

/** Situação do carregamento de um pedido (para exibição e visão de agenda). */
export function carregamentoInfo(p: PedidoPrazoBase): CarregamentoInfo {
  if (!p.carregamentoData) return { tem: false, data: null, diasAte: null, atrasado: false };
  const diasAte = diasAteData(p.carregamentoData);
  const pendente = CARGA_PENDENTE_DESPACHO.has(String(p.carregamentoStatus ?? ''));
  return { tem: true, data: p.carregamentoData, diasAte, atrasado: diasAte != null && diasAte < 0 && pendente };
}

/** Contagem por faixa + carregamento, para o resumo operacional. */
export type PrazoResumo = { total: number; dentro: number; atencao: number; critico: number; comCarga: number; semCarga: number };

export function resumir(pedidos: PedidoPrazo[]): PrazoResumo {
  const r: PrazoResumo = { total: pedidos.length, dentro: 0, atencao: 0, critico: 0, comCarga: 0, semCarga: 0 };
  for (const p of pedidos) {
    if (p.prazo.criticidade === 'critico') r.critico++;
    else if (p.prazo.criticidade === 'atencao') r.atencao++;
    else r.dentro++;
    if (temCarregamento(p)) r.comCarga++; else r.semCarga++;
  }
  return r;
}
