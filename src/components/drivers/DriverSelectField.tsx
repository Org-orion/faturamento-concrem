import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import { Driver } from '@/types';
import { StarRating } from './StarRating';

interface DriverSelectFieldProps {
  drivers: Driver[];
  value: string;
  onChange: (driverId: string) => void;
  className?: string;
}

export const DriverSelectField: React.FC<DriverSelectFieldProps> = ({
  drivers, value, onChange, className = '',
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

  const selected = drivers.find(d => d.id === value);

  const filtered = drivers.filter(d =>
    !search ||
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.plate.toLowerCase().includes(search.toLowerCase()) ||
    (d.vehicleType || '').toLowerCase().includes(search.toLowerCase()),
  );

  // Ordenação: melhores avaliados primeiro, blacklisted por último
  const sorted = [...filtered].sort((a, b) => {
    if (a.blacklisted && !b.blacklisted) return 1;
    if (!a.blacklisted && b.blacklisted) return -1;
    const ra = a.rating ?? 0;
    const rb = b.rating ?? 0;
    if (rb !== ra) return rb - ra;
    return a.name.localeCompare(b.name);
  });

  const normal = sorted.filter(d => !d.blacklisted);
  const blacklisted = sorted.filter(d => d.blacklisted);

  const select = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between gap-2 w-full px-3 py-2 rounded-lg border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors"
      >
        {selected ? (
          <span className={`flex items-center gap-2 truncate ${selected.blacklisted ? 'text-red-600 font-bold' : ''}`}>
            {selected.blacklisted && <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />}
            <span className="truncate">{selected.name}</span>
            {selected.rating ? <StarRating value={selected.rating} size="sm" /> : null}
          </span>
        ) : (
          <span className="text-muted-foreground">Selecione um motorista...</span>
        )}
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-full min-w-[320px] bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, placa ou veículo..."
              className="w-full px-2 py-1.5 text-sm rounded border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
            />
          </div>

          <div className="max-h-72 overflow-y-auto">
            {/* Opção em branco */}
            <button
              type="button"
              onClick={() => select('')}
              className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
            >
              — Nenhum motorista —
            </button>

            {/* Motoristas normais */}
            {normal.length > 0 && (
              <>
                {normal.map(d => (
                  <DriverOption key={d.id} driver={d} selected={d.id === value} onSelect={select} />
                ))}
              </>
            )}

            {/* Separador blacklist */}
            {blacklisted.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-950/20 border-y border-red-200 dark:border-red-800">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                  <span className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wider">Lista Negra</span>
                </div>
                {blacklisted.map(d => (
                  <DriverOption key={d.id} driver={d} selected={d.id === value} onSelect={select} />
                ))}
              </>
            )}

            {normal.length === 0 && blacklisted.length === 0 && (
              <div className="px-3 py-4 text-sm text-muted-foreground italic text-center">
                Nenhum motorista encontrado
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const DriverOption: React.FC<{ driver: Driver; selected: boolean; onSelect: (id: string) => void }> = ({
  driver, selected, onSelect,
}) => (
  <button
    type="button"
    onClick={() => onSelect(driver.id)}
    className={`w-full text-left px-3 py-2.5 transition-colors flex items-start gap-3 ${
      selected ? 'bg-primary/10' : 'hover:bg-muted/40'
    } ${driver.blacklisted ? 'bg-red-50/60 dark:bg-red-950/10 hover:bg-red-100/60 dark:hover:bg-red-950/20' : ''}`}
  >
    {/* Ícone de blacklist */}
    <div className="mt-0.5 shrink-0">
      {driver.blacklisted ? (
        <AlertTriangle className="h-4 w-4 text-red-600" />
      ) : (
        <div className="h-4 w-4" />
      )}
    </div>

    <div className="flex-1 min-w-0">
      {/* Nome */}
      <div className={`font-semibold text-sm truncate ${driver.blacklisted ? 'text-red-700 dark:text-red-400' : 'text-foreground'}`}>
        {driver.name}
        {driver.blacklisted && (
          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white">
            BLACKLIST
          </span>
        )}
      </div>

      {/* Veículo + placa */}
      <div className="text-xs text-muted-foreground mt-0.5">
        {driver.vehicleType} · {driver.plate}
      </div>

      {/* Estrelas */}
      {driver.rating ? (
        <div className="flex items-center gap-1 mt-1">
          <StarRating value={driver.rating} size="sm" />
          <span className="text-xs font-medium text-amber-600">{driver.rating.toFixed(1)}</span>
          {(driver.ratingCount ?? 0) > 0 && (
            <span className="text-xs text-muted-foreground">({driver.ratingCount})</span>
          )}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground mt-1 italic">Sem avaliação</div>
      )}
    </div>
  </button>
);
