-- ============================================================
-- Controle de atendimento de prioridades
-- Adiciona colunas para marcar uma prioridade como "atendida"
-- (distinto de "ativo", que significa removida/arquivada).
-- Execute no SQL Editor do Supabase.
-- ============================================================

alter table if exists public.concrem_pedido_prioridades
  add column if not exists atendida boolean not null default false;

alter table if exists public.concrem_pedido_prioridades
  add column if not exists atendida_em timestamptz null;

alter table if exists public.concrem_pedido_prioridades
  add column if not exists atendida_por text null;
