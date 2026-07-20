-- ============================================================================
-- CUTOVER — Estágio 3: trancar concrem_usuarios e concrem_grupos (revoke anon).
-- Fim da exposição de senha_hash/perfis/permissões ao anon (chave pública).
--
-- Pré-requisitos (OK): login já é Auth-only (meu_perfil SECURITY DEFINER ignora
-- RLS, então o login continua funcionando); ambos os admins confirmados no Auth.
-- NÃO faz drop de senha_hash — isso é o Estágio 4 (rodar só depois, com backup).
--
-- Recuperação se alguém não conseguir entrar após isto: resetar a senha do
-- usuário no dashboard do Supabase (Auth → Users). Reverter o deploy NÃO
-- restaura mais o fallback legado (a tabela estará trancada).
-- ============================================================================

-- ── concrem_usuarios: anon negado; authenticated lê só a própria linha;
--    admin (is_admin) gerencia todos ────────────────────────────────────────
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
-- Obs.: sem policy de UPDATE para não-admin (evita escalonamento de privilégio
-- via edição da própria linha). A métrica registrarLoginMetodo deixa de gravar
-- para não-admins após isto — tudo bem, já cumpriu o papel (gate).

-- ── concrem_grupos: leitura p/ authenticated (resolver funcionalidades no
--    login/meu_perfil); escrita só admin; anon negado ─────────────────────────
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

-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
-- 1) Logado no app: login continua funcionando; admin abre a tela de Usuários.
-- 2) Com a anon key, concrem_usuarios NÃO deve retornar linhas.
-- 3) Policies:
--    select tablename, policyname, cmd, roles from pg_policies
--    where schemaname='public' and tablename in ('concrem_usuarios','concrem_grupos');
--
-- ROLLBACK (se algo travar):
--   alter table public.concrem_usuarios disable row level security;
--   alter table public.concrem_grupos   disable row level security;
-- ============================================================================
