import React from 'react';
import { useSidebar } from './MainLayout';
import { useLocation } from 'react-router-dom';

const routeLabels: Record<string, string> = {
  '/': 'Dashboard',
  '/representantes': 'Clientes',
  '/motoristas': 'Motoristas',
  '/comercial': 'Pedidos de Venda',
  '/comercial/liberacao': 'Liberação de Pedidos',
  '/pedido-suporte': 'Pedido Suporte',
  '/pedido-suporte/liberacao': 'Liberação Suporte',
  '/producao': 'Programação de Carregamento',
  '/painel-pedidos': 'Painel de Pedidos',
  '/atualizacao-status': 'Atualização de Status',
  '/carregamento': 'Carregamento',
  '/financeiro': 'Financeiro',
  '/usuarios': 'Usuários',
};

export const Header: React.FC = () => {
  const { isCollapsed } = useSidebar();
  const location = useLocation();
  const label = routeLabels[location.pathname] || 'Sistema';

  return (
    <header
      className="fixed top-0 right-0 h-14 z-30 flex items-center justify-between px-6 transition-all duration-300"
      style={{
        left: isCollapsed ? '64px' : '256px',
        background: 'hsl(var(--card))',
        borderBottom: '1px solid hsl(var(--border))',
      }}
    >
      <div className="flex items-center gap-3">
        <div className="w-1 h-4 rounded-full bg-primary opacity-80" />
        <h2 className="text-sm font-display font-semibold text-foreground/90 tracking-wide">
          {label}
        </h2>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono-data text-muted-foreground/40 uppercase tracking-widest">
          Faturamento & Logística
        </span>
      </div>
    </header>
  );
};
