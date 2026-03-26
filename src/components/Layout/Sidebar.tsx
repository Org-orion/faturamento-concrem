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
  LogOut
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
import { getMenuForRole, MenuItem, UserRole } from '@/utils/access';
import { LucideIcon } from 'lucide-react';

const iconMap = {
  dashboard: LayoutDashboard,
  users: Users,
  truck: Truck,
  box: Package,
  file: FileText,
  'credit-card': CreditCard,
} as const;

type MenuChild = { title: string; href: string; icon?: LucideIcon };
type MenuLink = { title: string; href: string; icon: LucideIcon };
type MenuGroup = { title: string; icon: LucideIcon; children: MenuChild[] };
type SidebarNavItem = MenuLink | MenuGroup;

const asMenuItems = (role: UserRole | undefined): SidebarNavItem[] => {
  const items: MenuItem[] = getMenuForRole(role || 'ADMIN');
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
  const menuItems = asMenuItems(user?.role);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'Cadastro': true,
    'Operacional': true
  });
  
  const isActive = (href: string) => location.pathname === href;
  const toggleSection = (title: string) => {
    if (isCollapsed) return;
    setOpenSections(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const SidebarItem = ({ item }: { item: SidebarNavItem }) => {
    if ('children' in item) {
      const isOpen = openSections[item.title];
      const hasActiveChild = item.children.some((child) => isActive(child.href));
      
      if (isCollapsed) {
        return (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="sidebar"
                  className={cn(
                    "transition-all duration-200 justify-center px-0 w-full",
                    hasActiveChild && "bg-white/10 border border-white/20"
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-primary text-white border-none font-sans text-xs p-0 overflow-hidden">
                <div className="px-3 py-2 border-b border-white/10 font-bold bg-white/5">
                  {item.title}
                </div>
                <div className="flex flex-col">
                  {item.children.map((child) => (
                    <Link 
                      key={child.href} 
                      to={child.href}
                      className={cn(
                        "px-3 py-2 hover:bg-white/10 transition-colors flex items-center gap-2",
                        isActive(child.href) && "bg-white/10"
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
        <div className="mb-1">
          <Button
            variant="sidebar"
            onClick={() => toggleSection(item.title)}
            className={cn(
              "w-full justify-between transition-all duration-200 group",
              hasActiveChild && !isOpen && "bg-white/5"
            )}
          >
            <div className="flex items-center">
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="ml-3 truncate font-semibold">{item.title}</span>
            </div>
            <ChevronDown 
              className={cn(
                "h-4 w-4 transition-transform duration-200 opacity-50 group-hover:opacity-100",
                !isOpen && "-rotate-90"
              )} 
            />
          </Button>
          <div 
            className={cn(
              "overflow-hidden transition-all duration-300 ease-in-out space-y-1 pl-4 border-l border-white/10 ml-6",
              isOpen ? "max-h-[500px] opacity-100 mt-1" : "max-h-0 opacity-0"
            )}
          >
            {item.children.map((child) => {
              const active = isActive(child.href);
              return (
                <Link key={child.href} to={child.href}>
                  <Button
                    variant="sidebar"
                    className={cn(
                      "w-full justify-start h-9 text-sm font-normal",
                      active ? "bg-white/10 text-white font-medium" : "text-primary-foreground/70 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <span className="truncate">{child.title}</span>
                  </Button>
                </Link>
              );
            })}
          </div>
        </div>
      );
    }

    const active = isActive(item.href);
    
    const content = (
      <Link to={item.href || '#'}>
        <Button
          variant="sidebar"
          className={cn(
            "transition-all duration-200",
            active && "bg-white/10 border border-white/20",
            !active && "hover:bg-white/5",
            isCollapsed && "justify-center px-0",
          )}
        >
          <item.icon className="h-5 w-5 shrink-0" />
          {!isCollapsed && <span className="ml-3 truncate">{item.title}</span>}
        </Button>
      </Link>
    );

    if (isCollapsed) {
      return (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              {content}
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-primary text-white border-none font-sans text-xs">
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
        "fixed left-0 top-0 h-screen bg-primary text-primary-foreground z-40 transition-all duration-300 ease-in-out flex flex-col no-print shadow-xl",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo Section */}
      <div 
        className="h-24 flex items-center px-4 cursor-pointer overflow-hidden transition-all duration-300"
        onClick={toggleSidebar}
      >
        {isCollapsed ? (
          <div className="w-12 h-12 flex items-center justify-center mx-auto transition-all duration-300">
            <img src={logoMini} alt="Logo Mini" className="w-10 h-10 object-contain" />
          </div>
        ) : (
          <div className="flex items-center gap-3 w-full justify-center transition-all duration-300 px-2">
            <img src={logo} alt="Logo" className="h-16 w-auto object-contain max-w-full" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
        {menuItems.map((item) => (
          <SidebarItem key={'href' in item ? item.href : item.title} item={item} />
        ))}
      </nav>

      {/* Profile Section */}
      <div className="p-3 border-t border-white/10">
        <div className={cn(
          "flex",
          isCollapsed ? "flex-col items-center gap-2" : "items-center justify-between"
        )}>
          <div className={cn(
            "flex items-center gap-3 rounded-lg p-2 transition-all hover:bg-white/5 cursor-pointer",
            isCollapsed ? "justify-center w-full" : "justify-start flex-1"
          )}>
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
              <User className="h-4 w-4" />
            </div>
            {!isCollapsed && (
              <div className="overflow-hidden">
                <p className="text-sm font-medium truncate">{user?.name || 'Admin User'}</p>
                <p className="text-xs text-primary-foreground/60 truncate">{user?.username || 'admin'}</p>
              </div>
            )}
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button 
                  onClick={logout}
                  className={cn(
                    "p-2 rounded-lg hover:bg-white/10 text-primary-foreground/60 hover:text-primary-foreground transition-colors",
                    isCollapsed && "w-full flex items-center justify-center"
                  )}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Sair</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </aside>
  );
};
