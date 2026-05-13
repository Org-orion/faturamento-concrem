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
  const [isLg, setIsLg] = useState(isDesktop);

  useEffect(() => {
    const check = () => {
      const lg = window.innerWidth >= 1024;
      setIsLg(lg);
      if (!lg) setIsCollapsed(true);
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const toggleSidebar = () => setIsCollapsed(prev => !prev);

  const marginLeft = !isLg ? 0 : isCollapsed ? 72 : 256;

  return (
    <SidebarContext.Provider value={{ isCollapsed, setIsCollapsed, toggleSidebar }}>
      <div className="flex min-h-screen bg-background font-sans">
        <Sidebar />
        <div
          className="flex-1 flex flex-col transition-all duration-300 ease-in-out"
          style={{ marginLeft }}
        >
          <Header />
          <main className="p-4 lg:p-6 xl:p-8 mt-16 flex-1">
            {children}
          </main>
          <footer className="py-4 text-center border-t border-border bg-muted/20">
            <p className="text-xs text-muted-foreground font-medium">
              &copy; {new Date().getFullYear()} Concrem. Todos os direitos reservados.
            </p>
          </footer>
        </div>
      </div>
    </SidebarContext.Provider>
  );
};
