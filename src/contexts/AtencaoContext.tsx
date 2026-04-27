import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { listAtencaoAtiva, PedidoAtencao } from '@/lib/atencaoRepo';

interface AtencaoCtx {
  map: Map<string, PedidoAtencao>;
  refresh: () => Promise<void>;
}

const AtencaoContext = createContext<AtencaoCtx>({
  map: new Map(),
  refresh: async () => {},
});

export const useAtencao = () => useContext(AtencaoContext);

export function AtencaoProvider({ children }: { children: React.ReactNode }) {
  const [map, setMap] = useState<Map<string, PedidoAtencao>>(new Map());

  const refresh = useCallback(async () => {
    const rows = await listAtencaoAtiva();
    const next = new Map<string, PedidoAtencao>();
    for (const r of rows) next.set(r.pedido_id, r);
    setMap(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AtencaoContext.Provider value={{ map, refresh }}>
      {children}
    </AtencaoContext.Provider>
  );
}
