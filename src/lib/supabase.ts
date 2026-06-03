import { createClient } from '@supabase/supabase-js';

const normalizeUrl = (raw: string | undefined) => {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('http://')) return `https://${trimmed.slice('http://'.length)}`;
  return `https://${trimmed}`;
};

const pedidosUrl = normalizeUrl((import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL) as string | undefined);
const pedidosAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY) as string | undefined;

const opsUrl = normalizeUrl((import.meta.env.VITE_SUPABASE_OPS_URL || import.meta.env.SUPABASE_OPS_URL) as string | undefined);
const opsAnonKey = (import.meta.env.VITE_SUPABASE_OPS_KEY || import.meta.env.SUPABASE_OPS_KEY) as string | undefined;

export const supabasePedidos = pedidosUrl && pedidosAnonKey ? createClient(pedidosUrl, pedidosAnonKey) : null;

// Reutiliza o mesmo cliente quando OPS aponta para a mesma URL que Pedidos
export const supabaseOps = opsUrl && opsAnonKey
  ? (opsUrl === pedidosUrl && opsAnonKey === pedidosAnonKey ? supabasePedidos : createClient(opsUrl, opsAnonKey))
  : null;

export const supabase = supabasePedidos;
