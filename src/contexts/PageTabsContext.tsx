import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { getHomePathForRole, UserRole } from '@/utils/access';

/**
 * Navegação por abas (estilo navegador): cada página aberta vira uma aba, com
 * uma aba fixa "Início". Estado vive acima das rotas (o MainLayout remonta a
 * cada navegação), então persiste durante a sessão + sessionStorage.
 *
 * Cada aba é única por `path` (pathname) — hubs como /pedidos e /carregamento
 * são UMA aba só — mas guarda o `href` completo (pathname + query) da última
 * visita, para restaurar a sub-aba (?tab=...) ao voltar.
 */

const PAGE_TABS_KEY = 'page_tabs';
const NON_TABBABLE = new Set(['/login', '/acesso-negado', '/painel-tv']);

export type PageTab = { path: string; href: string };

type PageTabsCtx = {
  tabs: PageTab[];
  homePath: string;
  /** pathname ativo no momento. */
  activePath: string;
  goHome: () => void;
  goTo: (href: string) => void;
  closeTab: (path: string) => void;
};

const Ctx = createContext<PageTabsCtx | null>(null);

export const usePageTabs = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePageTabs must be used within PageTabsProvider');
  return c;
};

const readStored = (): PageTab[] => {
  try {
    const v = JSON.parse(sessionStorage.getItem(PAGE_TABS_KEY) || '[]');
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => (typeof x === 'string' ? { path: x, href: x } : x))
      .filter((x): x is PageTab => !!x && typeof x.path === 'string' && typeof x.href === 'string');
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

  const [tabs, setTabs] = useState<PageTab[]>(readStored);

  const path = location.pathname;
  const href = path + location.search;
  const isHome = path === homePath || path === '/';

  // Abre/atualiza a aba da rota atual (uma por pathname; guarda a última query).
  useEffect(() => {
    if (NON_TABBABLE.has(path) || isHome) return;
    setTabs((prev) => {
      const i = prev.findIndex((t) => t.path === path);
      if (i === -1) return [...prev, { path, href }];
      if (prev[i].href === href) return prev;
      const next = prev.slice();
      next[i] = { path, href };
      return next;
    });
  }, [path, href, isHome]);

  useEffect(() => {
    sessionStorage.setItem(PAGE_TABS_KEY, JSON.stringify(tabs));
  }, [tabs]);

  const goHome = useCallback(() => navigate(homePath), [navigate, homePath]);
  const goTo = useCallback((h: string) => navigate(h), [navigate]);

  const closeTab = useCallback((p: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === p);
      if (idx === -1) return prev;
      const next = prev.filter((t) => t.path !== p);
      if (p === location.pathname) {
        const dest = next[idx]?.href ?? next[idx - 1]?.href ?? homePath;
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
