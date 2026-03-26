create table if not exists public.comercial_pedidos_meta (
  pedido_id text primary key,
  ordem_entrega integer,
  status text,
  representante text,
  representante_telefone text,
  cliente_codigo text,
  cliente_nome text,
  cliente_cidade text,
  cliente_uf text,
  data_validade date,
  observacao text,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

create table if not exists public.comercial_pedidos_acoes (
  id bigserial primary key,
  pedido_id text not null,
  acao text not null,
  criado_em timestamptz not null default now(),
  criado_por text not null,
  payload jsonb
);

create table if not exists public.notificacoes_representantes_pedidos (
  id bigserial primary key,
  pedido_id text not null,
  representante text not null,
  enviado_em timestamptz not null default now()
);

alter table public.comercial_pedidos_meta enable row level security;
alter table public.comercial_pedidos_acoes enable row level security;
alter table public.notificacoes_representantes_pedidos enable row level security;

create policy if not exists "comercial_pedidos_meta_select_anon" on public.comercial_pedidos_meta for select to anon using (true);
create policy if not exists "comercial_pedidos_meta_write_anon" on public.comercial_pedidos_meta for all to anon using (true) with check (true);

create policy if not exists "comercial_pedidos_acoes_select_anon" on public.comercial_pedidos_acoes for select to anon using (true);
create policy if not exists "comercial_pedidos_acoes_insert_anon" on public.comercial_pedidos_acoes for insert to anon with check (true);

create policy if not exists "notificacoes_pedidos_select_anon" on public.notificacoes_representantes_pedidos for select to anon using (true);
create policy if not exists "notificacoes_pedidos_insert_anon" on public.notificacoes_representantes_pedidos for insert to anon with check (true);
