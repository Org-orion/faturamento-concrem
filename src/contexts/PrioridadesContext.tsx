import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { listPrioridadesAtivas, PedidoPrioridade } from '@/lib/prioridadesRepo';

interface PrioridadesCtx {
  /** Map pedido_id → prioridade ativa */
  map: Map<string, PedidoPrioridade>;
  /** Refresh the priority data from Supabase */
  refresh: () => Promise<void>;
}

const PrioridadesContext = createContext<PrioridadesCtx>({
  map: new Map(),
  refresh: async () => {},
});

export const usePrioridades = () => useContext(PrioridadesContext);

export function PrioridadesProvider({ children }: { children: React.ReactNode }) {
  const [map, setMap] = useState<Map<string, PedidoPrioridade>>(new Map());

  const refresh = useCallback(async () => {
    const rows = await listPrioridadesAtivas();
    const next = new Map<string, PedidoPrioridade>();
    for (const r of rows) next.set(r.pedido_id, r);
    setMap(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <PrioridadesContext.Provider value={{ map, refresh }}>
      {children}
    </PrioridadesContext.Provider>
  );
}
