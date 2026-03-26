create table if not exists public.programacoes_embarque (
  id text primary key,
  pedidos text[] not null default '{}',
  status text not null default 'aguardando_producao',
  criado_em timestamptz not null default now(),
  criado_por text,
  driver_id text,
  planned_date date,
  obs text,
  estimated_weight numeric,
  freight_value numeric,
  production_status text,
  shipment_status text,
  updated_at timestamptz not null default now()
);

create table if not exists public.producao_confirmacoes (
  id bigserial primary key,
  programacao_id text not null references public.programacoes_embarque(id) on delete cascade,
  confirmado_em timestamptz not null default now(),
  confirmado_por text not null,
  observacao text
);

create table if not exists public.entregas (
  id bigserial primary key,
  programacao_id text not null references public.programacoes_embarque(id) on delete cascade,
  pedido_id text not null,
  status text not null default 'pendente',
  entregue_em timestamptz,
  unique (programacao_id, pedido_id)
);

create table if not exists public.notificacoes_representantes (
  id bigserial primary key,
  programacao_id text not null references public.programacoes_embarque(id) on delete cascade,
  representante text not null,
  enviado_em timestamptz not null default now()
);

create table if not exists public.financeiro_embarque (
  id bigserial primary key,
  programacao_id text not null references public.programacoes_embarque(id) on delete cascade,
  despesas_frete numeric,
  receita numeric,
  ganho_liquido numeric,
  registrado_em timestamptz not null default now()
);

alter table public.programacoes_embarque enable row level security;
alter table public.producao_confirmacoes enable row level security;
alter table public.entregas enable row level security;
alter table public.notificacoes_representantes enable row level security;
alter table public.financeiro_embarque enable row level security;

create policy if not exists "programacoes_embarque_select_anon" on public.programacoes_embarque for select to anon using (true);
create policy if not exists "programacoes_embarque_write_anon" on public.programacoes_embarque for all to anon using (true) with check (true);

create policy if not exists "producao_confirmacoes_select_anon" on public.producao_confirmacoes for select to anon using (true);
create policy if not exists "producao_confirmacoes_insert_anon" on public.producao_confirmacoes for insert to anon with check (true);

create policy if not exists "entregas_select_anon" on public.entregas for select to anon using (true);
create policy if not exists "entregas_write_anon" on public.entregas for all to anon using (true) with check (true);

create policy if not exists "notificacoes_select_anon" on public.notificacoes_representantes for select to anon using (true);
create policy if not exists "notificacoes_insert_anon" on public.notificacoes_representantes for insert to anon with check (true);

create policy if not exists "financeiro_select_anon" on public.financeiro_embarque for select to anon using (true);
create policy if not exists "financeiro_write_anon" on public.financeiro_embarque for all to anon using (true) with check (true);

