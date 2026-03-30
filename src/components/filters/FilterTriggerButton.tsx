import React from 'react';
import { Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

export function FilterTriggerButton({
  count,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { count?: number }) {
  const hasCount = typeof count === 'number' && count > 0;
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center gap-2 h-8 px-3 rounded-lg bg-white border border-border text-foreground/80 font-display text-xs font-bold uppercase tracking-tight hover:bg-muted/30 active:opacity-80 transition-colors',
        className,
      )}
    >
      <Filter className="h-4 w-4" />
      Filtros avançados
      {hasCount && (
        <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary/10 text-primary text-[10px] font-black">
          {count}
        </span>
      )}
    </button>
  );
}

