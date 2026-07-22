/**
 * Gera o PDF da Programação (via HTML + window.print) a partir do modelo
 * compartilhado. Mantém EXATAMENTE o layout atual da tela — só passou a
 * consumir o modelo único (mesmos dados/ordem/total do Excel).
 */
import { fmtMoedaBr } from './buildProgramacaoExport';
import type { ProgramacaoExportModel } from './types';

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML completo do relatório (idêntico ao layout atual). */
export function renderProgramacaoPdfHtml(model: ProgramacaoExportModel, logoUrl: string): string {
  const rows = model.linhas.map((l) => `<tr>
        <td style="font-weight:700">${escapeHtml(l.numeroPedido)}</td>
        <td>${escapeHtml(l.clienteNome)}</td>
        <td style="font-size:8px;color:#555">${escapeHtml(l.cidade)}</td>
        <td style="font-size:8px;text-align:center">${escapeHtml(l.uf)}</td>
        <td style="font-size:8px;color:#555">${escapeHtml(l.representante)}</td>
        <td style="text-align:center">${l.qtdKits != null ? l.qtdKits : '—'}</td>
        <td style="text-align:right">${fmtMoedaBr(l.valor)}</td>
        <td style="text-align:center">${l.previsaoDefinida ? l.previsaoLabel : '<span style="color:#dc2626;font-weight:600">A DEFINIR</span>'}</td>
      </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title></title>
<style>
  @page { size: A4 landscape; margin: 7mm 8mm; }
  @page { @top-left { content: ""; } @top-center { content: ""; } @top-right { content: ""; } @bottom-left { content: ""; } @bottom-center { content: ""; } @bottom-right { content: ""; } }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Arial,sans-serif; color:#1a1a1a; font-size:9px; }
  .page-header { display:flex; align-items:center; justify-content:space-between; padding-bottom:4px; border-bottom:2px solid #0a2315; margin-bottom:4px; }
  .page-header img { height:28px; }
  .ph-title { text-align:right; }
  .ph-title h1 { font-size:12px; color:#0a2315; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; }
  .ph-title p { font-size:8px; color:#888; margin-top:1px; }
  table { width:100%; border-collapse:collapse; }
  thead th { background:#0a2315; color:#fff; padding:3px 6px; font-size:8px; text-transform:uppercase; letter-spacing:0.3px; font-weight:700; white-space:nowrap; }
  thead { display:table-header-group; }
  tbody td { padding:1.5px 6px; border-bottom:1px solid #e8e8e8; font-size:9px; line-height:1.1; }
  tbody tr:nth-child(even) { background:#f5f7f5; }
  .total-row td { padding:4px 6px; font-weight:800; font-size:9px; border-top:2px solid #0a2315; background:#f0f2f0; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
<script>window.onload = () => { window.focus(); window.print(); };</script>
</head><body>
  <div class="page-header">
    <img src="${logoUrl}" alt="Concrem" />
    <div class="ph-title">
      <h1>${escapeHtml(model.titulo)}</h1>
      <p>Emissão: ${model.emissao} &nbsp;·&nbsp; ${model.count} pedido(s)</p>
    </div>
  </div>
  <table>
    <thead><tr>
      <th style="text-align:left">Nº Pedido</th>
      <th style="text-align:left">Cliente</th>
      <th style="text-align:left">Cidade</th>
      <th style="text-align:center">UF</th>
      <th style="text-align:left">Representante</th>
      <th style="text-align:center">Qtd Kits</th>
      <th style="text-align:right">Valor</th>
      <th style="text-align:center">Prev. Embarque</th>
    </tr></thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="5" style="text-align:right">TOTAL</td>
        <td></td>
        <td style="text-align:right;white-space:nowrap">${fmtMoedaBr(model.totalValor)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>
</body></html>`;
}

/** Abre o PDF em nova janela (dispara a impressão). Requer gesto do usuário. */
export function openProgramacaoPdf(model: ProgramacaoExportModel, logoUrl: string): boolean {
  const html = renderProgramacaoPdfHtml(model, logoUrl);
  const w = window.open('', '_blank', 'width=1200,height=800');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
