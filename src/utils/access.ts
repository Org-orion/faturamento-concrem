import { Funcionalidade, ALL_FUNCIONALIDADES } from '@/types/permissions';
export { isSuperAdmin } from '@/types/permissions';

export type UserRole = 'ADMIN' | 'FATURAMENTO' | 'COMERCIAL' | 'PRODUCAO' | 'LOGISTICA';

export type AppRouteKey =
  | 'dashboard'
  | 'representantes'
  | 'motoristas'
  | 'usuarios'
  | 'permissoes'
  | 'comercial'
  | 'comercial-liberacao'
  | 'pedido-suporte'
  | 'pedido-suporte-liberacao'
  | 'producao'
  | 'programacao'
  | 'programacao-cronograma'
  | 'programacao-dashboard'
  | 'programacao-comercial'
  | 'financeiro'
  | 'protocolo-financeiro'
  | 'painel-pedidos'
  | 'atualizacao-status'
  | 'pedidos'
  | 'prioridades'
  | 'painel-tv'
  | 'analise-pedidos'
  | 'controle-prazos'
  | 'pedidos-excluidos';

/** Actions a user can perform on a page */
export type PageAction = 'view' | 'edit' | 'execute';

/** Per-page permission stored in DB / user session */
export type PagePermission = {
  route: AppRouteKey;
  actions: PageAction[];
};

export type MenuItem =
  | { type: 'link'; label: string; href: string; icon: 'dashboard' | 'users' | 'truck' | 'box' | 'file' | 'credit-card' | 'clipboard-list' | 'flame' | 'factory' | 'monitor' | 'bar-chart-2' | 'dollar-sign' | 'clock' | 'trash-2' }
  | { type: 'group'; label: string; icon: 'users' | 'box'; items: { label: string; href: string }[] };

// ---------------------------------------------------------------------------
// Labels & display helpers
// ---------------------------------------------------------------------------

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

export const routeLabels: Record<AppRouteKey, string> = {
  dashboard: 'Dashboard',
  representantes: 'Representantes',
  motoristas: 'Motoristas',
  usuarios: 'Usuários',
  permissoes: 'Permissões',
  comercial: 'Pedidos de Venda',
  'comercial-liberacao': 'Liberar Pedidos p/ Produção',
  'pedido-suporte': 'Pedidos de Suporte',
  'pedido-suporte-liberacao': 'Liberar Suporte p/ Produção',
  producao: 'Produção',
  programacao: 'Carregamento',
  'programacao-cronograma': 'Cronograma Carregamento',
  'programacao-dashboard': 'Dashboard Carregamento',
  'programacao-comercial': 'Programação',
  financeiro: 'Financeiro',
  'protocolo-financeiro': 'Protocolo Financeiro',
  'painel-pedidos': 'Painel de Pedidos',
  'atualizacao-status': 'Atualização de Status',
  pedidos: 'Pedidos',
  prioridades: 'Prioridades',
  'painel-tv': 'Painel TV',
  'analise-pedidos': 'Análise de Pedidos',
  'controle-prazos': 'Controle de Prazos',
  'pedidos-excluidos': 'Lixeira de Pedidos',
};

export const actionLabels: Record<PageAction, string> = {
  view: 'Visualizar',
  edit: 'Editar',
  execute: 'Executar',
};

/**
 * Which extra actions (beyond the implicit "view") are meaningful per route.
 * Routes not listed here are view-only.
 */
export const availableActionsForRoute: Partial<Record<AppRouteKey, Array<'edit' | 'execute'>>> = {
  representantes:              ['edit'],
  motoristas:                  ['edit'],
  usuarios:                    ['edit'],
  comercial:                   ['edit', 'execute'],
  'comercial-liberacao':       ['execute'],
  'pedido-suporte':            ['edit', 'execute'],
  'pedido-suporte-liberacao':  ['execute'],
  producao:                    ['execute'],
  programacao:                 ['edit'],
  'programacao-cronograma':    ['edit'],
  'programacao-dashboard':     ['edit'],
  'programacao-comercial':     ['edit'],
  financeiro:                  ['edit'],
  'protocolo-financeiro':      ['execute'],
  'atualizacao-status':        ['execute'],
  prioridades:                 ['edit'],
};

