import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, Check, ChevronDown, ChevronRight, FileDown, Pencil, Printer, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import { MultiSelectFilter } from '@/components/filters/MultiSelectFilter';
import logoProgramacao from '@/assets/logo-programacao.png';
import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import { getPedidoStatusLabel, getPedidoStatusBadgeClass } from '@/lib/pedidoStatusFlow';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import type { PedidoStatusValue } from '@/types';
import { btnPrimary, btnSecondary } from '@/components/shared';
import { canFazer } from '@/utils/access';

const YYYYMM_RE = /^\d{4}-\d{2}$/;

// ─── Types ────────────────────────────────────────────────────────────────────

type OpsRow = {
  pedido_id: string;
  numero_pedido: string;
  status_atual: string;
  mes_programacao: string | null;
  atualizado_em: string;
  data_embarque_programacao: string | null;
};

type ErpRow = {
  numero_pedido: string;
  cliente_nome: string | null;
  total_pedido_venda: number | null;
  total_produtos: number | null;
  frete: number | null;
  data_emissao: string | null;
  representante: string | null;
  previsao_embarque: string | null;
  total_qtd: number | null;
  grupo_cliente: string | null;
  id_nota_conf: number | null;
  ped_compra_cliente: string | null;
  cliente_cidade: string | null;
  cliente_uf: string | null;
};

