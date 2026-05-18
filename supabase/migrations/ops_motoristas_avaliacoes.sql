-- Adiciona colunas de avaliação e blacklist na tabela de motoristas
ALTER TABLE concrem_motoristas
  ADD COLUMN IF NOT EXISTS blacklisted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS avaliacao_media numeric(3,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS avaliacao_count integer DEFAULT 0;

-- Tabela de avaliações individuais de motoristas
CREATE TABLE IF NOT EXISTS concrem_motoristas_avaliacoes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  motorista_id uuid NOT NULL REFERENCES concrem_motoristas(id) ON DELETE CASCADE,
  estrelas integer NOT NULL CHECK (estrelas BETWEEN 1 AND 5),
  comentario text,
  avaliado_por text,
  criado_em timestamptz DEFAULT now()
);

-- Índice para busca por motorista
CREATE INDEX IF NOT EXISTS idx_motoristas_avaliacoes_motorista_id
  ON concrem_motoristas_avaliacoes(motorista_id);

-- Função que recalcula a média de avaliações e atualiza na tabela de motoristas
CREATE OR REPLACE FUNCTION fn_recalcular_avaliacao_motorista()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE concrem_motoristas
  SET
    avaliacao_media = (
      SELECT ROUND(AVG(estrelas)::numeric, 2)
      FROM concrem_motoristas_avaliacoes
      WHERE motorista_id = COALESCE(NEW.motorista_id, OLD.motorista_id)
    ),
    avaliacao_count = (
      SELECT COUNT(*)
      FROM concrem_motoristas_avaliacoes
      WHERE motorista_id = COALESCE(NEW.motorista_id, OLD.motorista_id)
    )
  WHERE id = COALESCE(NEW.motorista_id, OLD.motorista_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: atualiza média após insert/delete de avaliação
DROP TRIGGER IF EXISTS trg_recalcular_avaliacao ON concrem_motoristas_avaliacoes;
CREATE TRIGGER trg_recalcular_avaliacao
AFTER INSERT OR DELETE ON concrem_motoristas_avaliacoes
FOR EACH ROW EXECUTE FUNCTION fn_recalcular_avaliacao_motorista();
