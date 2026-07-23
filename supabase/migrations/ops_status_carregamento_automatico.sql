-- ============================================================================
-- Status do carregamento — regras atualizadas.
--   • TRAVA (única, no banco): não deixa ir para 'Entregue' sem comprovante em
--     TODOS os pedidos.
--   • 'Em Rota' é determinado apenas pela NF (todos os pedidos com 'nf') —
--     boleto NÃO é mais exigido. Aplicado como AUTO-avanço (advance-only).
--   • Aguardando Despacho / Despachado / Em Rota / Cancelado podem ser MANUAIS
--     (o trigger não sobrescreve, só avança conforme os documentos e barra o
--     Entregue indevido).
--
-- Reaplicar (create or replace). Coluna pedidos é text[]; id é text.
-- ============================================================================

-- Ordem canônica dos status
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

-- Status determinado pelos DOCUMENTOS: 'Entregue' | 'Em Rota' | null
--   Entregue = todos com comprovante; Em Rota = todos com NF (sem boleto).
create or replace function public.status_carga_por_docs(p_id text, p_pedidos text[])
returns text language plpgsql stable security definer set search_path = public as $$
declare v_sem_comp int; v_sem_nf int;
begin
  if p_pedidos is null or array_length(p_pedidos, 1) is null then return null; end if;

  select count(*) into v_sem_comp
  from unnest(p_pedidos) as pid
  where not exists (
    select 1 from public.concrem_relatorio_entrega_anexos a
    where a.carregamento_id = p_id and a.pedido_id = pid and a.tipo like 'comprovante%'
  );
  if v_sem_comp = 0 then return 'Entregue'; end if;

  select count(*) into v_sem_nf
  from unnest(p_pedidos) as pid
  where not exists (
    select 1 from public.concrem_relatorio_entrega_anexos a
    where a.carregamento_id = p_id and a.pedido_id = pid and a.tipo = 'nf'
  );
  if v_sem_nf = 0 then return 'Em Rota'; end if;

  return null;
end;
$$;

-- BEFORE INSERT/UPDATE: barra Entregue sem comprovante (trava) e auto-avança
-- conforme os documentos (advance-only). Demais status ficam como o cliente
-- enviou (manuais).
create or replace function public.aplica_status_carregamento()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_doc text;
begin
  if new.shipment_status = 'Cancelado' then
    return new;  -- manual/administrativo
  end if;

  v_doc := public.status_carga_por_docs(new.id, new.pedidos);

  -- TRAVA: não permite Entregue sem comprovante em todos os pedidos.
  if new.shipment_status = 'Entregue'
     and (tg_op = 'INSERT' or old.shipment_status is distinct from 'Entregue')
     and v_doc is distinct from 'Entregue' then
    raise exception 'Não é possível marcar como Entregue: há pedido(s) sem comprovante de entrega.'
      using errcode = 'P0001';
  end if;

  -- AUTO-avanço conforme documentos (nunca rebaixa; não força status manual p/ baixo).
  if v_doc is not null and public.carga_status_order(v_doc) > public.carga_status_order(new.shipment_status) then
    new.shipment_status := v_doc;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_aplica_status_carregamento on public.concrem_programacoes_embarque;
create trigger trg_aplica_status_carregamento
  before insert or update on public.concrem_programacoes_embarque
  for each row execute function public.aplica_status_carregamento();

-- Ao anexar/remover/alterar documento: reprocessa a carga (dispara o BEFORE acima).
create or replace function public.recomputa_status_por_anexo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cid text;
begin
  v_cid := coalesce(new.carregamento_id, old.carregamento_id);
  if v_cid is not null then
    update public.concrem_programacoes_embarque set updated_at = now() where id = v_cid;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recomputa_status_por_anexo on public.concrem_relatorio_entrega_anexos;
create trigger trg_recomputa_status_por_anexo
  after insert or update or delete on public.concrem_relatorio_entrega_anexos
  for each row execute function public.recomputa_status_por_anexo();

-- ── VERIFICAÇÃO ──────────────────────────────────────────────────────────────
-- Anexar NF a todos os pedidos → carga vira 'Em Rota' (não precisa de boleto).
-- Anexar comprovante a todos → 'Entregue'. Tentar Entregue sem comprovante em
-- todos os pedidos → erro. Aguardando/Despachado/Em Rota podem ser definidos
-- manualmente (o auto-avanço só sobe conforme os documentos).
-- ============================================================================
