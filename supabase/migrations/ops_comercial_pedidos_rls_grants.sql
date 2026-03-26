alter table if exists public.comercial_pedidos_meta enable row level security;
alter table if exists public.comercial_pedidos_acoes enable row level security;

drop policy if exists comercial_pedidos_meta_select_anon on public.comercial_pedidos_meta;
drop policy if exists comercial_pedidos_meta_write_anon on public.comercial_pedidos_meta;
drop policy if exists comercial_pedidos_acoes_select_anon on public.comercial_pedidos_acoes;
drop policy if exists comercial_pedidos_acoes_insert_anon on public.comercial_pedidos_acoes;

create policy comercial_pedidos_meta_select_anon on public.comercial_pedidos_meta
for select to anon
using (true);

create policy comercial_pedidos_meta_insert_anon on public.comercial_pedidos_meta
for insert to anon
with check (true);

create policy comercial_pedidos_meta_update_anon on public.comercial_pedidos_meta
for update to anon
using (true)
with check (true);

create policy comercial_pedidos_acoes_select_anon on public.comercial_pedidos_acoes
for select to anon
using (true);

create policy comercial_pedidos_acoes_insert_anon on public.comercial_pedidos_acoes
for insert to anon
with check (true);

grant select, insert, update on table public.comercial_pedidos_meta to anon;
grant select, insert, update on table public.comercial_pedidos_meta to authenticated;

grant select, insert on table public.comercial_pedidos_acoes to anon;
grant select, insert on table public.comercial_pedidos_acoes to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
      and c.relname = 'comercial_pedidos_acoes_id_seq'
  ) then
    execute 'grant usage, select on sequence public.comercial_pedidos_acoes_id_seq to anon';
    execute 'grant usage, select on sequence public.comercial_pedidos_acoes_id_seq to authenticated';
  end if;
end $$;

