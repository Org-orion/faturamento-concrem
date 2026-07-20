import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { getHomePathForRole, UserRole } from '@/utils/access';

/**
 * Navegação por abas (estilo navegador): cada página aberta vira uma aba, com
 * uma aba fixa "Início". Estado vive acima das rotas (o MainLayout remonta a
 * cada navegação), então persiste durante a sessão + sessionStorage.
 */

const PAGE_TABS_KEY = 'page_tabs';
// Rotas que nunca viram aba.
const NON_TABBABLE = new Set(['/login', '/acesso-negado', '/painel-tv']);

type PageTabsCtx = {
  /** pathnames abertos (fora a Início). */
  tabs: string[];
  /** pathname da Início (home do usuário). */
  homePath: string;
  /** pathname ativo no momento. */
  activePath: string;
  goHome: () => void;
  goTo: (path: string) => void;
  closeTab: (path: string) => void;
};

const Ctx = createContext<PageTabsCtx | null>(null);

export const usePageTabs = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePageTabs must be used within PageTabsProvider');
  return c;
};

const readStored = (): string[] => {
  try {
    const v = JSON.parse(sessionStorage.getItem(PAGE_TABS_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

export function PageTabsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const homePath = useMemo(
    () => (user ? getHomePathForRole(user.role as UserRole, user.permissions) : '/'),
    [user],
  );

  const [tabs, setTabs] = useState<string[]>(readStored);

  const path = location.pathname;
  const isHome = path === homePath || path === '/';

  // Abre/garante a aba da rota atual (exceto Início e rotas não-tabuláveis).
  useEffect(() => {
    if (NON_TABBABLE.has(path) || isHome) return;
    setTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
  }, [path, isHome]);

  useEffect(() => {
    sessionStorage.setItem(PAGE_TABS_KEY, JSON.stringify(tabs));
  }, [tabs]);

  const goHome = useCallback(() => navigate(homePath), [navigate, homePath]);
  const goTo = useCallback((p: string) => navigate(p), [navigate]);

  const closeTab = useCallback((p: string) => {
    setTabs((prev) => {
      const idx = prev.indexOf(p);
      if (idx === -1) return prev;
      const next = prev.filter((x) => x !== p);
      // Se fechou a aba ativa, vai para a vizinha (ou Início).
      if (p === location.pathname) {
        const dest = next[idx] ?? next[idx - 1] ?? homePath;
        navigate(dest);
      }
      return next;
    });
  }, [location.pathname, homePath, navigate]);

  const value = useMemo<PageTabsCtx>(
    () => ({ tabs, homePath, activePath: path, goHome, goTo, closeTab }),
    [tabs, homePath, path, goHome, goTo, closeTab],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
