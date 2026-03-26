import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { parseDotenvFile } from './env.mjs';

async function main() {
  const root = process.cwd();
  const env = {
    ...parseDotenvFile(path.join(root, '.env.local')),
    ...parseDotenvFile(path.join(root, '.env')),
  };

  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  const table = env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';

  if (!url || !anon) {
    console.error('Faltando VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY (use .env.local).');
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, anon);
  const { data, error } = await supabase.from(table).select('*').limit(1);

  if (error) {
    console.error(`Falha ao consultar ${table}:`, error.message);
    process.exitCode = 1;
    return;
  }

  console.log('Conexão OK. Linhas retornadas:', Array.isArray(data) ? data.length : 0);
}

main().catch((e) => {
  console.error('Erro inesperado:', e?.message || String(e));
  process.exitCode = 1;
});
