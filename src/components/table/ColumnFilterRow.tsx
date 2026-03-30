import React from 'react';

export type ColFilterSlot =
  | {
      key: string;
      type: 'text' | 'number' | 'date';
      placeholder?: string;
    }
  | {
      key: string;
      type: 'select';
      options: Array<{ value: string; label: string }>;
    }
  | { type: 'none' };

/**
 * Renders a `<tr>` of inline filter inputs directly below the column headers.
 * One slot per column — use `{ type: 'none' }` for columns that should not be filterable
 * (checkboxes, action buttons, etc.).
 */
export function ColumnFilterRow({
  columns,
  values,
  onChange,
}: {
  columns: ColFilterSlot[];
  values: Record<string, string>;
  onChange: (key: string, value: string, instant?: boolean) => void;
}) {
  return (
    <tr className="border-b border-border/40 bg-muted/5">
      {columns.map((col, i) => {
        if (col.type === 'none') {
          return <th key={`empty-${i}`} className="px-4 py-1.5" />;
        }

        if (col.type === 'select') {
          return (
            <th key={col.key} className="px-4 py-1.5">
              <select
                value={values[col.key] || ''}
                onChange={(e) => onChange(col.key, e.target.value, true)}
                className="w-full text-[11px] bg-background border border-border/60 rounded-md px-2 py-1 text-foreground font-normal focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
              >
                <option value="">Todos</option>
                {col.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </th>
          );
        }

        return (
          <th key={col.key} className="px-4 py-1.5">
            <input
              type={col.type === 'date' ? 'date' : 'text'}
              value={values[col.key] || ''}
              onChange={(e) => onChange(col.key, e.target.value)}
              placeholder={col.placeholder || 'Filtrar...'}
              className="w-full text-[11px] bg-background border border-border/60 rounded-md px-2 py-1 text-foreground font-normal placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
            />
          </th>
        );
      })}
    </tr>
  );
}
