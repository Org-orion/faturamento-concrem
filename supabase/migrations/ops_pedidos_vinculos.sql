-- ============================================================================
-- Agrupamento de Pedidos (Vínculo de Pedidos Complementares) — ETAPA 1 (dados).
--
-- Regra: um PEDIDO PRINCIPAL agrupa vários PEDIDOS VINCULADOS. Estrutura PLANA
-- (2 níveis): um pedido não pode ser, ao mesmo tempo, vinculado de um grupo e
-- principal de outro; sem ciclos; sem aninhamento. O vínculo é por
-- numero_pedido (text) — os pedidos vivem em ERP-espelho (concrem_pedidos_venda,
-- sem FK controlada por nós); a autoridade de existência/exclusão é a tabela
-- OWNED pelo app: concrem_pedidos_status (excluido_em).
--
-- `ped_compra_cliente = COMPLEMENTO` é apenas SUGESTÃO (não é a fonte do vínculo).
--
-- Enforcement no BANCO (não só na UI): constraints + índices parciais únicos +
-- trigger BEFORE. RLS permissiva (mesma postura das demais tabelas operacionais);
-- as regras vivem no trigger/RPC. Requer ops_auth_supabase_fundacao.sql
-- (is_admin, current_usuario_id) e concrem_pedidos_status. Reaplicável.
-- ============================================================================

-- 1) Tabela de vínculos (autoridade do agrupamento) ─────────────────────────
create table if not exists public.concrem_pedidos_vinculos (
  id                  uuid primary key default gen_random_uuid(),
  pedido_principal_id text not null,
  pedido_vinculado_id text not null,
  origem_vinculo      text not null default 'manual' check (origem_vinculo in ('complemento','manual')),
  ativo               boolean not null default true,
  criado_em           timestamptz not null default now(),
  criado_por          text null,
  removido_em         timestamptz null,
  removido_por        text null,
  motivo_remocao      text null,
  constraint chk_vinculo_nao_auto check (pedido_principal_id <> pedido_vinculado_id)
);

-- Um pedido só pode ser VINCULADO ATIVO de UM grupo (⇒ sem duplicidade e sem
-- pertencer a dois grupos). Cobre também o par (principal,vinculado) duplicado.
create unique index if not exists uq_vinculo_ativo_vinculado
  on public.concrem_pedidos_vinculos (pedido_vinculado_id) where ativo;
create index if not exists idx_vinculo_ativo_principal
  on public.concrem_pedidos_vinculos (pedido_principal_id) where ativo;

alter table public.concrem_pedidos_vinculos enable row level security;
drop policy if exists pedidos_vinculos_all on public.concrem_pedidos_vinculos;
create policy pedidos_vinculos_all on public.concrem_pedidos_vinculos
  for all to anon, authenticated using (true) with check (true);
grant all on public.concrem_pedidos_vinculos to anon, authenticated;

-- 2) Auditoria (append-only) ────────────────────────────────────────────────
create table if not exists public.concrem_pedidos_vinculos_historico (
  id                 bigint generated always as identity primary key,
  evento             text not null,   -- GRUPO_CRIADO | VINCULO_ADICIONADO | VINCULO_REMOVIDO |
                                       -- GRUPO_DISSOLVIDO | TRANSFERENCIA | INCLUSAO_CARGA_GRUPO |
                                       -- INCLUSAO_CARGA_ISOLADA | CONFIRMACAO_NAO_SINALIZADO |
                                       -- CONFIRMACAO_CLIENTE_DIVERGENTE
  pedido_principal_id text null,
  pedido_vinculado_id text null,
  carregamento_id     text null,
  detalhe             jsonb null,
  realizado_por       text null,
  realizado_por_nome  text null,
  realizado_em        timestamptz not null default now()
);
create index if not exists idx_vinc_hist_principal on public.concrem_pedidos_vinculos_historico (pedido_principal_id);
create index if not exists idx_vinc_hist_vinculado on public.concrem_pedidos_vinculos_historico (pedido_vinculado_id);

