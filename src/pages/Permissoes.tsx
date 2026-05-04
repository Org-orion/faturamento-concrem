import React, { useEffect, useState } from 'react';
import { useToast } from '@/components/ToastProvider';
import { btnPrimary, btnSecondary, btnDanger, FormField, inputClass } from '@/components/shared';
import Modal from '@/components/Modal';
import { GrupoRow, listGrupos, createGrupo, updateGrupo, deleteGrupo } from '@/lib/gruposRepo';
import { listUsuarios, updateUsuario, UsuarioRow } from '@/lib/cadastrosOps';
import { Funcionalidade, funcionalidadeLabels, funcionalidadeSections, ALL_FUNCIONALIDADES, isSuperAdmin } from '@/types/permissions';

// ─── Shared permission matrix ─────────────────────────────────────────────────

type MatrixProps = {
  value: Set<Funcionalidade>;
  groupBase?: Set<Funcionalidade>;
  onChange?: (next: Set<Funcionalidade>) => void;
  readonly?: boolean;
};

const PermMatrix = ({ value, groupBase, onChange, readonly }: MatrixProps) => {
  const toggle = (key: Funcionalidade) => {
    if (readonly || !onChange) return;
    const next = new Set(value);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange(next);
  };

  const toggleSection = (keys: Funcionalidade[]) => {
    if (readonly || !onChange) return;
    const allOn = keys.every((k) => value.has(k));
    const next = new Set(value);
    if (allOn) keys.forEach((k) => next.delete(k)); else keys.forEach((k) => next.add(k));
    onChange(next);
  };

  return (
    <div className="divide-y divide-border">
      {funcionalidadeSections.map((section) => {
        const allOn = section.keys.every((k) => value.has(k));
        const someOn = !allOn && section.keys.some((k) => value.has(k));
        return (
          <div key={section.label} className="px-4 py-3 space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allOn}
                ref={(el) => { if (el) el.indeterminate = someOn; }}
                onChange={() => toggleSection(section.keys)}
                disabled={readonly}
                className="w-3.5 h-3.5 rounded accent-primary cursor-pointer shrink-0"
              />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{section.label}</span>
            </label>
            <div className="pl-5 grid grid-cols-2 gap-x-6 gap-y-0.5">
              {section.keys.map((key) => {
                const checked = value.has(key);
                const fromGroup = groupBase?.has(key) ?? false;
                const isAdded = checked && !fromGroup && groupBase !== undefined;
                const isRemoved = !checked && fromGroup;
                return (
                  <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none py-0.5 group">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(key)}
                      disabled={readonly}
                      className="w-3 h-3 rounded accent-primary cursor-pointer shrink-0"
                    />
                    <span className={`text-[11px] flex items-center gap-1 ${
                      isRemoved ? 'line-through text-destructive/60' :
                      isAdded   ? 'text-primary font-medium' :
                      checked   ? 'text-foreground' :
                                  'text-muted-foreground'
                    }`}>
                      {funcionalidadeLabels[key]}
                      {isAdded   && <span className="text-[9px] bg-primary/10 text-primary px-1 rounded font-bold">+extra</span>}
                      {isRemoved && <span className="text-[9px] bg-destructive/10 text-destructive px-1 rounded font-bold">-grupo</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Grupos tab ───────────────────────────────────────────────────────────────

const GruposTab = ({ grupos, setGrupos }: { grupos: GrupoRow[]; setGrupos: React.Dispatch<React.SetStateAction<GrupoRow[]>> }) => {
  const { showToast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(grupos[0]?.id ?? null);
  const [newOpen, setNewOpen] = useState(false);
  const [newNome, setNewNome] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newError, setNewError] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editFuncs, setEditFuncs] = useState<Set<Funcionalidade>>(new Set());

  const selected = grupos.find((g) => g.id === selectedId) ?? null;
  const isAdminGroup = selected?.nome === 'Administrador';

  useEffect(() => {
    if (!grupos.length) return;
    if (!selectedId || !grupos.find((g) => g.id === selectedId)) setSelectedId(grupos[0].id);
  }, [grupos]);

  useEffect(() => {
    setEditFuncs(selected ? new Set(selected.funcionalidades) : new Set());
  }, [selectedId, grupos]);

  const isDirty = selected && !isAdminGroup &&
    JSON.stringify([...editFuncs].sort()) !== JSON.stringify([...selected.funcionalidades].sort());

  const handleSave = async () => {
    if (!selected || isAdminGroup) return;
    setSaving(true);
    try {
      const updated = await updateGrupo(selected.id, { funcionalidades: [...editFuncs] });
      setGrupos((prev) => prev.map((g) => g.id === updated.id ? updated : g));
      showToast('Permissões salvas!');
    } catch (e: any) { showToast(e?.message || 'Falha ao salvar.', 'error'); }
    finally { setSaving(false); }
  };

  const handleCreate = async () => {
    if (!newNome.trim()) { setNewError('Obrigatório'); return; }
    if (grupos.some((g) => g.nome.toLowerCase() === newNome.trim().toLowerCase())) { setNewError('Já existe'); return; }
    try {
      const row = await createGrupo({ nome: newNome.trim(), descricao: newDesc.trim() || undefined, funcionalidades: [] });
      setGrupos((prev) => [...prev, row]);
      setSelectedId(row.id);
      setNewOpen(false); setNewNome(''); setNewDesc(''); setNewError('');
      showToast('Grupo criado.');
    } catch (e: any) { showToast(e?.message || 'Falha.', 'error'); }
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteGrupo(deletingId);
      const next = grupos.filter((g) => g.id !== deletingId);
      setGrupos(next);
      if (selectedId === deletingId) setSelectedId(next[0]?.id ?? null);
      setConfirmDeleteOpen(false); setDeletingId(null);
      showToast('Grupo excluído.', 'info');
    } catch (e: any) { showToast(e?.message || 'Falha.', 'error'); }
  };

  return (
    <>
      <div className="flex gap-4 items-start">
        {/* Left — group list */}
        <div className="w-52 shrink-0 bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Grupos</span>
            <button onClick={() => { setNewNome(''); setNewDesc(''); setNewError(''); setNewOpen(true); }} className="w-6 h-6 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-primary transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
          <ul className="py-1">
            {grupos.map((g) => (
              <li key={g.id}>
                <button onClick={() => setSelectedId(g.id)} className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-2 transition-colors ${g.id === selectedId ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted/50 text-foreground'}`}>
                  <span className="truncate">{g.nome}</span>
                  {!g.is_system && (
                    <button onClick={(e) => { e.stopPropagation(); setDeletingId(g.id); setConfirmDeleteOpen(true); }} className="shrink-0 text-muted-foreground hover:text-destructive transition-colors">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Right — matrix */}
        <div className="flex-1 min-w-0 bg-card rounded-lg border border-border shadow-sm">
          {!selected ? (
            <div className="px-6 py-12 text-center text-muted-foreground text-sm">Selecione um grupo.</div>
          ) : (
            <>
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-foreground">{selected.nome}</p>
                  {selected.descricao && <p className="text-xs text-muted-foreground mt-0.5">{selected.descricao}</p>}
                </div>
                {isAdminGroup
                  ? <span className="text-xs text-muted-foreground italic">Acesso total — não editável</span>
                  : <button className={btnPrimary} onClick={handleSave} disabled={!isDirty || saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
                }
              </div>
              <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
                <PermMatrix value={isAdminGroup ? new Set(ALL_FUNCIONALIDADES) : editFuncs} onChange={setEditFuncs} readonly={isAdminGroup} />
              </div>
            </>
          )}
        </div>
      </div>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Novo Grupo">
        <div className="space-y-4">
          <FormField label="Nome" error={newError}><input className={inputClass} value={newNome} onChange={(e) => { setNewNome(e.target.value); setNewError(''); }} /></FormField>
          <FormField label="Descrição (opcional)"><input className={inputClass} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} /></FormField>
          <p className="text-xs text-muted-foreground">O grupo será criado sem permissões. Configure-as abaixo.</p>
          <div className="flex justify-end gap-3">
            <button className={btnSecondary} onClick={() => setNewOpen(false)}>Cancelar</button>
            <button className={btnPrimary} onClick={handleCreate}>Criar</button>
          </div>
        </div>
      </Modal>

      <Modal open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} title="Confirmar exclusão">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Excluir o grupo <span className="font-semibold text-foreground">{grupos.find((g) => g.id === deletingId)?.nome}</span>? Usuários deste grupo perderão as permissões associadas.</p>
          <div className="flex justify-end gap-3">
            <button className={btnSecondary} onClick={() => setConfirmDeleteOpen(false)}>Cancelar</button>
            <button className={btnDanger} onClick={confirmDelete}>Excluir</button>
          </div>
        </div>
      </Modal>
    </>
  );
};

// ─── Usuários tab ─────────────────────────────────────────────────────────────

type UsuarioItem = {
  id: string;
  nome: string;
  username: string;
  grupoId: string | null;
  funcionalidades: Funcionalidade[] | null;
};

const UsuariosTab = ({ grupos }: { grupos: GrupoRow[] }) => {
  const { showToast } = useToast();
  const [users, setUsers] = useState<UsuarioItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editFuncs, setEditFuncs] = useState<Set<Funcionalidade>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const rows = await listUsuarios();
        if (cancelled) return;
        const mapped = rows
          .filter((r) => !isSuperAdmin(r.email || ''))
          .map((r) => ({
            id: r.id,
            nome: r.nome || '',
            username: r.email || '',
            grupoId: r.grupo_id ?? null,
            funcionalidades: Array.isArray(r.funcionalidades) ? r.funcionalidades as Funcionalidade[] : null,
          }));
        setUsers(mapped);
        if (mapped.length > 0) setSelectedId(mapped[0].id);
      } catch (e: any) {
        showToast(e?.message || 'Falha ao carregar usuários.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const selected = users.find((u) => u.id === selectedId) ?? null;

  const groupBase: Set<Funcionalidade> = (() => {
    if (!selected?.grupoId) return new Set();
    const g = grupos.find((gr) => gr.id === selected.grupoId);
    if (!g) return new Set();
    if (g.nome === 'Administrador') return new Set(ALL_FUNCIONALIDADES);
    return new Set(g.funcionalidades ?? []);
  })();

  const groupName = selected?.grupoId ? (grupos.find((g) => g.id === selected.grupoId)?.nome ?? null) : null;

  useEffect(() => {
    if (!selected) { setEditFuncs(new Set()); return; }
    if (selected.funcionalidades) {
      setEditFuncs(new Set(selected.funcionalidades));
    } else {
      setEditFuncs(new Set(groupBase));
    }
  }, [selectedId, users]);

  const isDirty = (() => {
    if (!selected) return false;
    const current = selected.funcionalidades ? new Set(selected.funcionalidades) : new Set(groupBase);
    if (editFuncs.size !== current.size) return true;
    for (const f of editFuncs) if (!current.has(f)) return true;
    return false;
  })();

  const resetToGroup = () => setEditFuncs(new Set(groupBase));

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const groupArr = [...groupBase].sort().join(',');
      const editArr = [...editFuncs].sort().join(',');
      const isIdenticalToGroup = groupArr === editArr;
      const toSave = isIdenticalToGroup ? null : [...editFuncs];

      await updateUsuario(selected.id, { funcionalidades: toSave as any });
      setUsers((prev) => prev.map((u) => u.id === selected.id ? { ...u, funcionalidades: toSave } : u));
      showToast(isIdenticalToGroup ? 'Personalização removida — usando permissões do grupo.' : 'Permissões salvas!');
    } catch (e: any) {
      showToast(e?.message || 'Falha ao salvar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const hasCustom = selected && selected.funcionalidades !== null;

  return (
    <div className="flex gap-4 items-start">
      {/* Left — user list */}
      <div className="w-52 shrink-0 bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        <div className="px-3 py-2 border-b border-border">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Usuários</span>
        </div>
        {loading && <div className="px-3 py-4 text-xs text-muted-foreground">Carregando...</div>}
        <ul className="py-1">
          {users.map((u) => (
            <li key={u.id}>
              <button
                onClick={() => setSelectedId(u.id)}
                className={`w-full text-left px-3 py-2.5 transition-colors ${u.id === selectedId ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted/50 text-foreground'}`}
              >
                <p className="text-sm truncate">{u.nome}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {u.funcionalidades ? 'Personalizado' : (grupos.find((g) => g.id === u.grupoId)?.nome ?? 'Sem grupo')}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Right — matrix */}
      <div className="flex-1 min-w-0 bg-card rounded-lg border border-border shadow-sm">
        {!selected ? (
          <div className="px-6 py-12 text-center text-muted-foreground text-sm">Selecione um usuário.</div>
        ) : (
          <>
            <div className="px-5 py-3.5 border-b border-border flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="font-semibold text-foreground">{selected.nome}</p>
                {groupName && (
                  <p className="text-xs text-muted-foreground">
                    Grupo: <span className="font-medium text-foreground">{groupName}</span>
                    {hasCustom && <span className="ml-2 text-primary font-medium">· personalizado</span>}
                  </p>
                )}
                {!groupName && (
                  <p className="text-xs text-muted-foreground">Sem grupo atribuído</p>
                )}
                {groupName && (
                  <p className="text-[11px] text-muted-foreground">
                    <span className="text-primary font-medium">+extra</span> = adicionado ao grupo ·{' '}
                    <span className="text-destructive/70 font-medium line-through">removido</span> = retirado do grupo
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {groupName && (
                  <button
                    className={btnSecondary}
                    onClick={resetToGroup}
                    disabled={!hasCustom && !isDirty}
                    title="Restaurar permissões do grupo"
                  >
                    Restaurar grupo
                  </button>
                )}
                <button className={btnPrimary} onClick={handleSave} disabled={!isDirty || saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
            <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
              <PermMatrix
                value={editFuncs}
                groupBase={groupName ? groupBase : undefined}
                onChange={setEditFuncs}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const PermissoesPage = () => {
  const { showToast } = useToast();
  const [grupos, setGrupos] = useState<GrupoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'grupos' | 'usuarios'>('grupos');

  useEffect(() => {
    setLoading(true);
    listGrupos()
      .then(setGrupos)
      .catch((e: any) => showToast(e?.message || 'Falha ao carregar grupos.', 'error'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold font-display text-foreground">Permissões</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['grupos', 'usuarios'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'grupos' ? 'Grupos' : 'Usuários'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : tab === 'grupos' ? (
        <GruposTab grupos={grupos} setGrupos={setGrupos} />
      ) : (
        <UsuariosTab grupos={grupos} />
      )}
    </div>
  );
};

export default PermissoesPage;
