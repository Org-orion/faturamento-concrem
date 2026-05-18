-- 1. Garante colunas na tabela de motoristas (caso o ALTER anterior não tenha rodado)
ALTER TABLE concrem_motoristas
  ADD COLUMN IF NOT EXISTS blacklisted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS avaliacao_media numeric(3,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS avaliacao_count integer DEFAULT 0;

-- 2. RLS policies para a tabela de avaliações
ALTER TABLE concrem_motoristas_avaliacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avaliacoes_select_anon" ON concrem_motoristas_avaliacoes;
CREATE POLICY "avaliacoes_select_anon"
  ON concrem_motoristas_avaliacoes FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "avaliacoes_insert_anon" ON concrem_motoristas_avaliacoes;
CREATE POLICY "avaliacoes_insert_anon"
  ON concrem_motoristas_avaliacoes FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "avaliacoes_delete_anon" ON concrem_motoristas_avaliacoes;
CREATE POLICY "avaliacoes_delete_anon"
  ON concrem_motoristas_avaliacoes FOR DELETE TO anon USING (true);

-- 3. Mesmo para authenticated (caso o app use esse role)
DROP POLICY IF EXISTS "avaliacoes_select_auth" ON concrem_motoristas_avaliacoes;
CREATE POLICY "avaliacoes_select_auth"
  ON concrem_motoristas_avaliacoes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "avaliacoes_insert_auth" ON concrem_motoristas_avaliacoes;
CREATE POLICY "avaliacoes_insert_auth"
  ON concrem_motoristas_avaliacoes FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "avaliacoes_delete_auth" ON concrem_motoristas_avaliacoes;
CREATE POLICY "avaliacoes_delete_auth"
  ON concrem_motoristas_avaliacoes FOR DELETE TO authenticated USING (true);
