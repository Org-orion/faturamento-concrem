import React from 'react';
import { Pencil, X } from 'lucide-react';
import type { FilterCondition, FilterField } from '@/lib/filters';
import { cn } from '@/lib/utils';
import { summarizeCondition } from '@/lib/filters';

export function ActiveFiltersChips<T>({
  fields,
  conditions,
  onRemove,
  onClear,
  onEdit,
  className,
}: {
  fields: Array<FilterField<T>>;
  conditions: FilterCondition[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onEdit?: () => void;
  className?: string;
}) {
  if (!conditions.length) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {conditions.map((c) => (
        <div
          key={c.id}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border bg-white text-foreground/80 text-[11px] font-semibold"
        >
          <span className="truncate max-w-[220px]">{summarizeCondition(fields, c)}</span>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Editar filtro"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(c.id)}
            className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
            title="Remover filtro"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        onClick={onClear}
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-dashed border-border bg-white text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors text-[11px] font-semibold"
        type="button"
      >
        <X className="h-3.5 w-3.5" />
        Limpar tudo
      </button>
    </div>
  );
}

