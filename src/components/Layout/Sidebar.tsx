import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Truck,
  FileText,
  Package,
  CreditCard,
  ChevronDown,
  User,
  LogOut,
  ClipboardList,
  TriangleAlert,
  Factory,
} from 'lucide-react';
import { useSidebar } from './MainLayout';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Link, useLocation } from 'react-router-dom';
import logo from '@/assets/logo-sidebar.png';
import logoMini from '@/assets/logo-mini.png';
import { useApp } from '@/contexts/AppContext';
import { getMenuForRole, MenuItem, UserRole, roleLabel } from '@/utils/access';
import { LucideIcon } from 'lucide-react';

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
} as const;

type MenuChild = { title: string; href: string; icon?: LucideIcon };
type MenuLink = { title: string; href: string; icon: LucideIcon };
type MenuGroup = { title: string; icon: LucideIcon; children: MenuChild[] };
type SidebarNavItem = MenuLink | MenuGroup;

const asMenuItems = (role: UserRole | undefined, permissions?: import('@/utils/access').PagePermission[] | null): SidebarNavItem[] => {
  const items: MenuItem[] = getMenuForRole(role || 'ADMIN', permissions);
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

export const Sidebar: React.FC = () => {
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { user, logout } = useApp();
  const location = useLocation();
  const menuItems = asMenuItems(user?.role, user?.permissions);
  // All sections open by default; only collapse when user explicitly toggles
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const isActive = (href: string) => location.pathname === href;
  const toggleSection = (title: string) => {
    if (isCollapsed) return;
    setOpenSections(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const SidebarItem = ({ item }: { item: SidebarNavItem }) => {
    if ('children' in item) {
      const isOpen = openSections[item.title] !== false; // aberto por padrão
      const hasActiveChild = item.children.some((child) => isActive(child.href));

      if (isCollapsed) {
        return (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "w-full flex items-center justify-center h-10 rounded-md transition-all duration-150",
                    hasActiveChild
                      ? "bg-white/15 text-white"
                      : "text-white hover:bg-white/5"
                  )}
                >
                  <item.icon className="h-[18px] w-[18px] shrink-0" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="bg-[hsl(220_18%_9%)] text-foreground border border-border font-sans text-xs p-0 overflow-hidden rounded-lg shadow-xl"
              >
                <div className="px-3 py-2 border-b border-border font-display font-semibold text-primary text-[11px] uppercase tracking-widest">
                  {item.title}
                </div>
                <div className="flex flex-col py-1">
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      to={child.href}
                      className={cn(
                        "px-3 py-2 text-sm transition-colors",
                        isActive(child.href)
                          ? "text-primary bg-primary/10"
                          : "text-foreground/70 hover:text-foreground hover:bg-white/5"
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
        <div className="mb-0.5">
          <button
            onClick={() => toggleSection(item.title)}
            className={cn(
              "w-full flex items-center justify-between h-10 px-3 rounded-md transition-all duration-150 group",
              hasActiveChild && !isOpen
                ? "text-white"
                : "text-white hover:bg-white/5"
            )}
          >
            <div className="flex items-center gap-3">
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              <span className="text-sm font-display font-semibold truncate">{item.title}</span>
            </div>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200 opacity-40 group-hover:opacity-70",
                !isOpen && "-rotate-90"
              )}
            />
          </button>
          <div
            className={cn(
              "overflow-hidden transition-all duration-300 ease-in-out",
              isOpen ? "max-h-[500px] opacity-100 mt-0.5" : "max-h-0 opacity-0"
            )}
          >
            <div className="ml-3 pl-3 space-y-0.5">
              {item.children.map((child) => {
                const active = isActive(child.href);
                return (
                  <Link key={child.href} to={child.href}>
                    <button
                      className={cn(
                        "w-full text-left h-9 px-3 rounded-md text-sm transition-all duration-150",
                        active
                          ? "text-white font-semibold bg-white/15"
                          : "text-white font-normal hover:bg-white/5"
                      )}
                    >
                      <span className="truncate font-sans">{child.title}</span>
                    </button>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    const active = isActive(item.href);

    const content = (
      <Link to={item.href || '#'}>
        <button
          className={cn(
            "w-full flex items-center h-10 rounded-md transition-all duration-150",
            isCollapsed ? "justify-center px-0" : "gap-3 px-3",
            active
              ? "bg-white/15 text-white font-semibold pl-3"
              : "text-white font-normal pl-3 hover:bg-white/5"
          )}
        >
          <item.icon className={cn("shrink-0", isCollapsed ? "h-[18px] w-[18px]" : "h-[17px] w-[17px]")} />
          {!isCollapsed && (
            <span className="truncate text-sm font-sans">{item.title}</span>
          )}
        </button>
      </Link>
    );

    if (isCollapsed) {
      return (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>{content}</TooltipTrigger>
            <TooltipContent
              side="right"
              className="bg-[hsl(220_18%_9%)] text-foreground border border-border font-sans text-xs rounded-lg"
            >
              {item.title}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return content;
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen z-40 transition-all duration-300 ease-in-out flex flex-col no-print",
        isCollapsed ? "w-16" : "w-64"
      )}
      style={{ background: 'hsl(var(--sidebar-background))', borderRight: '1px solid hsl(var(--sidebar-border))' }}
    >
      {/* Logo */}
      <div
        className="h-16 flex items-center px-3 cursor-pointer overflow-hidden shrink-0"
        onClick={toggleSidebar}
      >
        {isCollapsed ? (
          <div className="w-10 h-10 flex items-center justify-center mx-auto">
            <img src={logoMini} alt="Logo" className="w-8 h-8 object-contain" />
          </div>
        ) : (
          <div className="flex items-center justify-center w-full px-2">
            <img src={logo} alt="Logo" className="h-10 w-auto object-contain max-w-full" />
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-px mx-3 bg-white/5 shrink-0" />

      {/* Navigation */}
      <nav className={cn("flex-1 py-3 overflow-y-auto", isCollapsed ? "px-2 space-y-1" : "px-3 space-y-0.5")}>
        {!isCollapsed && (
          <div className="px-3 pb-2">
            <span className="text-[10px] font-display font-bold uppercase tracking-[0.15em] text-sidebar-foreground/30">
              Navegação
            </span>
          </div>
        )}
        {menuItems.map((item) => (
          <SidebarItem key={'href' in item ? item.href : item.title} item={item} />
        ))}
      </nav>

      {/* Divider */}
      <div className="h-px mx-3 bg-white/5 shrink-0" />

      {/* Profile */}
      <div className={cn("shrink-0 py-3", isCollapsed ? "px-2" : "px-3")}>
        <div className={cn(
          "flex",
          isCollapsed ? "flex-col items-center gap-2" : "items-center justify-between gap-2"
        )}>
          <div className={cn(
            "flex items-center gap-3 rounded-md p-2 transition-all hover:bg-white/5 cursor-pointer min-w-0",
            isCollapsed ? "justify-center" : "flex-1"
          )}>
            <div className="w-7 h-7 rounded-md bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <User className="h-3.5 w-3.5 text-white/80" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate font-display">
                  {user?.name || 'Usuário'}
                </p>
                <p className="text-[10px] text-white/50 truncate font-sans uppercase tracking-wide">
                  {user?.role ? roleLabel[user.role as UserRole] : 'ADMIN'}
                </p>
              </div>
            )}
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={logout}
                  className={cn(
                    "p-2 rounded-md hover:bg-white/8 text-sidebar-foreground/35 hover:text-destructive transition-colors shrink-0",
                    isCollapsed && "w-full flex items-center justify-center"
                  )}
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-sans text-xs">Sair</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </aside>
  );
};
