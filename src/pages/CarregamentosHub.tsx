import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';
import { canDo, type UserRole, type AppRouteKey } from '@/utils/access';
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

const ALL_TABS: TabKey[] = ['carregamentos', 'cronograma', 'dashboard'];

const CarregamentosHub = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useApp();

  const visibleTabs = useMemo(() => {
    if (!user) return ALL_TABS;
    const role = user.role as UserRole;
    return ALL_TABS.filter((tab) =>
      canDo(role, user.permissions ?? null, TAB_ROUTE_KEY[tab], 'view'),
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