alter table public.concrem_pedidos_vinculos_historico enable row level security;
drop policy if exists pedidos_vinculos_hist_all on public.concrem_pedidos_vinculos_historico;
create policy pedidos_vinculos_hist_all on public.concrem_pedidos_vinculos_historico
  for all to anon, authenticated using (true) with check (true);
grant all on public.concrem_pedidos_vinculos_historico to anon, authenticated;

-- 3) Helper de permissão efetiva (espelha computeEffectiveFuncionalidades do TS)
--    Admin (is_admin) e super-admin 'kmz' liberados; senão resolve grupo + diff.
create or replace function public.tem_funcionalidade(p_key text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_email text; v_perfil text; v_grupo_nome text; v_ativo boolean;
  base jsonb; stored jsonb;
begin
  select u.email, u.perfil_acesso, coalesce(u.ativo, true), g.nome, coalesce(g.funcionalidades, '[]'::jsonb), u.funcionalidades
    into v_email, v_perfil, v_ativo, v_grupo_nome, base, stored
  from public.concrem_usuarios u
  left join public.concrem_grupos g on g.id = u.grupo_id
  where u.auth_user_id = auth.uid()
  limit 1;

  if not found or not v_ativo then return false; end if;
  if lower(coalesce(v_email, '')) = 'kmz' then return true; end if;
  if v_perfil = 'administrador' or v_grupo_nome = 'Administrador' then return true; end if;

  if stored is null then
    return base ? p_key;
  elsif jsonb_typeof(stored) = 'object' and stored ? 'add' and stored ? 'remove' then
    if (stored -> 'add') ? p_key then return true; end if;      -- add vence
    if (stored -> 'remove') ? p_key then return false; end if;  -- depois remove
    return base ? p_key;
  elsif jsonb_typeof(stored) = 'array' and jsonb_array_length(stored) > 0 then
    return stored ? p_key;                                      -- snapshot legado
  else
    return base ? p_key;
  end if;
end; $$;

-- 4) Validação de integridade no banco (BEFORE INSERT/UPDATE) ────────────────
--    Backstop contra escrita direta (RLS é permissiva). Só valida linha ATIVA.
create or replace function public.valida_pedido_vinculo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ativo is not true then
    return new;  -- desativação (soft-delete) nunca é bloqueada
  end if;

  if new.pedido_principal_id = new.pedido_vinculado_id then
    raise exception 'Um pedido não pode ser vinculado a si mesmo.' using errcode = 'P0001';
  end if;

  -- existência / não-exclusão (autoridade = concrem_pedidos_status)
  if not exists (select 1 from public.concrem_pedidos_status s
                 where s.pedido_id = new.pedido_principal_id and s.excluido_em is null) then
    raise exception 'Pedido principal % inexistente ou excluído.', new.pedido_principal_id using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.concrem_pedidos_status s
                 where s.pedido_id = new.pedido_vinculado_id and s.excluido_em is null) then
    raise exception 'Pedido vinculado % inexistente ou excluído.', new.pedido_vinculado_id using errcode = 'P0002';
  end if;

  -- estrutura plana: principal não pode ser vinculado ativo de outro grupo
  if exists (select 1 from public.concrem_pedidos_vinculos v
             where v.ativo and v.pedido_vinculado_id = new.pedido_principal_id and v.id <> new.id) then
    raise exception 'O pedido % já é vinculado de outro grupo e não pode ser principal.', new.pedido_principal_id using errcode = 'P0001';
  end if;
  -- vinculado não pode ser principal ativo de um grupo (⇒ sem aninhamento/ciclo)
  if exists (select 1 from public.concrem_pedidos_vinculos v
             where v.ativo and v.pedido_principal_id = new.pedido_vinculado_id and v.id <> new.id) then
    raise exception 'O pedido % é principal de um grupo e não pode ser vinculado.', new.pedido_vinculado_id using errcode = 'P0001';
  end if;

  return new;
