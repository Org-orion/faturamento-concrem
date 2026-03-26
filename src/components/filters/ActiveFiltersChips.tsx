import React from 'react';
import { X } from 'lucide-react';
import type { FilterCondition, FilterField } from '@/lib/filters';
import { cn } from '@/lib/utils';
import { summarizeCondition } from '@/lib/filters';

export function ActiveFiltersChips<T>({
  fields,
  conditions,
  onRemove,
  onClear,
  className,
}: {
  fields: Array<FilterField<T>>;
  conditions: FilterCondition[];
  onRemove: (id: string) => void;
  onClear: () => void;
  className?: string;
}) {
  if (!conditions.length) {
    return (
      <div className={cn('text-xs text-muted-foreground font-display', className)}>
        Nenhum filtro ativo.
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {conditions.map((c) => (
        <button
          key={c.id}
          onClick={() => onRemove(c.id)}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-border bg-white text-foreground/80 hover:bg-muted/30 transition-colors text-[11px] font-semibold"
          title="Remover filtro"
          type="button"
        >
          <span className="truncate max-w-[260px]">{summarizeCondition(fields, c)}</span>
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      ))}
      <button
        onClick={onClear}
        className="inline-flex items-center gap-2 h-7 px-2.5 rounded-full border border-dashed border-border bg-white text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors text-[11px] font-semibold"
        type="button"
      >
        <X className="h-3.5 w-3.5" />
        Limpar tudo
      </button>
    </div>
  );
}

