import React, { createContext, useContext, useState } from 'react';
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

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleSidebar = () => setIsCollapsed(prev => !prev);

  return (
    <SidebarContext.Provider value={{ isCollapsed, setIsCollapsed, toggleSidebar }}>
      <div className="flex min-h-screen bg-background font-sans">
        <Sidebar />
        <div 
          className="flex-1 flex flex-col transition-all duration-300 ease-in-out"
          style={{ marginLeft: isCollapsed ? '64px' : '256px' }}
        >
          <Header />
          <main className="p-8 mt-16 flex-1">
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
