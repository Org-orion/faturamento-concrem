alter table if exists public.representantes enable row level security;
alter table if exists public.motoristas enable row level security;
alter table if exists public.usuarios enable row level security;

drop policy if exists representantes_select_anon on public.representantes;
drop policy if exists representantes_write_anon on public.representantes;
drop policy if exists representantes_select_authenticated on public.representantes;
drop policy if exists representantes_insert_authenticated on public.representantes;
drop policy if exists representantes_update_authenticated on public.representantes;
drop policy if exists representantes_delete_authenticated on public.representantes;

drop policy if exists motoristas_select_anon on public.motoristas;
drop policy if exists motoristas_write_anon on public.motoristas;
drop policy if exists motoristas_select_authenticated on public.motoristas;
drop policy if exists motoristas_insert_authenticated on public.motoristas;
drop policy if exists motoristas_update_authenticated on public.motoristas;
drop policy if exists motoristas_delete_authenticated on public.motoristas;

drop policy if exists usuarios_select_anon on public.usuarios;
drop policy if exists usuarios_write_anon on public.usuarios;
drop policy if exists usuarios_select_authenticated on public.usuarios;
drop policy if exists usuarios_insert_authenticated on public.usuarios;
drop policy if exists usuarios_update_authenticated on public.usuarios;
drop policy if exists usuarios_delete_authenticated on public.usuarios;

create policy representantes_select_anon on public.representantes
for select to anon
using (true);

create policy representantes_insert_anon on public.representantes
for insert to anon
with check (true);

create policy representantes_update_anon on public.representantes
for update to anon
using (true)
with check (true);

create policy representantes_delete_anon on public.representantes
for delete to anon
using (true);

create policy representantes_select_authenticated on public.representantes
for select to authenticated
using (true);

create policy representantes_insert_authenticated on public.representantes
for insert to authenticated
with check (true);

create policy representantes_update_authenticated on public.representantes
for update to authenticated
using (true)
with check (true);

create policy representantes_delete_authenticated on public.representantes
for delete to authenticated
using (true);

create policy motoristas_select_anon on public.motoristas
for select to anon
using (true);

create policy motoristas_insert_anon on public.motoristas
for insert to anon
with check (true);

create policy motoristas_update_anon on public.motoristas
for update to anon
using (true)
with check (true);

create policy motoristas_delete_anon on public.motoristas
for delete to anon
using (true);

create policy motoristas_select_authenticated on public.motoristas
for select to authenticated
using (true);

create policy motoristas_insert_authenticated on public.motoristas
for insert to authenticated
with check (true);

create policy motoristas_update_authenticated on public.motoristas
for update to authenticated
using (true)
with check (true);

create policy motoristas_delete_authenticated on public.motoristas
for delete to authenticated
using (true);

create policy usuarios_select_anon on public.usuarios
for select to anon
using (true);

create policy usuarios_insert_anon on public.usuarios
for insert to anon
with check (true);

create policy usuarios_update_anon on public.usuarios
for update to anon
using (true)
with check (true);

create policy usuarios_delete_anon on public.usuarios
for delete to anon
using (true);

create policy usuarios_select_authenticated on public.usuarios
for select to authenticated
using (true);

create policy usuarios_insert_authenticated on public.usuarios
for insert to authenticated
with check (true);

create policy usuarios_update_authenticated on public.usuarios
for update to authenticated
using (true)
with check (true);

create policy usuarios_delete_authenticated on public.usuarios
for delete to authenticated
using (true);

grant select, insert, update, delete on table public.representantes to anon;
grant select, insert, update, delete on table public.motoristas to anon;
grant select, insert, update, delete on table public.usuarios to anon;

grant select, insert, update, delete on table public.representantes to authenticated;
grant select, insert, update, delete on table public.motoristas to authenticated;
grant select, insert, update, delete on table public.usuarios to authenticated;

