import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Truck,
  FileText,
  Package,
  CreditCard,
  ChevronDown,
  LogOut,
  ClipboardList,
  TriangleAlert,
  Factory,
  Monitor,
  BarChart2,
  DollarSign,
  Clock,
  Trash2,
  Sun,
  Moon,
  Menu,
  X,
} from 'lucide-react';
import { useSidebar } from './MainLayout';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Link, useLocation } from 'react-router-dom';
import logo from '@/assets/logo-sidebar.png';
import logoMini from '@/assets/logo-mini.png';
import { useApp } from '@/contexts/AppContext';
import {
  getMenuForRole,
  getMenuByFuncionalidades,
  MenuItem,
  UserRole,
  roleLabel,
} from '@/utils/access';
import { Funcionalidade } from '@/types/permissions';
import { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------
const iconMap = {
  dashboard: LayoutDashboard,
  users: Users,
  truck: Truck,
  box: Package,
  file: FileText,
  'credit-card': CreditCard,
  'clipboard-list': ClipboardList,
  flame: TriangleAlert,
  factory: Factory,
  monitor: Monitor,
  'bar-chart-2': BarChart2,
  'dollar-sign': DollarSign,
  clock: Clock,
  'trash-2': Trash2,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type MenuChild = { title: string; href: string; icon?: LucideIcon };
type MenuLink = { title: string; href: string; icon: LucideIcon };
type MenuGroup = { title: string; icon: LucideIcon; children: MenuChild[] };
type SidebarNavItem = MenuLink | MenuGroup;

// ---------------------------------------------------------------------------
// Section grouping: maps hrefs / group titles to nav sections
// ---------------------------------------------------------------------------
type NavSection = { label: string; items: SidebarNavItem[] };

const HREF_TO_SECTION: Record<string, string> = {
  '/': 'OPERAÇÃO',
  '/pedidos': 'OPERAÇÃO',
  '/prioridades': 'OPERAÇÃO',
  '/atualizacao-status': 'OPERAÇÃO',
  '/producao': 'GESTÃO',
  '/carregamento': 'GESTÃO',
  '/agrupamento-pedidos': 'GESTÃO',
  '/financeiro': 'FINANCEIRO',
  '/protocolo-financeiro': 'FINANCEIRO',
  '/painel-pedidos': 'ANÁLISES',
  '/painel-tv': 'ANÁLISES',
  '/analise-pedidos': 'ANÁLISES',
  '/pedidos-excluidos': 'SISTEMA',
};

const GROUP_TITLE_TO_SECTION: Record<string, string> = {
  Cadastro: 'SISTEMA',
};

const SECTION_ORDER = ['OPERAÇÃO', 'GESTÃO', 'FINANCEIRO', 'ANÁLISES', 'SISTEMA'];

function groupIntoSections(items: SidebarNavItem[]): NavSection[] {
  const map = new Map<string, SidebarNavItem[]>(
    SECTION_ORDER.map((s) => [s, []])
  );
  const fallback = 'OPERAÇÃO';

  for (const item of items) {
    if ('children' in item) {
      const section = GROUP_TITLE_TO_SECTION[item.title] ?? fallback;
      map.get(section)!.push(item);
    } else {
      const section = HREF_TO_SECTION[item.href] ?? fallback;
      map.get(section)!.push(item);
    }
  }

  return SECTION_ORDER.filter((s) => (map.get(s)?.length ?? 0) > 0).map(
    (s) => ({ label: s, items: map.get(s)! })
  );
}

// ---------------------------------------------------------------------------
// Menu builder
// ---------------------------------------------------------------------------
const asMenuItems = (
  role: UserRole | undefined,
  permissions?: import('@/utils/access').PagePermission[] | null,
  funcionalidades?: Funcionalidade[] | null
): SidebarNavItem[] => {
  const items: MenuItem[] =
    funcionalidades && role !== 'ADMIN'
      ? getMenuByFuncionalidades(funcionalidades)
      : getMenuForRole(role || 'ADMIN', permissions);
  return items.map((it): SidebarNavItem => {
    if (it.type === 'link') {
      return { title: it.label, href: it.href, icon: iconMap[it.icon] };
    }
    return {
      title: it.label,
      icon: iconMap[it.icon],
      children: it.items.map((c) => ({ title: c.label, href: c.href, icon: FileText })),
    };
  });
};

// ---------------------------------------------------------------------------
// User initials helper
// ---------------------------------------------------------------------------
function initials(name: string | undefined | null): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? 'U';
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

// ---------------------------------------------------------------------------
// Theme toggle hook (toggles `dark` class on <html>)
// ---------------------------------------------------------------------------
function useTheme() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  );
  const toggle = () => {
    document.documentElement.classList.toggle('dark');
    setDark((d) => !d);
  };
  return { dark, toggle };
}

