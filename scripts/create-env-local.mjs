import fs from 'node:fs';
import path from 'node:path';
import { parseDotenvFile } from './env.mjs';

function main() {
  const root = process.cwd();
  const envExamplePath = path.join(root, '.env.example');
  const envLocalPath = path.join(root, '.env.local');

  if (!fs.existsSync(envExamplePath)) {
    console.error('Arquivo .env.example não encontrado.');
    process.exitCode = 1;
    return;
  }

  if (fs.existsSync(envLocalPath)) {
    console.log('.env.local já existe. Nenhuma alteração feita.');
    return;
  }

  const parsed = parseDotenvFile(envExamplePath);
  const url = parsed.VITE_SUPABASE_URL;
  const key = parsed.VITE_SUPABASE_ANON_KEY;
  const table = parsed.VITE_SUPABASE_PEDIDOS_TABLE;

  if (!url || !key) {
    console.error('Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.example antes de gerar o .env.local.');
    process.exitCode = 1;
    return;
  }

  const content = `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${key}\n${table ? `VITE_SUPABASE_PEDIDOS_TABLE=${table}\n` : ''}`;
  fs.writeFileSync(envLocalPath, content, 'utf8');
  console.log('.env.local criado com sucesso.');
}

main();