/** Routes grouped for the Users page UI */
export const routeGroups: Array<{ label: string; routes: AppRouteKey[] }> = [
  { label: 'Geral',       routes: ['dashboard', 'pedidos', 'painel-pedidos', 'atualizacao-status', 'prioridades', 'painel-tv'] },
  { label: 'Comercial',   routes: ['comercial', 'comercial-liberacao', 'pedido-suporte', 'pedido-suporte-liberacao', 'programacao-comercial'] },
  { label: 'Operacional', routes: ['producao', 'programacao', 'programacao-cronograma', 'programacao-dashboard', 'financeiro'] },
  { label: 'Cadastro',    routes: ['representantes', 'motoristas', 'usuarios', 'permissoes'] },
];

// ---------------------------------------------------------------------------
// Default permissions per role
// ---------------------------------------------------------------------------

type RoleDefault = { route: AppRouteKey; extra: Array<'edit' | 'execute'> };

const ROLE_DEFAULTS: Record<Exclude<UserRole, 'ADMIN'>, RoleDefault[]> = {
  FATURAMENTO: [
    { route: 'programacao',             extra: ['edit'] },
    { route: 'programacao-cronograma',  extra: [] },
    { route: 'programacao-dashboard',   extra: [] },
    { route: 'programacao-comercial',   extra: [] },
    { route: 'financeiro',              extra: ['edit'] },
    { route: 'representantes', extra: ['edit'] },
    { route: 'motoristas',     extra: ['edit'] },
    { route: 'painel-pedidos', extra: [] },
    { route: 'painel-tv',      extra: [] },
  ],
  COMERCIAL: [
    { route: 'representantes',             extra: ['edit'] },
    { route: 'comercial',                  extra: ['edit', 'execute'] },
    { route: 'comercial-liberacao',        extra: ['execute'] },
    { route: 'pedido-suporte',             extra: ['edit', 'execute'] },
    { route: 'pedido-suporte-liberacao',   extra: ['execute'] },
    { route: 'programacao-comercial',      extra: ['edit'] },
    { route: 'prioridades',               extra: ['edit'] },
    { route: 'painel-tv',                 extra: [] },
  ],
  LOGISTICA: [
    { route: 'pedidos',            extra: [] },
    { route: 'comercial',          extra: [] },
    { route: 'pedido-suporte',     extra: [] },
    { route: 'painel-pedidos',     extra: [] },
    { route: 'atualizacao-status', extra: ['execute'] },
    { route: 'prioridades',        extra: ['edit'] },
    { route: 'painel-tv',          extra: [] },
  ],
  PRODUCAO: [
    { route: 'producao',                extra: ['execute'] },
    { route: 'programacao',             extra: [] },
    { route: 'programacao-cronograma',  extra: [] },
    { route: 'programacao-dashboard',   extra: [] },
    { route: 'pedidos',        extra: [] },
    { route: 'painel-pedidos', extra: [] },
    { route: 'painel-tv',      extra: [] },
  ],
};

export function defaultPermissionsForRole(role: UserRole): PagePermission[] {
  if (role === 'ADMIN') {
    return (Object.keys(routeLabels) as AppRouteKey[]).map((route) => ({
      route,
      actions: ['view', ...(availableActionsForRoute[route] ?? [])] as PageAction[],
    }));
  }
  return (ROLE_DEFAULTS[role] ?? []).map(({ route, extra }) => ({
    route,
    actions: ['view', ...extra] as PageAction[],
  }));
}

// ---------------------------------------------------------------------------
// Permission checks
// ---------------------------------------------------------------------------

/** Check if a user has a specific action on a route */
export function canDo(
  role: UserRole,
  permissions: PagePermission[] | null,
  route: AppRouteKey,
  action: PageAction,
): boolean {
  if (role === 'ADMIN') return true;
  const effective = permissions ?? defaultPermissionsForRole(role);
  const perm = effective.find((p) => p.route === route);
  return perm ? perm.actions.includes(action) : false;
}

