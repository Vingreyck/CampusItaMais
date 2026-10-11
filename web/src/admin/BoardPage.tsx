import { useMemo, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import clsx from 'clsx';
import { toast } from 'sonner';
import { CalendarClock, EyeOff, MapPin, Paperclip, Plus, Search, Sparkles, X } from 'lucide-react';
import { GROUPS, STATUSES, STATUS_LABEL } from '@shared/status';
import { formatDayShort, pct, todayISO } from '@shared/format';
import type { Status } from '@shared/types';
import { api } from './api';
import type { TaskSummary } from './types';
import { Avatar, Button, Spinner, inputCls } from './ui';

export function BoardPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: tasks, isLoading } = useQuery({ queryKey: ['tasks'], queryFn: api.tasks });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  const all = useMemo(() => tasks ?? [], [tasks]);
  const categories = useMemo(() => [...new Set(all.map((t) => t.category).filter(Boolean))].sort(), [all]);
  const columns = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = all.filter(
      (t) =>
        (!category || t.category === category) &&
        (!q || `ITA-${t.code} ${t.title} ${t.responsibleName} ${t.category}`.toLowerCase().includes(q)),
    );
    return STATUSES.map((s) => ({ ...s, items: visible.filter((t) => t.status === s.key).sort((a, b) => a.position - b.position) }));
  }, [all, search, category]);

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
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const create = useMutation({
    mutationFn: () => api.createTask({ title: 'Novo projeto', status: 'ideia' }),
    onSuccess: (d) => {
      qc.setQueryData(['task', d.id], d);
      qc.invalidateQueries({ queryKey: ['tasks'] });
      navigate(`/tarefa/${d.id}`);
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

  const onDragEnd = ({ draggableId, source, destination }: DropResult) => {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const status = destination.droppableId as Status;
    const dest = columns.find((c) => c.key === status)!.items.filter((t) => t.id !== draggableId);
    const prev = dest[destination.index - 1]?.position;
    const next = dest[destination.index]?.position;
    const position =
      prev == null && next == null ? 1024 : prev == null ? next! - 1024 : next == null ? prev + 1024 : (prev + next) / 2;
    move.mutate({ id: draggableId, status, position });
    if (source.droppableId !== destination.droppableId) {
      const group = GROUPS[STATUSES.find((s) => s.key === status)!.group];
      toast.success(`Movido para “${STATUS_LABEL[status]}”`, { description: `No site aparece como ${group.singular.toLowerCase()}.` });
    }
  };

  const demoCount = all.filter((t) => t.isDemo).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 px-6 pt-6 pb-4">
        <div className="mr-auto">
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Quadro de projetos</h1>
          <p className="text-sm text-slate-500">Arraste os cartões entre as colunas para atualizar a situação no site.</p>
        </div>
        <label className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" className={clsx(inputCls, 'w-56 pl-9')} />
        </label>
        {categories.length > 0 && (
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={clsx(inputCls, 'w-48')}>
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
        <Button onClick={() => create.mutate()} loading={create.isPending}>
          <Plus className="size-4" /> Novo projeto
        </Button>
      </header>

      {demoCount > 0 && (
        <div className="mx-6 mb-4 flex items-center gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-100">
          <Sparkles className="size-4 shrink-0 text-sky-500" />
          <span className="flex-1">
            Há <strong>{demoCount} projetos de demonstração</strong> para você conhecer o sistema. Remova-os quando começar a cadastrar os reais.
          </span>
          <Button
            size="sm"
            variant="secondary"
            loading={removeDemo.isPending}
            onClick={() => confirm('Remover todos os projetos de demonstração?') && removeDemo.mutate()}
          >
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
              <section key={col.key} className="flex max-h-full min-w-[250px] flex-1 flex-col rounded-2xl bg-slate-200/50 ring-1 ring-slate-200/70">
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
                            <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps} className="mb-2" onClick={() => navigate(`/tarefa/${t.id}`)}>
                              <TaskCard task={t} dragging={ds.isDragging} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {p.placeholder}
                    </div>
                  )}
                </Droppable>
                <QuickAdd status={col.key} />
              </section>
            ))}
          </div>
        </DragDropContext>
      )}

      <Outlet />
    </div>
  );
}

function TaskCard({ task: t, dragging }: { task: TaskSummary; dragging: boolean }) {
  const group = GROUPS[STATUSES.find((s) => s.key === t.status)!.group];
  const overdue = t.dueDate && t.status !== 'concluido' && t.dueDate < todayISO();
  return (
    <article
      className={clsx(
        'cursor-pointer rounded-xl bg-white p-3 ring-1 transition',
        dragging ? 'rotate-2 shadow-xl ring-sky-300' : 'shadow-sm ring-slate-200/80 hover:shadow-md hover:ring-slate-300',
      )}
    >
      <div className="flex items-start gap-2">
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
        <div className="mt-2.5 flex items-center gap-2 pl-4">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct(t.subtaskDone, t.subtaskTotal)}%` }} />
          </div>
          <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
            {t.subtaskDone}/{t.subtaskTotal}
          </span>
        </div>
      )}
      <footer className="mt-2.5 flex items-center gap-2 pl-4 text-slate-400">
        <span className="text-[11px] font-semibold">ITA-{t.code}</span>
        <MapPin className={clsx('size-3.5', t.posX != null ? 'text-emerald-500' : 'text-slate-300')} aria-label={t.posX != null ? 'No mapa' : 'Sem local no mapa'} />
        {t.documentCount > 0 && (
          <span className="flex items-center gap-0.5 text-[11px]">
            <Paperclip className="size-3" />
            {t.documentCount}
          </span>
        )}
        {!t.isPublic && <EyeOff className="size-3.5" aria-label="Oculto no site" />}
        {t.dueDate && t.status !== 'concluido' && (
          <span className={clsx('flex items-center gap-0.5 text-[11px] font-medium', overdue ? 'text-rose-500' : '')}>
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
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
        placeholder="Título do projeto (Enter para criar)"
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
