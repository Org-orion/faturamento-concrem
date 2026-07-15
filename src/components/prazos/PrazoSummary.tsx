import React from 'react';
import { Factory, CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';
import type { PrazoResumo, Criticidade } from '@/lib/prazoProducao';

type CardDef = {
  key: 'total' | Criticidade;
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: string; // classe da barra/ícone
};

/** Linha compacta de indicadores, respeitando a visão (venda/suporte) já filtrada. */
export function PrazoSummary({ resumo }: { resumo: PrazoResumo }) {
  const cards: CardDef[] = [
    { key: 'total',   label: 'Em Produção',     value: resumo.total,   icon: <Factory className="h-4 w-4" />,       accent: 'text-foreground bg-foreground/10' },
    { key: 'dentro',  label: 'Dentro do Prazo', value: resumo.dentro,  icon: <CheckCircle2 className="h-4 w-4" />,   accent: 'text-emerald-600 bg-emerald-500/10' },
    { key: 'atencao', label: 'Em Atenção',      value: resumo.atencao, icon: <AlertTriangle className="h-4 w-4" />,  accent: 'text-amber-600 bg-amber-500/10' },
    { key: 'critico', label: 'Críticos',        value: resumo.critico, icon: <AlertOctagon className="h-4 w-4" />,   accent: 'text-red-600 bg-red-500/10' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.key} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-card">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.accent}`}>{c.icon}</div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground truncate">{c.label}</p>
            <p className="text-xl font-bold font-display text-foreground leading-tight">{c.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
