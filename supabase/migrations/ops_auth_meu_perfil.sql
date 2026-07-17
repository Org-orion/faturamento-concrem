-- ============================================================================
-- CUTOVER — Estágio 1 (ADITIVO e SEGURO — pode aplicar já).
-- RPC meu_perfil(): retorna o perfil do usuário autenticado (auth.uid()) SEM
-- expor senha_hash. Usada pelo login Auth-only (não lê mais concrem_usuarios
-- direto pelo cliente). Não tranca nada — o lock de RLS vem no Estágio 3.
-- ============================================================================
create or replace function public.meu_perfil()
returns table (
  id              uuid,
  nome            text,
  email           text,      -- "username" (coluna email guarda o login)
  auth_email      text,
  perfil_acesso   text,
  grupo_id        uuid,
  funcionalidades jsonb,
  ativo           boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.nome, u.email, u.auth_email, u.perfil_acesso,
         u.grupo_id, u.funcionalidades::jsonb, u.ativo
  from public.concrem_usuarios u
  where u.auth_user_id = auth.uid()
    and coalesce(u.ativo, true) = true
  limit 1;
$$;

revoke execute on function public.meu_perfil() from public, anon;
grant  execute on function public.meu_perfil() to authenticated;

-- Verificação (autenticado): select * from public.meu_perfil();
