import React from 'react';
import { useSidebar } from './MainLayout';

export const Header: React.FC = () => {
  const { isCollapsed } = useSidebar();

  return (
    <header 
      className="fixed top-0 right-0 h-16 bg-white border-b border-border z-30 flex items-center justify-start px-6 transition-all duration-300"
      style={{ left: isCollapsed ? '64px' : '256px' }}
    >
      <div className="flex items-center gap-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Sistema de Faturamento</h2>
      </div>
    </header>
  );
};
