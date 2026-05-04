import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from '@/contexts/AppContext';
import { ToastProvider } from '@/components/ToastProvider';
import { MainLayout } from '@/components/Layout/MainLayout';
import SkeletonLoader from '@/components/SkeletonLoader';
import { canAccessRoute } from '@/utils/access';
import { PrioridadesProvider } from '@/contexts/PrioridadesContext';
import { AtencaoProvider } from '@/contexts/AtencaoContext';

// Lazy loading pages
const Login = lazy(() => import('@/pages/Login'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const ClientsPage = lazy(() => import('@/pages/Clients'));
const DriversPage = lazy(() => import('@/pages/Drivers'));
const CarregamentosHub = lazy(() => import('@/pages/CarregamentosHub'));
const CreateCarregamento = lazy(() => import('@/pages/CreateShipment'));
const FinancialPage = lazy(() => import('@/pages/Financial'));
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

const AppRoutes = () => {
  return (
    <Suspense fallback={<SkeletonLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/acesso-negado" element={<ProtectedRoute><AccessDenied /></ProtectedRoute>} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
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
        <Route path="/prioridades" element={<ProtectedRoute><PrioridadesPage /></ProtectedRoute>} />
        <Route path="/usuarios" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
        <Route path="/permissoes" element={<ProtectedRoute><PermissoesPage /></ProtectedRoute>} />
        <Route path="/painel-tv" element={<PainelTVPage />} />
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
            <Router>
              <AppRoutes />
            </Router>
          </ToastProvider>
        </AtencaoProvider>
      </PrioridadesProvider>
    </AppProvider>
  );
};

export default App;
