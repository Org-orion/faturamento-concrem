import { PedidoStatusDef, PedidoStatusValue } from '@/types';

export const pedidoStatusFlow: PedidoStatusDef[] = [
  { order: 1,  label: 'Aguardando Avaliação',     value: 'aguardando_avaliacao',    kind: 'automatico' },
  { order: 3,  label: 'Aguardando Gerência',       value: 'aguardando_gerencia',     kind: 'automatico' },
  { order: 4,  label: 'Confirmado Gerência',       value: 'confirmado_gerencia',     kind: 'automatico' },
  { order: 5,  label: 'Liberado Produção',         value: 'liberado_producao',       kind: 'automatico' },
  { order: 6,  label: 'Aguardando Mapeamento',     value: 'aguardando_mapeamento',   kind: 'manual' },
  { order: 8,  label: 'Mapeamento Concluído',      value: 'mapeamento_concluido',    kind: 'manual' },
  { order: 9,  label: 'Aguardando Ferragem',       value: 'aguardando_ferragem',     kind: 'manual' },
  { order: 10, label: 'Ferragem Recebida',         value: 'ferragem_recebida',       kind: 'manual' },
  { order: 11, label: 'Liberado Comercial',        value: 'liberado_comercial',      kind: 'automatico' },
  { order: 12, label: 'Em Produção',               value: 'em_producao',             kind: 'manual' },
  { order: 13, label: 'Produção Finalizada',       value: 'producao_finalizada',     kind: 'manual' },
  { order: 14, label: 'Faturado',                  value: 'faturado',                kind: 'automatico' },
  { order: 15, label: 'Em Rota',                   value: 'em_entrega',              kind: 'automatico' },
  { order: 16, label: 'Entregue',                  value: 'entregue',                kind: 'automatico' },
  { order: 17, label: 'Finalizado',                value: 'finalizado',              kind: 'automatico' },
];

const byValue = new Map(pedidoStatusFlow.map((s) => [s.value, s] as const));
const byOrder = new Map(pedidoStatusFlow.map((s) => [s.order, s] as const));

export function getPedidoStatusDef(value: PedidoStatusValue): PedidoStatusDef {
  return byValue.get(value) || { order: 0, label: value, value, kind: 'manual' };
}

export function isPedidoStatusManual(value: PedidoStatusValue): boolean {
  return getPedidoStatusDef(value).kind === 'manual';
}

export function getPedidoStatusLabel(value: PedidoStatusValue): string {
  return getPedidoStatusDef(value).label;
}

export function comparePedidoStatus(a: PedidoStatusValue, b: PedidoStatusValue): number {
  return getPedidoStatusDef(a).order - getPedidoStatusDef(b).order;
}

export function getNextManualStatuses(_current: PedidoStatusValue): PedidoStatusDef[] {
  return pedidoStatusFlow.filter((x) => x.kind === 'manual');
}

export function canMoveToStatus(_from: PedidoStatusValue | null, _to: PedidoStatusValue): boolean {
  return true;
}

export function getPedidoStatusBadgeClass(value: PedidoStatusValue): string {
  const o = getPedidoStatusDef(value).order;
  if (o >= 17) return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
  if (o >= 16) return 'bg-green-50 text-green-700 border border-green-100';
  if (o >= 14) return 'bg-blue-50 text-blue-700 border border-blue-100';
  if (o >= 11) return 'bg-purple-50 text-purple-700 border border-purple-100';
  if (o >= 5)  return 'bg-amber-50 text-amber-700 border border-amber-100';
  return 'bg-slate-50 text-slate-700 border border-slate-100';
}

export type PedidoStageDates = {
  dataAprovacao?: string;
  dataLiberacaoComercial?: string;
  dataGerencia?: string;
  dataLiberacaoProducao?: string;
  dataMapeamento?: string;
  dataFerragem?: string;
  dataConclusaoProducao?: string;
  dataFaturamento?: string;
  dataExpedicao?: string;
  dataEntrega?: string;
};

