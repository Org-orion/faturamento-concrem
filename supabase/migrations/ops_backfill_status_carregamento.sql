-- ============================================================================
-- BACKFILL (execução ÚNICA) — corrige o status dos pedidos que já estão
-- defasados em relação ao carregamento (ex.: 161239 com carga mas ainda em
-- liberado_producao; pedidos presos em em_entrega com carga Entregue).
--
-- PRÉ-REQUISITO: rodar antes o ops_trigger_sync_status_carregamento.sql
-- (cria a função public.pedido_status_order). Depois deste backfill, o trigger
-- mantém tudo sincronizado automaticamente.
--
-- Regra: AVANÇA (nunca rebaixa), ignora lixeira. Se um pedido está em várias
-- cargas ativas, usa o status mais avançado.
-- ============================================================================

-- ── PASSO 1 — AUDITORIA (somente leitura): o que está errado e o que vai mudar
-- Rode primeiro para revisar. Não altera nada.
with alvo as (
  select unnest(l.pedidos) as pedido_id,
         case l.shipment_status
           when 'Aguardando Despacho' then 'em_carregamento'
           when 'Despachado'          then 'despachado'
           when 'Em Rota'             then 'em_entrega'
           when 'Entregue'            then 'entregue'
         end as target
  from public.concrem_programacoes_embarque l
  where l.shipment_status in ('Aguardando Despacho','Despachado','Em Rota','Entregue')
    and l.pedidos is not null
),
melhor as (
  select pedido_id, target from (
    select pedido_id, target,
           row_number() over (partition by pedido_id order by public.pedido_status_order(target) desc) rn
    from alvo
  ) t where rn = 1
)
select s.pedido_id,
       s.status_atual              as status_atual,
       m.target                    as status_correto
from public.concrem_pedidos_status s
join melhor m on m.pedido_id = s.pedido_id
where s.excluido_em is null
  and public.pedido_status_order(s.status_atual) < public.pedido_status_order(m.target)
order by s.pedido_id;

-- ── PASSO 2 — CORREÇÃO (aplica). Rode após conferir o PASSO 1. ───────────────
-- 2a) histórico
with alvo as (
  select unnest(l.pedidos) as pedido_id,
         case l.shipment_status
           when 'Aguardando Despacho' then 'em_carregamento'
           when 'Despachado'          then 'despachado'
           when 'Em Rota'             then 'em_entrega'
           when 'Entregue'            then 'entregue'
         end as target
  from public.concrem_programacoes_embarque l
  where l.shipment_status in ('Aguardando Despacho','Despachado','Em Rota','Entregue')
    and l.pedidos is not null
),
melhor as (
  select pedido_id, target from (
    select pedido_id, target,
           row_number() over (partition by pedido_id order by public.pedido_status_order(target) desc) rn
    from alvo
  ) t where rn = 1
)
insert into public.concrem_pedidos_status_historico
  (pedido_id, numero_pedido, status_anterior, status_novo, alterado_em, alterado_por, observacao)
select s.pedido_id, coalesce(s.numero_pedido, s.pedido_id), s.status_atual, m.target, now(), 'backfill_carregamento',
       'Correcao unica: status sincronizado com o carregamento.'
from public.concrem_pedidos_status s
join melhor m on m.pedido_id = s.pedido_id
where s.excluido_em is null
  and public.pedido_status_order(s.status_atual) < public.pedido_status_order(m.target);

-- 2b) update (avanço)
with alvo as (
  select unnest(l.pedidos) as pedido_id,
         case l.shipment_status
           when 'Aguardando Despacho' then 'em_carregamento'
           when 'Despachado'          then 'despachado'
           when 'Em Rota'             then 'em_entrega'
           when 'Entregue'            then 'entregue'
         end as target
  from public.concrem_programacoes_embarque l
  where l.shipment_status in ('Aguardando Despacho','Despachado','Em Rota','Entregue')
    and l.pedidos is not null
),
melhor as (
  select pedido_id, target from (
    select pedido_id, target,
           row_number() over (partition by pedido_id order by public.pedido_status_order(target) desc) rn
    from alvo
  ) t where rn = 1
)
update public.concrem_pedidos_status s
set status_atual = m.target, atualizado_em = now(), atualizado_por = 'backfill_carregamento'
from melhor m
where s.pedido_id = m.pedido_id
  and s.excluido_em is null
  and public.pedido_status_order(s.status_atual) < public.pedido_status_order(m.target);
-- ============================================================================
