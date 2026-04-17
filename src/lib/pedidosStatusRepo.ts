import { supabaseOps } from '@/lib/supabase';
import { fmtDateTimeMsg } from '@/lib/dateUtils';
import { sendEvolutionText } from '@/lib/evolutionApi';
import { canMoveToStatus, getPedidoStatusDef } from '@/lib/pedidoStatusFlow';
import type { PedidoStatusHistoricoRow, PedidoStatusRow, PedidoStatusValue } from '@/types';

type StatusUpdateInput = {
  pedidoId: string;
  numeroPedido: string;
  statusNovo: PedidoStatusValue;
  alteradoPor: string | null;
  alteradoEm?: string | null;
  observacao?: string | null;
  notificadoRepresentante?: boolean;
  notificadoEm?: string | null;
  notificacaoProviderId?: string | null;
  notificacaoErro?: string | null;
};

export async function getPedidoStatus(pedidoId: string): Promise<PedidoStatusRow | null> {
  if (!supabaseOps) return null;
  const { data, error } = await supabaseOps
    .from('concrem_pedidos_status')
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

  // Chunk into batches of 200 to avoid URL length limits on .in() queries
  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };
  const batches = chunk(pedidoIds, 200);
  const results: PedidoStatusRow[] = [];
  for (const batch of batches) {
    const { data, error } = await supabaseOps.from('concrem_pedidos_status').select('*').in('pedido_id', batch);
    if (error) {
      console.error('[Supabase OPS] listPedidosStatusByPedidoIds:', error.message);
      continue;
    }
    results.push(...((data || []) as any) as PedidoStatusRow[]);
  }
  return results;
}