// Pre-formatted fields avoid calling toLocaleString per row on every render
type Pedido = {
  pedidoId: string;
  numeroPedido: string;
  statusAtual: string;
  statusLabel: string;
  statusBadgeClass: string;
  mesProgramacao: string | null;
  atualizadoEm: string;
  clienteNome: string;
  valor: number;
  valorFormatado: string;
  dataEmissao: string | null;
  dataEmissaoFormatada: string;
  representante: string | null;
  previsaoEmbarque: string | null;
  totalQtd: number | null;
  grupoCliente: string | null;
  idNotaConf: number | null;
  pedCompraCliente: string | null;
  cidadeCliente: string | null;
  ufCliente: string | null;
  dataEmbarqueProgramacao: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PRODUCAO_STATUSES: string[] = [
  'liberado_producao', 'em_producao', 'producao_finalizada',
  'em_carregamento', 'despachado',
  'faturado', 'em_entrega', 'parcialmente_entregue',
  'entregue', 'aguardando_pagamento', 'finalizado',
];

const OPS_COLS = 'pedido_id, numero_pedido, status_atual, mes_programacao, atualizado_em, data_embarque_programacao';
const ERP_COLS = 'numero_pedido, cliente_nome, total_pedido_venda, total_produtos, total_qtd, frete, data_emissao, representante, previsao_embarque, grupo_cliente, id_nota_conf, ped_compra_cliente, cliente_cidade, cliente_uf';
const ERP_TABLE = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';

// ─── Module-level helpers (instantiated once, not per render) ─────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const BRL_FMT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DATE_FMT = new Intl.DateTimeFormat('pt-BR');

// Date helpers — timezone-safe (no Date constructor)
const isoToBr = (iso: string) => {
  if (!iso || iso.length < 10) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const brToIso = (br: string) => {
  const match = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  return `${match[3]}-${match[2]}-${match[1]}`;
};

function fmtDateSafe(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return DATE_FMT.format(new Date(iso)); } catch { return '—'; }
}

function fmtMesLabel(mesStr: string): string {
  const [y, m] = mesStr.split('-');
  const d = new Date(Number(y), Number(m) - 1);
  const raw = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function resolveValor(erp: ErpRow | undefined): number {
  if (!erp) return 0;
  if (erp.id_nota_conf === 613 || erp.id_nota_conf === 665) return 0;
  const v = erp.total_pedido_venda ?? 0;
  const base = v > 0 ? v : (erp.total_produtos ?? 0);
  return isFinite(base) && base > 0 ? base : 0;
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function fetchOpsRows(): Promise<OpsRow[]> {
  if (!supabaseOps) return [];
  const PAGE = 1000;
  const all: OpsRow[] = [];

  let from = 0;
  while (true) {
    const { data, error } = await supabaseOps
      .from('concrem_pedidos_status')
      .select(OPS_COLS)
      .not('mes_programacao', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) { console.error('[Programacao] ops programados:', error.message); break; }
    const page = (data ?? []) as OpsRow[];
    all.push(...page);
    if (page.length < PAGE) break;
    from += PAGE;
  }

  const seen = new Set(all.map((r) => r.pedido_id));
  from = 0;
  while (true) {
    const { data, error } = await supabaseOps
      .from('concrem_pedidos_status')
      .select(OPS_COLS)
      .in('status_atual', PRODUCAO_STATUSES)
      .is('mes_programacao', null)
      .range(from, from + PAGE - 1);
    if (error) { console.error('[Programacao] ops sem prog:', error.message); break; }
    const page = (data ?? []) as OpsRow[];
    for (const row of page) {
      if (!seen.has(row.pedido_id)) { all.push(row); seen.add(row.pedido_id); }
    }
    if (page.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

/** Sync único: percorre todos os carregamentos, identifica pedidos Leroy e seta mes_programacao */
async function syncLeroyExistentes(): Promise<{ updated: number; errors: number }> {
  if (!supabaseOps || !supabasePedidos) {
    console.error('[syncLeroy] supabaseOps ou supabasePedidos não disponível');
    return { updated: 0, errors: 1 };
  }

  // 1. Busca todos os carregamentos com data planejada e lista de pedidos
  const { data: loads, error: loadsErr } = await supabaseOps
    .from('concrem_programacoes_embarque')
    .select('planned_date, pedidos')
    .not('pedidos', 'is', null)
    .not('planned_date', 'is', null);
  if (loadsErr) { console.error('[syncLeroy] loads error:', loadsErr.message); return { updated: 0, errors: 1 }; }
  if (!loads?.length) return { updated: 0, errors: 0 };

  // 2. Monta mapa pedidoId → mes (YYYY-MM) — mantém o mês mais recente se duplicado
  const pedidoMesMap = new Map<string, string>();
  for (const load of loads as { planned_date: string; pedidos: string[] }[]) {
    const mes = load.planned_date.slice(0, 7);
    for (const id of load.pedidos) pedidoMesMap.set(String(id), mes);
  }

  const allIds = Array.from(pedidoMesMap.keys());
  if (!allIds.length) return { updated: 0, errors: 0 };

  // 3. Busca nome do cliente no ERP para identificar Leroy
  const erpBatches: { numero_pedido: string; cliente_nome: string | null }[][] = [];
  for (let i = 0; i < allIds.length; i += 200) {
    const { data, error } = await supabasePedidos
      .from(ERP_TABLE)
      .select('numero_pedido, cliente_nome')
      .in('numero_pedido', allIds.slice(i, i + 200));
    if (error) { console.error('[syncLeroy] erp batch error:', error.message); continue; }
    if (data) erpBatches.push(data as { numero_pedido: string; cliente_nome: string | null }[]);
  }
  const erpRows = erpBatches.flat();

  // 4. Filtra apenas Leroy
  const leroyIds = erpRows
    .filter(r => (r.cliente_nome || '').toUpperCase().includes('LEROY'))
    .map(r => String(r.numero_pedido));
  if (!leroyIds.length) return { updated: 0, errors: 0 };

  // 5. Verifica quais já existem em concrem_pedidos_status
  const existingSet = new Set<string>();
  for (let i = 0; i < leroyIds.length; i += 200) {
    const { data } = await supabaseOps
      .from('concrem_pedidos_status')
      .select('pedido_id')
      .in('pedido_id', leroyIds.slice(i, i + 200));
    for (const r of (data || []) as { pedido_id: string }[]) existingSet.add(r.pedido_id);
  }

  const now = new Date().toISOString();
  let updated = 0;
  let errors = 0;

  // 6a. UPDATE mes_programacao para os que já existem
  const toUpdate = leroyIds.filter(id => existingSet.has(id));
  for (let i = 0; i < toUpdate.length; i += 200) {
    const batch = toUpdate.slice(i, i + 200);
    // Atualiza cada grupo do mesmo mês de uma vez
    const byMes = new Map<string, string[]>();
    for (const id of batch) {
      const mes = pedidoMesMap.get(id) ?? '';
      if (!byMes.has(mes)) byMes.set(mes, []);
      byMes.get(mes)!.push(id);
    }
    for (const [mes, ids] of byMes) {
      const { error } = await supabaseOps
        .from('concrem_pedidos_status')
        .update({ mes_programacao: mes, atualizado_em: now, atualizado_por: 'sync_leroy' })
        .in('pedido_id', ids);
      if (error) { console.error('[syncLeroy] update error:', error.message); errors++; }
      else updated += ids.length;
    }
  }

  // 6b. INSERT para os que não existem ainda (com status padrão)
  const toInsert = leroyIds.filter(id => !existingSet.has(id));
  if (toInsert.length) {
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      const { error } = await supabaseOps
        .from('concrem_pedidos_status')
        .insert(batch.map(id => ({
          pedido_id: id,
          numero_pedido: id,
          status_atual: 'liberado_producao',
          mes_programacao: pedidoMesMap.get(id) ?? null,
          atualizado_em: now,
          atualizado_por: 'sync_leroy',
        })));
      if (error) { console.error('[syncLeroy] insert error:', error.message); errors++; }
      else updated += batch.length;
    }
  }

  return { updated, errors };
}

const SHIP_TO_PEDIDO: Record<string, string> = {
  'Aguardando Despacho': 'em_carregamento',
  'Despachado':          'despachado',
  'Em Rota':             'em_entrega',
  'Entregue':            'entregue',
};
const STATUS_JA_ENTREGUES_PROG = new Set(['em_entrega', 'parcialmente_entregue', 'entregue', 'aguardando_pagamento', 'finalizado']);

/** Sync único: atualiza status de todos os pedidos em carregamentos existentes */
async function syncStatusCarregamentos(): Promise<{ updated: number; errors: number }> {
  if (!supabaseOps) return { updated: 0, errors: 1 };

  // 1. Busca todos os carregamentos
  const { data: loads, error: loadsErr } = await supabaseOps
    .from('concrem_programacoes_embarque')
    .select('shipment_status, pedidos')
    .not('pedidos', 'is', null);
  if (loadsErr) { console.error('[syncStatus] loads:', loadsErr.message); return { updated: 0, errors: 1 }; }
  if (!loads?.length) return { updated: 0, errors: 0 };

  // 2. Monta mapa orderId → status alvo (último carregamento vence)
  const pedidoTargetMap = new Map<string, string>();
  for (const load of loads as { shipment_status: string | null; pedidos: string[] | null }[]) {
    const target = load.shipment_status ? SHIP_TO_PEDIDO[load.shipment_status] : null;
    if (!target || !load.pedidos?.length) continue;
    for (const id of load.pedidos) pedidoTargetMap.set(String(id), target);
  }

  const allIds = Array.from(pedidoTargetMap.keys());
  if (!allIds.length) return { updated: 0, errors: 0 };

  // 3. Busca status atuais no OPS
  const currentRows: { pedido_id: string; status_atual: string }[] = [];
  for (let i = 0; i < allIds.length; i += 200) {
    const { data } = await supabaseOps
      .from('concrem_pedidos_status')
      .select('pedido_id, status_atual')
      .in('pedido_id', allIds.slice(i, i + 200));
    if (data) currentRows.push(...(data as { pedido_id: string; status_atual: string }[]));
  }
  const currentMap = new Map(currentRows.map(r => [r.pedido_id, r.status_atual]));

  // 4. Filtra apenas os que precisam mudar e não estão em status finais
  const toUpdate = allIds.filter(id => {
    const cur = currentMap.get(id) ?? '';
    if (STATUS_JA_ENTREGUES_PROG.has(cur)) return false;
    const target = pedidoTargetMap.get(id)!;
    return cur !== target;
  });

  if (!toUpdate.length) return { updated: 0, errors: 0 };

  const now = new Date().toISOString();
  let updated = 0;
  let errors = 0;

  // 5. Agrupa por status alvo e faz update em batch
  const byTarget = new Map<string, string[]>();
  for (const id of toUpdate) {
    const t = pedidoTargetMap.get(id)!;
    if (!byTarget.has(t)) byTarget.set(t, []);
    byTarget.get(t)!.push(id);
  }

  for (const [targetStatus, ids] of byTarget) {
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      const { error } = await supabaseOps
        .from('concrem_pedidos_status')
        .update({ status_atual: targetStatus, atualizado_em: now, atualizado_por: 'sync_carregamento' })
        .in('pedido_id', batch);
      if (error) { console.error('[syncStatus] update:', error.message); errors++; }
      else updated += batch.length;
    }
  }

  return { updated, errors };
}

type LoadsMaps = {
  byMonth: Map<string, Set<string>>;          // month → Set<orderId>
  pedidoToLoad: Map<string, string>;          // orderId → loadId (ex: "EMB-179")
  pedidoToShipStatus: Map<string, string>;    // orderId → shipment_status do carregamento
};

async function fetchLoadsByMonth(): Promise<LoadsMaps> {
  const empty: LoadsMaps = { byMonth: new Map(), pedidoToLoad: new Map(), pedidoToShipStatus: new Map() };
  if (!supabaseOps) return empty;
  const { data, error } = await supabaseOps
    .from('concrem_programacoes_embarque')
    .select('id, planned_date, pedidos, shipment_status')
    .not('pedidos', 'is', null);
  if (error || !data) return empty;
  const byMonth = new Map<string, Set<string>>();
  const pedidoToLoad = new Map<string, string>();
  const pedidoToShipStatus = new Map<string, string>();
  for (const row of data as { id: string; planned_date: string | null; pedidos: string[] | null; shipment_status: string | null }[]) {
    if (!row.pedidos?.length) continue;
    if (row.planned_date) {
      const month = row.planned_date.slice(0, 7);
      if (!byMonth.has(month)) byMonth.set(month, new Set());
      for (const id of row.pedidos) byMonth.get(month)!.add(String(id));
    }
    for (const id of row.pedidos) {
      const sid = String(id);
      if (!pedidoToLoad.has(sid)) pedidoToLoad.set(sid, String(row.id));
      if (!pedidoToShipStatus.has(sid) && row.shipment_status) pedidoToShipStatus.set(sid, row.shipment_status);
    }
  }
  return { byMonth, pedidoToLoad, pedidoToShipStatus };
}

const VALID_NOTA_CONF = [307, 309, 665, 613];

/** Resolve ped_compra_cliente values to internal numero_pedido via ERP.
 *  Only considers orders with id_nota_conf in VALID_NOTA_CONF.
 *  Returns Map<originalPoValue, numeroPedido> — only for values that matched. */
async function resolvePoToInternalIds(rawIds: string[]): Promise<Map<string, string>> {
  if (!supabasePedidos || !rawIds.length) return new Map();
  const poMap = new Map<string, string>();
  for (const batch of chunk(rawIds, 200)) {
    const { data } = await supabasePedidos
      .from(ERP_TABLE)
      .select('numero_pedido, ped_compra_cliente, id_nota_conf')
      .in('ped_compra_cliente', batch)
      .in('id_nota_conf', VALID_NOTA_CONF);
    for (const row of (data ?? []) as { numero_pedido: string; ped_compra_cliente: string | null; id_nota_conf: number | null }[]) {
      if (row.ped_compra_cliente) poMap.set(row.ped_compra_cliente, String(row.numero_pedido));
    }
  }
  return poMap;
}

async function fetchErpMap(pedidoIds: string[]): Promise<Map<string, ErpRow>> {
  if (!supabasePedidos || !pedidoIds.length) return new Map();
  const unique = Array.from(new Set(pedidoIds));
  const responses = await Promise.all(
    chunk(unique, 200).map((batch) =>
      supabasePedidos!.from(ERP_TABLE).select(ERP_COLS).in('numero_pedido', batch),
    ),
  );
  const map = new Map<string, ErpRow>();
  for (const res of responses) {
    if (res.error) { console.error('[Programacao] erp batch:', res.error.message); continue; }
    for (const row of (res.data ?? []) as ErpRow[]) {
      map.set(String(row.numero_pedido), row);
    }
  }
  return map;
}

// ─── MiniCal — custom calendar picker (avoids Chrome native date-nav auto-set) ─

type MiniCalProps = {
  selectedIso: string;
  displayMonth: string;
  onChangeMonth: (m: string) => void;
  onSelect: (iso: string) => void;
  onClose: () => void;
};

const MiniCal = React.memo<MiniCalProps>(({ selectedIso, displayMonth, onChangeMonth, onSelect, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [y, m] = displayMonth.split('-').map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const firstDow = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();

  const goPrev = () => { const d = new Date(y, m - 2, 1); onChangeMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  const goNext = () => { const d = new Date(y, m, 1); onChangeMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute z-30 right-0 top-8 bg-card border border-border rounded-xl shadow-2xl p-3 w-56 select-none">
      <div className="flex items-center justify-between mb-2">
        <button onClick={goPrev} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">‹</button>
        <span className="text-xs font-semibold capitalize">{monthLabel}</span>
        <button onClick={goNext} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">›</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {['D','S','T','Q','Q','S','S'].map((d, i) => (
          <div key={i} className="text-[10px] font-medium text-muted-foreground py-0.5">{d}</div>
        ))}
        {Array.from({ length: firstDow }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = iso === selectedIso;
          return (
            <button key={day} onClick={() => { onSelect(iso); onClose(); }}
              className={cn('text-[11px] py-1 rounded transition-colors hover:bg-primary/20',
                isSelected ? 'bg-primary text-primary-foreground hover:bg-primary/90 font-bold' : '')}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
});
MiniCal.displayName = 'MiniCal';

// ─── PedidoRow — memoized so only the affected row re-renders ─────────────────

type PedidoRowProps = {
  pedido: Pedido;
  isEditing: boolean;
  editValue: string;
  saving: boolean;
  canEdit: boolean;
  isSelected: boolean;
  onStartEdit: (id: string, current: string | null) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onEditValueChange: (v: string) => void;
  onToggleSelect: (id: string) => void;
};

const PedidoRow = React.memo<PedidoRowProps>(({
  pedido: p, isEditing, editValue, saving, canEdit, isSelected,
  onStartEdit, onSaveEdit, onCancelEdit, onEditValueChange, onToggleSelect,
}) => (
  <tr className={cn(
    'border-b border-border/40 hover:bg-muted/20 transition-colors text-sm',
    isSelected && 'bg-primary/5 hover:bg-primary/10',
  )}>
    <td className="py-2 px-2 w-8 text-center">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggleSelect(p.pedidoId)}
        onClick={(e) => e.stopPropagation()}
        className="cursor-pointer"
      />
    </td>
    <td className="py-2 px-3 font-mono text-xs">{p.numeroPedido}</td>
    <td className="py-2 px-3 max-w-[200px] truncate" title={p.clienteNome}>{p.clienteNome}</td>
    <td className="py-2 px-3 text-right tabular-nums">{p.valor > 0 ? p.valorFormatado : '—'}</td>
    <td className="py-2 px-3">
      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap', p.statusBadgeClass)}>
        {p.statusLabel}
      </span>
    </td>
    <td className="py-2 px-3 text-muted-foreground tabular-nums">{p.dataEmissaoFormatada}</td>
    {canEdit && (
      <td className="py-2 px-3">
        {isEditing ? (
          <div className="flex items-center gap-1">
            <input
              type="month"
              value={editValue}
              onChange={(e) => onEditValueChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSaveEdit(p.pedidoId); if (e.key === 'Escape') onCancelEdit(); }}
              className="border border-border rounded px-2 py-0.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <button
              onClick={() => onSaveEdit(p.pedidoId)}
              disabled={saving}
              className="text-green-600 hover:text-green-700 disabled:opacity-40"
              title="Confirmar (Enter)"
            >
              <Check className="h-4 w-4" />
            </button>
            <button onClick={onCancelEdit} disabled={saving} className="text-muted-foreground hover:text-foreground disabled:opacity-40" title="Cancelar (Esc)">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => onStartEdit(p.pedidoId, p.mesProgramacao)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil className="h-3 w-3" />
            {p.mesProgramacao ? 'Alterar' : 'Programar'}
          </button>
        )}
      </td>
    )}
  </tr>
));
PedidoRow.displayName = 'PedidoRow';

// ─── Indeterminate checkbox helper ────────────────────────────────────────────

const IndeterminateCheckbox: React.FC<{
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}> = ({ checked, indeterminate, onChange }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="cursor-pointer"
    />
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const Programacao: React.FC = () => {
  const { user } = useApp();
  const { showToast } = useToast();

  // ── Data ─────────────────────────────────────────────────────────────────────
  const [opsRows, setOpsRows] = useState<OpsRow[]>([]);
  const [erpMap, setErpMap] = useState<Map<string, ErpRow>>(new Map());
  const [loadsByMonth, setLoadsByMonth] = useState<Map<string, Set<string>>>(new Map());
  const [pedidoToLoad, setPedidoToLoad] = useState<Map<string, string>>(new Map());
  const [pedidoToShipStatus, setPedidoToShipStatus] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingStatus, setSyncingStatus] = useState(false);

  // ── View ─────────────────────────────────────────────────────────────────────
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [filterText, setFilterText] = useState('');
  const [filterTextDebounced, setFilterTextDebounced] = useState('');
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterClientes, setFilterClientes] = useState<string[]>([]);
  const [filterGrupos, setFilterGrupos] = useState<string[]>([]);
  const [filterConfs, setFilterConfs] = useState<string[]>([]);
  const [filterCarregamentoStatus, setFilterCarregamentoStatus] = useState<string[]>([]);
  const [filterMeses, setFilterMeses] = useState<string[]>([]);
  const [showSemProg, setShowSemProg] = useState(false);

  // ── Inline edit ──────────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  // Ref so saveEdit callback stays stable even as editValue changes
  const editValueRef = useRef(editValue);
  useEffect(() => { editValueRef.current = editValue; }, [editValue]);

  // ── Import by list ───────────────────────────────────────────────────────────
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMes, setImportMes] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ updated: number; created: number } | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    okMes: string[];
    wrongMes: Array<{ id: string; mes: string | null }>;
    notFound: string[];
    duplicates: string[];
    poResolved: Array<{ po: string; id: string }>;
  } | null>(null);

  // ── Bulk select & action ─────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMes, setBulkMes] = useState('');
  const [bulkAction, setBulkAction] = useState<'set' | 'clear'>('set');
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  // ── Print ─────────────────────────────────────────────────────────────────────
  const [printMes, setPrintMes] = useState<string | null>(null);
  const [printOverrides, setPrintOverrides] = useState<Map<string, string>>(new Map());
  const [printScrolled, setPrintScrolled] = useState(false);
  const printScrollRef = useRef<HTMLDivElement>(null);
  const [calendarForId, setCalendarForId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<string>('');

  // ── ERP quick-search (orders not yet in view) ────────────────────────────────
  const [erpQuickSearch, setErpQuickSearch] = useState<ErpRow[]>([]);
  const [erpQuickLoading, setErpQuickLoading] = useState(false);
  const [showErpDropdown, setShowErpDropdown] = useState(false);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  // ── Quick-add from ERP search ─────────────────────────────────────────────────
  const [quickAddOrder, setQuickAddOrder] = useState<ErpRow | null>(null);
  const [quickAddMes, setQuickAddMes] = useState('');
  const [quickAddSaving, setQuickAddSaving] = useState(false);

  // ── Debounce text filter ─────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setFilterTextDebounced(filterText), 300);
    return () => clearTimeout(t);
  }, [filterText]);

  // ERP live search: find orders matching the query that aren't already in opsRows
  useEffect(() => {
    const term = filterTextDebounced.trim();
    if (!term || !supabasePedidos || /[,;\n\r]/.test(term)) {
      setErpQuickSearch([]);
      setShowErpDropdown(false);
      return;
    }
    setErpQuickLoading(true);
    const alreadyIds = new Set(opsRows.map(r => r.pedido_id));
    supabasePedidos
      .from(ERP_TABLE)
      .select(ERP_COLS)
      .or(`numero_pedido.ilike.%${term}%,cliente_nome.ilike.%${term}%,ped_compra_cliente.ilike.%${term}%`)
      .in('id_nota_conf', VALID_NOTA_CONF)
      .limit(10)
      .then(({ data }) => {
        const results = ((data ?? []) as ErpRow[]).filter(r => !alreadyIds.has(String(r.numero_pedido)));
        setErpQuickSearch(results);
        setShowErpDropdown(results.length > 0);
        setErpQuickLoading(false);
      });
  }, [filterTextDebounced, opsRows]);

  // Close ERP dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowErpDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Load ─────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ops, { byMonth, pedidoToLoad: p2l, pedidoToShipStatus: p2ss }] = await Promise.all([fetchOpsRows(), fetchLoadsByMonth()]);
      const erp = await fetchErpMap(ops.map((r) => r.pedido_id));
      setOpsRows(ops);
      setErpMap(erp);
      setLoadsByMonth(byMonth);
      setPedidoToLoad(p2l);
      setPedidoToShipStatus(p2ss);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Merge OPS + ERP with pre-formatting ──────────────────────────────────────
  const allPedidos = useMemo<Pedido[]>(() =>
    opsRows.map((ops) => {
      const erp = erpMap.get(String(ops.pedido_id));
      const valor = resolveValor(erp);
      const statusAtual = ops.status_atual;
      return {
        pedidoId: ops.pedido_id,
        numeroPedido: ops.numero_pedido || ops.pedido_id,
        statusAtual,
        statusLabel: getPedidoStatusLabel(statusAtual as PedidoStatusValue),
        statusBadgeClass: getPedidoStatusBadgeClass(statusAtual as PedidoStatusValue),
        mesProgramacao: ops.mes_programacao,
        atualizadoEm: ops.atualizado_em,
        clienteNome: erp?.cliente_nome ?? '—',
        valor,
        valorFormatado: valor > 0 ? BRL_FMT.format(valor) : '—',
        dataEmissao: erp?.data_emissao ?? null,
        dataEmissaoFormatada: fmtDateSafe(erp?.data_emissao),
        representante: erp?.representante ?? null,
        previsaoEmbarque: erp?.previsao_embarque ?? null,
        totalQtd: erp?.total_qtd ?? null,
        grupoCliente: erp?.grupo_cliente ?? null,
        idNotaConf: erp?.id_nota_conf ?? null,
        pedCompraCliente: erp?.ped_compra_cliente ?? null,
        cidadeCliente: erp?.cliente_cidade ?? null,
        ufCliente: erp?.cliente_uf ?? null,
        dataEmbarqueProgramacao: ops.data_embarque_programacao ?? null,
      };
    }),
  [opsRows, erpMap]);

  // ── Filter options ────────────────────────────────────────────────────────────
  const availableYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    for (const p of allPedidos) {
      if (p.mesProgramacao) {
        const y = parseInt(p.mesProgramacao.split('-')[0], 10);
        if (!isNaN(y)) years.add(y);
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [allPedidos]);

  const availableStatuses = useMemo(() => {
    const s = new Set<string>();
    for (const p of allPedidos) s.add(p.statusAtual);
    return Array.from(s).sort((a, b) =>
      getPedidoStatusLabel(a as PedidoStatusValue).localeCompare(
        getPedidoStatusLabel(b as PedidoStatusValue), 'pt-BR'));
  }, [allPedidos]);

  const availableClientes = useMemo(() => {
    const s = new Set<string>();
    for (const p of allPedidos) if (p.clienteNome && p.clienteNome !== '—') s.add(p.clienteNome);
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allPedidos]);

  const availableGrupos = useMemo(() => {
    const s = new Set<string>();
    for (const p of allPedidos) if (p.grupoCliente) s.add(p.grupoCliente);
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allPedidos]);

  const availableConfs = useMemo(() => {
    const s = new Set<string>();
    for (const p of allPedidos) if (p.idNotaConf != null) s.add(String(p.idNotaConf));
    return Array.from(s).sort((a, b) => Number(a) - Number(b));
  }, [allPedidos]);

  const availableMonths = useMemo(() => {
    const ms = new Set<string>();
    for (const p of allPedidos) {
      if (p.mesProgramacao) {
        const y = parseInt(p.mesProgramacao.split('-')[0], 10);
        if (y === selectedYear) ms.add(p.mesProgramacao);
      }
    }
    return Array.from(ms).sort((a, b) => b.localeCompare(a));
  }, [allPedidos, selectedYear]);

  // ── Mapas auxiliares de carregamentos (devem ficar ANTES de filteredPedidos) ──
  // pedidoId → mês do carregamento
  const pedidoToLoadMonth = useMemo(() => {
    const map = new Map<string, string>();
    for (const [month, ids] of loadsByMonth) {
      for (const id of ids) if (!map.has(id)) map.set(id, month);
    }
    return map;
  }, [loadsByMonth]);

  // carregamentoId → Set<pedidoId>
  const loadToPedidos = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const [pedidoId, loadId] of pedidoToLoad) {
      const normalized = loadId.toLowerCase();
      if (!map.has(normalized)) map.set(normalized, new Set());
      map.get(normalized)!.add(pedidoId);
    }
    return map;
  }, [pedidoToLoad]);

  // ── Apply text + status filters ───────────────────────────────────────────────
  const filteredPedidos = useMemo(() => {
    let result = allPedidos;
    if (filterTextDebounced) {
      const terms = filterTextDebounced
        .split(/[,;\n\r]+/)
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);

      const matchesTerm = (t: string, p: Pedido) => {
        if (p.numeroPedido.toLowerCase().includes(t)) return true;
        if (p.clienteNome.toLowerCase().includes(t)) return true;
        if (p.pedCompraCliente && p.pedCompraCliente.toLowerCase().includes(t)) return true;
        for (const [loadId, pedidos] of loadToPedidos) {
          if (loadId.includes(t) && pedidos.has(p.pedidoId)) return true;
        }
        return false;
      };

      if (terms.length > 1) {
        result = result.filter(p => terms.some(t => matchesTerm(t, p)));
      } else {
        const q = terms[0];
        result = result.filter(p => matchesTerm(q, p));
      }
    }
    if (filterStatuses.length > 0) {
      result = result.filter(p => filterStatuses.includes(p.statusAtual));
    }
    if (filterClientes.length > 0) {
      result = result.filter(p =>
        filterClientes.some(c => p.clienteNome.toLowerCase().includes(c.toLowerCase())),
      );
    }
    if (filterGrupos.length > 0) {
      result = result.filter(p => p.grupoCliente && filterGrupos.includes(p.grupoCliente));
    }
    if (filterConfs.length > 0) {
      result = result.filter(p => p.idNotaConf != null && filterConfs.includes(String(p.idNotaConf)));
    }
    if (filterCarregamentoStatus.length > 0) {
      result = result.filter(p => {
        const shipStatus = pedidoToShipStatus.get(p.pedidoId);
        return shipStatus ? filterCarregamentoStatus.includes(shipStatus) : false;
      });
    }
    return result;
  }, [allPedidos, filterTextDebounced, filterStatuses, filterClientes, filterGrupos, filterConfs, filterCarregamentoStatus, loadToPedidos, pedidoToShipStatus]);

  const { groupedMonths, monthOrder } = useMemo(() => {
    const grouped = new Map<string, Pedido[]>();
    for (const p of filteredPedidos) {
      // Mês de referência: mes_programacao definido, ou mês do carregamento para em_carregamento/despachado
      let mes = p.mesProgramacao;
      if (!mes && (p.statusAtual === 'em_carregamento' || p.statusAtual === 'despachado')) {
        mes = pedidoToLoadMonth.get(p.pedidoId) ?? null;
      }
      if (!mes) continue;
      const year = parseInt(mes.split('-')[0], 10);
      if (year !== selectedYear) continue;
      if (filterMeses.length > 0 && !filterMeses.includes(mes)) continue;
      // Pedidos Leroy só contam se estiverem no cronograma de carregamento do mês
      if (p.clienteNome.toUpperCase().includes('LEROY')) {
        const leroySet = loadsByMonth.get(mes);
        if (!leroySet?.has(p.pedidoId)) continue;
      }
      const list = grouped.get(mes) ?? [];
      list.push(p);
      grouped.set(mes, list);
    }
    const order = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));
    return { groupedMonths: grouped, monthOrder: order };
  }, [filteredPedidos, selectedYear, filterMeses, loadsByMonth, pedidoToLoadMonth]);

  const semProgramacao = useMemo(() =>
    filteredPedidos.filter((p) => !p.mesProgramacao),
  [filteredPedidos]);

  const stats = useMemo(() => {
    const yearPedidos = monthOrder.flatMap((m) => groupedMonths.get(m) ?? []);
    return {
      totalPedidos: yearPedidos.length,
      totalValor: yearPedidos.reduce((s, p) => s + p.valor, 0),
      mesesComProgramacao: monthOrder.length,
    };
  }, [groupedMonths, monthOrder]);

  const hasActiveFilters = !!(filterTextDebounced || filterStatuses.length || filterClientes.length || filterGrupos.length || filterConfs.length || filterCarregamentoStatus.length || filterMeses.length);

  // Auto-expand all months when a filter becomes active
  useEffect(() => {
    if (hasActiveFilters && monthOrder.length > 0) {
      setExpandedMonths(new Set(monthOrder));
    }
  }, [hasActiveFilters, monthOrder]);

  // ── Permission ────────────────────────────────────────────────────────────────
  const canEdit =
    user?.role === 'ADMIN' ||
    canFazer(user?.funcionalidades, 'programacao_comercial.editar_mes');

  const canSincronizar =
    user?.role === 'ADMIN' ||
    canFazer(user?.funcionalidades, 'programacao_comercial.sincronizar');

  // ── Accordion ────────────────────────────────────────────────────────────────
  const toggleMonth = useCallback((mes: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(mes)) next.delete(mes); else next.add(mes);
      return next;
    });
  }, []);

  // ── Inline edit callbacks (all stable) ───────────────────────────────────────
  const startEdit = useCallback((id: string, current: string | null) => {
    setEditingId(id);
    setEditValue(current ?? '');
  }, []);

  const cancelEdit = useCallback(() => { setEditingId(null); setEditValue(''); }, []);

  const handleEditValueChange = useCallback((v: string) => setEditValue(v), []);

  // Uses ref so this callback is stable regardless of editValue changes
  const saveEdit = useCallback(async (pedidoId: string) => {
    if (!supabaseOps) return;
    const trimmed = editValueRef.current.trim();
    const newVal = trimmed || null;
    if (trimmed && !YYYYMM_RE.test(trimmed)) {
      showToast('Formato inválido. Use o seletor de mês.', 'error');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabaseOps
        .from('concrem_pedidos_status')
        .update({ mes_programacao: newVal })
        .eq('pedido_id', pedidoId);
      if (error) {
        console.error('[Programacao] saveEdit:', error.message);
        showToast('Erro ao salvar. Tente novamente.', 'error');
        return;
      }
      setOpsRows((prev) =>
        prev.map((r) => r.pedido_id === pedidoId ? { ...r, mes_programacao: newVal } : r),
      );
      showToast(newVal ? 'Mês de programação atualizado.' : 'Mês removido.');
    } finally {
      setSaving(false);
      setEditingId(null);
      setEditValue('');
    }
  }, [showToast]);

  // ── Selection callbacks (all stable) ─────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((ids: string[]) => {
    setSelectedIds(prev => {
      const allSelected = ids.length > 0 && ids.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // ── Bulk update ───────────────────────────────────────────────────────────────
  const applyBulkMes = async () => {
    if (!supabaseOps || !selectedIds.size) return;
    if (bulkAction === 'set' && !YYYYMM_RE.test(bulkMes)) {
      showToast('Formato de mês inválido.', 'error');
      return;
    }
    const ids = Array.from(selectedIds);
    const newVal = bulkAction === 'set' ? bulkMes : null;
    setBulkSaving(true);
    try {
      const batches = chunk(ids, 200);
      const results = await Promise.all(
        batches.map((batch) =>
          supabaseOps!
            .from('concrem_pedidos_status')
            .update({ mes_programacao: newVal })
            .in('pedido_id', batch),
        ),
      );
      const failed = results.filter((r) => r.error);
      if (failed.length > 0) {
        console.error('[Programacao] applyBulkMes errors:', failed.map((r) => r.error?.message));
        setShowBulkConfirm(false);
        showToast('Erro ao atualizar pedidos. Seleção mantida.', 'error');
        return;
      }
      setOpsRows(prev => prev.map(r =>
        ids.includes(r.pedido_id) ? { ...r, mes_programacao: newVal } : r,
      ));
      setSelectedIds(new Set());
      setBulkMes('');
      setShowBulkConfirm(false);
      const msg = bulkAction === 'set'
        ? `${ids.length} pedido(s) programados para ${fmtMesLabel(bulkMes)}.`
        : `Programação removida de ${ids.length} pedido(s).`;
      showToast(msg);
    } finally {
      setBulkSaving(false);
    }
  };

  // ── Filter helpers ────────────────────────────────────────────────────────────
  const clearFilters = () => {
    setFilterText('');
    setFilterStatuses([]);
    setFilterClientes([]);
    setFilterGrupos([]);
    setFilterConfs([]);
    setFilterCarregamentoStatus([]);
    setFilterMeses([]);
    setShowSemProg(false);
  };

  // ── Quick-add order from ERP search ──────────────────────────────────────────
  const quickAddFromErp = async () => {
    if (!quickAddOrder || !supabaseOps || !YYYYMM_RE.test(quickAddMes)) return;
    const id = String(quickAddOrder.numero_pedido);
    setQuickAddSaving(true);
    try {
      const now = new Date().toISOString();
      const username = user?.username || null;
      const { data: existing } = await supabaseOps
        .from('concrem_pedidos_status')
        .select('pedido_id')
        .eq('pedido_id', id)
        .maybeSingle();
      if (existing) {
        await supabaseOps
          .from('concrem_pedidos_status')
          .update({ mes_programacao: quickAddMes, atualizado_em: now, atualizado_por: username })
          .eq('pedido_id', id);
      } else {
        await supabaseOps
          .from('concrem_pedidos_status')
          .insert({
            pedido_id: id,
            numero_pedido: id,
            status_atual: 'liberado_producao',
            mes_programacao: quickAddMes,
            atualizado_em: now,
            atualizado_por: username,
          });
      }
      showToast(`Pedido ${id} adicionado à programação de ${fmtMesLabel(quickAddMes)}.`);
      setQuickAddOrder(null);
      setQuickAddMes('');
      setShowErpDropdown(false);
      await load();
    } catch (e: any) {
      console.error('[quickAdd]', e);
      showToast('Erro ao adicionar pedido.', 'error');
    } finally {
      setQuickAddSaving(false);
    }
  };

  // ── Print relatório mensal ────────────────────────────────────────────────────
  const savePrintDate = useCallback(async (pedidoId: string, iso: string | null) => {
    setPrintOverrides(prev => {
      const next = new Map(prev);
      if (iso) next.set(pedidoId, iso);
      else next.delete(pedidoId);
      return next;
    });
    if (!supabaseOps) return;
    await supabaseOps
      .from('concrem_pedidos_status')
      .update({ data_embarque_programacao: iso })
      .eq('pedido_id', pedidoId);
    setOpsRows(prev => prev.map(r =>
      r.pedido_id === pedidoId ? { ...r, data_embarque_programacao: iso } : r,
    ));
  }, []);

  const openPrintModal = (mes: string) => {
    const pedidos = groupedMonths.get(mes) ?? [];
    const initialOverrides = new Map<string, string>();
    for (const p of pedidos) {
      if (p.dataEmbarqueProgramacao) initialOverrides.set(p.pedidoId, p.dataEmbarqueProgramacao.slice(0, 10));
    }
    setPrintOverrides(initialOverrides);
    setPrintMes(mes);
  };

  const generatePrintPdf = () => {
    if (!printMes) return;
    const pedidos = (groupedMonths.get(printMes) ?? []).slice().sort((a, b) => {
      const da = printOverrides.get(a.pedidoId) ?? a.dataEmbarqueProgramacao ?? '';
      const db = printOverrides.get(b.pedidoId) ?? b.dataEmbarqueProgramacao ?? '';
      if (da && db) return da.localeCompare(db);
      if (da) return -1;
      if (db) return 1;
      return a.clienteNome.localeCompare(b.clienteNome, 'pt-BR');
    });
    const mesLabel = fmtMesLabel(printMes);
    const now = new Date();
    const emissao = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    const fmtCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    const fmtD = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };

    let totalValor = 0;
    const rows = pedidos.map(p => {
      totalValor += p.valor;
      const previsao = printOverrides.get(p.pedidoId) ?? p.dataEmbarqueProgramacao;
      return `<tr>
        <td style="font-weight:700">${p.numeroPedido}</td>
        <td>${p.clienteNome}</td>
        <td style="font-size:10px;color:#555">${p.cidadeCliente ?? '—'}</td>
        <td style="font-size:10px;text-align:center">${p.ufCliente ?? '—'}</td>
        <td style="font-size:10px;color:#555">${p.representante ?? '—'}</td>
        <td style="text-align:center">${p.totalQtd != null ? p.totalQtd : '—'}</td>
        <td style="text-align:right">${fmtCurrency(p.valor)}</td>
        <td style="text-align:center">${previsao ? fmtD(previsao) : '<span style="color:#dc2626;font-weight:600">A DEFINIR</span>'}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title></title>
<style>
  @page { size: A4 landscape; margin: 10mm 12mm; }
  @page { @top-left { content: ""; } @top-center { content: ""; } @top-right { content: ""; } @bottom-left { content: ""; } @bottom-center { content: ""; } @bottom-right { content: ""; } }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Arial,sans-serif; color:#1a1a1a; font-size:11px; }
  .page-header { display:flex; align-items:center; justify-content:space-between; padding-bottom:10px; border-bottom:3px solid #0a2315; margin-bottom:8px; }
  .page-header img { height:44px; }
  .ph-title { text-align:right; }
  .ph-title h1 { font-size:15px; color:#0a2315; font-weight:800; text-transform:uppercase; letter-spacing:1px; }
  .ph-title p { font-size:9px; color:#888; margin-top:2px; }
  table { width:100%; border-collapse:collapse; }
  thead th { background:#0a2315; color:#fff; padding:6px 10px; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; font-weight:700; white-space:nowrap; }
  thead { display:table-row-group; }
  tbody td { padding:5px 10px; border-bottom:1px solid #e0e0e0; font-size:11px; }
  tbody tr:nth-child(even) { background:#f5f7f5; }
  .total-row td { padding:7px 10px; font-weight:800; font-size:11px; border-top:2px solid #0a2315; background:#f0f2f0; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
<script>window.onload = () => { window.focus(); window.print(); };</script>
</head><body>
  <div class="page-header">
    <img src="${logoProgramacao}" alt="Concrem" />
    <div class="ph-title">
      <h1>Programação de Pedidos — ${mesLabel}</h1>
      <p>Emissão: ${emissao} &nbsp;·&nbsp; ${pedidos.length} pedido(s)</p>
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
        <td style="text-align:right;white-space:nowrap">${fmtCurrency(totalValor)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>
</body></html>`;

    const w = window.open('', '_blank', 'width=1200,height=800');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    setPrintMes(null);
  };

  // ── Export PDF dos pedidos selecionados (sem programação) ────────────────────
  const generateSelecaoPdf = () => {
    const pedidos = filteredPedidos
      .filter(p => selectedIds.has(p.pedidoId))
      .slice()
      .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, 'pt-BR'));

    if (!pedidos.length) return;

    const now = new Date();
    const emissao = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    const fmtCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    let totalValor = 0;
    let totalQtd = 0;
    const rows = pedidos.map(p => {
      totalValor += p.valor;
      totalQtd += p.totalQtd ?? 0;
      return `<tr>
        <td style="font-weight:700">${p.numeroPedido}</td>
        <td>${p.clienteNome}</td>
        <td style="font-size:10px;color:#555">${p.representante ?? '—'}</td>
        <td style="text-align:center;font-size:10px">${p.statusLabel}</td>
        <td style="text-align:center">${p.totalQtd != null ? p.totalQtd : '—'}</td>
        <td style="text-align:right">${fmtCurrency(p.valor)}</td>
        <td style="text-align:center">${p.dataEmissaoFormatada}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title></title>
<style>
  @page { size: A4 landscape; margin: 10mm 12mm; }
  @page { @top-left { content: ""; } @top-center { content: ""; } @top-right { content: ""; } @bottom-left { content: ""; } @bottom-center { content: ""; } @bottom-right { content: ""; } }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Arial,sans-serif; color:#1a1a1a; font-size:11px; }
  .page-header { display:flex; align-items:center; justify-content:space-between; padding-bottom:10px; border-bottom:3px solid #0a2315; margin-bottom:8px; }
  .page-header img { height:44px; }
  .ph-title { text-align:right; }
  .ph-title h1 { font-size:15px; color:#0a2315; font-weight:800; text-transform:uppercase; letter-spacing:1px; }
  .ph-title p { font-size:9px; color:#888; margin-top:2px; }
  table { width:100%; border-collapse:collapse; }
  thead th { background:#0a2315; color:#fff; padding:6px 10px; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; font-weight:700; white-space:nowrap; }
  thead { display:table-row-group; }
  tbody td { padding:5px 10px; border-bottom:1px solid #e0e0e0; font-size:11px; }
  tbody tr:nth-child(even) { background:#f5f7f5; }
  .total-row td { padding:7px 10px; font-weight:800; font-size:11px; border-top:2px solid #0a2315; background:#f0f2f0; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
<script>window.onload = () => { window.focus(); window.print(); };</script>
</head><body>
  <div class="page-header">
    <img src="${logoProgramacao}" alt="Concrem" />
    <div class="ph-title">
      <h1>Pedidos Sem Programação</h1>
      <p>Emissão: ${emissao} &nbsp;·&nbsp; ${pedidos.length} pedido(s) selecionado(s)</p>
    </div>
  </div>
  <table>
    <thead><tr>
      <th style="text-align:left">Nº Pedido</th>
      <th style="text-align:left">Cliente</th>
      <th style="text-align:left">Representante</th>
      <th style="text-align:center">Status</th>
      <th style="text-align:center">Qtd Kits</th>
      <th style="text-align:right">Valor</th>
      <th style="text-align:center">Emissão</th>
    </tr></thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="4" style="text-align:right">TOTAL</td>
        <td style="text-align:center">${totalQtd ? parseFloat(totalQtd.toFixed(2)).toLocaleString('pt-BR') : '—'}</td>
        <td style="text-align:right;border:2px solid #0a2315;background:#e8ede8">${fmtCurrency(totalValor)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>
</body></html>`;

    const w = window.open('', '_blank', 'width=1200,height=800');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  // ── Import by list ───────────────────────────────────────────────────────────

  const parseImportIds = () => {
    const raw = importText.split(/[\s,;\n\r]+/).map(t => t.trim()).filter(Boolean);
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const id of raw) {
      if (seen.has(id)) duplicates.add(id);
      seen.add(id);
    }
    return { unique: Array.from(seen), duplicates: Array.from(duplicates) };
  };

  const verifyImport = async () => {
    if (!supabaseOps || !importMes || !YYYYMM_RE.test(importMes)) return;
    const { unique: rawIds, duplicates } = parseImportIds();
    if (!rawIds.length) return;

    setVerifyLoading(true);
    setVerifyResult(null);
    setImportResult(null);
    try {
      // Resolve ped_compra_cliente → numero_pedido
      const poMap = await resolvePoToInternalIds(rawIds);
      const poResolved = Array.from(poMap.entries()).map(([po, id]) => ({ po, id }));
      const ids = Array.from(new Set(rawIds.map(id => poMap.get(id) ?? id)));

      const results = await Promise.all(
        chunk(ids, 200).map(batch =>
          supabaseOps!
            .from('concrem_pedidos_status')
            .select('pedido_id, mes_programacao')
            .in('pedido_id', batch),
        ),
      );
      const dbMap = new Map<string, string | null>(
        results.flatMap(r => (r.data ?? []).map((row: any) => [String(row.pedido_id), row.mes_programacao as string | null])),
      );

      const okMes: string[] = [];
      const wrongMes: Array<{ id: string; mes: string | null }> = [];
      const notFound: string[] = [];

      for (const id of ids) {
        if (!dbMap.has(id)) {
          notFound.push(id);
        } else if (dbMap.get(id) === importMes) {
          okMes.push(id);
        } else {
          wrongMes.push({ id, mes: dbMap.get(id) ?? null });
        }
      }

      setVerifyResult({ okMes, wrongMes, notFound, duplicates, poResolved });
    } catch (e: any) {
      console.error('[Programacao] verifyImport:', e);
      showToast('Erro ao verificar pedidos.', 'error');
    } finally {
      setVerifyLoading(false);
    }
  };

  const processImport = async () => {
    if (!supabaseOps || !importMes || !YYYYMM_RE.test(importMes)) return;

    const { unique: rawIds } = parseImportIds();
    if (!rawIds.length) return;

    // Resolve ped_compra_cliente → numero_pedido
    const poMap = await resolvePoToInternalIds(rawIds);
    const ids = Array.from(new Set(rawIds.map(id => poMap.get(id) ?? id)));

    setImportLoading(true);
    setImportResult(null);
    setVerifyResult(null);
    try {
      // Find which IDs already exist in OPS
      const existingResults = await Promise.all(
        chunk(ids, 200).map(batch =>
          supabaseOps!
            .from('concrem_pedidos_status')
            .select('pedido_id')
            .in('pedido_id', batch),
        ),
      );
      const existingIds = new Set(
        existingResults.flatMap(r => (r.data ?? []).map((row: any) => String(row.pedido_id))),
      );

      const toUpdate = ids.filter(id => existingIds.has(id));
      const toCreate = ids.filter(id => !existingIds.has(id));
      const now = new Date().toISOString();
      const username = user?.username || null;

      // Update mes_programacao for existing records
      if (toUpdate.length) {
        await Promise.all(
          chunk(toUpdate, 200).map(batch =>
            supabaseOps!
              .from('concrem_pedidos_status')
              .update({ mes_programacao: importMes })
              .in('pedido_id', batch),
          ),
        );
      }

      // Upsert missing records as liberado_producao
      if (toCreate.length) {
        await Promise.all(
          chunk(toCreate, 100).map(batch =>
            supabaseOps!
              .from('concrem_pedidos_status')
              .upsert(
                batch.map(id => ({
                  pedido_id: id,
                  numero_pedido: id,
                  status_atual: 'liberado_producao' as const,
                  atualizado_em: now,
                  atualizado_por: username,
                  mes_programacao: importMes,
                })),
                { onConflict: 'pedido_id' },
              ),
          ),
        );
      }

      const result = { updated: toUpdate.length, created: toCreate.length };
      setImportResult(result);
      showToast(`${result.updated} atualizados, ${result.created} criados para ${fmtMesLabel(importMes)}.`);

      // Reload full data so orders that existed in OPS with non-producao status
      // (updated in DB but not in local state) also appear correctly
      await load();
    } catch (e: any) {
      console.error('[Programacao] processImport:', e);
      showToast('Erro ao importar pedidos.', 'error');
    } finally {
      setImportLoading(false);
    }
  };

  // ── Sub-table renderer ────────────────────────────────────────────────────────
  const renderSubTable = (pedidos: Pedido[]) => {
    const ids = pedidos.map(p => p.pedidoId);
    const allSelected = ids.length > 0 && ids.every(id => selectedIds.has(id));
    const someSelected = ids.some(id => selectedIds.has(id));
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 text-xs text-muted-foreground uppercase tracking-wide">
            <th className="w-8 py-2 px-2 text-center">
              <IndeterminateCheckbox
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                onChange={() => toggleSelectAll(ids)}
              />
            </th>
            <th className="text-left py-2 px-3 font-semibold">Pedido</th>
            <th className="text-left py-2 px-3 font-semibold">Cliente</th>
            <th className="text-right py-2 px-3 font-semibold">Valor</th>
            <th className="text-left py-2 px-3 font-semibold">Status</th>
            <th className="text-left py-2 px-3 font-semibold">Emissão</th>
            {canEdit && <th className="text-left py-2 px-3 font-semibold">Mês</th>}
          </tr>
        </thead>
        <tbody>
          {pedidos.map(p => (
            <PedidoRow
              key={p.pedidoId}
              pedido={p}
              isEditing={editingId === p.pedidoId}
              editValue={editValue}
              saving={saving}
              canEdit={canEdit}
              isSelected={selectedIds.has(p.pedidoId)}
              onStartEdit={startEdit}
              onSaveEdit={saveEdit}
              onCancelEdit={cancelEdit}
              onEditValueChange={handleEditValueChange}
              onToggleSelect={toggleSelect}
            />
          ))}
        </tbody>
      </table>
    );
  };

  // ─── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Carregando programação…
      </div>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <CalendarDays className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-display font-semibold">Programação</h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Acompanhe os pedidos liberados por mês de programação.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <label className="text-sm text-muted-foreground hidden sm:inline">Ano:</label>
          <select
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(Number(e.target.value));
              setExpandedMonths(new Set());
              setFilterMeses([]);
            }}
            className="border border-border rounded px-2 py-1 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => { setImportResult(null); setShowImportModal(true); }}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Importar lista de pedidos"
          >
            <Upload className="h-4 w-4" />
            Importar lista
          </button>
          {canSincronizar && <button
            onClick={async () => {
              setSyncingStatus(true);
              try {
                const result = await syncStatusCarregamentos();
                if (result.errors && result.updated === 0) {
                  showToast('Erro ao sincronizar status. Veja o console.', 'error');
                } else {
                  showToast(`Sync Status: ${result.updated} pedido(s) atualizados.${result.errors ? ' (com alguns erros parciais)' : ''}`);
                  await load();
                }
              } catch (e: any) {
                console.error('[syncStatus] exception:', e);
                showToast('Erro inesperado na sincronização de status.', 'error');
              } finally {
                setSyncingStatus(false);
              }
            }}
            disabled={syncingStatus}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Sincronizar status dos pedidos com base nos carregamentos existentes"
          >
            <RefreshCw className={`h-4 w-4 ${syncingStatus ? 'animate-spin' : ''}`} />
            {syncingStatus ? 'Sincronizando…' : 'Sync Status'}
          </button>}
          {canSincronizar && <button
            onClick={async () => {
              setSyncing(true);
              try {
                const result = await syncLeroyExistentes();
                if (result.errors && result.updated === 0) {
                  showToast('Erro durante a sincronização. Veja o console para detalhes.', 'error');
                } else {
                  showToast(`Sync Leroy: ${result.updated} pedido(s) sincronizado(s).${result.errors ? ' (com alguns erros parciais)' : ''}`);
                  await load();
                }
              } catch (e: any) {
                console.error('[syncLeroy] exception:', e);
                showToast('Erro inesperado na sincronização.', 'error');
              } finally {
                setSyncing(false);
              }
            }}
            disabled={syncing}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Sincronizar pedidos Leroy do cronograma com a programação"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando…' : 'Sync Leroy'}
          </button>}
          <button
            onClick={() => void load()}
            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Recarregar dados"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-border bg-card">
        <div ref={searchWrapperRef} className="relative flex-1 min-w-[140px] max-w-full sm:max-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Pedido, cliente… (vários: 100012, 100013)"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            onFocus={() => { if (erpQuickSearch.length > 0) setShowErpDropdown(true); }}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {/* ERP quick-search dropdown */}
          {erpQuickLoading && (
            <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-background border border-border rounded-lg shadow-lg px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Buscando no ERP…
            </div>
          )}
          {showErpDropdown && !erpQuickLoading && erpQuickSearch.length > 0 && (
            <div className="absolute top-full mt-1 left-0 z-50 bg-background border border-border rounded-lg shadow-lg overflow-hidden w-80">
              <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border bg-muted/30 flex items-center justify-between">
                <span>{erpQuickSearch.length} pedido(s) no ERP não programados</span>
                <button onClick={() => setShowErpDropdown(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
              </div>
              {erpQuickSearch.map(r => (
                <div key={r.numero_pedido} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 text-sm border-b border-border/40 last:border-0">
                  <span className="font-mono font-semibold text-xs shrink-0">{r.numero_pedido}</span>
                  <span className="flex-1 truncate text-xs text-muted-foreground">{r.cliente_nome ?? '—'}</span>
                  {canEdit && (
                    <button
                      onClick={() => { setQuickAddOrder(r); setQuickAddMes(''); setShowErpDropdown(false); }}
                      className="shrink-0 text-xs px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 font-medium transition-colors"
                    >
                      + Adicionar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <MultiSelectFilter
          options={availableStatuses.map(s => getPedidoStatusLabel(s as PedidoStatusValue))}
          selected={filterStatuses.map(s => getPedidoStatusLabel(s as PedidoStatusValue))}
          onChange={(labels) =>
            setFilterStatuses(
              labels.map(label => availableStatuses.find(s => getPedidoStatusLabel(s as PedidoStatusValue) === label) ?? label)
            )
          }
          placeholder="Todos os status"
          className="flex-1 sm:flex-none min-w-[140px]"
        />
        <MultiSelectFilter
          options={availableClientes}
          selected={filterClientes}
          onChange={setFilterClientes}
          placeholder="Todos os clientes"
          className="flex-1 sm:flex-none min-w-[160px]"
        />
        <MultiSelectFilter
          options={availableGrupos}
          selected={filterGrupos}
          onChange={setFilterGrupos}
          placeholder="Todos os grupos"
          className="flex-1 sm:flex-none min-w-[140px]"
        />
        <MultiSelectFilter
          options={availableConfs}
          selected={filterConfs}
          onChange={setFilterConfs}
          placeholder="Conf."
          className="flex-none min-w-[90px]"
        />
        <MultiSelectFilter
          options={['Aguardando Despacho', 'Despachado', 'Em Rota', 'Entregue', 'Cancelado']}
          selected={filterCarregamentoStatus}
          onChange={setFilterCarregamentoStatus}
          placeholder="Status carregamento"
          className="flex-1 sm:flex-none min-w-[170px]"
        />
        <MultiSelectFilter
          options={availableMonths.map(fmtMesLabel)}
          selected={filterMeses.map(fmtMesLabel)}
          onChange={(labels) =>
            setFilterMeses(
              labels.map(label => availableMonths.find(m => fmtMesLabel(m) === label) ?? '').filter(Boolean)
            )
          }
          placeholder="Todos os meses"
          className="flex-1 sm:flex-none min-w-[130px]"
        />
        <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none text-muted-foreground whitespace-nowrap">
          <input
            type="checkbox"
            checked={showSemProg}
            onChange={(e) => setShowSemProg(e.target.checked)}
            className="cursor-pointer"
          />
          Sem programação
        </label>
        {(hasActiveFilters || !showSemProg) && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1.5 hover:bg-muted transition-colors"
          >
            <X className="h-3 w-3" />
            Limpar filtros
          </button>
        )}
        {hasActiveFilters && (
          <span className="text-xs text-muted-foreground">
            {filteredPedidos.length} resultado(s)
          </span>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: `Pedidos programados em ${selectedYear}`, value: stats.totalPedidos.toString() },
          { label: `Valor total em ${selectedYear}`,         value: BRL_FMT.format(stats.totalValor) },
          { label: 'Meses com programação',                  value: stats.mesesComProgramacao.toString() },
          { label: 'Sem programação',                        value: semProgramacao.length.toString() },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1 leading-snug">{label}</p>
            <p className="text-xl font-semibold font-display tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-lg border border-primary/40 bg-primary/5">
          <span className="text-sm font-semibold text-foreground">
            {selectedIds.size} pedido(s) selecionado(s)
          </span>
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Novo mês:</span>
            <input
              type="month"
              value={bulkMes}
              onChange={(e) => setBulkMes(e.target.value)}
              className="border border-border rounded px-2 py-1 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              className={btnPrimary}
              disabled={!bulkMes || !YYYYMM_RE.test(bulkMes)}
              onClick={() => { setBulkAction('set'); setShowBulkConfirm(true); }}
            >
              Aplicar mês
            </button>
          </div>
          <button
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
            onClick={() => { setBulkAction('clear'); setShowBulkConfirm(true); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remover programação
          </button>
          <button
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
            onClick={generateSelecaoPdf}
          >
            <FileDown className="h-3.5 w-3.5" />
            Exportar PDF
          </button>
          <button
            onClick={clearSelection}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1.5 hover:bg-muted transition-colors ml-auto"
          >
            <X className="h-3 w-3" />
            Limpar seleção
          </button>
        </div>
      )}

      {/* Monthly Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <h2 className="text-sm font-semibold font-display">Programação Mensal — {selectedYear}</h2>
          <span className="text-xs text-muted-foreground">{stats.totalPedidos} pedidos</span>
        </div>

        {monthOrder.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {hasActiveFilters
              ? 'Nenhum pedido encontrado para os filtros aplicados.'
              : `Nenhum pedido programado para ${selectedYear}.`}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="w-10 px-3 py-2.5" />
                <th className="text-left px-4 py-2.5 font-semibold">Mês / Ano</th>
                <th className="text-right px-4 py-2.5 font-semibold">Pedidos</th>
                <th className="text-right px-4 py-2.5 font-semibold">Valor Total</th>
              </tr>
            </thead>
            <tbody>
              {monthOrder.map((mes) => {
                const pedidos = groupedMonths.get(mes) ?? [];
                const totalValor = pedidos.reduce((s, p) => s + p.valor, 0);
                const isExp = expandedMonths.has(mes);
                const selectedInMonth = pedidos.filter(p => selectedIds.has(p.pedidoId)).length;
                return (
                  <React.Fragment key={mes}>
                    <tr
                      className={cn(
                        'border-b border-border cursor-pointer select-none hover:bg-muted/30 transition-colors',
                        isExp && 'bg-muted/20',
                      )}
                      onClick={() => toggleMonth(mes)}
                    >
                      <td className="px-3 py-3 text-muted-foreground">
                        {isExp
                          ? <ChevronDown className="h-4 w-4" />
                          : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {fmtMesLabel(mes)}
                        {selectedInMonth > 0 && (
                          <span className="ml-2 text-xs text-primary font-normal">
                            ({selectedInMonth} selecionado{selectedInMonth > 1 ? 's' : ''})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-right tabular-nums">{pedidos.length}</td>
                      <td className="px-4 py-3 text-sm text-right tabular-nums font-medium">
                        <div className="flex items-center justify-end gap-3">
                          <span>{BRL_FMT.format(totalValor)}</span>
                          <button
                            title="Imprimir relatório do mês"
                            onClick={(e) => { e.stopPropagation(); openPrintModal(mes); }}
                            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExp && (
                      <tr>
                        <td colSpan={4} className="bg-muted/10 border-b border-border">
                          <div className="px-4 py-3 overflow-x-auto">
                            {renderSubTable(pedidos)}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Sem Programação */}
      {showSemProg && semProgramacao.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold font-display text-amber-800 dark:text-amber-300">
              Sem Programação ({semProgramacao.length})
            </h2>
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Pedidos liberados para produção sem mês definido
            </span>
          </div>
          <div className="overflow-x-auto">
            {renderSubTable(semProgramacao)}
          </div>
        </div>
      )}

      {/* Print Modal */}
      {printMes && (() => {
        const pedidos = (groupedMonths.get(printMes) ?? []).slice().sort((a, b) => {
          const da = printOverrides.get(a.pedidoId) ?? a.dataEmbarqueProgramacao ?? '';
          const db = printOverrides.get(b.pedidoId) ?? b.dataEmbarqueProgramacao ?? '';
          if (da && db) return da.localeCompare(db);
          if (da) return -1;
          if (db) return 1;
          return a.clienteNome.localeCompare(b.clienteNome, 'pt-BR');
        });
        const semPrevisao = pedidos.filter(p => !(printOverrides.get(p.pedidoId) ?? p.dataEmbarqueProgramacao));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">

              {/* Header fixo */}
              <div className="px-6 pt-5 pb-4 border-b border-border shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold font-display text-foreground">
                      Relatório — {fmtMesLabel(printMes)}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{pedidos.length} pedidos · {semPrevisao.length} sem previsão</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={generatePrintPdf} className={btnPrimary}>
                      <Printer className="h-4 w-4" />
                      Gerar PDF
                    </button>
                    <button onClick={() => setPrintMes(null)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {semPrevisao.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Pedidos sem previsão de embarque aparecem como <strong>A DEFINIR</strong> no PDF. Preencha abaixo antes de imprimir.</span>
                  </div>
                )}
              </div>

              {/* Corpo scrollável */}
              <div
                ref={printScrollRef}
                className="overflow-y-auto flex-1 px-6 py-4 relative"
                onScroll={e => setPrintScrolled((e.currentTarget.scrollTop) > 100)}
              >
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="text-left px-3 py-2">Pedido</th>
                        <th className="text-left px-3 py-2">Cliente</th>
                        <th className="text-left px-3 py-2">Cidade</th>
                        <th className="text-center px-3 py-2">UF</th>
                        <th className="text-right px-3 py-2">Valor</th>
                        <th className="text-center px-3 py-2 w-40">Prev. Embarque</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidos.map(p => (
                        <tr key={p.pedidoId} className="border-b border-border/40 hover:bg-muted/20">
                          <td className="px-3 py-2 font-mono font-bold text-xs">{p.numeroPedido}</td>
                          <td className="px-3 py-2 text-xs truncate max-w-[180px]">{p.clienteNome}</td>
                          <td className="px-3 py-2 text-xs truncate max-w-[120px] text-muted-foreground">{p.cidadeCliente ?? '—'}</td>
                          <td className="px-3 py-2 text-xs text-center text-muted-foreground">{p.ufCliente ?? '—'}</td>
                          <td className="px-3 py-2 text-xs text-right tabular-nums">{p.valorFormatado}</td>
                          <td className="px-3 py-2 text-center">
                            <div className="relative inline-flex items-center">
                              <input
                                type="text"
                                placeholder="DD/MM/AAAA"
                                maxLength={10}
                                value={isoToBr(printOverrides.get(p.pedidoId) ?? p.dataEmbarqueProgramacao ?? '')}
                                onChange={e => {
                                  const val = e.target.value;
                                  const iso = brToIso(val);
                                  if (iso) void savePrintDate(p.pedidoId, iso);
                                  else if (!val) void savePrintDate(p.pedidoId, null);
                                  else setPrintOverrides(prev => { const next = new Map(prev); next.set(p.pedidoId, val); return next; });
                                }}
                                className="w-24 border border-r-0 border-input rounded-l px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary text-center"
                              />
                              <button
                                onClick={() => {
                                  const cur = printOverrides.get(p.pedidoId) ?? p.dataEmbarqueProgramacao ?? '';
                                  const month = cur ? cur.slice(0, 7) : new Date().toISOString().slice(0, 7);
                                  setCalendarMonth(month);
                                  setCalendarForId(prev => prev === p.pedidoId ? null : p.pedidoId);
                                }}
                                className="border border-input rounded-r bg-muted h-[26px] w-7 flex items-center justify-center shrink-0 hover:bg-muted/80 transition-colors"
                              >
                                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                              {calendarForId === p.pedidoId && (
                                <MiniCal
                                  selectedIso={printOverrides.get(p.pedidoId) ?? p.dataEmbarqueProgramacao ?? ''}
                                  displayMonth={calendarMonth}
                                  onChangeMonth={setCalendarMonth}
                                  onSelect={iso => void savePrintDate(p.pedidoId, iso)}
                                  onClose={() => setCalendarForId(null)}
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Voltar ao Topo */}
                {printScrolled && (
                  <button
                    onClick={() => printScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="sticky bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold shadow-lg hover:opacity-90 transition-opacity"
                  >
                    <ChevronDown className="h-3.5 w-3.5 rotate-180" />
                    Voltar ao Topo
                  </button>
                )}
              </div>

            </div>
          </div>
        );
      })()}

      {/* Import by list Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold font-display text-foreground">Importar lista de pedidos</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Cole os números dos pedidos ou POs do cliente (vírgula, espaço ou quebra de linha). POs são resolvidos automaticamente para o número interno. Os que não existirem no sistema serão criados como <strong>Liberado Produção</strong>.
                </p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              rows={6}
              placeholder={"133551,\n124567,\n129566,\n..."}
              value={importText}
              onChange={(e) => { setImportText(e.target.value); setImportResult(null); setVerifyResult(null); }}
              className="w-full px-3 py-2 text-sm font-mono border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              disabled={importLoading || verifyLoading}
            />

            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm text-muted-foreground whitespace-nowrap">Mês de programação:</label>
              <input
                type="month"
                value={importMes}
                onChange={(e) => { setImportMes(e.target.value); setImportResult(null); setVerifyResult(null); }}
                className="border border-border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                disabled={importLoading || verifyLoading}
              />
            </div>

            {/* Verify result */}
            {verifyResult && (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300">
                  <Check className="h-4 w-4 shrink-0" />
                  <span><strong>{verifyResult.okMes.length}</strong> pedido(s) já no mês correto ({importMes && fmtMesLabel(importMes)})</span>
                </div>

                {verifyResult.poResolved.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300">
                    <p className="font-semibold mb-1">POs resolvidos ({verifyResult.poResolved.length}) — convertidos para número interno:</p>
                    <div className="font-mono text-xs space-y-0.5 max-h-28 overflow-y-auto">
                      {verifyResult.poResolved.map(({ po, id }) => (
                        <div key={po}><span className="font-bold">{po}</span> → {id}</div>
                      ))}
                    </div>
                  </div>
                )}

                {verifyResult.duplicates.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-muted border border-border text-muted-foreground">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-semibold">Duplicados na lista ({verifyResult.duplicates.length}):</p>
                      <button
                        type="button"
                        onClick={async () => {
                          const { unique, duplicates: dups } = parseImportIds();
                          // Mantém no textarea apenas os que apareceram UMA vez (remove completamente os duplicados)
                          const dupSet = new Set(dups);
                          const semDups = unique.filter(id => !dupSet.has(id));
                          setImportText(semDups.join('\n'));
                          setVerifyResult(null);
                          setImportResult(null);
                          // Limpa mes_programacao dos duplicados no banco
                          if (supabaseOps && dups.length) {
                            for (let i = 0; i < dups.length; i += 200) {
                              await supabaseOps
                                .from('concrem_pedidos_status')
                                .update({ mes_programacao: null })
                                .in('pedido_id', dups.slice(i, i + 200));
                            }
                            setOpsRows(prev => prev.map(r =>
                              dupSet.has(r.pedido_id) ? { ...r, mes_programacao: null } : r,
                            ));
                            showToast(`${dups.length} pedido(s) duplicado(s) removidos da programação do mês.`);
                          }
                        }}
                        className="text-xs px-2 py-1 rounded border border-border bg-background hover:bg-muted text-foreground font-semibold transition-colors whitespace-nowrap"
                      >
                        Remover duplicados
                      </button>
                    </div>
                    <p className="font-mono text-xs break-all">{verifyResult.duplicates.join(', ')}</p>
                  </div>
                )}

                {verifyResult.wrongMes.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                    <p className="font-semibold mb-1">Mês diferente ({verifyResult.wrongMes.length}) — serão corrigidos ao Processar:</p>
                    <div className="font-mono text-xs space-y-0.5 max-h-32 overflow-y-auto">
                      {verifyResult.wrongMes.map(({ id, mes }) => (
                        <div key={id}><span className="font-bold">{id}</span> → {mes ? fmtMesLabel(mes) : 'sem mês'}</div>
                      ))}
                    </div>
                  </div>
                )}

                {verifyResult.notFound.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300">
                    <p className="font-semibold mb-1">Não encontrados no sistema ({verifyResult.notFound.length}) — serão criados ao Processar:</p>
                    <p className="font-mono text-xs break-all">{verifyResult.notFound.join(', ')}</p>
                  </div>
                )}
              </div>
            )}

            {/* Process result */}
            {importResult && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 text-sm">
                <Check className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  <strong>{importResult.updated}</strong> atualizados,{' '}
                  <strong>{importResult.created}</strong> criados para <strong>{fmtMesLabel(importMes)}</strong>.
                </span>
              </div>
            )}

            <div className="flex justify-between gap-3 pt-1">
              <button
                className={btnSecondary}
                disabled={verifyLoading || importLoading || !importMes || !YYYYMM_RE.test(importMes) || !importText.trim()}
                onClick={() => void verifyImport()}
              >
                {verifyLoading ? 'Verificando…' : 'Verificar'}
              </button>
              <div className="flex gap-3">
                <button
                  className={btnSecondary}
                  onClick={() => setShowImportModal(false)}
                  disabled={importLoading || verifyLoading}
                >
                  {importResult ? 'Fechar' : 'Cancelar'}
                </button>
                <button
                  className={btnPrimary}
                  disabled={importLoading || verifyLoading || !importMes || !YYYYMM_RE.test(importMes) || !importText.trim()}
                  onClick={() => void processImport()}
                >
                  {importLoading ? 'Processando…' : 'Processar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Confirm Modal */}
      {showBulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className={cn('h-5 w-5 shrink-0 mt-0.5', bulkAction === 'clear' ? 'text-destructive' : 'text-amber-500')} />
              <div>
                <h2 className="text-base font-bold font-display text-foreground">
                  {bulkAction === 'set' ? 'Confirmar alteração em massa' : 'Remover programação em massa'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1.5">
                  {bulkAction === 'set' ? (
                    <>
                      Você está prestes a alterar o mês de programação de{' '}
                      <strong>{selectedIds.size} pedido(s)</strong> para{' '}
                      <strong>{fmtMesLabel(bulkMes)}</strong>. Confirmar?
                    </>
                  ) : (
                    <>
                      Você está prestes a <strong>remover o mês de programação</strong> de{' '}
                      <strong>{selectedIds.size} pedido(s)</strong>.{' '}
                      Eles voltarão para <strong>Sem Programação</strong>. Confirmar?
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                className={btnSecondary}
                onClick={() => setShowBulkConfirm(false)}
                disabled={bulkSaving}
              >
                Cancelar
              </button>
              <button
                className={bulkAction === 'clear'
                  ? 'inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-50'
                  : btnPrimary}
                onClick={() => void applyBulkMes()}
                disabled={bulkSaving}
              >
                {bulkSaving
                  ? (bulkAction === 'set' ? 'Aplicando…' : 'Removendo…')
                  : (bulkAction === 'set' ? 'Confirmar' : 'Remover')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick-add order from ERP */}
      {quickAddOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold font-display">Adicionar à programação</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Pedido <span className="font-mono font-bold">{quickAddOrder.numero_pedido}</span>
                  {quickAddOrder.cliente_nome && <> — {quickAddOrder.cliente_nome}</>}
                </p>
              </div>
              <button onClick={() => setQuickAddOrder(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Mês de programação</label>
              <input
                type="month"
                value={quickAddMes}
                onChange={(e) => setQuickAddMes(e.target.value)}
                autoFocus
                className="mt-1 w-full border border-border rounded px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => void quickAddFromErp()}
                disabled={!quickAddMes || !YYYYMM_RE.test(quickAddMes) || quickAddSaving}
                className={cn(btnPrimary, 'flex-1')}
              >
                {quickAddSaving ? 'Salvando…' : 'Confirmar'}
              </button>
              <button
                onClick={() => setQuickAddOrder(null)}
                className={cn(btnSecondary, 'flex-1')}
                disabled={quickAddSaving}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Programacao;
