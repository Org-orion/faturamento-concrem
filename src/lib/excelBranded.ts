/**
 * Utilitário para gerar planilhas Excel com a identidade visual Concrem.
 * Usa ExcelJS (importado dinamicamente) para suportar estilos, bordas, imagens.
 */

import logoTaglineUrl from '@/assets/logo-tagline.png';

// ---------- tipos ----------
export interface BrandedColumn {
  header: string;
  key: string;
  width: number;          // largura Excel (em caracteres, mapeada para ws.getColumn().width)
  numFmt?: string;
  /** Alinhamento horizontal das células de dados. Default 'left'. */
  align?: 'left' | 'center' | 'right';
  /** Estilo override para as células de dados desta coluna */
  dataStyle?: {
    fontColor?: string;   // argb ex: 'FFFF0000'
    bold?: boolean;
  };
}

export interface BrandedSheetOptions {
  sheetName: string;
  columns: BrandedColumn[];
  rows: Record<string, unknown>[];
  totalRow: Record<string, unknown>;
  subtitleText?: string;
  /**
   * Layout da área de logo.
   * 'merged' = mescla linhas 1-3 × todas as colunas para a logo (Diretoria Janderson)
   * 'default' = logo + subtítulo em linhas separadas (Engenharia / Exportar Planilha)
   */
  logoLayout?: 'default' | 'merged';
  /** Altura da linha de dados. Default 15. */
  dataRowHeight?: number;
  /** Altura da linha de cabeçalho. Default 20. */
  headerHeight?: number;
  /** Destaque condicional de linha inteira quando coluna.key === value. */
  rowHighlight?: {
    key: string;
    value: string;
    bgColor: string;   // argb ex: 'FF009700'
    fontColor: string; // argb ex: 'FFFFFFFF'
    bold?: boolean;
  };
}

// ---------- cores ----------
const GREEN_DARK  = 'FF2D5016';
const WHITE       = 'FFFFFFFF';
const BLACK       = 'FF1A1A1A';
const BORDER_GRAY = 'FF333333';
const ROW_EVEN    = 'FFEEF4E8';

/**
 * Calcula a coluna fracionária de início para centralizar horizontalmente
 * uma imagem de `logoW` pixels na área das colunas fornecidas.
 * Usa ~7.59 px por unidade de largura Excel (Calibri 11pt @ 96 dpi).
 */
function calcLogoCenterCol(cols: BrandedColumn[], logoW: number): number {
  const PX_PER_CHAR = 7.59;
  const totalPx = cols.reduce((s, c) => s + c.width * PX_PER_CHAR, 0);
  let startPx = Math.max(0, (totalPx - logoW) / 2);
  for (let i = 0; i < cols.length; i++) {
    const colPx = cols[i].width * PX_PER_CHAR;
    if (startPx < colPx) return i + startPx / colPx;
    startPx -= colPx;
  }
  return cols.length;
}

function calcLogoCenterRow(rowHeightsPt: number[], logoH: number): number {
  const PX_PER_PT = 96 / 72;
  const totalPx = rowHeightsPt.reduce((s, h) => s + h * PX_PER_PT, 0);
  let startPx = Math.max(0, (totalPx - logoH) / 2);
  for (let i = 0; i < rowHeightsPt.length; i++) {
    const rowPx = rowHeightsPt[i] * PX_PER_PT;
    if (startPx < rowPx) return i + startPx / rowPx;
    startPx -= rowPx;
  }
  return rowHeightsPt.length;
}

// ---------- helpers ----------
function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  if (!isPng) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = dv.getUint32(16, false);
  const height = dv.getUint32(20, false);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

async function fetchLogoData(): Promise<{ base64: string; width: number; height: number } | null> {
  const resp = await fetch(logoTaglineUrl);
  const buf = await resp.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const dims = readPngDimensions(bytes);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return dims ? { base64, width: dims.width, height: dims.height } : null;
}

function thinBorder() {
  const s = { style: 'thin' as const, color: { argb: BORDER_GRAY } };
  return { top: s, bottom: s, left: s, right: s };
}

// ---------- API pública ----------

