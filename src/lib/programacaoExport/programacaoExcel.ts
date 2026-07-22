/**
 * Gera o Excel (.xlsx) da Programação a partir do MESMO modelo do PDF, usando
 * ExcelJS (já instalado). Reproduz o relatório: logo, cabeçalho, colunas na
 * mesma ordem, mesmos registros/ordem/total, A4 paisagem, configuração de
 * impressão e formatação pt-BR. Importado sob demanda (chunk pesado).
 */
import type { ProgramacaoExportModel } from './types';

const VERDE = 'FF0A2315';       // cabeçalho / bordas
const VERDE_TXT = 'FF0A2315';
const CINZA_TXT = 'FF888888';
const ZEBRA = 'FFF5F7F5';       // linha par
const TOTAL_BG = 'FFF0F2F0';
const VERMELHO = 'FFDC2626';    // "A DEFINIR"

const COL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

/** Carrega dimensões naturais da imagem (para não deformar o logo). */
function loadImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 200, height: img.naturalHeight || 60 });
    img.onerror = () => resolve({ width: 200, height: 60 });
    img.src = url;
  });
}

function dispararDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function gerarProgramacaoExcel(model: ProgramacaoExportModel, logoUrl: string): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Concrem';
  const ws = wb.addWorksheet('Programação', {
    pageSetup: {
      orientation: model.orientacao,
      paperSize: 9,               // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.3, right: 0.3, top: 0.3, bottom: 0.3, header: 0.2, footer: 0.2 },
    },
    views: [{ state: 'frozen', ySplit: 4 }],  // congela cabeçalho ao rolar
  });

  // Larguras (ordem das colunas = modelo)
  model.colunas.forEach((c, i) => { ws.getColumn(i + 1).width = c.larguraExcel; });

  // ── Cabeçalho: logo (esq.) + título/emissão (dir.), com régua inferior ──
  ws.mergeCells('A1:B2');
  ws.mergeCells('C1:H1');
  ws.mergeCells('C2:H2');
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 16;

  const cTitulo = ws.getCell('C1');
  cTitulo.value = model.titulo;
  cTitulo.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: VERDE_TXT } };
  cTitulo.alignment = { horizontal: 'right', vertical: 'middle' };

  const cEmissao = ws.getCell('C2');
  cEmissao.value = `Emissão: ${model.emissao}  ·  ${model.count} pedido(s)`;
  cEmissao.font = { name: 'Segoe UI', size: 9, color: { argb: CINZA_TXT } };
  cEmissao.alignment = { horizontal: 'right', vertical: 'middle' };

  // Régua inferior verde (mesma do PDF) na base da faixa do cabeçalho
  for (const L of COL_LETTERS) {
    ws.getCell(`${L}2`).border = { bottom: { style: 'medium', color: { argb: VERDE } } };
  }

  // Logo proporcional (altura ~40px), ancorado em A1
  try {
    const [buf, size] = await Promise.all([
      fetch(logoUrl).then((r) => r.arrayBuffer()),
      loadImageSize(logoUrl),
    ]);
    const targetH = 40;
    const w = Math.max(1, Math.round(targetH * (size.width / size.height)));
    const imgId = wb.addImage({ buffer: buf as ArrayBuffer, extension: 'png' });
    ws.addImage(imgId, { tl: { col: 0.2, row: 0.2 }, ext: { width: w, height: targetH }, editAs: 'oneCell' });
  } catch { /* sem logo se falhar o fetch — não bloqueia a exportação */ }

  // ── Linha de cabeçalho das colunas (linha 4) ──
  const headerRow = ws.getRow(4);
  model.colunas.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: 'Segoe UI', size: 8, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    cell.alignment = { horizontal: c.align, vertical: 'middle' };
  });
  headerRow.height = 18;
  ws.pageSetup.printTitlesRow = '4:4';   // repete o cabeçalho em cada página

  // ── Linhas de dados ──
  let r = 5;
  model.linhas.forEach((l, idx) => {
    const row = ws.getRow(r);
    const zebra = idx % 2 === 1;

    const set = (colIdx: number, value: ExcelJS.CellValue, align: 'left' | 'center' | 'right', numFmt?: string) => {
      const cell = row.getCell(colIdx);
      cell.value = value;
      cell.alignment = { horizontal: align, vertical: 'middle', wrapText: colIdx === 2 };
      cell.font = { name: 'Segoe UI', size: 9 };
      if (numFmt) cell.numFmt = numFmt;
      if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE8E8E8' } } };
    };

    set(1, l.numeroPedido, 'left');
    row.getCell(1).font = { name: 'Segoe UI', size: 9, bold: true };
    set(2, l.clienteNome, 'left');
    set(3, l.cidade, 'left');
    set(4, l.uf, 'center');
    set(5, l.representante, 'left');
    set(6, l.qtdKits != null ? l.qtdKits : '—', 'center');
    set(7, l.valor, 'right', '"R$" #,##0.00');

    // Prev. Embarque: data real (meio-dia local, evita drift de fuso) ou "A DEFINIR"
    if (l.previsaoDefinida && l.previsaoIso) {
      const [y, m, d] = l.previsaoIso.split('-').map(Number);
      set(8, new Date(y, m - 1, d, 12, 0, 0), 'center', 'dd/mm/yyyy');
    } else {
      set(8, 'A DEFINIR', 'center');
      row.getCell(8).font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: VERMELHO } };
    }
    r++;
  });

  // ── Linha de TOTAL (espelha o PDF: TOTAL em A:E, valor em G) ──
  const totalRow = ws.getRow(r);
  ws.mergeCells(`A${r}:E${r}`);
  const cTotalLabel = totalRow.getCell(1);
  cTotalLabel.value = 'TOTAL';
  cTotalLabel.alignment = { horizontal: 'right', vertical: 'middle' };
  const cTotalValor = totalRow.getCell(7);
  cTotalValor.value = model.totalValor;
  cTotalValor.numFmt = '"R$" #,##0.00';
  cTotalValor.alignment = { horizontal: 'right', vertical: 'middle' };
  for (const L of COL_LETTERS) {
    const cell = ws.getCell(`${L}${r}`);
    cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: VERDE_TXT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } };
    cell.border = { top: { style: 'medium', color: { argb: VERDE } } };
  }
  totalRow.height = 18;

  // Área de impressão cobre tudo
  ws.pageSetup.printArea = `A1:H${r}`;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  dispararDownload(blob, `${model.fileBaseName}.xlsx`);
}