end; $$;

drop trigger if exists trg_valida_pedido_vinculo on public.concrem_pedidos_vinculos;
create trigger trg_valida_pedido_vinculo
  before insert or update on public.concrem_pedidos_vinculos
  for each row execute function public.valida_pedido_vinculo();

-- 5) RPC: criar vínculos (cria grupo OU adiciona a grupo existente) ──────────
--    Atômica: valida TODOS antes de inserir; se qualquer um falhar, nada é criado
--    e retorna a lista de bloqueios. p_vinculados = [{"pedido_id","origem"}].
create or replace function public.criar_vinculos_pedidos(
  p_principal text,
  p_vinculados jsonb,
  p_confirmacoes jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_login text; v_nome text;
  v_item jsonb; v_pid text; v_origem text;
  v_bloqueios jsonb := '[]'::jsonb;
  v_ja_existe boolean;
  v_grupo_de text;
  v_evento text;
  v_inseridos text[] := '{}';
begin
  if not (public.is_admin() or public.tem_funcionalidade('vinculos.gerenciar')) then
    raise exception 'Acesso negado: sem permissão para gerenciar vínculos.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_principal), '') = '' then
    raise exception 'Informe o pedido principal.' using errcode = '22023';
  end if;
  if p_vinculados is null or jsonb_typeof(p_vinculados) <> 'array' or jsonb_array_length(p_vinculados) = 0 then
    raise exception 'Selecione ao menos um pedido para vincular.' using errcode = '22023';
  end if;

  select u.email, u.nome into v_login, v_nome from public.concrem_usuarios u where u.auth_user_id = auth.uid() limit 1;

  -- principal precisa existir e não estar excluído
  if not exists (select 1 from public.concrem_pedidos_status s
                 where s.pedido_id = p_principal and s.excluido_em is null) then
    raise exception 'Pedido principal % inexistente ou excluído.', p_principal using errcode = 'P0002';
  end if;
  -- principal não pode já ser vinculado de outro grupo
  select v.pedido_principal_id into v_grupo_de
  from public.concrem_pedidos_vinculos v
  where v.ativo and v.pedido_vinculado_id = p_principal limit 1;
  if v_grupo_de is not null then
    raise exception 'O pedido % já pertence ao grupo do principal %.', p_principal, v_grupo_de using errcode = 'P0001';
  end if;

  -- o grupo já existe? (para escolher o evento de auditoria)
  v_evento := case when exists (
      select 1 from public.concrem_pedidos_vinculos v where v.ativo and v.pedido_principal_id = p_principal
    ) then 'VINCULO_ADICIONADO' else 'GRUPO_CRIADO' end;

  -- valida cada vinculado, acumulando bloqueios (sem inserir ainda)
  for v_item in select * from jsonb_array_elements(p_vinculados) loop
    v_pid := btrim(coalesce(v_item ->> 'pedido_id', ''));
    v_origem := lower(coalesce(v_item ->> 'origem', 'manual'));
    if v_origem not in ('complemento', 'manual') then v_origem := 'manual'; end if;

    if v_pid = '' then
      continue;
    elsif v_pid = p_principal then
      v_bloqueios := v_bloqueios || jsonb_build_object('pedido_id', v_pid, 'motivo', 'auto_vinculo');
    elsif not exists (select 1 from public.concrem_pedidos_status s where s.pedido_id = v_pid and s.excluido_em is null) then
      v_bloqueios := v_bloqueios || jsonb_build_object('pedido_id', v_pid, 'motivo', 'inexistente_ou_excluido');
    elsif exists (select 1 from public.concrem_pedidos_vinculos v where v.ativo and v.pedido_principal_id = v_pid) then
      v_bloqueios := v_bloqueios || jsonb_build_object('pedido_id', v_pid, 'motivo', 'e_principal_de_grupo');
    else
      select v.pedido_principal_id into v_grupo_de
      from public.concrem_pedidos_vinculos v where v.ativo and v.pedido_vinculado_id = v_pid limit 1;
      if v_grupo_de is not null and v_grupo_de <> p_principal then
        v_bloqueios := v_bloqueios || jsonb_build_object('pedido_id', v_pid, 'motivo', 'ja_vinculado', 'grupo_atual', v_grupo_de);
      end if;
    end if;
  end loop;

  -- atômico: se houver qualquer bloqueio, NADA é criado; retorna a lista para a UI
  if jsonb_array_length(v_bloqueios) > 0 then
    return jsonb_build_object('ok', false, 'bloqueios', v_bloqueios);
  end if;

  -- insere todos (idempotente por vinculado via unique parcial)
  for v_item in select * from jsonb_array_elements(p_vinculados) loop
    v_pid := btrim(coalesce(v_item ->> 'pedido_id', ''));
    v_origem := lower(coalesce(v_item ->> 'origem', 'manual'));
    if v_origem not in ('complemento', 'manual') then v_origem := 'manual'; end if;
    if v_pid = '' or v_pid = p_principal then continue; end if;

    insert into public.concrem_pedidos_vinculos (pedido_principal_id, pedido_vinculado_id, origem_vinculo, criado_por)
    values (p_principal, v_pid, v_origem, v_login)
    on conflict do nothing;
    v_inseridos := array_append(v_inseridos, v_pid);

    insert into public.concrem_pedidos_vinculos_historico
      (evento, pedido_principal_id, pedido_vinculado_id, detalhe, realizado_por, realizado_por_nome)
    values (v_evento, p_principal, v_pid, jsonb_build_object('origem', v_origem), v_login, v_nome);
  end loop;

  -- auditoria das confirmações reforçadas (não sinalizado / cliente divergente)
  if p_confirmacoes ? 'nao_sinalizado' then
    insert into public.concrem_pedidos_vinculos_historico
      (evento, pedido_principal_id, detalhe, realizado_por, realizado_por_nome)
    values ('CONFIRMACAO_NAO_SINALIZADO', p_principal, p_confirmacoes -> 'nao_sinalizado', v_login, v_nome);
  end if;
  if p_confirmacoes ? 'cliente_divergente' then
    insert into public.concrem_pedidos_vinculos_historico
      (evento, pedido_principal_id, detalhe, realizado_por, realizado_por_nome)
    values ('CONFIRMACAO_CLIENTE_DIVERGENTE', p_principal, p_confirmacoes -> 'cliente_divergente', v_login, v_nome);
  end if;

  return jsonb_build_object('ok', true, 'evento', v_evento, 'principal', p_principal, 'vinculados', to_jsonb(v_inseridos));
end; $$;

-- 7) RPC: remover 1 vínculo (soft-delete) ────────────────────────────────────
create or replace function public.remover_vinculo_pedido(p_vinculado text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_login text; v_nome text; v_principal text;
begin
  if not (public.is_admin() or public.tem_funcionalidade('vinculos.gerenciar')) then
    raise exception 'Acesso negado: sem permissão para gerenciar vínculos.' using errcode = '42501';
  end if;
  select u.email, u.nome into v_login, v_nome from public.concrem_usuarios u where u.auth_user_id = auth.uid() limit 1;

  update public.concrem_pedidos_vinculos
    set ativo = false, removido_em = now(), removido_por = v_login, motivo_remocao = coalesce(p_motivo, motivo_remocao)
    where ativo and pedido_vinculado_id = p_vinculado
    returning pedido_principal_id into v_principal;
  if not found then
    raise exception 'Vínculo ativo não encontrado para o pedido %.', p_vinculado using errcode = 'P0002';
  end if;

  insert into public.concrem_pedidos_vinculos_historico
    (evento, pedido_principal_id, pedido_vinculado_id, detalhe, realizado_por, realizado_por_nome)
  values ('VINCULO_REMOVIDO', v_principal, p_vinculado, jsonb_build_object('motivo', p_motivo), v_login, v_nome);

  return jsonb_build_object('ok', true, 'principal', v_principal, 'vinculado', p_vinculado);
end; $$;

-- 8) RPC: dissolver grupo inteiro (soft-delete de todos) ─────────────────────
create or replace function public.dissolver_grupo(p_principal text, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_login text; v_nome text; v_desvinculados text[];
begin
  if not (public.is_admin() or public.tem_funcionalidade('vinculos.dissolver')) then
    raise exception 'Acesso negado: sem permissão para dissolver grupos.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da dissolução.' using errcode = '22023';
  end if;
  select u.email, u.nome into v_login, v_nome from public.concrem_usuarios u where u.auth_user_id = auth.uid() limit 1;

  with upd as (
    update public.concrem_pedidos_vinculos
      set ativo = false, removido_em = now(), removido_por = v_login, motivo_remocao = p_motivo
      where ativo and pedido_principal_id = p_principal
      returning pedido_vinculado_id
  )
  select array_agg(pedido_vinculado_id) into v_desvinculados from upd;

  if v_desvinculados is null then
    raise exception 'O pedido % não é principal de um grupo ativo.', p_principal using errcode = 'P0002';
  end if;

  insert into public.concrem_pedidos_vinculos_historico
    (evento, pedido_principal_id, detalhe, realizado_por, realizado_por_nome)
  values ('GRUPO_DISSOLVIDO', p_principal,
          jsonb_build_object('motivo', p_motivo, 'desvinculados', to_jsonb(v_desvinculados)), v_login, v_nome);

  return jsonb_build_object('ok', true, 'principal', p_principal, 'desvinculados', to_jsonb(v_desvinculados));
end; $$;

-- 9) RPC: transferir 1 vínculo de um grupo para outro (explícito, auditado) ───
create or replace function public.transferir_vinculo_pedido(
  p_vinculado text, p_novo_principal text, p_motivo text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_login text; v_nome text; v_antigo_principal text;
begin
  if not (public.is_admin() or public.tem_funcionalidade('vinculos.gerenciar')) then
    raise exception 'Acesso negado: sem permissão para gerenciar vínculos.' using errcode = '42501';
  end if;
  if p_vinculado = p_novo_principal then
    raise exception 'Um pedido não pode ser vinculado a si mesmo.' using errcode = 'P0001';
  end if;
  select u.email, u.nome into v_login, v_nome from public.concrem_usuarios u where u.auth_user_id = auth.uid() limit 1;

  -- localizar o grupo atual do pedido
  select pedido_principal_id into v_antigo_principal
  from public.concrem_pedidos_vinculos where ativo and pedido_vinculado_id = p_vinculado limit 1;
  if v_antigo_principal is null then
    raise exception 'O pedido % não está vinculado a nenhum grupo.', p_vinculado using errcode = 'P0002';
  end if;
  if v_antigo_principal = p_novo_principal then
    raise exception 'O pedido % já pertence ao grupo do principal %.', p_vinculado, p_novo_principal using errcode = 'P0001';
  end if;

  -- desativar vínculo antigo
  update public.concrem_pedidos_vinculos
    set ativo = false, removido_em = now(), removido_por = v_login,
        motivo_remocao = coalesce(p_motivo, 'transferência de grupo')
    where ativo and pedido_vinculado_id = p_vinculado;

  -- criar novo vínculo (trigger valida novo principal/estrutura; unique garante 1 grupo)
  insert into public.concrem_pedidos_vinculos (pedido_principal_id, pedido_vinculado_id, origem_vinculo, criado_por)
  values (p_novo_principal, p_vinculado, 'manual', v_login);

  insert into public.concrem_pedidos_vinculos_historico
    (evento, pedido_principal_id, pedido_vinculado_id, detalhe, realizado_por, realizado_por_nome)
  values ('TRANSFERENCIA', p_novo_principal, p_vinculado,
          jsonb_build_object('grupo_anterior', v_antigo_principal, 'motivo', p_motivo), v_login, v_nome);

  return jsonb_build_object('ok', true, 'vinculado', p_vinculado,
                            'grupo_anterior', v_antigo_principal, 'grupo_novo', p_novo_principal);
end; $$;

-- 10) RPC (leitura): obter o grupo de QUALQUER integrante ────────────────────
--     Resolve o grupo a partir do principal OU de qualquer vinculado.
create or replace function public.obter_grupo_pedido(p_pedido text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_principal text; v_membros jsonb;
begin
  -- é principal?
  if exists (select 1 from public.concrem_pedidos_vinculos where ativo and pedido_principal_id = p_pedido) then
    v_principal := p_pedido;
  else
    select pedido_principal_id into v_principal
    from public.concrem_pedidos_vinculos where ativo and pedido_vinculado_id = p_pedido limit 1;
  end if;

  if v_principal is null then
    return jsonb_build_object('em_grupo', false, 'pedido', p_pedido);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'pedido_vinculado_id', pedido_vinculado_id,
           'origem', origem_vinculo,
           'criado_em', criado_em,
           'criado_por', criado_por) order by criado_em), '[]'::jsonb)
    into v_membros
  from public.concrem_pedidos_vinculos where ativo and pedido_principal_id = v_principal;

  return jsonb_build_object(
    'em_grupo', true,
    'pedido', p_pedido,
    'principal', v_principal,
    'posicao', case when p_pedido = v_principal then 'principal' else 'vinculado' end,
    'total', 1 + jsonb_array_length(v_membros),
    'vinculados', v_membros
  );