// ---------------------------------------------------------------------------
// Sidebar component
// ---------------------------------------------------------------------------
export const Sidebar: React.FC = () => {
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { user, logout } = useApp();
  const location = useLocation();
  const { dark, toggle: toggleTheme } = useTheme();

  const menuItems = asMenuItems(user?.role, user?.permissions, user?.funcionalidades);
  const sections = groupIntoSections(menuItems);

  // All groups open by default; collapse when user explicitly toggles
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  // Mobile drawer state
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isActive = (href: string) => {
    if (href === '/' || href === '/dashboard') return location.pathname === '/' || location.pathname === '/dashboard';
    return location.pathname.startsWith(href);
  };

  const toggleGroup = (title: string) => {
    if (isCollapsed) return;
    setOpenGroups((prev) => ({ ...prev, [title]: !(prev[title] !== false) }));
  };

  // -------------------------------------------------------------------------
  // Nav item — link
  // -------------------------------------------------------------------------
  const NavLink = ({ item }: { item: MenuLink }) => {
    const active = isActive(item.href);
    const isExternal = item.href === '/painel-tv';

    const inner = (
      <div
        className={cn(
          'relative flex items-center h-8 rounded-md transition-all duration-150 group/navlink',
          isCollapsed ? 'justify-center w-10 mx-auto' : 'gap-2.5 px-3',
          active
            ? 'bg-emerald-500/10 text-emerald-300 font-semibold'
            : 'text-white hover:bg-white/5 font-normal'
        )}
      >
        {active && !isCollapsed && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-emerald-400 rounded-r-full" />
        )}
        <item.icon
          className={cn(
            'shrink-0 transition-colors',
            isCollapsed ? 'h-[17px] w-[17px]' : 'h-[15px] w-[15px]',
            active ? 'text-emerald-400' : 'text-white/60 group-hover/navlink:text-white'
          )}
        />
        {!isCollapsed && (
          <span className="truncate text-[13px] leading-none">{item.title}</span>
        )}
      </div>
    );

    const linkEl = isExternal ? (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className="block">
        {inner}
      </a>
    ) : (
      <Link to={item.href ?? '#'} className="block">
        {inner}
      </Link>
    );

    if (isCollapsed) {
      return (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
            <TooltipContent
              side="right"
              className="bg-zinc-900 text-white border border-white/10 text-xs rounded-lg px-2.5 py-1.5"
            >
              {item.title}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return linkEl;
  };

  // -------------------------------------------------------------------------
  // Nav item — collapsible group
  // -------------------------------------------------------------------------
  const NavGroupItem = ({ item }: { item: MenuGroup }) => {
    const isOpen = openGroups[item.title] !== false; // open by default
    const hasActiveChild = item.children.some((c) => isActive(c.href));

    if (isCollapsed) {
      return (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  'w-10 mx-auto flex items-center justify-center h-8 rounded-md transition-all duration-150',
                  hasActiveChild
                    ? 'bg-emerald-500/10 text-emerald-300'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                )}
              >
                <item.icon className="h-[17px] w-[17px] shrink-0" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              className="bg-zinc-900 text-white border border-white/10 text-xs p-0 overflow-hidden rounded-xl shadow-xl min-w-[160px]"
            >
              <div className="px-3 py-2 border-b border-white/10 font-bold text-[10px] uppercase tracking-widest text-emerald-400">
                {item.title}
              </div>
              <div className="flex flex-col py-1">
                {item.children.map((child) => (
                  <Link
                    key={child.href}
                    to={child.href}
                    className={cn(
                      'px-3 py-2 text-[13px] transition-colors block',
                      isActive(child.href)
                        ? 'text-emerald-300 bg-emerald-500/10'
                        : 'text-white hover:bg-white/5'
                    )}
                  >
                    {child.title}
                  </Link>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <div>
        <button
          onClick={() => toggleGroup(item.title)}
          className={cn(
            'w-full flex items-center justify-between h-8 px-3 rounded-md transition-all duration-150 group/group',
            hasActiveChild && !isOpen
              ? 'text-emerald-300'
              : 'text-white hover:bg-white/5'
          )}
        >
          <div className="flex items-center gap-2.5">
            <item.icon
              className={cn(
                'h-[15px] w-[15px] shrink-0 transition-colors',
                hasActiveChild && !isOpen
                  ? 'text-emerald-400'
                  : 'text-white/60 group-hover/group:text-white'
              )}
            />
            <span className="text-[13px] leading-none font-normal truncate">{item.title}</span>
          </div>
          <ChevronDown
            className={cn(
              'h-3 w-3 shrink-0 transition-transform duration-200 text-white/30',
              !isOpen && '-rotate-90'
            )}
          />
        </button>

        <div
          className={cn(
            'overflow-hidden transition-all duration-300 ease-in-out',
            isOpen ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          <div className="ml-4 mt-0.5 border-l border-white/[8%] pl-3 space-y-0.5 pb-0.5">
            {item.children.map((child) => {
              const active = isActive(child.href);
              return (
                <Link key={child.href} to={child.href} className="block">
                  <div
                    className={cn(
                      'relative h-7 flex items-center px-2 rounded-md text-[12px] transition-all duration-150',
                      active
                        ? 'text-emerald-300 font-semibold bg-emerald-500/10'
                        : 'text-white hover:bg-white/5 font-normal'
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-emerald-400 rounded-r-full" />
                    )}
                    <span className="truncate">{child.title}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Section header
  // -------------------------------------------------------------------------
  const SectionLabel = ({ label }: { label: string }) => {
    if (isCollapsed) {
      return <div className="h-px mx-1 my-2 bg-white/[8%]" />;
    }
    return (
      <div className="pt-4 pb-1.5 px-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/20 select-none">
          {label}
        </span>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Sidebar body (shared between desktop and mobile drawer)
  // -------------------------------------------------------------------------
  const SidebarBody = () => (
    <>
      {/* Header */}
      <div
        className={cn(
          'shrink-0 flex items-center cursor-pointer select-none transition-all duration-200',
          isCollapsed ? 'h-14 justify-center px-0' : 'h-14 px-3 gap-3'
        )}
        onClick={toggleSidebar}
      >
        <div
          className={cn(
            'shrink-0 rounded-lg overflow-hidden flex items-center justify-center',
            isCollapsed ? 'w-9 h-9' : 'w-8 h-8'
          )}
        >
          <img
            src={isCollapsed ? logoMini : logoMini}
            alt="Logo"
            className="w-full h-full object-contain"
          />
        </div>

        {!isCollapsed && (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-bold text-white leading-none tracking-tight">
                Concrem
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 leading-none tracking-wider uppercase">
                PROD
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-[5px] h-[5px] rounded-full bg-emerald-400 shrink-0" />
              <span className="text-[11px] text-white/[35%] leading-none">Operação estável</span>
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-px mx-3 bg-white/[6%] shrink-0" />

      {/* Navigation */}
      <nav
        className={cn(
          'flex-1 overflow-y-auto overflow-x-hidden py-2',
          isCollapsed ? 'px-1.5 flex flex-col items-center gap-0.5' : 'px-2'
        )}
      >
        {sections.map((section) => (
          <div key={section.label} className={isCollapsed ? 'w-full' : undefined}>
            <SectionLabel label={section.label} />
            <div className={cn('space-y-0.5', isCollapsed && 'flex flex-col items-center gap-0.5 space-y-0')}>
              {section.items.map((item) =>
                'children' in item ? (
                  <NavGroupItem key={item.title} item={item} />
                ) : (
                  <NavLink key={item.href} item={item} />
                )
              )}
            </div>
          </div>
        ))}
      </nav>

      {/* Divider */}
      <div className="h-px mx-3 bg-white/[6%] shrink-0" />

      {/* Footer */}
      <div
        className={cn(
          'shrink-0 py-2.5',
          isCollapsed ? 'px-1.5 flex flex-col items-center gap-1.5' : 'px-2'
        )}
      >
        {isCollapsed ? (
          <>
            {/* Avatar */}
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/[15%] border border-emerald-500/20 flex items-center justify-center cursor-default shrink-0">
                    <span className="text-[11px] font-bold text-emerald-300 leading-none">
                      {initials(user?.name)}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-zinc-900 text-white border border-white/10 text-xs rounded-lg">
                  {user?.name || 'Usuário'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Theme toggle */}
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleTheme}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
                  >
                    {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-zinc-900 text-white border border-white/10 text-xs rounded-lg">
                  {dark ? 'Modo claro' : 'Modo escuro'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Logout */}
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={logout}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-zinc-900 text-white border border-white/10 text-xs rounded-lg">
                  Sair
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        ) : (
          <div className="flex items-center gap-2">
            {/* Avatar + user info */}
            <div className="flex items-center gap-2 flex-1 min-w-0 px-1 py-1 rounded-lg hover:bg-white/5 transition-colors cursor-default">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/[15%] border border-emerald-500/20 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-emerald-300 leading-none">
                  {initials(user?.name)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-white leading-none truncate">
                  {user?.name || 'Usuário'}
                </p>
                <p className="text-[10px] text-white/30 uppercase tracking-wide leading-none mt-0.5 truncate">
                  {user?.role ? roleLabel[user.role as UserRole] : 'ADMIN'}
                </p>
              </div>
            </div>

            {/* Theme toggle */}
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleTheme}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-white/[25%] hover:text-white/60 hover:bg-white/5 transition-colors shrink-0"
                  >
                    {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-zinc-900 text-white border border-white/10 text-xs rounded-lg">
                  {dark ? 'Modo claro' : 'Modo escuro'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Logout */}
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={logout}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-white/[25%] hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-zinc-900 text-white border border-white/10 text-xs rounded-lg">
                  Sair
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile/tablet toggle button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 w-9 h-9 rounded-lg flex items-center justify-center bg-zinc-900 border border-white/10 text-white/70 hover:text-white shadow-lg transition-colors"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Mobile/tablet overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile/tablet drawer */}
      <aside
        className={cn(
          'lg:hidden fixed left-0 top-0 h-screen z-50 w-56 flex flex-col transition-transform duration-300 ease-in-out no-print',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{
          background: 'hsl(var(--sidebar-background))',
          borderRight: '1px solid hsl(var(--sidebar-border))',
        }}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <SidebarBody />
      </aside>

      {/* Desktop sidebar (lg+) — flex-child normal, nunca rola com o conteúdo */}
      <aside
        className={cn(
          'hidden lg:flex shrink-0 h-screen sticky top-0 z-40 flex-col transition-[width] duration-300 ease-in-out no-print',
          isCollapsed ? 'w-[72px]' : 'w-56'
        )}
        style={{
          background: 'hsl(var(--sidebar-background))',
          borderRight: '1px solid hsl(var(--sidebar-border))',
        }}
      >
        <SidebarBody />
      </aside>
    </>
  );
};
