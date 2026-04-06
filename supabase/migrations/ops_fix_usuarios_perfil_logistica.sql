-- Fix: adiciona 'logistica' ao check constraint de perfil_acesso
alter table public.usuarios drop constraint if exists usuarios_perfil_acesso_chk;
alter table public.usuarios add constraint usuarios_perfil_acesso_chk check (
  perfil_acesso is null or perfil_acesso in ('faturamento', 'administrador', 'comercial', 'producao', 'logistica')
);
