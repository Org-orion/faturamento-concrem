-- ============================================================================
-- AVANÇO (execução única) — sobe o status dos carregamentos que JÁ cumprem os
-- critérios documentais mas ainda não avançaram (docs anexados antes do trigger
-- existir). AVANÇO-ONLY (nunca rebaixa):
--   • todos os pedidos com comprovante  → 'Entregue'
--   • senão, todos com NF               → 'Em Rota'
--   • senão                             → mantém o status atual
-- Não mexe em 'Cancelado'. Requer ops_status_carregamento_automatico.sql
-- aplicado (usa a função public.carga_status_order).
-- ============================================================================

-- ── PASSO 1 — AUDITORIA (somente leitura): o que vai avançar ─────────────────
with alvo as (
  select
    l.id,
    l.shipment_status as status_atual,
    case
      when (select count(*) from unnest(l.pedidos) pid where not exists (
              select 1 from public.concrem_relatorio_entrega_anexos a
              where a.carregamento_id = l.id and a.pedido_id = pid and a.tipo like 'comprovante%')) = 0
        then 'Entregue'
      when (select count(*) from unnest(l.pedidos) pid where not exists (
              select 1 from public.concrem_relatorio_entrega_anexos a
              where a.carregamento_id = l.id and a.pedido_id = pid and a.tipo = 'nf')) = 0
        then 'Em Rota'
      else l.shipment_status
    end as status_doc
  from public.concrem_programacoes_embarque l
  where l.shipment_status <> 'Cancelado' and l.pedidos is not null
)
select id, status_atual, status_doc
from alvo
where public.carga_status_order(status_doc) > public.carga_status_order(status_atual)
order by status_doc, id;

-- ── PASSO 2 — APLICAR (após conferir o PASSO 1) ─────────────────────────────
with alvo as (
  select
    l.id,
    case
      when (select count(*) from unnest(l.pedidos) pid where not exists (
              select 1 from public.concrem_relatorio_entrega_anexos a
              where a.carregamento_id = l.id and a.pedido_id = pid and a.tipo like 'comprovante%')) = 0
        then 'Entregue'
      when (select count(*) from unnest(l.pedidos) pid where not exists (
              select 1 from public.concrem_relatorio_entrega_anexos a
              where a.carregamento_id = l.id and a.pedido_id = pid and a.tipo = 'nf')) = 0
        then 'Em Rota'
      else l.shipment_status
    end as status_doc
  from public.concrem_programacoes_embarque l
  where l.shipment_status <> 'Cancelado' and l.pedidos is not null
)
update public.concrem_programacoes_embarque l
set shipment_status = a.status_doc, updated_at = now()
from alvo a
where l.id = a.id
  and public.carga_status_order(a.status_doc) > public.carga_status_order(l.shipment_status);

-- VERIFICAÇÃO: rode o PASSO 1 de novo — deve voltar 0 linhas.
-- Obs.: o trigger de pedidos (avanço-only) sincroniza os status dos pedidos
-- automaticamente quando o status da carga avança.
-- ============================================================================
