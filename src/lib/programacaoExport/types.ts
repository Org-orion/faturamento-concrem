/**
 * Modelo de exportação da Programação — FONTE ÚNICA para PDF e Excel.
 * O mesmo modelo alimenta os dois formatos, garantindo dados, ordem, colunas,
 * totais e cabeçalho idênticos. Não incluir campos técnicos aqui.
 */

/** Subconjunto do Pedido da tela que a exportação precisa (sem campos técnicos). */
export type PedidoProgramacao = {
  pedidoId: string;
  numeroPedido: string;
  clienteNome: string;
  cidadeCliente: string | null;
  ufCliente: string | null;
  representante: string | null;
  totalQtd: number | null;
  valor: number;
  dataEmbarqueProgramacao: string | null;
};

export type Alinhamento = 'left' | 'center' | 'right';

export type ColunaExport = {
  key: 'numeroPedido' | 'clienteNome' | 'cidade' | 'uf' | 'representante' | 'qtdKits' | 'valor' | 'previsao';
  header: string;
  align: Alinhamento;
  /** Largura sugerida no Excel (em caracteres). */
  larguraExcel: number;
};

export type LinhaExport = {
  pedidoId: string;
  numeroPedido: string;
  clienteNome: string;
  cidade: string;            // com fallback '—'
  uf: string;                // com fallback '—'
  representante: string;     // com fallback '—'
  qtdKits: number | null;
  valor: number;
  /** ISO YYYY-MM-DD da previsão, ou null. */
  previsaoIso: string | null;
  /** dd/mm/aaaa ou 'A DEFINIR'. */
  previsaoLabel: string;
  previsaoDefinida: boolean;
};

export type ProgramacaoExportModel = {
  titulo: string;              // "Programação de Pedidos — Julho/2026"
  mes: string;                 // 'YYYY-MM'
  mesLabel: string;            // "Julho/2026"
  emissao: string;             // "22/07/2026 14:30"
  emissaoData: Date;
  count: number;
  colunas: ColunaExport[];
  linhas: LinhaExport[];
  totalValor: number;
  orientacao: 'landscape' | 'portrait';
  /** Base do nome do arquivo (sem extensão). Ex.: 'programacao-2026-07'. */
  fileBaseName: string;
};
