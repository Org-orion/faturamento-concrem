import { supabaseOps } from '@/lib/supabase';
import { canMoveToStatus, getPedidoStatusDef } from '@/lib/pedidoStatusFlow';
import type { PedidoStatusHistoricoRow, PedidoStatusRow, PedidoStatusValue } from '@/types';

type StatusUpdateInput = {
  pedidoId: string;
  numeroPedido: string;
  statusNovo: PedidoStatusValue;
  alteradoPor: string | null;
  observacao?: string | null;
  notificadoRepresentante?: boolean;
  notificadoEm?: string | null;
  notificacaoProviderId?: string | null;
  notificacaoErro?: string | null;
};

export async function getPedidoStatus(pedidoId: string): Promise<PedidoStatusRow | null> {
  if (!supabaseOps) return null;
  const { data, error } = await supabaseOps
    .from('pedidos_status')
    .select('*')
    .eq('pedido_id', pedidoId)
    .maybeSingle();
  if (error) {
    console.error('[Supabase OPS] getPedidoStatus:', error.message);
    return null;
  }
  return (data as any) as PedidoStatusRow;
}

export async function listPedidosStatusByPedidoIds(pedidoIds: string[]): Promise<PedidoStatusRow[]> {
  if (!supabaseOps) return [];
  if (pedidoIds.length === 0) return [];
  const { data, error } = await supabaseOps.from('pedidos_status').select('*').in('pedido_id', pedidoIds);
  if (error) {
    console.error('[Supabase OPS] listPedidosStatusByPedidoIds:', error.message);
    return [];
  }
  return ((data || []) as any) as PedidoStatusRow[];
}

export async function listPedidosStatusHistorico(pedidoId: string): Promise<PedidoStatusHistoricoRow[]> {
  if (!supabaseOps) return [];
  const { data, error } = await supabaseOps
    .from('pedidos_status_historico')
    .select('*')
    .eq('pedido_id', pedidoId)
    .order('alterado_em', { ascending: false });
  if (error) {
    console.error('[Supabase OPS] listPedidosStatusHistorico:', error.message);
    return [];
  }
  return ((data || []) as any) as PedidoStatusHistoricoRow[];
}

export async function ensurePedidoStatusInitialized(pedidoId: string, numeroPedido: string, userName: string | null) {
  if (!supabaseOps) return;
  const existing = await getPedidoStatus(pedidoId);
  if (existing) return;
  const now = new Date().toISOString();
  const statusNovo: PedidoStatusValue = 'aguardando_avaliacao';

  let upsertErr: { message: string } | null = null;
  try {
    const res = await supabaseOps
      .from('pedidos_status')
      .upsert(
        {
          pedido_id: pedidoId,
          numero_pedido: numeroPedido,
          status_atual: statusNovo,
          atualizado_em: now,
          atualizado_por: userName,
        } as any,
        { onConflict: 'pedido_id', ignoreDuplicates: true },
      );
    upsertErr = res.error as any;
  } catch (err) {
    console.error('[Supabase OPS] ensurePedidoStatusInitialized upsert pedidos_status (fetch):', err);
    return;
  }
  if (upsertErr) {
    console.error('[Supabase OPS] ensurePedidoStatusInitialized upsert pedidos_status:', upsertErr.message);
    return;
  }

  let histErr: { message: string } | null = null;
  try {
    const res = await supabaseOps.from('pedidos_status_historico').insert({
      pedido_id: pedidoId,
      numero_pedido: numeroPedido,
      status_anterior: null,
      status_novo: statusNovo,
      alterado_em: now,
      alterado_por: userName,
      observacao: 'Status inicial criado automaticamente',
      notificado_representante: false,
    } as any);
    histErr = res.error as any;
  } catch (err) {
    console.error('[Supabase OPS] ensurePedidoStatusInitialized insert historico (fetch):', err);
    return;
  }
  if (histErr) {
    console.error('[Supabase OPS] ensurePedidoStatusInitialized insert historico:', histErr.message);
  }
}

