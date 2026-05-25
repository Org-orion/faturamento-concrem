import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { listAtencaoAtiva, listTodasAtencoes, PedidoAtencao } from '@/lib/atencaoRepo';

interface AtencaoCtx {
  /** Map pedido_id → atenção ativa (ativo=true) — para tela de Prioridades */
  map: Map<string, PedidoAtencao>;
  /** Map pedido_id → atenção (todas, inclusive arquivadas) — para badges nos pedidos */
  mapTodas: Map<string, PedidoAtencao>;
  refresh: () => Promise<void>;
}

const AtencaoContext = createContext<AtencaoCtx>({
  map: new Map(),
  mapTodas: new Map(),
  refresh: async () => {},
});

export const useAtencao = () => useContext(AtencaoContext);

export function AtencaoProvider({ children }: { children: React.ReactNode }) {
  const [map, setMap] = useState<Map<string, PedidoAtencao>>(new Map());
  const [mapTodas, setMapTodas] = useState<Map<string, PedidoAtencao>>(new Map());

  const refresh = useCallback(async () => {
    const [ativas, todas] = await Promise.all([listAtencaoAtiva(), listTodasAtencoes()]);
    const nextAtivas = new Map<string, PedidoAtencao>();
    for (const r of ativas) nextAtivas.set(r.pedido_id, r);
    setMap(nextAtivas);
    const nextTodas = new Map<string, PedidoAtencao>();
    for (const r of todas) nextTodas.set(r.pedido_id, r);
    setMapTodas(nextTodas);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AtencaoContext.Provider value={{ map, mapTodas, refresh }}>
      {children}
    </AtencaoContext.Provider>
  );
}
