-- ============================================================================
-- FASE 4 — RLS das tabelas OPERACIONAIS (RASCUNHO — NÃO APLICAR AINDA)
-- ============================================================================
--
-- ⚠️  PRÉ-REQUISITO (GATE): só rode DEPOIS que 100% dos usuários ativos
--     estiverem logando via Supabase Auth (concrem_usuarios.ultimo_login_metodo
--     = 'auth' para todos, sem 'legado'/null por ~1-2 semanas). Ver
--     ops_auth_login_metrica.sql. Habilitar RLS exigindo `authenticated`
--     DERRUBA qualquer usuário ainda no fallback legado (que permanece `anon`).
--
-- Escopo deste arquivo: tabelas operacionais, ERP (só leitura) e auditoria.
-- NÃO inclui concrem_usuarios / concrem_grupos — essas vão no cutover de login
-- (Fase 4.1 + Fase 6), num arquivo separado, por serem o ponto mais sensível.
--
-- Modelo de segurança:
--   • anon: sem acesso (RLS ligado, sem policy para anon).
--   • authenticated: CRUD nas operacionais (o controle FINO por funcionalidade
--     continua no app — o RLS aqui é o "chão": exige estar logado de verdade).
--   • ERP concrem_pedidos_venda: só SELECT (sync externo usa service_role, que
--     ignora RLS).
--   • Auditoria/histórico: append-only (INSERT + SELECT, sem UPDATE/DELETE).
--
-- IMPORTANTE: service_role (ETL/sync, jobs no servidor) IGNORA RLS — não é
-- afetado. Realtime (postgres_changes) passa a valer só para authenticated.
--
-- Rode UMA TABELA POR VEZ em staging/produção, testando o fluxo que a usa
-- antes de seguir. Rollback por tabela: `alter table X disable row level security`.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- TIER 1 — ERP (somente leitura para o app)
-- ────────────────────────────────────────────────────────────────────────────
alter table if exists public.concrem_pedidos_venda enable row level security;
drop policy if exists pedidos_venda_select_auth on public.concrem_pedidos_venda;
create policy pedidos_venda_select_auth
  on public.concrem_pedidos_venda
  for select to authenticated using (true);
-- Sem policies de INSERT/UPDATE/DELETE → escrita negada mesmo para authenticated.
-- (O sincronismo do ERP deve usar a service_role key, que ignora RLS.)

-- ────────────────────────────────────────────────────────────────────────────
-- TIER 2 — Operacionais (CRUD para authenticated)
-- Uma policy FOR ALL por tabela. anon fica sem acesso (nenhuma policy p/ anon).
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  operacionais text[] := array[
    'concrem_pedidos_status',
    'concrem_programacoes_embarque',
    'concrem_entregas',
    'concrem_comercial_pedidos_acoes',
    'concrem_comercial_pedidos_meta',
    'concrem_producao_confirmacoes',
    'concrem_producao_concluidos',
    'concrem_lancamentos_financeiros',
    'concrem_lancamentos_despesas',
    'concrem_tipos_despesa',
    'concrem_protocolos_financeiros',
    'concrem_protocolos_pedidos',
    'concrem_faturamento_metas',
    'concrem_faturamento_justificativas',
    'concrem_representantes',
    'concrem_motoristas',
    'concrem_motoristas_avaliacoes',
    'concrem_pedido_prioridades',
    'concrem_pedido_atencao',
    'concrem_notificacoes_representantes',
    'concrem_notificacoes_representantes_pedidos',
    'concrem_relatorio_entrega_anexos',
    'concrem_relatorio_entrega_notificacoes'
  ];
begin
  foreach t in array operacionais loop
    if to_regclass('public.' || t) is null then
      raise notice 'tabela % nao existe — pulando', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_all_auth', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_all_auth', t
    );
    raise notice 'RLS ligado + policy authenticated: %', t;
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- TIER 3 — Auditoria / histórico (append-only: INSERT + SELECT)
-- ────────────────────────────────────────────────────────────────────────────
-- concrem_pedidos_status_historico
alter table if exists public.concrem_pedidos_status_historico enable row level security;
drop policy if exists status_hist_select_auth on public.concrem_pedidos_status_historico;
drop policy if exists status_hist_insert_auth on public.concrem_pedidos_status_historico;
create policy status_hist_select_auth
  on public.concrem_pedidos_status_historico
  for select to authenticated using (true);
create policy status_hist_insert_auth
  on public.concrem_pedidos_status_historico
  for insert to authenticated with check (true);
-- Sem UPDATE/DELETE → histórico imutável pelo app.

-- concrem_pedido_exclusao_historico: JÁ tratada na Fase 5 (ops_pedidos_lixeira.sql)
--   — SELECT só admin; INSERT só via RPC SECURITY DEFINER. Não mexer aqui.

-- ────────────────────────────────────────────────────────────────────────────
-- VERIFICAÇÃO (rodar após aplicar) — deve listar RLS habilitado nas tabelas:
--   select relname, relrowsecurity
--   from pg_class
--   where relnamespace = 'public'::regnamespace and relname like 'concrem_%'
--   order by relname;
--
-- Policies por tabela:
--   select tablename, policyname, cmd, roles
--   from pg_policies where schemaname = 'public' order by tablename, policyname;
--
-- ROLLBACK (por tabela, se algum fluxo quebrar):
--   alter table public.<tabela> disable row level security;
-- ============================================================================
