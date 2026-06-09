import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';
import { canDo, canFazer, type UserRole, type AppRouteKey } from '@/utils/access';
import { type Funcionalidade } from '@/types/permissions';
import LoadsPage from '@/pages/Loads';
import CarregamentoCronograma from '@/pages/CarregamentoDashboard';
import CarregamentosStats from '@/pages/CarregamentosStats';

type TabKey = 'carregamentos' | 'cronograma' | 'dashboard';

const TAB_LABELS: Record<TabKey, string> = {
  carregamentos: 'Carregamentos',
  cronograma: 'Cronograma',
  dashboard: 'Dashboard',
};

const TAB_ROUTE_KEY: Record<TabKey, AppRouteKey> = {
  carregamentos: 'programacao',
  cronograma: 'programacao-cronograma',
  dashboard: 'programacao-dashboard',
};

const TAB_FUNC_KEY: Record<TabKey, Funcionalidade> = {
  carregamentos: 'carregamento.view',
  cronograma: 'carregamento.cronograma',
  dashboard: 'carregamento.dashboard',
};

const ALL_TABS: TabKey[] = ['carregamentos', 'cronograma', 'dashboard'];

const CarregamentosHub = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useApp();

  const visibleTabs = useMemo(() => {
    if (!user) return ALL_TABS;
    return ALL_TABS.filter((tab) =>
      user.funcionalidades
        ? canFazer(user.funcionalidades, TAB_FUNC_KEY[tab])
        : canDo(user.role as UserRole, user.permissions ?? null, TAB_ROUTE_KEY[tab], 'view'),
    );
  }, [user]);

  const activeTab = useMemo<TabKey>(() => {
    const param = searchParams.get('tab') as TabKey | null;
    if (param && visibleTabs.includes(param)) return param;
    return visibleTabs[0] || 'carregamentos';
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

      {activeTab === 'carregamentos' && <LoadsPage />}
      {activeTab === 'cronograma' && <CarregamentoCronograma />}
      {activeTab === 'dashboard' && <CarregamentosStats />}
    </div>
  );
};

export default CarregamentosHub;
