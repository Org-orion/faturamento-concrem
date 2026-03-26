-- ==============================================================================
-- 1. Criação da tabela de Tipos de Despesa (Cadastro Auxiliar)
-- ==============================================================================
create table if not exists public.tipos_despesa (
  id text primary key,
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ==============================================================================
-- 2. Criação da tabela Principal de Lançamentos Financeiros (Fretes)
-- ==============================================================================
create table if not exists public.lancamentos_financeiros (
  id text primary key,
  pedido_id text not null,
  motorista_id uuid references public.motoristas(id) on delete set null,
  data_entrega date,
  valor_frete numeric(10, 2) default 0,
  valor_motorista numeric(10, 2) default 0,
  status text not null default 'Pendente', -- 'Pendente' | 'Lançado' | 'Conferido'
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ==============================================================================
-- 3. Criação da tabela de Linhas de Despesa (Filha de Lançamentos Financeiros)
-- ==============================================================================
create table if not exists public.lancamentos_despesas (
  id bigserial primary key,
  lancamento_id text not null references public.lancamentos_financeiros(id) on delete cascade,
  tipo_despesa_id text not null references public.tipos_despesa(id) on delete restrict,
  valor numeric(10, 2) not null default 0,
  observacao text
);

-- ==============================================================================
-- 4. Habilitar RLS (Row Level Security)
-- ==============================================================================
alter table public.tipos_despesa enable row level security;
alter table public.lancamentos_financeiros enable row level security;
alter table public.lancamentos_despesas enable row level security;

-- ==============================================================================
-- 5. Remover Policies antigas (caso o script seja rodado mais de uma vez)
-- ==============================================================================
drop policy if exists tipos_despesa_select_anon on public.tipos_despesa;
drop policy if exists tipos_despesa_insert_anon on public.tipos_despesa;
drop policy if exists tipos_despesa_update_anon on public.tipos_despesa;
drop policy if exists tipos_despesa_delete_anon on public.tipos_despesa;
drop policy if exists tipos_despesa_select_authenticated on public.tipos_despesa;
drop policy if exists tipos_despesa_insert_authenticated on public.tipos_despesa;
drop policy if exists tipos_despesa_update_authenticated on public.tipos_despesa;
drop policy if exists tipos_despesa_delete_authenticated on public.tipos_despesa;

drop policy if exists lancamentos_financeiros_select_anon on public.lancamentos_financeiros;
drop policy if exists lancamentos_financeiros_insert_anon on public.lancamentos_financeiros;
drop policy if exists lancamentos_financeiros_update_anon on public.lancamentos_financeiros;
drop policy if exists lancamentos_financeiros_delete_anon on public.lancamentos_financeiros;
drop policy if exists lancamentos_financeiros_select_authenticated on public.lancamentos_financeiros;
drop policy if exists lancamentos_financeiros_insert_authenticated on public.lancamentos_financeiros;
drop policy if exists lancamentos_financeiros_update_authenticated on public.lancamentos_financeiros;
drop policy if exists lancamentos_financeiros_delete_authenticated on public.lancamentos_financeiros;

drop policy if exists lancamentos_despesas_select_anon on public.lancamentos_despesas;
drop policy if exists lancamentos_despesas_insert_anon on public.lancamentos_despesas;
drop policy if exists lancamentos_despesas_update_anon on public.lancamentos_despesas;
drop policy if exists lancamentos_despesas_delete_anon on public.lancamentos_despesas;
drop policy if exists lancamentos_despesas_select_authenticated on public.lancamentos_despesas;
drop policy if exists lancamentos_despesas_insert_authenticated on public.lancamentos_despesas;
drop policy if exists lancamentos_despesas_update_authenticated on public.lancamentos_despesas;
drop policy if exists lancamentos_despesas_delete_authenticated on public.lancamentos_despesas;

-- ==============================================================================
-- 6. Criar Policies (Acesso total para anon e authenticated, adaptado ao contexto)
-- ==============================================================================

-- tipos_despesa
create policy tipos_despesa_select_anon on public.tipos_despesa for select to anon using (true);
create policy tipos_despesa_insert_anon on public.tipos_despesa for insert to anon with check (true);
create policy tipos_despesa_update_anon on public.tipos_despesa for update to anon using (true) with check (true);
create policy tipos_despesa_delete_anon on public.tipos_despesa for delete to anon using (true);

create policy tipos_despesa_select_authenticated on public.tipos_despesa for select to authenticated using (true);
create policy tipos_despesa_insert_authenticated on public.tipos_despesa for insert to authenticated with check (true);
create policy tipos_despesa_update_authenticated on public.tipos_despesa for update to authenticated using (true) with check (true);
create policy tipos_despesa_delete_authenticated on public.tipos_despesa for delete to authenticated using (true);

-- lancamentos_financeiros
create policy lancamentos_financeiros_select_anon on public.lancamentos_financeiros for select to anon using (true);
create policy lancamentos_financeiros_insert_anon on public.lancamentos_financeiros for insert to anon with check (true);
create policy lancamentos_financeiros_update_anon on public.lancamentos_financeiros for update to anon using (true) with check (true);
create policy lancamentos_financeiros_delete_anon on public.lancamentos_financeiros for delete to anon using (true);

create policy lancamentos_financeiros_select_authenticated on public.lancamentos_financeiros for select to authenticated using (true);
create policy lancamentos_financeiros_insert_authenticated on public.lancamentos_financeiros for insert to authenticated with check (true);
create policy lancamentos_financeiros_update_authenticated on public.lancamentos_financeiros for update to authenticated using (true) with check (true);
create policy lancamentos_financeiros_delete_authenticated on public.lancamentos_financeiros for delete to authenticated using (true);

-- lancamentos_despesas
create policy lancamentos_despesas_select_anon on public.lancamentos_despesas for select to anon using (true);
create policy lancamentos_despesas_insert_anon on public.lancamentos_despesas for insert to anon with check (true);
create policy lancamentos_despesas_update_anon on public.lancamentos_despesas for update to anon using (true) with check (true);
create policy lancamentos_despesas_delete_anon on public.lancamentos_despesas for delete to anon using (true);

create policy lancamentos_despesas_select_authenticated on public.lancamentos_despesas for select to authenticated using (true);
create policy lancamentos_despesas_insert_authenticated on public.lancamentos_despesas for insert to authenticated with check (true);
create policy lancamentos_despesas_update_authenticated on public.lancamentos_despesas for update to authenticated using (true) with check (true);
create policy lancamentos_despesas_delete_authenticated on public.lancamentos_despesas for delete to authenticated using (true);

-- ==============================================================================
-- 7. Grants (Permissões explícitas)
-- ==============================================================================
grant select, insert, update, delete on table public.tipos_despesa to anon, authenticated;
grant select, insert, update, delete on table public.lancamentos_financeiros to anon, authenticated;
grant select, insert, update, delete on table public.lancamentos_despesas to anon, authenticated;

-- Grant para a sequence gerada pela coluna 'id bigserial'
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
      and c.relname = 'lancamentos_despesas_id_seq'
  ) then
    execute 'grant usage, select on sequence public.lancamentos_despesas_id_seq to anon, authenticated';
  end if;
end $$;

-- ==============================================================================
-- 8. Inserir Dados Iniciais (Seed de Tipos de Despesa)
-- ==============================================================================
insert into public.tipos_despesa (id, nome, descricao, ativo)
values 
  ('DES-001', 'Combustível', '', true),
  ('DES-002', 'Pedágio', '', true),
  ('DES-003', 'Ajudante de Carga', '', true),
  ('DES-004', 'Alimentação', '', true),
  ('DES-005', 'Manutenção Emergencial', '', true)
on conflict (id) do nothing;
