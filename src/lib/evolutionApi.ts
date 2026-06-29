/**
 * Evolution API — cliente de envio de WhatsApp.
 *
 * A chamada NÃO vai mais direto para a Evolution: ela passa por uma Edge Function
 * do Supabase (`evolution-proxy`), que guarda a apikey como secret no servidor.
 * Assim a chave da Evolution nunca entra no bundle público.
 *
 * O navegador só precisa da anon key do Supabase (já pública por design) para
 * passar na verificação de JWT da função.
 *
 * Variáveis usadas (todas já existentes e públicas por natureza):
 *   VITE_SUPABASE_URL        ex: https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY   anon key do projeto
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
const PROXY_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/evolution-proxy` : '';

function isConfigured(): boolean {
  return Boolean(SUPABASE_URL && ANON_KEY);
}

/** Expõe o estado de configuração para debug no console */
export function logEvolutionConfig(): void {
  console.group('[EvolutionAPI] Configuração (via proxy)');
  console.log('Proxy URL :', PROXY_URL || '⚠️  vazio');
  console.log('Anon key  :', ANON_KEY ? '✅ definido' : '⚠️  vazio');
  console.log('isConfigured():', isConfigured());
  console.groupEnd();
}

export type EvolutionResult = {
  ok: boolean;
  messageId: string | null;
  error: string | null;
};

/** Chamada interna ao proxy. Uma ação por operação da Evolution (lista branca no servidor). */
async function callProxy(action: 'sendText' | 'sendMedia', payload: Record<string, unknown>): Promise<EvolutionResult> {
  if (!isConfigured()) {
    console.warn('[EvolutionAPI] Supabase não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
    return { ok: false, messageId: null, error: 'Envio de WhatsApp não configurado.' };
  }

  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
      },
      body: JSON.stringify({ action, payload }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = (json as any)?.message || (json as any)?.error || `HTTP ${res.status}`;
      console.error(`[EvolutionAPI] ${action} error:`, JSON.stringify(json, null, 2));
      return { ok: false, messageId: null, error: msg };
    }

    const messageId = (json as any)?.key?.id ?? (json as any)?.messageId ?? null;
    return { ok: true, messageId: messageId ? String(messageId) : null, error: null };
  } catch (e: any) {
    console.error(`[EvolutionAPI] ${action} fetch error:`, e);
    return { ok: false, messageId: null, error: e?.message || String(e) };
  }
}

/**
 * Envia uma mensagem de texto para um número no WhatsApp.
 * @param phone Número em formato E.164 sem o "+" — ex: "5511999998888"
 * @param text  Texto da mensagem (suporta markdown do WhatsApp: *negrito*, _itálico_)
 */
export async function sendEvolutionText(phone: string, text: string): Promise<EvolutionResult> {
  return callProxy('sendText', { number: phone, text });
}

export type EvolutionMediaType = 'image' | 'document' | 'audio' | 'video';

/**
 * Envia um arquivo (base64) via WhatsApp.
 * @param phone     Número E.164 sem "+" — ex: "5511999998888"
 * @param base64    Conteúdo do arquivo em base64 puro (sem prefixo data:...)
 * @param mimetype  MIME type — ex: "application/pdf", "image/jpeg"
 * @param fileName  Nome do arquivo exibido na conversa — ex: "boleto.pdf"
 * @param caption   Legenda opcional exibida junto ao arquivo
 * @param mediatype Tipo de mídia para o Evolution API (default: "document")
 */
export async function sendEvolutionMedia(
  phone: string,
  base64: string,
  mimetype: string,
  fileName: string,
  caption?: string,
  mediatype: EvolutionMediaType = 'document',
): Promise<EvolutionResult> {
  return callProxy('sendMedia', {
    number: phone,
    mediatype,
    mimetype,
    media: base64,
    fileName,
    caption: caption ?? '',
  });
}

/**
 * Converte um File (browser) para base64 puro (sem prefixo data:...).
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove o prefixo "data:application/pdf;base64," etc.
      const base64 = result.split(',')[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
