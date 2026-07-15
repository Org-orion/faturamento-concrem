/**
 * Locale e fuso oficiais da aplicação.
 *
 * Toda formatação de data/hora/número/moeda visível ao usuário deve usar estas
 * constantes — nunca depender do locale/timezone do navegador para dados corporativos.
 */

export const APP_LOCALE = 'pt-BR';
export const APP_TIME_ZONE = 'America/Sao_Paulo';
export const APP_CURRENCY = 'BRL';

// Instâncias reutilizadas — evita recriar Intl a cada render/linha de tabela.
export const brlFormatter = new Intl.NumberFormat(APP_LOCALE, {
  style: 'currency',
  currency: APP_CURRENCY,
});

export const numberFormatter = new Intl.NumberFormat(APP_LOCALE);

export const dateFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: APP_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

// "14/07/2026, 13:45" (sem segundos, 24h)
export const dateTimeFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: APP_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// "13:45"
export const timeFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: APP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// "julho de 2026"
export const monthYearFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  month: 'long',
  year: 'numeric',
});

// "terça-feira, 14 de julho de 2026"
export const longDateFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: APP_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
