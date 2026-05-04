import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/components/ToastProvider';
import Modal from '@/components/Modal';
import { FormField, inputClass, btnPrimary, btnDanger, btnSecondary } from '@/components/shared';
import { UserRole, can } from '@/utils/access';
import { isSuperAdmin, Funcionalidade, funcionalidadeLabels, funcionalidadeSections } from '@/types/permissions';
import { deleteUsuario, insertUsuario, listUsuarios, updateUsuario, UsuarioPerfilAcesso } from '@/lib/cadastrosOps';
import { listGrupos, GrupoRow } from '@/lib/gruposRepo';
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
  grupoId: string | null;
  customFuncs: Set<Funcionalidade> | null;
};

const emptyForm: UserForm = { name: '', username: '', role: 'COMERCIAL', grupoId: null, customFuncs: null };

type UserItem = {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  ativo: boolean;
  grupoId: string | null;
  funcionalidades: Funcionalidade[] | null;
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

// ---- permission matrix sub-component ----
const PermMatrix = ({ value, onChange }: { value: Set<Funcionalidade>; onChange: (next: Set<Funcionalidade>) => void }) => {
  const toggle = (key: Funcionalidade) => {
    const next = new Set(value);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange(next);
  };

  const toggleSection = (keys: Funcionalidade[]) => {
    const allOn = keys.every((k) => value.has(k));
    const next = new Set(value);
    if (allOn) keys.forEach((k) => next.delete(k)); else keys.forEach((k) => next.add(k));
    onChange(next);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden divide-y divide-border max-h-[50vh] overflow-y-auto">
      {funcionalidadeSections.map((section) => {
        const allOn = section.keys.every((k) => value.has(k));
        const someOn = !allOn && section.keys.some((k) => value.has(k));
        return (
          <div key={section.label} className="px-3 py-2.5 space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allOn}
                ref={(el) => { if (el) el.indeterminate = someOn; }}
                onChange={() => toggleSection(section.keys)}
                className="w-3.5 h-3.5 rounded accent-primary cursor-pointer shrink-0"
              />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{section.label}</span>
            </label>
            <div className="pl-5 grid grid-cols-2 gap-x-4 gap-y-0.5">
              {section.keys.map((key) => (
                <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none py-0.5">
                  <input
                    type="checkbox"
                    checked={value.has(key)}
                    onChange={() => toggle(key)}
                    className="w-3 h-3 rounded accent-primary cursor-pointer shrink-0"
                  />
                  <span className={`text-[11px] ${value.has(key) ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {funcionalidadeLabels[key]}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const UsersPage = () => {
  const { user: currentUser, logout } = useApp();
  const { showToast } = useToast();

  const [items, setItems] = useState<UserItem[]>([]);
  const [grupos, setGrupos] = useState<GrupoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const { sortState, toggleSort, sortItems } = useTableSort();
  const { query, setQuery, filterItems } = useQuickFilter<UserItem>();
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
  const canCriarEditar = can(currentUser, 'usuarios.criar_editar', 'usuarios', 'execute');
  const canExcluir     = can(currentUser, 'usuarios.excluir',      'usuarios', 'execute');
  const useCustomFuncs = form.customFuncs !== null;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [rows, gruposData] = await Promise.all([listUsuarios(), listGrupos()]);
        if (cancelled) return;
        setGrupos(gruposData);
        setItems(rows.map((r) => ({
          id: r.id,
          name: r.nome || '',
          username: r.email || '',
          role: perfilToRole(r.perfil_acesso),
          ativo: Boolean(r.ativo),
          grupoId: r.grupo_id ?? null,
          funcionalidades: Array.isArray(r.funcionalidades) ? r.funcionalidades as Funcionalidade[] : null,
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

  const textGetters: Array<(u: UserItem) => unknown> = [(u) => u.name, (u) => u.username];
  const sortGetters: Record<string, (u: UserItem) => unknown> = { name: (u) => u.name, username: (u) => u.username };
  const colDefs: ColDef<UserItem>[] = [
    { key: 'name', getter: (u) => u.name }, { key: 'username', getter: (u) => u.username },
  ];
  const colFilterSlots: ColFilterSlot[] = [
    { key: 'name', type: 'text', placeholder: 'Nome...' },
    { key: 'username', type: 'text', placeholder: 'Usuário...' },
    { type: 'none' }, { type: 'none' },
  ];
  const filtered = useMemo(
    () => sortItems(filterItems(colFilter.filterItems(items, colDefs), textGetters), sortGetters),
    [items, filterItems, sortItems, colFilter.filterItems],
  );

  const resolveGrupoLabel = (u: UserItem): string => {
    if (isSuperAdmin(u.username)) return 'Administrador';
    if (u.funcionalidades && u.funcionalidades.length > 0) return `Personalizado (${u.funcionalidades.length} funções)`;
    if (u.grupoId) return grupos.find((g) => g.id === u.grupoId)?.nome ?? '—';
    return '—';
  };

  const resolveGrupoIsCustom = (u: UserItem) =>
    !isSuperAdmin(u.username) && u.funcionalidades && u.funcionalidades.length > 0;

  const openNew = () => { setEditingId(null); setForm(emptyForm); setErrors({}); setModalOpen(true); };
  const openEdit = (id: string) => {
    const u = items.find((x) => x.id === id);
    if (!u) return;
    setEditingId(id);
    setForm({
      name: u.name,
      username: u.username,
      role: u.role,
      grupoId: u.grupoId,
      customFuncs: u.funcionalidades ? new Set(u.funcionalidades) : null,
    });
    setErrors({});
    setModalOpen(true);
  };

  const enableCustomFuncs = () => {
    const base = form.grupoId
      ? (grupos.find((g) => g.id === form.grupoId)?.funcionalidades ?? [])
      : [];
    setForm((p) => ({ ...p, customFuncs: new Set(base) }));
  };

  const disableCustomFuncs = () => setForm((p) => ({ ...p, customFuncs: null }));

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
    const funcionalidades = form.customFuncs ? [...form.customFuncs] : null;
    if (editingId) {
      void (async () => {
        try {
          const row = await updateUsuario(editingId, {
            nome: form.name.trim(),
            email: form.username.trim(),
            perfil_acesso: roleToPerfil(form.role),
            grupo_id: form.grupoId,
            funcionalidades: funcionalidades as any,
          });
          setItems((prev) => prev.map((u) => u.id === editingId
            ? { ...u, name: row.nome || '', username: row.email || '', role: perfilToRole(row.perfil_acesso), ativo: Boolean(row.ativo), grupoId: row.grupo_id ?? null, funcionalidades: Array.isArray(row.funcionalidades) ? row.funcionalidades as Funcionalidade[] : null }
            : u));
          showToast('Usuário atualizado com sucesso!');
          setModalOpen(false);
        } catch (e: any) { showToast(e?.message || 'Falha ao salvar.', 'error'); }
      })();
    } else {
      void (async () => {
        try {
          const senha_hash = await hashPassword('1234');
          const row = await insertUsuario({
            nome: form.name.trim(),
            email: form.username.trim(),
            senha_hash,
            perfil_acesso: roleToPerfil(form.role),
            ativo: true,
            grupo_id: form.grupoId,
            funcionalidades: funcionalidades as any,
          });
          setItems((prev) => [...prev, { id: row.id, name: row.nome || '', username: row.email || '', role: perfilToRole(row.perfil_acesso), ativo: Boolean(row.ativo), grupoId: row.grupo_id ?? null, funcionalidades: Array.isArray(row.funcionalidades) ? row.funcionalidades as Funcionalidade[] : null }]);
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
  const editingUser = editingId ? items.find((u) => u.id === editingId) : null;
  const isEditingSuperAdmin = Boolean(editingUser && isSuperAdmin(editingUser.username));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold font-display text-foreground">Usuários</h1>
        {canCriarEditar && (
          <button className={btnPrimary} onClick={openNew}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Novo Usuário
          </button>
        )}
      </div>

      <QuickFilterBar query={query} onQueryChange={setQuery} placeholder="Buscar por nome ou usuário..." />

      <div className="bg-card rounded-lg shadow-sm border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <ColumnFilterRow columns={colFilterSlots} values={colFilter.values} onChange={colFilter.setFilter} />
            <tr className="border-b border-border bg-muted/30">
              <SortableHeader columnKey="name" sortState={sortState} onToggle={toggleSort}>Nome</SortableHeader>
              <SortableHeader columnKey="username" sortState={sortState} onToggle={toggleSort}>Usuário</SortableHeader>
              <th className="text-left py-3 px-4 font-display font-medium text-muted-foreground">Grupo / Permissões</th>
              <th className="text-left py-3 px-4 font-display font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => {
              const locked = isSuperAdmin(u.username);
              return (
                <tr key={u.id} className={`border-b border-border/50 hover:bg-muted/50 transition-colors ${i % 2 ? 'bg-muted/20' : ''}`}>
                  <td className="py-3 px-4 font-display font-medium">
                    {u.name}
                    {locked && <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">SUPER ADMIN</span>}
                  </td>
                  <td className="py-3 px-4 font-mono-data">{u.username}</td>
                  <td className="py-3 px-4">
                    <span className={`text-sm ${resolveGrupoIsCustom(u) ? 'text-primary font-medium' : 'text-foreground'}`}>
                      {resolveGrupoLabel(u)}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2">
                      {canCriarEditar && (
                        <button onClick={() => openEdit(u.id)} disabled={locked} className="text-muted-foreground hover:text-primary transition-colors disabled:opacity-30" aria-label="Editar">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => requestResetPassword(u.id)} className="text-muted-foreground hover:text-primary transition-colors" aria-label="Redefinir senha">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M20 17V9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-10 0v1H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2z"/></svg>
                        </button>
                      )}
                      {canExcluir && (
                        <button onClick={() => requestDelete(u.id)} disabled={locked} className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30" aria-label="Excluir">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="py-8 text-center text-muted-foreground font-display">Nenhum usuário encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <div className="text-sm text-muted-foreground font-display">Carregando...</div>}

      {/* ---- Modal cadastro/edição ---- */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Editar Usuário' : 'Novo Usuário'}>
        {isEditingSuperAdmin ? (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              O usuário <span className="font-semibold">kmz</span> é super-admin e não pode ser modificado.
            </div>
            <div className="flex justify-end">
              <button className={btnSecondary} onClick={() => setModalOpen(false)}>Fechar</button>
            </div>
          </div>
        ) : (
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
              <select className={inputClass} value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as UserRole }))}>
                <option value="ADMIN">ADMIN</option>
                <option value="FATURAMENTO">FATURAMENTO</option>
                <option value="COMERCIAL">COMERCIAL</option>
                <option value="PRODUCAO">PRODUÇÃO</option>
                <option value="LOGISTICA">LOGÍSTICA</option>
              </select>
            </FormField>

            {/* ── Permissões ── */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Permissões</span>
              </div>

              {!useCustomFuncs ? (
                <>
                  <FormField label="Grupo de permissões">
                    <select className={inputClass} value={form.grupoId ?? ''} onChange={(e) => setForm((p) => ({ ...p, grupoId: e.target.value || null }))}>
                      <option value="">— Sem grupo —</option>
                      {grupos.map((g) => (
                        <option key={g.id} value={g.id}>{g.nome}</option>
                      ))}
                    </select>
                  </FormField>
                  <button
                    type="button"
                    onClick={enableCustomFuncs}
                    className="text-xs text-primary hover:underline"
                  >
                    + Personalizar permissões para este usuário
                  </button>
                  {!form.grupoId && (
                    <p className="text-xs text-muted-foreground">Sem grupo: acesso baseado no perfil.</p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-primary font-medium">Permissões personalizadas (override do grupo)</span>
                    <button type="button" onClick={disableCustomFuncs} className="text-xs text-muted-foreground hover:text-destructive hover:underline">
                      Remover personalização
                    </button>
                  </div>
                  <PermMatrix
                    value={form.customFuncs!}
                    onChange={(next) => setForm((p) => ({ ...p, customFuncs: next }))}
                  />
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button className={btnSecondary} onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className={btnPrimary} onClick={save}>Salvar</button>
            </div>
          </div>
        )}
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
