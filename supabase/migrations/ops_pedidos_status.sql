create table if not exists public.pedidos_status (
  id uuid primary key default gen_random_uuid(),
  pedido_id text not null,
  numero_pedido text not null,
  status_atual text not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  criado_em timestamptz not null default now(),
  unique (pedido_id)
);

create table if not exists public.pedidos_status_historico (
  id uuid primary key default gen_random_uuid(),
  pedido_id text not null,
  numero_pedido text not null,
  status_anterior text,
  status_novo text not null,
  alterado_em timestamptz not null default now(),
  alterado_por text,
  observacao text,
  notificado_representante boolean not null default false,
  notificado_em timestamptz,
  notificacao_provider_id text,
  notificacao_erro text
);

-- Drop status check constraints (validation is handled at the application layer)
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'pedidos_status_status_atual_check'
  ) then
    alter table public.pedidos_status drop constraint pedidos_status_status_atual_check;
  end if;

  if exists (
    select 1 from pg_constraint where conname = 'pedidos_status_historico_status_novo_check'
  ) then
    alter table public.pedidos_status_historico drop constraint pedidos_status_historico_status_novo_check;
  end if;
end $$;

create index if not exists pedidos_status_idx_numero_pedido on public.pedidos_status (numero_pedido);
create index if not exists pedidos_status_historico_idx_pedido on public.pedidos_status_historico (pedido_id, alterado_em desc);

alter table public.pedidos_status enable row level security;
alter table public.pedidos_status_historico enable row level security;

drop policy if exists pedidos_status_select_anon on public.pedidos_status;
drop policy if exists pedidos_status_write_anon on public.pedidos_status;
drop policy if exists pedidos_status_select_authenticated on public.pedidos_status;
drop policy if exists pedidos_status_write_authenticated on public.pedidos_status;

drop policy if exists pedidos_status_historico_select_anon on public.pedidos_status_historico;
drop policy if exists pedidos_status_historico_write_anon on public.pedidos_status_historico;
drop policy if exists pedidos_status_historico_select_authenticated on public.pedidos_status_historico;
drop policy if exists pedidos_status_historico_write_authenticated on public.pedidos_status_historico;

create policy pedidos_status_select_anon on public.pedidos_status for select to anon using (true);
create policy pedidos_status_write_anon on public.pedidos_status for all to anon using (true) with check (true);

create policy pedidos_status_select_authenticated on public.pedidos_status for select to authenticated using (true);
create policy pedidos_status_write_authenticated on public.pedidos_status for all to authenticated using (true) with check (true);

create policy pedidos_status_historico_select_anon on public.pedidos_status_historico for select to anon using (true);
create policy pedidos_status_historico_write_anon on public.pedidos_status_historico for all to anon using (true) with check (true);

create policy pedidos_status_historico_select_authenticated on public.pedidos_status_historico for select to authenticated using (true);
create policy pedidos_status_historico_write_authenticated on public.pedidos_status_historico for all to authenticated using (true) with check (true);

grant select, insert, update, delete on table public.pedidos_status to anon, authenticated;
grant select, insert, update, delete on table public.pedidos_status_historico to anon, authenticated;
