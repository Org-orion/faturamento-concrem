-- ============================================================================
-- FASE 4.1 + FASE 6 — CUTOVER DE LOGIN (RASCUNHO — NÃO APLICAR AINDA)
-- ============================================================================
--
-- ⚠️  GATE OBRIGATÓRIO: só aplicar quando concrem_usuarios.ultimo_login_metodo
--     = 'auth' para TODOS os usuários ativos (nenhum 'legado'/null) por ~1-2
--     semanas. Isto TRANCA concrem_usuarios para anon; quem ainda usa o
--     fallback legado (que permanece `anon`) fica sem login. Ver
--     ops_auth_login_metrica.sql.
--
-- ⚠️  ACOMPANHA uma mudança de CÓDIGO (AppContext.login) que:
--       1) faz signInWithPassword direto com o e-mail digitado (sem pré-select);
--       2) busca o perfil via RPC meu_perfil() (não lê mais concrem_usuarios
--          direto, não baixa senha_hash);
--       3) remove o fallback legado (verifyPassword/senha_hash) e o seed local.
--     SQL e código devem ir JUNTOS (deploy coordenado). Tenha um admin já no
--     Auth ("usuário de vidro") antes de aplicar, para não se trancar fora.
--
-- ────────────────────────────────────────────────────────────────────────────
-- 1) RPC de perfil do usuário autenticado (SECURITY DEFINER, sem senha_hash)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.meu_perfil()
returns table (
  id             uuid,
  nome           text,
  email          text,      -- "username" (coluna email guarda o login)
  auth_email     text,
  perfil_acesso  text,
  grupo_id       uuid,
  funcionalidades jsonb,
  ativo          boolean
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

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Trancar concrem_usuarios (fim da exposição de senha_hash ao anon)
--    authenticated lê só a própria linha; admin gerencia todos; anon: nada.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.concrem_usuarios enable row level security;

drop policy if exists usuarios_select_own on public.concrem_usuarios;
create policy usuarios_select_own
  on public.concrem_usuarios
  for select to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists usuarios_admin_all on public.concrem_usuarios;
create policy usuarios_admin_all
  on public.concrem_usuarios
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on table public.concrem_usuarios from anon;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) concrem_grupos: leitura p/ authenticated (resolver funcionalidades),
--    escrita só admin. anon: nada.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.concrem_grupos enable row level security;

drop policy if exists grupos_select_auth on public.concrem_grupos;
create policy grupos_select_auth
  on public.concrem_grupos
  for select to authenticated using (true);

drop policy if exists grupos_admin_write on public.concrem_grupos;
create policy grupos_admin_write
  on public.concrem_grupos
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on table public.concrem_grupos from anon;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) FASE 6 — remover senha_hash (IRREVERSÍVEL — rodar só por último, com backup,
--    depois de confirmar que o código Auth-only está no ar e estável).
-- ────────────────────────────────────────────────────────────────────────────
-- alter table public.concrem_usuarios drop column if exists senha_hash;

-- ────────────────────────────────────────────────────────────────────────────
-- VERIFICAÇÃO:
--   -- perfil do usuário logado (rodar autenticado no app / via SDK):
--   select * from public.meu_perfil();
--   -- anon NÃO deve mais ler concrem_usuarios:
--   --   (com a anon key) select * from concrem_usuarios  → 0 linhas / negado.
--   select tablename, policyname, cmd, roles from pg_policies
--   where schemaname='public' and tablename in ('concrem_usuarios','concrem_grupos');
--
-- ROLLBACK (se o login quebrar):
--   alter table public.concrem_usuarios disable row level security;
--   alter table public.concrem_grupos   disable row level security;
--   -- e reverter o deploy de código (voltar ao login com fallback legado).
--
-- ────────────────────────────────────────────────────────────────────────────
-- RISCOS DE CÓDIGO A TRATAR NO MESMO DEPLOY (senão quebra p/ não-admin):
--   R1) AppContext.tsx: `useEffect(() => { void initDefaultGrupos(); }, [])`
--       roda em TODO load. initDefaultGrupos JÁ lê-antes e só insere o que
--       falta — como os 5 grupos padrão existem em prod, retorna sem escrever
--       (benigno). Risco só se faltar um grupo padrão E um não-admin logar:
--       aí o insert falha por RLS. Recomendado: chamar só p/ admin (ou semear
--       via service_role fora do app) para eliminar de vez.
--   R2) Login (AppContext ~L651/L713): hoje faz select anon em concrem_usuarios
--       por e-mail + baixa senha_hash. Trocar por: signInWithPassword(email,
--       senha) direto → rpc('meu_perfil') → buildProfileFromRow(row). Remover
--       o pré-select anon, o fallback verifyPassword(senha_hash) e o seed local.
--   R3) Users page (cadastrosOps.ts): lista/edita TODOS os usuários. OK — é
--       admin-only (funcionalidade usuarios.view) e a policy usuarios_admin_all
--       cobre. Confirmar que nenhuma tela de não-admin lê OUTROS usuários.
-- ============================================================================
