/**
 * CarregamentosStats.tsx
 * Dashboard de Metas e Performance de Faturamento — Concrem
 *
 * Persistência: supabaseOps
 *   - concrem_faturamento_metas         (metas mensais)
 *   - concrem_faturamento_justificativas (justificativas por dia)
 *
 * Lógica central:
 *   - Meta diária é DINÂMICA: cada dia perdido redistribui o saldo
 *     para os dias úteis restantes (meta/dia aumenta).
 *   - Dia perdido = dia útil passado sem carregamento e sem justificativa
 *     de antecipação.
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { formatCurrency } from '@/components/shared';
import { todayBR, fmtDate } from '@/lib/dateUtils';
import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import { fetchProgramacaoMes, type ProgramacaoMesResult } from '@/lib/programacaoValor';
import {
  Target, TrendingDown, AlertTriangle, CheckCircle2, XCircle,
  ChevronRight, Info, Edit3, Save, X, Plus, BarChart3,
  ArrowUpRight, ArrowDownRight, Clock, Flame, Award, AlertCircle, Loader2, Truck,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, AreaChart, Area, ReferenceLine,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

type MonthGoal = {
  month: string;
  goalValue: number;
  workingDays: number;
};

type DayJustification = {
  date: string;
  type: 'adiamento' | 'antecipacao' | 'antecipado_saiu' | 'cancelamento' | 'outro' | 'recuperado';
  relatedDate?: string;
  reason: string;
};

type DayStatus = 'bateu_meta' | 'abaixo_meta' | 'vazio_perdido' | 'futuro' | 'hoje' | 'recuperado';

// ─── Constants ────────────────────────────────────────────────────────────────

const JUSTIFICATION_LABELS: Record<DayJustification['type'], string> = {
  adiamento:       'Adiamento',
  antecipacao:     'Antecipação (entrou)',
  antecipado_saiu: 'Antecipação (saiu)',
  cancelamento:    'Cancelamento',
  outro:           'Outro',
  recuperado:      'Recuperado pelo Admin',
};

const JUSTIFICATION_COLORS: Record<DayJustification['type'], string> = {
  adiamento:       'text-amber-600 bg-amber-50 border-amber-200',
  antecipacao:     'text-blue-600 bg-blue-50 border-blue-200',
  antecipado_saiu: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  cancelamento:    'text-red-600 bg-red-50 border-red-200',
  outro:           'text-gray-600 bg-gray-50 border-gray-200',
  recuperado:      'text-emerald-600 bg-emerald-50 border-emerald-200',
};

const MONTHS_BR = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseLocalISO(d: string) { return new Date(d + 'T12:00:00'); }

function getDaysInMonth(yearMonth: string): string[] {
  const [year, month] = yearMonth.split('-').map(Number);
  const count = new Date(year, month, 0).getDate();
  return Array.from({ length: count }, (_, i) => {
    const dd = String(i + 1).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  });
}

function isWeekend(dateStr: string) {
  const d = parseLocalISO(dateStr);
  return d.getDay() === 0 || d.getDay() === 6;
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function fetchGoal(month: string): Promise<MonthGoal | null> {
  if (!supabaseOps) return null;
  const { data, error } = await supabaseOps
    .from('concrem_faturamento_metas')
    .select('*')
    .eq('month', month)
    .maybeSingle();
  if (error || !data) return null;
  return { month: data.month, goalValue: Number(data.goal_value), workingDays: Number(data.working_days) };
}

async function upsertGoal(goal: MonthGoal): Promise<string | null> {
  if (!supabaseOps) return 'supabaseOps não configurado';
  const { error } = await supabaseOps.from('concrem_faturamento_metas').upsert({
    month:        goal.month,
    goal_value:   goal.goalValue,
    working_days: goal.workingDays,
    updated_at:   new Date().toISOString(),
  }, { onConflict: 'month' });
  return error ? (error.message ?? 'Erro desconhecido') : null;
}

async function fetchJustifications(month: string): Promise<DayJustification[]> {
  if (!supabaseOps) return [];
  const from = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;
  const { data, error } = await supabaseOps
    .from('concrem_faturamento_justificativas')
    .select('*')
    .gte('date', from)
    .lte('date', to);
  if (error || !data) return [];
  return data.map((r: any) => ({
    date:        r.date,
    type:        r.type,
    relatedDate: r.related_date ?? undefined,
    reason:      r.reason,
  }));
}

async function upsertJustification(j: DayJustification): Promise<void> {
  if (!supabaseOps) return;
  await supabaseOps.from('concrem_faturamento_justificativas').upsert({
    date:         j.date,
    type:         j.type,
    related_date: j.relatedDate ?? null,
    reason:       j.reason,
    updated_at:   new Date().toISOString(),
  }, { onConflict: 'date' });
}

async function deleteJustification(date: string): Promise<void> {
  if (!supabaseOps) return;
  await supabaseOps
    .from('concrem_faturamento_justificativas')
    .delete()
    .eq('date', date);
}

async function fetchOrderValueMapForMonth(orderIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!supabasePedidos || orderIds.length === 0) return map;
  const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_venda';
  const CHUNK = 500;
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const chunk = orderIds.slice(i, i + CHUNK);
    const { data } = await supabasePedidos
      .from(table)
      .select('numero_pedido, total_pedido_venda, total_produtos')
      .in('numero_pedido', chunk);
    if (data) {
      for (const row of data) {
        const val = row.total_pedido_venda > 0
          ? Number(row.total_pedido_venda)
          : Number(row.total_produtos || 0);
        map.set(String(row.numero_pedido), val);
      }
    }
  }
  return map;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, color = 'text-primary', highlight = false,
}: { icon: React.ElementType; label: string; value: string; sub?: string; color?: string; highlight?: boolean }) {
  return (
    <div className={`bg-card rounded-xl p-4 border shadow-card flex items-center gap-3 ${highlight ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border'}`}>
      <div className={`p-2.5 rounded-lg bg-muted shrink-0 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide truncate">{label}</p>
        <p className="text-base font-bold text-foreground truncate leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
      </div>
    </div>
  );
}

function ProgressBar({ value, max, color = 'bg-primary' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function DayStatusIcon({ status }: { status: DayStatus }) {
  if (status === 'bateu_meta')    return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === 'abaixo_meta')   return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (status === 'vazio_perdido') return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === 'hoje')          return <Flame className="h-4 w-4 text-orange-500" />;
  if (status === 'recuperado')    return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
}

// ─── Goal Editor Modal ────────────────────────────────────────────────────────

function GoalEditorModal({
  month, existing, onSave, onClose,
}: { month: string; existing?: MonthGoal; onSave: (g: MonthGoal) => void; onClose: () => void }) {
  const toDisplay = (raw: number | null) => {
    if (!raw) return '';
    return raw.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const fromDisplay = (s: string): number => {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  };
  const applyMask = (raw: string): string => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    const cents = digits.slice(-2).padStart(2, '0');
    const intPart = digits.slice(0, -2).replace(/^0+/, '') || '0';
    const intFormatted = Number(intPart).toLocaleString('pt-BR');
    return `${intFormatted},${cents}`;
  };

  const [goalValue,   setGoalValue]   = useState(existing?.goalValue ? toDisplay(existing.goalValue) : '');
  const [workingDays, setWorkingDays] = useState(existing?.workingDays ? String(existing.workingDays) : '22');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [year, monthNum] = month.split('-');
  const monthLabel = `${MONTHS_BR[Number(monthNum) - 1]} ${year}`;

  const dailyTarget = useMemo(() => {
    const gv = fromDisplay(goalValue);
    const wd = parseInt(workingDays);
    if (!gv || !wd) return null;
    return gv / wd;
  }, [goalValue, workingDays]);

  const handleSave = async () => {
    const gv = fromDisplay(goalValue);
    const wd = parseInt(workingDays);
    if (!gv || !wd) return;
    setSaving(true);
    setSaveError(null);
    const g: MonthGoal = { month, goalValue: gv, workingDays: wd };
    const err = await upsertGoal(g);
    setSaving(false);
    if (err) { setSaveError(err); return; }
    onSave(g);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="font-bold text-foreground text-sm">Meta de Faturamento</div>
              <div className="text-xs text-muted-foreground">{monthLabel}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Meta Total do Mês (R$)</label>
            <input
              type="text"
              value={goalValue}
              onChange={e => setGoalValue(applyMask(e.target.value))}
              placeholder="Ex: 21.000.000,00"
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Dias Úteis no Mês</label>
            <input
              type="number"
              value={workingDays}
              onChange={e => setWorkingDays(e.target.value)}
              min="1" max="31"
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          {dailyTarget && (
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Meta diária base (sem perdas)</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(dailyTarget)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Se algum dia for perdido, a meta dos dias restantes aumenta automaticamente.
              </p>
            </div>
          )}
        </div>

        {saveError && (
          <div className="mx-5 mb-1 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span><strong>Erro ao salvar:</strong> {saveError}</span>
          </div>
        )}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar Meta
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Justification Modal ──────────────────────────────────────────────────────

function JustificationModal({
  date, existing, onSave, onClose,
}: { date: string; existing?: DayJustification; onSave: (j: DayJustification) => void; onClose: () => void }) {
  const [type,        setType]        = useState<DayJustification['type']>(existing?.type || 'adiamento');
  const [relatedDate, setRelatedDate] = useState(existing?.relatedDate || '');
  const [reason,      setReason]      = useState(existing?.reason || '');
  const [saving,      setSaving]      = useState(false);

  const handleSave = async () => {
    if (!reason.trim()) return;
    setSaving(true);
    const j: DayJustification = { date, type, relatedDate: relatedDate || undefined, reason: reason.trim() };
    await upsertJustification(j);
    onSave(j);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <div className="font-bold text-foreground text-sm">Justificativa</div>
              <div className="text-xs text-muted-foreground">{fmtDate(date)}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Tipo</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(JUSTIFICATION_LABELS) as DayJustification['type'][]).filter(t => t !== 'recuperado').map(t => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    type === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-foreground/30'
                  }`}>
                  {JUSTIFICATION_LABELS[t]}
                </button>
              ))}
            </div>
            {type === 'antecipacao' && (
              <p className="text-[11px] text-blue-600 mt-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
                ✓ Este dia <strong>não será contado como perdido</strong> — ele recebeu um carregamento adiantado de outra data.
              </p>
            )}
            {type === 'antecipado_saiu' && (
              <p className="text-[11px] text-indigo-600 mt-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-1">
                ✓ Este dia <strong>não será contado como perdido</strong> — o carregamento foi antecipado e já foi realizado em uma data anterior.
              </p>
            )}
            {(type === 'adiamento' || type === 'cancelamento' || type === 'outro') && (
              <p className="text-[11px] text-amber-600 mt-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                ⚠ Este dia será contado como perdido e a meta dos dias restantes será ajustada automaticamente.
              </p>
            )}
          </div>

          {(type === 'adiamento' || type === 'antecipacao' || type === 'antecipado_saiu') && (
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                {type === 'adiamento' ? 'Reagendado para' : type === 'antecipacao' ? 'Antecipado de (data original)' : 'Realizado em (data em que saiu)'}
              </label>
              <input type="date" value={relatedDate} onChange={e => setRelatedDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Motivo / Descrição</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder="Descreva o motivo..."
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !reason.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Recover Day Modal (Admin only) ──────────────────────────────────────────

function RecoverDayModal({
  date, onSave, onClose,
}: { date: string; onSave: (j: DayJustification) => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!reason.trim()) return;
    setSaving(true);
    const j: DayJustification = { date, type: 'recuperado', reason: reason.trim() };
    await upsertJustification(j);
    onSave(j);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <div className="font-bold text-foreground text-sm">Recuperar Dia Perdido</div>
              <div className="text-xs text-muted-foreground">{fmtDate(date)} · Ação de Administrador</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 p-3">
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Ao recuperar este dia, ele deixa de ser contado como perdido e a meta é redistribuída automaticamente. O usuário poderá cadastrar carregamentos com esta data no módulo de Carregamentos.
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Motivo da recuperação</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Descreva o motivo da recuperação..."
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !reason.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Confirmar Recuperação
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const CarregamentosStats = () => {
  const { loads, drivers, user } = useApp();
  const today        = todayBR();
  const currentMonth = today.slice(0, 7);

  const [selectedMonth,    setSelectedMonth]    = useState(currentMonth);
  const [goal,             setGoal]             = useState<MonthGoal | null>(null);
  const [justifications,   setJustifications]   = useState<DayJustification[]>([]);
  const [loadingGoal,      setLoadingGoal]      = useState(false);
  const [loadingJust,      setLoadingJust]      = useState(false);
  const [showGoalEditor,   setShowGoalEditor]   = useState(false);
  const [justificationDay, setJustificationDay] = useState<string | null>(null);
  const [recoverDay,       setRecoverDay]       = useState<string | null>(null);
  const [expandedDays,     setExpandedDays]     = useState<Set<string>>(new Set());
  const [activeTab,        setActiveTab]        = useState<'overview' | 'days' | 'trends'>('overview');
  const [orderValueMap,    setOrderValueMap]    = useState<Map<string, number>>(new Map());
  const [loadingOrders,    setLoadingOrders]    = useState(false);
  const [programacao,      setProgramacao]      = useState<ProgramacaoMesResult | null>(null);
  const [loadingProg,      setLoadingProg]      = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'ADMIN';

  // ── Carrega meta e justificativas do Supabase ao mudar de mês ──
  useEffect(() => {
    setLoadingGoal(true);
    fetchGoal(selectedMonth).then(g => { setGoal(g); setLoadingGoal(false); });
  }, [selectedMonth]);

  useEffect(() => {
    setLoadingJust(true);
    fetchJustifications(selectedMonth).then(j => { setJustifications(j); setLoadingJust(false); });
  }, [selectedMonth]);

  useEffect(() => {
    const monthLoads = loads.filter(l => l.plannedDate?.slice(0, 7) === selectedMonth);
    const allOrderIds = Array.from(new Set(monthLoads.flatMap(l => l.orderIds)));
    if (allOrderIds.length === 0) { setOrderValueMap(new Map()); return; }
    setLoadingOrders(true);
    fetchOrderValueMapForMonth(allOrderIds).then(map => {
      setOrderValueMap(map);
      setLoadingOrders(false);
    });
  }, [loads, selectedMonth]);

  useEffect(() => {
    setLoadingProg(true);
    fetchProgramacaoMes(selectedMonth, goal?.goalValue ?? null).then(result => {
      setProgramacao(result);
      setLoadingProg(false);
    });
  }, [selectedMonth, goal]);

  // ── Handlers ──
  const handleGoalSaved = useCallback((g: MonthGoal) => setGoal(g), []);

  const handleJustificationSaved = useCallback((j: DayJustification) => {
    setJustifications(prev => [...prev.filter(x => x.date !== j.date), j]);
  }, []);

  const handleRemoveJustification = useCallback(async (date: string) => {
    await deleteJustification(date);
    setJustifications(prev => prev.filter(x => x.date !== date));
  }, []);

  // ── Dados do mês ──
  const [year, monthNum] = selectedMonth.split('-').map(Number);
  const monthLabel = `${MONTHS_BR[monthNum - 1]} ${year}`;
  const allDays    = getDaysInMonth(selectedMonth);

  const loadsByDate = useMemo(() => {
    const map = new Map<string, typeof loads[0][]>();
    for (const l of loads) {
      const d = l.plannedDate?.slice(0, 10);
      if (!d || !d.startsWith(selectedMonth)) continue;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(l);
    }
    return map;
  }, [loads, selectedMonth]);

  const billedByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of loads) {
      const d = l.plannedDate?.slice(0, 10);
      if (!d || !d.startsWith(selectedMonth)) continue;
      if (l.shipmentStatus === 'Cancelado') continue;
      const orderVal = l.orderIds.reduce((s, id) => s + (orderValueMap.get(id) || 0), 0);
      const total = orderVal + (l.freightValue || 0);
      map.set(d, (map.get(d) || 0) + total);
    }
    return map;
  }, [loads, selectedMonth, orderValueMap]);

  // ── LÓGICA CENTRAL: meta diária dinâmica ──────────────────────────────────
  const { dayAnalyses, monthStats } = useMemo(() => {
    const workDays = allDays.filter(d => !isWeekend(d));

    if (!goal) {
      const analyses = workDays.map(date => ({
        date,
        isPast:   date < today,
        isToday:  date === today,
        isFuture: date > today,
        loadsCount: (loadsByDate.get(date) || []).length,
        billed:    billedByDate.get(date) || 0,
        target:    0,
        meetsTarget: false,
        deficit: 0, surplus: 0,
        status: 'futuro' as DayStatus,
        justification: justifications.find(j => j.date === date),
        loads: loadsByDate.get(date) || [],
        isLost: false,
        isRecovered: false,
      }));
      return { dayAnalyses: analyses, monthStats: null };
    }

    let remainingValue = goal.goalValue;
    let remainingDays  = goal.workingDays;

    const analyses: {
      date: string; isPast: boolean; isToday: boolean; isFuture: boolean;
      loadsCount: number; billed: number; target: number; meetsTarget: boolean;
      deficit: number; surplus: number; status: DayStatus;
      justification?: DayJustification; loads: typeof loads; isLost: boolean; isRecovered: boolean;
    }[] = [];

    let totalBilled   = 0;
    let daysMetTarget = 0;
    let daysMissed    = 0;
    let daysBelow     = 0;

    for (const date of workDays) {
      const isPast   = date < today;
      const isToday  = date === today;
      const isFuture = date > today;
      const billed   = billedByDate.get(date) || 0;
      const dayLoads = loadsByDate.get(date) || [];
      const just     = justifications.find(j => j.date === date);

      const todayTarget = remainingDays > 0 ? remainingValue / remainingDays : 0;

      const isRecovered = just?.type === 'recuperado';
      const isLost =
        isPast &&
        dayLoads.length === 0 &&
        billed === 0 &&
        just?.type !== 'antecipacao' &&
        just?.type !== 'antecipado_saiu' &&
        !isRecovered;

      const meetsTarget = todayTarget > 0 && billed >= todayTarget;
      const deficit     = Math.max(0, todayTarget - billed);
      const surplus     = Math.max(0, billed - todayTarget);

      let status: DayStatus = 'futuro';
      if (isToday)       status = 'hoje';
      else if (isPast) {
        if (isRecovered && billed === 0) status = 'recuperado';
        else if (isLost)                 status = 'vazio_perdido';
        else if (meetsTarget)            status = 'bateu_meta';
        else                             status = 'abaixo_meta';
      }

      if (isPast || isToday) totalBilled += billed;
      if (isPast) {
        if (isLost)           daysMissed++;
        else if (meetsTarget) daysMetTarget++;
        else if (billed > 0)  daysBelow++;
      }

      remainingValue -= billed;
      remainingDays  -= 1;

      analyses.push({
        date, isPast, isToday, isFuture, loadsCount: dayLoads.length, billed,
        target: todayTarget, meetsTarget, deficit, surplus, status,
        justification: just, loads: dayLoads, isLost, isRecovered,
      });
    }

    const remaining           = Math.max(0, goal.goalValue - totalBilled);
    const futureDays          = analyses.filter(d => d.isFuture);
    const nextTarget          = futureDays.length > 0 ? futureDays[0].target : null;
    const pastWorkDays        = analyses.filter(d => d.isPast || d.isToday);
    const progressPct         = (totalBilled / goal.goalValue) * 100;
    const expectedProgressPct = goal.workingDays > 0
      ? (Math.min(pastWorkDays.length, goal.workingDays) / goal.workingDays) * 100
      : 0;
    const isAhead             = progressPct >= expectedProgressPct;
    const avgPerDay           = pastWorkDays.length > 0 ? totalBilled / pastWorkDays.length : 0;
    const projectedTotal      = avgPerDay * goal.workingDays;
    const effectiveLostDays   = analyses.filter(d => d.isLost).length;

    return {
      dayAnalyses: analyses,
      monthStats: {
        totalBilled, daysMetTarget, daysMissed, daysBelow, remaining,
        futureWorkDays: futureDays.length, nextTarget,
        projectedTotal, progressPct, expectedProgressPct, isAhead,
        pastWorkDays: pastWorkDays.length,
        totalLoads: analyses.reduce((s, d) => s + d.loadsCount, 0),
        effectiveLostDays,
      },
    };
  }, [goal, allDays, loadsByDate, billedByDate, justifications, today, orderValueMap]);

  // ── Dados para gráficos ──
  const chartData = useMemo(() =>
    dayAnalyses.map(d => ({
      label:  fmtDate(d.date).slice(0, 5),
      billed: d.billed,
      target: d.target,
      status: d.status,
      date:   d.date,
    })),
  [dayAnalyses]);

  const cumulativeData = useMemo(() => {
    let acc = 0; let targetAcc = 0;
    return dayAnalyses.map(d => {
      acc       += d.billed;
      targetAcc += d.target;
      return { label: fmtDate(d.date).slice(0, 5), realizado: acc, meta: targetAcc };
    });
  }, [dayAnalyses]);

  // ── Dados de tendência ──
  const trendsData = useMemo(() => {
    return dayAnalyses
      .filter(d => d.isPast || d.isToday)
      .map(d => ({
        label:      fmtDate(d.date).slice(0, 5),
        faturado:   d.billed,
        meta:       d.target,
        metaBase:   goal ? goal.goalValue / goal.workingDays : 0,
        eficiencia: d.target > 0 ? Math.min(200, (d.billed / d.target) * 100) : 0,
      }));
  }, [dayAnalyses, goal]);

  const changeMonth = (delta: number) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const toggleDay = (date: string) =>
    setExpandedDays(prev => { const n = new Set(prev); n.has(date) ? n.delete(date) : n.add(date); return n; });

  const tooltipStyle = {
    contentStyle: { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' },
    labelStyle: { fontWeight: 600 },
  };

  const isLoading = loadingGoal || loadingJust || loadingOrders || loadingProg;

  return (
    <div className="space-y-5">

      {/* ── Cabeçalho ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => changeMonth(-1)}
            className="h-8 w-8 rounded-lg border border-border hover:bg-muted flex items-center justify-center transition-colors">
            <ChevronRight className="h-4 w-4 rotate-180" />
          </button>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            {monthLabel}
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </h2>
          <button type="button" onClick={() => changeMonth(1)}
            className="h-8 w-8 rounded-lg border border-border hover:bg-muted flex items-center justify-center transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
          {selectedMonth === currentMonth && (
            <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">Mês atual</span>
          )}
        </div>
        <button type="button" onClick={() => setShowGoalEditor(true)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            goal ? 'bg-muted border border-border text-foreground hover:bg-muted/80' : 'bg-primary text-primary-foreground hover:opacity-90'
          }`}>
          <Target className="h-4 w-4" />
          {goal ? 'Editar Meta' : 'Definir Meta'}
        </button>
      </div>

      {/* ── Card da Meta ── */}
      {goal && monthStats ? (
        <div className="bg-card rounded-2xl border border-border p-5 shadow-card space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Meta do Mês</p>
              <p className="text-3xl font-bold text-foreground">{formatCurrency(goal.goalValue)}</p>
            </div>
            <div className="flex flex-wrap gap-5">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Dias úteis configurados</p>
                <p className="text-xl font-bold text-foreground">{goal.workingDays}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Dias perdidos</p>
                <p className={`text-xl font-bold ${monthStats.effectiveLostDays > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {monthStats.effectiveLostDays}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Meta/dia atual</p>
                <p className="text-xl font-bold text-primary">
                  {monthStats.nextTarget ? formatCurrency(monthStats.nextTarget) : '—'}
                </p>
                {monthStats.effectiveLostDays > 0 && (
                  <p className="text-[10px] text-red-500">↑ ajustada pelas perdas</p>
                )}
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Faturado</p>
                <p className="text-xl font-bold text-emerald-600">{formatCurrency(monthStats.totalBilled)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Restante</p>
                <p className={`text-xl font-bold ${monthStats.remaining > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {monthStats.remaining > 0 ? formatCurrency(monthStats.remaining) : '✓ Meta atingida'}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progresso: <strong className="text-foreground">{monthStats.progressPct.toFixed(1)}%</strong></span>
              <span>Esperado: <strong className="text-foreground">{monthStats.expectedProgressPct.toFixed(1)}%</strong></span>
            </div>
            <div className="w-full bg-muted rounded-full h-3 overflow-hidden relative">
              <div
                className={`h-full rounded-full transition-all duration-700 ${monthStats.isAhead ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(100, monthStats.progressPct)}%` }}
              />
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-foreground/50"
                style={{ left: `${Math.min(100, monthStats.expectedProgressPct)}%` }}
                title="Progresso esperado"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              {monthStats.isAhead
                ? <><ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" /><span className="text-emerald-600 font-semibold">Acima do esperado</span></>
                : <><ArrowDownRight className="h-3.5 w-3.5 text-amber-500" /><span className="text-amber-600 font-semibold">Abaixo do esperado</span></>
              }
              {monthStats.nextTarget && monthStats.futureWorkDays > 0 && (
                <span className="text-muted-foreground">
                  · precisa de <strong className="text-foreground">{formatCurrency(monthStats.nextTarget)}/dia</strong> nos próximos {monthStats.futureWorkDays} dias úteis
                </span>
              )}
            </div>
          </div>

          {/* Comparação Programação × Meta */}
          {programacao && goal && (
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                Programação Comercial × Meta
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <div className="text-center">
                  <p className="text-[11px] text-muted-foreground">Programado (pedidos 307/309)</p>
                  <p className="text-base font-bold text-foreground">
                    {formatCurrency(programacao.totalProgramado)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{programacao.totalPedidos} pedidos</p>
                </div>
                <div className="text-center">
                  <p className="text-[11px] text-muted-foreground">Meta do mês</p>
                  <p className="text-base font-bold text-foreground">{formatCurrency(goal.goalValue)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[11px] text-muted-foreground">
                    {programacao.gap != null && programacao.gap >= 0 ? 'Folga' : 'Gap (falta programar)'}
                  </p>
                  <p className={`text-base font-bold ${
                    programacao.gap == null ? 'text-muted-foreground' :
                    programacao.gap >= 0   ? 'text-emerald-600' : 'text-red-500'
                  }`}>
                    {programacao.gap == null ? '—' :
                     programacao.gap >= 0
                       ? `+${formatCurrency(programacao.gap)}`
                       : `-${formatCurrency(Math.abs(programacao.gap))}`
                    }
                  </p>
                </div>
              </div>

              {programacao.gap != null && programacao.gap < 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 dark:text-red-400">
                    A programação comercial está <strong>{formatCurrency(Math.abs(programacao.gap))}</strong> abaixo
                    da meta. Novos pedidos precisam ser programados para este mês ou a meta deve ser ajustada.
                  </p>
                </div>
              )}

              {programacao.gap != null && programacao.gap >= 0 && (
                <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  A programação cobre a meta com folga de {formatCurrency(programacao.gap)}.
                </p>
              )}
            </div>
          )}

          {monthStats.effectiveLostDays > 0 && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs">
                <span className="font-bold text-red-700 dark:text-red-400">
                  {monthStats.effectiveLostDays} dia{monthStats.effectiveLostDays > 1 ? 's' : ''} perdido{monthStats.effectiveLostDays > 1 ? 's' : ''} este mês.
                </span>
                <span className="text-red-600 dark:text-red-400">
                  {' '}A meta diária foi redistribuída automaticamente para os dias restantes.
                  {monthStats.nextTarget && ` Próxima meta/dia: ${formatCurrency(monthStats.nextTarget)}.`}
                </span>
              </p>
            </div>
          )}
        </div>
      ) : !loadingGoal ? (
        <div className="bg-muted/50 rounded-2xl border border-dashed border-border p-8 text-center">
          <Target className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold text-muted-foreground mb-1">Nenhuma meta definida para {monthLabel}</p>
          <p className="text-xs text-muted-foreground mb-4">Defina a meta mensal para acompanhar o desempenho dia a dia</p>
          <button type="button" onClick={() => setShowGoalEditor(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" />
            Definir Meta
          </button>
        </div>
      ) : null}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={Truck}         label="Carregamentos" value={String(monthStats?.totalLoads ?? 0)}          color="text-primary" />
        <KpiCard icon={CheckCircle2}  label="Bateram Meta"  value={String(monthStats?.daysMetTarget ?? 0)}       color="text-emerald-600" />
        <KpiCard icon={AlertTriangle} label="Abaixo"        value={String(monthStats?.daysBelow ?? 0)}           color="text-amber-600" />
        <KpiCard icon={XCircle}       label="Dias Perdidos" value={String(monthStats?.daysMissed ?? 0)}          color="text-red-600" highlight={(monthStats?.daysMissed ?? 0) > 0} />
        <KpiCard icon={BarChart3}     label="Faturado"      value={formatCurrency(monthStats?.totalBilled ?? 0)} color="text-blue-600" />
        <KpiCard icon={Target}        label="Projeção Mês"
          value={monthStats?.projectedTotal ? formatCurrency(monthStats.projectedTotal) : '—'}
          sub={monthStats?.projectedTotal ? (monthStats.projectedTotal >= (goal?.goalValue || 0) ? '✓ Bate a meta' : '✗ Abaixo da meta') : undefined}
          color={(monthStats?.projectedTotal ?? 0) >= (goal?.goalValue ?? 1) ? 'text-emerald-600' : 'text-red-500'} />
      </div>

      {/* ── Tabs ── */}
      <div className="border-b border-border">
        <div className="flex">
          {(['overview', 'days', 'trends'] as const).map(tab => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {tab === 'overview' ? 'Visão Geral' : tab === 'days' ? 'Análise por Dia' : 'Tendências'}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB: VISÃO GERAL ── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="bg-card rounded-xl p-4 border border-border shadow-card">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-foreground">Faturamento por Dia Útil</h3>
              <span className="text-xs text-muted-foreground">Barra contornada = meta dinâmica do dia</span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              A meta de cada dia aumenta automaticamente quando dias anteriores são perdidos.
            </p>
            {chartData.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">Sem dados.</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v: number, name: string) => [formatCurrency(v), name === 'billed' ? 'Faturado' : 'Meta do dia']}
                  />
                  <Bar dataKey="target" name="target" fill="transparent"
                    stroke="hsl(var(--primary))" strokeDasharray="4 4" strokeWidth={1.5}
                    radius={[3, 3, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="billed" name="billed" radius={[4, 4, 0, 0]} maxBarSize={32}>
                    {chartData.map(entry => (
                      <Cell key={entry.date} fill={
                        entry.status === 'bateu_meta'    ? '#22c55e' :
                        entry.status === 'abaixo_meta'   ? '#f59e0b' :
                        entry.status === 'vazio_perdido' ? '#ef4444' :
                        entry.status === 'hoje'          ? 'hsl(var(--primary))' : 'hsl(var(--muted))'
                      } opacity={entry.status === 'futuro' ? 0.3 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="flex flex-wrap gap-3 mt-2">
              {[
                { color: 'bg-emerald-500', label: 'Bateu a meta' },
                { color: 'bg-amber-500',   label: 'Abaixo da meta' },
                { color: 'bg-red-500',     label: 'Dia perdido' },
                { color: 'bg-primary',     label: 'Hoje' },
                { color: 'bg-muted border border-border', label: 'Futuro' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {goal && (
            <div className="bg-card rounded-xl p-4 border border-border shadow-card">
              <h3 className="text-sm font-semibold text-foreground mb-3">Acumulado Realizado vs. Meta Progressiva</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={cumulativeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [formatCurrency(v), name === 'realizado' ? 'Realizado' : 'Meta acumulada']} />
                  <Area type="monotone" dataKey="meta" stroke="hsl(var(--primary))" strokeDasharray="5 5" fill="hsl(var(--primary) / 0.05)" strokeWidth={1.5} name="meta" />
                  <Area type="monotone" dataKey="realizado" stroke="#22c55e" fill="#22c55e20" strokeWidth={2} name="realizado" />
                  <ReferenceLine y={goal.goalValue} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1}
                    label={{ value: 'Meta Total', fontSize: 10, fill: '#ef4444' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: ANÁLISE POR DIA ── */}
      {activeTab === 'days' && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
            <span>Data</span>
            <span className="text-right w-28">Faturado</span>
            <span className="text-right w-28">Meta do Dia</span>
            <span className="text-right w-20">Desvio</span>
            <span className="w-24 text-center">Status</span>
          </div>

          {dayAnalyses.map(day => {
            const isExpanded = expandedDays.has(day.date);
            const deviation  = day.billed - day.target;

            return (
              <div key={day.date}
                className={`bg-card rounded-xl border shadow-card overflow-hidden ${
                  day.status === 'vazio_perdido' ? 'border-red-200 dark:border-red-800/40' :
                  day.status === 'bateu_meta'    ? 'border-emerald-200 dark:border-emerald-800/40' :
                  day.status === 'hoje'          ? 'border-primary/40' : 'border-border'
                }`}>

                {/* ── Linha principal clicável ── */}
                <div
                  onClick={() => toggleDay(day.date)}
                  className={`grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors ${
                    day.isToday ? 'bg-primary/5' : ''
                  }`}>

                  {/* Data + dia da semana */}
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-foreground">{fmtDate(day.date)}</span>
                      {day.isToday && (
                        <span className="ml-2 text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Hoje</span>
                      )}
                      {day.justification && (
                        <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${JUSTIFICATION_COLORS[day.justification.type]}`}>
                          {JUSTIFICATION_LABELS[day.justification.type]}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Faturado */}
                  <span className={`text-sm font-bold text-right w-28 ${day.billed > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {day.billed > 0 ? formatCurrency(day.billed) : '—'}
                  </span>

                  {/* Meta do dia */}
                  <span className="text-sm font-medium text-muted-foreground text-right w-28">
                    {day.target > 0 ? formatCurrency(day.target) : '—'}
                  </span>

                  {/* Desvio */}
                  <span className={`text-xs font-semibold text-right w-20 ${
                    deviation > 0 ? 'text-emerald-600' : deviation < 0 && (day.isPast || day.isToday) ? 'text-red-500' : 'text-muted-foreground'
                  }`}>
                    {(day.isPast || day.isToday) && day.target > 0
                      ? `${deviation >= 0 ? '+' : ''}${formatCurrency(deviation)}`
                      : '—'}
                  </span>

                  {/* Status badge */}
                  <div className="w-24 flex justify-center">
                    {day.isFuture ? (
                      <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-1 rounded-full">Futuro</span>
                    ) : day.status === 'bateu_meta' ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />Meta
                      </span>
                    ) : day.status === 'abaixo_meta' ? (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />Abaixo
                      </span>
                    ) : day.status === 'vazio_perdido' ? (
                      <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded-full flex items-center gap-1">
                        <XCircle className="h-3 w-3" />Perdido
                      </span>
                    ) : day.status === 'recuperado' ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />Recuperado
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-1 rounded-full flex items-center gap-1">
                        <Flame className="h-3 w-3" />Hoje
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Painel expandido ── */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-4 space-y-3 bg-muted/20">

                    {/* Alerta: dia perdido sem justificativa */}
                    {day.isLost && !day.justification && (
                      <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-300 dark:border-red-700/50 p-3 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-red-700 dark:text-red-400">Dia perdido sem justificativa — documente o motivo</p>
                          <p className="text-[11px] text-red-600 dark:text-red-500 mt-0.5">
                            Nenhum carregamento foi registrado neste dia. Adicione uma justificativa para documentar o ocorrido.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Alerta: dia perdido com justificativa (não admin) */}
                    {day.isLost && day.justification && !isAdmin && (
                      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700/50 p-3 flex items-start gap-2">
                        <Info className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Dia perdido documentado — para recuperar este dia entre em contato com o Administrador do sistema.
                        </p>
                      </div>
                    )}

                    {/* Justificativa existente */}
                    {day.justification && (
                      <div className={`rounded-xl border p-3 ${JUSTIFICATION_COLORS[day.justification.type]}`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-bold">{JUSTIFICATION_LABELS[day.justification.type]}</span>
                          {day.justification.type !== 'recuperado' && (
                            <button type="button"
                              onClick={() => handleRemoveJustification(day.date)}
                              className="text-[10px] underline opacity-60 hover:opacity-100 shrink-0">
                              Remover
                            </button>
                          )}
                        </div>
                        <p className="text-xs">{day.justification.reason}</p>
                        {day.justification.relatedDate && (
                          <p className="text-[11px] mt-1 opacity-80">
                            Data relacionada: <strong>{fmtDate(day.justification.relatedDate)}</strong>
                          </p>
                        )}
                      </div>
                    )}

                    {/* Carregamentos do dia */}
                    {day.loads.length > 0 ? (
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          Carregamentos ({day.loads.length})
                        </p>
                        <div className="space-y-1.5">
                          {day.loads.map(l => {
                            const driver = drivers.find(d => d.id === l.driverId);
                            return (
                              <div key={l.id} className="flex items-center justify-between gap-2 bg-card rounded-lg border border-border px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="text-xs font-semibold text-foreground truncate">{l.id}</span>
                                  {driver && <span className="text-[11px] text-muted-foreground truncate">· {driver.name}</span>}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-muted-foreground">{l.shipmentStatus}</span>
                                  <span className="text-xs font-bold text-foreground">{formatCurrency(l.freightValue || 0)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Nenhum carregamento registrado neste dia.</p>
                    )}

                    {/* Barra de progresso do dia */}
                    {(day.isPast || day.isToday) && day.target > 0 && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>Atingimento da meta diária</span>
                          <span className="font-semibold text-foreground">
                            {day.target > 0 ? `${Math.min(999, Math.round((day.billed / day.target) * 100))}%` : '—'}
                          </span>
                        </div>
                        <ProgressBar
                          value={day.billed}
                          max={day.target}
                          color={day.meetsTarget ? 'bg-emerald-500' : day.billed > 0 ? 'bg-amber-500' : 'bg-red-400'}
                        />
                      </div>
                    )}

                    {/* Botões de ação */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(day.isPast || day.isToday) && !day.justification && (
                        <button type="button"
                          onClick={() => setJustificationDay(day.date)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors">
                          <Plus className="h-3.5 w-3.5" />
                          Adicionar Justificativa
                        </button>
                      )}
                      {(day.isPast || day.isToday) && day.justification && day.justification.type !== 'recuperado' && (
                        <button type="button"
                          onClick={() => setJustificationDay(day.date)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border text-muted-foreground text-xs font-semibold hover:bg-muted/80 transition-colors">
                          <Edit3 className="h-3.5 w-3.5" />
                          Editar Justificativa
                        </button>
                      )}
                      {isAdmin && day.isLost && day.justification && day.justification.type !== 'recuperado' && (
                        <button type="button"
                          onClick={() => setRecoverDay(day.date)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Recuperar Dia
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB: TENDÊNCIAS ── */}
      {activeTab === 'trends' && (
        <div className="space-y-4">
          {trendsData.length === 0 ? (
            <div className="bg-card rounded-xl p-8 border border-border text-center text-sm text-muted-foreground">
              Nenhum dado disponível para análise de tendências.
            </div>
          ) : (
            <>
              <div className="bg-card rounded-xl p-4 border border-border shadow-card">
                <h3 className="text-sm font-semibold text-foreground mb-1">Faturamento Diário vs. Meta Dinâmica</h3>
                <p className="text-[11px] text-muted-foreground mb-3">
                  A linha tracejada mostra a meta base (sem redistribuição). A linha sólida mostra a meta dinâmica real de cada dia.
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={trendsData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [
                      formatCurrency(v),
                      name === 'faturado' ? 'Faturado' : name === 'meta' ? 'Meta dinâmica' : 'Meta base',
                    ]} />
                    <Area type="monotone" dataKey="metaBase" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4"
                      fill="transparent" strokeWidth={1} name="metaBase" />
                    <Area type="monotone" dataKey="meta" stroke="hsl(var(--primary))" strokeDasharray="5 5"
                      fill="hsl(var(--primary) / 0.05)" strokeWidth={1.5} name="meta" />
                    <Area type="monotone" dataKey="faturado" stroke="#22c55e" fill="#22c55e15" strokeWidth={2} name="faturado" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-card rounded-xl p-4 border border-border shadow-card">
                <h3 className="text-sm font-semibold text-foreground mb-3">Eficiência Diária (% da Meta Atingida)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trendsData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} domain={[0, 200]} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)}%`, 'Eficiência']} />
                    <ReferenceLine y={100} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1.5}
                      label={{ value: '100%', fontSize: 10, fill: '#22c55e' }} />
                    <Bar dataKey="eficiencia" radius={[4, 4, 0, 0]} maxBarSize={32} name="eficiencia">
                      {trendsData.map((entry, i) => (
                        <Cell key={i} fill={
                          entry.eficiencia >= 100 ? '#22c55e' :
                          entry.eficiencia > 0    ? '#f59e0b' : '#ef4444'
                        } />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 mt-2">
                  {[
                    { color: 'bg-emerald-500', label: '≥ 100% (bateu a meta)' },
                    { color: 'bg-amber-500',   label: 'Parcial (abaixo da meta)' },
                    { color: 'bg-red-500',     label: '0% (dia perdido)' },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              {goal && monthStats && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-card rounded-xl p-4 border border-border shadow-card text-center">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Média Faturada/Dia</p>
                    <p className="text-xl font-bold text-foreground">
                      {monthStats.pastWorkDays > 0 ? formatCurrency(monthStats.totalBilled / monthStats.pastWorkDays) : '—'}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">nos {monthStats.pastWorkDays} dias trabalhados</p>
                  </div>
                  <div className="bg-card rounded-xl p-4 border border-border shadow-card text-center">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Taxa de Sucesso</p>
                    <p className={`text-xl font-bold ${monthStats.daysMetTarget > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                      {monthStats.pastWorkDays > 0
                        ? `${Math.round((monthStats.daysMetTarget / monthStats.pastWorkDays) * 100)}%`
                        : '—'}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{monthStats.daysMetTarget} de {monthStats.pastWorkDays} dias bateu a meta</p>
                  </div>
                  <div className="bg-card rounded-xl p-4 border border-border shadow-card text-center">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Impacto das Perdas</p>
                    <p className={`text-xl font-bold ${monthStats.effectiveLostDays > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {monthStats.effectiveLostDays > 0
                        ? `-${formatCurrency((goal.goalValue / goal.workingDays) * monthStats.effectiveLostDays)}`
                        : 'R$ 0'}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {monthStats.effectiveLostDays} dia{monthStats.effectiveLostDays !== 1 ? 's' : ''} perdido{monthStats.effectiveLostDays !== 1 ? 's' : ''} × meta base/dia
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Modais ── */}
      {showGoalEditor && (
        <GoalEditorModal
          month={selectedMonth}
          existing={goal ?? undefined}
          onSave={handleGoalSaved}
          onClose={() => setShowGoalEditor(false)}
        />
      )}
      {justificationDay && (
        <JustificationModal
          date={justificationDay}
          existing={justifications.find(j => j.date === justificationDay)}
          onSave={handleJustificationSaved}
          onClose={() => setJustificationDay(null)}
        />
      )}
      {recoverDay && (
        <RecoverDayModal
          date={recoverDay}
          onSave={handleJustificationSaved}
          onClose={() => setRecoverDay(null)}
        />
      )}
    </div>
  );
};

export default CarregamentosStats;
