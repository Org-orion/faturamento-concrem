import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import Modal from '@/components/Modal';
import { FormField, inputClass, btnPrimary, btnDanger, btnSecondary } from '@/components/shared';
import {
  UserRole, roleLabel,
  AppRouteKey, PageAction, PagePermission,
  defaultPermissionsForRole, routeLabels, routeGroups,
  availableActionsForRoute, actionLabels,
} from '@/utils/access';
import { deleteUsuario, insertUsuario, listUsuarios, updateUsuario, UsuarioPerfilAcesso } from '@/lib/cadastrosOps';
import { hashPassword } from '@/lib/password';
import { useTableSort } from '@/hooks/useTableSort';
import { useQuickFilter } from '@/hooks/useQuickFilter';
import { useColumnFilters, ColDef } from '@/hooks/useColumnFilters';
import { SortableHeader } from '@/components/table/SortableHeader';
import { QuickFilterBar } from '@/components/table/QuickFilterBar';
import { ColumnFilterRow, ColFilterSlot } from '@/components/table/ColumnFilterRow';

type UserForm = {
  name: string;
  username: string;
  role: UserRole;
  /** null = use role defaults; array = custom permissions */
  customPerms: PagePermission[] | null;
};

const emptyForm: UserForm = { name: '', username: '', role: 'COMERCIAL', customPerms: null };

type UserItem = {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  ativo: boolean;
  paginas_acesso: PagePermission[] | null;
};

const roleToPerfil = (r: UserRole): UsuarioPerfilAcesso => {
  if (r === 'ADMIN') return 'administrador';
  if (r === 'FATURAMENTO') return 'faturamento';
  if (r === 'PRODUCAO') return 'producao';
  if (r === 'LOGISTICA') return 'logistica';
  return 'comercial';
};

const perfilToRole = (p: UsuarioPerfilAcesso | null): UserRole => {
  if (p === 'administrador') return 'ADMIN';
  if (p === 'faturamento') return 'FATURAMENTO';
  if (p === 'producao') return 'PRODUCAO';
  if (p === 'logistica') return 'LOGISTICA';
  return 'COMERCIAL';
};

// ---- permission helpers ----
const effectivePerms = (f: UserForm): PagePermission[] =>
  f.customPerms ?? defaultPermissionsForRole(f.role);

const isRouteEnabled = (f: UserForm, route: AppRouteKey) =>
  effectivePerms(f).some((p) => p.route === route);

const getActions = (f: UserForm, route: AppRouteKey): PageAction[] =>
  effectivePerms(f).find((p) => p.route === route)?.actions ?? [];

const isActionEnabled = (f: UserForm, route: AppRouteKey, action: PageAction) =>
  getActions(f, route).includes(action);

const toggleRoute = (f: UserForm, route: AppRouteKey): UserForm => {
  const current = effectivePerms(f);
  const enabled = current.some((p) => p.route === route);
  const next = enabled
    ? current.filter((p) => p.route !== route)
    : [...current, { route, actions: ['view', ...(availableActionsForRoute[route] ?? [])] } as PagePermission];
  return { ...f, customPerms: next };
};

const toggleAction = (f: UserForm, route: AppRouteKey, action: PageAction): UserForm => {
  const current = effectivePerms(f);
  const perm = current.find((p) => p.route === route);
  if (!perm) return f;
  const hasAction = perm.actions.includes(action);
  const newActions: PageAction[] = hasAction
    ? perm.actions.filter((a) => a !== action)
    : [...perm.actions, action];
  // Always keep 'view' if the route is enabled
  const safeActions = newActions.includes('view') ? newActions : ['view', ...newActions] as PageAction[];
  const next = current.map((p) => p.route === route ? { ...p, actions: safeActions } : p);
  return { ...f, customPerms: next };
};

