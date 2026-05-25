import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { listPrioridadesAtivas, listTodasPrioridades, PedidoPrioridade } from '@/lib/prioridadesRepo';

interface PrioridadesCtx {
  /** Map pedido_id → prioridade ativa (ativo=true) — para tela de Prioridades */
  map: Map<string, PedidoPrioridade>;
  /** Map pedido_id → prioridade (todas, inclusive arquivadas) — para badges nos pedidos */
  mapTodas: Map<string, PedidoPrioridade>;
  refresh: () => Promise<void>;
}

const PrioridadesContext = createContext<PrioridadesCtx>({
  map: new Map(),
  mapTodas: new Map(),
  refresh: async () => {},
});

export const usePrioridades = () => useContext(PrioridadesContext);

export function PrioridadesProvider({ children }: { children: React.ReactNode }) {
  const [map, setMap] = useState<Map<string, PedidoPrioridade>>(new Map());
  const [mapTodas, setMapTodas] = useState<Map<string, PedidoPrioridade>>(new Map());

  const refresh = useCallback(async () => {
    const [ativas, todas] = await Promise.all([listPrioridadesAtivas(), listTodasPrioridades()]);
    const nextAtivas = new Map<string, PedidoPrioridade>();
    for (const r of ativas) nextAtivas.set(r.pedido_id, r);
    setMap(nextAtivas);
    const nextTodas = new Map<string, PedidoPrioridade>();
    for (const r of todas) nextTodas.set(r.pedido_id, r);
    setMapTodas(nextTodas);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <PrioridadesContext.Provider value={{ map, mapTodas, refresh }}>
      {children}
    </PrioridadesContext.Provider>
  );
}
