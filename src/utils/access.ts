export type UserRole = 'ADMIN' | 'FATURAMENTO' | 'COMERCIAL' | 'PRODUCAO' | 'LOGISTICA';

export type AppRouteKey =
  | 'dashboard'
  | 'representantes'
  | 'motoristas'
  | 'usuarios'
  | 'comercial'
  | 'comercial-liberacao'
  | 'pedido-suporte'
  | 'pedido-suporte-liberacao'
  | 'producao'
  | 'programacao'
  | 'financeiro'
  | 'painel-pedidos'
  | 'atualizacao-status';

export type MenuItem =
  | { type: 'link'; label: string; href: string; icon: 'dashboard' | 'users' | 'truck' | 'box' | 'file' | 'credit-card' }
  | { type: 'group'; label: string; icon: 'users' | 'box'; items: { label: string; href: string }[] };

export const roleLabel: Record<UserRole, string> = {
  ADMIN: 'ADMIN',
  FATURAMENTO: 'FATURAMENTO',
  COMERCIAL: 'COMERCIAL',
  PRODUCAO: 'PRODUÇÃO',
  LOGISTICA: 'LOGÍSTICA',
};

export const roleBadgeClassName: Record<UserRole, string> = {
  ADMIN: 'bg-blue-600 text-white',
  FATURAMENTO: 'bg-emerald-600 text-white',
  COMERCIAL: 'bg-orange-600 text-white',
  PRODUCAO: 'bg-[#FEF3C7] text-[#92400E]',
  LOGISTICA: 'bg-purple-600 text-white',
};

export const routeAccess: Record<AppRouteKey, UserRole[]> = {
  dashboard: ['ADMIN'],
  representantes: ['ADMIN', 'FATURAMENTO', 'COMERCIAL'],
  motoristas: ['ADMIN', 'FATURAMENTO'],
  usuarios: ['ADMIN'],
  comercial: ['ADMIN', 'COMERCIAL', 'LOGISTICA'],
  'comercial-liberacao': ['ADMIN', 'COMERCIAL'],
  'pedido-suporte': ['ADMIN', 'COMERCIAL'],
  'pedido-suporte-liberacao': ['ADMIN', 'COMERCIAL'],
  producao: ['ADMIN', 'PRODUCAO'],
  programacao: ['ADMIN', 'FATURAMENTO'],
  financeiro: ['ADMIN', 'FATURAMENTO'],
  'painel-pedidos': ['ADMIN', 'FATURAMENTO', 'COMERCIAL', 'PRODUCAO'],
  'atualizacao-status': ['ADMIN', 'LOGISTICA'],
};

export function canAccessRoute(role: UserRole, pathname: string): boolean {
  const path = pathname.split('?')[0].split('#')[0];

  if (path === '/' || path === '/dashboard') return routeAccess.dashboard.includes(role);
  if (path === '/representantes') return routeAccess.representantes.includes(role);
  if (path === '/motoristas') return routeAccess.motoristas.includes(role);
  if (path === '/usuarios') return routeAccess.usuarios.includes(role);
  if (path === '/comercial/liberacao') return routeAccess['comercial-liberacao'].includes(role);
  if (path === '/comercial') return routeAccess.comercial.includes(role);
  if (path === '/pedido-suporte/liberacao') return routeAccess['pedido-suporte-liberacao'].includes(role);
  if (path === '/pedido-suporte') return routeAccess['pedido-suporte'].includes(role);
  if (path === '/producao') return routeAccess.producao.includes(role);
  if (path.startsWith('/carregamento')) return routeAccess.programacao.includes(role);
  if (path === '/financeiro') return routeAccess.financeiro.includes(role);
  if (path.startsWith('/painel-pedidos')) return routeAccess['painel-pedidos'].includes(role);
  if (path.startsWith('/atualizacao-status')) return routeAccess['atualizacao-status'].includes(role);
  if (path === '/acesso-negado') return true;
  if (path === '/login') return true;

  return true;
}

export function getMenuForRole(role: UserRole): MenuItem[] {
  if (role === 'ADMIN') {
    return [
      { type: 'link', label: 'Dashboard', href: '/', icon: 'dashboard' },
      {
        type: 'group',
        label: 'Operacional',
        icon: 'box',
        items: [
          { label: 'Pedidos de Venda', href: '/comercial' },
          { label: 'Atualização de Status', href: '/atualizacao-status' },
          { label: 'Liberação de Pedidos', href: '/comercial/liberacao' },
          { label: 'Programação de Carregamento', href: '/carregamento' },
          { label: 'Financeiro', href: '/financeiro' },
          { label: 'Painel de Pedidos', href: '/painel-pedidos' },
          { label: 'Pedido Suporte', href: '/pedido-suporte' },
          { label: 'Produção', href: '/producao' },
        ],
      },
      {
        type: 'group',
        label: 'Cadastro',
        icon: 'users',
        items: [
          { label: 'Representantes', href: '/representantes' },
          { label: 'Motoristas', href: '/motoristas' },
          { label: 'Usuários', href: '/usuarios' },
        ],
      },
    ];
  }

  if (role === 'FATURAMENTO') {
    return [
      {
        type: 'group',
        label: 'Operacional',
        icon: 'box',
        items: [
          { label: 'Programação de Carregamento', href: '/carregamento' },
          { label: 'Financeiro', href: '/financeiro' },
        ],
      },
      {
        type: 'group',
        label: 'Cadastro',
        icon: 'users',
        items: [
          { label: 'Representantes', href: '/representantes' },
          { label: 'Motoristas', href: '/motoristas' },
        ],
      },
    ];
  }

  if (role === 'PRODUCAO') {
    return [
      {
        type: 'group',
        label: 'Operacional',
        icon: 'box',
        items: [
          { label: 'Programação de Carregamento', href: '/carregamento' },
          { label: 'Painel de Pedidos', href: '/painel-pedidos' },
        ],
      },
    ];
  }

  if (role === 'LOGISTICA') {
    return [
      {
        type: 'group',
        label: 'Operacional',
        icon: 'box',
        items: [
          { label: 'Pedidos de Venda', href: '/comercial' },
          { label: 'Atualização de Status', href: '/atualizacao-status' },
        ],
      },
    ];
  }

  // COMERCIAL
  return [
    {
      type: 'group',
      label: 'Operacional',
      icon: 'box',
      items: [
        { label: 'Pedidos de Venda', href: '/comercial' },
        { label: 'Liberação de Pedidos', href: '/comercial/liberacao' },
        { label: 'Painel de Pedidos', href: '/painel-pedidos' },
      ],
    },
    {
      type: 'group',
      label: 'Cadastro',
      icon: 'users',
      items: [{ label: 'Representantes', href: '/representantes' }],
    },
  ];
}

export function getHomePathForRole(role: UserRole): string {
  if (role === 'ADMIN') return '/';
  if (role === 'FATURAMENTO') return '/carregamento';
  if (role === 'COMERCIAL') return '/comercial';
  if (role === 'LOGISTICA') return '/atualizacao-status';
  if (role === 'PRODUCAO') return '/carregamento';
  return '/comercial';
}