export async function listPedidosStatusHistorico(pedidoId: string): Promise<PedidoStatusHistoricoRow[]> {
  if (!supabaseOps) return [];
  const { data, error } = await supabaseOps
    .from('concrem_pedidos_status_historico')
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
      .from('concrem_pedidos_status')
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
    const res = await supabaseOps.from('concrem_pedidos_status_historico').insert({
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

/** Check if a grupo_cliente value indicates REVENDA */
export function isRevenda(grupoCliente?: string | null): boolean {
  return Boolean(grupoCliente && grupoCliente.toUpperCase().includes('REVENDA'));
}

/** Check if client or representative name contains LEROY (skip WhatsApp) */
export function isLeroy(clienteNome?: string | null, representanteNome?: string | null): boolean {
  const c = (clienteNome || '').toUpperCase();
  const r = (representanteNome || '').toUpperCase();
  return c.includes('LEROY') || r.includes('LEROY');
}

export async function ensurePedidosStatusInitializedBatch(
  pedidos: Array<{ pedidoId: string; numeroPedido: string; grupoCliente?: string | null; clienteNome?: string | null; representanteNome?: string | null }>,
  userName: string | null,
): Promise<{ upgradedCount: number }> {
  if (!supabaseOps) return { upgradedCount: 0 };
  const unique = new Map(pedidos.map((p) => [p.pedidoId, p] as const));
  const ids = Array.from(unique.keys());
  if (!ids.length) return { upgradedCount: 0 };

  // Chunk ID list to avoid URL length limits on .in() queries
  const chunkArr = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  let existing: any[] = [];
  for (const idBatch of chunkArr(ids, 200)) {
    let batchData: any[] | null = null;
    let batchErr: { message: string } | null = null;
    try {
      const res = await supabaseOps.from('concrem_pedidos_status').select('pedido_id, status_atual').in('pedido_id', idBatch);
      batchData = res.data as any;
      batchErr = res.error as any;
    } catch (err) {
      console.error('[Supabase OPS] ensurePedidosStatusInitializedBatch existing (fetch):', err);
      return { upgradedCount: 0 };
    }
    if (batchErr) {
      console.error('[Supabase OPS] ensurePedidosStatusInitializedBatch existing:', batchErr.message);
      return { upgradedCount: 0 };
    }
    existing.push(...(batchData || []));
  }

  const existingMap = new Map((existing || []).map((r: any) => [String(r.pedido_id), r.status_atual as string]));
  const missing = ids.filter((id) => !existingMap.has(id)).map((id) => unique.get(id)!).filter(Boolean);

  let upgradedCount = 0;

  // Upgrade LEROY orders stuck before liberado_producao → liberado_producao
  const now = new Date().toISOString();
  const LEROY_TARGET: PedidoStatusValue = 'liberado_producao';
  const LEROY_BEFORE = ['aguardando_avaliacao','aguardando_mapeamento','mapeamento_concluido','aguardando_ferragem','ferragem_recebida','liberado_comercial','aguardando_gerencia','confirmado_gerencia'];
  const leroyToUpgrade = ids
    .filter((id) => {
      const st = existingMap.get(id) ?? '';
      const p = unique.get(id)!;
      return LEROY_BEFORE.includes(st) && isLeroy(p.clienteNome, p.representanteNome);
    })
    .map((id) => unique.get(id)!);

  for (const p of leroyToUpgrade) {
    try {
      const res = await supabaseOps.from('concrem_pedidos_status').update({
        status_atual: LEROY_TARGET,
        atualizado_em: now,
        atualizado_por: userName,
      }).eq('pedido_id', p.pedidoId);
      if (res.error) {
        console.error('[Supabase OPS] ensurePedidosStatusInitializedBatch upgrade leroy:', res.error.message);
        continue;
      }
      await supabaseOps.from('concrem_pedidos_status_historico').insert({
        pedido_id: p.pedidoId,
        numero_pedido: p.numeroPedido,
        status_anterior: existingMap.get(p.pedidoId) ?? null,
        status_novo: LEROY_TARGET,
        alterado_em: now,
        alterado_por: userName,
        observacao: 'LEROY — liberado automaticamente para produção',
        notificado_representante: false,
      } as any);
      upgradedCount++;
    } catch (err) {
      console.error('[Supabase OPS] ensurePedidosStatusInitializedBatch upgrade leroy (fetch):', err);
    }
  }

  // Upgrade REVENDA orders that are still in aprovacao_politica/aguardando_avaliacao → liberado_comercial
  const revendaToUpgrade = ids
    .filter((id) => existingMap.get(id) === 'aguardando_avaliacao' && isRevenda(unique.get(id)?.grupoCliente))
    .map((id) => unique.get(id)!);

  for (const p of revendaToUpgrade) {
    try {
      const res = await supabaseOps.from('concrem_pedidos_status').update({
        status_atual: 'liberado_comercial',
        atualizado_em: now,
        atualizado_por: userName,
      }).eq('pedido_id', p.pedidoId);
      if (res.error) {
        console.error('[Supabase OPS] ensurePedidosStatusInitializedBatch upgrade revenda:', res.error.message);
        continue;
      }
      await supabaseOps.from('concrem_pedidos_status_historico').insert({
        pedido_id: p.pedidoId,
        numero_pedido: p.numeroPedido,
        status_anterior: 'aguardando_avaliacao',
        status_novo: 'liberado_comercial',
        alterado_em: now,
        alterado_por: userName,
        observacao: 'REVENDA — liberado automaticamente para o comercial',
        notificado_representante: false,
      } as any);
      upgradedCount++;
    } catch (err) {
      console.error('[Supabase OPS] ensurePedidosStatusInitializedBatch upgrade revenda (fetch):', err);
    }
  }

  if (!missing.length) return { upgradedCount };

  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const batches = chunk(missing, 100);
  for (const batch of batches) {
    // Count new LEROY insertions so pedidoStatusVersion increments in AppContext
    upgradedCount += batch.filter((p) => isLeroy(p.clienteNome, p.representanteNome)).length;

    try {
      const res = await supabaseOps
        .from('concrem_pedidos_status')
        .upsert(
          batch.map((p) => {
            const status: PedidoStatusValue = isLeroy(p.clienteNome, p.representanteNome)
              ? 'liberado_producao'
              : isRevenda(p.grupoCliente) ? 'liberado_comercial' : 'aguardando_avaliacao';
            return {
              pedido_id: p.pedidoId,
              numero_pedido: p.numeroPedido,
              status_atual: status,
              atualizado_em: now,
              atualizado_por: userName,
            };
          }) as any,
          { onConflict: 'pedido_id', ignoreDuplicates: true },
        );
      if (res.error) {
        console.error('[Supabase OPS] ensurePedidosStatusInitializedBatch upsert pedidos_status:', res.error.message);
      }
    } catch (err) {
      console.error('[Supabase OPS] ensurePedidosStatusInitializedBatch upsert pedidos_status (fetch):', err);
      return { upgradedCount };
    }

    try {
      const res = await supabaseOps.from('concrem_pedidos_status_historico').insert(
        batch.map((p) => {
          const leroyOrder = isLeroy(p.clienteNome, p.representanteNome);
          const status: PedidoStatusValue = leroyOrder
            ? 'liberado_producao'
            : isRevenda(p.grupoCliente) ? 'liberado_comercial' : 'aguardando_avaliacao';
          return {
            pedido_id: p.pedidoId,
            numero_pedido: p.numeroPedido,
            status_anterior: null,
            status_novo: status,
            alterado_em: now,
            alterado_por: userName,
            observacao: leroyOrder
              ? 'LEROY — liberado automaticamente para produção'
              : isRevenda(p.grupoCliente)
                ? 'REVENDA — liberado automaticamente para o comercial'
                : 'Status inicial criado automaticamente',
            notificado_representante: false,
          };
        }) as any,
      );
      if (res.error) {
        console.error('[Supabase OPS] ensurePedidosStatusInitializedBatch insert historico:', res.error.message);
      }
    } catch (err) {
      console.error('[Supabase OPS] ensurePedidosStatusInitializedBatch insert historico (fetch):', err);
      return { upgradedCount };
    }
  }

  return { upgradedCount };
}

export async function updatePedidoStatus(input: StatusUpdateInput): Promise<{ ok: boolean; previous: PedidoStatusValue | null }>{
  if (!supabaseOps) return { ok: false, previous: null };
  const now = new Date().toISOString();
  const alteradoEm = input.alteradoEm || now;

  const current = await getPedidoStatus(input.pedidoId);
  const statusAnterior = current?.status_atual ?? null;
  if (statusAnterior && !canMoveToStatus(statusAnterior, input.statusNovo)) {
    return { ok: false, previous: statusAnterior };
  }

  try {
    const { error: upsertErr } = await supabaseOps.from('concrem_pedidos_status').upsert(
      {
        pedido_id: input.pedidoId,
        numero_pedido: input.numeroPedido,
        status_atual: input.statusNovo,
        atualizado_em: alteradoEm,
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
    const { error: histErr } = await supabaseOps.from('concrem_pedidos_status_historico').insert({
      pedido_id: input.pedidoId,
      numero_pedido: input.numeroPedido,
      status_anterior: statusAnterior,
      status_novo: input.statusNovo,
      alterado_em: alteradoEm,
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
  const result = await sendEvolutionText(toPhoneE164, message);
  return { ok: result.ok, providerMessageId: result.messageId, error: result.error };
}

export async function setPedidoStatusWithOptionalNotify(params: {
  pedidoId: string;
  numeroPedido: string;
  statusNovo: PedidoStatusValue;
  alteradoPor: string | null;
  alteradoEm?: string | null;
  observacao?: string | null;
  notifyRepresentante: boolean;
  representantePhoneRaw?: string | null;
  representanteNome?: string | null;
  clienteNome: string;
}): Promise<{ ok: boolean; previous: PedidoStatusValue | null; notified: boolean; notifyError: string | null }> {
  if (!supabaseOps) return { ok: false, previous: null, notified: false, notifyError: 'Supabase OPS não configurado.' };
  const now = new Date().toISOString();
  const alteradoEm = params.alteradoEm || now;

  const current = await getPedidoStatus(params.pedidoId);
  const statusAnterior = current?.status_atual ?? null;
  if (statusAnterior && !canMoveToStatus(statusAnterior, params.statusNovo)) {
    return { ok: false, previous: statusAnterior, notified: false, notifyError: null };
  }

  let notified = false;
  let notifyError: string | null = null;
  let providerMessageId: string | null = null;
  let notifiedEm: string | null = null;

  // LEROY: skip WhatsApp notification
  const shouldNotify = params.notifyRepresentante && !isLeroy(params.clienteNome, params.representanteNome);

  if (shouldNotify) {
    const to = normalizePhoneToE164(params.representantePhoneRaw);
    if (!to) {
      notifyError = 'Telefone do representante inválido ou não informado.';
    } else {
      const message = formatStatusWhatsappMessage({
        numeroPedido: params.numeroPedido,
        clienteNome: params.clienteNome,
        statusAnterior,
        statusNovo: params.statusNovo,
        dataHoraIso: alteradoEm,
        observacao: params.observacao,
      });
      const sent = await sendWhatsappMessage(to, message);
      notified = sent.ok;
      notifyError = sent.ok ? null : sent.error || 'Falha ao enviar WhatsApp.';
      providerMessageId = sent.providerMessageId;
      notifiedEm = now;
    }
  }

  const { error: upsertErr } = await supabaseOps.from('concrem_pedidos_status').upsert(
    {
      pedido_id: params.pedidoId,
      numero_pedido: params.numeroPedido,
      status_atual: params.statusNovo,
      atualizado_em: alteradoEm,
      atualizado_por: params.alteradoPor,
    } as any,
    { onConflict: 'pedido_id' },
  );
  if (upsertErr) {
    console.error('[Supabase OPS] setPedidoStatusWithOptionalNotify upsert pedidos_status:', upsertErr.message);
    return { ok: false, previous: statusAnterior, notified: false, notifyError: upsertErr.message };
  }

  const { error: histErr } = await supabaseOps.from('concrem_pedidos_status_historico').insert({
    pedido_id: params.pedidoId,
    numero_pedido: params.numeroPedido,
    status_anterior: statusAnterior,
    status_novo: params.statusNovo,
    alterado_em: alteradoEm,
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
  representanteNome?: string | null;
}): Promise<{ ok: boolean; target: PedidoStatusValue | null }> {
  if (!supabaseOps) return { ok: false, target: null };

  const { data, error } = await supabaseOps.from('concrem_entregas').select('status').eq('pedido_id', params.pedidoId);
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

  // Só avança para 'entregue' se o pedido já estiver em 'faturado' ou 'em_entrega'
  const current = await getPedidoStatus(params.pedidoId);
  const statusAtual = current?.status_atual;
  if (statusAtual !== 'faturado' && statusAtual !== 'em_entrega') {
    return { ok: true, target: null };
  }

  const target: PedidoStatusValue = 'entregue';
  const res = await setPedidoStatusWithOptionalNotify({
    pedidoId: params.pedidoId,
    numeroPedido: params.numeroPedido,
    statusNovo: target,
    alteradoPor: params.alteradoPor,
    observacao: null,
    notifyRepresentante: true,
    representantePhoneRaw: params.representantePhoneRaw,
    representanteNome: params.representanteNome,
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
  const { numeroPedido, clienteNome, statusAnterior, statusNovo, dataHoraIso, observacao } = params;
  const statusAnteriorLabel = statusAnterior ? getPedidoStatusDef(statusAnterior).label : '-';
  const statusNovoLabel = getPedidoStatusDef(statusNovo).label;
  const when = fmtDateTimeMsg(dataHoraIso);

  let lines: string[];

  if (statusNovo === 'liberado_producao') {
    lines = [
      'Olá! 👋',
      '',
      `Seu pedido ${numeroPedido} — ${clienteNome} foi atualizado:`,
      '',
      `🔄 De: ${statusAnteriorLabel}`,
      `🏭 Para: ${statusNovoLabel}`,
      '',
      'A produção começa em breve e eu te aviso das próximas etapas 👍',
      '',
      `🕒 ${when}`,
    ];
  } else if (statusNovo === 'em_entrega') {
    lines = [
      'Olá! 👋',
      '',
      `Seu pedido ${numeroPedido} — ${clienteNome} já saiu para entrega 🚚`,
      '',
      '📍 Ele está em rota para o destino.',
      '',
      'Se quiser acompanhar ou alinhar a entrega, vale entrar em contato com o motorista 👍',
      '',
      `🕒 ${when}`,
    ];
  } else if (statusNovo === 'entregue') {
    lines = [
      'Olá! 👋',
      '',
      `Seu pedido ${numeroPedido} — ${clienteNome} foi entregue com sucesso ✅`,
      '',
      'Tudo certo com a entrega?',
      'Se precisar de qualquer coisa, estou por aqui 👍',
      '',
      `🕒 ${when}`,
    ];
  } else {
    lines = [
      'Olá! 👋',
      '',
      `Seu pedido ${numeroPedido} foi atualizado:`,
      '',
      `🔄 De: ${statusAnteriorLabel}`,
      `📍 Para: ${statusNovoLabel}`,
      '',
      'Seguimos com as próximas etapas e te aviso por aqui 👍',
      '',
      `🕒 ${when}`,
    ];
  }

  const note = String(observacao || '').trim();
  if (note) {
    lines.push('', note);
  }

  return lines.join('\n');
}

/**
 * One-time bulk migration: sets a fixed list of pedido IDs to liberado_producao,
 * skipping any that are already at or beyond that status.
 * Returns the count of records actually upgraded.
 */
export async function runMigrationSuporteLiberadoProducao(
  ids: string[],
  userName: string | null,
): Promise<number> {
  if (!supabaseOps || !ids.length) return 0;

  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  // Fetch current status for all IDs
  let existing: Array<{ pedido_id: string; status_atual: string }> = [];
  for (const batch of chunk(ids, 200)) {
    try {
      const { data, error } = await supabaseOps
        .from('concrem_pedidos_status')
        .select('pedido_id, status_atual')
        .in('pedido_id', batch);
      if (error) { console.error('[Migration] fetch status:', error.message); continue; }
      existing.push(...((data || []) as any));
    } catch (e) { console.error('[Migration] fetch status (fetch):', e); }
  }

  const existingMap = new Map(existing.map((r) => [String(r.pedido_id), r.status_atual]));
  const TARGET: PedidoStatusValue = 'liberado_producao';
  const TARGET_ORDER = getPedidoStatusDef(TARGET).order; // 10

  // Only upgrade orders that exist in DB and are below liberado_producao
  const toUpgrade = ids.filter((id) => {
    const st = existingMap.get(id);
    if (!st) return false; // not initialized yet — skip (batch init will handle it)
    return getPedidoStatusDef(st as PedidoStatusValue).order < TARGET_ORDER;
  });

  // Also insert records for IDs that don't exist yet
  const toInsert = ids.filter((id) => !existingMap.has(id));

  const now = new Date().toISOString();
  let upgraded = 0;

  // Update existing records
  for (const batch of chunk(toUpgrade, 100)) {
    try {
      const { error } = await supabaseOps
        .from('concrem_pedidos_status')
        .update({ status_atual: TARGET, atualizado_em: now, atualizado_por: userName })
        .in('pedido_id', batch);
      if (error) { console.error('[Migration] update:', error.message); continue; }

      const { error: histErr } = await supabaseOps.from('concrem_pedidos_status_historico').insert(
        batch.map((id) => ({
          pedido_id: id,
          numero_pedido: id,
          status_anterior: existingMap.get(id) ?? null,
          status_novo: TARGET,
          alterado_em: now,
          alterado_por: userName,
          observacao: 'Suporte — liberado para produção (migração manual)',
          notificado_representante: false,
        })) as any,
      );
      if (histErr) console.error('[Migration] insert historico:', histErr.message);
      upgraded += batch.length;
    } catch (e) { console.error('[Migration] update (fetch):', e); }
  }

  // Insert new records
  if (toInsert.length) {
    for (const batch of chunk(toInsert, 100)) {
      try {
        const { error } = await supabaseOps.from('concrem_pedidos_status').upsert(
          batch.map((id) => ({
            pedido_id: id,
            numero_pedido: id,
            status_atual: TARGET,
            atualizado_em: now,
            atualizado_por: userName,
          })) as any,
          { onConflict: 'pedido_id', ignoreDuplicates: true },
        );
        if (error) { console.error('[Migration] upsert new:', error.message); continue; }

        const { error: histErr } = await supabaseOps.from('concrem_pedidos_status_historico').insert(
          batch.map((id) => ({
            pedido_id: id,
            numero_pedido: id,
            status_anterior: null,
            status_novo: TARGET,
            alterado_em: now,
            alterado_por: userName,
            observacao: 'Suporte — liberado para produção (migração manual)',
            notificado_representante: false,
          })) as any,
        );
        if (histErr) console.error('[Migration] insert historico new:', histErr.message);
        upgraded += batch.length;
      } catch (e) { console.error('[Migration] upsert new (fetch):', e); }
    }
  }

  return upgraded;
}

const POST_PRODUCAO_STATUSES: PedidoStatusValue[] = [
  'faturado', 'em_entrega', 'parcialmente_entregue', 'entregue', 'aguardando_pagamento', 'finalizado',
];

/**
 * Resets a pedido's status back to pre-embarque level:
 * - Deletes all historico entries that are post-producao_finalizada
 * - Sets status_atual to the highest remaining status in history (or liberado_producao)
 */
export async function resetPedidoStatusToPreEmbarque(pedidoId: string, alteradoPor: string): Promise<void> {
  if (!supabaseOps) return;

  const { error: delErr } = await supabaseOps
    .from('concrem_pedidos_status_historico')
    .delete()
    .eq('pedido_id', pedidoId)
    .in('status_novo', POST_PRODUCAO_STATUSES);
  if (delErr) console.error('[Supabase OPS] resetPedidoStatus delete historico:', delErr.message);

  const { data } = await supabaseOps
    .from('concrem_pedidos_status_historico')
    .select('status_novo')
    .eq('pedido_id', pedidoId)
    .order('alterado_em', { ascending: false })
    .limit(1);

  const highestStatus: PedidoStatusValue =
    (data?.[0]?.status_novo as PedidoStatusValue) || 'liberado_producao';

  const { error: updErr } = await supabaseOps
    .from('concrem_pedidos_status')
    .update({ status_atual: highestStatus, atualizado_em: new Date().toISOString(), atualizado_por: alteradoPor })
    .eq('pedido_id', pedidoId);
  if (updErr) console.error('[Supabase OPS] resetPedidoStatus update status:', updErr.message);
}
