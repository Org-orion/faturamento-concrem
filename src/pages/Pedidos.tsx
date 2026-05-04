import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';
import Commercial from '@/pages/Commercial';
import PedidoSuporte from '@/pages/PedidoSuporte';
import AtualizacaoStatus from '@/pages/AtualizacaoStatus';
import PainelPedidos from '@/pages/PainelPedidos';
import Programacao from '@/pages/Programacao';
import { can, canFazer, canDo, type UserRole, type AppRouteKey } from '@/utils/access';
import type { Funcionalidade } from '@/types/permissions';

type TabKey = 'venda' | 'suporte' | 'status' | 'painel' | 'programacao';

const TAB_ROUTE: Record<TabKey, AppRouteKey> = {
  'venda':        'comercial',
  'suporte':      'pedido-suporte',
  'status':       'atualizacao-status',
  'painel':       'painel-pedidos',
  'programacao':  'programacao-comercial',
};

const TAB_FUNCIONALIDADE: Record<TabKey, Funcionalidade> = {
  'venda':       'comercial.view',
  'suporte':     'suporte.view',
  'status':      'atualizacao_status.view',
  'painel':      'painel_pedidos.view',
  'programacao': 'programacao_comercial.view',
};

const TAB_LABELS: Record<TabKey, string> = {
  'venda':        'Pedidos Venda',
  'suporte':      'Pedidos Suporte',
  'status':       'Status Pedido',
  'painel':       'Painel de Pedidos',
  'programacao':  'Programação',
};

const ALL_TABS: TabKey[] = ['venda', 'suporte', 'status', 'painel', 'programacao'];

const Pedidos = () => {
  const { user } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const visibleTabs = useMemo(
    () => ALL_TABS.filter((t) => {
      if (!user?.role) return false;
      if (user.funcionalidades != null) return canFazer(user.funcionalidades, TAB_FUNCIONALIDADE[t]);
      return canDo(user.role as UserRole, user.permissions ?? null, TAB_ROUTE[t], 'view');
    }),
    [user?.role, user?.permissions, user?.funcionalidades],
  );

  const activeTab = useMemo<TabKey>(() => {
    const param = searchParams.get('tab') as TabKey | null;
    if (param && visibleTabs.includes(param)) return param;
    return visibleTabs[0] ?? 'venda';
  }, [searchParams, visibleTabs]);

  const setTab = (key: TabKey) => {
    setSearchParams({ tab: key }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-border">
        <div className="flex gap-1">
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setTab(tab)}
              className={cn(
                'px-4 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px',
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'venda'        && <Commercial />}
      {activeTab === 'suporte'      && <PedidoSuporte />}
      {activeTab === 'status'       && <AtualizacaoStatus />}
      {activeTab === 'painel'       && <PainelPedidos />}
      {activeTab === 'programacao'  && <Programacao />}
    </div>
  );
};

export default Pedidos;
