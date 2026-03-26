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

export async function upsertProgramacaoCarregamento(load: Load) {
  if (!supabaseOps) return;
  const payload = {
    id: load.id,
    pedidos: load.orderIds,
    status: toOpsStatus(load),
    criado_em: load.createdAt,
    criado_por: load.createdBy,
    driver_id: load.driverId,
    planned_date: load.plannedDate,
    obs: load.obs,
    estimated_weight: load.estimatedWeight,
    freight_value: load.freightValue,
    production_status: load.productionStatus,
    shipment_status: load.shipmentStatus,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseOps.from('programacoes_embarque').upsert(payload);
  if (error) {
    console.error('[Supabase OPS] upsert programacoes_embarque:', error.message);
  }
}

export async function deleteProgramacaoCarregamento(id: string) {
  if (!supabaseOps) return;
  const { error } = await supabaseOps.from('programacoes_embarque').delete().eq('id', id);
  if (error) {
    console.error('[Supabase OPS] delete programacoes_embarque:', error.message);
  }
}

export async function insertProducaoConfirmacao(programacaoId: string, confirmadoPor: string, observacao?: string) {
  if (!supabaseOps) return;
  const { error } = await supabaseOps.from('producao_confirmacoes').insert({
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
    .from('producao_concluidos')
    .select('*')
    .eq('desfeito', false)
    .order('data_conclusao', { ascending: false });
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
  const { error } = await supabaseOps.from('producao_concluidos').insert({
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
    .from('producao_concluidos')
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
  const { error } = await supabaseOps.from('entregas').upsert(rows, { onConflict: 'programacao_id,pedido_id' });
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
  const { error } = await supabaseOps.from('entregas').upsert(payload as any, { onConflict: 'programacao_id,pedido_id' });
  if (error) {
    console.error('[Supabase OPS] upsert entregas (detalhes):', error.message);
  }
}

export async function upsertEntregasDetalhesSafe(programacaoId: string, rows: Array<{ pedido_id: string; status: 'pendente' | 'entregue'; entregue_em?: string | null; numero_nota?: string | null; ordem_entrega?: number | null; }>) {
  if (!supabaseOps) return;
  const payload = rows.map((r) => ({
    programacao_id: programacaoId,
    pedido_id: r.pedido_id,
    status: r.status,
    entregue_em: r.entregue_em ?? (r.status === 'entregue' ? new Date().toISOString() : null),
    numero_nota: r.numero_nota ?? null,
    ordem_entrega: r.ordem_entrega ?? null,
  }));
  const { error } = await supabaseOps.from('entregas').upsert(payload as any, { onConflict: 'programacao_id,pedido_id' });
  if (!error) return;
  const msg = String(error.message || '');
  if (msg.includes('numero_nota') || msg.includes('ordem_entrega')) {
    const basic = rows.map((r) => ({
      programacao_id: programacaoId,
      pedido_id: r.pedido_id,
      status: r.status,
      entregue_em: r.entregue_em ?? (r.status === 'entregue' ? new Date().toISOString() : null),
    }));
    const { error: basicError } = await supabaseOps.from('entregas').upsert(basic as any, { onConflict: 'programacao_id,pedido_id' });
    if (basicError) {
      console.error('[Supabase OPS] upsert entregas (fallback):', basicError.message);
    }
    return;
  }
  console.error('[Supabase OPS] upsert entregas (detalhes):', error.message);
}

export async function findRepresentanteContato(representanteIdOrName: string) {
  if (!supabaseOps) return null;
  const key = String(representanteIdOrName || '').trim();
  if (!key) return null;

  const digits = key.replace(/\D+/g, '');
  const digitsNoZero = digits.replace(/^0+/, '');
  const select = 'codigo_representante,nome,telefone_whatsapp,endereco';

  if (digits) {
    const orParts = [
      `codigo_representante.eq.${key}`,
      `codigo_representante.eq.${digits}`,
      digitsNoZero ? `codigo_representante.eq.${digitsNoZero}` : '',
      `codigo_representante.ilike.%${digits}`,
      digitsNoZero ? `codigo_representante.ilike.%${digitsNoZero}` : '',
    ].filter(Boolean);

    const { data, error } = await supabaseOps
      .from('representantes')
      .select(select)
      .or(orParts.join(','))
      .limit(20);

    if (!error && data && data.length) {
      const keyLower = key.toLowerCase();
      const ranked = data
        .map((r: any) => {
          const code = String(r.codigo_representante || '').trim();
          const codeDigits = code.replace(/\D+/g, '');
          const codeNoZero = codeDigits.replace(/^0+/, '');
          const name = String(r.nome || '').trim();
          const nameLower = name.toLowerCase();

          let score = 0;
          if (code === key) score += 100;
          if (digits && codeDigits === digits) score += 90;
          if (digitsNoZero && codeNoZero === digitsNoZero) score += 80;
          if (digits && codeDigits.endsWith(digits)) score += 70;
          if (digitsNoZero && codeNoZero.endsWith(digitsNoZero)) score += 60;
          if (nameLower && keyLower && nameLower.includes(keyLower)) score += 30;

          return { r, score };
        })
        .sort((a, b) => b.score - a.score);

      const best = ranked[0]?.r;
      if (best) {
        return {
          codigo: (best.codigo_representante as string | null) ?? null,
          nome: (best.nome as string | null) ?? null,
          telefone: (best.telefone_whatsapp as string | null) ?? null,
          endereco: (best.endereco as string | null) ?? null,
        };
      }
    }
  }

  const { data: byName, error: nameError } = await supabaseOps
    .from('representantes')
    .select(select)
    .ilike('nome', `%${key}%`)
    .limit(5);

  if (!nameError && byName && byName.length) {
    const best = byName[0] as any;
    return {
      codigo: (best.codigo_representante as string | null) ?? null,
      nome: (best.nome as string | null) ?? null,
      telefone: (best.telefone_whatsapp as string | null) ?? null,
      endereco: (best.endereco as string | null) ?? null,
    };
  }

  return null;
}

export async function insertNotificacaoRepresentante(programacaoId: string, representante: string) {
  if (!supabaseOps) return;
  const { error } = await supabaseOps.from('notificacoes_representantes').insert({
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
  const { error } = await supabaseOps.from('comercial_pedidos_meta').upsert(payload);
  if (error) {
    console.error('[Supabase OPS] upsert comercial_pedidos_meta:', error.message);
  }
}

export async function insertComercialPedidoAcao(row: {
  pedido_id: string;
  acao: 'editar' | 'liberar' | 'observacao' | 'notificar_whatsapp';
  criado_por: string;
  payload?: any;
}) {
  if (!supabaseOps) return;
  const { error } = await supabaseOps.from('comercial_pedidos_acoes').insert({
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
  const { error } = await supabaseOps.from('notificacoes_representantes_pedidos').insert({
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
  const { data, error } = await supabaseOps.from('tipos_despesa').select('*').order('nome', { ascending: true });
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
  const { error } = await supabaseOps.from('tipos_despesa').upsert(payload);
  if (error) {
    console.error('[Supabase OPS] upsert tipos_despesa:', error.message);
  }
}

export async function listLancamentosFinanceiros() {
  if (!supabaseOps) return [];
  
  const { data: lancamentos, error: lancError } = await supabaseOps
    .from('lancamentos_financeiros')
    .select(`
      *,
      lancamentos_despesas (
        id,
        tipo_despesa_id,
        valor,
        observacao
      )
    `)
    .order('criado_em', { ascending: false });

  if (lancError) {
    console.error('[Supabase OPS] list lancamentos_financeiros:', lancError.message);
    return [];
  }

  return (lancamentos || []).map((row: any) => ({
    id: row.id,
    orderId: row.pedido_id,
    driverId: row.motorista_id,
    deliveryDate: row.data_entrega,
    freightValue: Number(row.valor_frete || 0),
    driverValue: Number(row.valor_motorista || 0),
    status: row.status as FreightEntry['status'],
    createdAt: row.criado_em,
    expenses: (row.lancamentos_despesas || []).map((d: any) => ({
      expenseTypeId: d.tipo_despesa_id,
      value: Number(d.valor || 0),
      note: d.observacao || '',
    })),
  })) as FreightEntry[];
}

export async function upsertLancamentoFinanceiro(entry: FreightEntry) {
  if (!supabaseOps) return;
  
  // 1. Salvar o lançamento principal
  const payloadLancamento = {
    id: entry.id,
    pedido_id: entry.orderId,
    motorista_id: entry.driverId,
    data_entrega: entry.deliveryDate,
    valor_frete: entry.freightValue,
    valor_motorista: entry.driverValue,
    status: entry.status,
    atualizado_em: new Date().toISOString(),
  };

  const { error: lancError } = await supabaseOps.from('lancamentos_financeiros').upsert(payloadLancamento);
  if (lancError) {
    console.error('[Supabase OPS] upsert lancamentos_financeiros:', lancError.message);
    return;
  }

  // 2. Salvar as despesas vinculadas (apagando as antigas primeiro para simplificar a sincronização)
  await supabaseOps.from('lancamentos_despesas').delete().eq('lancamento_id', entry.id);

  if (entry.expenses.length > 0) {
    const payloadDespesas = entry.expenses.map(e => ({
      lancamento_id: entry.id,
      tipo_despesa_id: e.expenseTypeId,
      valor: e.value,
      observacao: e.note,
    }));
    
    const { error: despError } = await supabaseOps.from('lancamentos_despesas').insert(payloadDespesas);
    if (despError) {
      console.error('[Supabase OPS] insert lancamentos_despesas:', despError.message);
    }
  }
}

export async function deleteLancamentoFinanceiro(id: string) {
  if (!supabaseOps) return;
  const { error } = await supabaseOps.from('lancamentos_financeiros').delete().eq('id', id);
  if (error) {
    console.error('[Supabase OPS] delete lancamentos_financeiros:', error.message);
  }
}
