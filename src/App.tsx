import React, { useState, useEffect } from 'react';
import { AppProvider } from '@/contexts/AppContext';
import { ToastProvider } from '@/components/ToastProvider';
import Sidebar, { Page } from '@/components/Sidebar';
import SkeletonLoader from '@/components/SkeletonLoader';
import Dashboard from '@/pages/Dashboard';
import ClientsPage from '@/pages/Clients';
import DriversPage from '@/pages/Drivers';
import OrdersPage from '@/pages/Orders';
import LoadsPage from '@/pages/Loads';
import InvoicesPage from '@/pages/Invoices';
import ReportsPage from '@/pages/Reports';

const pages: Record<Page, React.ComponentType> = {
  dashboard: Dashboard,
  clients: ClientsPage,
  drivers: DriversPage,
  orders: OrdersPage,
  loads: LoadsPage,
  invoices: InvoicesPage,
  reports: ReportsPage,
};

const App = () => {
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [loading, setLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const navigate = (page: Page) => {
    if (page === activePage) return;
    setLoading(true);
    setActivePage(page);
    setTimeout(() => setLoading(false), 300);
  };

  const PageComponent = pages[activePage];

  return (
    <AppProvider>
      <ToastProvider>
        <div className="flex min-h-screen bg-background">
          <Sidebar active={activePage} onNavigate={navigate} />
          <main className="flex-1 lg:ml-[240px] p-6 lg:p-8 pt-16 lg:pt-8">
            {loading ? <SkeletonLoader /> : <PageComponent />}
          </main>
        </div>
      </ToastProvider>
    </AppProvider>
  );
};

export default App;
