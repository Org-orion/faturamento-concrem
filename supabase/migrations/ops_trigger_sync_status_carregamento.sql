-- ============================================================================
-- Sincronização AUTOMÁTICA do status do pedido a partir do carregamento.
-- Corrige a causa raiz de pedidos "presos" (ex.: carga Entregue mas pedido em
-- em_entrega): o app só sincronizava na transição via updateLoad e com um gate
-- frágil (concrem_entregas). Este trigger roda no banco, em QUALQUER caminho
-- que altere a carga (app, dashboard, import, edição direta).
--
-- Regra (mesma do app): mapeia shipment_status → status do pedido e AVANÇA
-- (nunca rebaixa), ignorando pedidos na lixeira. Registra histórico.
--   Aguardando Despacho → em_carregamento
--   Despachado          → despachado
--   Em Rota             → em_entrega
--   Entregue            → entregue
--   (Cancelado/outros   → não faz nada; reversão é tratada pelo app)
--
-- Coluna concrem_programacoes_embarque.pedidos é text[].
-- Aplicar no SQL Editor do Supabase.
-- ============================================================================

-- 1) Ordem canônica dos status (espelha pedidoStatusFlow.ts)
create or replace function public.pedido_status_order(p_status text)
returns int language sql immutable as $$
  select case p_status
    when 'aguardando_avaliacao'   then 1
    when 'aguardando_mapeamento'  then 2
    when 'mapeamento_concluido'   then 3
    when 'aguardando_ferragem'    then 4
    when 'ferragem_recebida'      then 5
    when 'liberado_comercial'     then 6
    when 'aguardando_gerencia'    then 7
    when 'confirmado_gerencia'    then 8
    when 'liberado_producao'      then 9
    when 'em_producao'            then 10
    when 'producao_finalizada'    then 11
    when 'em_carregamento'        then 12
    when 'despachado'             then 13
    when 'faturado'               then 14
    when 'em_entrega'             then 15
    when 'parcialmente_entregue'  then 16
    when 'entregue'               then 17
    when 'aguardando_pagamento'   then 18
    when 'finalizado'             then 19
    else 0
  end;
$$;

-- 2) Trigger: sincroniza (avanço) os pedidos da carga
create or replace function public.sync_pedido_status_por_carregamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target text;
  v_order  int;
begin
  -- Em UPDATE, só age se mudou o status da carga ou a lista de pedidos.
  if tg_op = 'UPDATE'
     and new.shipment_status is not distinct from old.shipment_status
     and new.pedidos         is not distinct from old.pedidos then
    return new;
  end if;

  v_target := case new.shipment_status
    when 'Aguardando Despacho' then 'em_carregamento'
    when 'Despachado'          then 'despachado'
    when 'Em Rota'             then 'em_entrega'
    when 'Entregue'            then 'entregue'
    else null
  end;

  if v_target is null or new.pedidos is null or array_length(new.pedidos, 1) is null then
    return new;
  end if;
  v_order := public.pedido_status_order(v_target);

  -- Histórico dos que realmente vão avançar
  insert into public.concrem_pedidos_status_historico
    (pedido_id, numero_pedido, status_anterior, status_novo, alterado_em, alterado_por, observacao)
  select s.pedido_id, coalesce(s.numero_pedido, s.pedido_id), s.status_atual, v_target, now(), 'trigger_carregamento',
         'Sincronizado automaticamente com o carregamento ' || new.id || ' (' || new.shipment_status || ').'
  from public.concrem_pedidos_status s
  where s.pedido_id = any (new.pedidos)
    and s.excluido_em is null
    and public.pedido_status_order(s.status_atual) < v_order;

  -- Avanço (nunca rebaixa; ignora lixeira)
  update public.concrem_pedidos_status s
  set status_atual = v_target, atualizado_em = now(), atualizado_por = 'trigger_carregamento'
  where s.pedido_id = any (new.pedidos)
    and s.excluido_em is null
    and public.pedido_status_order(s.status_atual) < v_order;

  return new;
end;
$$;

drop trigger if exists trg_sync_pedido_status_carregamento on public.concrem_programacoes_embarque;
create trigger trg_sync_pedido_status_carregamento
  after insert or update on public.concrem_programacoes_embarque
  for each row execute function public.sync_pedido_status_por_carregamento();

-- ── VERIFICAÇÃO ──────────────────────────────────────────────────────────────
-- Depois de aplicar, marque uma carga como "Entregue" (ou rode um UPDATE de
-- teste) e confira que os pedidos dela avançam para 'entregue' automaticamente,
-- com uma linha em concrem_pedidos_status_historico (alterado_por='trigger_carregamento').
--
-- ROLLBACK:
--   drop trigger if exists trg_sync_pedido_status_carregamento on public.concrem_programacoes_embarque;
--   drop function if exists public.sync_pedido_status_por_carregamento();
--   drop function if exists public.pedido_status_order(text);
-- ============================================================================
