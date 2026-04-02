/**
 * Utilitários de data/hora sempre no fuso horário de Brasília (America/Sao_Paulo).
 */

const TZ = 'America/Sao_Paulo';

/** Retorna a data atual no formato YYYY-MM-DD no fuso de Brasília. */
export function todayBR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

/** Retorna o ano-mês atual no formato YYYY-MM no fuso de Brasília. */
export function currentYearMonthBR(): string {
  const d = new Date();
  const year = Number(new Intl.DateTimeFormat('en', { timeZone: TZ, year: 'numeric' }).format(d));
  const month = Number(new Intl.DateTimeFormat('en', { timeZone: TZ, month: 'numeric' }).format(d));
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Retorna o timestamp ISO atual ajustado para Brasília (armazena como UTC mas com offset correto). */
export function nowISO(): string {
  return new Date().toISOString();
}

/** Retorna a hora atual (0-23) no fuso de Brasília. */
export function currentHourBR(): number {
  return Number(new Intl.DateTimeFormat('en', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date()));
}

/** Formata uma string ISO como data legível em pt-BR com fuso de Brasília. Ex: 02/04/2026 */
export function fmtDate(iso?: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: TZ });
}

/** Formata uma string ISO como data e hora legível em pt-BR com fuso de Brasília. Ex: 02/04/2026 14:30:00 */
export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('pt-BR', { timeZone: TZ });
}
