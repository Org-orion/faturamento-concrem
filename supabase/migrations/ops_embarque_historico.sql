-- Histórico de movimentações dos carregamentos (programações de embarque)
create table if not exists concrem_embarque_historico (
  id          uuid default gen_random_uuid() primary key,
  embarque_id text not null,
  acao        text not null,  -- 'criado' | 'status_alterado' | 'motorista_alterado' | 'pedidos_alterados' | 'data_alterada' | 'frete_alterado' | 'obs_alterada'
  campo       text,
  valor_anterior text,
  valor_novo  text,
  alterado_por text,
  criado_em   timestamptz default now()
);

create index if not exists idx_embarque_historico_embarque_id on concrem_embarque_historico(embarque_id);
create index if not exists idx_embarque_historico_criado_em  on concrem_embarque_historico(criado_em desc);

alter table concrem_embarque_historico enable row level security;

-- Permite leitura e inserção para a chave anon (mesma política das outras tabelas OPS)
create policy "anon select embarque_historico"
  on concrem_embarque_historico for select using (true);

create policy "anon insert embarque_historico"
  on concrem_embarque_historico for insert with check (true);
