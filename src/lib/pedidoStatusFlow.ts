import { PedidoStatusDef, PedidoStatusValue } from '@/types';

export const pedidoStatusFlow: PedidoStatusDef[] = [
  { order: 1,  label: 'Aguardando Confirmação',          value: 'aguardando_confirmacao',          kind: 'automatico' },
  { order: 2,  label: 'Aguardando Envio Diretoria',      value: 'aguardando_envio_diretoria',      kind: 'automatico' },
  { order: 3,  label: 'Aguardando Confirmação Diretoria', value: 'aguardando_confirmacao_diretoria', kind: 'automatico' },
  { order: 4,  label: 'Confirmado Diretoria',            value: 'confirmado_diretoria',            kind: 'automatico' },
  { order: 5,  label: 'Liberado Produção',               value: 'liberado_producao',               kind: 'automatico' },
  { order: 6,  label: 'Aguardando Mapeamento',           value: 'aguardando_mapeamento',           kind: 'manual' },
  { order: 7,  label: 'Mapeamento em Andamento',         value: 'mapeamento_andamento',            kind: 'manual' },
  { order: 8,  label: 'Mapeamento Concluído',            value: 'mapeamento_concluido',            kind: 'manual' },
  { order: 9,  label: 'Aguardando Ferragem',             value: 'aguardando_ferragem',             kind: 'manual' },
  { order: 10, label: 'Ferragem Recebida',               value: 'ferragem_recebida',               kind: 'manual' },
  { order: 11, label: 'Em Produção',                     value: 'em_producao',                     kind: 'manual' },
  { order: 12, label: 'Produção Finalizada',             value: 'producao_finalizada',             kind: 'manual' },
  { order: 13, label: 'Aguardando Liberação',            value: 'aguardando_liberacao',            kind: 'automatico' },
  { order: 14, label: 'Faturado',                        value: 'faturado',                        kind: 'automatico' },
  { order: 15, label: 'Em Entrega',                      value: 'em_entrega',                      kind: 'automatico' },
  { order: 16, label: 'Parcialmente Entregue',           value: 'parcialmente_entregue',           kind: 'automatico' },
  { order: 17, label: 'Entregue',                        value: 'entregue',                        kind: 'automatico' },
  { order: 18, label: 'Aguardando Pagamento',            value: 'aguardando_pagamento',            kind: 'automatico' },
  { order: 19, label: 'Finalizado',                      value: 'finalizado',                      kind: 'automatico' },
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

export function getNextManualStatuses(current: PedidoStatusValue): PedidoStatusDef[] {
  const cur = getPedidoStatusDef(current);
  if (!cur.order) return pedidoStatusFlow.filter((x) => x.kind === 'manual');

  const after = pedidoStatusFlow.filter((x) => x.kind === 'manual' && x.order > cur.order);
  return after.length ? after : pedidoStatusFlow.filter((x) => x.kind === 'manual');
}

export function canMoveToStatus(from: PedidoStatusValue | null, to: PedidoStatusValue): boolean {
  if (!from) return true;
  const a = getPedidoStatusDef(from);
  const b = getPedidoStatusDef(to);
  if (!a.order || !b.order) return true;
  return b.order >= a.order;
}

export function getPedidoStatusBadgeClass(value: PedidoStatusValue): string {
  const o = getPedidoStatusDef(value).order;
  if (o >= 19) return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
  if (o >= 17) return 'bg-green-50 text-green-700 border border-green-100';
  if (o >= 14) return 'bg-blue-50 text-blue-700 border border-blue-100';
  if (o >= 5)  return 'bg-amber-50 text-amber-700 border border-amber-100';
  if (o >= 2)  return 'bg-orange-50 text-orange-700 border border-orange-100';
  return 'bg-slate-50 text-slate-700 border border-slate-100';
}

export type PedidoStageDates = {
  dataAprovacao?: string;
  dataIntegracao?: string;
  dataDiretoria?: string;
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
    dataAprovacao: pick('aguardando_envio_diretoria'),
    dataIntegracao: pick('aguardando_confirmacao'),
    dataDiretoria: pick('confirmado_diretoria'),
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
  if (def.order <= 4) return 1;  // Aprovação/Diretoria
  if (def.order <= 5) return 2;  // Liberado Produção
  if (def.order <= 8) return 3;  // Mapeamento
  if (def.order <= 10) return 4; // Ferragem
  if (def.order <= 12) return 5; // Produção
  if (def.order <= 14) return 6; // Faturado
  if (def.order <= 17) return 7; // Entrega
  return 8; // Finalizado
}

export const panelTimelineStages: Array<{ id: number; label: string }> = [
  { id: 1, label: 'Aprovado' },
  { id: 2, label: 'Liberado' },
  { id: 3, label: 'Mapeamento' },
  { id: 4, label: 'Ferragem' },
  { id: 5, label: 'Produção' },
  { id: 6, label: 'Faturado' },
  { id: 7, label: 'Entrega' },
  { id: 8, label: 'Finalizado' },
];

export function getStageState(currentStatus: PedidoStatusValue, stageId: number): 'done' | 'current' | 'future' {
  const cur = getStageForTimeline(currentStatus);
  if (stageId < cur) return 'done';
  if (stageId === cur) return 'current';
  return 'future';
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

/** Statuses that the Logística user can manage manually on the Atualização de Status page */
export const logisticaManualStatuses: PedidoStatusValue[] = [
  'liberado_producao',
  'aguardando_mapeamento',
  'mapeamento_andamento',
  'mapeamento_concluido',
  'aguardando_ferragem',
  'ferragem_recebida',
  'em_producao',
  'producao_finalizada',
];
