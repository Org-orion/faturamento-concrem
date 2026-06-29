/**
 * evolution-proxy — encaminha chamadas da Evolution API (WhatsApp) a partir do servidor,
 * mantendo a apikey como secret (EVOLUTION_API_KEY) fora do bundle do navegador.
 *
 * Segurança:
 *  - Lista branca de ações: o cliente NUNCA envia URL/caminho — só { action, payload }.
 *    O caminho da Evolution e a instância são montados aqui, no servidor.
 *  - CORS restrito à origem da aplicação (produção + localhost do Vite em dev).
 *  - Verificação de JWT padrão do Supabase fica LIGADA (não usar --no-verify-jwt):
 *    o app envia a anon key em Authorization/apikey e a plataforma valida.
 *  - A apikey da Evolution nunca aparece em resposta nem em log.
 *
 * Secrets necessários (sem prefixo VITE_):
 *   EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE
 */

// Ações permitidas → caminho fixo na Evolution (sem a instância, que é anexada aqui).
const ACTIONS: Record<string, string> = {
  sendText: 'message/sendText',
  sendMedia: 'message/sendMedia',
};

const ALLOWED_ORIGINS = new Set<string>([
  'https://faturamentoapp.vercel.app',
  'http://localhost:5173',
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
    'Vary': 'Origin',
  };
}

function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const normalizeBaseUrl = (raw: string) => {
  const v = raw.trim().replace(/\/+$/, '');
  if (v.startsWith('http://')) return `https://${v.slice('http://'.length)}`;
  return v.startsWith('https://') ? v : `https://${v}`;
};

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Método não permitido.' }, 405, cors);
  }

  const apiUrl = Deno.env.get('EVOLUTION_API_URL');
  const apiKey = Deno.env.get('EVOLUTION_API_KEY');
  const instance = Deno.env.get('EVOLUTION_INSTANCE');
  if (!apiUrl || !apiKey || !instance) {
    return jsonResponse({ ok: false, error: 'Evolution API não configurada no servidor.' }, 500, cors);
  }

  let body: { action?: string; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Corpo JSON inválido.' }, 400, cors);
  }

  const action = String(body?.action ?? '');
  const path = ACTIONS[action];
  if (!path) {
    return jsonResponse({ ok: false, error: `Ação não permitida: ${action || '(vazia)'}` }, 400, cors);
  }
  if (!body.payload || typeof body.payload !== 'object') {
    return jsonResponse({ ok: false, error: 'payload ausente ou inválido.' }, 400, cors);
  }

  const endpoint = `${normalizeBaseUrl(apiUrl)}/${path}/${encodeURIComponent(instance)}`;

  try {
    const evoRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify(body.payload),
    });

    const raw = await evoRes.text();
    let data: unknown = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }

    // Repassa o status e o corpo da Evolution (sem nunca incluir a apikey).
    return jsonResponse(data, evoRes.status, cors);
  } catch (_e) {
    // Não logar detalhes que possam vazar a chave; mensagem genérica.
    console.error(`[evolution-proxy] falha ao contatar a Evolution na ação "${action}"`);
    return jsonResponse({ ok: false, error: 'Falha ao contatar a Evolution API.' }, 502, cors);
  }
});
