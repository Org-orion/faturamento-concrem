import { useCallback, useState } from 'react';
import { useDebounce } from './useDebounce';

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

export function useQuickFilter<T>(initialStatus: string | null = null) {
  const [query, setQuery] = useState('');
  const [activeStatus, setActiveStatus] = useState<string | null>(initialStatus);
  const debouncedQuery = useDebounce(query, 400);

  const filterItems = useCallback(
    (
      items: T[],
      textGetters: Array<(item: T) => unknown>,
      statusGetter?: (item: T) => string | null | undefined,
    ): T[] => {
      let result = items;

      // text search
      const q = norm(debouncedQuery);
      if (q) {
        result = result.filter((item) =>
          textGetters.some((g) => norm(g(item)).includes(q)),
        );
      }

      // status filter
      if (activeStatus && statusGetter) {
        result = result.filter((item) => statusGetter(item) === activeStatus);
      }

      return result;
    },
    [debouncedQuery, activeStatus],
  );

  return { query, setQuery, debouncedQuery, activeStatus, setActiveStatus, filterItems };
}
