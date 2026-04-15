-- Tabela para registrar quais representantes já foram notificados por carregamento
create table if not exists public.concrem_relatorio_entrega_notificacoes (
  id                  uuid default gen_random_uuid() primary key,
  carregamento_id     text not null,
  representante_key   text not null,   -- representativeId ou representativeName usado como chave
  representante_nome  text,
  notificado_em       timestamptz not null default now(),
  previsao_entrega    date,            -- data enviada ao representante nessa notificação
  criado_por          text,
  unique (carregamento_id, representante_key)
);

create index if not exists idx_relatorio_notif_carregamento
  on public.concrem_relatorio_entrega_notificacoes (carregamento_id);
