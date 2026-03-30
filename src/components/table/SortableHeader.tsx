import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SortState } from '@/hooks/useTableSort';

export function SortableHeader({
  columnKey,
  sortState,
  onToggle,
  children,
  className,
}: {
  columnKey: string;
  sortState: SortState;
  onToggle: (key: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const active = sortState.key === columnKey;
  return (
    <th
      onClick={() => onToggle(columnKey)}
      className={cn(
        'py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px] cursor-pointer select-none hover:text-foreground transition-colors',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active && sortState.direction === 'asc' && <ArrowUp className="h-3 w-3 text-primary" />}
        {active && sortState.direction === 'desc' && <ArrowDown className="h-3 w-3 text-primary" />}
        {!active && <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </span>
    </th>
  );
}