export async function ensurePedidosStatusInitializedBatch(
  pedidos: Array<{ pedidoId: string; numeroPedido: string }>,
  userName: string | null,
): Promise<void> {
  if (!supabaseOps) return;
  const unique = new Map(pedidos.map((p) => [p.pedidoId, p] as const));
  const ids = Array.from(unique.keys());
  if (!ids.length) return;

  let existing: any[] | null = null;
  let existingErr: { message: string } | null = null;
  try {
    const res = await supabaseOps.from('pedidos_status').select('pedido_id').in('pedido_id', ids);
    existing = res.data as any;
    existingErr = res.error as any;
  } catch (err) {
    console.error('[Supabase OPS] ensurePedidosStatusInitializedBatch existing (fetch):', err);
    return;
  }
  if (existingErr) {
    console.error('[Supabase OPS] ensurePedidosStatusInitializedBatch existing:', existingErr.message);
    return;
  }

  const existingSet = new Set((existing || []).map((r: any) => String(r.pedido_id)));
  const missing = ids.filter((id) => !existingSet.has(id)).map((id) => unique.get(id)!).filter(Boolean);
  if (!missing.length) return;

  const now = new Date().toISOString();
  const statusNovo: PedidoStatusValue = 'aguardando_avaliacao';

  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const batches = chunk(missing, 100);
  for (const batch of batches) {
    try {
      const res = await supabaseOps
        .from('pedidos_status')
        .upsert(
          batch.map((p) => ({
            pedido_id: p.pedidoId,
            numero_pedido: p.numeroPedido,
            status_atual: statusNovo,
            atualizado_em: now,
            atualizado_por: userName,
          })) as any,
          { onConflict: 'pedido_id', ignoreDuplicates: true },
        );
      if (res.error) {
        console.error('[Supabase OPS] ensurePedidosStatusInitializedBatch upsert pedidos_status:', res.error.message);
      }
    } catch (err) {
      console.error('[Supabase OPS] ensurePedidosStatusInitializedBatch upsert pedidos_status (fetch):', err);
      return;
    }

    try {
      const res = await supabaseOps.from('pedidos_status_historico').insert(
        batch.map((p) => ({
          pedido_id: p.pedidoId,
          numero_pedido: p.numeroPedido,
          status_anterior: null,
          status_novo: statusNovo,
          alterado_em: now,
          alterado_por: userName,
          observacao: 'Status inicial criado automaticamente',
          notificado_representante: false,
        })) as any,
      );
      if (res.error) {
        console.error('[Supabase OPS] ensurePedidosStatusInitializedBatch insert historico:', res.error.message);
      }
    } catch (err) {
      console.error('[Supabase OPS] ensurePedidosStatusInitializedBatch insert historico (fetch):', err);
      return;
    }
  }
}

