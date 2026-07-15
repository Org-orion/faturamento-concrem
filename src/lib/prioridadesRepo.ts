import { supabaseOps } from '@/lib/supabase';

export type NivelPrioridade = 'urgente' | 'alta' | 'media';

export interface PedidoPrioridade {
  id: number;
  pedido_id: string;
  nivel: NivelPrioridade;
  motivo: string;
  criado_por: string | null;
  criado_em: string;
  ativo: boolean;
  // Controle de atendimento (colunas adicionadas por migration; null-safe até aplicar)
  atendida?: boolean | null;
  atendida_em?: string | null;
  atendida_por?: string | null;
}

export async function listTodasPrioridades(): Promise<PedidoPrioridade[]> {
  if (!supabaseOps) return [];
  const { data, error } = await supabaseOps
    .from('concrem_pedido_prioridades')
    .select('*')
    .order('criado_em', { ascending: false });
  if (error) {
    console.error('[Supabase OPS] list todas pedido_prioridades:', error.message);
    return [];
  }
  return (data || []) as PedidoPrioridade[];
}

export async function listPrioridadesAtivas(): Promise<PedidoPrioridade[]> {
  if (!supabaseOps) return [];
  const { data, error } = await supabaseOps
    .from('concrem_pedido_prioridades')
    .select('*')
    .eq('ativo', true)
    .order('criado_em', { ascending: false });
  if (error) {
    console.error('[Supabase OPS] list pedido_prioridades:', error.message);
    return [];
  }
  return (data || []) as PedidoPrioridade[];
}

export async function upsertPrioridade(row: {
  pedido_id: string;
  nivel: NivelPrioridade;
  motivo: string;
  criado_por: string | null;
}): Promise<PedidoPrioridade | null> {
  if (!supabaseOps) return null;
  const { data, error } = await supabaseOps
    .from('concrem_pedido_prioridades')
    .upsert(
      {
        pedido_id: row.pedido_id,
        nivel: row.nivel,
        motivo: row.motivo,
        criado_por: row.criado_por,
        criado_em: new Date().toISOString(),
        ativo: true,
      },
      { onConflict: 'pedido_id' },
    )
    .select('*')
    .single();
  if (error) {
    console.error('[Supabase OPS] upsert pedido_prioridades:', error.message);
    return null;
  }
  return data as PedidoPrioridade;
}

/** Marca a prioridade do pedido como atendida (data/hora UTC + responsável). */
export async function marcarPrioridadeAtendida(pedidoId: string, atendidaPor: string | null): Promise<boolean> {
  if (!supabaseOps) return false;
  const { error } = await supabaseOps
    .from('concrem_pedido_prioridades')
    .update({ atendida: true, atendida_em: new Date().toISOString(), atendida_por: atendidaPor })
    .eq('pedido_id', pedidoId);
  if (error) {
    console.error('[Supabase OPS] marcar prioridade atendida:', error.message);
    return false;
  }
  return true;
}

/** Reabre a prioridade (volta a pendente, limpa data/responsável de atendimento). */
export async function reabrirPrioridade(pedidoId: string): Promise<boolean> {
  if (!supabaseOps) return false;
  const { error } = await supabaseOps
    .from('concrem_pedido_prioridades')
    .update({ atendida: false, atendida_em: null, atendida_por: null })
    .eq('pedido_id', pedidoId);
  if (error) {
    console.error('[Supabase OPS] reabrir prioridade:', error.message);
    return false;
  }
  return true;
}

export async function desativarPrioridade(pedidoId: string): Promise<void> {
  if (!supabaseOps) return;
  const { error } = await supabaseOps
    .from('concrem_pedido_prioridades')
    .update({ ativo: false })
    .eq('pedido_id', pedidoId);
  if (error) {
    console.error('[Supabase OPS] desativar pedido_prioridades:', error.message);
  }
}