end; $$;

-- 11) Segurança de execução das RPCs ────────────────────────────────────────
revoke execute on function public.criar_vinculos_pedidos(text, jsonb, jsonb) from public, anon;
revoke execute on function public.remover_vinculo_pedido(text, text)         from public, anon;
revoke execute on function public.dissolver_grupo(text, text)                from public, anon;
revoke execute on function public.transferir_vinculo_pedido(text, text, text) from public, anon;
grant  execute on function public.criar_vinculos_pedidos(text, jsonb, jsonb) to authenticated;
grant  execute on function public.remover_vinculo_pedido(text, text)         to authenticated;
grant  execute on function public.dissolver_grupo(text, text)                to authenticated;
grant  execute on function public.transferir_vinculo_pedido(text, text, text) to authenticated;
grant  execute on function public.obter_grupo_pedido(text)                   to anon, authenticated;
grant  execute on function public.tem_funcionalidade(text)                   to anon, authenticated;

-- ── VERIFICAÇÃO (manual) ─────────────────────────────────────────────────────
-- 1) Como admin: select public.criar_vinculos_pedidos('149800',
--      '[{"pedido_id":"150128","origem":"complemento"},{"pedido_id":"154747","origem":"manual"}]'::jsonb);
-- 2) select public.obter_grupo_pedido('154747');   -- resolve o grupo pelo vinculado
-- 3) Tentar vincular 150128 a outro principal → bloqueio 'ja_vinculado'.
-- 4) Tentar tornar 154747 (vinculado) principal de 149800 → erro de estrutura plana.
-- ROLLBACK: drop table public.concrem_pedidos_vinculos_historico;
--           drop table public.concrem_pedidos_vinculos cascade;
--           drop function if exists public.criar_vinculos_pedidos(text,jsonb,jsonb),
--             public.remover_vinculo_pedido(text,text), public.dissolver_grupo(text,text),
--             public.transferir_vinculo_pedido(text,text,text), public.obter_grupo_pedido(text),
--             public.tem_funcionalidade(text), public.valida_pedido_vinculo();
-- ============================================================================
