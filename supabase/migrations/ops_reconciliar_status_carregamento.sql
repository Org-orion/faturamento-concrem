-- ============================================================================
-- RECONCILIAÇÃO (execução única) — com as regras atualizadas, o ÚNICO estado
-- inválido é 'Entregue' SEM comprovante em todos os pedidos (os demais status
-- passaram a ser manuais). Este script rebaixa essas cargas para o status que
-- os documentos justificam: 'Em Rota' se todos têm NF, senão 'Aguardando
-- Despacho'. Não mexe em cargas Aguardando/Despachado/Em Rota/Cancelado.
--
-- Reaplicar após ops_status_carregamento_automatico.sql. Desliga o trigger
-- avanço-only durante a correção (para permitir o downgrade) e religa no fim.
-- ============================================================================

-- ── PASSO 1 — AUDITORIA (somente leitura): cargas 'Entregue' sem comprovante ──
with alvo as (
  select
    l.id,
    l.shipment_status as status_atual,
    (select count(*) from unnest(l.pedidos) pid where not exists (
       select 1 from public.concrem_relatorio_entrega_anexos a
       where a.carregamento_id = l.id and a.pedido_id = pid and a.tipo like 'comprovante%')) as pedidos_sem_comprovante,
    (select count(*) from unnest(l.pedidos) pid where not exists (
       select 1 from public.concrem_relatorio_entrega_anexos a
       where a.carregamento_id = l.id and a.pedido_id = pid and a.tipo = 'nf')) as pedidos_sem_nf
  from public.concrem_programacoes_embarque l
  where l.shipment_status = 'Entregue' and l.pedidos is not null
)
select id, status_atual,
       case when pedidos_sem_nf = 0 then 'Em Rota' else 'Aguardando Despacho' end as status_correto,
       pedidos_sem_comprovante, pedidos_sem_nf
from alvo
where pedidos_sem_comprovante > 0
order by id;

-- ── PASSO 2 — CORREÇÃO (aplica após conferir o PASSO 1) ──────────────────────
do $$ begin
  alter table public.concrem_programacoes_embarque disable trigger trg_aplica_status_carregamento;
exception when others then null; end $$;

update public.concrem_programacoes_embarque l
set shipment_status = case
      when (select count(*) from unnest(l.pedidos) pid where not exists (
              select 1 from public.concrem_relatorio_entrega_anexos a
              where a.carregamento_id = l.id and a.pedido_id = pid and a.tipo = 'nf')) = 0
        then 'Em Rota'
      else 'Aguardando Despacho'
    end,
    updated_at = now()
where l.shipment_status = 'Entregue'
  and l.pedidos is not null
  and exists (
    select 1 from unnest(l.pedidos) pid
    where not exists (
      select 1 from public.concrem_relatorio_entrega_anexos a
      where a.carregamento_id = l.id and a.pedido_id = pid and a.tipo like 'comprovante%'
    )
  );

do $$ begin
  alter table public.concrem_programacoes_embarque enable trigger trg_aplica_status_carregamento;
exception when others then null; end $$;

-- VERIFICAÇÃO: rode o PASSO 1 de novo — deve voltar 0 linhas.
-- Backup opcional antes: create table _bkp_status_carga as
--   select id, shipment_status, now() as em from public.concrem_programacoes_embarque;
-- ============================================================================