export async function updatePedidoStatus(input: StatusUpdateInput): Promise<{ ok: boolean; previous: PedidoStatusValue | null }>{
  if (!supabaseOps) return { ok: false, previous: null };
  const now = new Date().toISOString();

  const current = await getPedidoStatus(input.pedidoId);
  const statusAnterior = current?.status_atual ?? null;
  if (statusAnterior && !canMoveToStatus(statusAnterior, input.statusNovo)) {
    return { ok: false, previous: statusAnterior };
  }

  try {
    const { error: upsertErr } = await supabaseOps.from('pedidos_status').upsert(
      {
        pedido_id: input.pedidoId,
        numero_pedido: input.numeroPedido,
        status_atual: input.statusNovo,
        atualizado_em: now,
        atualizado_por: input.alteradoPor,
      } as any,
      { onConflict: 'pedido_id' },
    );
    if (upsertErr) {
      console.error('[Supabase OPS] updatePedidoStatus upsert pedidos_status:', upsertErr.message);
      return { ok: false, previous: statusAnterior };
    }
  } catch (err) {
    console.error('[Supabase OPS] updatePedidoStatus upsert pedidos_status (fetch):', err);
    return { ok: false, previous: statusAnterior };
  }

  try {
    const { error: histErr } = await supabaseOps.from('pedidos_status_historico').insert({
      pedido_id: input.pedidoId,
      numero_pedido: input.numeroPedido,
      status_anterior: statusAnterior,
      status_novo: input.statusNovo,
      alterado_em: now,
      alterado_por: input.alteradoPor,
      observacao: input.observacao ?? null,
      notificado_representante: Boolean(input.notificadoRepresentante),
      notificado_em: input.notificadoRepresentante ? input.notificadoEm ?? now : null,
      notificacao_provider_id: input.notificacaoProviderId ?? null,
      notificacao_erro: input.notificacaoErro ?? null,
    } as any);
    if (histErr) {
      console.error('[Supabase OPS] updatePedidoStatus insert historico:', histErr.message);
      return { ok: false, previous: statusAnterior };
    }
  } catch (err) {
    console.error('[Supabase OPS] updatePedidoStatus insert historico (fetch):', err);
    return { ok: false, previous: statusAnterior };
  }

  return { ok: true, previous: statusAnterior };
}

export function normalizePhoneToE164(raw: string | null | undefined): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  const normalized = digits.startsWith('55') ? digits : `55${digits}`;
  if (normalized.length < 12) return null;
  return normalized;
}

async function sendWhatsappMessage(toPhoneE164: string, message: string): Promise<{ ok: boolean; providerMessageId: string | null; error: string | null }> {
  if (!supabaseOps) return { ok: false, providerMessageId: null, error: 'Supabase OPS não configurado.' };
  try {
    const { data, error } = await supabaseOps.functions.invoke('whatsapp-send-status', {
      body: { toPhoneE164, message },
    } as any);

    if (error) {
      return { ok: false, providerMessageId: null, error: error.message || 'Falha ao enviar WhatsApp.' };
    }

    const ok = Boolean((data as any)?.ok);
    const providerMessageId = (data as any)?.providerMessageId ? String((data as any).providerMessageId) : null;
    const err = (data as any)?.error ? String((data as any).error) : null;
    return { ok, providerMessageId, error: err };
  } catch (e: any) {
    return { ok: false, providerMessageId: null, error: e?.message || String(e) };
  }
}

export async function setPedidoStatusWithOptionalNotify(params: {
  pedidoId: string;
  numeroPedido: string;
  statusNovo: PedidoStatusValue;
  alteradoPor: string | null;
  observacao?: string | null;
  notifyRepresentante: boolean;
  representantePhoneRaw?: string | null;
  clienteNome: string;
}): Promise<{ ok: boolean; previous: PedidoStatusValue | null; notified: boolean; notifyError: string | null }> {
  if (!supabaseOps) return { ok: false, previous: null, notified: false, notifyError: 'Supabase OPS não configurado.' };
  const now = new Date().toISOString();

  const current = await getPedidoStatus(params.pedidoId);
  const statusAnterior = current?.status_atual ?? null;
  if (statusAnterior && !canMoveToStatus(statusAnterior, params.statusNovo)) {
    return { ok: false, previous: statusAnterior, notified: false, notifyError: null };
  }

  let notified = false;
  let notifyError: string | null = null;
  let providerMessageId: string | null = null;
  let notifiedEm: string | null = null;

  if (params.notifyRepresentante) {
    const to = normalizePhoneToE164(params.representantePhoneRaw);
    if (!to) {
      notifyError = 'Telefone do representante inválido ou não informado.';
    } else {
      const message = formatStatusWhatsappMessage({
        numeroPedido: params.numeroPedido,
        clienteNome: params.clienteNome,
        statusAnterior,
        statusNovo: params.statusNovo,
        dataHoraIso: now,
        observacao: params.observacao,
      });
      const sent = await sendWhatsappMessage(to, message);
      notified = sent.ok;
      notifyError = sent.ok ? null : sent.error || 'Falha ao enviar WhatsApp.';
      providerMessageId = sent.providerMessageId;
      notifiedEm = now;
    }
  }

  const { error: upsertErr } = await supabaseOps.from('pedidos_status').upsert(
    {
      pedido_id: params.pedidoId,
      numero_pedido: params.numeroPedido,
      status_atual: params.statusNovo,
      atualizado_em: now,
      atualizado_por: params.alteradoPor,
    } as any,
    { onConflict: 'pedido_id' },
  );
  if (upsertErr) {
    console.error('[Supabase OPS] setPedidoStatusWithOptionalNotify upsert pedidos_status:', upsertErr.message);
    return { ok: false, previous: statusAnterior, notified: false, notifyError: upsertErr.message };
  }

  const { error: histErr } = await supabaseOps.from('pedidos_status_historico').insert({
    pedido_id: params.pedidoId,
    numero_pedido: params.numeroPedido,
    status_anterior: statusAnterior,
    status_novo: params.statusNovo,
    alterado_em: now,
    alterado_por: params.alteradoPor,
    observacao: params.observacao ?? null,
    notificado_representante: notified,
    notificado_em: notifiedEm,
    notificacao_provider_id: providerMessageId,
    notificacao_erro: notifyError,
  } as any);
  if (histErr) {
    console.error('[Supabase OPS] setPedidoStatusWithOptionalNotify insert historico:', histErr.message);
    return { ok: false, previous: statusAnterior, notified, notifyError: histErr.message };
  }

  return { ok: true, previous: statusAnterior, notified, notifyError };
}

