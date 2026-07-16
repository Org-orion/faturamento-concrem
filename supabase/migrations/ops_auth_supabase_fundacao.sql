-- ============================================================
-- Fundação da migração para Supabase Auth
-- Vincula concrem_usuarios ao auth.users e cria helper is_admin()
-- para uso nas RLS (role authenticated). Aplicar no SQL Editor do Supabase.
-- NÃO remove nada do fluxo atual — é aditivo e seguro.
-- ============================================================

-- 1) Vínculo perfil ↔ conta de autenticação
--    O login é por username (coluna `email` guarda o username, ex.: "adailton").
--    Como as contas no auth.users têm e-mails REAIS e individuais, guardamos o
--    e-mail de autenticação em `auth_email` e o id resolvido em `auth_user_id`.
alter table if exists public.concrem_usuarios
  add column if not exists auth_email text;

alter table if exists public.concrem_usuarios
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_concrem_usuarios_auth_user_id
  on public.concrem_usuarios (auth_user_id);

-- 2) Helper: o usuário autenticado (auth.uid()) é administrador ativo?
--    Admin = perfil_acesso 'administrador' OU pertence ao grupo 'Administrador'.
--    SECURITY DEFINER para poder ler concrem_usuarios independentemente da RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.concrem_usuarios u
    left join public.concrem_grupos g on g.id = u.grupo_id
    where u.auth_user_id = auth.uid()
      and coalesce(u.ativo, true) = true
      and (u.perfil_acesso = 'administrador' or g.nome = 'Administrador')
  );
$$;

-- 3) Helper opcional: id do perfil (concrem_usuarios) do usuário autenticado.
create or replace function public.current_usuario_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id from public.concrem_usuarios u where u.auth_user_id = auth.uid() limit 1;
$$;

-- Observação: a associação auth_user_id ↔ concrem_usuarios (por e-mail) deve ser
-- preenchida ao criar/importar as contas em auth.users (ver runbook, Fase 2).