function pathnameToRouteKey(pathname: string): AppRouteKey | null {
  const path = pathname.split('?')[0].split('#')[0];
  if (path === '/' || path === '/dashboard') return 'dashboard';
  if (path === '/pedidos') return 'pedidos';
  if (path === '/representantes') return 'representantes';
  if (path === '/motoristas') return 'motoristas';
  if (path === '/usuarios') return 'usuarios';
  if (path === '/permissoes') return 'permissoes';
  if (path === '/comercial/liberacao') return 'comercial-liberacao';
  if (path === '/comercial' || path === '/comercial/confirmacao') return 'comercial';
  if (path === '/pedido-suporte/liberacao') return 'pedido-suporte-liberacao';
  if (path === '/pedido-suporte') return 'pedido-suporte';
  if (path === '/producao') return 'producao';
  if (path.startsWith('/carregamento')) return 'programacao';
  if (path === '/programacao') return 'programacao-comercial';
  if (path === '/financeiro') return 'financeiro';
  if (path === '/protocolo-financeiro') return 'protocolo-financeiro';
  if (path.startsWith('/painel-pedidos')) return 'painel-pedidos';
  if (path.startsWith('/atualizacao-status')) return 'atualizacao-status';
  if (path === '/prioridades') return 'prioridades';
  if (path === '/painel-tv') return 'painel-tv';
  if (path === '/analise-pedidos') return 'analise-pedidos';
  if (path === '/controle-prazos') return 'controle-prazos';
  if (path === '/pedidos-excluidos') return 'pedidos-excluidos';
  return null;
}

// Which funcionalidades grant viewing access to each route
export const routeToFuncionalidades: Partial<Record<AppRouteKey, Funcionalidade[]>> = {
  dashboard:                  ['dashboard.view'],
  representantes:             ['representantes.view'],
  motoristas:                 ['motoristas.view'],
  usuarios:                   ['usuarios.view'],
  permissoes:                 ['usuarios.gerenciar_grupos'],
  comercial:                  ['comercial.view'],
  'comercial-liberacao':      ['comercial.liberar_producao', 'comercial.liberar_gerencia', 'comercial.confirmar_gerencia'],
  'pedido-suporte':           ['suporte.view'],
  'pedido-suporte-liberacao': ['suporte.liberar_producao'],
  producao:                   ['producao.view'],
  programacao:                ['carregamento.view'],
  'programacao-cronograma':   ['carregamento.cronograma'],
  'programacao-dashboard':    ['carregamento.dashboard'],
  'programacao-comercial':    ['programacao_comercial.view'],
  financeiro:                 ['financeiro.view'],
  'protocolo-financeiro':     ['protocolo_financeiro.view'],
  'painel-pedidos':           ['painel_pedidos.view'],
  'atualizacao-status':       ['atualizacao_status.view'],
  'analise-pedidos':          ['analise_pedidos.view'],
  pedidos:                    ['comercial.view', 'suporte.view', 'painel_pedidos.view', 'atualizacao_status.view', 'programacao_comercial.view'],
  prioridades:                ['prioridades.view'],
  'painel-tv':                ['painel_tv.view'],
  'controle-prazos':          ['controle_prazos.view'],
  'pedidos-excluidos':        ['pedidos.gerenciar_lixeira'],
};

/** Check if a user can perform a specific named action (new group-based system) */
export function canFazer(funcionalidades: Funcionalidade[] | null | undefined, key: Funcionalidade): boolean {
  if (!funcionalidades) return false;
  return funcionalidades.includes(key);
}

/** Unified check: uses funcionalidades when set, otherwise falls back to role-based canDo */
export function can(
  user: { role?: string | null; permissions?: PagePermission[] | null; funcionalidades?: Funcionalidade[] | null } | null | undefined,
  key: Funcionalidade,
  fallbackRoute: AppRouteKey,
  fallbackPerm: PageAction = 'execute',
): boolean {
  if (!user) return false;
  if (user.funcionalidades != null) return canFazer(user.funcionalidades, key);
  return canDo((user.role as UserRole) ?? 'COMERCIAL', user.permissions ?? null, fallbackRoute, fallbackPerm);
}

