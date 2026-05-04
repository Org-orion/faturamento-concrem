import { supabaseOps } from './supabase';
import { Funcionalidade, GRUPOS_PADRAO } from '@/types/permissions';

export type GrupoRow = {
  id: string;
  nome: string;
  descricao: string | null;
  is_system: boolean;
  funcionalidades: Funcionalidade[];
  criado_em: string;
};

// ─── Read ────────────────────────────────────────────────────────────────────

export async function listGrupos(): Promise<GrupoRow[]> {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('concrem_grupos')
    .select('id,nome,descricao,is_system,funcionalidades,criado_em')
    .order('nome', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as GrupoRow[];
}

export async function getGrupoById(id: string): Promise<GrupoRow | null> {
  if (!supabaseOps) return null;
  const { data, error } = await supabaseOps
    .from('concrem_grupos')
    .select('id,nome,descricao,is_system,funcionalidades,criado_em')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as GrupoRow;
}

// ─── Write ───────────────────────────────────────────────────────────────────

export async function createGrupo(payload: { nome: string; descricao?: string; funcionalidades: Funcionalidade[] }): Promise<GrupoRow> {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('concrem_grupos')
    .insert([{ nome: payload.nome, descricao: payload.descricao ?? null, is_system: false, funcionalidades: payload.funcionalidades }])
    .select('id,nome,descricao,is_system,funcionalidades,criado_em')
    .single();
  if (error) throw new Error(error.message);
  return data as GrupoRow;
}

export async function updateGrupo(id: string, payload: { nome?: string; descricao?: string; funcionalidades?: Funcionalidade[] }): Promise<GrupoRow> {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('concrem_grupos')
    .update(payload)
    .eq('id', id)
    .select('id,nome,descricao,is_system,funcionalidades,criado_em')
    .single();
  if (error) throw new Error(error.message);
  return data as GrupoRow;
}

export async function deleteGrupo(id: string): Promise<void> {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { error } = await supabaseOps.from('concrem_grupos').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Seed default groups if they don't exist ─────────────────────────────────

export async function initDefaultGrupos(): Promise<void> {
  if (!supabaseOps) return;
  const { data: existing } = await supabaseOps.from('concrem_grupos').select('nome');
  const existingNames = new Set((existing || []).map((r: any) => r.nome as string));
  const missing = GRUPOS_PADRAO.filter(g => !existingNames.has(g.nome));
  if (!missing.length) return;
  await supabaseOps.from('concrem_grupos').insert(
    missing.map(g => ({ nome: g.nome, descricao: g.descricao, is_system: g.is_system, funcionalidades: g.funcionalidades }))
  );
}
