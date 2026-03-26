const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ReqBody = {
  toPhoneE164: string;
  message: string;
};

const normalizeBaseUrl = (raw: string) => {
  const v = raw.trim().replace(/\/+$/, '');
  if (v.startsWith('http://')) return `https://${v.slice('http://'.length)}`;
  return v.startsWith('https://') ? v : `https://${v}`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get('EVOLUTION_API_URL');
    const apiKey = Deno.env.get('EVOLUTION_API_KEY');
    const instance = Deno.env.get('EVOLUTION_INSTANCE');

    if (!url || !apiKey || !instance) {
      return new Response(JSON.stringify({ ok: false, error: 'Evolution API não configurada no ambiente.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { toPhoneE164, message } = (await req.json()) as ReqBody;
    const to = String(toPhoneE164 || '').replace(/\D/g, '');
    const text = String(message || '').trim();
    if (!to || !text) {
      return new Response(JSON.stringify({ ok: false, error: 'Parâmetros inválidos.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const endpoint = `${normalizeBaseUrl(url)}/message/sendText/${encodeURIComponent(instance)}`;
    const evoRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: to,
        textMessage: { text },
        options: {
          delay: 1200,
          presence: 'composing',
          linkPreview: false,
        },
      }),
    });

    const raw = await evoRes.text();
    if (!evoRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: raw || `HTTP ${evoRes.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let providerMessageId: string | null = null;
    try {
      const parsed = JSON.parse(raw);
      providerMessageId = parsed?.key?.id ? String(parsed.key.id) : null;
    } catch (_) {
      providerMessageId = null;
    }

    return new Response(JSON.stringify({ ok: true, providerMessageId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
