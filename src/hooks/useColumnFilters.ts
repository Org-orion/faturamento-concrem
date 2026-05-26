import { useCallback, useMemo, useState } from 'react';
import { useDebounce } from './useDebounce';

/**
 * Column-level inline filters with per-type debounce behaviour.
 *
 * - Text / number / date values are debounced (400 ms) so Supabase is never hit on every keystroke.
 * - Select (dropdown) values are applied instantly.
 *
 * Usage:
 *   const cf = useColumnFilters();
 *   const filtered = cf.filterItems(items, colDefs);
 */

export type ColDef<T> = {
  key: string;
  /** 'contains' (default) = case-insensitive substring match; 'exact' = lowercase equality */
  match?: 'exact' | 'contains';
  getter: (item: T) => unknown;
};

export function useColumnFilters() {
  // Text / number / date values → debounced
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  // Select values → instant
  const [selectValues, setSelectValues] = useState<Record<string, string>>({});
  // Multi-select values → instant (array per key)
  const [multiValues, setMultiValuesState] = useState<Record<string, string[]>>({});

  const debouncedText = useDebounce(textValues, 400);

  const setFilter = useCallback((key: string, value: string, instant = false) => {
    if (instant) {
      setSelectValues((prev) => ({ ...prev, [key]: value }));
    } else {
      setTextValues((prev) => ({ ...prev, [key]: value }));
    }
  }, []);

  const setMultiFilter = useCallback((key: string, values: string[]) => {
    setMultiValuesState((prev) => ({ ...prev, [key]: values }));
  }, []);

  /** Raw values for rendering the inputs (no debounce applied). */
  const values = useMemo(
    () => ({ ...textValues, ...selectValues }),
    [textValues, selectValues],
  );

  /** Filter an array using the currently active column filters. */
  const filterItems = useCallback(
    <T,>(items: T[], defs: ColDef<T>[]): T[] => {
      const merged = { ...debouncedText, ...selectValues };
      const active = Object.entries(merged).filter(([, v]) => v !== undefined && v !== '');
      const activeMulti = Object.entries(multiValues).filter(([, v]) => v.length > 0);
      if (!active.length && !activeMulti.length) return items;

      const defMap = new Map(defs.map((d) => [d.key, d]));

      return items.filter((item) => {
        const passesCol = active.every(([key, val]) => {
          const def = defMap.get(key);
          if (!def) return true;
          const cell = String(def.getter(item) ?? '').toLowerCase();
          const filter = val.toLowerCase();
          if (def.match === 'exact') return cell === filter;
          // Suporte a múltiplos valores separados por vírgula ou ponto-e-vírgula
          const terms = filter.split(/[,;]+/).map((t) => t.trim()).filter(Boolean);
          if (terms.length > 1) return terms.some((t) => cell.includes(t));
          return cell.includes(filter);
        });
        const passesMulti = activeMulti.every(([key, vals]) => {
          const def = defMap.get(key);
          if (!def) return true;
          const cell = String(def.getter(item) ?? '').toLowerCase();
          // Exact match: "ENGENHARIA" must not match "ENGENHARIA JANDERSON"
          return vals.some(v => cell === v.toLowerCase());
        });
        return passesCol && passesMulti;
      });
    },
    [debouncedText, selectValues, multiValues],
  );

  const clearAll = useCallback(() => {
    setTextValues({});
    setSelectValues({});
    setMultiValuesState({});
  }, []);

  return { values, multiValues, setFilter, setMultiFilter, filterItems, clearAll };
}
