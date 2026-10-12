import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useMatch, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  CalendarClock,
  EyeOff,
  Link2,
  MapPin,
  MapPinOff,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  SquareArrowOutUpRight,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { GROUPS, STATUSES, STATUS_LABEL } from '@shared/status';
import { formatDayShort, pct, todayISO } from '@shared/format';
import type { Status } from '@shared/types';
import { api } from './api';
import { CreateTaskDialog } from './CreateTaskDialog';
import { PriorityIcon } from './priority';
import type { TaskSummary } from './types';
import { Avatar, Button, Kbd, Menu, Spinner, inputCls } from './ui';

export const taskKey = (t: { code: number }) => `ITA-${t.code}`;

/** Atalhos de teclado do quadro, como no Jira (ignorados enquanto se digita). */
function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export function BoardPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const modalOpen = !!useMatch('/tarefa/:taskId');
  const { data: tasks, isLoading } = useQuery({ queryKey: ['tasks'], queryFn: api.tasks });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [people, setPeople] = useState<string[]>([]);
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [creating, setCreating] = useState<Status | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const all = useMemo(() => tasks ?? [], [tasks]);
  const categories = useMemo(() => [...new Set(all.map((t) => t.category).filter(Boolean))].sort(), [all]);
  const responsibles = useMemo(() => {
    const count = new Map<string, number>();
    for (const t of all) if (t.responsibleName) count.set(t.responsibleName, (count.get(t.responsibleName) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [all]);

  const filtering = !!(search.trim() || category || people.length || onlyUnmapped || onlyHidden);
  const columns = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = all.filter(
      (t) =>
        (!category || t.category === category) &&
        (!people.length || people.includes(t.responsibleName)) &&
        (!onlyUnmapped || t.posX == null) &&
        (!onlyHidden || !t.isPublic) &&
        (!q || `${taskKey(t)} ${t.title} ${t.responsibleName} ${t.category}`.toLowerCase().includes(q)),
    );
    return STATUSES.map((s) => ({ ...s, items: visible.filter((t) => t.status === s.key).sort((a, b) => a.position - b.position) }));
  }, [all, search, category, people, onlyUnmapped, onlyHidden]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalOpen || creating || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setCreating('ideia');
      } else if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen, creating]);

  const move = useMutation({
    mutationFn: (v: { id: string; status: Status; position: number }) => api.updateTask(v.id, { status: v.status, position: v.position }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const prev = qc.getQueryData<TaskSummary[]>(['tasks']);
      qc.setQueryData<TaskSummary[]>(['tasks'], (old) => old?.map((t) => (t.id === v.id ? { ...t, status: v.status, position: v.position } : t)));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tasks'], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: (detail) => qc.setQueryData(['task', detail.id], detail),
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const remove = useMutation({
    mutationFn: (t: TaskSummary) => api.deleteTask(t.id),
    onSuccess: (_r, t) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(`${taskKey(t)} excluído`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeDemo = useMutation({
    mutationFn: api.removeDemo,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(`${r.removed} projetos de demonstração removidos`);
    },
  });

  /** Posição entre os vizinhos do destino (o servidor renumera a coluna se apertar). */
  const positionAt = (status: Status, index: number, excludeId: string) => {
    const dest = all.filter((t) => t.status === status && t.id !== excludeId).sort((a, b) => a.position - b.position);
    const prev = dest[index - 1]?.position;
    const next = dest[index]?.position;
    if (prev == null && next == null) return 1024;
    if (prev == null) return next! - 1024;
    if (next == null) return prev + 1024;
    return (prev + next) / 2;
  };

  const onDragEnd = ({ draggableId, source, destination }: DropResult) => {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const status = destination.droppableId as Status;
    // Com filtros ativos, o índice visível é convertido para a posição real na coluna completa.
    const visibleDest = columns.find((c) => c.key === status)!.items.filter((t) => t.id !== draggableId);
    const anchor = visibleDest[destination.index];
    const full = all.filter((t) => t.status === status && t.id !== draggableId).sort((a, b) => a.position - b.position);
    const realIndex = anchor ? full.findIndex((t) => t.id === anchor.id) : full.length;
    move.mutate({ id: draggableId, status, position: positionAt(status, realIndex, draggableId) });
    if (source.droppableId !== destination.droppableId) {
      const group = GROUPS[STATUSES.find((s) => s.key === status)!.group];
      toast.success(`Movido para “${STATUS_LABEL[status]}”`, { description: `No site aparece como ${group.singular.toLowerCase()}.` });
    }
  };

  const moveToEdge = (t: TaskSummary, edge: 'top' | 'bottom') => {
    const col = all.filter((x) => x.status === t.status && x.id !== t.id).sort((a, b) => a.position - b.position);
    move.mutate({ id: t.id, status: t.status, position: positionAt(t.status, edge === 'top' ? 0 : col.length, t.id) });
  };

  const clearFilters = () => {
    setSearch('');
    setCategory('');
    setPeople([]);
    setOnlyUnmapped(false);
    setOnlyHidden(false);
  };

  const demoCount = all.filter((t) => t.isDemo).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 px-6 pt-6 pb-3">
        <div className="mr-auto">
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Quadro de projetos</h1>
          <p className="hidden text-sm text-slate-500 sm:block">
            Arraste os cartões entre as colunas · <Kbd>C</Kbd> criar · <Kbd>/</Kbd> buscar
          </p>
        </div>
        <Button onClick={() => setCreating('ideia')}>
          <Plus className="size-4" /> Criar
        </Button>
      </header>

      {/* Filtros rápidos (como os "quick filters" do Jira) */}
      <div className="flex flex-wrap items-center gap-2 px-6 pb-4">
        <label className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setSearch(''), e.currentTarget.blur())}
            placeholder="Buscar no quadro"
            aria-label="Buscar no quadro"
            className={clsx(inputCls, 'h-9 w-52 py-1.5 pl-9')}
          />
        </label>
        {responsibles.length > 0 && (
          <div className="flex items-center -space-x-1.5 pl-1" role="group" aria-label="Filtrar por responsável">
            {responsibles.slice(0, 8).map((name) => {
              const active = people.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  title={name}
                  aria-label={`Responsável: ${name}`}
                  aria-pressed={active}
                  onClick={() => setPeople((p) => (active ? p.filter((x) => x !== name) : [...p, name]))}
                  className={clsx('rounded-full ring-2 transition hover:z-10 hover:-translate-y-0.5', active ? 'z-10 ring-sky-500' : 'ring-[#f4f6f9]')}
                >
                  <Avatar name={name} size="md" />
                </button>
              );
            })}
          </div>
        )}
        {categories.length > 0 && (
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoria" className={clsx(inputCls, 'h-9 w-auto py-1.5')}>
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
        <FilterChip active={onlyUnmapped} onClick={() => setOnlyUnmapped((v) => !v)} icon={<MapPinOff className="size-3.5" />}>
          Sem local no mapa
        </FilterChip>
        <FilterChip active={onlyHidden} onClick={() => setOnlyHidden((v) => !v)} icon={<EyeOff className="size-3.5" />}>
          Ocultos do site
        </FilterChip>
        {filtering && (
          <button type="button" onClick={clearFilters} className="text-sm font-semibold text-sky-700 hover:underline">
            Limpar filtros
          </button>
        )}
      </div>

      {demoCount > 0 && (
        <div className="mx-6 mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-100">
          <Sparkles className="size-4 shrink-0 text-sky-500" />
          <span className="flex-1">
            Há <strong>{demoCount} projetos de demonstração</strong> para você conhecer o sistema. Remova-os quando começar a cadastrar os reais.
          </span>
          <Button size="sm" variant="secondary" loading={removeDemo.isPending} onClick={() => confirm('Remover todos os projetos de demonstração?') && removeDemo.mutate()}>
            <X className="size-3.5" /> Remover demonstração
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid flex-1 place-items-center">
          <Spinner className="size-7" />
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-6 pb-6">
            {columns.map((col) => (
              <section
                key={col.key}
                aria-label={`Coluna ${col.label}`}
                className="flex max-h-full min-w-[260px] flex-1 flex-col rounded-2xl bg-slate-200/50 ring-1 ring-slate-200/70"
              >
                <header className="flex items-center gap-2 px-3.5 pt-3.5 pb-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: GROUPS[col.group].color, boxShadow: `0 0 0 3px ${GROUPS[col.group].color}2a` }}
                    title={`No site: ${GROUPS[col.group].singular}`}
                  />
                  <h2 className="text-xs font-bold tracking-wider text-slate-600 uppercase">{col.label}</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500 shadow-sm">{col.items.length}</span>
                </header>
                <Droppable droppableId={col.key}>
                  {(p, snap) => (
                    <div
                      ref={p.innerRef}
                      {...p.droppableProps}
                      className={clsx('scroll-thin min-h-24 flex-1 overflow-y-auto rounded-xl px-2 pt-1 transition-colors', snap.isDraggingOver && 'bg-sky-100/60')}
                    >
                      {col.items.map((t, i) => (
                        <Draggable key={t.id} draggableId={t.id} index={i}>
                          {(dp, ds) => (
                            <div
                              ref={dp.innerRef}
                              {...dp.draggableProps}
                              {...dp.dragHandleProps}
                              className="mb-2"
                              onClick={() => navigate(`/tarefa/${taskKey(t)}`)}
                              onKeyDown={(e) => {
                                // Enter abre (espaço fica para o arraste por teclado do quadro)
                                if (e.key === 'Enter') navigate(`/tarefa/${taskKey(t)}`);
                              }}
                            >
                              <TaskCard
                                task={t}
                                dragging={ds.isDragging}
                                menu={
                                  <Menu
                                    label={`Ações de ${taskKey(t)}`}
                                    trigger={<MoreHorizontal className="size-4" />}
                                    items={[
                                      { label: 'Abrir', icon: <SquareArrowOutUpRight />, onSelect: () => navigate(`/tarefa/${taskKey(t)}`) },
                                      {
                                        label: 'Copiar link do site',
                                        icon: <Link2 />,
                                        hidden: !t.isPublic || t.posX == null,
                                        onSelect: () =>
                                          navigator.clipboard
                                            .writeText(`${location.origin}/projeto/${t.id}`)
                                            .then(() => toast.success('Link do projeto copiado')),
                                      },
                                      { label: 'Posicionar no mapa', icon: <MapPin />, onSelect: () => navigate(`/mapa?tarefa=${t.id}`) },
                                      { label: 'Mover para o topo', icon: <ArrowUpToLine />, hidden: i === 0, onSelect: () => moveToEdge(t, 'top') },
                                      { label: 'Mover para o fim', icon: <ArrowDownToLine />, hidden: i === col.items.length - 1, onSelect: () => moveToEdge(t, 'bottom') },
                                      {
                                        label: 'Excluir',
                                        icon: <Trash2 />,
                                        danger: true,
                                        onSelect: () => confirm(`Excluir ${taskKey(t)} “${t.title}” e todos os anexos?`) && remove.mutate(t),
                                      },
                                    ]}
                                  />
                                }
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {p.placeholder}
                      {!col.items.length && filtering && <p className="px-2 py-4 text-center text-xs text-slate-400">Nenhum cartão com estes filtros</p>}
                    </div>
                  )}
                </Droppable>
                <QuickAdd status={col.key} />
              </section>
            ))}
          </div>
        </DragDropContext>
      )}

      {creating && <CreateTaskDialog initialStatus={creating} categories={categories} onClose={() => setCreating(null)} />}
      <Outlet />
    </div>
  );
}

function FilterChip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium ring-1 transition',
        active ? 'bg-sky-600 text-white ring-sky-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function TaskCard({ task: t, dragging, menu }: { task: TaskSummary; dragging: boolean; menu: React.ReactNode }) {
  const group = GROUPS[STATUSES.find((s) => s.key === t.status)!.group];
  const overdue = t.dueDate && t.status !== 'concluido' && t.dueDate < todayISO();
  return (
    <article
      className={clsx(
        'group/card relative cursor-pointer rounded-xl bg-white p-3 ring-1 transition',
        dragging ? 'rotate-2 shadow-xl ring-sky-300' : 'shadow-sm ring-slate-200/80 hover:shadow-md hover:ring-slate-300',
      )}
    >
      <div className="absolute top-2 right-2 opacity-0 transition group-hover/card:opacity-100 focus-within:opacity-100">{menu}</div>
      <div className="flex items-start gap-2 pr-6">
        <span className="mt-[5px] size-2 shrink-0 rounded-full" style={{ background: group.color }} />
        <h3 className="line-clamp-3 text-sm leading-snug font-semibold text-slate-800">{t.title}</h3>
      </div>
      {(t.category || t.isDemo) && (
        <div className="mt-2 flex flex-wrap gap-1 pl-4">
          {t.category && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{t.category}</span>}
          {t.isDemo && <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">demo</span>}
        </div>
      )}
      {t.subtaskTotal > 0 && (
        <div className="mt-2.5 flex items-center gap-2 pl-4" title={`${t.subtaskDone} de ${t.subtaskTotal} subtarefas concluídas`}>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct(t.subtaskDone, t.subtaskTotal)}%` }} />
          </div>
          <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
            {t.subtaskDone}/{t.subtaskTotal}
          </span>
        </div>
      )}
      <footer className="mt-2.5 flex items-center gap-2 pl-4 text-slate-400">
        <PriorityIcon priority={t.priority} className="size-3.5" />
        <span className={clsx('text-[11px] font-semibold', t.status === 'concluido' && 'line-through')}>{taskKey(t)}</span>
        <MapPin className={clsx('size-3.5', t.posX != null ? 'text-emerald-500' : 'text-slate-300')} aria-label={t.posX != null ? 'No mapa' : 'Sem local no mapa'} />
        {t.documentCount > 0 && (
          <span className="flex items-center gap-0.5 text-[11px]" title={`${t.documentCount} anexo(s)`}>
            <Paperclip className="size-3" />
            {t.documentCount}
          </span>
        )}
        {!t.isPublic && <EyeOff className="size-3.5" aria-label="Oculto no site" />}
        {t.dueDate && t.status !== 'concluido' && (
          <span className={clsx('flex items-center gap-0.5 text-[11px] font-medium', overdue ? 'rounded bg-rose-50 px-1 text-rose-600' : '')} title={overdue ? 'Atrasado' : 'Previsão'}>
            <CalendarClock className="size-3" />
            {formatDayShort(t.dueDate).slice(0, 5)}
          </span>
        )}
        <span className="ml-auto">{t.responsibleName && <Avatar name={t.responsibleName} size="xs" />}</span>
      </footer>
    </article>
  );
}

function QuickAdd({ status }: { status: Status }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const create = useMutation({
    mutationFn: (t: string) => api.createTask({ title: t, status }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(`${taskKey(d)} criado`);
      setTitle('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="m-2 mt-1 flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-white hover:text-slate-800"
      >
        <Plus className="size-4" /> Criar
      </button>
    );
  }
  const submit = () => title.trim() && create.mutate(title.trim());
  return (
    <div className="m-2 mt-1">
      <textarea
        autoFocus
        rows={2}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        onBlur={() => !title && setOpen(false)}
        placeholder="O que precisa ser feito? (Enter cria)"
        aria-label={`Novo projeto em ${STATUS_LABEL[status]}`}
        className="w-full resize-none rounded-xl bg-white p-3 text-sm shadow-sm ring-2 ring-sky-400/70 outline-none"
      />
      <div className="mt-1.5 flex gap-1.5">
        <Button size="sm" onMouseDown={(e) => e.preventDefault()} onClick={submit} loading={create.isPending}>
          Criar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

