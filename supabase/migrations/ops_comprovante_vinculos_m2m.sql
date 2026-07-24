-- ============================================================================
-- Comprovante de Entrega compartilhável (muitos-para-muitos) — ETAPA 1 (dados).
--
-- Regra: SOMENTE 'comprovante%' pode cobrir vários pedidos. NF / boleto / outros
-- continuam 1 pedido (via concrem_relatorio_entrega_anexos.pedido_id direto).
-- O arquivo do comprovante é uma linha em concrem_relatorio_entrega_anexos; a
-- COBERTURA passa a ser a nova tabela de vínculos (autoridade).
--
-- Requer ops_status_carregamento_automatico.sql aplicado. Reaplicável.
-- ============================================================================

-- 1) Tabela de vínculos (autoridade da cobertura do comprovante)
create table if not exists public.concrem_comprovante_entrega_pedidos (
  id           uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.concrem_relatorio_entrega_anexos(id) on delete cascade,
  pedido_id    text not null,
  criado_em    timestamptz not null default now(),
  criado_por   text null,
  unique (documento_id, pedido_id)
);
create index if not exists idx_comprov_vinc_pedido on public.concrem_comprovante_entrega_pedidos (pedido_id);
create index if not exists idx_comprov_vinc_doc    on public.concrem_comprovante_entrega_pedidos (documento_id);

-- 2) Validação do vínculo (BEFORE INSERT/UPDATE): só comprovante, mesma carga.
create or replace function public.valida_comprovante_vinculo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_carga text; v_tipo text;
begin
  select carregamento_id, tipo into v_carga, v_tipo
  from public.concrem_relatorio_entrega_anexos where id = new.documento_id;

  if not found then
    raise exception 'Documento inexistente.' using errcode = 'P0002';
  end if;
  if v_tipo is null or v_tipo not like 'comprovante%' then
    raise exception 'Este tipo de documento não permite vínculo com vários pedidos.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.concrem_programacoes_embarque l
    where l.id = v_carga and new.pedido_id = any (l.pedidos)
  ) then
    raise exception 'O pedido % não pertence ao carregamento % deste comprovante.', new.pedido_id, v_carga using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_valida_comprovante_vinculo on public.concrem_comprovante_entrega_pedidos;
create trigger trg_valida_comprovante_vinculo
  before insert or update on public.concrem_comprovante_entrega_pedidos
  for each row execute function public.valida_comprovante_vinculo();

-- 3) Ao vincular/desvincular comprovante: reprocessa o status da carga.
create or replace function public.recomputa_status_por_comprovante_vinculo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_doc uuid; v_carga text;
begin
  v_doc := coalesce(new.documento_id, old.documento_id);
  select carregamento_id into v_carga from public.concrem_relatorio_entrega_anexos where id = v_doc;
  if v_carga is not null then
    update public.concrem_programacoes_embarque set updated_at = now() where id = v_carga;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recomputa_status_por_comprovante_vinculo on public.concrem_comprovante_entrega_pedidos;
create trigger trg_recomputa_status_por_comprovante_vinculo
  after insert or update or delete on public.concrem_comprovante_entrega_pedidos
  for each row execute function public.recomputa_status_por_comprovante_vinculo();

-- 4) Critério de status atualizado:
--    • Em Rota = todo pedido com >=1 NF PRÓPRIA ('nf%' — várias NFs por pedido).
--    • Entregue = todo pedido coberto por comprovante DIRETO ou via VÍNCULO M2M.
create or replace function public.status_carga_por_docs(p_id text, p_pedidos text[])
returns text language plpgsql stable security definer set search_path = public as $$
declare v_sem_comp int; v_sem_nf int;
begin
  if p_pedidos is null or array_length(p_pedidos, 1) is null then return null; end if;

  select count(*) into v_sem_comp
  from unnest(p_pedidos) as pid
  where not exists (  -- comprovante direto no pedido
          select 1 from public.concrem_relatorio_entrega_anexos a
          where a.carregamento_id = p_id and a.pedido_id = pid and a.tipo like 'comprovante%')
    and not exists (  -- comprovante compartilhado cobrindo o pedido
          select 1
          from public.concrem_comprovante_entrega_pedidos v
          join public.concrem_relatorio_entrega_anexos d on d.id = v.documento_id
          where v.pedido_id = pid and d.carregamento_id = p_id and d.tipo like 'comprovante%');
  if v_sem_comp = 0 then return 'Entregue'; end if;

  select count(*) into v_sem_nf
  from unnest(p_pedidos) as pid
  where not exists (
    select 1 from public.concrem_relatorio_entrega_anexos a
    where a.carregamento_id = p_id and a.pedido_id = pid and a.tipo like 'nf%'
  );
  if v_sem_nf = 0 then return 'Em Rota'; end if;

  return null;
end;
$$;

-- 5) BACKFILL: cada comprovante existente vira 1 vínculo (pedido atual).
--    Preserva o comportamento individual atual (não amplia cobertura).
--    A validação é DESLIGADA durante o backfill: dados legados podem ter o
--    comprovante apontando para um pedido que não está mais no array `pedidos`
--    da carga (inconsistência antiga). Confiamos no dado existente aqui.
do $$ begin
  alter table public.concrem_comprovante_entrega_pedidos disable trigger trg_valida_comprovante_vinculo;
exception when others then null; end $$;

insert into public.concrem_comprovante_entrega_pedidos (documento_id, pedido_id, criado_por)
select a.id, a.pedido_id, a.criado_por
from public.concrem_relatorio_entrega_anexos a
where a.tipo like 'comprovante%'
on conflict (documento_id, pedido_id) do nothing;

do $$ begin
  alter table public.concrem_comprovante_entrega_pedidos enable trigger trg_valida_comprovante_vinculo;
exception when others then null; end $$;

-- ── VERIFICAÇÃO ──────────────────────────────────────────────────────────────
-- Tentar inserir vínculo com documento NF → erro (tipo não permite).
-- Vincular 1 comprovante a vários pedidos da MESMA carga → ok; a carga só vira
-- 'Entregue' quando TODOS os pedidos tiverem comprovante (direto ou M2M).
-- ROLLBACK: drop table public.concrem_comprovante_entrega_pedidos cascade;
--   (+ reaplicar status_carga_por_docs da versão anterior, se necessário).
-- ============================================================================
