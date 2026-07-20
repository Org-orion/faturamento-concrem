import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from '@/contexts/AppContext';
import { ToastProvider } from '@/components/ToastProvider';
import { MainLayout } from '@/components/Layout/MainLayout';
import SkeletonLoader from '@/components/SkeletonLoader';
import { canAccessRoute } from '@/utils/access';
import { PrioridadesProvider } from '@/contexts/PrioridadesContext';
import { AtencaoProvider } from '@/contexts/AtencaoContext';
import { PageTabsProvider } from '@/contexts/PageTabsContext';

const LAST_ROUTE_KEY = 'last_route';

// Lazy loading pages
const Login = lazy(() => import('@/pages/Login'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const ClientsPage = lazy(() => import('@/pages/Clients'));
const DriversPage = lazy(() => import('@/pages/Drivers'));
const CarregamentosHub = lazy(() => import('@/pages/CarregamentosHub'));
const ControlePrazos = lazy(() => import('@/pages/ControlePrazos'));
const CreateCarregamento = lazy(() => import('@/pages/CreateShipment'));
const FinancialPage = lazy(() => import('@/pages/Financial'));
const ProtocoloFinanceiroPage = lazy(() => import('@/pages/financeiro/ProtocoloFinanceiro'));
const CommercialPage = lazy(() => import('@/pages/Commercial'));
const ComercialLiberacaoPage = lazy(() => import('@/pages/ComercialLiberacao'));
const ComercialConfirmacaoPage = lazy(() => import('@/pages/ComercialConfirmacao'));
const PedidoSuportePage = lazy(() => import('@/pages/PedidoSuporte'));
const PedidoSuporteLiberacaoPage = lazy(() => import('@/pages/PedidoSuporteLiberacao'));
const ProducaoPage = lazy(() => import('@/pages/Producao'));
const PainelPedidosPage = lazy(() => import('@/pages/PainelPedidos'));
const PedidosPage = lazy(() => import('@/pages/Pedidos'));
const AtualizacaoStatusPage = lazy(() => import('@/pages/AtualizacaoStatus'));
const UsersPage = lazy(() => import('@/pages/Users'));
const PermissoesPage = lazy(() => import('@/pages/Permissoes'));
const PrioridadesPage = lazy(() => import('@/pages/Prioridades'));
const AccessDenied = lazy(() => import('@/pages/AccessDenied'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const PainelTVPage = lazy(() => import('@/pages/PainelTV'));
const AnalisePedidosPage = lazy(() => import('@/pages/AnalisePedidos'));
const PedidosExcluidosPage = lazy(() => import('@/pages/PedidosExcluidos'));

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user } = useApp();
  const location = useLocation();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user && !canAccessRoute(user.role, location.pathname, user.permissions, user.funcionalidades)) {
    return <Navigate to="/acesso-negado" replace />;
  }

  return <MainLayout>{children}</MainLayout>;
};

const UrlCleaner = () => {
  const location = useLocation();
  useEffect(() => {
    if (location.pathname !== '/login' && location.pathname !== '/painel-tv') {
      if (location.pathname !== '/') {
        // Guarda a URL completa (com ?tab=...) para restaurar a sub-aba no F5.
        sessionStorage.setItem(LAST_ROUTE_KEY, location.pathname + location.search);
      }
      window.history.replaceState(null, '', '/');
    }
  }, [location.pathname, location.search]);
  return null;
};

// On F5 / direct load of '/', redirect to last visited route or first accessible route
const HomeRedirect = () => {
  const { isAuthenticated, user } = useApp();
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (user) {
    const last = sessionStorage.getItem(LAST_ROUTE_KEY);
    if (last && last !== '/' && canAccessRoute(user.role, last, user.permissions, user.funcionalidades)) {
      return <Navigate to={last} replace />;
    }
    const candidates = [
      '/carregamento', '/producao', '/financeiro', '/pedidos',
      '/comercial', '/prioridades', '/painel-pedidos', '/atualizacao-status', '/painel-tv',
    ];
    for (const route of candidates) {
      if (canAccessRoute(user.role, route, user.permissions, user.funcionalidades)) {
        return <Navigate to={route} replace />;
      }
    }
  }

  return <Navigate to="/acesso-negado" replace />;
};

const AppRoutes = () => {
  return (
    <Suspense fallback={<SkeletonLoader />}>
      <UrlCleaner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/acesso-negado" element={<ProtectedRoute><AccessDenied /></ProtectedRoute>} />
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/representantes" element={<ProtectedRoute><ClientsPage /></ProtectedRoute>} />
        <Route path="/motoristas" element={<ProtectedRoute><DriversPage /></ProtectedRoute>} />
        <Route path="/comercial/liberacao" element={<ProtectedRoute><ComercialLiberacaoPage /></ProtectedRoute>} />
        <Route path="/comercial/confirmacao" element={<ProtectedRoute><ComercialConfirmacaoPage /></ProtectedRoute>} />
        <Route path="/comercial" element={<ProtectedRoute><CommercialPage /></ProtectedRoute>} />
        <Route path="/pedido-suporte/liberacao" element={<ProtectedRoute><PedidoSuporteLiberacaoPage /></ProtectedRoute>} />
        <Route path="/pedido-suporte" element={<ProtectedRoute><PedidoSuportePage /></ProtectedRoute>} />
        <Route path="/producao" element={<ProtectedRoute><ProducaoPage /></ProtectedRoute>} />
        <Route path="/pedidos" element={<ProtectedRoute><PedidosPage /></ProtectedRoute>} />
        <Route path="/painel-pedidos" element={<ProtectedRoute><PainelPedidosPage /></ProtectedRoute>} />
        <Route path="/atualizacao-status" element={<ProtectedRoute><AtualizacaoStatusPage /></ProtectedRoute>} />
        <Route path="/carregamento" element={<ProtectedRoute><CarregamentosHub /></ProtectedRoute>} />
        <Route path="/carregamento/novo" element={<ProtectedRoute><CreateCarregamento /></ProtectedRoute>} />
        <Route path="/carregamento/editar/:id" element={<ProtectedRoute><CreateCarregamento /></ProtectedRoute>} />
        <Route path="/financeiro" element={<ProtectedRoute><FinancialPage /></ProtectedRoute>} />
        <Route path="/protocolo-financeiro" element={<ProtectedRoute><ProtocoloFinanceiroPage /></ProtectedRoute>} />
        <Route path="/prioridades" element={<ProtectedRoute><PrioridadesPage /></ProtectedRoute>} />
        <Route path="/usuarios" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
        <Route path="/permissoes" element={<ProtectedRoute><PermissoesPage /></ProtectedRoute>} />
        <Route path="/painel-tv" element={<PainelTVPage />} />
        <Route path="/analise-pedidos" element={<ProtectedRoute><AnalisePedidosPage /></ProtectedRoute>} />
        <Route path="/controle-prazos" element={<ProtectedRoute><ControlePrazos /></ProtectedRoute>} />
        <Route path="/pedidos-excluidos" element={<ProtectedRoute><PedidosExcluidosPage /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

const App = () => {
  return (
    <AppProvider>
      <PrioridadesProvider>
        <AtencaoProvider>
          <ToastProvider>
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <PageTabsProvider>
                <AppRoutes />
              </PageTabsProvider>
            </Router>
          </ToastProvider>
        </AtencaoProvider>
      </PrioridadesProvider>
    </AppProvider>
  );
};

export default App;
