/**
 * FONTE ÚNICA da exportação da Programação.
 * Recebe os pedidos JÁ FILTRADOS da tela (groupedMonths.get(mes)) + as edições
 * de previsão do modal (overrides) e produz o modelo que PDF e Excel consomem.
 * A ordenação, colunas, rótulos, datas e total ficam TODOS aqui — os geradores
 * de PDF/Excel não recalculam nada.
 */
import type { ColunaExport, LinhaExport, PedidoProgramacao, ProgramacaoExportModel } from './types';

/** Colunas do relatório — mesma ordem/rótulos do PDF atual. */
export const COLUNAS_PROGRAMACAO: ColunaExport[] = [
  { key: 'numeroPedido',  header: 'Nº Pedido',      align: 'left',   larguraExcel: 12 },
  { key: 'clienteNome',   header: 'Cliente',         align: 'left',   larguraExcel: 44 },
  { key: 'cidade',        header: 'Cidade',          align: 'left',   larguraExcel: 22 },
  { key: 'uf',            header: 'UF',              align: 'center', larguraExcel: 5 },
  { key: 'representante', header: 'Representante',   align: 'left',   larguraExcel: 26 },
  { key: 'qtdKits',       header: 'Qtd Kits',        align: 'center', larguraExcel: 9 },
  { key: 'valor',         header: 'Valor',           align: 'right',  larguraExcel: 15 },
  { key: 'previsao',      header: 'Prev. Embarque',  align: 'center', larguraExcel: 14 },
];

/** "YYYY-MM" → "Julho/2026" (mesma regra do fmtMesLabel da tela). */
export function fmtMesLabelExport(mesStr: string): string {
  const [y, m] = mesStr.split('-');
  const d = new Date(Number(y), Number(m) - 1);
  const raw = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** ISO "YYYY-MM-DD..." → "dd/mm/aaaa". */
export function fmtDataBr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Ordenação idêntica ao PDF: previsão ↑ (sem previsão por último) → cliente A–Z. */
function ordenar(a: { previsaoIso: string | null; clienteNome: string }, b: { previsaoIso: string | null; clienteNome: string }): number {
  const da = a.previsaoIso ?? '';
  const db = b.previsaoIso ?? '';
  if (da && db) return da.localeCompare(db);
  if (da) return -1;
  if (db) return 1;
  return a.clienteNome.localeCompare(b.clienteNome, 'pt-BR');
}

export function buildProgramacaoExport(params: {
  pedidos: PedidoProgramacao[];
  mes: string;                       // 'YYYY-MM'
  overrides?: Map<string, string>;   // pedidoId → ISO da previsão (edições do modal)
  now: Date;                         // instante de emissão (injetado, testável)
}): ProgramacaoExportModel {
  const { pedidos, mes, overrides, now } = params;
  const ov = overrides ?? new Map<string, string>();

  const previsaoDe = (p: PedidoProgramacao): string | null => {
    const raw = ov.get(p.pedidoId) ?? p.dataEmbarqueProgramacao ?? '';
    return raw ? raw.slice(0, 10) : null;
  };

  const linhas: LinhaExport[] = pedidos
    .map((p): LinhaExport => {
      const previsaoIso = previsaoDe(p);
      return {
        pedidoId: p.pedidoId,
        numeroPedido: p.numeroPedido,
        clienteNome: p.clienteNome,
        cidade: p.cidadeCliente ?? '—',
        uf: p.ufCliente ?? '—',
        representante: p.representante ?? '—',
        qtdKits: p.totalQtd,
        valor: p.valor,
        previsaoIso,
        previsaoLabel: previsaoIso ? fmtDataBr(previsaoIso) : 'A DEFINIR',
        previsaoDefinida: !!previsaoIso,
      };
    })
    .sort(ordenar);

  const totalValor = linhas.reduce((s, l) => s + (l.valor || 0), 0);
  const mesLabel = fmtMesLabelExport(mes);
  const emissao = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  return {
    titulo: `Programação de Pedidos — ${mesLabel}`,
    mes,
    mesLabel,
    emissao,
    emissaoData: now,
    count: linhas.length,
    colunas: COLUNAS_PROGRAMACAO,
    linhas,
    totalValor,
    orientacao: 'landscape',
    fileBaseName: `programacao-${mes}`,
  };
}

/** "R$ 1.234,56" — mesmo formato do PDF. */
export function fmtMoedaBr(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}
