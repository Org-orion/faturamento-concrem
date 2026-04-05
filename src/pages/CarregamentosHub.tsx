import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import LoadsPage from '@/pages/Loads';
import CarregamentoCronograma from '@/pages/CarregamentoDashboard';
import CarregamentosStats from '@/pages/CarregamentosStats';

type TabKey = 'carregamentos' | 'cronograma' | 'dashboard';

const TAB_LABELS: Record<TabKey, string> = {
  carregamentos: 'Carregamentos',
  cronograma: 'Cronograma',
  dashboard: 'Dashboard',
};

const ALL_TABS: TabKey[] = ['carregamentos', 'cronograma', 'dashboard'];

const CarregamentosHub = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = useMemo<TabKey>(() => {
    const param = searchParams.get('tab') as TabKey | null;
    if (param && ALL_TABS.includes(param)) return param;
    return 'carregamentos';
  }, [searchParams]);

  const setTab = (key: TabKey) => {
    setSearchParams({ tab: key }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-border">
        <div className="flex gap-1">
          {ALL_TABS.map((tab) => (
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
