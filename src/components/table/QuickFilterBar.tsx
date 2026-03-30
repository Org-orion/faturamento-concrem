import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StatusButton = {
  value: string;
  label: string;
};

export function QuickFilterBar({
  query,
  onQueryChange,
  placeholder = 'Buscar...',
  statuses,
  activeStatus,
  onStatusChange,
  children,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  placeholder?: string;
  statuses?: StatusButton[];
  activeStatus?: string | null;
  onStatusChange?: (v: string | null) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search input */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-muted text-foreground text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors placeholder:text-muted-foreground/50"
        />
      </div>

      {/* Status quick-filter buttons */}
      {statuses && statuses.length > 0 && onStatusChange && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onStatusChange(null)}
            className={cn(
              'h-7 px-2.5 rounded-full text-[11px] font-bold font-display uppercase tracking-tight border transition-colors',
              activeStatus === null
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-white text-muted-foreground border-border hover:bg-muted/30',
            )}
          >
            Todos
          </button>
          {statuses.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => onStatusChange(activeStatus === s.value ? null : s.value)}
              className={cn(
                'h-7 px-2.5 rounded-full text-[11px] font-bold font-display uppercase tracking-tight border transition-colors',
                activeStatus === s.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-white text-muted-foreground border-border hover:bg-muted/30',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Slot for advanced filter button and other controls */}
      {children && <div className="flex items-center gap-2 ml-auto">{children}</div>}
    </div>
  );
}
