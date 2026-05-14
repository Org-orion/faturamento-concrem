import React from 'react';
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
  const location = useLocation();
  const label = routeLabels[location.pathname] || 'Sistema';

  return (
    <header
      className="sticky top-0 z-30 h-14 flex items-center justify-between px-4 lg:px-6 shrink-0"
      style={{
        background: 'hsl(var(--card))',
        borderBottom: '1px solid hsl(var(--border))',
      }}
    >
      <div className="flex items-center gap-3">
        <div className="lg:hidden w-10" />{/* espaço para o botão de menu mobile */}
        <div className="w-1 h-4 rounded-full bg-primary opacity-80" />
        <h2 className="text-sm font-display font-semibold text-foreground/90 tracking-wide">
          {label}
        </h2>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden sm:block text-[10px] font-mono-data text-muted-foreground/40 uppercase tracking-widest">
          Faturamento & Logística
        </span>
      </div>
    </header>
  );
};
