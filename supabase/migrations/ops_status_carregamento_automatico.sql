-- ============================================================================
-- Status do carregamento AUTOMÁTICO e dirigido por documentos (camada confiável).
-- Regras (definidas pelo dono):
--   • 'Em Rota'  quando TODOS os pedidos têm NF (tipo 'nf') e boleto ('boleto%').
--   • 'Entregue' quando TODOS os pedidos têm comprovante ('comprovante%').
--   • Avanço apenas (nunca rebaixa). 'Cancelado' é ação manual permitida.
--   • 'Despachado' saiu do fluxo (mantido só na ordem p/ compatibilidade de dados antigos).
--
-- O status deixa de ser definido manualmente: o BEFORE trigger SEMPRE recalcula
-- a partir dos documentos, ignorando o valor enviado pelo cliente (exceto
-- 'Cancelado'). Assim, nenhuma requisição do navegador avança o status
-- indevidamente. Um segundo trigger, na tabela de anexos, reprocessa a carga
-- quando um documento é anexado/removido.
--
-- Tabelas: concrem_programacoes_embarque (pedidos text[], id text 'EMB-...'),
-- concrem_relatorio_entrega_anexos (carregamento_id, pedido_id, tipo).
-- ============================================================================

-- Ordem canônica dos status de expedição
create or replace function public.carga_status_order(s text)
returns int language sql immutable as $$
  select case s
    when 'Aguardando Despacho' then 1
    when 'Despachado'          then 2
    when 'Em Rota'             then 3
    when 'Entregue'            then 4
    else 0
  end;
$$;

-- Status que os DOCUMENTOS determinam para a carga: 'Entregue' | 'Em Rota' | null
create or replace function public.status_carga_por_docs(p_id text, p_pedidos text[])
returns text language plpgsql stable security definer set search_path = public as $$
declare v_sem_comp int; v_sem_nfbol int;
begin
  if p_pedidos is null or array_length(p_pedidos, 1) is null then return null; end if;

  -- todos com comprovante?
  select count(*) into v_sem_comp
  from unnest(p_pedidos) as pid
  where not exists (
    select 1 from public.concrem_relatorio_entrega_anexos a
    where a.carregamento_id = p_id and a.pedido_id = pid and a.tipo like 'comprovante%'
  );
  if v_sem_comp = 0 then return 'Entregue'; end if;

  -- todos com NF e boleto?
  select count(*) into v_sem_nfbol
  from unnest(p_pedidos) as pid
  where not exists (
          select 1 from public.concrem_relatorio_entrega_anexos a
          where a.carregamento_id = p_id and a.pedido_id = pid and a.tipo = 'nf')
     or not exists (
          select 1 from public.concrem_relatorio_entrega_anexos a
          where a.carregamento_id = p_id and a.pedido_id = pid and a.tipo like 'boleto%');
  if v_sem_nfbol = 0 then return 'Em Rota'; end if;

  return null;
end;
$$;

-- BEFORE INSERT/UPDATE na carga: recalcula o status a partir dos documentos
-- (avanço-only), ignorando avanço manual. 'Cancelado' passa direto.
create or replace function public.aplica_status_carregamento()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_doc text; v_target text;
begin
  if new.shipment_status = 'Cancelado' then
    return new;  -- cancelamento é manual/administrativo
  end if;

  -- piso = status antigo (nunca rebaixa); em INSERT começa em 'Aguardando Despacho'
  v_target := case
    when tg_op = 'UPDATE' and old.shipment_status is not null and old.shipment_status <> 'Cancelado'
      then old.shipment_status
    else 'Aguardando Despacho'
  end;

  v_doc := public.status_carga_por_docs(new.id, new.pedidos);
  if v_doc is not null and public.carga_status_order(v_doc) > public.carga_status_order(v_target) then
    v_target := v_doc;
  end if;

  new.shipment_status := v_target;  -- autoridade: ignora o status enviado pelo cliente
  return new;
end;
$$;

drop trigger if exists trg_aplica_status_carregamento on public.concrem_programacoes_embarque;
create trigger trg_aplica_status_carregamento
  before insert or update on public.concrem_programacoes_embarque
  for each row execute function public.aplica_status_carregamento();

-- Ao anexar/remover/alterar um documento: reprocessa a carga (toca updated_at,
-- disparando o BEFORE acima, que recalcula o status).
create or replace function public.recomputa_status_por_anexo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cid text;
begin
  v_cid := coalesce(new.carregamento_id, old.carregamento_id);
  if v_cid is not null then
    update public.concrem_programacoes_embarque
      set updated_at = now()
      where id = v_cid;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recomputa_status_por_anexo on public.concrem_relatorio_entrega_anexos;
create trigger trg_recomputa_status_por_anexo
  after insert or update or delete on public.concrem_relatorio_entrega_anexos
  for each row execute function public.recomputa_status_por_anexo();

-- ── VERIFICAÇÃO ──────────────────────────────────────────────────────────────
-- Anexe NF+boleto a todos os pedidos de uma carga → shipment_status vira 'Em Rota'.
-- Anexe comprovante a todos → vira 'Entregue'. Tentar mudar o status pelo app/
-- requisição não avança sem os documentos.
--
-- ROLLBACK:
--   drop trigger if exists trg_recomputa_status_por_anexo on public.concrem_relatorio_entrega_anexos;
--   drop trigger if exists trg_aplica_status_carregamento on public.concrem_programacoes_embarque;
--   drop function if exists public.recomputa_status_por_anexo();
--   drop function if exists public.aplica_status_carregamento();
--   drop function if exists public.status_carga_por_docs(text, text[]);
--   drop function if exists public.carga_status_order(text);
-- ============================================================================
