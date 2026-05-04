import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, Check, ChevronDown, ChevronRight, Pencil, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
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
};

type ErpRow = {
  numero_pedido: string;
  cliente_nome: string | null;
  total_pedido_venda: number | null;
  total_produtos: number | null;
  frete: number | null;
  data_emissao: string | null;
  representante: string | null;
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
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PRODUCAO_STATUSES: string[] = [
  'liberado_producao', 'em_producao', 'producao_finalizada',
  'faturado', 'em_entrega', 'parcialmente_entregue',
  'entregue', 'aguardando_pagamento', 'finalizado',
];

const OPS_COLS = 'pedido_id, numero_pedido, status_atual, mes_programacao, atualizado_em';
const ERP_COLS = 'numero_pedido, cliente_nome, total_pedido_venda, total_produtos, frete, data_emissao, representante';
const ERP_TABLE = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';

// ─── Module-level helpers (instantiated once, not per render) ─────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const BRL_FMT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DATE_FMT = new Intl.DateTimeFormat('pt-BR');

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
  const v = erp.total_pedido_venda ?? 0;
  const f = erp.frete ?? 0;
  const total = v + f;
  return isFinite(total) && total > 0 ? total : 0;
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
              className="border border-border rounded px-2 py-0.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <button
              onClick={() => onSaveEdit(p.pedidoId)}
              disabled={saving}
              className="text-green-600 hover:text-green-700 disabled:opacity-40"
              title="Confirmar"
            >
              <Check className="h-4 w-4" />
            </button>
            <button onClick={onCancelEdit} className="text-muted-foreground hover:text-foreground" title="Cancelar">
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
  const [loading, setLoading] = useState(true);

  // ── View ─────────────────────────────────────────────────────────────────────
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [filterText, setFilterText] = useState('');
  const [filterTextDebounced, setFilterTextDebounced] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMes, setFilterMes] = useState('');
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
  } | null>(null);

  // ── Bulk select & action ─────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMes, setBulkMes] = useState('');
  const [bulkAction, setBulkAction] = useState<'set' | 'clear'>('set');
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  // ── Debounce text filter ─────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setFilterTextDebounced(filterText), 300);
    return () => clearTimeout(t);
  }, [filterText]);

  // ── Load ─────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ops = await fetchOpsRows();
      const erp = await fetchErpMap(ops.map((r) => r.pedido_id));
      setOpsRows(ops);
      setErpMap(erp);
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

  // ── Apply text + status filters ───────────────────────────────────────────────
  const filteredPedidos = useMemo(() => {
    let result = allPedidos;
    if (filterTextDebounced) {
      // Split by comma, semicolon, newline or multiple spaces — supports bulk paste
      const terms = filterTextDebounced
        .split(/[,;\n\r]+/)
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);
      if (terms.length > 1) {
        result = result.filter(p =>
          terms.some(t =>
            p.numeroPedido.toLowerCase().includes(t) ||
            p.clienteNome.toLowerCase().includes(t),
          ),
        );
      } else {
        const q = terms[0];
        result = result.filter(p =>
          p.numeroPedido.toLowerCase().includes(q) ||
          p.clienteNome.toLowerCase().includes(q),
        );
      }
    }
    if (filterStatus) {
      result = result.filter(p => p.statusAtual === filterStatus);
    }
    return result;
  }, [allPedidos, filterTextDebounced, filterStatus]);

  // ── Group by month ────────────────────────────────────────────────────────────
  const { groupedMonths, monthOrder } = useMemo(() => {
    const grouped = new Map<string, Pedido[]>();
    for (const p of filteredPedidos) {
      if (!p.mesProgramacao) continue;
      const year = parseInt(p.mesProgramacao.split('-')[0], 10);
      if (year !== selectedYear) continue;
      if (filterMes && p.mesProgramacao !== filterMes) continue;
      const list = grouped.get(p.mesProgramacao) ?? [];
      list.push(p);
      grouped.set(p.mesProgramacao, list);
    }
    const order = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));
    return { groupedMonths: grouped, monthOrder: order };
  }, [filteredPedidos, selectedYear, filterMes]);

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

  const hasActiveFilters = !!(filterTextDebounced || filterStatus || filterMes);

  // Auto-expand all months when a filter becomes active
  useEffect(() => {
    if (hasActiveFilters && monthOrder.length > 0) {
      setExpandedMonths(new Set(monthOrder));
    }
  }, [hasActiveFilters, monthOrder]);

  // ── Permission ────────────────────────────────────────────────────────────────
  const canEdit =
    user?.role === 'ADMIN' ||
    canFazer(user?.funcionalidades, 'programacao_comercial.editar_mes') ||
    (!user?.funcionalidades && (user?.role === 'COMERCIAL' || user?.role === 'FATURAMENTO'));

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
    setFilterStatus('');
    setFilterMes('');
    setShowSemProg(false);
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
    const { unique: ids, duplicates } = parseImportIds();
    if (!ids.length) return;

    setVerifyLoading(true);
    setVerifyResult(null);
    setImportResult(null);
    try {
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

      setVerifyResult({ okMes, wrongMes, notFound, duplicates });
    } catch (e: any) {
      console.error('[Programacao] verifyImport:', e);
      showToast('Erro ao verificar pedidos.', 'error');
    } finally {
      setVerifyLoading(false);
    }
  };

  const processImport = async () => {
    if (!supabaseOps || !importMes || !YYYYMM_RE.test(importMes)) return;

    const { unique: ids } = parseImportIds();
    if (!ids.length) return;

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
    <div className="space-y-4 p-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-6 w-6 text-primary shrink-0" />
          <div>
            <h1 className="text-2xl font-display font-semibold">Programação</h1>
            <p className="text-sm text-muted-foreground">Acompanhe os pedidos liberados por mês de programação.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Ano:</label>
          <select
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(Number(e.target.value));
              setExpandedMonths(new Set());
              setFilterMes('');
            }}
            className="border border-border rounded px-2 py-1 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => { setImportResult(null); setShowImportModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Importar lista de pedidos"
          >
            <Upload className="h-4 w-4" />
            Importar lista
          </button>
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
        <div className="relative flex-1 min-w-[160px] max-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Pedido, cliente… (vários: 100012, 100013)"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-2 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Todos os status</option>
          {availableStatuses.map(s => (
            <option key={s} value={s}>{getPedidoStatusLabel(s as PedidoStatusValue)}</option>
          ))}
        </select>
        <select
          value={filterMes}
          onChange={(e) => setFilterMes(e.target.value)}
          className="px-2 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Todos os meses</option>
          {availableMonths.map(m => (
            <option key={m} value={m}>{fmtMesLabel(m)}</option>
          ))}
        </select>
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
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
                        {BRL_FMT.format(totalValor)}
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

      {/* Import by list Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold font-display text-foreground">Importar lista de pedidos</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Cole os números dos pedidos (vírgula, espaço ou quebra de linha). Os que não existirem no sistema serão criados como <strong>Liberado Produção</strong>.
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

                {verifyResult.duplicates.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-muted border border-border text-muted-foreground">
                    <p className="font-semibold mb-1">Duplicados na lista ({verifyResult.duplicates.length}):</p>
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

    </div>
  );
};

export default Programacao;