export async function createBrandedWorkbook(opts: BrandedSheetOptions): Promise<ArrayBuffer> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Concrem Sistema';
  wb.created = new Date();

  const ws = wb.addWorksheet(opts.sheetName);
  const colCount = opts.columns.length;
  const layout = opts.logoLayout || 'default';
  const dataRowH = opts.dataRowHeight ?? 15;

  // --- larguras ---
  opts.columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width;
  });

  // --- Logo ---
  let logo: { base64: string; width: number; height: number } | null = null;
  try { logo = await fetchLogoData(); } catch { /* sem logo */ }

  let HEADER_ROW: number;

  if (layout === 'merged') {
    // ============ LAYOUT MERGED (Diretoria Janderson) ============
    // Linhas 1-3 mescladas com logo centralizada
    ws.mergeCells(1, 1, 3, colCount);
    const mergedCell = ws.getRow(1).getCell(1);
    mergedCell.alignment = { vertical: 'middle', horizontal: 'center' };

    const rowHeightsPt = [22, 22, 22];
    if (logo) {
      const PX_PER_PT = 96 / 72;
      const neededPt = (logo.height / PX_PER_PT) + 2;
      const perRow = Math.max(22, Math.ceil((neededPt / 3) * 4) / 4);
      rowHeightsPt[0] = perRow;
      rowHeightsPt[1] = perRow;
      rowHeightsPt[2] = perRow;
    }

    ws.getRow(1).height = rowHeightsPt[0];
    ws.getRow(2).height = rowHeightsPt[1];
    ws.getRow(3).height = rowHeightsPt[2];

    if (logo) {
      const imageId = wb.addImage({ base64: logo.base64, extension: 'png' });
      const logoCol = calcLogoCenterCol(opts.columns, logo.width);
      const logoRow = calcLogoCenterRow(rowHeightsPt, logo.height);
      ws.addImage(imageId, {
        tl: { col: logoCol, row: logoRow } as any,
        ext: { width: logo.width, height: logo.height },
      });
    }

    // Linha 4 — espaçamento
    ws.getRow(4).height = 6;

    // Cabeçalho na linha 5
    HEADER_ROW = 5;
  } else {
    // ============ LAYOUT DEFAULT (Engenharia / Exportar Planilha) ============
    // Logo linhas 1-3
    if (logo) {
      const imageId = wb.addImage({ base64: logo.base64, extension: 'png' });
      ws.addImage(imageId, {
        tl: { col: 0, row: 0 } as any,
        ext: { width: 240, height: 58 },
      });
    }
    ws.getRow(1).height = 20;
    ws.getRow(2).height = 20;
    ws.getRow(3).height = 20;

    // Subtítulo na linha 4
    const subRow = ws.getRow(4);
    subRow.getCell(1).value = opts.subtitleText || 'CONCREM INDUSTRIAL LTDA';
    subRow.getCell(1).font = { bold: true, size: 12, color: { argb: GREEN_DARK }, name: 'Calibri' };
    subRow.height = 18;
    ws.mergeCells(4, 1, 4, colCount);

    // Espaçamento na linha 5
    ws.getRow(5).height = 6;

    // Cabeçalho na linha 6
    HEADER_ROW = 6;
  }

  // --- Cabeçalho ---
  const headerRow = ws.getRow(HEADER_ROW);
  headerRow.height = opts.headerHeight ?? 20;
  opts.columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header.toUpperCase();
    cell.font = { bold: true, size: 12, color: { argb: WHITE }, name: 'Calibri' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_DARK } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = thinBorder();
  });

  // --- Linhas de dados ---
  let curRow = HEADER_ROW + 1;
  const hl = opts.rowHighlight;
  opts.rows.forEach((rowData, idx) => {
    const row = ws.getRow(curRow);
    row.height = dataRowH;
    const isEven = idx % 2 === 1;
    const isHighlighted = hl !== undefined && rowData[hl.key] === hl.value;

    opts.columns.forEach((col, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = rowData[col.key] as any;

      let fontColor = BLACK;
      let bold = false;
      let bgArgb: string | null = isEven ? ROW_EVEN : null;

      if (isHighlighted && hl) {
        bgArgb = hl.bgColor;
        fontColor = hl.fontColor;
        if (hl.bold) bold = true;
      } else {
        if (col.dataStyle?.fontColor) fontColor = col.dataStyle.fontColor;
        if (col.dataStyle?.bold) bold = true;
      }

      cell.font = { size: 11, color: { argb: fontColor }, name: 'Calibri', bold };
      if (bgArgb) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
      }
      cell.border = thinBorder();
      cell.alignment = { vertical: 'middle', horizontal: col.align ?? 'left' };
      if (col.numFmt) cell.numFmt = col.numFmt;
    });

    curRow++;
  });

  // --- Linha de total ---
  const totalRowExcel = ws.getRow(curRow);
  totalRowExcel.height = 20;
  opts.columns.forEach((col, cIdx) => {
    const cell = totalRowExcel.getCell(cIdx + 1);
    cell.value = opts.totalRow[col.key] as any;
    cell.font = { bold: true, size: 11, color: { argb: WHITE }, name: 'Calibri' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLACK } };
    cell.border = thinBorder();
    cell.alignment = { vertical: 'middle' };
    if (col.numFmt) cell.numFmt = col.numFmt;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/** Dispara download de um ArrayBuffer como .xlsx */
export function downloadBuffer(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Gera buffer em base64 para anexo de e-mail */
export async function createBrandedBase64(opts: BrandedSheetOptions): Promise<string> {
  const buffer = await createBrandedWorkbook(opts);
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
