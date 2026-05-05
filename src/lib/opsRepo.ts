import { ExpenseType, FreightEntry, Load } from '@/types';
import { supabaseOps } from '@/lib/supabase';

type ProducaoConcluidoRow = {
  id: string;
  embarque_id: string;
  pedido_id: string | null;
  motorista_id: string | null;
  data_conclusao: string;
  desfeito: boolean;
  criado_por: string | null;
  criado_em: string;
};

type OpsStatus = 'aguardando_producao' | 'producao_confirmada' | 'entregue' | 'cancelado';

const toOpsStatus = (load: Load): OpsStatus => {
  if (load.shipmentStatus === 'Cancelado' || load.productionStatus === 'Cancelado') return 'cancelado';
  if (load.shipmentStatus === 'Entregue') return 'entregue';
  if (load.productionStatus === 'Em Produção' || load.productionStatus === 'Produção Concluída') return 'producao_confirmada';
  return 'aguardando_producao';
};

export async function upsertProgramacaoCarregamento(load: Load): Promise<{ error: { message: string } | null }> {
  if (!supabaseOps) return { error: { message: 'Supabase OPS não configurado.' } };
  const payload = {
    id: load.id,
    pedidos: load.orderIds,
    status: toOpsStatus(load),
    criado_em: load.createdAt,
    criado_por: load.createdBy,
    driver_id: load.driverId,
    planned_date: load.plannedDate,
    realization_date: load.realizationDate ?? null,
    previsao_entrega: load.previsaoEntrega ?? null,
    obs: load.obs,
    estimated_weight: load.estimatedWeight,
    freight_value: load.freightValue,
    production_status: load.productionStatus,
    shipment_status: load.shipmentStatus,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseOps.from('concrem_programacoes_embarque').upsert(payload);
  if (error) {
    console.error('[Supabase OPS] upsert programacoes_embarque:', error.message);
    return { error };
  }
  return { error: null };
}

export async function deleteProgramacaoCarregamento(id: string) {
  if (!supabaseOps) return;
  const { error } = await supabaseOps.from('concrem_programacoes_embarque').delete().eq('id', id);
  if (error) {
    console.error('[Supabase OPS] delete programacoes_embarque:', error.message);
  }
}

export async function insertProducaoConfirmacao(programacaoId: string, confirmadoPor: string, observacao?: string) {
  if (!supabaseOps) return;
  const { error } = await supabaseOps.from('concrem_producao_confirmacoes').insert({
    programacao_id: programacaoId,
    confirmado_em: new Date().toISOString(),
    confirmado_por: confirmadoPor,
    observacao: observacao || null,
  });
  if (error) {
    console.error('[Supabase OPS] insert producao_confirmacoes:', error.message);
  }
}

export async function listProducaoConcluidos() {
  if (!supabaseOps) return [] as ProducaoConcluidoRow[];
  const { data, error } = await supabaseOps
    .from('concrem_producao_concluidos')
    .select('id, embarque_id, pedido_id, motorista_id, data_conclusao, desfeito, criado_por, criado_em')
    .eq('desfeito', false)
    .order('data_conclusao', { ascending: false })
    .limit(200);
  if (error) {
    console.error('[Supabase OPS] list producao_concluidos:', error.message);
    return [] as ProducaoConcluidoRow[];
  }
  return (data || []) as ProducaoConcluidoRow[];
}

export async function insertProducaoConcluido(row: {
  embarque_id: string;
  pedido_id?: string | null;
  motorista_id?: string | null;
  criado_por?: string | null;
}) {
  if (!supabaseOps) return;
  const { error } = await supabaseOps.from('concrem_producao_concluidos').insert({
    embarque_id: row.embarque_id,
    pedido_id: row.pedido_id ?? null,
    motorista_id: row.motorista_id ?? null,
    criado_por: row.criado_por ?? null,
    data_conclusao: new Date().toISOString(),
    desfeito: false,
  } as any);
  if (error) {
    console.error('[Supabase OPS] insert producao_concluidos:', error.message);
  }
}

export async function desfazerProducaoConcluido(carregamentoId: string) {
  if (!supabaseOps) return;
  const { error } = await supabaseOps
    .from('concrem_producao_concluidos')
    .update({ desfeito: true })
    .eq('embarque_id', carregamentoId)
    .eq('desfeito', false);
  if (error) {
    console.error('[Supabase OPS] desfazer producao_concluidos:', error.message);
  }
}

export async function upsertEntregas(programacaoId: string, pedidoIds: string[], status: 'pendente' | 'entregue') {
  if (!supabaseOps) return;
  const rows = pedidoIds.map((pedidoId) => ({
    programacao_id: programacaoId,
    pedido_id: pedidoId,
    status,
    entregue_em: status === 'entregue' ? new Date().toISOString() : null,
  }));
  const { error } = await supabaseOps.from('concrem_entregas').upsert(rows, { onConflict: 'programacao_id,pedido_id' });
  if (error) {
    console.error('[Supabase OPS] upsert entregas:', error.message);
  }
}

export async function upsertEntregasDetalhes(programacaoId: string, rows: Array<{ pedido_id: string; status: 'pendente' | 'entregue'; entregue_em?: string | null; numero_nota?: string | null; ordem_entrega?: number | null; }>) {
  if (!supabaseOps) return;
  const payload = rows.map((r) => ({
    programacao_id: programacaoId,
    pedido_id: r.pedido_id,
    status: r.status,
    entregue_em: r.entregue_em ?? (r.status === 'entregue' ? new Date().toISOString() : null),
    numero_nota: r.numero_nota ?? null,
    ordem_entrega: r.ordem_entrega ?? null,
  }));
  const { error } = await supabaseOps.from('concrem_entregas').upsert(payload as any, { onConflict: 'programacao_id,pedido_id' });
  if (error) {
    console.error('[Supabase OPS] upsert entregas (detalhes):', error.message);
  }
}

export async function upsertEntregasDetalhesSafe(programacaoId: string, rows: Array<{ pedido_id: string; status: 'pendente' | 'entregue'; entregue_em?: string | null; numero_nota?: string | null; ordem_entrega?: number | null; qtd_kits?: number | null; qtd_pallets?: number | null; qtd_volumes?: number | null; }>) {
  if (!supabaseOps) return;

  const payload = rows.map((r) => ({
    programacao_id: programacaoId,
    pedido_id: r.pedido_id,
    status: r.status,
    entregue_em: r.entregue_em ?? (r.status === 'entregue' ? new Date().toISOString() : null),
    numero_nota: r.numero_nota ?? null,
    ordem_entrega: r.ordem_entrega ?? null,
    qtd_kits: r.qtd_kits ?? null,
    qtd_pallets: r.qtd_pallets ?? null,
    qtd_volumes: r.qtd_volumes ?? null,
  }));

  const { error } = await supabaseOps
    .from('concrem_entregas')
    .upsert(payload as any, { onConflict: 'programacao_id,pedido_id' });
  if (error) {
    console.error('[Supabase OPS] upsert entregas:', error.message);
    return error;
  }
  return null;
}

export async function listEntregas(programacaoId: string) {
  if (!supabaseOps) return [];
  const { data, error } = await supabaseOps
    .from('concrem_entregas')
    .select('pedido_id, status, entregue_em, numero_nota, ordem_entrega, qtd_kits, qtd_pallets, qtd_volumes')
    .eq('programacao_id', programacaoId);
  if (error) {
    console.error('[Supabase OPS] list entregas:', error.message);
    return [];
  }
  return (data || []) as Array<{
    pedido_id: string;
    status: string;
    entregue_em: string | null;
    numero_nota: string | null;
    ordem_entrega: number | null;
    qtd_kits: number | null;
    qtd_pallets: number | null;
    qtd_volumes: number | null;
  }>;
}

type RepContatoResult = { codigo: string | null; nome: string | null; telefone: string | null; endereco: string | null } | null;
const REP_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const repContatoCache = new Map<string, { value: RepContatoResult; ts: number }>();

export async function findRepresentanteContato(representanteIdOrName: string): Promise<RepContatoResult> {
  if (!supabaseOps) return null;
  const key = String(representanteIdOrName || '').trim();
  if (!key) return null;

  const cached = repContatoCache.get(key);
  if (cached && Date.now() - cached.ts < REP_CACHE_TTL_MS) return cached.value;
  const cache = (v: RepContatoResult): RepContatoResult => { repContatoCache.set(key, { value: v, ts: Date.now() }); return v; };

  // Parse "CODE - NAME" format, e.g. "40054798 - DISTRIBUIDORA / DANILO 12"
  // Use only the leading numeric code for digit search to avoid picking up digits from the name part
  const separatorMatch = key.match(/^(\d+)\s*[-–]\s*(.+)$/);
  const codeKey = separatorMatch ? separatorMatch[1].trim() : key;
  const nameKey = separatorMatch ? separatorMatch[2].trim() : key;

  const digits = codeKey.replace(/\D+/g, '');
  const digitsNoZero = digits.replace(/^0+/, '');
  const select = 'codigo_representante,nome,telefone_whatsapp,endereco';

  if (digits) {
    const orParts = [
      `codigo_representante.eq.${codeKey}`,
      `codigo_representante.eq.${digits}`,
      digitsNoZero ? `codigo_representante.eq.${digitsNoZero}` : '',
      `codigo_representante.ilike.%${digits}`,
      digitsNoZero ? `codigo_representante.ilike.%${digitsNoZero}` : '',
    ].filter(Boolean);

    const { data, error } = await supabaseOps
      .from('concrem_representantes')
      .select(select)
      .or(orParts.join(','))
      .limit(20);

    if (!error && data && data.length) {
      const codeKeyLower = codeKey.toLowerCase();
      const nameKeyLower = nameKey.toLowerCase();
      const ranked = data
        .map((r: any) => {
          const code = String(r.codigo_representante || '').trim();
          const codeDigits = code.replace(/\D+/g, '');
          const codeNoZero = codeDigits.replace(/^0+/, '');
          const name = String(r.nome || '').trim();
          const nameLower = name.toLowerCase();

          let score = 0;
          if (code === codeKey) score += 100;
          if (digits && codeDigits === digits) score += 90;
          if (digitsNoZero && codeNoZero === digitsNoZero) score += 80;
          if (digits && codeDigits.endsWith(digits)) score += 70;
          if (digitsNoZero && codeNoZero.endsWith(digitsNoZero)) score += 60;
          if (nameLower && nameKeyLower && nameLower.includes(nameKeyLower)) score += 30;
          if (nameLower && codeKeyLower && nameLower.includes(codeKeyLower)) score += 20;

          return { r, score };
        })
        .sort((a, b) => b.score - a.score);

      const best = ranked[0]?.r;
      if (best) {
        return cache({
          codigo: (best.codigo_representante as string | null) ?? null,
          nome: (best.nome as string | null) ?? null,
          telefone: (best.telefone_whatsapp as string | null) ?? null,
          endereco: (best.endereco as string | null) ?? null,
        });
      }
    }
  }

  const { data: byName, error: nameError } = await supabaseOps
    .from('concrem_representantes')
    .select(select)
    .ilike('nome', `%${nameKey}%`)
    .limit(5);

  if (!nameError && byName && byName.length) {
    const best = byName[0] as any;
    return cache({
      codigo: (best.codigo_representante as string | null) ?? null,
      nome: (best.nome as string | null) ?? null,
      telefone: (best.telefone_whatsapp as string | null) ?? null,
      endereco: (best.endereco as string | null) ?? null,
    });
  }

  return cache(null);
}

export async function insertNotificacaoRepresentante(programacaoId: string, representante: string) {
  if (!supabaseOps) return;
  const { error } = await supabaseOps.from('concrem_notificacoes_representantes').insert({
    programacao_id: programacaoId,
    representante,
    enviado_em: new Date().toISOString(),
  });
  if (error) {
    console.error('[Supabase OPS] insert notificacoes_representantes:', error.message);
  }
}

export async function upsertComercialPedidoMeta(meta: {
  pedido_id: string;
  ordem_entrega?: number | null;
  status?: string | null;
  representante?: string | null;
  representante_telefone?: string | null;
  cliente_codigo?: string | null;
  cliente_nome?: string | null;
  cliente_cidade?: string | null;
  cliente_uf?: string | null;
  data_validade?: string | null;
  observacao?: string | null;
  atualizado_por?: string | null;
}) {
  if (!supabaseOps) return;
  const payload = {
    ...meta,
    atualizado_em: new Date().toISOString(),
  };
  const { error } = await supabaseOps.from('concrem_comercial_pedidos_meta').upsert(payload);
  if (error) {
    console.error('[Supabase OPS] upsert comercial_pedidos_meta:', error.message);
  }
}

export async function listComercialPedidosMeta(pedidoIds: string[]): Promise<Record<string, { observacao?: string | null }>> {
  if (!supabaseOps || pedidoIds.length === 0) return {};
  const { data, error } = await supabaseOps
    .from('concrem_comercial_pedidos_meta')
    .select('pedido_id, observacao')
    .in('pedido_id', pedidoIds);
  if (error) {
    console.error('[Supabase OPS] list comercial_pedidos_meta:', error.message);
    return {};
  }
  const result: Record<string, { observacao?: string | null }> = {};
  for (const row of data || []) {
    result[row.pedido_id] = { observacao: row.observacao };
  }
  return result;
}

export async function insertComercialPedidoAcao(row: {
  pedido_id: string;
  acao: 'editar' | 'liberar' | 'observacao' | 'notificar_whatsapp';
  criado_por: string;
  payload?: any;
}) {
  if (!supabaseOps) return;
  const { error } = await supabaseOps.from('concrem_comercial_pedidos_acoes').insert({
    pedido_id: row.pedido_id,
    acao: row.acao,
    criado_em: new Date().toISOString(),
    criado_por: row.criado_por,
    payload: row.payload ?? null,
  });
  if (error) {
    console.error('[Supabase OPS] insert comercial_pedidos_acoes:', error.message);
  }
}

export async function insertNotificacaoRepresentantePedido(pedidoId: string, representante: string) {
  if (!supabaseOps) return;
  const { error } = await supabaseOps.from('concrem_notificacoes_representantes_pedidos').insert({
    pedido_id: pedidoId,
    representante,
    enviado_em: new Date().toISOString(),
  });
  if (error) {
    console.error('[Supabase OPS] insert notificacoes_representantes_pedidos:', error.message);
  }
}

// ==============================================================================
// Financeiro (Lançamentos e Despesas)
// ==============================================================================

export async function listTiposDespesa() {
  if (!supabaseOps) return [];
  const { data, error } = await supabaseOps.from('concrem_tipos_despesa').select('id, nome, descricao, ativo').order('nome', { ascending: true });
  if (error) {
    console.error('[Supabase OPS] list tipos_despesa:', error.message);
    return [];
  }
  return data.map((row: any) => ({
    id: row.id,
    name: row.nome,
    description: row.descricao || '',
    active: row.ativo,
  })) as ExpenseType[];
}

export async function upsertTipoDespesa(expenseType: ExpenseType) {
  if (!supabaseOps) return;
  const payload = {
    id: expenseType.id,
    nome: expenseType.name,
    descricao: expenseType.description,
    ativo: expenseType.active,
    atualizado_em: new Date().toISOString(),
  };
  const { error } = await supabaseOps.from('concrem_tipos_despesa').upsert(payload);
  if (error) {
    console.error('[Supabase OPS] upsert tipos_despesa:', error.message);
  }
}

export async function listLancamentosFinanceiros() {
  if (!supabaseOps) return [];

  let lancamentos: any[] | null = null;
  let hasCarregamentoId = true;

  const res1 = await supabaseOps
    .from('concrem_lancamentos_financeiros')
    .select(`
      id, pedido_id, carregamento_id, motorista_id,
      data_entrega, valor_frete, valor_motorista, status, criado_em,
      concrem_lancamentos_despesas ( id, tipo_despesa_id, valor, observacao )
    `)
    .order('criado_em', { ascending: false })
    .limit(200);

  if (res1.error) {
    // Retry without carregamento_id if the column doesn't exist yet
    const res2 = await supabaseOps
      .from('concrem_lancamentos_financeiros')
      .select(`
        id, pedido_id, motorista_id,
        data_entrega, valor_frete, valor_motorista, status, criado_em,
        concrem_lancamentos_despesas ( id, tipo_despesa_id, valor, observacao )
      `)
      .order('criado_em', { ascending: false })
      .limit(200);
    if (res2.error) {
      console.error('[Supabase OPS] list lancamentos_financeiros:', res2.error.message);
      return [];
    }
    lancamentos = res2.data;
    hasCarregamentoId = false;
  } else {
    lancamentos = res1.data;
  }

  return (lancamentos || []).map((row: any) => ({
    id: row.id,
    orderId: row.pedido_id,
    loadId: hasCarregamentoId ? (row.carregamento_id ?? undefined) : undefined,
    driverId: row.motorista_id,
    deliveryDate: row.data_entrega,
    freightValue: Number(row.valor_frete || 0),
    driverValue: Number(row.valor_motorista || 0),
    status: row.status as FreightEntry['status'],
    createdAt: row.criado_em,
    expenses: (row.concrem_lancamentos_despesas || []).map((d: any) => ({
      expenseTypeId: d.tipo_despesa_id,
      value: Number(d.valor || 0),
      note: d.observacao || '',
    })),
  })) as FreightEntry[];
}

export async function upsertLancamentoFinanceiro(entry: FreightEntry) {
  if (!supabaseOps) return;
  
  // 1. Salvar o lançamento principal
  const payloadLancamento: Record<string, unknown> = {
    id: entry.id,
    pedido_id: entry.orderId,
    ...(entry.loadId !== undefined ? { carregamento_id: entry.loadId } : {}),
    motorista_id: entry.driverId,
    data_entrega: entry.deliveryDate,
    valor_frete: entry.freightValue,
    valor_motorista: entry.driverValue,
    status: entry.status,
    atualizado_em: new Date().toISOString(),
  };

  const { error: lancError } = await supabaseOps.from('concrem_lancamentos_financeiros').upsert(payloadLancamento);
  if (lancError) {
    console.error('[Supabase OPS] upsert lancamentos_financeiros:', lancError.message, payloadLancamento);
    throw new Error(lancError.message);
  }

  // 2. Salvar as despesas vinculadas (apagando as antigas primeiro para simplificar a sincronização)
  await supabaseOps.from('concrem_lancamentos_despesas').delete().eq('lancamento_id', entry.id);

  if (entry.expenses.length > 0) {
    const payloadDespesas = entry.expenses.map(e => ({
      lancamento_id: entry.id,
      tipo_despesa_id: e.expenseTypeId,
      valor: e.value,
      observacao: e.note,
    }));
    
    const { error: despError } = await supabaseOps.from('concrem_lancamentos_despesas').insert(payloadDespesas);
    if (despError) {
      console.error('[Supabase OPS] insert lancamentos_despesas:', despError.message);
    }
  }
}

export async function deleteLancamentoFinanceiro(id: string) {
  if (!supabaseOps) return;
  const { error } = await supabaseOps.from('concrem_lancamentos_financeiros').delete().eq('id', id);
  if (error) {
    console.error('[Supabase OPS] delete lancamentos_financeiros:', error.message);
  }
}

// ==============================================================================
// Relatório de Entrega — Anexos
// ==============================================================================

export type RelatorioEntregaAnexo = {
  id: string;
  carregamento_id: string;
  pedido_id: string;
  tipo: string; // 'boleto' | 'nf' | 'comprovante'
  arquivo_nome: string;
  arquivo_url: string;
  criado_em: string;
  criado_por: string | null;
};

export async function upsertRelatorioEntregaAnexo(row: {
  carregamento_id: string;
  pedido_id: string;
  tipo: string;
  arquivo_nome: string;
  arquivo_url: string;
  criado_por: string | null;
}) {
  if (!supabaseOps) return;
  const { error } = await supabaseOps.from('concrem_relatorio_entrega_anexos').upsert(
    { ...row, criado_em: new Date().toISOString() },
    { onConflict: 'carregamento_id,pedido_id,tipo' },
  );
  if (error) {
    console.error('[Supabase OPS] upsert relatorio_entrega_anexos:', error.message);
  }
}

export async function listRelatorioEntregaAnexos(carregamentoId: string): Promise<RelatorioEntregaAnexo[]> {
  if (!supabaseOps) return [];
  const { data, error } = await supabaseOps
    .from('concrem_relatorio_entrega_anexos')
    .select('id, carregamento_id, pedido_id, tipo, arquivo_nome, arquivo_url, criado_em, criado_por')
    .eq('carregamento_id', carregamentoId);
  if (error) {
    console.error('[Supabase OPS] list relatorio_entrega_anexos:', error.message);
    return [];
  }
  return (data || []) as RelatorioEntregaAnexo[];
}

// ==============================================================================
// Relatório de Entrega — Notificações de Representantes
// ==============================================================================

export type RelatorioEntregaNotificacao = {
  id: string;
  carregamento_id: string;
  representante_key: string;
  representante_nome: string | null;
  notificado_em: string;
  previsao_entrega: string | null;
  criado_por: string | null;
};

export async function upsertRelatorioEntregaNotificacao(row: {
  carregamento_id: string;
  representante_key: string;
  representante_nome: string | null;
  previsao_entrega: string | null;
  criado_por: string | null;
}) {
  if (!supabaseOps) return;
  const { error } = await supabaseOps
    .from('concrem_relatorio_entrega_notificacoes')
    .upsert(
      { ...row, notificado_em: new Date().toISOString() },
      { onConflict: 'carregamento_id,representante_key' },
    );
  if (error) {
    console.error('[Supabase OPS] upsert relatorio_entrega_notificacoes:', error.message);
  }
}

export async function listRelatorioEntregaNotificacoes(
  carregamentoId: string,
): Promise<RelatorioEntregaNotificacao[]> {
  if (!supabaseOps) return [];
  const { data, error } = await supabaseOps
    .from('concrem_relatorio_entrega_notificacoes')
    .select('id, carregamento_id, representante_key, representante_nome, notificado_em, previsao_entrega, criado_por')
    .eq('carregamento_id', carregamentoId);
  if (error) {
    console.error('[Supabase OPS] list relatorio_entrega_notificacoes:', error.message);
    return [];
  }
  return (data || []) as RelatorioEntregaNotificacao[];
}

export async function deleteCarregamentoRelatedData(carregamentoId: string): Promise<void> {
  if (!supabaseOps) return;
  const results = await Promise.all([
    supabaseOps.from('concrem_relatorio_entrega_anexos').delete().eq('carregamento_id', carregamentoId),
    supabaseOps.from('concrem_relatorio_entrega_notificacoes').delete().eq('carregamento_id', carregamentoId),
    supabaseOps.from('concrem_lancamentos_financeiros').delete().eq('carregamento_id', carregamentoId),
    desfazerProducaoConcluido(carregamentoId),
  ]);
  results.slice(0, 3).forEach(({ error }, i) => {
    if (error) console.error(`[Supabase OPS] deleteCarregamentoRelatedData[${i}]:`, error.message);
  });
}
