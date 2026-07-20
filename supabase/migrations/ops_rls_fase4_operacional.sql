-- ============================================================================
-- FASE 4 — RLS das tabelas OPERACIONAIS (VERSÃO FINAL — pode aplicar).
-- Supersede ops_rls_fase4_operacional.DRAFT.sql.
--
-- Gate atendido: login é Auth-only e o Painel TV é sempre acessado logado
-- (decisão do dono). Logo, NENHUM fluxo depende de acesso anônimo → tranca-se
-- tudo para `authenticated`, sem exceções para anon.
--
-- Cobre todas as tabelas operacionais + ERP (só leitura) + auditoria. Já
-- tratadas em outros estágios (NÃO repetir aqui): concrem_usuarios,
-- concrem_grupos (Estágio 3) e concrem_pedido_exclusao_historico (Fase 5).
--
-- service_role (sync do ERP, jobs) IGNORA RLS — não é afetado.
-- Recomendado aplicar e testar os fluxos principais logo após.
-- ROLLBACK por tabela: alter table public.<t> disable row level security;
-- ============================================================================

-- ── TIER 1 — ERP (somente leitura para o app) ───────────────────────────────
alter table if exists public.concrem_pedidos_venda enable row level security;
drop policy if exists pedidos_venda_select_auth on public.concrem_pedidos_venda;
create policy pedidos_venda_select_auth
  on public.concrem_pedidos_venda
  for select to authenticated using (true);
-- Sem INSERT/UPDATE/DELETE → escrita só via service_role (sync).

-- ── TIER 2 — Operacionais (CRUD para authenticated; anon negado) ─────────────
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
    raise notice 'RLS + policy authenticated: %', t;
  end loop;
end $$;

-- ── TIER 3 — Auditoria / histórico (append-only: INSERT + SELECT) ────────────
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

-- ── VERIFICAÇÃO ──────────────────────────────────────────────────────────────
-- RLS ligado em tudo:
--   select relname, relrowsecurity from pg_class
--   where relnamespace='public'::regnamespace and relname like 'concrem_%'
--   order by relname;
-- Com a anon key, nenhuma dessas tabelas deve retornar linhas.
-- Logado no app: Pedidos, Carregamento, Financeiro, Produção, Painel TV etc.
-- devem continuar carregando normalmente.
-- ============================================================================