export async function syncEntregaStatusFromOps(params: {
  pedidoId: string;
  numeroPedido: string;
  alteradoPor: string | null;
  clienteNome: string;
  representantePhoneRaw?: string | null;
}): Promise<{ ok: boolean; target: PedidoStatusValue | null }> {
  if (!supabaseOps) return { ok: false, target: null };

  const { data, error } = await supabaseOps.from('entregas').select('status').eq('pedido_id', params.pedidoId);
  if (error) {
    console.error('[Supabase OPS] syncEntregaStatusFromOps select entregas:', error.message);
    return { ok: false, target: null };
  }

  const rows = (data || []) as Array<{ status: string }>;
  const total = rows.length;
  if (!total) return { ok: true, target: null };
  const delivered = rows.filter((r) => String(r.status).toLowerCase() === 'entregue').length;
  if (delivered === 0) return { ok: true, target: null };

  if (delivered < total) return { ok: true, target: null };
  const target: PedidoStatusValue = 'entregue';
  const res = await setPedidoStatusWithOptionalNotify({
    pedidoId: params.pedidoId,
    numeroPedido: params.numeroPedido,
    statusNovo: target,
    alteradoPor: params.alteradoPor,
    observacao: null,
    notifyRepresentante: true,
    representantePhoneRaw: params.representantePhoneRaw,
    clienteNome: params.clienteNome,
  });
  return { ok: res.ok, target };
}

export function formatStatusWhatsappMessage(params: {
  numeroPedido: string;
  clienteNome: string;
  statusAnterior: PedidoStatusValue | null;
  statusNovo: PedidoStatusValue;
  dataHoraIso: string;
  observacao?: string | null;
}): string {
  const statusAnteriorLabel = params.statusAnterior ? getPedidoStatusDef(params.statusAnterior).label : '-';
  const statusNovoLabel = getPedidoStatusDef(params.statusNovo).label;
  const when = new Date(params.dataHoraIso).toLocaleString('pt-BR');

  const lines = [
    `Olá! O pedido *${params.numeroPedido}* do cliente *${params.clienteNome}* teve seu status atualizado.`,
    '',
    `Status anterior: ${statusAnteriorLabel}`,
    `Novo status: ${statusNovoLabel}`,
    `Data: ${when}`,
  ];

  const note = String(params.observacao || '').trim();
  if (note) {
    lines.push('', note);
  }

  return lines.join('\n');
}
