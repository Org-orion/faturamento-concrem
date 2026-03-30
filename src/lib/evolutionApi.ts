/**
 * Evolution API — cliente para envio de mensagens WhatsApp.
 *
 * Variáveis de ambiente necessárias:
 *   VITE_EVOLUTION_API_URL      ex: https://evo.seudominio.com.br
 *   VITE_EVOLUTION_API_KEY      chave de autenticação (apikey)
 *   VITE_EVOLUTION_INSTANCE     nome da instância criada no painel Evolution
 */

const BASE_URL = (import.meta.env.VITE_EVOLUTION_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const API_KEY = (import.meta.env.VITE_EVOLUTION_API_KEY as string | undefined) ?? '';
const INSTANCE = encodeURIComponent((import.meta.env.VITE_EVOLUTION_INSTANCE as string | undefined) ?? '');

function isConfigured(): boolean {
  return Boolean(BASE_URL && API_KEY && INSTANCE);
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: API_KEY,
  };
}

export type EvolutionResult = {
  ok: boolean;
  messageId: string | null;
  error: string | null;
};

/**
 * Envia uma mensagem de texto para um número no WhatsApp.
 * @param phone Número em formato E.164 sem o "+" — ex: "5511999998888"
 * @param text  Texto da mensagem (suporta markdown do WhatsApp: *negrito*, _itálico_)
 */
export async function sendEvolutionText(phone: string, text: string): Promise<EvolutionResult> {
  if (!isConfigured()) {
    console.warn('[EvolutionAPI] Variáveis de ambiente não configuradas (VITE_EVOLUTION_API_URL / VITE_EVOLUTION_API_KEY / VITE_EVOLUTION_INSTANCE).');
    return { ok: false, messageId: null, error: 'Evolution API não configurada.' };
  }

  try {
    const res = await fetch(`${BASE_URL}/message/sendText/${INSTANCE}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        number: phone,
        text,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = (json as any)?.message || `HTTP ${res.status}`;
      console.error('[EvolutionAPI] sendText error:', JSON.stringify(json, null, 2));
      return { ok: false, messageId: null, error: msg };
    }

    const messageId = (json as any)?.key?.id ?? (json as any)?.messageId ?? null;
    return { ok: true, messageId: messageId ? String(messageId) : null, error: null };
  } catch (e: any) {
    console.error('[EvolutionAPI] sendText fetch error:', e);
    return { ok: false, messageId: null, error: e?.message || String(e) };
  }
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
  if (!isConfigured()) {
    console.warn('[EvolutionAPI] Variáveis de ambiente não configuradas.');
    return { ok: false, messageId: null, error: 'Evolution API não configurada.' };
  }

  try {
    const res = await fetch(`${BASE_URL}/message/sendMedia/${INSTANCE}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        number: phone,
        mediatype,
        mimetype,
        media: base64,
        fileName,
        caption: caption ?? '',
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = (json as any)?.message || `HTTP ${res.status}`;
      console.error('[EvolutionAPI] sendMedia error:', JSON.stringify(json, null, 2));
      return { ok: false, messageId: null, error: msg };
    }

    const messageId = (json as any)?.key?.id ?? (json as any)?.messageId ?? null;
    return { ok: true, messageId: messageId ? String(messageId) : null, error: null };
  } catch (e: any) {
    console.error('[EvolutionAPI] sendMedia fetch error:', e);
    return { ok: false, messageId: null, error: e?.message || String(e) };
  }
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
