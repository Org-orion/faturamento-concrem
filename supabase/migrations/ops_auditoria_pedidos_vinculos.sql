-- ============================================================================
-- AUDITORIA (SOMENTE LEITURA) — Agrupamento de Pedidos (vínculos complementares).
--
-- Diagnóstico de inconsistências na estrutura de vínculos. NÃO altera dados,
-- NÃO corrige nada. Rode cada bloco no SQL Editor e analise as linhas retornadas
-- (idealmente TODOS devem retornar 0 linhas). Reexecutável a qualquer momento.
--
-- Tabelas: concrem_pedidos_vinculos, concrem_pedidos_vinculos_historico,
--          concrem_pedidos_status (existência/lixeira), concrem_programacoes_embarque (cargas).
-- ============================================================================

-- 1) Pedido VINCULADO a mais de um grupo ativo (não deveria existir — índice único).
select 'vinculado_em_multiplos_grupos' as problema, pedido_vinculado_id, count(*) as ocorrencias,
       array_agg(pedido_principal_id) as principais
from public.concrem_pedidos_vinculos
where ativo
group by pedido_vinculado_id
having count(*) > 1;

-- 2) Vínculo ATIVO duplicado (mesmo par principal/vinculado).
select 'vinculo_ativo_duplicado' as problema, pedido_principal_id, pedido_vinculado_id, count(*) as ocorrencias
from public.concrem_pedidos_vinculos
where ativo
group by pedido_principal_id, pedido_vinculado_id
having count(*) > 1;

-- 3) Auto-vínculo (pedido vinculado a si mesmo).
select 'auto_vinculo' as problema, id, pedido_principal_id, pedido_vinculado_id
from public.concrem_pedidos_vinculos
where ativo and pedido_principal_id = pedido_vinculado_id;

-- 4) Estrutura plana violada: um pedido é PRINCIPAL e VINCULADO ao mesmo tempo
--    (aninhamento — não deveria ocorrer com o trigger de validação).
select 'principal_e_vinculado' as problema, p.pedido_principal_id as pedido
from public.concrem_pedidos_vinculos p
where p.ativo
  and exists (select 1 from public.concrem_pedidos_vinculos v
              where v.ativo and v.pedido_vinculado_id = p.pedido_principal_id);

-- 5) Ciclo direto (A vincula B e B vincula A).
select distinct 'ciclo_direto' as problema, a.pedido_principal_id, a.pedido_vinculado_id
from public.concrem_pedidos_vinculos a
join public.concrem_pedidos_vinculos b
  on a.pedido_principal_id = b.pedido_vinculado_id
 and a.pedido_vinculado_id = b.pedido_principal_id
where a.ativo and b.ativo;

-- 6) Pedido inexistente na base operacional (sem linha em concrem_pedidos_status).
select 'pedido_inexistente' as problema, v.id, v.pedido_principal_id, v.pedido_vinculado_id
from public.concrem_pedidos_vinculos v
where v.ativo
  and (not exists (select 1 from public.concrem_pedidos_status s where s.pedido_id = v.pedido_principal_id)
    or not exists (select 1 from public.concrem_pedidos_status s where s.pedido_id = v.pedido_vinculado_id));

-- 7) Pedido EXCLUÍDO (lixeira) participando de grupo ativo.
select distinct 'pedido_excluido_em_grupo' as problema, s.pedido_id, s.excluido_em
from public.concrem_pedidos_vinculos v
join public.concrem_pedidos_status s
  on s.pedido_id in (v.pedido_principal_id, v.pedido_vinculado_id)
where v.ativo and s.excluido_em is not null;

-- 8) Grupo com pedidos espalhados em CARREGAMENTOS diferentes (não cancelados).
with membros as (
  select pedido_principal_id as principal, pedido_principal_id as pedido from public.concrem_pedidos_vinculos where ativo
  union
  select pedido_principal_id, pedido_vinculado_id from public.concrem_pedidos_vinculos where ativo
),
carga_do_pedido as (
  select m.principal, m.pedido, l.id as carga
  from membros m
  join public.concrem_programacoes_embarque l on m.pedido = any (l.pedidos)
  where coalesce(l.shipment_status, '') <> 'Cancelado'
)
select 'grupo_em_cargas_diferentes' as problema, principal,
       count(distinct carga) as qtd_cargas, array_agg(distinct carga) as cargas
from carga_do_pedido
group by principal
having count(distinct carga) > 1;

-- 9) Grupo PARCIALMENTE liberado (nem todos os membros em 'liberado_producao').
with membros as (
  select pedido_principal_id as principal, pedido_principal_id as pedido from public.concrem_pedidos_vinculos where ativo
  union
  select pedido_principal_id, pedido_vinculado_id from public.concrem_pedidos_vinculos where ativo
)
select 'grupo_parcialmente_liberado' as problema, m.principal,
       count(*) filter (where s.status_atual = 'liberado_producao') as liberados,
       count(*) as total_membros
from membros m
left join public.concrem_pedidos_status s on s.pedido_id = m.pedido
group by m.principal
having count(*) filter (where s.status_atual = 'liberado_producao') <> count(*);

-- 10) Vínculo ativo SEM autoria registrada.
select 'vinculo_sem_autoria' as problema, id, pedido_principal_id, pedido_vinculado_id, criado_em
from public.concrem_pedidos_vinculos
where ativo and (criado_por is null or btrim(criado_por) = '');

-- 11) Vínculo ativo SEM evento de criação no histórico (inconsistência de auditoria).
select 'vinculo_sem_historico' as problema, v.id, v.pedido_principal_id, v.pedido_vinculado_id
from public.concrem_pedidos_vinculos v
where v.ativo
  and not exists (
    select 1 from public.concrem_pedidos_vinculos_historico h
    where h.pedido_principal_id = v.pedido_principal_id
      and h.pedido_vinculado_id = v.pedido_vinculado_id
      and h.evento in ('GRUPO_CRIADO', 'VINCULO_ADICIONADO', 'TRANSFERENCIA'));

-- ── RESUMO (contagens rápidas) ───────────────────────────────────────────────
select
  (select count(*) from public.concrem_pedidos_vinculos where ativo) as vinculos_ativos,
  (select count(distinct pedido_principal_id) from public.concrem_pedidos_vinculos where ativo) as grupos_ativos,
  (select count(*) from public.concrem_pedidos_vinculos where not ativo) as vinculos_historicos_inativos;
-- ============================================================================
