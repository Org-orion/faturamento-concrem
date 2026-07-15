import React from 'react';
import type { Criticidade } from '@/lib/prazoProducao';

const STYLES: Record<Criticidade, { cls: string; dot: string; label: string }> = {
  dentro:  { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Dentro do prazo' },
  atencao: { cls: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-500',   label: 'Atenção' },
  critico: { cls: 'bg-red-50 text-red-700 border-red-200',             dot: 'bg-red-500',     label: 'Crítico' },
};

/** Selo de criticidade — cor + ponto + texto (nunca só cor). */
export function PrazoBadge({ criticidade, className = '' }: { criticidade: Criticidade; className?: string }) {
  const s = STYLES[criticidade];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-bold uppercase tracking-tight ${s.cls} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
