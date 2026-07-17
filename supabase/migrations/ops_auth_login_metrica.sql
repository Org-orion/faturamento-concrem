-- ============================================================
-- Métrica de adesão ao Supabase Auth (pré-requisito da Fase 4).
-- Registra por usuário o método do ÚLTIMO login (auth | legado) e quando.
-- Objetivo: saber com segurança quando ninguém mais depende do fallback
-- legado (senha_hash) — só então é seguro trancar RLS / remover o legado.
-- Aditivo e seguro. Aplicar no SQL Editor do Supabase.
-- ============================================================

alter table if exists public.concrem_usuarios
  add column if not exists ultimo_login_metodo text,
  add column if not exists ultimo_login_em     timestamptz;

comment on column public.concrem_usuarios.ultimo_login_metodo is
  'auth | legado — método do último login (medição da migração para Supabase Auth)';

-- Consulta de acompanhamento (rodar periodicamente):
--   select email, nome, ultimo_login_metodo, ultimo_login_em
--   from public.concrem_usuarios
--   where coalesce(ativo, true) = true
--   order by ultimo_login_metodo nulls first, ultimo_login_em nulls first;
-- Meta: nenhum usuário ativo com metodo 'legado' (ou null) por ~1-2 semanas.
