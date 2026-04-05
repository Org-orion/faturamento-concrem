import { supabaseOps } from '@/lib/supabase';

export type RepresentanteRow = {
  id: string;
  codigo_representante: string | null;
  nome: string | null;
  cpf: string | null;
  telefone_whatsapp: string | null;
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
  criado_em: string;
  atualizado_em: string;
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
    .from('representantes')
    .select('id,codigo_representante,nome,cpf,telefone_whatsapp,regiao_atuacao,endereco,criado_em,atualizado_em')
    .order('nome', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as RepresentanteRow[];
}

export async function insertRepresentante(payload: Partial<RepresentanteRow>) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('representantes')
    .insert([payload])
    .select('id,codigo_representante,nome,cpf,telefone_whatsapp,regiao_atuacao,endereco,criado_em,atualizado_em')
    .single();
  if (error) throw new Error(error.message);
  return data as RepresentanteRow;
}

export async function updateRepresentante(id: string, payload: Partial<RepresentanteRow>) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('representantes')
    .update(payload)
    .eq('id', id)
    .select('id,codigo_representante,nome,cpf,telefone_whatsapp,regiao_atuacao,endereco,criado_em,atualizado_em')
    .single();
  if (error) throw new Error(error.message);
  return data as RepresentanteRow;
}

export async function deleteRepresentante(id: string) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { error } = await supabaseOps.from('representantes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listMotoristas() {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('motoristas')
    .select('id,nome,cpf,telefone,cnh_numero,cnh_categoria,placa_veiculo,tipo_veiculo,volume_suportado_m3,peso_suportado_kg,criado_em,atualizado_em')
    .order('nome', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as MotoristaRow[];
}

export async function insertMotorista(payload: Partial<MotoristaRow>) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('motoristas')
    .insert([payload])
    .select('id,nome,cpf,telefone,cnh_numero,cnh_categoria,placa_veiculo,tipo_veiculo,volume_suportado_m3,peso_suportado_kg,criado_em,atualizado_em')
    .single();
  if (error) throw new Error(error.message);
  return data as MotoristaRow;
}

export async function updateMotorista(id: string, payload: Partial<MotoristaRow>) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('motoristas')
    .update(payload)
    .eq('id', id)
    .select('id,nome,cpf,telefone,cnh_numero,cnh_categoria,placa_veiculo,tipo_veiculo,volume_suportado_m3,peso_suportado_kg,criado_em,atualizado_em')
    .single();
  if (error) throw new Error(error.message);
  return data as MotoristaRow;
}

export async function deleteMotorista(id: string) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { error } = await supabaseOps.from('motoristas').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listUsuarios() {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  // Try with paginas_acesso first; fall back if the column doesn't exist yet
  const { data, error } = await supabaseOps
    .from('usuarios')
    .select('id,nome,email,senha_hash,perfil_acesso,ativo,paginas_acesso,criado_em,atualizado_em')
    .order('nome', { ascending: true });
  if (error) {
    if (error.message?.includes('paginas_acesso')) {
      // Column not yet created — fetch without it
      const fallback = await supabaseOps
        .from('usuarios')
        .select('id,nome,email,senha_hash,perfil_acesso,ativo,criado_em,atualizado_em')
        .order('nome', { ascending: true });
      if (fallback.error) throw new Error(fallback.error.message);
      return ((fallback.data || []) as any[]).map((r) => ({ ...r, paginas_acesso: null })) as UsuarioRow[];
    }
    throw new Error(error.message);
  }
  return (data || []) as UsuarioRow[];
}

export async function insertUsuario(payload: Partial<UsuarioRow>) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('usuarios')
    .insert([payload])
    .select('id,nome,email,senha_hash,perfil_acesso,ativo,paginas_acesso,criado_em,atualizado_em')
    .single();
  if (error) {
    if (error.message?.includes('paginas_acesso')) {
      const { paginas_acesso: _pa, ...rest } = payload as any;
      const fallback = await supabaseOps
        .from('usuarios')
        .insert([rest])
        .select('id,nome,email,senha_hash,perfil_acesso,ativo,criado_em,atualizado_em')
        .single();
      if (fallback.error) throw new Error(fallback.error.message);
      return { ...(fallback.data as any), paginas_acesso: null } as UsuarioRow;
    }
    throw new Error(error.message);
  }
  return data as UsuarioRow;
}

export async function updateUsuario(id: string, payload: Partial<UsuarioRow>) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { data, error } = await supabaseOps
    .from('usuarios')
    .update(payload)
    .eq('id', id)
    .select('id,nome,email,senha_hash,perfil_acesso,ativo,paginas_acesso,criado_em,atualizado_em')
    .single();
  if (error) {
    if (error.message?.includes('paginas_acesso')) {
      const { paginas_acesso: _pa, ...rest } = payload as any;
      const fallback = await supabaseOps
        .from('usuarios')
        .update(rest)
        .eq('id', id)
        .select('id,nome,email,senha_hash,perfil_acesso,ativo,criado_em,atualizado_em')
        .single();
      if (fallback.error) throw new Error(fallback.error.message);
      return { ...(fallback.data as any), paginas_acesso: null } as UsuarioRow;
    }
    throw new Error(error.message);
  }
  return data as UsuarioRow;
}

export async function deleteUsuario(id: string) {
  if (!supabaseOps) throw new Error('Supabase OPS não configurado');
  const { error } = await supabaseOps.from('usuarios').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
