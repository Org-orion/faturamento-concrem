import { useCallback, useState } from 'react';

export type SortDirection = 'asc' | 'desc';

export type SortState = {
  key: string | null;
  direction: SortDirection | null;
};

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

const isIsoDate = (v: unknown): boolean =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);

function compare(a: unknown, b: unknown): number {
  // nullish always last
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  // numbers
  if (typeof a === 'number' && typeof b === 'number') return a - b;

  // dates (ISO strings)
  if (isIsoDate(a) && isIsoDate(b)) {
    return new Date(a as string).getTime() - new Date(b as string).getTime();
  }

  // try numeric parse
  const na = Number(String(a).replace(',', '.'));
  const nb = Number(String(b).replace(',', '.'));
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;

  // fallback: string locale compare
  return norm(a).localeCompare(norm(b), 'pt-BR');
}

export function useTableSort() {
  const [sortState, setSortState] = useState<SortState>({ key: null, direction: null });

  const toggleSort = useCallback((key: string) => {
    setSortState((prev) => {
      if (prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return { key: null, direction: null };
    });
  }, []);

  const sortItems = useCallback(
    <T,>(items: T[], getters: Record<string, (item: T) => unknown>): T[] => {
      if (!sortState.key || !sortState.direction) return items;
      const getter = getters[sortState.key];
      if (!getter) return items;
      const dir = sortState.direction === 'asc' ? 1 : -1;
      return [...items].sort((a, b) => dir * compare(getter(a), getter(b)));
    },
    [sortState],
  );

  return { sortState, setSortState, toggleSort, sortItems };
}
