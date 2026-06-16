import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabaseOps, supabasePedidos } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export type PedidoElegivel = {
  pedidoId: string;
  programacaoId: string;
  numeroNota: string;
  nomeCliente: string;
  entregueEm: string | null;
};

export type ProtocoloPedidoRow = {
  pedido_id: string;
  programacao_id: string;
  numero_nota: string;
  nome_cliente: string;
};

export type ProtocoloRow = {
  id: string;
  numero_protocolo: string;
  criado_por: string | null;
  criado_por_nome: string | null;
  criado_em: string;
  status: 'ativo' | 'cancelado';
  observacoes: string | null;
};

export type ProtocoloComPedidos = ProtocoloRow & { pedidos: ProtocoloPedidoRow[] };

const PEDIDOS_TABLE = (import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE as string) || 'concrem_pedidos_sistema';

/** Erro de negócio com mensagem amigável já pronta para exibir ao usuário. */
export class ProtocoloError extends Error {}

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ---------------------------------------------------------------------------
// 3.1 — Buscar pedidos elegíveis
// ---------------------------------------------------------------------------
export async function fetchPedidosElegiveis(): Promise<PedidoElegivel[]> {
  if (!supabaseOps) throw new ProtocoloError('Banco operacional indisponível.');

  // 1) Todas as entregas com nota fiscal preenchida (paginado)
  const entregas: Array<{ pedido_id: string; programacao_id: string; numero_nota: string; entregue_em: string | null }> = [];
  const PAGE = 1000;
  for (let p = 0; p < 50; p++) {
    const { data, error } = await supabaseOps
      .from('concrem_entregas')
      .select('pedido_id, programacao_id, numero_nota, entregue_em')
      .not('numero_nota', 'is', null)
      .neq('numero_nota', '')
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (error) throw new ProtocoloError('Erro ao carregar pedidos. Tente novamente.');
    if (!data?.length) break;
    entregas.push(...(data as any));
    if (data.length < PAGE) break;
  }

  // 2) Pedidos já protocolados (ficam bloqueados)
  const protocolados = new Set<string>();
  for (let p = 0; p < 50; p++) {
    const { data, error } = await supabaseOps
      .from('concrem_protocolos_pedidos')
      .select('pedido_id')
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (error) throw new ProtocoloError('Erro ao carregar pedidos. Tente novamente.');
    if (!data?.length) break;
    for (const r of data as any[]) protocolados.add(String(r.pedido_id));
    if (data.length < PAGE) break;
  }

  // 3) Dedupe por pedido_id e remove os já protocolados
  const byPedido = new Map<string, { pedidoId: string; programacaoId: string; numeroNota: string; entregueEm: string | null }>();
  for (const e of entregas) {
    const pid = String(e.pedido_id);
    if (protocolados.has(pid)) continue;
    if (byPedido.has(pid)) continue;
    byPedido.set(pid, {
      pedidoId: pid,
      programacaoId: String(e.programacao_id),
      numeroNota: String(e.numero_nota),
      entregueEm: e.entregue_em ?? null,
    });
  }

  const ids = Array.from(byPedido.keys());
  if (!ids.length) return [];

  // 4) Nome do cliente cruzando com o ERP (somente leitura)
  const nomeByPedido = new Map<string, string>();
  if (supabasePedidos) {
    const results = await Promise.all(
      chunk(ids, 200).map((batch) =>
        supabasePedidos!
          .from(PEDIDOS_TABLE)
          .select('numero_pedido, cliente_nome')
          .in('numero_pedido', batch)
          .then(({ data }) => (data || []) as Array<{ numero_pedido: any; cliente_nome: string | null }>),
      ),
    );
    for (const row of results.flat()) {
      nomeByPedido.set(String(row.numero_pedido), row.cliente_nome || '');
    }
  }

  return ids
    .map((pid) => {
      const base = byPedido.get(pid)!;
      return { ...base, nomeCliente: nomeByPedido.get(pid) || '—' };
    })
    .sort((a, b) => a.nomeCliente.localeCompare(b.nomeCliente) || a.pedidoId.localeCompare(b.pedidoId));
}

