import { supabaseOps } from '@/lib/supabase';
import { Funcionalidade, FuncionalidadesOverride } from '@/types/permissions';

export type RepresentanteRow = {
  id: string;
  codigo_representante: string | null;
  nome: string | null;
  cpf: string | null;
  telefone_whatsapp: string | null;
  telefone_whatsapp_2: string | null;
  telefone_whatsapp_3: string | null;
  regiao_atuacao: string | null;
  endereco: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type MotoristaRow = {
  id: string;
  nome: string | null;
  cpf: string | null;
  telefone: string | null;
  cnh_numero: string | null;
  cnh_categoria: string | null;
  placa_veiculo: string | null;
  tipo_veiculo: string | null;
  volume_suportado_m3: number | null;
  peso_suportado_kg: number | null;
  blacklisted: boolean | null;
  avaliacao_media: number | null;
  avaliacao_count: number | null;
  criado_em: string;
  atualizado_em: string;
};

export type MotoristaAvaliacaoRow = {
  id: string;
  motorista_id: string;
  estrelas: number;
  comentario: string | null;
  avaliado_por: string | null;
  criado_em: string;
};

export type UsuarioPerfilAcesso = 'faturamento' | 'administrador' | 'comercial' | 'producao' | 'logistica';

export type UsuarioRow = {
  id: string;
  nome: string | null;
  email: string | null;
  senha_hash: string | null;
  perfil_acesso: UsuarioPerfilAcesso | null;
  ativo: boolean;
  paginas_acesso: Array<{ route: string; actions: string[] }> | null;
  grupo_id: string | null;
  funcionalidades: Funcionalidade[] | FuncionalidadesOverride | null;
  criado_em: string;
  atualizado_em: string;
};

export const normalizeCpf = (value: string) => value.replace(/\D+/g, '');

export const safeJsonParse = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export async function listRepresentantes() {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('concrem_representantes')
    .select('id,codigo_representante,nome,cpf,telefone_whatsapp,telefone_whatsapp_2,telefone_whatsapp_3,regiao_atuacao,endereco,criado_em,atualizado_em')
    .order('nome', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as RepresentanteRow[];
}

export async function insertRepresentante(payload: Partial<RepresentanteRow>) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('concrem_representantes')
    .insert([payload])
    .select('id,codigo_representante,nome,cpf,telefone_whatsapp,telefone_whatsapp_2,telefone_whatsapp_3,regiao_atuacao,endereco,criado_em,atualizado_em')
    .single();
  if (error) throw new Error(error.message);
  return data as RepresentanteRow;
}

export async function updateRepresentante(id: string, payload: Partial<RepresentanteRow>) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('concrem_representantes')
    .update(payload)
    .eq('id', id)
    .select('id,codigo_representante,nome,cpf,telefone_whatsapp,telefone_whatsapp_2,telefone_whatsapp_3,regiao_atuacao,endereco,criado_em,atualizado_em')
    .single();
  if (error) throw new Error(error.message);
  return data as RepresentanteRow;
}

export async function deleteRepresentante(id: string) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { error } = await supabaseOps.from('concrem_representantes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

const MOTORISTA_COLS = 'id,nome,cpf,telefone,cnh_numero,cnh_categoria,placa_veiculo,tipo_veiculo,volume_suportado_m3,peso_suportado_kg,blacklisted,avaliacao_media,avaliacao_count,criado_em,atualizado_em';
const MOTORISTA_COLS_LEGACY = 'id,nome,cpf,telefone,cnh_numero,cnh_categoria,placa_veiculo,tipo_veiculo,volume_suportado_m3,peso_suportado_kg,criado_em,atualizado_em';

export async function listMotoristas() {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('concrem_motoristas')
    .select(MOTORISTA_COLS)
    .order('nome', { ascending: true });
  // Fallback: se as colunas de avaliação ainda não existirem no banco, busca sem elas
  if (error?.message?.includes('blacklisted') || error?.message?.includes('avaliacao')) {
    const fallback = await supabaseOps
      .from('concrem_motoristas')
      .select(MOTORISTA_COLS_LEGACY)
      .order('nome', { ascending: true });
    if (fallback.error) throw new Error(fallback.error.message);
    return ((fallback.data || []) as any[]).map(r => ({
      ...r, blacklisted: false, avaliacao_media: null, avaliacao_count: 0,
    })) as MotoristaRow[];
  }
  if (error) throw new Error(error.message);
  return (data || []) as MotoristaRow[];
}

export async function insertMotorista(payload: Partial<MotoristaRow>) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('concrem_motoristas')
    .insert([payload])
    .select(MOTORISTA_COLS)
    .single();
  if (error) throw new Error(error.message);
  return data as MotoristaRow;
}