export function canAccessRoute(
  role: UserRole,
  pathname: string,
  permissions?: PagePermission[] | null,
  funcionalidades?: Funcionalidade[] | null,
): boolean {
  if (role === 'ADMIN') return true;
  const path = pathname.split('?')[0].split('#')[0];
  if (path === '/acesso-negado' || path === '/login') return true;

  if (funcionalidades) {
    const funcSet = new Set(funcionalidades);
    if (path === '/pedidos') {
      const hubFuncs: Funcionalidade[] = ['comercial.view', 'suporte.view', 'painel_pedidos.view', 'atualizacao_status.view', 'programacao_comercial.view'];
      return hubFuncs.some((f) => funcSet.has(f));
    }
    if (path.startsWith('/carregamento')) return (
      funcSet.has('carregamento.view') ||
      funcSet.has('carregamento.cronograma') ||
      funcSet.has('carregamento.dashboard')
    );
    const routeKey = pathnameToRouteKey(path);
    if (routeKey === null) return true;
    const required = routeToFuncionalidades[routeKey];
    if (!required) return false;
    return required.some((f) => funcSet.has(f));
  }

  // /pedidos is the hub — allow access if the user can view any of its sub-routes
  if (path === '/pedidos') {
    const hubRoutes: AppRouteKey[] = [
      'pedidos', 'comercial', 'comercial-liberacao',
      'pedido-suporte', 'pedido-suporte-liberacao',
      'painel-pedidos', 'atualizacao-status', 'programacao-comercial',
    ];
    return hubRoutes.some((r) => canDo(role, permissions ?? null, r, 'view'));
  }

  // /carregamento is the hub — allow access if the user can view any of its sub-routes
  if (path.startsWith('/carregamento')) {
    const hubRoutes: AppRouteKey[] = ['programacao', 'programacao-cronograma', 'programacao-dashboard'];
    return hubRoutes.some((r) => canDo(role, permissions ?? null, r, 'view'));
  }

  const routeKey = pathnameToRouteKey(path);
  if (routeKey === null) return true;
  return canDo(role, permissions ?? null, routeKey, 'view');
}

// Routes that live inside the /pedidos hub — always redirect to the hub itself
const PEDIDOS_HUB_ROUTES: Set<AppRouteKey> = new Set([
  'pedidos', 'comercial', 'comercial-liberacao',
  'pedido-suporte', 'pedido-suporte-liberacao',
  'painel-pedidos', 'atualizacao-status', 'programacao-comercial',
]);

// Routes that live inside the /carregamento hub — collapse to single sidebar entry
const CARREGAMENTO_HUB_ROUTES: Set<AppRouteKey> = new Set([
  'programacao', 'programacao-cronograma', 'programacao-dashboard',
]);

export function getHomePathForRole(role: UserRole, permissions?: PagePermission[] | null): string {
  if (role === 'ADMIN') return '/';
  const effective = permissions ?? defaultPermissionsForRole(role);
  const priority: AppRouteKey[] = ['programacao', 'comercial', 'pedidos', 'painel-pedidos', 'atualizacao-status', 'financeiro', 'producao', 'dashboard'];
  for (const key of priority) {
    if (effective.some((p) => p.route === key && p.actions.includes('view'))) {
      // Routes that are tabs inside the /pedidos hub → always go to /pedidos
      if (PEDIDOS_HUB_ROUTES.has(key)) return '/pedidos';
      const def = ALL_MENU_ITEM_DEFS.find((d) => d.routeKey === key);
      if (def) return def.href;
    }
  }
  for (const def of ALL_MENU_ITEM_DEFS) {
    if (effective.some((p) => p.route === def.routeKey && p.actions.includes('view'))) {
      if (PEDIDOS_HUB_ROUTES.has(def.routeKey)) return '/pedidos';
      return def.href;
    }
  }
  return '/pedidos';
}

// ---------------------------------------------------------------------------
// Dynamic menu building
// ---------------------------------------------------------------------------

type MenuItemDef = {
  routeKey: AppRouteKey;
  label: string;
  href: string;
  icon: 'dashboard' | 'users' | 'truck' | 'box' | 'file' | 'credit-card' | 'clipboard-list' | 'flame' | 'factory' | 'monitor' | 'bar-chart-2' | 'dollar-sign' | 'clock' | 'trash-2';
  group?: string;
};

