-- Adiciona coluna de previsão de entrega na tabela de programações de embarque
alter table public.concrem_programacoes_embarque
  add column if not exists previsao_entrega date;
