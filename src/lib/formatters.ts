/**
 * Formatação centralizada (pt-BR / America/Sao_Paulo / BRL).
 *
 * Regras:
 *  - Timestamps (instantes) → convertidos para Brasília e formatados em pt-BR.
 *  - Datas civis "YYYY-MM-DD" → NUNCA passam por timezone (não podem mudar de dia).
 *  - Competências "YYYY-MM" → tratadas como mês/ano, sem timezone.
 *  - Todas aceitam null/undefined/inválido sem lançar erro (fallback "—").
 */

import {
  brlFormatter, numberFormatter, dateFormatter, dateTimeFormatter,
  timeFormatter, monthYearFormatter, longDateFormatter, APP_LOCALE,
} from '@/lib/locale';
import { todayBR } from '@/lib/dateUtils';

export const FALLBACK = '—';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

type DateInput = Date | string | number | null | undefined;

/** Converte a entrada em Date válido (ou null). Não lança. */
function toDate(value: DateInput): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// ── Datas civis (sem horário) ─────────────────────────────────────────────────

/** Interpreta "YYYY-MM-DD" como data local (sem drift de UTC). Null-safe. */
export function parseDateOnly(value?: string | null): Date | null {
  if (!value) return null;
  const m = DATE_ONLY_RE.exec(value.trim());
  if (m) {
    const [y, mo, d] = value.trim().split('-').map(Number);
    return new Date(y, mo - 1, d);
  }
  return toDate(value);
}

/** Date → "YYYY-MM-DD" pelos componentes locais (para persistir em coluna date). */
export function dateOnlyToISO(date?: Date | null): string {
  if (!date || isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── Data / hora ────────────────────────────────────────────────────────────────

/** "14/07/2026". Data civil não sofre timezone; timestamp é convertido p/ Brasília. */
export function formatDateBR(value?: DateInput): string {
  if (typeof value === 'string' && DATE_ONLY_RE.test(value.trim())) {
    const [y, m, d] = value.trim().split('-');
    return `${d}/${m}/${y}`;
  }
  const d = toDate(value);
  return d ? dateFormatter.format(d) : FALLBACK;
}

/** "14/07/2026, 13:45" — instante convertido para Brasília. */
export function formatDateTimeBR(value?: DateInput): string {
  // "YYYY-MM-DD" puro → meia-noite local daquele dia (evita recuo por UTC)
  const input = typeof value === 'string' && DATE_ONLY_RE.test(value.trim())
    ? parseDateOnly(value)
    : value;
  const d = toDate(input as DateInput);
  return d ? dateTimeFormatter.format(d) : FALLBACK;
}

/** "13:45" (Brasília). */
export function formatTimeBR(value?: DateInput): string {
  const d = toDate(value);
  return d ? timeFormatter.format(d) : FALLBACK;
}

/** "julho de 2026" a partir de competência "YYYY-MM" (sem timezone). */
export function formatMonthYearBR(value?: string | null): string {
  if (!value) return FALLBACK;
  const m = MONTH_RE.exec(value.trim()) ?? DATE_ONLY_RE.exec(value.trim());
  if (!m) return FALLBACK;
  const [y, mo] = value.trim().split('-').map(Number);
  return monthYearFormatter.format(new Date(y, mo - 1, 1));
}

/** "segunda-feira, 14 de julho de 2026". */
export function formatLongDateBR(value?: DateInput): string {
  const d = typeof value === 'string' && DATE_ONLY_RE.test(value.trim())
    ? parseDateOnly(value)
    : toDate(value);
  return d ? longDateFormatter.format(d) : FALLBACK;
}

/** Alias explícito: formata um timestamp (UTC no banco) no horário de Brasília. */
export const formatTimestampInBrasilia = formatDateTimeBR;

/** Data civil atual em Brasília no formato "YYYY-MM-DD". */
export function getCurrentDateInBrasilia(): string {
  return todayBR();
}

/** Data e hora atuais em Brasília já formatadas ("14/07/2026, 13:45"). */
export function getCurrentDateTimeInBrasilia(): string {
  return dateTimeFormatter.format(new Date());
}

// ── Números / moeda / percentual ────────────────────────────────────────────────

/** "R$ 115.981,05". null/NaN → "—". */
export function formatCurrencyBRL(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return FALLBACK;
  return brlFormatter.format(value);
}

/** "1.234,56". `decimals` fixa as casas quando informado. */
export function formatNumberBR(value?: number | null, decimals?: number): string {
  if (value == null || !Number.isFinite(value)) return FALLBACK;
  if (decimals != null) {
    return new Intl.NumberFormat(APP_LOCALE, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }
  return numberFormatter.format(value);
}

/** "10,5%" — o valor já é a porcentagem (10.5 = 10,5%). */
export function formatPercentBR(value?: number | null, decimals = 1): string {
  if (value == null || !Number.isFinite(value)) return FALLBACK;
  const n = new Intl.NumberFormat(APP_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
  return `${n}%`;
}

/** Data relativa curta em pt-BR: "hoje", "ontem", "há 3 dias", "em 2 dias". */
export function formatRelativeDateBR(value?: DateInput): string {
  const target = typeof value === 'string' && DATE_ONLY_RE.test(value.trim())
    ? parseDateOnly(value)
    : toDate(value);
  if (!target) return FALLBACK;
  // Diferença em dias civis (Brasília), ancorada em meia-noite UTC das datas puras.
  const toYMD = todayBR();
  const [ty, tm, td] = toYMD.split('-').map(Number);
  const fromISO = dateOnlyToISO(target);
  if (!fromISO) return FALLBACK;
  const [fy, fm, fd] = fromISO.split('-').map(Number);
  const diff = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'ontem';
  if (diff === -1) return 'amanhã';
  if (diff > 1) return `há ${diff} dias`;
  return `em ${Math.abs(diff)} dias`;
}
