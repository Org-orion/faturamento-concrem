-- ============================================================
-- Lixeira de Pedidos — exclusão lógica + restauração (30 dias), admin-only.
-- Requer a migração ops_auth_supabase_fundacao.sql (is_admin(), auth_user_id).
-- Aplicar no SQL Editor do Supabase.
--
-- Exclusão lógica vive em concrem_pedidos_status (tabela OWNED pelo app),
-- NÃO na ERP concrem_pedidos_venda (somente leitura/sincronizada).
-- ============================================================

-- 1) Campos de exclusão lógica em concrem_pedidos_status
alter table if exists public.concrem_pedidos_status
  add column if not exists excluido_em        timestamptz null,
  add column if not exists excluido_por        uuid null,          -- auth.users.id (via auth.uid())
  add column if not exists excluido_por_nome   text null,          -- nome do admin (para exibição)
  add column if not exists motivo_exclusao     text null;

create index if not exists idx_pedidos_status_excluido_em
  on public.concrem_pedidos_status (excluido_em);

-- 2) Auditoria de exclusão/restauração (append-only)
create table if not exists public.concrem_pedido_exclusao_historico (
  id                 bigint generated always as identity primary key,
  pedido_id          text not null,
  acao               text not null check (acao in ('EXCLUIDO','RESTAURADO')),
  motivo             text null,
  status_anterior    text null,
  realizado_por      uuid null,
  realizado_por_nome text null,
  realizado_em       timestamptz not null default now()
);
create index if not exists idx_pedido_exclusao_hist_pedido on public.concrem_pedido_exclusao_historico (pedido_id);

-- 3) RPC: excluir logicamente (atômica, admin-only, motivo obrigatório)
create or replace function public.excluir_pedido(p_pedido_id text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_nome text; v_status text;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado: apenas administradores podem excluir pedidos.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da exclusão.' using errcode = '22023';
  end if;

  select nome into v_nome from public.concrem_usuarios where auth_user_id = v_uid limit 1;
  select status_atual into v_status from public.concrem_pedidos_status where pedido_id = p_pedido_id;

  update public.concrem_pedidos_status
    set excluido_em = now(), excluido_por = v_uid, excluido_por_nome = v_nome, motivo_exclusao = p_motivo
    where pedido_id = p_pedido_id and excluido_em is null;
  if not found then
    raise exception 'Pedido inexistente na base operacional ou já excluído.' using errcode = 'P0002';
  end if;

  insert into public.concrem_pedido_exclusao_historico(pedido_id, acao, motivo, status_anterior, realizado_por, realizado_por_nome)
    values (p_pedido_id, 'EXCLUIDO', p_motivo, v_status, v_uid, v_nome);
end; $$;

-- 4) RPC: restaurar (atômica, admin-only, dentro de 30 dias)
create or replace function public.restaurar_pedido(p_pedido_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_nome text; v_status text;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado: apenas administradores podem restaurar pedidos.' using errcode = '42501';
  end if;

  select nome into v_nome from public.concrem_usuarios where auth_user_id = v_uid limit 1;
  select status_atual into v_status from public.concrem_pedidos_status where pedido_id = p_pedido_id;

  update public.concrem_pedidos_status
    set excluido_em = null, excluido_por = null, excluido_por_nome = null, motivo_exclusao = null
    where pedido_id = p_pedido_id
      and excluido_em is not null
      and excluido_em > now() - interval '30 days';
  if not found then
    raise exception 'Pedido não está excluído ou o prazo de 30 dias para restauração expirou.' using errcode = 'P0002';
  end if;

  insert into public.concrem_pedido_exclusao_historico(pedido_id, acao, motivo, status_anterior, realizado_por, realizado_por_nome)
    values (p_pedido_id, 'RESTAURADO', null, v_status, v_uid, v_nome);
end; $$;

-- 5) Segurança de execução: só usuários autenticados (admins reais via is_admin dentro da função)
revoke execute on function public.excluir_pedido(text, text) from public, anon;
revoke execute on function public.restaurar_pedido(text) from public, anon;
grant  execute on function public.excluir_pedido(text, text) to authenticated;
grant  execute on function public.restaurar_pedido(text) to authenticated;

-- 6) RLS da auditoria: leitura só para admin autenticado; escrita só via RPC (security definer)
alter table if exists public.concrem_pedido_exclusao_historico enable row level security;
drop policy if exists exclusao_hist_select_admin on public.concrem_pedido_exclusao_historico;
create policy exclusao_hist_select_admin on public.concrem_pedido_exclusao_historico
  for select to authenticated using (public.is_admin());
grant select on table public.concrem_pedido_exclusao_historico to authenticated;
