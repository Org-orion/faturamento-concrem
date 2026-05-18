import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

interface MultiSelectFilterProps {
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
  placeholder: string;
  className?: string;
}

export const MultiSelectFilter: React.FC<MultiSelectFilterProps> = ({
  options, selected, onChange, placeholder, className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const filtered = search
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  const label =
    selected.length === 0 ? placeholder :
    selected.length === 1 ? selected[0] :
    `${selected.length} selecionados`;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center justify-between gap-2 w-full px-3 py-2 rounded-lg border bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors ${selected.length > 0 ? 'border-primary/70' : 'border-input'}`}
      >
        <span className={`truncate ${selected.length > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
          {label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {selected.length > 0 && (
            <span
              role="button"
              aria-label="Limpar filtro"
              className="h-4 w-4 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-full w-max max-w-72 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
          {options.length > 5 && (
            <div className="p-2 border-b border-border">
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full px-2 py-1.5 text-sm rounded border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
              />
            </div>
          )}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground italic">Nenhuma opção</div>
            ) : filtered.map(opt => (
              <label key={opt} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40 transition-colors select-none">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="rounded shrink-0"
                />
                <span className="truncate">{opt}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="p-2 border-t border-border">
              <button
                type="button"
                onClick={() => { onChange([]); setOpen(false); }}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1 hover:underline"
              >
                Limpar seleção
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
