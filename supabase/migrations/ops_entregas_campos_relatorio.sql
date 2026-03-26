alter table public.entregas
  add column if not exists numero_nota text;

alter table public.entregas
  add column if not exists ordem_entrega integer;

