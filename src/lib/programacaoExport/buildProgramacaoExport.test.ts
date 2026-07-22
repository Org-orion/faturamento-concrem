import { describe, it, expect } from 'vitest';
import { buildProgramacaoExport, COLUNAS_PROGRAMACAO } from './buildProgramacaoExport';
import { renderProgramacaoPdfHtml } from './programacaoPdf';
import type { PedidoProgramacao } from './types';

const NOW = new Date(2026, 6, 22, 14, 30, 0); // 22/07/2026 14:30 (local)

const p = (over: Partial<PedidoProgramacao> & { pedidoId: string }): PedidoProgramacao => ({
  numeroPedido: over.pedidoId,
  clienteNome: 'Cliente',
  cidadeCliente: 'São Paulo',
  ufCliente: 'SP',
  representante: 'Rep',
  totalQtd: 1,
  valor: 100,
  dataEmbarqueProgramacao: null,
  ...over,
});

const base: PedidoProgramacao[] = [
  p({ pedidoId: 'A', clienteNome: 'Zeta', valor: 10, dataEmbarqueProgramacao: '2026-07-10' }),
  p({ pedidoId: 'B', clienteNome: 'Alfa', valor: 20, dataEmbarqueProgramacao: '2026-07-05' }),
  p({ pedidoId: 'C', clienteNome: 'Beta', valor: 30, dataEmbarqueProgramacao: null }),
  p({ pedidoId: 'D', clienteNome: 'Alfa', valor: 40, dataEmbarqueProgramacao: null }),
];

const build = (pedidos: PedidoProgramacao[], overrides?: Map<string, string>) =>
  buildProgramacaoExport({ pedidos, mes: '2026-07', overrides, now: NOW });

describe('buildProgramacaoExport — fonte única', () => {
  it('conta os registros e soma o total', () => {
    const m = build(base);
    expect(m.count).toBe(4);
    expect(m.linhas).toHaveLength(4);
    expect(m.totalValor).toBe(100); // 10+20+30+40
  });

  it('ordena por previsão ↑ (sem previsão por último) e depois cliente A–Z', () => {
    const m = build(base);
    expect(m.linhas.map((l) => l.pedidoId)).toEqual(['B', 'A', 'D', 'C']);
    // B(05/07) < A(10/07); depois nulos por cliente: D(Alfa) < C(Beta)
  });

  it('aplica os overrides de previsão (edição do modal) e reordena', () => {
    const ov = new Map([['C', '2026-07-01']]);
    const m = build(base, ov);
    expect(m.linhas[0].pedidoId).toBe('C');           // agora é o mais cedo
    expect(m.linhas[0].previsaoLabel).toBe('01/07/2026');
    expect(m.linhas[0].previsaoDefinida).toBe(true);
  });

  it('formata data dd/mm/aaaa e "A DEFINIR" para sem previsão', () => {
    const m = build(base);
    const a = m.linhas.find((l) => l.pedidoId === 'A')!;
    expect(a.previsaoLabel).toBe('10/07/2026');
    const c = m.linhas.find((l) => l.pedidoId === 'C')!;
    expect(c.previsaoLabel).toBe('A DEFINIR');
    expect(c.previsaoDefinida).toBe(false);
  });

  it('usa fallback "—" para cidade/uf/representante ausentes', () => {
    const m = build([p({ pedidoId: 'X', cidadeCliente: null, ufCliente: null, representante: null })]);
    expect(m.linhas[0].cidade).toBe('—');
    expect(m.linhas[0].uf).toBe('—');
    expect(m.linhas[0].representante).toBe('—');
  });

  it('define título, mês e nome de arquivo', () => {
    const m = build(base);
    expect(m.titulo).toBe('Programação de Pedidos — Julho de 2026');
    expect(m.mesLabel).toBe('Julho de 2026');
    expect(m.fileBaseName).toBe('programacao-2026-07');
    expect(m.orientacao).toBe('landscape');
    expect(m.emissao).toContain('22/07/2026');
  });

  it('colunas: 8, na ordem correta', () => {
    expect(COLUNAS_PROGRAMACAO.map((c) => c.header)).toEqual([
      'Nº Pedido', 'Cliente', 'Cidade', 'UF', 'Representante', 'Qtd Kits', 'Valor', 'Prev. Embarque',
    ]);
  });

  it('vazio → 0 registros e total 0', () => {
    const m = build([]);
    expect(m.count).toBe(0);
    expect(m.totalValor).toBe(0);
  });
});

describe('equivalência PDF ↔ modelo (mesma fonte do Excel)', () => {
  it('o HTML do PDF tem exatamente 1 linha por registro do modelo, na mesma ordem', () => {
    const m = build(base);
    const html = renderProgramacaoPdfHtml(m, 'logo.png');
    // conta linhas de dados (cada uma começa com a célula em negrito do nº do pedido)
    const dataRows = (html.match(/font-weight:700">/g) || []).length;
    expect(dataRows).toBe(m.count);
    // ordem dos pedidos no HTML == ordem do modelo
    const posic = m.linhas.map((l) => html.indexOf(`>${l.numeroPedido}<`));
    const ordenado = [...posic].sort((a, b) => a - b);
    expect(posic).toEqual(ordenado);
  });

  it('o total do PDF reflete o total do modelo', () => {
    const m = build(base);
    const html = renderProgramacaoPdfHtml(m, 'logo.png');
    expect(html).toContain('R$ 100,00'); // total 10+20+30+40
    expect(html).toContain('class="total-row"');
  });

  it('caracteres especiais são escapados no HTML (sem quebrar o layout)', () => {
    const m = build([p({ pedidoId: '1', clienteNome: 'A & B <Ltda>' })]);
    const html = renderProgramacaoPdfHtml(m, 'logo.png');
    expect(html).toContain('A &amp; B &lt;Ltda&gt;');
  });
});