// ---------------------------------------------------------------------------
// 3.2 — Geração do número de protocolo (PROT-YYYY-NNN, reinicia por ano)
// ---------------------------------------------------------------------------
export async function gerarNumeroProtocolo(ano: number): Promise<string> {
  if (!supabaseOps) throw new ProtocoloError('Banco operacional indisponível.');
  const prefixo = `PROT-${ano}-`;
  const { data, error } = await supabaseOps
    .from('concrem_protocolos_financeiros')
    .select('numero_protocolo')
    .like('numero_protocolo', `${prefixo}%`)
    .order('numero_protocolo', { ascending: false })
    .limit(1);
  if (error) throw new ProtocoloError('Erro ao gerar número do protocolo.');

  let seq = 0;
  if (data?.length) {
    const last = String((data[0] as any).numero_protocolo);
    const n = parseInt(last.slice(prefixo.length), 10);
    if (!Number.isNaN(n)) seq = n;
  }
  return `${prefixo}${String(seq + 1).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// 3.3 — Salvar protocolo (protocolo só permanece se os pedidos forem inseridos)
// ---------------------------------------------------------------------------
const isUniqueViolation = (err: any): boolean => String(err?.code) === '23505';

export async function salvarProtocolo(params: {
  pedidos: ProtocoloPedidoRow[];
  criadoPor: string | null;
  criadoPorNome: string | null;
  observacoes?: string | null;
}): Promise<ProtocoloComPedidos> {
  if (!supabaseOps) throw new ProtocoloError('Banco operacional indisponível.');
  if (!params.pedidos.length) throw new ProtocoloError('Selecione ao menos um pedido.');

  const ano = new Date().getFullYear();

  // Insere o protocolo, com retry caso o número colida (corrida entre usuários)
  let protocolo: ProtocoloRow | null = null;
  for (let attempt = 0; attempt < 5 && !protocolo; attempt++) {
    const numero = await gerarNumeroProtocolo(ano);
    const { data, error } = await supabaseOps
      .from('concrem_protocolos_financeiros')
      .insert({
        numero_protocolo: numero,
        criado_por: params.criadoPor,
        criado_por_nome: params.criadoPorNome,
        status: 'ativo',
        observacoes: params.observacoes ?? null,
      } as any)
      .select('id, numero_protocolo, criado_por, criado_por_nome, criado_em, status, observacoes')
      .single();
    if (error) {
      if (isUniqueViolation(error)) continue; // número já usado → tenta o próximo
      throw new ProtocoloError('Erro ao salvar o protocolo. Tente novamente.');
    }
    protocolo = data as any;
  }
  if (!protocolo) throw new ProtocoloError('Não foi possível gerar um número de protocolo único. Tente novamente.');

  // Insere os pedidos vinculados (statement único = tudo ou nada)
  const rows = params.pedidos.map((p) => ({
    protocolo_id: protocolo!.id,
    pedido_id: p.pedido_id,
    programacao_id: p.programacao_id,
    numero_nota: p.numero_nota,
    nome_cliente: p.nome_cliente,
  }));
  const { error: pedErr } = await supabaseOps.from('concrem_protocolos_pedidos').insert(rows as any);

  if (pedErr) {
    // rollback: remove o protocolo recém-criado (CASCADE limpa qualquer resíduo)
    await supabaseOps.from('concrem_protocolos_financeiros').delete().eq('id', protocolo.id);
    if (isUniqueViolation(pedErr)) {
      throw new ProtocoloError(
        'Um ou mais pedidos selecionados já foram protocolados por outro usuário. Atualize a lista e tente novamente.',
      );
    }
    throw new ProtocoloError('Erro ao vincular os pedidos ao protocolo. Tente novamente.');
  }

  return { ...protocolo, pedidos: rows.map(({ protocolo_id, ...rest }) => rest) };
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------
export async function listarProtocolos(): Promise<ProtocoloComPedidos[]> {
  if (!supabaseOps) throw new ProtocoloError('Banco operacional indisponível.');

  const { data: protos, error } = await supabaseOps
    .from('concrem_protocolos_financeiros')
    .select('id, numero_protocolo, criado_por, criado_por_nome, criado_em, status, observacoes')
    .order('criado_em', { ascending: false });
  if (error) throw new ProtocoloError('Erro ao carregar o histórico de protocolos.');

  const list = (protos || []) as ProtocoloRow[];
  if (!list.length) return [];

  const pedidosByProtocolo = new Map<string, ProtocoloPedidoRow[]>();
  const ids = list.map((p) => p.id);
  for (const batch of chunk(ids, 200)) {
    const { data } = await supabaseOps
      .from('concrem_protocolos_pedidos')
      .select('protocolo_id, pedido_id, programacao_id, numero_nota, nome_cliente')
      .in('protocolo_id', batch);
    for (const r of (data || []) as any[]) {
      const arr = pedidosByProtocolo.get(r.protocolo_id) ?? [];
      arr.push({ pedido_id: r.pedido_id, programacao_id: r.programacao_id, numero_nota: r.numero_nota, nome_cliente: r.nome_cliente });
      pedidosByProtocolo.set(r.protocolo_id, arr);
    }
  }

  return list.map((p) => ({ ...p, pedidos: pedidosByProtocolo.get(p.id) ?? [] }));
}

export async function cancelarProtocolo(id: string): Promise<void> {
  if (!supabaseOps) throw new ProtocoloError('Banco operacional indisponível.');
  const { error } = await supabaseOps
    .from('concrem_protocolos_financeiros')
    .update({ status: 'cancelado' } as any)
    .eq('id', id);
  if (error) throw new ProtocoloError('Erro ao cancelar o protocolo.');
}

// ---------------------------------------------------------------------------
// 5 — Geração do PDF (jsPDF + autotable, 100% no frontend)
// ---------------------------------------------------------------------------
const LOGO_URL = '/logo-nova-tagline-cores.png';

async function loadLogo(): Promise<{ dataUrl: string; ratio: number } | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const ratio: number = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.width && img.height ? img.width / img.height : 3);
      img.onerror = () => resolve(3);
      img.src = dataUrl;
    });
    return { dataUrl, ratio };
  } catch {
    return null;
  }
}

function fmtDataHora(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export async function gerarPdfProtocolo(
  protocolo: Pick<ProtocoloRow, 'numero_protocolo' | 'criado_em' | 'criado_por_nome' | 'criado_por'>,
  pedidos: ProtocoloPedidoRow[],
  usuarioNome?: string | null,
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  const logo = await loadLogo();
  const geradoEm = fmtDataHora(protocolo.criado_em || new Date());
  const nomeUsuario = usuarioNome || protocolo.criado_por_nome || protocolo.criado_por || '—';

  // ---- Cabeçalho ----
  let headerBottom = 14;
  const logoH = 16;
  if (logo) {
    const logoW = logoH * logo.ratio;
    doc.addImage(logo.dataUrl, 'PNG', marginX, 12, logoW, logoH);
  }
  const textX = marginX + (logo ? logoH * logo.ratio + 8 : 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('PROTOCOLO DE ENTREGA DE NOTAS FISCAIS', textX, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Protocolo: ${protocolo.numero_protocolo}`, textX, 23);
  doc.text(`Gerado em: ${geradoEm}`, textX, 28);
  headerBottom = 32;

  // Linha separadora
  doc.setLineWidth(0.4);
  doc.line(marginX, headerBottom, pageWidth - marginX, headerBottom);

  // ---- Tabela de pedidos ----
  const body = pedidos.map((p, i) => [String(i + 1), p.nome_cliente || '—', p.pedido_id, p.numero_nota, '']);

  autoTable(doc, {
    startY: headerBottom + 4,
    head: [['Nº', 'Cliente', 'Nº Pedido', 'NF-e', 'Assinatura do Financeiro']],
    body,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2, lineColor: [120, 120, 120], lineWidth: 0.1, valign: 'middle' },
    headStyles: { fillColor: [55, 65, 81], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      1: { cellWidth: 'auto' },
      2: { halign: 'center', cellWidth: 26 },
      3: { halign: 'center', cellWidth: 26 },
      4: { cellWidth: 55, minCellHeight: 18 },
    },
    margin: { left: marginX, right: marginX, bottom: 20 },
  });

  // ---- Rodapé final (assinaturas) ----
  let finalY = (doc as any).lastAutoTable?.finalY ?? headerBottom + 4;
  const needed = 46;
  if (finalY + needed > pageHeight - 16) {
    doc.addPage();
    finalY = 20;
  }

  let y = finalY + 12;
  doc.setLineWidth(0.4);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 7;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Documento gerado em ${geradoEm} por ${nomeUsuario}`, marginX, y);

  y += 18;
  const colW = (pageWidth - marginX * 2 - 10) / 2;
  doc.line(marginX, y, marginX + colW, y);
  doc.line(pageWidth - marginX - colW, y, pageWidth - marginX, y);
  y += 5;
  doc.setFontSize(8);
  doc.text('Responsável Financeiro', marginX, y);
  doc.text('Responsável Concrem', pageWidth - marginX - colW, y);

  // ---- Paginação: "Página X de Y" ----
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - marginX, pageHeight - 8, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }

  doc.save(`${protocolo.numero_protocolo}.pdf`);
}