const UsersPage = () => {
  const { user: currentUser, logout } = useApp();
  const { showToast } = useToast();

  const [items, setItems] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const { sortState, toggleSort, sortItems } = useTableSort();
  const { query, setQuery, filterItems, activeStatus, setActiveStatus } = useQuickFilter<UserItem>();
  const colFilter = useColumnFilters();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resetOpen, setResetOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'ADMIN';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const rows = await listUsuarios();
        if (cancelled) return;
        setItems(rows.map((r) => ({
          id: r.id,
          name: r.nome || '',
          username: r.email || '',
          role: perfilToRole(r.perfil_acesso),
          ativo: Boolean(r.ativo),
          paginas_acesso: Array.isArray(r.paginas_acesso) ? (r.paginas_acesso as PagePermission[]) : null,
        })));
      } catch (e: any) {
        showToast(e?.message || 'Falha ao carregar usuários.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [showToast]);

  const textGetters: Array<(u: UserItem) => unknown> = [(u) => u.name, (u) => u.username, (u) => roleLabel[u.role]];
  const sortGetters: Record<string, (u: UserItem) => unknown> = { name: (u) => u.name, username: (u) => u.username, role: (u) => roleLabel[u.role] };
  const userStatusButtons = [
    { value: 'ADMIN', label: 'Admin' }, { value: 'FATURAMENTO', label: 'Faturamento' },
    { value: 'COMERCIAL', label: 'Comercial' }, { value: 'PRODUCAO', label: 'Produção' }, { value: 'LOGISTICA', label: 'Logística' },
  ];
  const colDefs: ColDef<UserItem>[] = [
    { key: 'name', getter: (u) => u.name }, { key: 'username', getter: (u) => u.username },
    { key: 'role', getter: (u) => u.role, match: 'exact' as const },
  ];
  const colFilterSlots: ColFilterSlot[] = [
    { key: 'name', type: 'text', placeholder: 'Nome...' },
    { key: 'username', type: 'text', placeholder: 'Usuário...' },
    { key: 'role', type: 'select', options: [
      { value: 'ADMIN', label: 'Admin' }, { value: 'FATURAMENTO', label: 'Faturamento' },
      { value: 'COMERCIAL', label: 'Comercial' }, { value: 'PRODUCAO', label: 'Produção' }, { value: 'LOGISTICA', label: 'Logística' },
    ]},
    { type: 'none' }, { type: 'none' },
  ];
  const filtered = useMemo(
    () => sortItems(filterItems(colFilter.filterItems(items, colDefs), textGetters, (u) => u.role), sortGetters),
    [items, filterItems, sortItems, colFilter.filterItems],
  );

  const openNew = () => { setEditingId(null); setForm(emptyForm); setErrors({}); setModalOpen(true); };
  const openEdit = (id: string) => {
    const u = items.find((x) => x.id === id);
    if (!u) return;
    setEditingId(id);
    setForm({ name: u.name, username: u.username, role: u.role, customPerms: u.paginas_acesso });
    setErrors({});
    setModalOpen(true);
  };

  const handleRoleChange = (role: UserRole) => setForm((p) => ({ ...p, role, customPerms: null }));

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Obrigatório';
    if (!form.username.trim()) e.username = 'Obrigatório';
    const dup = items.some((u) => u.username.toLowerCase() === form.username.trim().toLowerCase() && u.id !== editingId);
    if (dup) e.username = 'Usuário já existe';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = () => {
    if (!validate()) return;
    const paginas_acesso = form.customPerms && form.customPerms.length > 0 ? form.customPerms : null;
    if (editingId) {
      void (async () => {
        try {
          const row = await updateUsuario(editingId, { nome: form.name.trim(), email: form.username.trim(), perfil_acesso: roleToPerfil(form.role), paginas_acesso: paginas_acesso as any });
          setItems((prev) => prev.map((u) => u.id === editingId ? { ...u, name: row.nome || '', username: row.email || '', role: perfilToRole(row.perfil_acesso), ativo: Boolean(row.ativo), paginas_acesso: Array.isArray(row.paginas_acesso) ? (row.paginas_acesso as PagePermission[]) : null } : u));
          showToast('Usuário atualizado com sucesso!');
          setModalOpen(false);
        } catch (e: any) { showToast(e?.message || 'Falha ao salvar.', 'error'); }
      })();
    } else {
      void (async () => {
        try {
          const senha_hash = await hashPassword('1234');
          const row = await insertUsuario({ nome: form.name.trim(), email: form.username.trim(), senha_hash, perfil_acesso: roleToPerfil(form.role), ativo: true, paginas_acesso: paginas_acesso as any });
          setItems((prev) => [...prev, { id: row.id, name: row.nome || '', username: row.email || '', role: perfilToRole(row.perfil_acesso), ativo: Boolean(row.ativo), paginas_acesso: Array.isArray(row.paginas_acesso) ? (row.paginas_acesso as PagePermission[]) : null }]);
          showToast('Usuário cadastrado com sucesso!');
          setModalOpen(false);
        } catch (e: any) { showToast(e?.message || 'Falha ao salvar.', 'error'); }
      })();
    }
  };

  const requestDelete = (id: string) => { setDeletingId(id); setConfirmDeleteOpen(true); };
  const confirmDelete = () => {
    if (!deletingId) return;
    const deleting = items.find((u) => u.id === deletingId) || null;
    void (async () => {
      try {
        await deleteUsuario(deletingId);
        setItems((prev) => prev.filter((u) => u.id !== deletingId));
        setConfirmDeleteOpen(false); setDeletingId(null);
        showToast('Usuário excluído.', 'info');
        if (deleting && currentUser && deleting.username === currentUser.username) logout();
      } catch (e: any) { showToast(e?.message || 'Falha ao excluir.', 'error'); }
    })();
  };

  const requestResetPassword = (id: string) => { if (!isAdmin) return; setResetUserId(id); setResetPassword(''); setResetError(null); setResetOpen(true); };
  const confirmResetPassword = () => {
    if (!isAdmin || !resetUserId) return;
    if (!resetPassword.trim()) { setResetError('Obrigatório'); return; }
    setResetError(null);
    void (async () => {
      try {
        const senha_hash = await hashPassword(resetPassword.trim());
        await updateUsuario(resetUserId, { senha_hash });
        showToast('Senha redefinida com sucesso!', 'info');
        setResetOpen(false); setResetUserId(null); setResetPassword('');
      } catch (e: any) { showToast(e?.message || 'Falha ao redefinir senha.', 'error'); }
    })();
  };

  const deletingUser = deletingId ? items.find((u) => u.id === deletingId) : null;
  const isDeletingSelf = Boolean(deletingUser && currentUser && deletingUser.username === currentUser.username);

  const isUsingDefaults = form.customPerms === null;

  // summary for table column
  const permSummary = (u: UserItem) => {
    if (u.role === 'ADMIN') return 'Acesso total';
    if (!u.paginas_acesso) return 'Padrão do perfil';
    const routes = u.paginas_acesso.length;
    const hasCustomEdit = u.paginas_acesso.some((p) => p.actions.includes('edit'));
    const hasCustomExec = u.paginas_acesso.some((p) => p.actions.includes('execute'));
    return `${routes} tela(s)${hasCustomEdit ? ' · editar' : ''}${hasCustomExec ? ' · executar' : ''}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold font-display text-foreground">Usuários</h1>
        <button className={btnPrimary} onClick={openNew}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Usuário
        </button>
      </div>

      <QuickFilterBar query={query} onQueryChange={setQuery} placeholder="Buscar por nome, usuário ou perfil..." statuses={userStatusButtons} activeStatus={activeStatus} onStatusChange={setActiveStatus} />

      <div className="bg-card rounded-lg shadow-sm border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <ColumnFilterRow columns={colFilterSlots} values={colFilter.values} onChange={colFilter.setFilter} />
            <tr className="border-b border-border bg-muted/30">
              <SortableHeader columnKey="name" sortState={sortState} onToggle={toggleSort}>Nome</SortableHeader>
              <SortableHeader columnKey="username" sortState={sortState} onToggle={toggleSort}>Usuário</SortableHeader>
              <SortableHeader columnKey="role" sortState={sortState} onToggle={toggleSort}>Perfil</SortableHeader>
              <th className="text-left py-3 px-4 font-display font-medium text-muted-foreground">Acessos</th>
              <th className="text-left py-3 px-4 font-display font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => (
              <tr key={u.id} className={`border-b border-border/50 hover:bg-muted/50 transition-colors ${i % 2 ? 'bg-muted/20' : ''}`}>
                <td className="py-3 px-4 font-display font-medium">{u.name}</td>
                <td className="py-3 px-4 font-mono-data">{u.username}</td>
                <td className="py-3 px-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-muted text-foreground">{roleLabel[u.role]}</span>
                </td>
                <td className="py-3 px-4">
                  <span className={`text-xs ${u.paginas_acesso ? 'text-primary font-medium' : 'text-muted-foreground'}`}>{permSummary(u)}</span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(u.id)} className="text-muted-foreground hover:text-primary transition-colors" aria-label="Editar">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    {isAdmin && (
                      <button onClick={() => requestResetPassword(u.id)} className="text-muted-foreground hover:text-primary transition-colors" aria-label="Redefinir senha">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M20 17V9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-10 0v1H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2z"/></svg>
                      </button>
                    )}
                    <button onClick={() => requestDelete(u.id)} className="text-muted-foreground hover:text-destructive transition-colors" aria-label="Excluir">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground font-display">Nenhum usuário encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <div className="text-sm text-muted-foreground font-display">Carregando...</div>}

      {/* ---- Modal cadastro/edição ---- */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Editar Usuário' : 'Novo Usuário'}>
        <div className="space-y-4">
          <FormField label="Nome" error={errors.name}>
            <input className={inputClass} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </FormField>
          <FormField label="Usuário" error={errors.username}>
            <input className={inputClass} value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} />
          </FormField>
          {!editingId && (
            <FormField label="Senha (padrão)">
              <input className={inputClass} type="password" value="1234" disabled />
            </FormField>
          )}
          <FormField label="Perfil">
            <select className={inputClass} value={form.role} onChange={(e) => handleRoleChange(e.target.value as UserRole)}>
              <option value="ADMIN">ADMIN</option>
              <option value="FATURAMENTO">FATURAMENTO</option>
              <option value="COMERCIAL">COMERCIAL</option>
              <option value="PRODUCAO">PRODUÇÃO</option>
              <option value="LOGISTICA">LOGÍSTICA</option>
            </select>
          </FormField>

          {/* ---- Permissões por tela ---- */}
          {form.role !== 'ADMIN' ? (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Permissões por tela</span>
                {!isUsingDefaults && (
                  <button type="button" onClick={() => setForm((p) => ({ ...p, customPerms: null }))} className="text-xs text-primary hover:underline">
                    Restaurar padrões do perfil
                  </button>
                )}
              </div>
              {isUsingDefaults && (
                <p className="text-xs text-muted-foreground">
                  Usando padrões do perfil <span className="font-semibold">{roleLabel[form.role]}</span>. Altere qualquer opção para customizar.
                </p>
              )}

              <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                {routeGroups.map((group) => (
                  <div key={group.label} className="px-3 py-2.5 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{group.label}</p>
                    {group.routes.map((route) => {
                      const enabled = isRouteEnabled(form, route);
                      const extraActions = availableActionsForRoute[route] ?? [];
                      const isDefault = defaultPermissionsForRole(form.role).some((p) => p.route === route);

                      return (
                        <div key={route} className={`rounded-md transition-colors ${enabled ? 'bg-primary/5' : ''}`}>
                          {/* Route toggle */}
                          <label className="flex items-center gap-2.5 cursor-pointer select-none px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={() => setForm((p) => toggleRoute(p, route))}
                              className="w-3.5 h-3.5 rounded accent-primary cursor-pointer shrink-0"
                            />
                            <span className={`text-xs font-medium ${enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {routeLabels[route]}
                            </span>
                            {isDefault && (
                              <span className="ml-auto text-[9px] font-bold text-primary/50 uppercase tracking-wide">padrão</span>
                            )}
                          </label>

                          {/* Action toggles — only when route is enabled and has extra actions */}
                          {enabled && extraActions.length > 0 && (
                            <div className="flex gap-3 px-7 pb-1.5">
                              {/* view is always on, show as static badge */}
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                <span className="w-2 h-2 rounded-full bg-primary/40 shrink-0" />
                                {actionLabels.view}
                              </span>
                              {extraActions.map((action) => {
                                const checked = isActionEnabled(form, route, action);
                                return (
                                  <label key={action} className="inline-flex items-center gap-1 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => setForm((p) => toggleAction(p, route, action))}
                                      className="w-3 h-3 rounded accent-primary cursor-pointer shrink-0"
                                    />
                                    <span className={`text-[10px] ${checked ? 'text-foreground' : 'text-muted-foreground'}`}>
                                      {actionLabels[action]}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                          {/* Routes without extra actions: just show "Visualizar" */}
                          {enabled && extraActions.length === 0 && (
                            <div className="px-7 pb-1.5">
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                <span className="w-2 h-2 rounded-full bg-primary/40 shrink-0" />
                                {actionLabels.view}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground">
              Usuários ADMIN sempre têm acesso total ao sistema — todas as telas e todas as ações.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button className={btnSecondary} onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className={btnPrimary} onClick={save}>Salvar</button>
        </div>
      </Modal>

      {/* ---- Modal redefinir senha ---- */}
      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Redefinir senha">
        <div className="space-y-4">
          <FormField label="Nova senha" error={resetError || undefined}>
            <input className={inputClass} type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} />
          </FormField>
          <div className="flex justify-end gap-3">
            <button className={btnSecondary} onClick={() => setResetOpen(false)}>Cancelar</button>
            <button className={btnPrimary} onClick={confirmResetPassword}>Salvar</button>
          </div>
        </div>
      </Modal>

      {/* ---- Modal confirmar exclusão ---- */}
      <Modal open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} title="Confirmar exclusão">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Deseja realmente excluir o usuário <span className="font-mono-data font-bold text-foreground">{deletingUser?.username}</span>?
          </p>
          {isDeletingSelf && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium">
              Ao excluir seu próprio usuário, você será deslogado automaticamente.
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button className={btnSecondary} onClick={() => setConfirmDeleteOpen(false)}>Cancelar</button>
            <button className={btnDanger} onClick={confirmDelete}>Excluir</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default UsersPage;
