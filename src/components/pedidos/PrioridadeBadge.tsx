import React, { useState, useRef, useEffect } from 'react';
import { Flag } from 'lucide-react';
import type { NivelPrioridade } from '@/lib/prioridadesRepo';

const NIVEL_STYLES: Record<NivelPrioridade, { color: string; bg: string; border: string; ring: string; pulse: string }> = {
  urgente: { color: 'text-red-600',    bg: 'bg-red-100',    border: 'border-red-300', ring: 'ring-red-300', pulse: 'bg-red-400' },
  alta:    { color: 'text-orange-600', bg: 'bg-orange-100', border: 'border-orange-300', ring: 'ring-orange-300', pulse: 'bg-orange-400' },
  media:   { color: 'text-yellow-600', bg: 'bg-yellow-100', border: 'border-yellow-300', ring: 'ring-yellow-300', pulse: 'bg-yellow-400' },
};

const NIVEL_LABELS: Record<NivelPrioridade, string> = {
  urgente: 'Urgente',
  alta: 'Alta',
  media: 'Média',
};

/**
 * Prominent clickable badge for table rows.
 * Shows nivel label + pulsing dot. Clicking opens a popover with the motivo.
 */
export function PrioridadeIcon({ nivel, motivo, className }: { nivel: NivelPrioridade; motivo?: string; className?: string }) {
  const s = NIVEL_STYLES[nivel] || NIVEL_STYLES.alta;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className={`relative inline-flex ${className || ''}`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(prev => !prev); }}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.bg} ${s.color} ${s.border} hover:ring-2 ${s.ring} transition-all cursor-pointer`}
      >
        <span className="relative flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${s.pulse} opacity-75`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${s.pulse}`} />
        </span>
        <Flag className="h-3 w-3" />
        {NIVEL_LABELS[nivel]}
      </button>

      {open && motivo && (
        <div className={`absolute z-50 top-full left-0 mt-1 w-64 rounded-lg border shadow-lg p-3 ${s.bg} ${s.border}`}>
          <div className={`text-xs font-bold uppercase tracking-tight ${s.color} mb-1`}>
            Motivo — Prioridade {NIVEL_LABELS[nivel]}
          </div>
          <div className={`text-sm ${s.color} font-medium`}>{motivo}</div>
        </div>
      )}
    </div>
  );
}

/** Minimal pulsing dot — for compact spaces (relatório de entrega, cronograma, lista de carregamentos) */
export function PrioridadeDot({ nivel }: { nivel: NivelPrioridade }) {
  const s = NIVEL_STYLES[nivel] || NIVEL_STYLES.alta;
  return (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${s.pulse} opacity-75`} />
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${s.pulse}`} />
    </span>
  );
}

/** Small pill badge — for use in detail panels */
export function PrioridadeBadge({ nivel }: { nivel: NivelPrioridade }) {
  const s = NIVEL_STYLES[nivel] || NIVEL_STYLES.alta;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.bg} ${s.color} ${s.border}`}>
      <Flag className="h-3 w-3" />
      {NIVEL_LABELS[nivel]}
    </span>
  );
}

/** Alert block — for detail panels, shows nivel + motivo */
export function PrioridadeAlert({ nivel, motivo }: { nivel: NivelPrioridade; motivo: string }) {
  const s = NIVEL_STYLES[nivel] || NIVEL_STYLES.alta;
  return (
    <div className={`rounded-lg p-3 border ${s.bg} ${s.border}`}>
      <div className="flex items-start gap-2">
        <Flag className={`h-4 w-4 mt-0.5 shrink-0 ${s.color}`} />
        <div className="min-w-0">
          <div className={`text-xs font-bold uppercase tracking-tight ${s.color}`}>
            Prioridade {NIVEL_LABELS[nivel]}
          </div>
          <div className={`mt-0.5 text-sm font-semibold ${s.color}`}>{motivo}</div>
        </div>
      </div>
    </div>
  );
}
