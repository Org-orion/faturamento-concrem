-- Tabela de anexos do relatório de entrega (boleto, nota fiscal, comprovante)
create table if not exists public.relatorio_entrega_anexos (
  id uuid primary key default gen_random_uuid(),
  carregamento_id text not null,
  pedido_id text not null,
  tipo text not null, -- 'boleto' | 'nf' | 'comprovante'
  arquivo_nome text not null,
  arquivo_url text not null,
  criado_em timestamptz not null default now(),
  criado_por text,
  unique (carregamento_id, pedido_id, tipo)
);

create index if not exists relatorio_entrega_anexos_idx_carregamento
  on public.relatorio_entrega_anexos (carregamento_id);

alter table public.relatorio_entrega_anexos enable row level security;

drop policy if exists relatorio_entrega_anexos_select_anon on public.relatorio_entrega_anexos;
drop policy if exists relatorio_entrega_anexos_write_anon on public.relatorio_entrega_anexos;
drop policy if exists relatorio_entrega_anexos_select_auth on public.relatorio_entrega_anexos;
drop policy if exists relatorio_entrega_anexos_write_auth on public.relatorio_entrega_anexos;

create policy relatorio_entrega_anexos_select_anon on public.relatorio_entrega_anexos for select to anon using (true);
create policy relatorio_entrega_anexos_write_anon  on public.relatorio_entrega_anexos for all    to anon using (true) with check (true);
create policy relatorio_entrega_anexos_select_auth on public.relatorio_entrega_anexos for select to authenticated using (true);
create policy relatorio_entrega_anexos_write_auth  on public.relatorio_entrega_anexos for all    to authenticated using (true) with check (true);

grant select, insert, update, delete on table public.relatorio_entrega_anexos to anon, authenticated;
