import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { FilterCondition, FilterField, FilterOperator } from '@/lib/filters';
import { filterOperators } from '@/lib/filters';

const newId = () => `flt_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;

const defaultOperator: FilterOperator = 'contains';

export function FilterConfiguratorDialog<T>({
  open,
  onOpenChange,
  title = 'Configurar Filtros',
  subtitle = 'Adicione condições para refinar os resultados.',
  fields,
  value,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  subtitle?: string;
  fields: Array<FilterField<T>>;
  value: FilterCondition[];
  onApply: (next: FilterCondition[]) => void;
}) {
  const [draft, setDraft] = useState<FilterCondition[]>(value);
  const [touchedApply, setTouchedApply] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setTouchedApply(false);
    }
  }, [open, value]);

  const fieldsById = useMemo(() => new Map(fields.map((f) => [f.id, f] as const)), [fields]);

  const addCondition = () => {
    const first = fields[0];
    if (!first) return;
    setDraft((prev) => [...prev, { id: newId(), fieldId: first.id, operator: defaultOperator, value: '' }]);
  };

  const removeCondition = (id: string) => {
    setDraft((prev) => prev.filter((c) => c.id !== id));
  };

  const clearAll = () => {
    setDraft([]);
    setTouchedApply(false);
  };

  const setField = (id: string, fieldId: string) => {
    setDraft((prev) =>
      prev.map((c) => (c.id === id ? { ...c, fieldId, operator: defaultOperator, value: '' } : c)),
    );
  };

  const setOperator = (id: string, operator: FilterOperator) => {
    setDraft((prev) => prev.map((c) => (c.id === id ? { ...c, operator } : c)));
  };

  const setValue = (id: string, v: string) => {
    setDraft((prev) => prev.map((c) => (c.id === id ? { ...c, value: v } : c)));
  };

  const hasInvalid = draft.some((c) => !String(c.value || '').trim() || !fieldsById.get(c.fieldId));

  const apply = () => {
    setTouchedApply(true);
    if (hasInvalid) return;
    onApply(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-3xl">
        <div className="p-6 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-lg font-bold text-foreground">{title}</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">{subtitle}</DialogDescription>
            </DialogHeader>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {draft.length === 0 ? (
            <div className="w-full rounded-xl border border-dashed border-border bg-muted/10 py-10 text-center text-muted-foreground">
              Nenhum filtro ativo.
            </div>
          ) : (
            <div className="space-y-3">
              {draft.map((c) => {
                const f = fieldsById.get(c.fieldId);
                const showError = touchedApply && (!String(c.value || '').trim() || !f);
                const placeholder = f?.placeholder || 'Valor...';
                const inputType = f?.type === 'date' ? 'date' : f?.type === 'number' ? 'number' : 'text';

                return (
                  <div key={c.id} className="flex items-start gap-3">
                    <div className="grid grid-cols-1 md:grid-cols-[220px_160px_1fr] gap-3 flex-1">
                      <div>
                        <Select value={c.fieldId} onValueChange={(v) => setField(c.id, v)}>
                          <SelectTrigger className="h-10 bg-white">
                            <SelectValue placeholder="Campo" />
                          </SelectTrigger>
                          <SelectContent>
                            {fields.map((ff) => (
                              <SelectItem key={ff.id} value={ff.id}>
                                {ff.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Select value={c.operator} onValueChange={(v) => setOperator(c.id, v as FilterOperator)}>
                          <SelectTrigger className="h-10 bg-white">
                            <SelectValue placeholder="Operador" />
                          </SelectTrigger>
                          <SelectContent>
                            {filterOperators.map((op) => (
                              <SelectItem key={op.id} value={op.id}>
                                {op.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Input
                          type={inputType}
                          className={cn('h-10 bg-white', showError && 'border-destructive focus-visible:ring-destructive')}
                          placeholder={placeholder}
                          value={c.value}
                          onChange={(e) => setValue(c.id, e.target.value)}
                        />
                        {showError && (
                          <div className="text-[11px] text-destructive mt-1">Preencha o valor.</div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeCondition(c.id)}
                      className="h-10 w-10 inline-flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                      aria-label="Remover filtro"
                      title="Remover filtro"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
            Limpar tudo
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addCondition}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-white border border-dashed border-border text-foreground/80 hover:bg-muted/30 transition-colors text-sm font-semibold"
              disabled={!fields.length}
            >
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-border">
                <Plus className="h-3.5 w-3.5" />
              </span>
              Adicionar Filtro
            </button>
            <button
              type="button"
              onClick={apply}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground hover:opacity-90 active:opacity-80 transition-opacity text-sm font-semibold"
            >
              Aplicar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
