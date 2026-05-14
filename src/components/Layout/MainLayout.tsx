import React, { createContext, useContext, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface SidebarContextType {
  isCollapsed: boolean;
  setIsCollapsed: (value: boolean) => void;
  toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
};

const isDesktop = () => typeof window !== 'undefined' && window.innerWidth >= 1024;

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isCollapsed, setIsCollapsed] = useState(() => !isDesktop());

  useEffect(() => {
    const check = () => {
      if (window.innerWidth < 1024) setIsCollapsed(true);
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const toggleSidebar = () => setIsCollapsed(prev => !prev);

  return (
    <SidebarContext.Provider value={{ isCollapsed, setIsCollapsed, toggleSidebar }}>
      {/* Outer: h-screen + overflow-hidden → body nunca rola, sidebar nunca se move */}
      <div className="flex h-screen overflow-hidden bg-background font-sans">
        <Sidebar />
        {/* Content area: flex-1 + overflow-y-auto → scroll fica aqui dentro */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto transition-[margin] duration-300 ease-in-out">
          <Header />
          <main className="p-3 md:p-4 lg:p-5 xl:p-7 flex-1">
            {children}
          </main>
          <footer className="py-4 text-center border-t border-border bg-muted/20 shrink-0">
            <p className="text-xs text-muted-foreground font-medium">
              &copy; {new Date().getFullYear()} Concrem. Todos os direitos reservados.
            </p>
          </footer>
        </div>
      </div>
    </SidebarContext.Provider>
  );
};
