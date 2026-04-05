import { useApp } from '@/contexts/AppContext';
import { canDo, AppRouteKey, PageAction } from '@/utils/access';

/**
 * Returns permission helpers for a specific route.
 *
 * Usage:
 *   const { canEdit, canExecute } = usePermission('programacao');
 *   if (!canEdit) return null; // hide edit button
 */
export function usePermission(route: AppRouteKey) {
  const { user } = useApp();
  const role = user?.role ?? 'COMERCIAL';
  const permissions = user?.permissions ?? null;

  return {
    canView:    canDo(role, permissions, route, 'view'),
    canEdit:    canDo(role, permissions, route, 'edit'),
    canExecute: canDo(role, permissions, route, 'execute'),
  };
}

/**
 * Returns a generic permission checker for any route/action.
 *
 * Usage:
 *   const { can } = usePermissions();
 *   if (!can('programacao', 'edit')) { ... }
 */
export function usePermissions() {
  const { user } = useApp();
  const role = user?.role ?? 'COMERCIAL';
  const permissions = user?.permissions ?? null;

  return {
    can: (route: AppRouteKey, action: PageAction) => canDo(role, permissions, route, action),
  };
}
