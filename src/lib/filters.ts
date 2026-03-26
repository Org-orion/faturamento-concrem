export type FilterFieldType = 'text' | 'date' | 'number';

export type FilterOperator = 'contains' | 'equals' | 'gte' | 'lte';

export type FilterCondition = {
  id: string;
  fieldId: string;
  operator: FilterOperator;
  value: string;
};

export type FilterField<T> = {
  id: string;
  label: string;
  type: FilterFieldType;
  getValue: (item: T) => unknown;
  placeholder?: string;
};

export const filterOperators: Array<{ id: FilterOperator; label: string }> = [
  { id: 'contains', label: 'Contém' },
  { id: 'equals', label: 'É igual a' },
  { id: 'gte', label: 'Maior ou igual a' },
  { id: 'lte', label: 'Menor ou igual a' },
];

const toIsoDate = (v: unknown): string => {
  if (!v) return '';
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
};

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

const parseNum = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export function summarizeCondition<T>(fields: Array<FilterField<T>>, c: FilterCondition): string {
  const f = fields.find((x) => x.id === c.fieldId);
  const op = filterOperators.find((o) => o.id === c.operator);
  const label = f?.label || c.fieldId;
  const opLabel = op?.label || c.operator;
  return `${label} ${opLabel} ${c.value}`.trim();
}

export function applyFilters<T>(
  items: T[],
  fields: Array<FilterField<T>>,
  conditions: FilterCondition[],
): T[] {
  if (!conditions.length) return items;
  const byId = new Map(fields.map((f) => [f.id, f] as const));

  return items.filter((item) => {
    for (const c of conditions) {
      const field = byId.get(c.fieldId);
      if (!field) continue;
      const raw = field.getValue(item);
      const q = c.value;
      if (!String(q || '').trim()) return false;

      if (field.type === 'number') {
        const left = parseNum(raw);
        const right = parseNum(q);
        if (left === null || right === null) return false;
        if (c.operator === 'equals' && left !== right) return false;
        if (c.operator === 'contains' && !norm(left).includes(norm(right))) return false;
        if (c.operator === 'gte' && left < right) return false;
        if (c.operator === 'lte' && left > right) return false;
        continue;
      }

      if (field.type === 'date') {
        const left = toIsoDate(raw);
        const right = toIsoDate(q);
        if (c.operator === 'equals' && left !== right) return false;
        if (c.operator === 'contains' && !norm(left).includes(norm(right))) return false;
        if (c.operator === 'gte' && left < right) return false;
        if (c.operator === 'lte' && left > right) return false;
        continue;
      }

      const left = norm(raw);
      const right = norm(q);
      if (c.operator === 'equals' && left !== right) return false;
      if (c.operator === 'contains' && !left.includes(right)) return false;
    }
    return true;
  });
}
