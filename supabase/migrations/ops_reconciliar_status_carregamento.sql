-- ============================================================================
-- RECONCILIAÇÃO (execução única) — corrige o status dos carregamentos que NÃO
-- correspondem aos critérios documentais (ex.: marcados 'Em Rota'/'Entregue'
-- manualmente antes da regra, sem os documentos exigidos).
--
-- Status correto (mesmas regras do trigger automático):
--   • 'Entregue'  se TODOS os pedidos têm comprovante ('comprovante%')
--   • 'Em Rota'   se TODOS têm NF ('nf') e boleto ('boleto%')
--   • 'Aguardando Despacho' caso contrário
--   • 'Cancelado' é preservado (ação administrativa)
--
-- Diferente do trigger (avanço-only), esta correção PODE REBAIXAR quem foi
-- super-avançado — por isso desliga temporariamente o trigger no PASSO 2.
-- Recomendado aplicar DEPOIS de ops_status_carregamento_automatico.sql.
-- Não altera o status dos PEDIDOS (o trigger de pedidos é avanço-only).
-- ============================================================================

-- ── PASSO 1 — AUDITORIA (somente leitura): o que está divergente ────────────
with alvo as (
  select
    l.id,
    l.shipment_status as status_atual,
    case
      when l.shipment_status = 'Cancelado' then 'Cancelado'
      when l.pedidos is null or cardinality(l.pedidos) = 0 then 'Aguardando Despacho'
      when (select count(*) from unnest(l.pedidos) pid where not exists (
              select 1 from public.concrem_relatorio_entrega_anexos a
              where a.carregamento_id = l.id and a.pedido_id = pid and a.tipo like 'comprovante%')) = 0
        then 'Entregue'
      when (select count(*) from unnest(l.pedidos) pid where
              not exists (select 1 from public.concrem_relatorio_entrega_anexos a
                          where a.carregamento_id = l.id and a.pedido_id = pid and a.tipo = 'nf')
           or not exists (select 1 from public.concrem_relatorio_entrega_anexos a
                          where a.carregamento_id = l.id and a.pedido_id = pid and a.tipo like 'boleto%')) = 0
        then 'Em Rota'
      else 'Aguardando Despacho'
    end as status_correto
  from public.concrem_programacoes_embarque l
)
select id, status_atual, status_correto, cardinality((select pedidos from public.concrem_programacoes_embarque e where e.id = alvo.id)) as pedidos
from alvo
where status_correto <> status_atual
order by status_atual, id;

-- ── PASSO 2 — CORREÇÃO (aplica). Rode após conferir o PASSO 1. ───────────────
-- Desliga o trigger de avanço-only para permitir o ajuste (inclusive rebaixar).
-- (tolerante: não falha se o trigger ainda não existir)
do $$ begin
  alter table public.concrem_programacoes_embarque disable trigger trg_aplica_status_carregamento;
exception when others then null; end $$;

with alvo as (
  select
    l.id,
    l.shipment_status as status_atual,
    case
      when l.shipment_status = 'Cancelado' then 'Cancelado'
      when l.pedidos is null or cardinality(l.pedidos) = 0 then 'Aguardando Despacho'
      when (select count(*) from unnest(l.pedidos) pid where not exists (
              select 1 from public.concrem_relatorio_entrega_anexos a
              where a.carregamento_id = l.id and a.pedido_id = pid and a.tipo like 'comprovante%')) = 0
        then 'Entregue'
      when (select count(*) from unnest(l.pedidos) pid where
              not exists (select 1 from public.concrem_relatorio_entrega_anexos a
                          where a.carregamento_id = l.id and a.pedido_id = pid and a.tipo = 'nf')
           or not exists (select 1 from public.concrem_relatorio_entrega_anexos a
                          where a.carregamento_id = l.id and a.pedido_id = pid and a.tipo like 'boleto%')) = 0
        then 'Em Rota'
      else 'Aguardando Despacho'
    end as status_correto
  from public.concrem_programacoes_embarque l
)
update public.concrem_programacoes_embarque l
set shipment_status = a.status_correto, updated_at = now()
from alvo a
where l.id = a.id
  and l.shipment_status <> 'Cancelado'
  and a.status_correto <> l.shipment_status;

-- Religa o trigger.
do $$ begin
  alter table public.concrem_programacoes_embarque enable trigger trg_aplica_status_carregamento;
exception when others then null; end $$;

-- ── VERIFICAÇÃO: rode o PASSO 1 de novo — deve voltar 0 linhas. ──────────────
-- ROLLBACK: não há rollback automático (é correção de dados). Faça um backup/
-- snapshot da coluna antes, se desejar:
--   -- create table _bkp_status_carga as
--   --   select id, shipment_status, now() as em from public.concrem_programacoes_embarque;
-- ============================================================================
