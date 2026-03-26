-- ==============================================================================
-- 1. Criação da tabela confirmacao_diretoria
-- ==============================================================================
create table if not exists public.confirmacao_diretoria (
  id uuid primary key default gen_random_uuid(),
  pedido_id text not null unique,
  cliente_nome text,
  representante_nome text,
  cidade_uf text,
  validade text,
  status text not null default 'aguardando_confirmacao', -- 'aguardando_confirmacao' | 'confirmado'
  enviado_em timestamptz,
  enviado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ==============================================================================
-- 2. Criação da tabela producao_concluidos
-- ==============================================================================
create table if not exists public.producao_concluidos (
  id uuid primary key default gen_random_uuid(),
  embarque_id text not null,
  pedido_id text,
  motorista_id text,
  data_conclusao timestamptz not null default now(),
  desfeito boolean not null default false,
  criado_por text,
  criado_em timestamptz not null default now()
);

-- ==============================================================================
-- 3. RLS e Grants
-- ==============================================================================
alter table public.confirmacao_diretoria enable row level security;
alter table public.producao_concluidos enable row level security;

-- Drop policies se existirem
drop policy if exists confirmacao_diretoria_select_anon on public.confirmacao_diretoria;
drop policy if exists confirmacao_diretoria_insert_anon on public.confirmacao_diretoria;
drop policy if exists confirmacao_diretoria_update_anon on public.confirmacao_diretoria;
drop policy if exists confirmacao_diretoria_select_authenticated on public.confirmacao_diretoria;
drop policy if exists confirmacao_diretoria_insert_authenticated on public.confirmacao_diretoria;
drop policy if exists confirmacao_diretoria_update_authenticated on public.confirmacao_diretoria;

drop policy if exists producao_concluidos_select_anon on public.producao_concluidos;
drop policy if exists producao_concluidos_insert_anon on public.producao_concluidos;
drop policy if exists producao_concluidos_update_anon on public.producao_concluidos;
drop policy if exists producao_concluidos_select_authenticated on public.producao_concluidos;
drop policy if exists producao_concluidos_insert_authenticated on public.producao_concluidos;
drop policy if exists producao_concluidos_update_authenticated on public.producao_concluidos;

-- Policies
create policy confirmacao_diretoria_select_anon on public.confirmacao_diretoria for select to anon using (true);
create policy confirmacao_diretoria_insert_anon on public.confirmacao_diretoria for insert to anon with check (true);
create policy confirmacao_diretoria_update_anon on public.confirmacao_diretoria for update to anon using (true) with check (true);

create policy confirmacao_diretoria_select_authenticated on public.confirmacao_diretoria for select to authenticated using (true);
create policy confirmacao_diretoria_insert_authenticated on public.confirmacao_diretoria for insert to authenticated with check (true);
create policy confirmacao_diretoria_update_authenticated on public.confirmacao_diretoria for update to authenticated using (true) with check (true);

create policy producao_concluidos_select_anon on public.producao_concluidos for select to anon using (true);
create policy producao_concluidos_insert_anon on public.producao_concluidos for insert to anon with check (true);
create policy producao_concluidos_update_anon on public.producao_concluidos for update to anon using (true) with check (true);

create policy producao_concluidos_select_authenticated on public.producao_concluidos for select to authenticated using (true);
create policy producao_concluidos_insert_authenticated on public.producao_concluidos for insert to authenticated with check (true);
create policy producao_concluidos_update_authenticated on public.producao_concluidos for update to authenticated using (true) with check (true);

grant select, insert, update, delete on table public.confirmacao_diretoria to anon, authenticated;
grant select, insert, update, delete on table public.producao_concluidos to anon, authenticated;

-- Seed opcional para teste de confirmacao_diretoria
insert into public.confirmacao_diretoria (pedido_id, cliente_nome, representante_nome, cidade_uf, validade)
values 
  ('PED-12345', 'Cliente Teste S/A', 'Rep João', 'São Paulo / SP', '2026-04-01'),
  ('PED-98765', 'Outra Empresa Ltda', 'Rep Maria', 'Campinas / SP', '2026-04-05');