export function toStageDates(history: Array<{ status_novo: PedidoStatusValue; alterado_em: string }>): PedidoStageDates {
  const pick = (v: PedidoStatusValue): string | undefined => {
    const item = history.find((h) => h.status_novo === v);
    return item ? item.alterado_em : undefined;
  };

  return {
    dataAprovacao: pick('aguardando_avaliacao'),
    dataLiberacaoComercial: pick('liberado_comercial'),
    dataGerencia: pick('confirmado_gerencia'),
    dataLiberacaoProducao: pick('liberado_producao'),
    dataMapeamento: pick('mapeamento_concluido'),
    dataFerragem: pick('ferragem_recebida'),
    dataConclusaoProducao: pick('producao_finalizada'),
    dataFaturamento: pick('faturado'),
    dataExpedicao: pick('em_entrega'),
    dataEntrega: pick('entregue'),
  };
}

export function getStageForTimeline(value: PedidoStatusValue): number {
  const def = getPedidoStatusDef(value);
  if (!def.order) return 0;
  if (def.order <= 4)  return 1;  // Avaliação/Gerência
  if (def.order <= 5)  return 2;  // Liberado Produção
  if (def.order <= 8)  return 3;  // Mapeamento
  if (def.order <= 10) return 4;  // Ferragem
  if (def.order <= 11) return 5;  // Liberado Comercial
  if (def.order <= 13) return 6;  // Produção
  if (def.order <= 14) return 7;  // Faturado
  if (def.order <= 16) return 8;  // Entrega
  return 9; // Finalizado
}

export const panelTimelineStages: Array<{ id: number; label: string }> = [
  { id: 1, label: 'Aprovado' },
  { id: 2, label: 'Liberado' },
  { id: 3, label: 'Mapeamento' },
  { id: 4, label: 'Ferragem' },
  { id: 5, label: 'Comercial' },
  { id: 6, label: 'Produção' },
  { id: 7, label: 'Faturado' },
  { id: 8, label: 'Entrega' },
  { id: 9, label: 'Finalizado' },
];

// The order at which each stage is considered fully *completed* (not just entered).
// Stages with a single status are done as soon as they're reached; multi-step stages
// are only done when their final sub-status is reached.
const stageCompletionOrder: Record<number, number> = {
  1: 4,  // confirmado_gerencia
  2: 5,  // liberado_producao
  3: 8,  // mapeamento_concluido
  4: 10, // ferragem_recebida
  5: 11, // liberado_comercial
  6: 13, // producao_finalizada
  7: 14, // faturado
  8: 16, // entregue
  9: 17, // finalizado
};

export function getStageState(currentStatus: PedidoStatusValue, stageId: number): 'done' | 'current' | 'future' {
  const cur = getStageForTimeline(currentStatus);
  if (stageId > cur) return 'future';
  if (stageId < cur) return 'done';
  // stageId === cur: check if the completion threshold for this stage was reached
  const def = getPedidoStatusDef(currentStatus);
  const completionOrder = stageCompletionOrder[stageId] ?? 0;
  return def.order >= completionOrder ? 'done' : 'current';
}

export function clampToKnownStatus(value: string | null | undefined): PedidoStatusValue | null {
  const v = String(value || '').trim();
  const def = pedidoStatusFlow.find((x) => x.value === v);
  return def ? def.value : null;
}

export function nextStatusFromOrder(from: PedidoStatusValue, toOrder: number): PedidoStatusValue {
  return (byOrder.get(toOrder) || getPedidoStatusDef(from)).value;
}

/**
 * Returns the automatic follow-up status after a manual status is set.
 * Currently no automatic follow-ups — all transitions are explicit.
 */
export function getAutoFollowUpStatus(_manualStatus: PedidoStatusValue): PedidoStatusValue | null {
  return null;
}

/**
 * Checks if a pedido should be auto-released to comercial.
 * Condition: both 'mapeamento_concluido' AND 'ferragem_recebida' are in history.
 */
export function shouldAutoLiberarComercial(
  history: Array<{ status_novo: PedidoStatusValue }>,
): boolean {
  const statuses = new Set(history.map((h) => h.status_novo));
  return statuses.has('mapeamento_concluido') && statuses.has('ferragem_recebida');
}

/** Statuses that the Logística user can manage manually on the Atualização de Status page */
export const logisticaManualStatuses: PedidoStatusValue[] = [
  'liberado_producao',
  'aguardando_mapeamento',
  'mapeamento_concluido',
  'aguardando_ferragem',
  'ferragem_recebida',
  'em_producao',
  'producao_finalizada',
];
