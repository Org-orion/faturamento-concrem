alter table if exists public.programacoes_embarque enable row level security;
alter table if exists public.entregas enable row level security;

drop policy if exists programacoes_embarque_select_anon on public.programacoes_embarque;
drop policy if exists programacoes_embarque_write_anon on public.programacoes_embarque;
drop policy if exists programacoes_embarque_insert_anon on public.programacoes_embarque;
drop policy if exists programacoes_embarque_update_anon on public.programacoes_embarque;

drop policy if exists entregas_select_anon on public.entregas;
drop policy if exists entregas_write_anon on public.entregas;
drop policy if exists entregas_insert_anon on public.entregas;
drop policy if exists entregas_update_anon on public.entregas;

create policy programacoes_embarque_select_anon on public.programacoes_embarque
for select to anon
using (true);

create policy programacoes_embarque_insert_anon on public.programacoes_embarque
for insert to anon
with check (true);

create policy programacoes_embarque_update_anon on public.programacoes_embarque
for update to anon
using (true)
with check (true);

create policy entregas_select_anon on public.entregas
for select to anon
using (true);

create policy entregas_insert_anon on public.entregas
for insert to anon
with check (true);

create policy entregas_update_anon on public.entregas
for update to anon
using (true)
with check (true);

grant select, insert, update on table public.programacoes_embarque to anon;
grant select, insert, update on table public.entregas to anon;

grant select, insert, update on table public.programacoes_embarque to authenticated;
grant select, insert, update on table public.entregas to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
      and c.relname = 'entregas_id_seq'
  ) then
    execute 'grant usage, select on sequence public.entregas_id_seq to anon';
    execute 'grant usage, select on sequence public.entregas_id_seq to authenticated';
  end if;
end $$;

