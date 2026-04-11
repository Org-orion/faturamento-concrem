-- Adiciona colunas de relatório de entrega na tabela concrem_entregas
-- (tabela foi renomeada de 'entregas' para 'concrem_entregas')

alter table public.concrem_entregas
  add column if not exists numero_nota text;

alter table public.concrem_entregas
  add column if not exists ordem_entrega integer;

alter table public.concrem_entregas
  add column if not exists qtd_kits numeric;

alter table public.concrem_entregas
  add column if not exists qtd_pallets numeric;

alter table public.concrem_entregas
  add column if not exists qtd_volumes numeric;
