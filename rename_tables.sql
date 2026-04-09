-- ============================================================
-- Padronização de tabelas OPS: adiciona prefixo "concrem_"
-- Execute no SQL Editor do Supabase (ou psql)
-- ============================================================

ALTER TABLE IF EXISTS comercial_pedidos_acoes         RENAME TO concrem_comercial_pedidos_acoes;
ALTER TABLE IF EXISTS comercial_pedidos_meta           RENAME TO concrem_comercial_pedidos_meta;
ALTER TABLE IF EXISTS entregas                         RENAME TO concrem_entregas;
ALTER TABLE IF EXISTS lancamentos_despesas             RENAME TO concrem_lancamentos_despesas;
ALTER TABLE IF EXISTS lancamentos_financeiros          RENAME TO concrem_lancamentos_financeiros;
ALTER TABLE IF EXISTS motoristas                       RENAME TO concrem_motoristas;
ALTER TABLE IF EXISTS notificacoes_representantes      RENAME TO concrem_notificacoes_representantes;
ALTER TABLE IF EXISTS notificacoes_representantes_pedidos RENAME TO concrem_notificacoes_representantes_pedidos;
ALTER TABLE IF EXISTS pedidos_status                   RENAME TO concrem_pedidos_status;
ALTER TABLE IF EXISTS pedidos_status_historico         RENAME TO concrem_pedidos_status_historico;
ALTER TABLE IF EXISTS producao_concluidos              RENAME TO concrem_producao_concluidos;
ALTER TABLE IF EXISTS producao_confirmacoes            RENAME TO concrem_producao_confirmacoes;
ALTER TABLE IF EXISTS programacoes_embarque            RENAME TO concrem_programacoes_embarque;
ALTER TABLE IF EXISTS relatorio_entrega_anexos         RENAME TO concrem_relatorio_entrega_anexos;
ALTER TABLE IF EXISTS representantes                   RENAME TO concrem_representantes;
ALTER TABLE IF EXISTS tipos_despesa                    RENAME TO concrem_tipos_despesa;
ALTER TABLE IF EXISTS usuarios                         RENAME TO concrem_usuarios;

-- ============================================================
-- Após renomear, recrie as policies de RLS se existirem,
-- pois elas ficam vinculadas ao nome da tabela.
-- Verifique com: SELECT tablename, policyname FROM pg_policies
--               WHERE tablename NOT LIKE 'concrem_%';
-- ============================================================
