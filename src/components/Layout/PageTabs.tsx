import React from 'react';
import {
  Home, X, LayoutDashboard, Users, Truck, Package, FileText, CreditCard,
  ClipboardList, TriangleAlert, Factory, Monitor, BarChart2, DollarSign, Clock, Trash2,
  type LucideIcon,
} from 'lucide-react';
import { usePageTabs } from '@/contexts/PageTabsContext';
import { getRouteLabel, getRouteIconName } from '@/utils/access';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
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
};

const TabButton: React.FC<{
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  onClose?: () => void;
}> = ({ active, icon: Icon, label, onClick, onClose }) => (
  <div
    role="tab"
    aria-selected={active}
    onClick={onClick}
    className={cn(
      'group/tab relative flex items-center gap-1.5 h-9 pl-3 shrink-0 cursor-pointer select-none border-r border-border/70 transition-colors max-w-[200px]',
      onClose ? 'pr-1.5' : 'pr-3',
      active
        ? 'bg-background text-primary font-semibold'
        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
    )}
    title={label}
  >
    {active && <span className="absolute left-0 top-0 h-[2px] w-full bg-primary" />}
    <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-primary' : 'text-muted-foreground/70')} />
    <span className="truncate text-[12px] leading-none">{label}</span>
    {onClose && (
      <button
        type="button"
        aria-label={`Fechar ${label}`}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className={cn(
          'ml-0.5 shrink-0 flex items-center justify-center w-5 h-5 rounded transition-colors',
          'text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10',
          'opacity-60 group-hover/tab:opacity-100',
        )}
      >
        <X className="h-3 w-3" />
      </button>
    )}
  </div>
);

export const PageTabs: React.FC = () => {
  const { tabs, homePath, activePath, goHome, goTo, closeTab } = usePageTabs();

  const isHome = activePath === homePath || activePath === '/';

  return (
    <div
      className="sticky top-14 z-20 flex items-stretch overflow-x-auto no-scrollbar shrink-0"
      style={{ background: 'hsl(var(--muted) / 0.4)', borderBottom: '1px solid hsl(var(--border))' }}
      role="tablist"
    >
      <TabButton active={isHome} icon={Home} label="Início" onClick={goHome} />
      {tabs.map((path) => (
        <TabButton
          key={path}
          active={path === activePath}
          icon={ICONS[getRouteIconName(path)] || ClipboardList}
          label={getRouteLabel(path)}
          onClick={() => goTo(path)}
          onClose={() => closeTab(path)}
        />
      ))}
    </div>
  );
};
