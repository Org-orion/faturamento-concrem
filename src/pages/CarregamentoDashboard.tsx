import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { canDo, canFazer, type UserRole } from '@/utils/access';
import { isFaturadoStatus, isProgramadoStatus } from '@/lib/constants';
import { getValorTotalPedido } from '@/lib/valorPedido';
import { formatCurrency } from '@/components/shared';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { todayBR, fmtDate } from '@/lib/dateUtils';
import {
  ChevronLeft, ChevronRight, Truck, Package, DollarSign,
  Search, X, Pencil, Calendar, CalendarCheck, User, FileText,
  Paperclip, Trash2, Upload, Save, ExternalLink,
  Target, TrendingUp, TrendingDown, AlertTriangle, FileDown,
  Eye, Download, FileCheck2, Clock, Image as ImageIcon,
} from 'lucide-react';
import logoSrc from '@/assets/logo-programacao.png';
import { listRelatorioEntregaAnexos, type RelatorioEntregaAnexo } from '@/lib/opsRepo';

const getLogoDataUrl = async (): Promise<string> => {
  try {
    const res = await fetch(logoSrc);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch { return ''; }
};
import type { Load } from '@/types';
import { usePrioridades } from '@/contexts/PrioridadesContext';
import { PrioridadeDot, PrioridadeBadge } from '@/components/pedidos/PrioridadeBadge';
import { supabasePedidos, supabaseOps } from '@/lib/supabase';
import { fetchProgramacaoMes, type ProgramacaoMesResult } from '@/lib/programacaoValor';
import { listEmbarqueHistorico, type EmbarqueHistoricoRow } from '@/lib/embarqueHistoricoRepo';
import { fmtDateTime } from '@/lib/dateUtils';

type ViewMode = 'semana' | 'mes' | 'lista';

const VIEW_LABELS: Record<ViewMode, string> = {
  semana: 'Semana',
  mes: 'Mês',
  lista: 'Lista',
};

const STATUS_COLORS: Record<string, string> = {
  'Aguardando Despacho': 'bg-amber-100 text-amber-800 border-amber-200',
  'Despachado':          'bg-blue-100 text-blue-800 border-blue-200',
  'Em Rota':             'bg-purple-100 text-purple-800 border-purple-200',
  'Entregue':            'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Cancelado':           'bg-red-100 text-red-800 border-red-200',
};

const STATUS_LEFT: Record<string, string> = {
  'Aguardando Despacho': 'bg-amber-400',
  'Despachado':          'bg-blue-500',
  'Em Rota':             'bg-purple-500',
  'Entregue':            'bg-emerald-500',
  'Cancelado':           'bg-red-500',
};

const STATUS_ABBR: Record<string, string> = {
  'Aguardando Despacho': 'Ag. Despacho',
};

const DAYS_BR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_BR = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

type MoveJustType = 'adiamento' | 'antecipacao';

const MOVE_JUST_LABELS: Record<MoveJustType, string> = {
  adiamento:   'Adiamento — movido para data posterior',
  antecipacao: 'Antecipação — movido para data anterior',
};

// ── date helpers ──────────────────────────────────────────────────────────────

function parseISO(d: string) { return new Date(d + 'T12:00:00'); }
function toISO(d: Date) { return d.toISOString().slice(0, 10); }

function mondayOfWeek(dateStr: string) {
  const d = parseISO(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return toISO(d);
}

function addDays(dateStr: string, n: number) {
  const d = parseISO(dateStr);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function addMonths(dateStr: string, n: number) {
  const d = parseISO(dateStr);
  d.setMonth(d.getMonth() + n);
  return toISO(d);
}

function firstDayOfMonth(dateStr: string) { return dateStr.slice(0, 7) + '-01'; }

function daysInMonth(dateStr: string) {
  const d = parseISO(dateStr);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

// ── Meta helpers ──────────────────────────────────────────────────────────────

type MonthGoal = {
  month: string;
  goalValue: number;
  workingDays: number;
};

async function fetchGoalForMonth(month: string): Promise<MonthGoal | null> {
  if (!supabaseOps) return null;
  const { data, error } = await supabaseOps
    .from('concrem_faturamento_metas')
    .select('*')
    .eq('month', month)
    .maybeSingle();
  if (error || !data) return null;
  return { month: data.month, goalValue: Number(data.goal_value), workingDays: Number(data.working_days) };
}

async function fetchJustificativasForMonth(month: string): Promise<{ date: string; type: string }[]> {
  if (!supabaseOps) return [];
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const { data } = await supabaseOps
    .from('concrem_faturamento_justificativas')
    .select('date, type')
    .gte('date', `${month}-01`)
    .lte('date', `${month}-${String(lastDay).padStart(2, '0')}`);
  return data || [];
}

function loadRealValue(l: Load, ovm: Map<string, number>): number {
  // ovm contém total_pedido_venda, que já inclui o frete do pedido.
  // freightValue é o custo de transporte do embarque — não entra no valor de faturamento.
  return l.orderIds.reduce((s, id) => s + (ovm.get(id) || 0), 0);
}

// ─────────────────────────────────────────────────────────────────────────────

function getLoadPriorityNivel(load: Load, prioMap: Map<string, { nivel: string }>): string | undefined {
  for (const nivel of ['urgente', 'alta', 'media'] as const) {
    if (load.orderIds.some(id => prioMap.get(id)?.nivel === nivel)) return nivel;
  }
  return undefined;
}

// ── LoadCard ──────────────────────────────────────────────────────────────────

interface LoadCardProps {
  load: Load;
  driverName: string;
  compact?: boolean;
  canEdit?: boolean;
  priorityNivel?: string;
  orderValueMap?: Map<string, number>;
  orderClientMap?: Map<string, string>;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}

function LoadCard({ load, driverName, compact, canEdit = true, priorityNivel, orderValueMap, orderClientMap, onClick, draggable, onDragStart }: LoadCardProps) {
  const status = load.shipmentStatus || 'Aguardando Despacho';
  const colorClass = STATUS_COLORS[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  const leftClass = STATUS_LEFT[status] || 'bg-gray-400';
  const productsValue = orderValueMap
    ? load.orderIds.reduce((s, id) => s + (orderValueMap.get(id) || 0), 0)
    : null;

  const hasPopover = !!orderClientMap && load.orderIds.length > 0;

  const card = compact ? (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-semibold truncate ${colorClass} hover:opacity-80 transition-opacity cursor-pointer select-none`}
      title={hasPopover ? undefined : `${driverName} — ${formatCurrency(load.freightValue || 0)}`}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      {priorityNivel && <PrioridadeDot nivel={priorityNivel as any} />}
      <Truck className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{driverName}</span>
    </div>
  ) : (
    <div
      className="flex rounded-lg border border-border bg-card overflow-hidden hover:shadow-md transition-shadow group cursor-pointer select-none"
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <div className={`w-1 shrink-0 ${leftClass}`} />
      <div className="flex-1 p-3 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-xs font-semibold truncate text-foreground group-hover:text-primary">{driverName}</span>
          </div>
          <span className={`hidden sm:inline-flex shrink-0 items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${colorClass}`}>{STATUS_ABBR[status] ?? status}</span>
        </div>
        {load.obs && (
          <p className="text-[11px] font-bold text-foreground truncate mb-1 uppercase tracking-wide" title={load.obs}>{load.obs}</p>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {priorityNivel && <span className="flex items-center gap-1"><PrioridadeDot nivel={priorityNivel as any} /></span>}
          <span className="flex items-center gap-1"><Package className="h-3 w-3" />{load.orderIds.length} pedido{load.orderIds.length !== 1 ? 's' : ''}</span>
          <span className="flex items-center gap-1 text-emerald-600 font-semibold">
            <DollarSign className="h-3 w-3" />
            {formatCurrency(productsValue ?? 0)}
          </span>
        </div>
      </div>
    </div>
  );

  // Sem mapa de clientes ou sem pedidos: card puro, sem tooltip.
  if (!hasPopover) return card;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent side="right" align="start" className="max-w-xs p-0">
          <div className="max-h-72 overflow-auto py-1.5">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {load.orderIds.length} pedido{load.orderIds.length !== 1 ? 's' : ''}
            </p>
            {load.orderIds.map((id) => (
              <div key={id} className="px-3 py-0.5 text-xs whitespace-nowrap">
                <span className="font-mono-data font-semibold text-primary">{id}</span>
                <span className="text-muted-foreground"> — {orderClientMap.get(id) || '—'}</span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── DayColumn ─────────────────────────────────────────────────────────────────

function DayColumn({
  dateStr, loads, driverMap, today, canEdit, prioMap, orderValueMap, orderClientMap,
  onLoadClick, onDropLoad, dragOverDate, setDragOverDate, onExportPdf,
}: {
  dateStr: string;
  loads: Load[];
  driverMap: Map<string, string>;
  today: string;
  canEdit: boolean;
  prioMap: Map<string, { nivel: string }>;
  orderValueMap?: Map<string, number>;
  orderClientMap?: Map<string, string>;
  onLoadClick: (load: Load) => void;
  onDropLoad: (loadId: string, newDate: string) => void;
  dragOverDate: string | null;
  setDragOverDate: (d: string | null) => void;
  onExportPdf?: (dateStr: string) => void;
}) {
  const d = parseISO(dateStr);
  const dayName = DAYS_BR[d.getDay()];
  const dayNum = d.getDate();
  const isToday = dateStr === today;
  const isDragOver = dragOverDate === dateStr;
  const dayTotal = loads.reduce((s, l) =>
    s + l.orderIds.reduce((a, id) => a + ((orderValueMap?.get(id)) || 0), 0), 0);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverDate(dateStr);
  };
  const handleDragLeave = () => setDragOverDate(null);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverDate(null);
    const loadId = e.dataTransfer.getData('loadId');
    if (loadId) onDropLoad(loadId, dateStr);
  };

  return (
    <div
      className={`flex flex-col min-h-[120px] transition-colors ${
        isDragOver ? 'bg-primary/10 ring-2 ring-primary/40 rounded-xl' :
        isToday ? 'bg-primary/5 rounded-xl ring-1 ring-primary/30' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={`px-2 py-2 text-center border-b border-border ${isToday ? 'border-primary/20' : ''}`}>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{dayName}</div>
        <div className={`text-lg font-bold leading-none mt-0.5 ${isToday ? 'text-primary' : 'text-foreground'}`}>{dayNum}</div>
        {loads.length > 0 && (
          <div className="mt-1 flex items-center justify-center gap-1.5">
            <div className="text-[9px] font-semibold text-emerald-600">{formatCurrency(dayTotal)}</div>
            {onExportPdf && (
              <button
                type="button"
                title="Exportar PDF do dia"
                onClick={(e) => { e.stopPropagation(); onExportPdf(dateStr); }}
                className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                <FileDown className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 p-2">
        {loads.length === 0 ? (
          <div className={`text-[10px] text-center py-2 ${isDragOver ? 'text-primary font-semibold' : 'text-muted-foreground/50'}`}>
            {isDragOver ? 'Soltar aqui' : '—'}
          </div>
        ) : (
          loads.map((l) => (
            <LoadCard
              key={l.id}
              load={l}
              driverName={driverMap.get(l.driverId) || 'Sem motorista'}
              canEdit={canEdit}
              priorityNivel={getLoadPriorityNivel(l, prioMap)}
              orderValueMap={orderValueMap}
              orderClientMap={orderClientMap}
              onClick={() => onLoadClick(l)}
              draggable={canEdit}
              onDragStart={(e) => { e.dataTransfer.setData('loadId', l.id); }}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── MonthCell ─────────────────────────────────────────────────────────────────

function MonthCell({
  dateStr, loads, driverMap, today, currentMonth, canEdit, prioMap, orderValueMap, orderClientMap,
  onLoadClick, onDropLoad, dragOverDate, setDragOverDate,
}: {
  dateStr: string; loads: Load[]; driverMap: Map<string, string>; today: string;
  currentMonth: string; canEdit: boolean; prioMap: Map<string, { nivel: string }>;
  orderValueMap?: Map<string, number>;
  orderClientMap?: Map<string, string>;
  onLoadClick: (load: Load) => void;
  onDropLoad: (loadId: string, newDate: string) => void;
  dragOverDate: string | null;
  setDragOverDate: (d: string | null) => void;
}) {
  const d = parseISO(dateStr);
  const dayNum = d.getDate();
  const isToday = dateStr === today;
  const isCurrentMonth = dateStr.slice(0, 7) === currentMonth;
  const isDragOver = dragOverDate === dateStr;
  const dayTotal = loads.reduce((s, l) =>
    s + l.orderIds.reduce((a, id) => a + ((orderValueMap?.get(id)) || 0), 0), 0);

  return (
    <div
      className={`min-h-[90px] p-1.5 border-b border-r border-border/50 transition-colors ${
        !isCurrentMonth ? 'bg-muted/30' : ''
      } ${isDragOver ? 'bg-primary/10 ring-2 ring-inset ring-primary/40' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOverDate(dateStr); }}
      onDragLeave={() => setDragOverDate(null)}
      onDrop={(e) => { e.preventDefault(); setDragOverDate(null); const id = e.dataTransfer.getData('loadId'); if (id) onDropLoad(id, dateStr); }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-primary-foreground' : isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/40'}`}>
          {dayNum}
        </span>
        {loads.length > 0 && isCurrentMonth && (
          <span className="text-[9px] font-semibold text-emerald-600">{formatCurrency(dayTotal)}</span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        {loads.slice(0, 3).map((l) => (
          <LoadCard
            key={l.id}
            load={l}
            driverName={driverMap.get(l.driverId) || 'Sem motorista'}
            compact
            canEdit={canEdit}
            priorityNivel={getLoadPriorityNivel(l, prioMap)}
            orderValueMap={orderValueMap}
            orderClientMap={orderClientMap}
            onClick={() => onLoadClick(l)}
            draggable={canEdit}
            onDragStart={(e) => { e.dataTransfer.setData('loadId', l.id); }}
          />
        ))}
        {loads.length > 3 && (
          <span className="text-[10px] text-muted-foreground font-semibold pl-1">+{loads.length - 3} mais</span>
        )}
      </div>
    </div>
  );
}

// ── Details panel ─────────────────────────────────────────────────────────────

type OrderDetail = { clientName: string; orderValue: number; freight: number };
type LoadAttachment = { name: string; path: string; url: string };

type MoveJustificativa = {
  date:         string;
  type:         'adiamento' | 'antecipacao';
  related_date: string | null;
  reason:       string;
  updated_at:   string;
};

const JUST_TYPE_LABEL: Record<string, string> = {
  adiamento:       'Adiamento',
  antecipacao:     'Antecipação',
  antecipado_saiu: 'Antecipação (saiu)',
  cancelamento:    'Cancelamento',
  recuperado:      'Recuperado',
  outro:           'Outro',
};

const JUST_TYPE_COLOR: Record<string, string> = {
  adiamento:       'text-amber-600',
  antecipacao:     'text-blue-600',
  antecipado_saiu: 'text-indigo-600',
  cancelamento:    'text-red-600',
  recuperado:      'text-emerald-600',
  outro:           'text-gray-500',
};

const STORAGE_BUCKET = 'relatorio-entrega';

// Linha de documento (aba Documentos) — visualizar / baixar / abrir.
function DocRow({ doc, label, onPreview }: { doc: RelatorioEntregaAnexo; label: string; onPreview: () => void }) {
  const nome = (doc.arquivo_nome || '').replace(/^\d+_/, '');
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
      <div className="w-7 h-7 rounded bg-muted flex items-center justify-center shrink-0">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">{label}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {nome}{doc.criado_em ? ` · ${fmtDate(doc.criado_em)}` : ''}{doc.criado_por ? ` · ${doc.criado_por}` : ''}
        </p>
      </div>
      <button onClick={onPreview} title="Visualizar" className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
        <Eye className="h-3.5 w-3.5" />
      </button>
      <a href={doc.arquivo_url} download target="_blank" rel="noopener noreferrer" title="Baixar"
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
        <Download className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function LoadDetailsPanel({
  load, driverName, onClose, canEdit, onEdit, onUpdateLoad, prioMap,
}: {
  load: Load;
  driverName: string;
  onClose: () => void;
  canEdit: boolean;
  onEdit: () => void;
  onUpdateLoad: (updated: Load) => Promise<void>;
  prioMap: Map<string, { nivel: string }>;
}) {
  const status = load.shipmentStatus || 'Aguardando Despacho';
  const colorClass = STATUS_COLORS[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // ── navegação por abas do drawer ──
  const [tab, setTab] = useState<'resumo' | 'pedidos' | 'documentos' | 'historico'>('resumo');

  // ── order details fetch ──
  const [orderDetails, setOrderDetails] = useState<Map<string, OrderDetail>>(new Map());
  const [loadingDetails, setLoadingDetails] = useState(false);

  // ── documentos por pedido (concrem_relatorio_entrega_anexos) ──
  const [relDocs, setRelDocs] = useState<RelatorioEntregaAnexo[]>([]);
  const [loadingRelDocs, setLoadingRelDocs] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<RelatorioEntregaAnexo | null>(null);
  // Pedidos expandidos na aba Documentos (fechados por padrão).
  const [openDocs, setOpenDocs] = useState<Set<string>>(new Set());
  const toggleDocPedido = (pid: string) => setOpenDocs((prev) => {
    const next = new Set(prev);
    if (next.has(pid)) next.delete(pid); else next.add(pid);
    return next;
  });

  useEffect(() => {
    let cancelled = false;
    setLoadingRelDocs(true);
    listRelatorioEntregaAnexos(load.id)
      .then((rows) => { if (!cancelled) setRelDocs(rows); })
      .finally(() => { if (!cancelled) setLoadingRelDocs(false); });
    return () => { cancelled = true; };
  }, [load.id]);

  const tipoDocLabel = (tipo: string): string =>
    tipo === 'nf' ? 'Nota Fiscal'
      : tipo.startsWith('boleto') ? 'Boleto'
      : tipo.startsWith('comprovante') ? 'Comprovante de Entrega'
      : tipo;

  // pedido_id → documentos
  const docsByPedido = useMemo(() => {
    const m = new Map<string, RelatorioEntregaAnexo[]>();
    for (const d of relDocs) {
      const arr = m.get(d.pedido_id) ?? [];
      arr.push(d);
      m.set(d.pedido_id, arr);
    }
    return m;
  }, [relDocs]);

  // situação documental de um pedido (regras reais: NF/boleto p/ Em Rota, comprovante p/ Entregue)
  const situacaoPedido = (pedidoId: string) => {
    const docs = docsByPedido.get(pedidoId) ?? [];
    const temNf = docs.some((d) => d.tipo === 'nf');
    const temBoleto = docs.some((d) => d.tipo.startsWith('boleto'));
    const temComprovante = docs.some((d) => d.tipo.startsWith('comprovante'));
    let label: string; let tone: 'ok' | 'warn' | 'muted';
    if (docs.length === 0) { label = 'Sem documentos'; tone = 'muted'; }
    else if (temComprovante && temNf && temBoleto) { label = 'Documentação completa'; tone = 'ok'; }
    else if (temNf && temBoleto) { label = 'Comprovante pendente'; tone = 'warn'; }
    else { label = 'Documentação parcial'; tone = 'warn'; }
    return { docs, temNf, temBoleto, temComprovante, label, tone };
  };

  const totalPedidos = load.orderIds.length;
  const comComprovante = load.orderIds.filter((id) => (docsByPedido.get(id) ?? []).some((d) => d.tipo.startsWith('comprovante'))).length;
  // Pedidos com documentação incompleta (falta NF, boleto ou comprovante).
  const pedidosComPendencia = load.orderIds.filter((id) => {
    const s = situacaoPedido(id);
    return !(s.temNf && s.temBoleto && s.temComprovante);
  });

  useEffect(() => {
    if (!load.orderIds.length || !supabasePedidos) return;
    setLoadingDetails(true);
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_venda';
    supabasePedidos
      .from(table)
      .select('numero_pedido, cliente_nome, total_pedido_venda, frete')
      .in('numero_pedido', load.orderIds)
      .then(({ data }) => {
        const m = new Map<string, OrderDetail>();
        for (const row of data || []) {
          const orderValue = Number(row.total_pedido_venda ?? 0);
          m.set(String(row.numero_pedido), { clientName: row.cliente_nome || '-', orderValue, freight: row.frete || 0 });
        }
        setOrderDetails(m);
        setLoadingDetails(false);
      });
  }, [load.id]);

  const totalOrderValue = Array.from(orderDetails.values()).reduce((s, d) => s + d.orderValue, 0);
  const grandTotal = totalOrderValue;

  // ── obs ──
  const [obsValue, setObsValue] = useState(load.obs || '');
  const [savingObs, setSavingObs] = useState(false);

  useEffect(() => { setObsValue(load.obs || ''); }, [load.id, load.obs]);

  const saveObs = async () => {
    setSavingObs(true);
    try {
      await onUpdateLoad({ ...load, obs: obsValue });
    } catch (err) {
      console.error('[LoadDetailsPanel] saveObs:', err);
    } finally {
      setSavingObs(false);
    }
  };

  // ── histórico ──
  const [historico, setHistorico] = useState<EmbarqueHistoricoRow[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  useEffect(() => {
    setLoadingHistorico(true);
    listEmbarqueHistorico(load.id).then((rows) => {
      setHistorico(rows);
      setLoadingHistorico(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load.id, load.plannedDate, load.shipmentStatus, load.productionStatus, load.driverId, load.freightValue, load.obs, load.previsaoEntrega, load.realizationDate, load.orderIds.length]);

  // ── justificativas de movimentação ──
  const [moveJustificativas, setMoveJustificativas] = useState<MoveJustificativa[]>([]);

  useEffect(() => {
    if (!supabaseOps || !load.plannedDate) return;
    const date = load.plannedDate.slice(0, 10);
    supabaseOps
      .from('concrem_faturamento_justificativas')
      .select('date, type, related_date, reason, updated_at')
      .or(`date.eq.${date},related_date.eq.${date}`)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (data) setMoveJustificativas(data as MoveJustificativa[]);
      });
  }, [load.id, load.plannedDate]);

  // ── attachments ──
  const [attachments, setAttachments] = useState<LoadAttachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [uploading, setUploading] = useState(false);

  const storagePath = `carregamentos/${load.id}`;

  const fetchAttachments = async () => {
    if (!supabaseOps) return;
    setLoadingAttachments(true);
    const { data } = await supabaseOps.storage.from(STORAGE_BUCKET).list(storagePath, { limit: 50 });
    if (data) {
      const atts: LoadAttachment[] = data
        .filter((f) => f.name !== '.emptyFolderPlaceholder')
        .map((f) => {
          const path = `${storagePath}/${f.name}`;
          const { data: urlData } = supabaseOps!.storage.from(STORAGE_BUCKET).getPublicUrl(path);
          return { name: f.name, path, url: urlData.publicUrl };
        });
      setAttachments(atts);
    }
    setLoadingAttachments(false);
  };

  useEffect(() => { void fetchAttachments(); }, [load.id]);

  const uploadFiles = async (files: FileList | File[]) => {
    if (!supabaseOps || !files.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${storagePath}/${Date.now()}_${safeName}`;
      const { error } = await supabaseOps.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
      if (error) console.error('[upload anexo carregamento]', error.message);
    }
    setUploading(false);
    void fetchAttachments();
  };

  const deleteAttachment = async (att: LoadAttachment) => {
    if (!supabaseOps) return;
    await supabaseOps.storage.from(STORAGE_BUCKET).remove([att.path]);
    setAttachments((prev) => prev.filter((a) => a.path !== att.path));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files);
  };

  const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" aria-hidden />
      <div
        className="relative z-10 w-full max-w-2xl bg-card border-l border-border shadow-2xl flex flex-col h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (fixo) */}
        <div className="px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Truck className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <span className="font-bold text-base text-foreground">Detalhes do Carregamento</span>
                <p className="text-[11px] text-muted-foreground font-mono leading-tight truncate">{load.id} · {driverName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full border ${colorClass}`}>{status}</span>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {/* Abas */}
          <div className="flex gap-1 mt-3">
            {(([['resumo', 'Resumo'], ['pedidos', 'Pedidos'], ['documentos', 'Documentos'], ['historico', 'Histórico']]) as const).map(([k, lbl]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${tab === k ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {lbl}{k === 'documentos' && relDocs.length > 0 ? ` (${relDocs.length})` : ''}
                {k === 'documentos' && !loadingRelDocs && pedidosComPendencia.length > 0 && (
                  <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" title="Documentos pendentes" />
                )}
              </button>
            ))}
          </div>

          {/* Aviso de documentos pendentes (visível em qualquer aba) */}
          {!loadingRelDocs && pedidosComPendencia.length > 0 && (
            <button
              type="button"
              onClick={() => setTab('documentos')}
              className="mt-3 w-full flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-3 py-2 text-left hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            >
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-xs font-semibold text-amber-800 dark:text-amber-200 flex-1">
                {pedidosComPendencia.length} de {totalPedidos} pedido(s) com documentos pendentes
              </span>
              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300 underline shrink-0">ver</span>
            </button>
          )}
        </div>

        {/* Corpo rolável (somente a aba ativa) */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {tab === 'resumo' && (<>
          {/* Status + prioridade */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full border ${colorClass}`}>{status}</span>
            {(() => { const n = getLoadPriorityNivel(load, prioMap); return n ? <PrioridadeBadge nivel={n as any} /> : null; })()}
          </div>
          {/* Documentação da entrega */}
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-1">Documentação da entrega</p>
            <p className="text-sm font-semibold text-foreground">
              {comComprovante} de {totalPedidos} pedido(s) com comprovante
            </p>
          </div>

          {/* Driver + Creator */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Motorista</p>
                <p className="text-sm font-semibold text-foreground">{driverName}</p>
              </div>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Criado por</p>
              <p className="text-sm font-semibold text-foreground">{load.createdBy || '-'}</p>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Data Prevista</p>
                <p className="text-sm font-semibold text-foreground">{fmtDate(load.plannedDate)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CalendarCheck className={`h-4 w-4 mt-0.5 shrink-0 ${load.realizationDate ? 'text-emerald-600' : 'text-muted-foreground/40'}`} />
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Realização</p>
                {load.realizationDate
                  ? <p className="text-sm font-semibold text-foreground">{fmtDate(load.realizationDate)}</p>
                  : <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wide">Sem data determinada</p>
                }
              </div>
            </div>
          </div>

          {/* Summary chips */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-lg font-bold text-foreground">{load.orderIds.length}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pedidos</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-sm font-bold text-foreground">{formatCurrency(load.freightValue || 0)}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Frete</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-sm font-bold text-foreground">{((load.estimatedWeight || 0) / 1000).toFixed(1)}t</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Peso</p>
            </div>
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-center">
              <p className="text-sm font-bold text-primary">
                {loadingDetails ? '...' : formatCurrency(grandTotal)}
              </p>
              <p className="text-[10px] text-primary/70 uppercase tracking-wide">Total</p>
            </div>
          </div>
          </>)}

          {tab === 'pedidos' && (load.orderIds.length > 0 ? (
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-2 flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" /> Pedidos
              </p>
              {loadingDetails ? (
                <div className="text-xs text-muted-foreground animate-pulse py-2">Carregando detalhes...</div>
              ) : (
                <div className="space-y-2">
                  {load.orderIds.map((id) => {
                    const detail = orderDetails.get(id);
                    return (
                      <div key={id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-bold font-mono-data text-foreground">{id}</p>
                            {(() => { const n = prioMap.get(id)?.nivel; return n ? <PrioridadeBadge nivel={n as any} /> : null; })()}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{detail?.clientName || '-'}</p>
                          {(() => { const s = situacaoPedido(id); return (
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="text-[10px] text-muted-foreground">{s.docs.length} documento(s)</span>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${s.tone === 'ok' ? 'text-emerald-600 bg-emerald-500/10' : s.tone === 'warn' ? 'text-amber-600 bg-amber-500/10' : 'text-muted-foreground bg-muted'}`}>{s.label}</span>
                            </div>
                          ); })()}
                        </div>
                        {detail && (
                          <div className="text-right shrink-0">
                            <p className="text-xs font-semibold text-foreground">{formatCurrency(detail.orderValue)}</p>
                            {detail.freight > 0 && (
                              <p className="text-[10px] text-muted-foreground">(inclui {formatCurrency(detail.freight)} frete)</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum pedido neste carregamento.</p>
          ))}

          {tab === 'resumo' && (<>
          {/* ── Observações ── */}
          <div className="border-t border-border pt-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-2">
              Observações
            </p>
            <textarea
              value={obsValue}
              onChange={(e) => setObsValue(e.target.value)}
              placeholder="Adicione uma observação sobre este carregamento..."
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-colors"
            />
            {obsValue !== (load.obs || '') && (
              <button
                onClick={saveObs}
                disabled={savingObs}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Save className="h-3 w-3" />
                {savingObs ? 'Salvando...' : 'Salvar observação'}
              </button>
            )}
          </div>
          </>)}

          {tab === 'documentos' && (<>
          {/* Documentos por pedido (NF / Boleto / Comprovante) */}
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-2">Documentos por pedido</p>
            {loadingRelDocs ? (
              <p className="text-xs text-muted-foreground animate-pulse py-2">Carregando documentos...</p>
            ) : load.orderIds.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60 text-center py-4">Sem pedidos.</p>
            ) : (
              <div className="space-y-3">
                {load.orderIds.map((pid) => {
                  const sit = situacaoPedido(pid);
                  const detail = orderDetails.get(pid);
                  const open = openDocs.has(pid);
                  return (
                    <div key={pid} className="rounded-lg border border-border bg-muted/10 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleDocPedido(pid)}
                        aria-expanded={open}
                        className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                          <div className="min-w-0">
                            <p className="text-xs font-bold font-mono-data text-foreground">{pid}</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {detail?.clientName || '-'} · {sit.docs.length} documento(s)
                            </p>
                          </div>
                        </div>
                        <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sit.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : sit.tone === 'warn' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : 'bg-muted text-muted-foreground border-border'}`}>
                          {sit.tone === 'ok' ? <FileCheck2 className="h-3 w-3" /> : sit.tone === 'warn' ? <Clock className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                          {sit.label}
                        </span>
                      </button>
                      {open && (
                        <div className="px-3 pb-3">
                          {sit.docs.length > 0 ? (
                            <div className="space-y-1.5">
                              {sit.docs.map((d) => (
                                <DocRow key={d.id} doc={d} label={tipoDocLabel(d.tipo)} onPreview={() => setPreviewDoc(d)} />
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted-foreground/60">Nenhum documento anexado a este pedido.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Anexos (do carregamento) ── */}
          <div className="border-t border-border pt-4 pb-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5" /> Anexos
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !supabaseOps}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-40"
              >
                <Upload className="h-3 w-3" />
                {uploading ? 'Enviando...' : 'Adicionar'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={(e) => e.target.files && void uploadFiles(e.target.files)}
              />
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-lg border-2 border-dashed px-4 py-3 text-center cursor-pointer transition-colors ${
                dragActive
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground/50 hover:border-primary/40 hover:bg-muted/30'
              }`}
            >
              <p className="text-xs">{dragActive ? 'Solte os arquivos aqui' : 'Arraste arquivos ou clique para selecionar'}</p>
              <p className="text-[10px] mt-0.5 opacity-70">Imagens, PDF, Word, Excel</p>
            </div>

            {/* Files list */}
            {loadingAttachments ? (
              <div className="text-xs text-muted-foreground animate-pulse mt-3">Carregando anexos...</div>
            ) : attachments.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                {attachments.map((att) => (
                  <div key={att.path} className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
                    {isImage(att.name) ? (
                      <img src={att.url} alt={att.name} className="w-8 h-8 rounded object-cover shrink-0 border border-border" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    )}
                    <span className="flex-1 text-xs text-foreground truncate min-w-0">{att.name.replace(/^\d+_/, '')}</span>
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    {canEdit && (
                      <button
                        onClick={() => void deleteAttachment(att)}
                        className="shrink-0 p-1 rounded hover:bg-red-100 transition-colors text-muted-foreground hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground/50 text-center">Nenhum anexo ainda.</p>
            )}
          </div>
          </>)}

          {tab === 'historico' && (
          <div className="pt-1 pb-2">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> Histórico
          </p>
          {loadingHistorico ? (
            <p className="text-xs text-muted-foreground animate-pulse">Carregando histórico...</p>
          ) : historico.length === 0 && moveJustificativas.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/50 text-center">Nenhuma movimentação registrada.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">

              {/* Entradas do histórico normal */}
              {historico.map((h) => (
                <div key={h.id} className="flex items-start gap-2 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/50 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-medium text-foreground">
                        {h.acao === 'criado' ? 'Criado' :
                         h.acao === 'status_alterado' ? h.campo :
                         h.acao === 'motorista_alterado' ? 'Motorista alterado' :
                         h.acao === 'pedidos_alterados' ? h.campo :
                         h.acao === 'data_alterada' ? h.campo :
                         h.acao === 'frete_alterado' ? 'Frete alterado' :
                         h.acao === 'obs_alterada' ? 'Observação' : h.acao}
                      </span>
                      {h.acao !== 'criado' && h.valor_anterior && (
                        <span className="text-muted-foreground line-through">{h.valor_anterior}</span>
                      )}
                      {h.acao !== 'criado' && h.valor_novo && (
                        <>
                          {h.valor_anterior && <span className="text-muted-foreground">→</span>}
                          <span className="text-primary font-medium">{h.valor_novo}</span>
                        </>
                      )}
                    </div>
                    <p className="text-muted-foreground/70 text-[10px] mt-0.5">
                      {fmtDateTime(h.criado_em)}{h.alterado_por ? ` · ${h.alterado_por}` : ''}
                    </p>
                  </div>
                </div>
              ))}

              {/* Separador visual apenas quando ambas as listas têm entradas */}
              {moveJustificativas.length > 0 && historico.length > 0 && (
                <div className="h-px bg-border my-1" />
              )}

              {/* Justificativas de movimentação */}
              {moveJustificativas.map((j) => {
                const isOrigin  = j.date === load.plannedDate?.slice(0, 10);
                const typeLabel = JUST_TYPE_LABEL[j.type] ?? j.type;
                const typeColor = JUST_TYPE_COLOR[j.type] ?? 'text-muted-foreground';
                return (
                  <div key={`${j.date}-${j.type}`} className="flex items-start gap-2 text-xs">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                      j.type === 'adiamento'    ? 'bg-amber-400'   :
                      j.type === 'antecipacao'  ? 'bg-blue-400'    :
                      j.type === 'recuperado'   ? 'bg-emerald-400' :
                      j.type === 'cancelamento' ? 'bg-red-400'     : 'bg-gray-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`font-semibold ${typeColor}`}>{typeLabel}</span>
                        {isOrigin ? (
                          <span className="text-[10px] text-muted-foreground">
                            (de {fmtDate(j.date)}{j.related_date ? ` → ${fmtDate(j.related_date)}` : ''})
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            (veio de {fmtDate(j.date)}{j.related_date ? ` → ${fmtDate(j.related_date)}` : ''})
                          </span>
                        )}
                      </div>
                      <p className="text-foreground/80 text-[11px] mt-0.5 leading-relaxed">{j.reason}</p>
                      <p className="text-muted-foreground/60 text-[10px] mt-0.5">
                        {j.updated_at ? fmtDateTime(j.updated_at) : ''}
                      </p>
                    </div>
                  </div>
                );
              })}

            </div>
          )}
          </div>
          )}
        </div>

        {/* Footer (fixo) */}
        {canEdit && (
          <div className="px-5 py-4 border-t border-border shrink-0">
            <button
              onClick={onEdit}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Editar Carregamento
            </button>
          </div>
        )}

        {/* Modal de visualização de documento (sobre o drawer, sem 2º drawer) */}
        {previewDoc && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60" onClick={() => setPreviewDoc(null)}>
            <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{tipoDocLabel(previewDoc.tipo)}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {previewDoc.pedido_id} · {(previewDoc.arquivo_nome || '').replace(/^\d+_/, '')}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a href={previewDoc.arquivo_url} target="_blank" rel="noopener noreferrer" title="Abrir em nova aba" className="p-1.5 rounded hover:bg-muted text-muted-foreground"><ExternalLink className="h-4 w-4" /></a>
                  <a href={previewDoc.arquivo_url} download target="_blank" rel="noopener noreferrer" title="Baixar" className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Download className="h-4 w-4" /></a>
                  <button onClick={() => setPreviewDoc(null)} title="Fechar" className="p-1.5 rounded hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="flex-1 overflow-auto bg-muted/20 flex items-center justify-center min-h-[300px]">
                {isImage(previewDoc.arquivo_nome) ? (
                  <img src={previewDoc.arquivo_url} alt={previewDoc.arquivo_nome} className="max-w-full max-h-[75vh] object-contain" />
                ) : /\.pdf$/i.test(previewDoc.arquivo_nome) ? (
                  <iframe src={previewDoc.arquivo_url} title="Documento" className="w-full h-[75vh] border-0" />
                ) : (
                  <div className="text-center p-8">
                    <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">Pré-visualização não disponível para este formato.</p>
                    <a href={previewDoc.arquivo_url} download target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"><Download className="h-4 w-4" /> Baixar arquivo</a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

const CarregamentoDashboard = () => {
  const { loads, drivers, user, updateLoad } = useApp();
  const { map: prioMap } = usePrioridades();
  const navigate = useNavigate();
  const today = todayBR();

  const canEditLoad = useMemo(() => {
    if (!user) return false;
    if (user.funcionalidades) return canFazer(user.funcionalidades, 'carregamento.criar_editar');
    return canDo(user.role as UserRole, user.permissions ?? null, 'programacao', 'edit');
  }, [user]);

  const [view, setView] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('cronograma_view') as ViewMode | null;
    return saved && ['semana', 'mes', 'lista'].includes(saved) ? saved : 'semana';
  });
  const setViewPersisted = (v: ViewMode) => { setView(v); localStorage.setItem('cronograma_view', v); };

  type DateMode = 'programado' | 'realizado';
  const [dateMode, setDateMode] = useState<DateMode>(() =>
    localStorage.getItem('cronograma_datemode') === 'realizado' ? 'realizado' : 'programado'
  );
  const setDateModePersisted = (m: DateMode) => { setDateMode(m); localStorage.setItem('cronograma_datemode', m); };

  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const toggleStatus = (s: string) => setStatusFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [anchor, setAnchor] = useState(today);
  const [pedidoFilter, setPedidoFilter] = useState('');
  const [selectedLoad, setSelectedLoad] = useState<Load | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  // ── Modal de justificativa de movimentação ──
  type PendingMove = {
    loadId:         string;
    fromDate:       string;
    toDate:         string;
    type:           MoveJustType;
    driverConflict: boolean;
  };
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [moveReason,  setMoveReason]  = useState('');
  const [moveSaving,  setMoveSaving]  = useState(false);

  // ── mobile detection ──
  const [windowWidth, setWindowWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1024);
  useEffect(() => {
    const handle = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);
  const isMobile = windowWidth < 640;

  const driverMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of drivers) m.set(d.id, d.name);
    return m;
  }, [drivers]);

  // ── week view ──
  const weekStart = useMemo(() => mondayOfWeek(anchor), [anchor]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  // Mobile: show only 3 days centered on anchor
  const mobileDays = useMemo(() => [-1, 0, 1].map(offset => addDays(anchor, offset)), [anchor]);
  const visibleWeekDays = isMobile ? mobileDays : weekDays;

  // ── month view ──
  const monthStr = useMemo(() => anchor.slice(0, 7), [anchor]);
  const monthFirst = useMemo(() => firstDayOfMonth(anchor), [anchor]);
  const calendarCells = useMemo(() => {
    const first = parseISO(monthFirst);
    const startDay = first.getDay();
    const startOffset = startDay === 0 ? 6 : startDay - 1;
    const total = daysInMonth(monthFirst);
    const cells: string[] = [];
    for (let i = startOffset; i > 0; i--) cells.push(addDays(monthFirst, -i));
    for (let i = 0; i < total; i++) cells.push(addDays(monthFirst, i));
    while (cells.length % 7 !== 0) cells.push(addDays(cells[cells.length - 1], 1));
    return cells;
  }, [monthFirst]);

  // ── filtered loads ──
  const filteredLoads = useMemo(() => {
    return loads.filter((l) => {
      const q = pedidoFilter.trim();
      if (q && !l.orderIds.some(id => id.includes(q))) return false;
      if (statusFilter.length > 0 && !statusFilter.includes(l.shipmentStatus)) return false;
      if (dateMode === 'realizado' && !l.realizationDate) return false;
      const dateKey = (dateMode === 'realizado' ? l.realizationDate : l.plannedDate)?.slice(0, 10) ?? '';
      if (dateFrom && dateKey && dateKey < dateFrom) return false;
      if (dateTo && dateKey && dateKey > dateTo) return false;
      return true;
    });
  }, [loads, pedidoFilter, statusFilter, dateMode, dateFrom, dateTo]);

  // ── loads by date ──
  const loadsByDate = useMemo(() => {
    const m = new Map<string, Load[]>();
    for (const l of filteredLoads) {
      const d = (dateMode === 'realizado' ? l.realizationDate : l.plannedDate)?.slice(0, 10);
      if (!d) continue;
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(l);
    }
    return m;
  }, [filteredLoads, dateMode]);

  // Mapa não filtrado — usado para cálculos de meta (independente de filtros de UI)
  const loadsAllByDate = useMemo(() => {
    const m = new Map<string, Load[]>();
    for (const l of loads) {
      const d = l.plannedDate?.slice(0, 10);
      if (!d) continue;
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(l);
    }
    return m;
  }, [loads]);

  // ── list view ──
  const listDates = useMemo(() => Array.from(loadsByDate.keys()).sort(), [loadsByDate]);

  // ── drag and drop ──
  const generateDayPdf = async (dateStr: string) => {
    const dayLoads = loadsByDate.get(dateStr) || [];
    if (!dayLoads.length) return;
    const logoDataUrl = await getLogoDataUrl();
    const [y, m, d] = dateStr.split('-');
    const dateLabel = `${d}/${m}/${y}`;

    const tableRows = dayLoads.map((l) => {
      const driverName = (driverMap.get(l.driverId) || 'Sem motorista').toUpperCase();
      return l.orderIds.map((orderId, i) => {
        const det = weekOrderDetailsMap.get(orderId);
        const val = weekOrderValueMap.get(orderId) || 0;
        return `<tr>
          ${i === 0 ? `<td rowspan="${l.orderIds.length}" class="load-id">${l.id}</td>` : ''}
          ${i === 0 ? `<td rowspan="${l.orderIds.length}" class="driver">${driverName}</td>` : ''}
          <td>${det?.uf ?? '-'}</td>
          <td>${orderId}</td>
          <td class="left">${det?.company ?? orderId}</td>
          <td class="right">${formatCurrency(val)}</td>
        </tr>`;
      }).join('');
    }).join('');

    const totalGeral = dayLoads.reduce((s, l) =>
      s + l.orderIds.reduce((a, id) => a + (weekOrderValueMap.get(id) || 0), 0), 0);

    const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>EMBARQUES ${dateLabel}</title>
<style>
  @page{size:A4;margin:10mm 12mm}*{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#000;font-size:10px}
  .header{display:flex;align-items:center;border:2px solid #000;margin-bottom:0}
  .header-logo{padding:8px 14px;border-right:2px solid #000;display:flex;align-items:center}
  .header-logo img{height:48px}
  .header-title{flex:1;text-align:center;padding:8px 14px}
  .header-title h1{font-size:13px;font-weight:900;letter-spacing:.5px;margin:0}
  table{width:100%;border-collapse:collapse;font-size:10px;text-transform:uppercase}
  th,td{border:1px solid #000;padding:5px 6px}
  th{font-weight:900;background:#e8e8e8;text-align:center;font-size:9px}
  td{text-align:center;vertical-align:middle}
  td.driver{font-weight:700;text-align:center;vertical-align:middle;font-size:9px}
  td.load-id{font-weight:900;text-align:center;vertical-align:middle;font-size:9px;color:#1a56db}
  .right{text-align:right!important}.left{text-align:left!important}
  tr.total-row td{font-weight:900;background:#f0f0f0;break-before:avoid}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="header">
  <div class="header-logo">${logoDataUrl ? `<img src="${logoDataUrl}" alt="CONCREM"/>` : '<strong style="font-size:18px;">CONCREM</strong>'}</div>
  <div class="header-title"><h1>RELATÓRIO DE EMBARQUES — ${dateLabel}<br/>CONCREM INDUSTRIAL LTDA</h1></div>
</div>
<table>
  <thead><tr>
    <th style="width:10%">CARREGAMENTO</th>
    <th style="width:13%">MOTORISTA</th>
    <th style="width:4%">UF</th>
    <th style="width:8%">Nº PEDIDO</th>
    <th style="width:52%">EMPRESA</th>
    <th style="width:13%">VALOR</th>
  </tr></thead>
  <tbody>
    ${tableRows}
    <tr class="total-row"><td colspan="5" class="right">TOTAL</td><td class="right">${formatCurrency(totalGeral)}</td></tr>
  </tbody>
</table>
<script>window.onload=()=>{window.focus();window.print();};</script>
</body></html>`;

    const w = window.open('', 'embarques_dia', 'width=1000,height=700,scrollbars=yes,resizable=yes');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const handleDropLoad = async (loadId: string, newDate: string) => {
    const load = loads.find((l) => l.id === loadId);
    if (!load) return;
    const fromDate = load.plannedDate?.slice(0, 10) ?? '';
    if (fromDate === newDate) return;

    const moveType: MoveJustType = newDate > fromDate ? 'adiamento' : 'antecipacao';

    const loadsOnDestDay = loadsByDate.get(newDate) ?? [];
    const driverConflict = loadsOnDestDay.some(
      (l) => l.driverId === load.driverId && l.id !== load.id
    );

    setMoveReason('');
    setPendingMove({ loadId, fromDate, toDate: newDate, type: moveType, driverConflict });
  };

  const handleConfirmMove = async () => {
    if (!pendingMove || !moveReason.trim()) return;
    setMoveSaving(true);
    try {
      const load = loads.find((l) => l.id === pendingMove.loadId);
      if (!load) return;

      await updateLoad({ ...load, plannedDate: pendingMove.toDate });

      if (supabaseOps) {
        await supabaseOps
          .from('concrem_faturamento_justificativas')
          .upsert(
            {
              date:         pendingMove.fromDate,
              type:         pendingMove.type,
              related_date: pendingMove.toDate,
              reason:       moveReason.trim(),
              updated_at:   new Date().toISOString(),
            },
            { onConflict: 'date' }
          );
      }

      setPendingMove(null);
      setMoveReason('');
    } catch (err: any) {
      console.error('[handleConfirmMove]', err);
    } finally {
      setMoveSaving(false);
    }
  };

  const handleCancelMove = () => {
    setPendingMove(null);
    setMoveReason('');
  };

  // ── navigation ──
  function prev() {
    if (view === 'semana' && isMobile) { setAnchor(addDays(anchor, -1)); return; }
    if (view === 'semana') setAnchor(addDays(weekStart, -7));
    else if (view === 'mes') setAnchor(addMonths(monthFirst, -1));
    else setAnchor(addDays(anchor, -30));
  }
  function next() {
    if (view === 'semana' && isMobile) { setAnchor(addDays(anchor, 1)); return; }
    if (view === 'semana') setAnchor(addDays(weekStart, 7));
    else if (view === 'mes') setAnchor(addMonths(monthFirst, 1));
    else setAnchor(addDays(anchor, 30));
  }
  function goToday() { setAnchor(today); }

  function periodLabel() {
    if (view === 'semana') {
      if (isMobile) {
        const d = parseISO(anchor);
        return `${DAYS_BR[d.getDay()]}, ${d.getDate()} ${MONTHS_BR[d.getMonth()].slice(0, 3)}`;
      }
      const from = parseISO(weekStart);
      const to = parseISO(addDays(weekStart, 6));
      if (from.getMonth() === to.getMonth()) {
        return `${from.getDate()} – ${to.getDate()} de ${MONTHS_BR[from.getMonth()]} ${from.getFullYear()}`;
      }
      return `${from.getDate()} ${MONTHS_BR[from.getMonth()].slice(0, 3)} – ${to.getDate()} ${MONTHS_BR[to.getMonth()].slice(0, 3)} ${to.getFullYear()}`;
    }
    if (view === 'mes') {
      const d = parseISO(monthFirst);
      return `${MONTHS_BR[d.getMonth()]} ${d.getFullYear()}`;
    }
    return 'Todos os carregamentos';
  }

  // ── week order values ──
  const [weekOrderValueMap, setWeekOrderValueMap] = useState<Map<string, number>>(new Map());
  const [weekOrderDetailsMap, setWeekOrderDetailsMap] = useState<Map<string, { company: string; uf: string }>>(new Map());
  const lastFetchKey = useRef('');

  const weekOrderIds = useMemo(() => {
    const wLoads = weekDays.flatMap((d) => loadsByDate.get(d) || []);
    return [...new Set(wLoads.flatMap((l) => l.orderIds))];
  }, [weekDays, loadsByDate]);

  useEffect(() => {
    const fetchKey = weekOrderIds.join(',');
    if (!fetchKey || fetchKey === lastFetchKey.current || !supabasePedidos) return;
    lastFetchKey.current = fetchKey;
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_venda';
    const BATCH = 200;
    const chunks: string[][] = [];
    for (let i = 0; i < weekOrderIds.length; i += BATCH) chunks.push(weekOrderIds.slice(i, i + BATCH));
    Promise.all(chunks.map((batch) =>
      supabasePedidos!.from(table).select('numero_pedido, total_pedido_venda, id_nota_conf, cliente_nome, cliente_uf').in('numero_pedido', batch).then(({ data }) => data || [])
    )).then((results) => {
      const vm = new Map<string, number>();
      const dm = new Map<string, { company: string; uf: string }>();
      for (const row of results.flat()) {
        const id = String(row.numero_pedido);
        vm.set(id, getValorTotalPedido(row));
        dm.set(id, { company: (row.cliente_nome || '-').toUpperCase(), uf: (row.cliente_uf || '-').toUpperCase() });
      }
      setWeekOrderValueMap(vm);
      setWeekOrderDetailsMap(dm);
    }).catch((err) => console.error('[CarregamentoDashboard] weekOrderValues:', err));
  }, [weekOrderIds]);

  const weekTotals = useMemo(() => {
    const wLoads = weekDays.flatMap((d) => loadsByDate.get(d) || []);
    return {
      count: wLoads.length,
      freight: wLoads.reduce((s, l) => s + (l.freightValue || 0), 0),
      orders: wLoads.reduce((s, l) => s + l.orderIds.length, 0),
      total: wLoads.reduce((s, l) => s + l.orderIds.reduce((a, id) => a + (weekOrderValueMap.get(id) || 0), 0), 0),
    };
  }, [weekDays, loadsByDate, weekOrderValueMap]);

  // ── month order values ──
  const [monthOrderValueMap, setMonthOrderValueMap] = useState<Map<string, number>>(new Map());
  const lastMonthFetchKey = useRef('');

  const monthOrderIds = useMemo(() => {
    const mLoads = calendarCells.filter((d) => d.startsWith(monthStr)).flatMap((d) => loadsByDate.get(d) || []);
    return [...new Set(mLoads.flatMap((l) => l.orderIds))];
  }, [calendarCells, monthStr, loadsByDate]);

  useEffect(() => {
    const fetchKey = monthOrderIds.join(',');
    if (!fetchKey || fetchKey === lastMonthFetchKey.current || !supabasePedidos) return;
    lastMonthFetchKey.current = fetchKey;
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_venda';
    const BATCH = 200;
    const chunks: string[][] = [];
    for (let i = 0; i < monthOrderIds.length; i += BATCH) chunks.push(monthOrderIds.slice(i, i + BATCH));
    Promise.all(chunks.map((batch) =>
      supabasePedidos!.from(table).select('numero_pedido, total_pedido_venda, id_nota_conf').in('numero_pedido', batch).then(({ data }) => data || [])
    )).then((results) => {
      const m = new Map<string, number>();
      for (const row of results.flat()) {
        m.set(String(row.numero_pedido), getValorTotalPedido(row));
      }
      setMonthOrderValueMap(m);
    }).catch((err) => console.error('[CarregamentoDashboard] monthOrderValues:', err));
  }, [monthOrderIds]);

  const monthTotals = useMemo(() => {
    const mLoads = calendarCells.filter((d) => d.startsWith(monthStr)).flatMap((d) => loadsByDate.get(d) || []);
    return {
      count: mLoads.length,
      orders: mLoads.reduce((s, l) => s + l.orderIds.length, 0),
      total: mLoads.reduce((s, l) => s + l.orderIds.reduce((a, id) => a + (monthOrderValueMap.get(id) || 0), 0), 0),
    };
  }, [calendarCells, monthStr, loadsByDate, monthOrderValueMap]);

  // ── list order values ──
  const [listOrderValueMap, setListOrderValueMap] = useState<Map<string, number>>(new Map());
  const lastListFetchKey = useRef('');

  const listOrderIds = useMemo(() => {
    const lLoads = listDates.flatMap((d) => loadsByDate.get(d) || []);
    return [...new Set(lLoads.flatMap((l) => l.orderIds))];
  }, [listDates, loadsByDate]);

  useEffect(() => {
    if (view !== 'lista') return;
    const fetchKey = listOrderIds.join(',');
    if (!fetchKey || fetchKey === lastListFetchKey.current || !supabasePedidos) return;
    lastListFetchKey.current = fetchKey;
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_venda';
    const BATCH = 200;
    const chunks: string[][] = [];
    for (let i = 0; i < listOrderIds.length; i += BATCH) chunks.push(listOrderIds.slice(i, i + BATCH));
    Promise.all(chunks.map((batch) =>
      supabasePedidos!.from(table).select('numero_pedido, total_pedido_venda, id_nota_conf').in('numero_pedido', batch).then(({ data }) => data || [])
    )).then((results) => {
      const m = new Map<string, number>();
      for (const row of results.flat()) {
        m.set(String(row.numero_pedido), getValorTotalPedido(row));
      }
      setListOrderValueMap(m);
    }).catch((err) => console.error('[CarregamentoDashboard] listOrderValues:', err));
  }, [listOrderIds, view]);

  // ── order → cliente (para o tooltip dos cards de carregamento) ──
  const [orderClientMap, setOrderClientMap] = useState<Map<string, string>>(new Map());
  const lastClientFetchKey = useRef('');
  const allLoadOrderIds = useMemo(
    () => [...new Set(loads.flatMap((l) => l.orderIds))],
    [loads],
  );
  useEffect(() => {
    const fetchKey = allLoadOrderIds.join(',');
    if (!fetchKey || fetchKey === lastClientFetchKey.current || !supabasePedidos) return;
    lastClientFetchKey.current = fetchKey;
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_venda';
    const BATCH = 200;
    const chunks: string[][] = [];
    for (let i = 0; i < allLoadOrderIds.length; i += BATCH) chunks.push(allLoadOrderIds.slice(i, i + BATCH));
    Promise.all(chunks.map((batch) =>
      supabasePedidos!.from(table).select('numero_pedido, cliente_nome').in('numero_pedido', batch).then(({ data }) => data || [])
    )).then((results) => {
      const m = new Map<string, string>();
      for (const row of results.flat()) m.set(String(row.numero_pedido), row.cliente_nome || '—');
      setOrderClientMap(m);
    }).catch((err) => console.error('[CarregamentoDashboard] orderClientMap:', err));
  }, [allLoadOrderIds]);

  // ── Estado da meta ──
  const [monthGoal, setMonthGoal] = useState<MonthGoal | null>(null);
  const [justDates, setJustDates] = useState<{ date: string; type: string }[]>([]);
  const [programacao, setProgramacao] = useState<ProgramacaoMesResult | null>(null);

  useEffect(() => {
    fetchGoalForMonth(monthStr).then(setMonthGoal);
    fetchJustificativasForMonth(monthStr).then(setJustDates);
  }, [monthStr]);

  useEffect(() => {
    if (!monthGoal) { setProgramacao(null); return; }
    fetchProgramacaoMes(monthStr, monthGoal.goalValue).then(setProgramacao);
  }, [monthStr, monthGoal]);

  // ── keep selectedLoad in sync with updated loads state ──
  useEffect(() => {
    if (!selectedLoad) return;
    const updated = loads.find((l) => l.id === selectedLoad.id);
    if (updated) setSelectedLoad(updated);
  }, [loads]);

  // ── Cálculos de meta por visualização ──────────────────────────────────────
  const goalBanner = useMemo(() => {
    if (!monthGoal) return null;

    const today = todayBR();
    const { goalValue, workingDays } = monthGoal;
    const [y, m] = monthGoal.month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const lastDayStr = `${monthGoal.month}-${String(lastDay).padStart(2, '0')}`;

    // Dias perdidos = dias úteis passados sem carregamento e sem antecipação/recuperação
    const exemptTypes = new Set(['antecipacao', 'antecipado_saiu', 'recuperado']);
    let lostDays = 0;
    let cur = `${monthGoal.month}-01`;
    while (cur < today && cur <= lastDayStr) {
      const d = new Date(cur + 'T12:00:00');
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      if (!isWeekend) {
        const hasLoad = (loadsAllByDate.get(cur) || []).length > 0;
        const just = justDates.find(j => j.date === cur);
        if (!hasLoad && !(just && exemptTypes.has(just.type))) lostDays++;
      }
      const next = new Date(d); next.setDate(next.getDate() + 1);
      cur = next.toISOString().slice(0, 10);
    }

    // Faturado e programado no mês
    // Faturado: só conta datas passadas + hoje (igual ao Dashboard Stats)
    // Programado: conta todas as datas do mês (incluindo futuras)
    let billedMonth = 0;
    let programmedMonth = 0;
    for (let d = `${monthGoal.month}-01`; d <= lastDayStr; ) {
      for (const l of loadsAllByDate.get(d) || []) {
        if (l.shipmentStatus === 'Cancelado') continue;
        const val = loadRealValue(l, monthOrderValueMap);
        if (isFaturadoStatus(l.shipmentStatus)) {
          if (d <= today) billedMonth += val;
        } else if (isProgramadoStatus(l.shipmentStatus)) {
          programmedMonth += val;
        }
      }
      const next = new Date(d + 'T12:00:00'); next.setDate(next.getDate() + 1);
      d = next.toISOString().slice(0, 10);
    }

    const remaining = Math.max(0, goalValue - billedMonth);

    // Dias úteis restantes a partir de hoje (inclusive)
    let remainingWorkDays = 0;
    cur = today;
    while (cur <= lastDayStr) {
      const d = new Date(cur + 'T12:00:00');
      if (d.getDay() !== 0 && d.getDay() !== 6) remainingWorkDays++;
      const next = new Date(d); next.setDate(next.getDate() + 1);
      cur = next.toISOString().slice(0, 10);
    }

    const dailyTarget = remainingWorkDays > 0 ? remaining / remainingWorkDays : 0;
    const progressPct = goalValue > 0 ? (billedMonth / goalValue) * 100 : 0;

    // Meta da semana visível
    const weekGoal = (() => {
      if (view !== 'semana') return null;
      const wDays = visibleWeekDays.filter(d => {
        const wd = new Date(d + 'T12:00:00').getDay();
        return wd !== 0 && wd !== 6;
      });
      if (wDays.length === 0) return null;
      const wTarget = dailyTarget * wDays.length;
      const wBilled = wDays.reduce((s, d) => {
        const dl = loadsByDate.get(d) || [];
        return s + dl
          .filter(l => isFaturadoStatus(l.shipmentStatus))
          .reduce((a, l) => a + loadRealValue(l, weekOrderValueMap), 0);
      }, 0);
      const wProgrammed = wDays.reduce((s, d) => {
        const dl = loadsByDate.get(d) || [];
        return s + dl
          .filter(l => isProgramadoStatus(l.shipmentStatus) || !l.shipmentStatus)
          .reduce((a, l) => a + loadRealValue(l, weekOrderValueMap), 0);
      }, 0);
      return { target: wTarget, billed: wBilled, programmed: wProgrammed, days: wDays.length };
    })();

    return {
      goalValue, workingDays, lostDays,
      billedMonth, programmedMonth, remaining,
      remainingWorkDays, dailyTarget, progressPct,
      weekGoal,
    };
  }, [monthGoal, justDates, loadsAllByDate, view, visibleWeekDays, monthOrderValueMap, weekOrderValueMap]);

  const ALL_STATUSES = Object.keys(STATUS_COLORS);
  const hasActiveFilters = statusFilter.length > 0 || dateFrom || dateTo;

  return (
    <div className="space-y-3">
      {/* Toolbar row 1 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(Object.keys(VIEW_LABELS) as ViewMode[]).map((v) => (
            <button key={v} type="button" onClick={() => setViewPersisted(v)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === v ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>

        {view !== 'lista' && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={prev} className="h-7 w-7 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={goToday} className="h-7 px-3 text-xs font-semibold rounded-lg border border-border hover:bg-muted transition-colors">Hoje</button>
            <button type="button" onClick={next} className="h-7 w-7 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="ml-1 text-sm font-semibold text-foreground truncate max-w-[140px] sm:max-w-none">{periodLabel()}</span>
          </div>
        )}

        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input type="text" value={pedidoFilter} onChange={(e) => setPedidoFilter(e.target.value)}
            placeholder="Filtrar por nº pedido..."
            className="pl-8 pr-3 py-1.5 w-32 md:w-48 text-xs rounded-lg border border-input bg-card text-foreground font-display focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" />
        </div>

        {view === 'semana' && weekTotals.count > 0 && (
          <div className="hidden lg:flex gap-2">
            <Chip icon={Truck} value={String(weekTotals.count)} label="carreg." />
            <Chip icon={Package} value={String(weekTotals.orders)} label="pedidos" />
            <Chip icon={DollarSign} value={formatCurrency(weekTotals.total)} label="total" color="text-emerald-600" />
          </div>
        )}

        {view === 'mes' && monthTotals.count > 0 && (
          <div className="hidden md:flex gap-2">
            <Chip icon={Truck} value={String(monthTotals.count)} label="carreg." />
            <Chip icon={Package} value={String(monthTotals.orders)} label="pedidos" />
            <Chip icon={DollarSign} value={formatCurrency(monthTotals.total)} label="total" color="text-emerald-600" />
          </div>
        )}
      </div>

      {/* Toolbar row 2 — filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Date mode toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
          <button type="button" onClick={() => setDateModePersisted('programado')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${dateMode === 'programado' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>
            <Calendar className="h-3.5 w-3.5" />
            Programação
          </button>
          <button type="button" onClick={() => setDateModePersisted('realizado')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${dateMode === 'realizado' ? 'bg-emerald-600 text-white' : 'bg-background text-muted-foreground hover:text-foreground'}`}>
            <CalendarCheck className="h-3.5 w-3.5" />
            Carregados
          </button>
        </div>

        <div className="w-px h-5 bg-border shrink-0" />

        {/* Status chips */}
        {ALL_STATUSES.map((s) => {
          const active = statusFilter.includes(s);
          const dotClass = STATUS_LEFT[s] || 'bg-gray-400';
          return (
            <button key={s} type="button" onClick={() => toggleStatus(s)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold border transition-colors ${active ? 'bg-foreground text-background border-foreground' : 'bg-background text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground'}`}
              title={s}>
              <span className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`} />
              <span className="hidden xl:inline">{s}</span>
            </button>
          );
        })}

        <div className="hidden sm:block w-px h-5 bg-border shrink-0" />

        {/* Date range — hidden on mobile */}
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] font-semibold text-muted-foreground">De</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="h-7 px-2 text-xs rounded-lg border border-input bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" />
          <span className="text-[11px] font-semibold text-muted-foreground">Até</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="h-7 px-2 text-xs rounded-lg border border-input bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors" />
          {hasActiveFilters && (
            <button type="button" onClick={() => { setStatusFilter([]); setDateFrom(''); setDateTo(''); }}
              className="flex items-center gap-1 h-7 px-2 text-[11px] font-semibold text-muted-foreground rounded-lg border border-border hover:bg-muted transition-colors">
              <X className="h-3 w-3" />
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* ── Banner de Meta ── */}
      {goalBanner && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-card">

          {/* Linha superior */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2 shrink-0">
              <Target className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs text-muted-foreground font-semibold">Meta:</span>
              <span className="text-sm font-bold text-foreground">{formatCurrency(goalBanner.goalValue)}</span>
            </div>

            <div className="w-px h-4 bg-border shrink-0 hidden sm:block" />

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-xs text-muted-foreground">Faturado:</span>
              <span className="text-xs font-bold text-emerald-600">{formatCurrency(goalBanner.billedMonth)}</span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
              <span className="text-xs text-muted-foreground">Programado:</span>
              <span className="text-xs font-bold text-amber-600">{formatCurrency(goalBanner.programmedMonth)}</span>
            </div>

            <div className="w-px h-4 bg-border shrink-0 hidden sm:block" />

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-muted-foreground">Restante:</span>
              <span className={`text-xs font-bold ${goalBanner.remaining > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                {goalBanner.remaining > 0 ? formatCurrency(goalBanner.remaining) : '✓ Meta atingida'}
              </span>
            </div>

            {goalBanner.lostDays > 0 && (
              <>
                <div className="w-px h-4 bg-border shrink-0 hidden sm:block" />
                <div className="flex items-center gap-1.5 shrink-0">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  <span className="text-xs font-semibold text-red-600">
                    {goalBanner.lostDays} dia{goalBanner.lostDays > 1 ? 's' : ''} perdido{goalBanner.lostDays > 1 ? 's' : ''}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Barra de progresso */}
          <div className="mt-2.5 space-y-1">
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${goalBanner.progressPct >= 100 ? 'bg-emerald-500' : goalBanner.progressPct >= 70 ? 'bg-primary' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(100, goalBanner.progressPct)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{goalBanner.progressPct.toFixed(1)}% da meta</span>
              <span>
                {goalBanner.remainingWorkDays > 0
                  ? <><>Meta/dia necessária: </><strong className="text-foreground">{formatCurrency(goalBanner.dailyTarget)}</strong><> · {goalBanner.remainingWorkDays} dias úteis restantes</></>
                  : 'Sem dias úteis restantes neste mês'
                }
              </span>
            </div>
          </div>

          {/* Programação × Meta */}
          {programacao && (
            <div className="mt-2.5 pt-2.5 border-t border-border flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Programado:</span>
                <span className="text-xs font-bold text-foreground">
                  {formatCurrency(programacao.totalProgramado)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  ({programacao.totalPedidos} pedidos 307/309)
                </span>
              </div>

              {programacao.gap != null && (
                <div className={`flex items-center gap-1.5 shrink-0 text-xs font-bold ${
                  programacao.gap >= 0 ? 'text-emerald-600' : 'text-red-500'
                }`}>
                  {programacao.gap >= 0
                    ? <><TrendingUp className="h-3.5 w-3.5" /> Folga de {formatCurrency(programacao.gap)} sobre a meta</>
                    : <><AlertTriangle className="h-3.5 w-3.5" /> Faltam {formatCurrency(Math.abs(programacao.gap))} em pedidos programados para cobrir a meta</>
                  }
                </div>
              )}
            </div>
          )}

          {/* Linha inferior — semana */}
          {view === 'semana' && goalBanner.weekGoal && (
            <div className="mt-2.5 pt-2.5 border-t border-border flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Esta semana:</span>
                <span className="text-xs font-bold text-foreground">{formatCurrency(goalBanner.weekGoal.target)}</span>
                <span className="text-[11px] text-muted-foreground">de meta ({goalBanner.weekGoal.days} dias úteis × {formatCurrency(goalBanner.dailyTarget)}/dia)</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-[11px] text-muted-foreground">Faturado:</span>
                <span className="text-xs font-bold text-emerald-600">{formatCurrency(goalBanner.weekGoal.billed)}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="text-[11px] text-muted-foreground">Programado:</span>
                <span className="text-xs font-bold text-amber-600">{formatCurrency(goalBanner.weekGoal.programmed)}</span>
              </div>
              {goalBanner.weekGoal.billed >= goalBanner.weekGoal.target ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Meta da semana atingida ✓
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                  <TrendingDown className="h-3.5 w-3.5" />
                  Faltam {formatCurrency(goalBanner.weekGoal.target - goalBanner.weekGoal.billed)} para bater a meta da semana
                </span>
              )}
            </div>
          )}

          {/* Linha inferior — lista */}
          {view === 'lista' && (
            <div className="mt-2.5 pt-2.5 border-t border-border flex flex-wrap items-center gap-x-5 gap-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Meta por dia útil:</span>
                <span className="text-sm font-bold text-primary">{formatCurrency(goalBanner.dailyTarget)}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Calculada sobre {goalBanner.remainingWorkDays} dias úteis restantes · {formatCurrency(goalBanner.remaining)} ainda a faturar
              </span>
            </div>
          )}

        </div>
      )}

      {/* ── WEEK VIEW ── */}
      {view === 'semana' && (
        <div className={isMobile ? 'rounded-xl border border-border bg-card' : 'overflow-x-auto rounded-xl border border-border bg-card'}>
          <div className={isMobile ? 'grid grid-cols-3 gap-1' : 'grid grid-cols-7 gap-1 min-w-[700px]'}>
            {visibleWeekDays.map((d) => (
              <DayColumn key={d} dateStr={d} loads={loadsByDate.get(d) || []} driverMap={driverMap}
                today={today} canEdit={canEditLoad} prioMap={prioMap} orderValueMap={weekOrderValueMap}
                orderClientMap={orderClientMap}
                onLoadClick={setSelectedLoad} onDropLoad={handleDropLoad}
                dragOverDate={dragOverDate} setDragOverDate={setDragOverDate}
                onExportPdf={generateDayPdf} />
            ))}
          </div>
        </div>
      )}

      {/* ── MONTH VIEW ── */}
      {view === 'mes' && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <div className="min-w-[560px]">
            <div className="grid grid-cols-7 border-b border-border bg-muted/40">
              {DAYS_BR.slice(1).concat(DAYS_BR[0]).map((d) => (
                <div key={d} className="px-1 py-2 text-[10px] font-semibold text-muted-foreground text-center">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarCells.map((d) => (
                <MonthCell key={d} dateStr={d} loads={loadsByDate.get(d) || []} driverMap={driverMap}
                  today={today} currentMonth={monthStr} canEdit={canEditLoad} prioMap={prioMap} orderValueMap={monthOrderValueMap}
                  orderClientMap={orderClientMap}
                  onLoadClick={setSelectedLoad} onDropLoad={handleDropLoad}
                  dragOverDate={dragOverDate} setDragOverDate={setDragOverDate} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {view === 'lista' && (
        <div className="space-y-6">
          {listDates.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-12">Nenhum carregamento cadastrado.</div>
          ) : (
            listDates.map((d) => {
              const dayLoads = loadsByDate.get(d) || [];
              const totalFreight = dayLoads.reduce((s, l) => s + (l.freightValue || 0), 0);
              const totalOrders = dayLoads.reduce((s, l) => s + l.orderIds.length, 0);
              return (
                <div key={d}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`text-sm font-bold ${d === today ? 'text-primary' : 'text-foreground'}`}>
                      {fmtDate(d)}
                      {d === today && <span className="ml-2 text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full">Hoje</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">{dayLoads.length} carreg. · {totalOrders} pedidos · {formatCurrency(totalFreight)}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {dayLoads.map((l) => (
                      <LoadCard key={l.id} load={l} driverName={driverMap.get(l.driverId) || 'Sem motorista'}
                        canEdit={canEditLoad} priorityNivel={getLoadPriorityNivel(l, prioMap)}
                        orderValueMap={listOrderValueMap}
                        orderClientMap={orderClientMap}
                        onClick={() => setSelectedLoad(l)} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Details panel ── */}
      {selectedLoad && (
        <LoadDetailsPanel
          load={selectedLoad}
          driverName={driverMap.get(selectedLoad.driverId) || 'Sem motorista'}
          onClose={() => setSelectedLoad(null)}
          canEdit={canEditLoad}
          onEdit={() => {
            setSelectedLoad(null);
            navigate(`/carregamento/editar/${selectedLoad.id}`, { state: { from: 'cronograma' } });
          }}
          onUpdateLoad={updateLoad}
          prioMap={prioMap}
        />
      )}

      {/* ── Modal de justificativa de movimentação ── */}
      {pendingMove && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={handleCancelMove}
        >
          <div
            className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                  pendingMove.type === 'adiamento' ? 'bg-amber-500/10' : 'bg-blue-500/10'
                }`}>
                  <AlertTriangle className={`h-5 w-5 ${
                    pendingMove.type === 'adiamento' ? 'text-amber-500' : 'text-blue-500'
                  }`} />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {pendingMove.type === 'adiamento' ? 'Adiamento de Carregamento' : 'Antecipação de Carregamento'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(pendingMove.fromDate)} → {fmtDate(pendingMove.toDate)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelMove}
                className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Aviso de conflito de motorista */}
              {pendingMove.driverConflict && (
                <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-red-700 dark:text-red-400">
                      Atenção — motorista já tem carregamento neste dia
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                      O dia de destino ficará marcado com irregularidade por ter 2 carregamentos do mesmo motorista.
                      Confirme apenas se isso for intencional.
                    </p>
                  </div>
                </div>
              )}

              {/* Tipo */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Tipo</p>
                <p className={`text-sm font-semibold px-3 py-1.5 rounded-lg border w-fit ${
                  pendingMove.type === 'adiamento'
                    ? 'text-amber-700 bg-amber-50 border-amber-200'
                    : 'text-blue-700 bg-blue-50 border-blue-200'
                }`}>
                  {MOVE_JUST_LABELS[pendingMove.type]}
                </p>
              </div>

              {/* Motivo */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Motivo <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={moveReason}
                  onChange={(e) => setMoveReason(e.target.value)}
                  rows={3}
                  placeholder="Descreva o motivo da movimentação..."
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                  autoFocus
                />
                {moveReason.trim() === '' && (
                  <p className="text-[11px] text-red-500 mt-1">O motivo é obrigatório para continuar.</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
              <button
                type="button"
                onClick={handleCancelMove}
                className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmMove}
                disabled={moveSaving || !moveReason.trim()}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50 ${
                  pendingMove.driverConflict
                    ? 'bg-amber-600 text-white hover:opacity-90'
                    : 'bg-primary text-primary-foreground hover:opacity-90'
                }`}
              >
                {moveSaving
                  ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  : <Save className="h-3.5 w-3.5" />
                }
                {pendingMove.driverConflict ? 'Confirmar mesmo assim' : 'Confirmar movimentação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function Chip({ icon: Icon, value, label, color = 'text-foreground' }: { icon: React.ElementType; value: string; label: string; color?: string }) {
  return (
    <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-xs font-semibold">
      <Icon className={`h-3 w-3 ${color}`} />
      <span className={color}>{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

export default CarregamentoDashboard;