export async function updateMotorista(id: string, payload: Partial<MotoristaRow>) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('concrem_motoristas')
    .update(payload)
    .eq('id', id)
    .select(MOTORISTA_COLS)
    .single();
  if (error) throw new Error(error.message);
  return data as MotoristaRow;
}

export async function deleteMotorista(id: string) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { error } = await supabaseOps.from('concrem_motoristas').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setMotoristaBlacklisted(id: string, blacklisted: boolean) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('concrem_motoristas')
    .update({ blacklisted })
    .eq('id', id)
    .select(MOTORISTA_COLS)
    .single();
  if (error) throw new Error(error.message);
  return data as MotoristaRow;
}

export async function insertMotoristaAvaliacao(
  motoristaId: string,
  estrelas: number,
  comentario: string | null,
  avaliadoPor: string | null,
) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('concrem_motoristas_avaliacoes')
    .insert([{ motorista_id: motoristaId, estrelas, comentario: comentario || null, avaliado_por: avaliadoPor }])
    .select('id,motorista_id,estrelas,comentario,avaliado_por,criado_em')
    .single();
  if (error) throw new Error(error.message);
  return data as MotoristaAvaliacaoRow;
}

export async function listMotoristaAvaliacoes(motoristaId: string) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('concrem_motoristas_avaliacoes')
    .select('id,motorista_id,estrelas,comentario,avaliado_por,criado_em')
    .eq('motorista_id', motoristaId)
    .order('criado_em', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as MotoristaAvaliacaoRow[];
}

export async function deleteMotoristaAvaliacao(id: string) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { error } = await supabaseOps.from('concrem_motoristas_avaliacoes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listUsuarios() {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  // Try with paginas_acesso first; fall back if the column doesn't exist yet
  const { data, error } = await supabaseOps
    .from('concrem_usuarios')
    .select('id,nome,email,senha_hash,perfil_acesso,ativo,paginas_acesso,grupo_id,funcionalidades,criado_em,atualizado_em')
    .order('nome', { ascending: true });
  if (error) {
    if (error.message?.includes('paginas_acesso')) {
      // Column not yet created — fetch without it
      const fallback = await supabaseOps
        .from('concrem_usuarios')
        .select('id,nome,email,senha_hash,perfil_acesso,ativo,grupo_id,criado_em,atualizado_em')
        .order('nome', { ascending: true });
      if (fallback.error) throw new Error(fallback.error.message);
      return ((fallback.data || []) as any[]).map((r) => ({ ...r, paginas_acesso: null, grupo_id: null, funcionalidades: null })) as UsuarioRow[];
    }
    throw new Error(error.message);
  }
  return (data || []) as UsuarioRow[];
}

export async function insertUsuario(payload: Partial<UsuarioRow>) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('concrem_usuarios')
    .insert([payload])
    .select('id,nome,email,senha_hash,perfil_acesso,ativo,paginas_acesso,grupo_id,funcionalidades,criado_em,atualizado_em')
    .single();
  if (error) {
    if (error.message?.includes('paginas_acesso')) {
      const { paginas_acesso: _pa, ...rest } = payload as any;
      const fallback = await supabaseOps
        .from('concrem_usuarios')
        .insert([rest])
        .select('id,nome,email,senha_hash,perfil_acesso,ativo,grupo_id,criado_em,atualizado_em')
        .single();
      if (fallback.error) throw new Error(fallback.error.message);
      return { ...(fallback.data as any), paginas_acesso: null, grupo_id: null, funcionalidades: null } as UsuarioRow;
    }
    throw new Error(error.message);
  }
  return data as UsuarioRow;
}

export async function updateUsuario(id: string, payload: Partial<UsuarioRow>) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('concrem_usuarios')
    .update(payload)
    .eq('id', id)
    .select('id,nome,email,senha_hash,perfil_acesso,ativo,paginas_acesso,grupo_id,funcionalidades,criado_em,atualizado_em')
    .single();
  if (error) {
    if (error.message?.includes('paginas_acesso')) {
      const { paginas_acesso: _pa, ...rest } = payload as any;
      const fallback = await supabaseOps
        .from('concrem_usuarios')
        .update(rest)
        .eq('id', id)
        .select('id,nome,email,senha_hash,perfil_acesso,ativo,grupo_id,criado_em,atualizado_em')
        .single();
      if (fallback.error) throw new Error(fallback.error.message);
      return { ...(fallback.data as any), paginas_acesso: null, grupo_id: null, funcionalidades: null } as UsuarioRow;
    }
    throw new Error(error.message);
  }
  return data as UsuarioRow;
}

export async function deleteUsuario(id: string) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { error } = await supabaseOps.from('concrem_usuarios').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
