import { describe, it, expect } from 'vitest';
import {
  formatDateBR, formatDateTimeBR, formatTimeBR, formatMonthYearBR,
  formatCurrencyBRL, formatNumberBR, formatPercentBR,
  parseDateOnly, dateOnlyToISO, FALLBACK,
} from './formatters';

// Normaliza espaços especiais (NBSP U+00A0 e narrow-NBSP U+202F) para asserts estáveis.
const norm = (s: string) => s.replace(/\s/g, ' ');

describe('formatters — datas', () => {
  it('data civil YYYY-MM-DD não sofre drift de UTC', () => {
    expect(formatDateBR('2026-07-14')).toBe('14/07/2026');
  });

  it('timestamp UTC exibido em Brasília (virada de dia para trás)', () => {
    // 02:00Z → 23:00 do dia anterior em Brasília (UTC-3)
    expect(norm(formatDateTimeBR('2026-07-14T02:00:00.000Z'))).toBe('13/07/2026, 23:00');
  });

  it('timestamp UTC na virada da meia-noite de Brasília', () => {
    expect(norm(formatDateTimeBR('2026-07-14T03:00:00.000Z'))).toBe('14/07/2026, 00:00');
  });

  it('exemplo do enunciado: 16:45Z → 13:45 Brasília', () => {
    expect(norm(formatDateTimeBR('2026-07-14T16:45:00.000Z'))).toBe('14/07/2026, 13:45');
  });

  it('hora em Brasília', () => {
    expect(norm(formatTimeBR('2026-07-14T16:45:00.000Z'))).toBe('13:45');
  });

  it('competência YYYY-MM → mês por extenso', () => {
    expect(formatMonthYearBR('2026-07')).toBe('julho de 2026');
  });

  it('parseDateOnly interpreta como data local (sem recuo)', () => {
    const d = parseDateOnly('2026-07-14')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // julho = 6
    expect(d.getDate()).toBe(14);
    expect(dateOnlyToISO(d)).toBe('2026-07-14');
  });
});

describe('formatters — números e moeda', () => {
  it('número pt-BR', () => {
    expect(norm(formatNumberBR(1234.56))).toBe('1.234,56');
  });

  it('moeda BRL', () => {
    expect(norm(formatCurrencyBRL(1234.56))).toBe('R$ 1.234,56');
    expect(norm(formatCurrencyBRL(115981.05))).toBe('R$ 115.981,05');
  });

  it('percentual (valor já em %)', () => {
    expect(formatPercentBR(10.5)).toBe('10,5%');
    expect(formatPercentBR(10)).toBe('10%');
  });
});

describe('formatters — nulos e inválidos', () => {
  it('nulo/indefinido → fallback', () => {
    expect(formatDateBR(null)).toBe(FALLBACK);
    expect(formatDateBR(undefined)).toBe(FALLBACK);
    expect(formatDateTimeBR(null)).toBe(FALLBACK);
    expect(formatCurrencyBRL(null)).toBe(FALLBACK);
    expect(formatNumberBR(null)).toBe(FALLBACK);
    expect(formatPercentBR(null)).toBe(FALLBACK);
    expect(formatMonthYearBR(null)).toBe(FALLBACK);
  });

  it('data inválida não vira "Invalid Date"', () => {
    expect(formatDateBR('xpto')).toBe(FALLBACK);
    expect(formatDateTimeBR('xpto')).toBe(FALLBACK);
    expect(formatCurrencyBRL(NaN)).toBe(FALLBACK);
  });
});
