import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import { rowToOrder } from '@/lib/pedidoMapper';
import type { Order } from '@/types';

// Colunas reais da tabela-espelho de ERP (mesmo conjunto usado no carregamento
// inicial — ver AppContext.tableColumnsWithAddress). Mantidas aqui para a busca
// direta desacoplar o repo do contexto.
const ERP_COLS =
  'numero_pedido, id_nota_conf, cliente_codigo, cliente_nome, data_emissao, data_validade, total_pedido_venda, total_produtos, total_qtd, total_qtd_m3, peso_liquido_item, cliente_cidade, cliente_uf, cliente_fantasia, grupo_cliente, representante, ped_compra_cliente, previsao_embarque, frete, situacao_entrega, cliente_cep, cliente_endereco, cliente_bairro';
const ERP_TABLE = (import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE as string) || 'concrem_pedidos_venda';

// Busca pedidos DIRETO no banco (não limita ao conjunto carregado no app).
// Multi-termo: separa por vírgula / ponto-e-vírgula / quebra de linha; casa
// qualquer termo em número, cliente, código, grupo, representante ou fantasia.
export async function buscarPedidos(query: string, limit = 20): Promise<Order[]> {
  const tokens = query
    .split(/[,;\n]+/)
    .map((t) => t.trim().replace(/[(),%*]/g, ''))
    .filter(Boolean);
  if (tokens.length === 0) return [];
  const fields = ['numero_pedido', 'cliente_nome', 'cliente_codigo', 'grupo_cliente', 'representante', 'cliente_fantasia'];
  const orParts: string[] = [];
  for (const t of tokens) for (const f of fields) orParts.push(`${f}.ilike.%${t}%`);
  const { data, error } = await supabasePedidos
    .from(ERP_TABLE)
    .select(ERP_COLS)
    .or(orParts.join(','))
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => rowToOrder(r, ''));
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
export type OrigemVinculo = 'complemento' | 'manual';

export type VinculoMembro = {
  pedido_vinculado_id: string;
  origem: OrigemVinculo;
  criado_em: string;
  criado_por: string | null;
};

export type GrupoPedido =
  | { em_grupo: false; pedido: string }
  | {
      em_grupo: true;
      pedido: string;
      principal: string;
      posicao: 'principal' | 'vinculado';
      total: number;
      vinculados: VinculoMembro[];
    };

export type BloqueioVinculo = {
  pedido_id: string;
  motivo: 'auto_vinculo' | 'inexistente_ou_excluido' | 'e_principal_de_grupo' | 'ja_vinculado';
  grupo_atual?: string;
};

export type CriarVinculoItem = { pedido_id: string; origem: OrigemVinculo };

export type ConfirmacoesVinculo = {
  nao_sinalizado?: string[];        // pedidos vinculados sem ped_compra_cliente=COMPLEMENTO
  cliente_divergente?: string[];    // pedidos com cliente/grupo diferente do principal
};

// Busca pedidos por uma lista de numero_pedido (para enriquecer nomes de itens
// que estão fora do conjunto carregado no app).
export async function buscarPedidosPorNumeros(ids: string[]): Promise<Order[]> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return [];
  const { data, error } = await supabasePedidos.from(ERP_TABLE).select(ERP_COLS).in('numero_pedido', uniq);
  if (error) throw error;
  return (data ?? []).map((r: any) => rowToOrder(r, ''));
}

// Status operacional REAL dos pedidos (autoridade = concrem_pedidos_status).
// O status do ERP (rowToOrder) não reflete o fluxo interno (ex.: 'entregue').
export async function buscarStatusPedidos(ids: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return {};
  const { data, error } = await supabaseOps
    .from('concrem_pedidos_status')
    .select('pedido_id, status_atual')
    .in('pedido_id', uniq);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as any[]) out[r.pedido_id] = r.status_atual;
  return out;
}

// ─── Listar todos os vínculos ATIVOS (para a tabela de grupos existentes) ────
export type VinculoRow = {
  pedido_principal_id: string;
  pedido_vinculado_id: string;
  origem_vinculo: OrigemVinculo;
  criado_em: string;
  criado_por: string | null;
};

export async function listarVinculosAtivos(): Promise<VinculoRow[]> {
  const { data, error } = await supabaseOps
    .from('concrem_pedidos_vinculos')
    .select('pedido_principal_id, pedido_vinculado_id, origem_vinculo, criado_em, criado_por')
    .eq('ativo', true)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return (data ?? []) as VinculoRow[];
}

// ─── Leitura: resolve o grupo a partir de QUALQUER integrante ────────────────
export async function obterGrupoPedido(pedido: string): Promise<GrupoPedido> {
  const { data, error } = await supabaseOps.rpc('obter_grupo_pedido', { p_pedido: pedido });
  if (error) throw error;
  return data as GrupoPedido;
}

// ─── Criação atômica (cria grupo OU adiciona a grupo existente) ──────────────
// Retorna { ok:true, ... } ou, se algum pedido for inválido, { ok:false, bloqueios }.
export async function criarVinculos(
  principal: string,
  vinculados: CriarVinculoItem[],
  confirmacoes?: ConfirmacoesVinculo,
): Promise<
  | { ok: true; evento: string; principal: string; vinculados: string[] }
  | { ok: false; bloqueios: BloqueioVinculo[] }
  | { ok: false; error: string }
> {
  const { data, error } = await supabaseOps.rpc('criar_vinculos_pedidos', {
    p_principal: principal,
    p_vinculados: vinculados,
    p_confirmacoes: confirmacoes ?? {},
  });
  if (error) return { ok: false, error: error.message };
  const res = data as { ok: boolean; bloqueios?: BloqueioVinculo[]; evento?: string; principal?: string; vinculados?: string[] };
  if (!res?.ok) return { ok: false, bloqueios: res?.bloqueios ?? [] };
  return { ok: true, evento: res.evento ?? '', principal: res.principal ?? principal, vinculados: res.vinculados ?? [] };
}

// ─── Remover 1 vínculo (soft-delete) ─────────────────────────────────────────
export async function removerVinculo(pedidoVinculado: string, motivo?: string) {
  const { data, error } = await supabaseOps.rpc('remover_vinculo_pedido', {
    p_vinculado: pedidoVinculado,
    p_motivo: motivo ?? null,
  });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, data };
}

// ─── Dissolver grupo inteiro (motivo obrigatório) ────────────────────────────
export async function dissolverGrupo(principal: string, motivo: string) {
  const { data, error } = await supabaseOps.rpc('dissolver_grupo', {
    p_principal: principal,
    p_motivo: motivo,
  });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, data };
}

// ─── Transferir 1 vínculo de um grupo para outro (explícito, auditado) ───────
export async function transferirVinculo(pedidoVinculado: string, novoPrincipal: string, motivo?: string) {
  const { data, error } = await supabaseOps.rpc('transferir_vinculo_pedido', {
    p_vinculado: pedidoVinculado,
    p_novo_principal: novoPrincipal,
    p_motivo: motivo ?? null,
  });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, data };
}
