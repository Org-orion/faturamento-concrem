alter table if exists public.programacoes_embarque enable row level security;
alter table if exists public.entregas enable row level security;
alter table if exists public.producao_confirmacoes enable row level security;
alter table if exists public.notificacoes_representantes enable row level security;
alter table if exists public.financeiro_embarque enable row level security;

drop policy if exists programacoes_embarque_select_anon on public.programacoes_embarque;
drop policy if exists programacoes_embarque_insert_anon on public.programacoes_embarque;
drop policy if exists programacoes_embarque_update_anon on public.programacoes_embarque;
drop policy if exists programacoes_embarque_delete_anon on public.programacoes_embarque;
drop policy if exists programacoes_embarque_select_authenticated on public.programacoes_embarque;
drop policy if exists programacoes_embarque_insert_authenticated on public.programacoes_embarque;
drop policy if exists programacoes_embarque_update_authenticated on public.programacoes_embarque;
drop policy if exists programacoes_embarque_delete_authenticated on public.programacoes_embarque;
drop policy if exists programacoes_embarque_write_anon on public.programacoes_embarque;

drop policy if exists entregas_select_anon on public.entregas;
drop policy if exists entregas_insert_anon on public.entregas;
drop policy if exists entregas_update_anon on public.entregas;
drop policy if exists entregas_delete_anon on public.entregas;
drop policy if exists entregas_select_authenticated on public.entregas;
drop policy if exists entregas_insert_authenticated on public.entregas;
drop policy if exists entregas_update_authenticated on public.entregas;
drop policy if exists entregas_delete_authenticated on public.entregas;
drop policy if exists entregas_write_anon on public.entregas;

drop policy if exists producao_confirmacoes_select_anon on public.producao_confirmacoes;
drop policy if exists producao_confirmacoes_insert_anon on public.producao_confirmacoes;
drop policy if exists producao_confirmacoes_select_authenticated on public.producao_confirmacoes;
drop policy if exists producao_confirmacoes_insert_authenticated on public.producao_confirmacoes;

drop policy if exists notificacoes_select_anon on public.notificacoes_representantes;
drop policy if exists notificacoes_insert_anon on public.notificacoes_representantes;
drop policy if exists notificacoes_select_authenticated on public.notificacoes_representantes;
drop policy if exists notificacoes_insert_authenticated on public.notificacoes_representantes;

drop policy if exists financeiro_select_anon on public.financeiro_embarque;
drop policy if exists financeiro_insert_anon on public.financeiro_embarque;
drop policy if exists financeiro_update_anon on public.financeiro_embarque;
drop policy if exists financeiro_delete_anon on public.financeiro_embarque;
drop policy if exists financeiro_select_authenticated on public.financeiro_embarque;
drop policy if exists financeiro_insert_authenticated on public.financeiro_embarque;
drop policy if exists financeiro_update_authenticated on public.financeiro_embarque;
drop policy if exists financeiro_delete_authenticated on public.financeiro_embarque;
drop policy if exists financeiro_write_anon on public.financeiro_embarque;

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

create policy programacoes_embarque_delete_anon on public.programacoes_embarque
for delete to anon
using (true);

create policy programacoes_embarque_select_authenticated on public.programacoes_embarque
for select to authenticated
using (true);

create policy programacoes_embarque_insert_authenticated on public.programacoes_embarque
for insert to authenticated
with check (true);

create policy programacoes_embarque_update_authenticated on public.programacoes_embarque
for update to authenticated
using (true)
with check (true);

create policy programacoes_embarque_delete_authenticated on public.programacoes_embarque
for delete to authenticated
using (true);

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

create policy entregas_delete_anon on public.entregas
for delete to anon
using (true);

create policy entregas_select_authenticated on public.entregas
for select to authenticated
using (true);

create policy entregas_insert_authenticated on public.entregas
for insert to authenticated
with check (true);

create policy entregas_update_authenticated on public.entregas
for update to authenticated
using (true)
with check (true);

create policy entregas_delete_authenticated on public.entregas
for delete to authenticated
using (true);

create policy producao_confirmacoes_select_anon on public.producao_confirmacoes
for select to anon
using (true);

create policy producao_confirmacoes_insert_anon on public.producao_confirmacoes
for insert to anon
with check (true);

create policy producao_confirmacoes_select_authenticated on public.producao_confirmacoes
for select to authenticated
using (true);

create policy producao_confirmacoes_insert_authenticated on public.producao_confirmacoes
for insert to authenticated
with check (true);

create policy notificacoes_select_anon on public.notificacoes_representantes
for select to anon
using (true);

create policy notificacoes_insert_anon on public.notificacoes_representantes
for insert to anon
with check (true);

create policy notificacoes_select_authenticated on public.notificacoes_representantes
for select to authenticated
using (true);

create policy notificacoes_insert_authenticated on public.notificacoes_representantes
for insert to authenticated
with check (true);

create policy financeiro_select_anon on public.financeiro_embarque
for select to anon
using (true);

create policy financeiro_insert_anon on public.financeiro_embarque
for insert to anon
with check (true);

create policy financeiro_update_anon on public.financeiro_embarque
for update to anon
using (true)
with check (true);

create policy financeiro_delete_anon on public.financeiro_embarque
for delete to anon
using (true);

create policy financeiro_select_authenticated on public.financeiro_embarque
for select to authenticated
using (true);

create policy financeiro_insert_authenticated on public.financeiro_embarque
for insert to authenticated
with check (true);

create policy financeiro_update_authenticated on public.financeiro_embarque
for update to authenticated
using (true)
with check (true);

create policy financeiro_delete_authenticated on public.financeiro_embarque
for delete to authenticated
using (true);

grant select, insert, update, delete on table public.programacoes_embarque to anon;
grant select, insert, update, delete on table public.entregas to anon;
grant select, insert, update, delete on table public.producao_confirmacoes to anon;
grant select, insert, update, delete on table public.notificacoes_representantes to anon;
grant select, insert, update, delete on table public.financeiro_embarque to anon;

grant select, insert, update, delete on table public.programacoes_embarque to authenticated;
grant select, insert, update, delete on table public.entregas to authenticated;
grant select, insert, update, delete on table public.producao_confirmacoes to authenticated;
grant select, insert, update, delete on table public.notificacoes_representantes to authenticated;
grant select, insert, update, delete on table public.financeiro_embarque to authenticated;

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
