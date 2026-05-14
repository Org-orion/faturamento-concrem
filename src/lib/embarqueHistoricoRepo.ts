import { supabaseOps } from './supabase';
import type { Load } from '@/types';

export type EmbarqueHistoricoRow = {
  id: string;
  embarque_id: string;
  acao: string;
  campo: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
  alterado_por: string | null;
  criado_em: string;
};

const TABLE = 'concrem_embarque_historico';

export async function listEmbarqueHistorico(embarqueId: string): Promise<EmbarqueHistoricoRow[]> {
  if (!supabaseOps) return [];
  const { data, error } = await supabaseOps
    .from(TABLE)
    .select('*')
    .eq('embarque_id', embarqueId)
    .order('criado_em', { ascending: false });
  if (error) { console.error('[embarqueHistorico] list:', error.message); return []; }
  return (data || []) as EmbarqueHistoricoRow[];
}

async function insertHistorico(rows: Omit<EmbarqueHistoricoRow, 'id' | 'criado_em'>[]) {
  if (!supabaseOps || rows.length === 0) return;
  const { error } = await supabaseOps.from(TABLE).insert(rows);
  if (error) console.error('[embarqueHistorico] insert:', error.message);
}

export async function recordEmbarqueCriado(load: Load, alteradoPor: string | null) {
  await insertHistorico([{
    embarque_id: load.id,
    acao: 'criado',
    campo: null,
    valor_anterior: null,
    valor_novo: `Motorista: ${load.driverId} | Data: ${load.plannedDate} | Status: ${load.shipmentStatus} | Pedidos: ${load.orderIds.join(', ')}`,
    alterado_por: alteradoPor,
  }]);
}

export async function recordEmbarqueAlterado(old: Load, novo: Load, alteradoPor: string | null) {
  const rows: Omit<EmbarqueHistoricoRow, 'id' | 'criado_em'>[] = [];

  if (old.shipmentStatus !== novo.shipmentStatus) {
    rows.push({ embarque_id: novo.id, acao: 'status_alterado', campo: 'Status de Expedição', valor_anterior: old.shipmentStatus, valor_novo: novo.shipmentStatus, alterado_por: alteradoPor });
  }

  if (old.productionStatus !== novo.productionStatus) {
    rows.push({ embarque_id: novo.id, acao: 'status_alterado', campo: 'Status de Produção', valor_anterior: old.productionStatus, valor_novo: novo.productionStatus, alterado_por: alteradoPor });
  }

  if (old.driverId !== novo.driverId) {
    rows.push({ embarque_id: novo.id, acao: 'motorista_alterado', campo: 'Motorista', valor_anterior: old.driverId, valor_novo: novo.driverId, alterado_por: alteradoPor });
  }

  if (old.plannedDate !== novo.plannedDate) {
    rows.push({ embarque_id: novo.id, acao: 'data_alterada', campo: 'Data Planejada', valor_anterior: old.plannedDate, valor_novo: novo.plannedDate, alterado_por: alteradoPor });
  }

  if ((old.realizationDate ?? '') !== (novo.realizationDate ?? '')) {
    rows.push({ embarque_id: novo.id, acao: 'data_alterada', campo: 'Data de Realização', valor_anterior: old.realizationDate ?? null, valor_novo: novo.realizationDate ?? null, alterado_por: alteradoPor });
  }

  if ((old.previsaoEntrega ?? '') !== (novo.previsaoEntrega ?? '')) {
    rows.push({ embarque_id: novo.id, acao: 'data_alterada', campo: 'Previsão de Entrega', valor_anterior: old.previsaoEntrega ?? null, valor_novo: novo.previsaoEntrega ?? null, alterado_por: alteradoPor });
  }

  if (old.freightValue !== novo.freightValue) {
    rows.push({ embarque_id: novo.id, acao: 'frete_alterado', campo: 'Frete', valor_anterior: String(old.freightValue ?? 0), valor_novo: String(novo.freightValue ?? 0), alterado_por: alteradoPor });
  }

  const addedOrders = novo.orderIds.filter(id => !old.orderIds.includes(id));
  const removedOrders = old.orderIds.filter(id => !novo.orderIds.includes(id));
  if (addedOrders.length > 0) {
    rows.push({ embarque_id: novo.id, acao: 'pedidos_alterados', campo: 'Pedidos Adicionados', valor_anterior: null, valor_novo: addedOrders.join(', '), alterado_por: alteradoPor });
  }
  if (removedOrders.length > 0) {
    rows.push({ embarque_id: novo.id, acao: 'pedidos_alterados', campo: 'Pedidos Removidos', valor_anterior: removedOrders.join(', '), valor_novo: null, alterado_por: alteradoPor });
  }

  if ((old.obs ?? '') !== (novo.obs ?? '') && novo.obs?.trim()) {
    rows.push({ embarque_id: novo.id, acao: 'obs_alterada', campo: 'Observação', valor_anterior: old.obs || null, valor_novo: novo.obs || null, alterado_por: alteradoPor });
  }

  await insertHistorico(rows);
}
