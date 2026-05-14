import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { canDo, type UserRole } from '@/utils/access';
import { formatCurrency } from '@/components/shared';
import { todayBR, fmtDate } from '@/lib/dateUtils';
import {
  ChevronLeft, ChevronRight, Truck, Package, DollarSign,
  Search, X, Pencil, Calendar, CalendarCheck, User, FileText,
  Paperclip, Trash2, Upload, Save, ExternalLink,
} from 'lucide-react';
import type { Load } from '@/types';
import { usePrioridades } from '@/contexts/PrioridadesContext';
import { PrioridadeDot, PrioridadeBadge } from '@/components/pedidos/PrioridadeBadge';
import { supabasePedidos, supabaseOps } from '@/lib/supabase';
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
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}

function LoadCard({ load, driverName, compact, canEdit = true, priorityNivel, orderValueMap, onClick, draggable, onDragStart }: LoadCardProps) {
  const status = load.shipmentStatus || 'Aguardando Despacho';
  const colorClass = STATUS_COLORS[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  const leftClass = STATUS_LEFT[status] || 'bg-gray-400';
  const productsValue = orderValueMap
    ? load.orderIds.reduce((s, id) => s + (orderValueMap.get(id) || 0), 0)
    : null;

  if (compact) {
    return (
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-semibold truncate ${colorClass} hover:opacity-80 transition-opacity cursor-pointer select-none`}
        title={`${driverName} — ${formatCurrency(load.freightValue || 0)}`}
        onClick={onClick}
        draggable={draggable}
        onDragStart={onDragStart}
      >
        {priorityNivel && <PrioridadeDot nivel={priorityNivel as any} />}
        <Truck className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">{driverName}</span>
      </div>
    );
  }

  return (
    <div
      className="flex rounded-lg border border-border bg-card overflow-hidden hover:shadow-md transition-shadow group cursor-pointer select-none"
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <div className={`w-1 shrink-0 ${leftClass}`} />
      <div className="flex-1 p-3 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-xs font-semibold truncate text-foreground group-hover:text-primary">{driverName}</span>
          </div>
          <span className={`hidden sm:inline-flex shrink-0 items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${colorClass}`}>{STATUS_ABBR[status] ?? status}</span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {priorityNivel && <span className="flex items-center gap-1"><PrioridadeDot nivel={priorityNivel as any} /></span>}
          <span className="flex items-center gap-1"><Package className="h-3 w-3" />{load.orderIds.length} pedido{load.orderIds.length !== 1 ? 's' : ''}</span>
          <span className="flex items-center gap-1 text-emerald-600 font-semibold">
            <DollarSign className="h-3 w-3" />
            {formatCurrency((productsValue ?? 0) + (load.freightValue || 0))}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── DayColumn ─────────────────────────────────────────────────────────────────

function DayColumn({
  dateStr, loads, driverMap, today, canEdit, prioMap, orderValueMap,
  onLoadClick, onDropLoad, dragOverDate, setDragOverDate,
}: {
  dateStr: string;
  loads: Load[];
  driverMap: Map<string, string>;
  today: string;
  canEdit: boolean;
  prioMap: Map<string, { nivel: string }>;
  orderValueMap?: Map<string, number>;
  onLoadClick: (load: Load) => void;
  onDropLoad: (loadId: string, newDate: string) => void;
  dragOverDate: string | null;
  setDragOverDate: (d: string | null) => void;
}) {
  const d = parseISO(dateStr);
  const dayName = DAYS_BR[d.getDay()];
  const dayNum = d.getDate();
  const isToday = dateStr === today;
  const isDragOver = dragOverDate === dateStr;
  const dayTotal = loads.reduce((s, l) =>
    s + l.orderIds.reduce((a, id) => a + ((orderValueMap?.get(id)) || 0), 0) + (l.freightValue || 0), 0);

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
          <div className="mt-1">
            <div className="text-[9px] font-semibold text-emerald-600">{formatCurrency(dayTotal)}</div>
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
  dateStr, loads, driverMap, today, currentMonth, canEdit, prioMap, orderValueMap,
  onLoadClick, onDropLoad, dragOverDate, setDragOverDate,
}: {
  dateStr: string; loads: Load[]; driverMap: Map<string, string>; today: string;
  currentMonth: string; canEdit: boolean; prioMap: Map<string, { nivel: string }>;
  orderValueMap?: Map<string, number>;
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
    s + l.orderIds.reduce((a, id) => a + ((orderValueMap?.get(id)) || 0), 0) + (l.freightValue || 0), 0);

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

const STORAGE_BUCKET = 'relatorio-entrega';

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

  // ── order details fetch ──
  const [orderDetails, setOrderDetails] = useState<Map<string, OrderDetail>>(new Map());
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    if (!load.orderIds.length || !supabasePedidos) return;
    setLoadingDetails(true);
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
    supabasePedidos
      .from(table)
      .select('numero_pedido, cliente_nome, total_pedido_venda, total_produtos, frete')
      .in('numero_pedido', load.orderIds)
      .then(({ data }) => {
        const m = new Map<string, OrderDetail>();
        for (const row of data || []) {
          const orderValue = (row.total_pedido_venda > 0 ? row.total_pedido_venda : row.total_produtos) || 0;
          m.set(String(row.numero_pedido), { clientName: row.cliente_nome || '-', orderValue, freight: row.frete || 0 });
        }
        setOrderDetails(m);
        setLoadingDetails(false);
      });
  }, [load.id]);

  const totalOrderValue = Array.from(orderDetails.values()).reduce((s, d) => s + d.orderValue, 0);
  const grandTotal = totalOrderValue + (load.freightValue || 0);

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
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" />
            <span className="font-bold text-base text-foreground">Detalhes do Carregamento</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Status + prioridade */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full border ${colorClass}`}>{status}</span>
            {(() => { const n = getLoadPriorityNivel(load, prioMap); return n ? <PrioridadeBadge nivel={n as any} /> : null; })()}
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

          {/* Orders list */}
          {load.orderIds.length > 0 && (
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
                        </div>
                        {detail && (
                          <div className="text-right shrink-0">
                            <p className="text-xs font-semibold text-foreground">{formatCurrency(detail.orderValue)}</p>
                            {detail.freight > 0 && (
                              <p className="text-[10px] text-muted-foreground">+ {formatCurrency(detail.freight)} frete</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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

          {/* ── Anexos ── */}
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
        </div>

        {/* ── Histórico de movimentações ── */}
        <div className="border-t border-border pt-4 pb-2">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> Histórico
          </p>
          {loadingHistorico ? (
            <p className="text-xs text-muted-foreground animate-pulse">Carregando histórico...</p>
          ) : historico.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/50 text-center">Nenhuma movimentação registrada.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
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
            </div>
          )}
        </div>

        {/* Footer */}
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

  // ── list view ──
  const listDates = useMemo(() => Array.from(loadsByDate.keys()).sort(), [loadsByDate]);

  // ── drag and drop ──
  const handleDropLoad = async (loadId: string, newDate: string) => {
    const load = loads.find((l) => l.id === loadId);
    if (!load || load.plannedDate?.slice(0, 10) === newDate) return;
    await updateLoad({ ...load, plannedDate: newDate });
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
  const lastFetchKey = useRef('');

  const weekOrderIds = useMemo(() => {
    const wLoads = weekDays.flatMap((d) => loadsByDate.get(d) || []);
    return [...new Set(wLoads.flatMap((l) => l.orderIds))];
  }, [weekDays, loadsByDate]);

  useEffect(() => {
    const fetchKey = weekOrderIds.join(',');
    if (!fetchKey || fetchKey === lastFetchKey.current || !supabasePedidos) return;
    lastFetchKey.current = fetchKey;
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
    const BATCH = 200;
    const chunks: string[][] = [];
    for (let i = 0; i < weekOrderIds.length; i += BATCH) chunks.push(weekOrderIds.slice(i, i + BATCH));
    Promise.all(chunks.map((batch) =>
      supabasePedidos!.from(table).select('numero_pedido, total_pedido_venda, total_produtos').in('numero_pedido', batch).then(({ data }) => data || [])
    )).then((results) => {
      const m = new Map<string, number>();
      for (const row of results.flat()) {
        const orderVal = (row.total_pedido_venda > 0 ? row.total_pedido_venda : row.total_produtos) || 0;
        m.set(String(row.numero_pedido), orderVal);
      }
      setWeekOrderValueMap(m);
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
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
    const BATCH = 200;
    const chunks: string[][] = [];
    for (let i = 0; i < monthOrderIds.length; i += BATCH) chunks.push(monthOrderIds.slice(i, i + BATCH));
    Promise.all(chunks.map((batch) =>
      supabasePedidos!.from(table).select('numero_pedido, total_pedido_venda, total_produtos').in('numero_pedido', batch).then(({ data }) => data || [])
    )).then((results) => {
      const m = new Map<string, number>();
      for (const row of results.flat()) {
        const orderVal = (row.total_pedido_venda > 0 ? row.total_pedido_venda : row.total_produtos) || 0;
        m.set(String(row.numero_pedido), orderVal);
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
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
    const BATCH = 200;
    const chunks: string[][] = [];
    for (let i = 0; i < listOrderIds.length; i += BATCH) chunks.push(listOrderIds.slice(i, i + BATCH));
    Promise.all(chunks.map((batch) =>
      supabasePedidos!.from(table).select('numero_pedido, total_pedido_venda, total_produtos').in('numero_pedido', batch).then(({ data }) => data || [])
    )).then((results) => {
      const m = new Map<string, number>();
      for (const row of results.flat()) {
        const orderVal = (row.total_pedido_venda > 0 ? row.total_pedido_venda : row.total_produtos) || 0;
        m.set(String(row.numero_pedido), orderVal);
      }
      setListOrderValueMap(m);
    }).catch((err) => console.error('[CarregamentoDashboard] listOrderValues:', err));
  }, [listOrderIds, view]);

  // ── keep selectedLoad in sync with updated loads state ──
  useEffect(() => {
    if (!selectedLoad) return;
    const updated = loads.find((l) => l.id === selectedLoad.id);
    if (updated) setSelectedLoad(updated);
  }, [loads]);

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

      {/* ── WEEK VIEW ── */}
      {view === 'semana' && (
        <div className={isMobile ? 'rounded-xl border border-border bg-card' : 'overflow-x-auto rounded-xl border border-border bg-card'}>
          <div className={isMobile ? 'grid grid-cols-3 gap-1' : 'grid grid-cols-7 gap-1 min-w-[700px]'}>
            {visibleWeekDays.map((d) => (
              <DayColumn key={d} dateStr={d} loads={loadsByDate.get(d) || []} driverMap={driverMap}
                today={today} canEdit={canEditLoad} prioMap={prioMap} orderValueMap={weekOrderValueMap}
                onLoadClick={setSelectedLoad} onDropLoad={handleDropLoad}
                dragOverDate={dragOverDate} setDragOverDate={setDragOverDate} />
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