const ALL_MENU_ITEM_DEFS: MenuItemDef[] = [
  { routeKey: 'dashboard',                label: 'Dashboard',               href: '/dashboard',                 icon: 'dashboard' },
  { routeKey: 'pedidos',                  label: 'Pedidos',                  href: '/pedidos',                   icon: 'clipboard-list' },
  { routeKey: 'comercial',               label: 'Pedidos de Venda',         href: '/comercial',                 icon: 'box' },
  { routeKey: 'comercial-liberacao',      label: 'Liberar p/ Produção',      href: '/comercial/liberacao',       icon: 'box' },
  { routeKey: 'pedido-suporte',           label: 'Pedidos de Suporte',       href: '/pedido-suporte',            icon: 'box' },
  { routeKey: 'pedido-suporte-liberacao', label: 'Liberar Suporte',          href: '/pedido-suporte/liberacao',  icon: 'box' },
  { routeKey: 'producao',                label: 'Produção',                 href: '/producao',                  icon: 'factory' },
  { routeKey: 'programacao',             label: 'Carregamento',             href: '/carregamento',              icon: 'truck' },
  { routeKey: 'programacao-cronograma', label: 'Cronograma Carregamento',  href: '/carregamento?tab=cronograma', icon: 'truck' },
  { routeKey: 'programacao-dashboard',  label: 'Dashboard Carregamento',   href: '/carregamento?tab=dashboard',  icon: 'truck' },
  { routeKey: 'financeiro',              label: 'Financeiro',               href: '/financeiro',                icon: 'credit-card' },
  { routeKey: 'protocolo-financeiro',    label: 'Protocolo Financeiro',     href: '/protocolo-financeiro',      icon: 'dollar-sign' },
  { routeKey: 'painel-pedidos',           label: 'Painel de Pedidos',        href: '/painel-pedidos',            icon: 'box' },
  { routeKey: 'atualizacao-status',       label: 'Atualização de Status',    href: '/atualizacao-status',        icon: 'box' },
  { routeKey: 'prioridades',              label: 'Prioridades',              href: '/prioridades',               icon: 'flame' },
  { routeKey: 'painel-tv',               label: 'Painel TV',                href: '/painel-tv',                 icon: 'monitor' },
  { routeKey: 'analise-pedidos',         label: 'Análise de Pedidos',       href: '/analise-pedidos',           icon: 'bar-chart-2' },
  { routeKey: 'controle-prazos',         label: 'Controle de Prazos',       href: '/controle-prazos',           icon: 'clock' },
  { routeKey: 'pedidos-excluidos',       label: 'Lixeira de Pedidos',       href: '/pedidos-excluidos',         icon: 'trash-2' },
  { routeKey: 'representantes',          label: 'Representantes',           href: '/representantes',            icon: 'users', group: 'Cadastro' },
  { routeKey: 'motoristas',              label: 'Motoristas',               href: '/motoristas',                icon: 'users', group: 'Cadastro' },
  { routeKey: 'usuarios',               label: 'Usuários',                 href: '/usuarios',                  icon: 'users', group: 'Cadastro' },
  { routeKey: 'permissoes',             label: 'Permissões',               href: '/permissoes',                icon: 'users', group: 'Cadastro' },
];

/** Build sidebar menu from a group's funcionalidades (new permission system) */
export function getMenuByFuncionalidades(funcionalidades: Funcionalidade[]): MenuItem[] {
  const funcSet = new Set(funcionalidades);
  const links: MenuItem[] = [];
  const groups: Record<string, { label: string; href: string }[]> = {};
  let hasPedidosHub = false;
  let hasCarregamentoHub = false;

  for (const def of ALL_MENU_ITEM_DEFS) {
    const required = routeToFuncionalidades[def.routeKey];
    if (!required) continue;
    if (!required.some((f) => funcSet.has(f))) continue;

    if (PEDIDOS_HUB_ROUTES.has(def.routeKey)) { hasPedidosHub = true; continue; }
    if (CARREGAMENTO_HUB_ROUTES.has(def.routeKey)) { hasCarregamentoHub = true; continue; }

    if (def.group) {
      if (!groups[def.group]) groups[def.group] = [];
      groups[def.group].push({ label: def.label, href: def.href });
    } else {
      links.push({ type: 'link', label: def.label, href: def.href, icon: def.icon });
    }
  }

  const dashIdx = links.findIndex((l) => 'href' in l && (l.href === '/' || l.href === '/dashboard'));
  if (hasPedidosHub) {
    links.splice(dashIdx + 1, 0, { type: 'link', label: 'Pedidos', href: '/pedidos', icon: 'clipboard-list' });
  }
  if (hasCarregamentoHub) {
    const insertIdx = links.findIndex((l) => 'href' in l && l.href === '/financeiro');
    const item: MenuItem = { type: 'link', label: 'Carregamento', href: '/carregamento', icon: 'truck' };
    if (insertIdx >= 0) links.splice(insertIdx, 0, item);
    else links.push(item);
  }

  const result: MenuItem[] = [...links];
  for (const [groupLabel, items] of Object.entries(groups)) {
    result.push({ type: 'group', label: groupLabel, icon: 'users', items });
  }
  return result;
}

