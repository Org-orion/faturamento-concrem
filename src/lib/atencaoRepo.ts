import { supabaseOps } from '@/lib/supabase';

export interface PedidoAtencao {
  id: number;
  pedido_id: string;
  motivo: string;
  criado_por: string | null;
  criado_em: string;
  ativo: boolean;
}

export async function listTodasAtencoes(): Promise<PedidoAtencao[]> {
  if (!supabaseOps) return [];
  const { data, error } = await supabaseOps
    .from('concrem_pedido_atencao')
    .select('*')
    .order('criado_em', { ascending: false });
  if (error) {
    console.error('[Supabase OPS] list todas pedido_atencao:', error.message);
    return [];
  }
  return (data || []) as PedidoAtencao[];
}

export async function listAtencaoAtiva(): Promise<PedidoAtencao[]> {
  if (!supabaseOps) return [];
  const { data, error } = await supabaseOps
    .from('concrem_pedido_atencao')
    .select('*')
    .eq('ativo', true)
    .order('criado_em', { ascending: false });
  if (error) {
    console.error('[Supabase OPS] list pedido_atencao:', error.message);
    return [];
  }
  return (data || []) as PedidoAtencao[];
}

export async function upsertAtencao(row: {
  pedido_id: string;
  motivo: string;
  criado_por: string | null;
}): Promise<PedidoAtencao | null> {
  if (!supabaseOps) return null;
  const { data, error } = await supabaseOps
    .from('concrem_pedido_atencao')
    .upsert(
      {
        pedido_id: row.pedido_id,
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
    console.error('[Supabase OPS] upsert pedido_atencao:', error.message);
    return null;
  }
  return data as PedidoAtencao;
}

export async function desativarAtencao(pedidoId: string): Promise<void> {
  if (!supabaseOps) return;
  const { error } = await supabaseOps
    .from('concrem_pedido_atencao')
    .update({ ativo: false })
    .eq('pedido_id', pedidoId);
  if (error) {
    console.error('[Supabase OPS] desativar pedido_atencao:', error.message);
  }
}
