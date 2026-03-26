create extension if not exists "pgcrypto";

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create table if not exists public.representantes (
  id uuid primary key default gen_random_uuid(),
  codigo_representante text,
  nome text,
  cpf text,
  telefone_whatsapp text,
  regiao_atuacao text,
  endereco text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.motoristas (
  id uuid primary key default gen_random_uuid(),
  nome text,
  cpf text,
  telefone text,
  cnh_numero text,
  cnh_categoria text,
  placa_veiculo text,
  tipo_veiculo text,
  volume_suportado_m3 numeric,
  peso_suportado_kg numeric,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint motoristas_tipo_veiculo_chk check (
    tipo_veiculo is null or tipo_veiculo in ('Carreta Bau', 'Carreta Sider', 'Truck Bau', 'Truck Sider')
  )
);

create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  nome text,
  email text unique,
  senha_hash text,
  perfil_acesso text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint usuarios_perfil_acesso_chk check (
    perfil_acesso is null or perfil_acesso in ('faturamento', 'administrador', 'comercial', 'producao')
  )
);

drop trigger if exists trg_representantes_set_atualizado_em on public.representantes;
create trigger trg_representantes_set_atualizado_em
before update on public.representantes
for each row
execute function public.set_atualizado_em();

drop trigger if exists trg_motoristas_set_atualizado_em on public.motoristas;
create trigger trg_motoristas_set_atualizado_em
before update on public.motoristas
for each row
execute function public.set_atualizado_em();

drop trigger if exists trg_usuarios_set_atualizado_em on public.usuarios;
create trigger trg_usuarios_set_atualizado_em
before update on public.usuarios
for each row
execute function public.set_atualizado_em();

alter table public.representantes enable row level security;
alter table public.motoristas enable row level security;
alter table public.usuarios enable row level security;

create policy if not exists "representantes_select_anon" on public.representantes for select to anon using (true);
create policy if not exists "representantes_write_anon" on public.representantes for all to anon using (true) with check (true);

create policy if not exists "motoristas_select_anon" on public.motoristas for select to anon using (true);
create policy if not exists "motoristas_write_anon" on public.motoristas for all to anon using (true) with check (true);

create policy if not exists "usuarios_select_anon" on public.usuarios for select to anon using (true);
create policy if not exists "usuarios_write_anon" on public.usuarios for all to anon using (true) with check (true);
