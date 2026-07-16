import { describe, it, expect } from 'vitest';
import { situacaoRestauracao, PRAZO_RESTAURACAO_DIAS } from '@/lib/lixeiraRepo';
import { todayBR } from '@/lib/dateUtils';

/** Constrói uma data YYYY-MM-DD com `n` dias no passado a partir de hoje (Brasília). */
function diasAtras(n: number): string {
  const [y, m, d] = todayBR().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - n));
  return dt.toISOString().slice(0, 10);
}

describe('situacaoRestauracao — janela de restauração', () => {
  it('excluído hoje: restaurável, com o prazo cheio restante', () => {
    const s = situacaoRestauracao(todayBR());
    expect(s.diasDesde).toBe(0);
    expect(s.restauravel).toBe(true);
    expect(s.diasRestantes).toBe(PRAZO_RESTAURACAO_DIAS);
  });

  it('no limite exato (30 dias): ainda restaurável, 0 dias restantes', () => {
    const s = situacaoRestauracao(diasAtras(PRAZO_RESTAURACAO_DIAS));
    expect(s.diasDesde).toBe(PRAZO_RESTAURACAO_DIAS);
    expect(s.restauravel).toBe(true);
    expect(s.diasRestantes).toBe(0);
  });

  it('passado o prazo (31 dias): não restaurável', () => {
    const s = situacaoRestauracao(diasAtras(PRAZO_RESTAURACAO_DIAS + 1));
    expect(s.restauravel).toBe(false);
    expect(s.diasRestantes).toBe(0);
  });

  it('metade do prazo (10 dias): restaurável com 20 dias restantes', () => {
    const s = situacaoRestauracao(diasAtras(10));
    expect(s.diasDesde).toBe(10);
    expect(s.restauravel).toBe(true);
    expect(s.diasRestantes).toBe(PRAZO_RESTAURACAO_DIAS - 10);
  });

  it('data muito antiga: não restaurável, sem dias restantes', () => {
    const s = situacaoRestauracao('2000-01-01');
    expect(s.restauravel).toBe(false);
    expect(s.diasRestantes).toBe(0);
  });
});
