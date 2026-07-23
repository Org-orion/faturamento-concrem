-- ============================================================================
-- DIAGNÓSTICO (somente leitura) — carregamentos JÁ marcados 'Entregue' que não
-- têm comprovante em todos os pedidos. Objetivo: identificar entregas antigas
-- consideradas concluídas sem comprovação. Não altera nada.
-- ============================================================================
select
  l.id                                   as carregamento,
  l.shipment_status,
  l.driver_id,
  l.planned_date,
  cardinality(l.pedidos)                 as total_pedidos,
  (
    select count(*)
    from unnest(l.pedidos) as pid
    where not exists (
      select 1 from public.concrem_relatorio_entrega_anexos a
      where a.carregamento_id = l.id and a.pedido_id = pid and a.tipo like 'comprovante%'
    )
  )                                      as pedidos_sem_comprovante
from public.concrem_programacoes_embarque l
where l.shipment_status = 'Entregue'
  and l.pedidos is not null
  and exists (
    select 1 from unnest(l.pedidos) as pid
    where not exists (
      select 1 from public.concrem_relatorio_entrega_anexos a
      where a.carregamento_id = l.id and a.pedido_id = pid and a.tipo like 'comprovante%'
    )
  )
order by pedidos_sem_comprovante desc, l.planned_date desc;
-- ============================================================================