// Original curated menus per role (unchanged from before)
function originalMenuForRole(role: UserRole): MenuItem[] {
  if (role === 'ADMIN') {
    return [
      { type: 'link', label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
      { type: 'link', label: 'Pedidos', href: '/pedidos', icon: 'clipboard-list' },
      { type: 'link', label: 'Prioridades', href: '/prioridades', icon: 'flame' },
      { type: 'link', label: 'Produção', href: '/producao', icon: 'factory' },
      { type: 'link', label: 'Carregamento', href: '/carregamento', icon: 'truck' },
      { type: 'link', label: 'Financeiro', href: '/financeiro', icon: 'credit-card' },
      { type: 'link', label: 'Protocolo Financeiro', href: '/protocolo-financeiro', icon: 'dollar-sign' },
      { type: 'link', label: 'Painel TV', href: '/painel-tv', icon: 'monitor' },
      { type: 'link', label: 'Análise de Pedidos', href: '/analise-pedidos', icon: 'bar-chart-2' },
      { type: 'link', label: 'Controle de Prazos', href: '/controle-prazos', icon: 'clock' },
      { type: 'link', label: 'Lixeira de Pedidos', href: '/pedidos-excluidos', icon: 'trash-2' },
      { type: 'group', label: 'Cadastro', icon: 'users', items: [
        { label: 'Representantes', href: '/representantes' },
        { label: 'Motoristas', href: '/motoristas' },
        { label: 'Usuários', href: '/usuarios' },
        { label: 'Permissões', href: '/permissoes' },
      ]},
    ];
  }
  if (role === 'FATURAMENTO') {
    return [
      { type: 'link', label: 'Carregamento', href: '/carregamento', icon: 'truck' },
      { type: 'link', label: 'Financeiro', href: '/financeiro', icon: 'credit-card' },
      { type: 'link', label: 'Pedidos', href: '/pedidos', icon: 'clipboard-list' },
      { type: 'group', label: 'Cadastro', icon: 'users', items: [
        { label: 'Representantes', href: '/representantes' },
        { label: 'Motoristas', href: '/motoristas' },
      ]},
    ];
  }
  if (role === 'PRODUCAO') {
    return [
      { type: 'link', label: 'Carregamento', href: '/carregamento', icon: 'truck' },
      { type: 'link', label: 'Pedidos', href: '/pedidos', icon: 'clipboard-list' },
    ];
  }
  if (role === 'LOGISTICA') {
    return [
      { type: 'link', label: 'Pedidos', href: '/pedidos', icon: 'clipboard-list' },
      { type: 'link', label: 'Prioridades', href: '/prioridades', icon: 'flame' },
    ];
  }
  // COMERCIAL
  return [
    { type: 'link', label: 'Pedidos', href: '/pedidos', icon: 'clipboard-list' },
    { type: 'link', label: 'Prioridades', href: '/prioridades', icon: 'flame' },
    { type: 'group', label: 'Cadastro', icon: 'users', items: [
      { label: 'Representantes', href: '/representantes' },
    ]},
  ];
}

// Filter a menu to only show routes present in allowedRoutes
function filterMenuByAllowed(menu: MenuItem[], allowed: Set<AppRouteKey>): MenuItem[] {
  const result: MenuItem[] = [];
  for (const item of menu) {
    if (item.type === 'link') {
      const key = pathnameToRouteKey(item.href);
      if (!key || allowed.has(key)) result.push(item);
    } else {
      const children = item.items.filter((c) => {
        const key = pathnameToRouteKey(c.href);
        return !key || allowed.has(key);
      });
      if (children.length > 0) result.push({ ...item, items: children });
    }
  }
  return result;
}

export function getMenuForRole(role: UserRole, permissions?: PagePermission[] | null): MenuItem[] {
  const base = originalMenuForRole(role);
  // Admin never has custom restrictions
  if (role === 'ADMIN') return base;
  // No custom permissions: return original menu unchanged
  if (!permissions) return base;

  // Custom permissions: build menu mirroring the admin structure.
  // Routes that are tabs inside the /pedidos hub must never appear as individual
  // sidebar links — if the user can access any of them, show a single "Pedidos" entry.
  const allowed = new Set(permissions.filter((p) => p.actions.includes('view')).map((p) => p.route));
  const links: MenuItem[] = [];
  const groups: Record<string, { label: string; href: string }[]> = {};
  let hasPedidosHub = false;
  let hasCarregamentoHub = false;

  for (const def of ALL_MENU_ITEM_DEFS) {
    if (!allowed.has(def.routeKey)) continue;
    if (PEDIDOS_HUB_ROUTES.has(def.routeKey)) {
      hasPedidosHub = true;
      continue; // will add a single "Pedidos" entry below
    }
    if (CARREGAMENTO_HUB_ROUTES.has(def.routeKey)) {
      hasCarregamentoHub = true;
      continue; // will add a single "Carregamento" entry below
    }
    if (def.group) {
      if (!groups[def.group]) groups[def.group] = [];
      groups[def.group].push({ label: def.label, href: def.href });
    } else {
      links.push({ type: 'link', label: def.label, href: def.href, icon: def.icon });
    }
  }

  // Insert "Pedidos" hub entry right after dashboard (same position as admin menu)
  const dashIdx = links.findIndex((l) => 'href' in l && (l.href === '/' || l.href === '/dashboard'));
  if (hasPedidosHub) {
    links.splice(dashIdx + 1, 0, { type: 'link', label: 'Pedidos', href: '/pedidos', icon: 'box' });
  }
  // Insert "Carregamento" hub entry
  if (hasCarregamentoHub) {
    const insertIdx = links.findIndex((l) => 'href' in l && l.href === '/financeiro');
    const carregamentoItem: MenuItem = { type: 'link', label: 'Carregamento', href: '/carregamento', icon: 'truck' };
    if (insertIdx >= 0) links.splice(insertIdx, 0, carregamentoItem);
    else links.push(carregamentoItem);
  }

  const result: MenuItem[] = [...links];
  for (const [groupLabel, items] of Object.entries(groups)) {
    result.push({ type: 'group', label: groupLabel, icon: 'users', items });
  }
  return result;
}

// Legacy – kept for any remaining callers
export const routeAccess: Record<AppRouteKey, UserRole[]> = {
  dashboard: ['ADMIN'],
  representantes: ['ADMIN', 'FATURAMENTO', 'COMERCIAL'],
  motoristas: ['ADMIN', 'FATURAMENTO'],
  usuarios: ['ADMIN'],
  permissoes: ['ADMIN'],
  comercial: ['ADMIN', 'COMERCIAL', 'LOGISTICA'],
  'comercial-liberacao': ['ADMIN', 'COMERCIAL'],
  'pedido-suporte': ['ADMIN', 'COMERCIAL'],
  'pedido-suporte-liberacao': ['ADMIN', 'COMERCIAL'],
  producao: ['ADMIN', 'PRODUCAO'],
  programacao: ['ADMIN', 'FATURAMENTO'],
  'programacao-cronograma': ['ADMIN', 'FATURAMENTO'],
  'programacao-dashboard': ['ADMIN', 'FATURAMENTO'],
  'programacao-comercial': ['ADMIN', 'FATURAMENTO', 'COMERCIAL'],
  financeiro: ['ADMIN', 'FATURAMENTO'],
  'painel-pedidos': ['ADMIN', 'FATURAMENTO', 'COMERCIAL', 'PRODUCAO'],
  'atualizacao-status': ['ADMIN', 'LOGISTICA'],
  pedidos: ['ADMIN', 'FATURAMENTO', 'COMERCIAL', 'PRODUCAO', 'LOGISTICA'],
  prioridades: ['ADMIN', 'COMERCIAL', 'LOGISTICA'],
  'painel-tv': ['ADMIN', 'FATURAMENTO', 'COMERCIAL', 'PRODUCAO', 'LOGISTICA'],
  'protocolo-financeiro': ['ADMIN', 'FATURAMENTO'],
  'analise-pedidos': ['ADMIN'],
  'controle-prazos': ['ADMIN', 'FATURAMENTO', 'COMERCIAL'],
  'pedidos-excluidos': ['ADMIN'],
};
