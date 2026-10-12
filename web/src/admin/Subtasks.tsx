import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { Check, ChevronDown, GripVertical, ListChecks, Plus, Trash2 } from 'lucide-react';
import { formatDayShort, pct } from '@shared/format';
import { api, useRefreshTask, type SubtaskPatch } from './api';
import { EmailNotifier } from './EmailNotifier';
import type { Subtask, TaskDetail } from './types';
import { Avatar, Button, CommitInput, CommitTextarea, DateInput, Label, SectionTitle } from './ui';

export function Subtasks({ task }: { task: TaskDetail }) {
  const qc = useQueryClient();
  const refresh = useRefreshTask(task.id);
  const [title, setTitle] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const setSubtasks = (fn: (subs: Subtask[]) => Subtask[]) =>
    qc.setQueryData<TaskDetail>(['task', task.id], (old) => (old ? { ...old, subtasks: fn(old.subtasks) } : old));

  const create = useMutation({
    mutationFn: (t: string) => api.createSubtask(task.id, { title: t }),
    onSuccess: (s) => {
      setSubtasks((subs) => [...subs, s]);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: SubtaskPatch }) => api.updateSubtask(id, data),
    onMutate: ({ id, data }) => setSubtasks((subs) => subs.map((s) => (s.id === id ? { ...s, ...data } : s))),
    onSuccess: (s) => setSubtasks((subs) => subs.map((x) => (x.id === s.id ? s : x))),
    onError: (e: Error) => toast.error(e.message),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteSubtask(id),
    onMutate: (id) => setSubtasks((subs) => subs.filter((s) => s.id !== id)),
    onSettled: refresh,
  });

  // Reordenação por arraste: nova posição entre os vizinhos (aparece nessa ordem no site).
  const onDragEnd = ({ source, destination, draggableId }: DropResult) => {
    if (!destination || destination.index === source.index) return;
    const rest = task.subtasks.filter((s) => s.id !== draggableId);
    const prev = rest[destination.index - 1]?.position;
    const next = rest[destination.index]?.position;
    const position = prev == null ? (next ?? 1024) / 2 : next == null ? prev + 1024 : (prev + next) / 2;
    setSubtasks((subs) => subs.map((s) => (s.id === draggableId ? { ...s, position } : s)).sort((a, b) => a.position - b.position));
    update.mutate({ id: draggableId, data: { position } });
  };

  const done = task.subtasks.filter((s) => s.done).length;
  const total = task.subtasks.length;

  return (
    <section>
      <SectionTitle
        icon={<ListChecks className="size-4" />}
        aside={total > 0 && <span className="text-xs font-semibold text-slate-500 tabular-nums">{pct(done, total)}% concluído</span>}
      >
        Subtarefas {total > 0 && <span className="font-medium text-slate-400">· {done}/{total}</span>}
      </SectionTitle>

      {total > 0 && (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <motion.div className="h-full rounded-full bg-emerald-500" initial={{ width: 0 }} animate={{ width: `${pct(done, total)}%` }} />
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="subtarefas">
          {(dp) => (
      <ul ref={dp.innerRef} {...dp.droppableProps} className="space-y-1">
        {task.subtasks.map((s, index) => {
          const open = openId === s.id;
          return (
            <Draggable key={s.id} draggableId={s.id} index={index}>
              {(drag, snap) => (
            <li ref={drag.innerRef} {...drag.draggableProps} className={clsx('group/sub rounded-xl transition', snap.isDragging ? 'bg-white shadow-lg ring-1 ring-sky-200' : open ? 'bg-slate-50 ring-1 ring-slate-200' : 'hover:bg-slate-50')}>
              <div className="flex items-center gap-3 px-2.5 py-1.5">
                <span {...drag.dragHandleProps} aria-label="Arrastar para reordenar" title="Arrastar para reordenar" className="-mr-2 -ml-1.5 cursor-grab text-slate-300 opacity-0 transition group-hover/sub:opacity-100 hover:text-slate-500">
                  <GripVertical className="size-4" />
                </span>
                <button
                  type="button"
                  onClick={() => update.mutate({ id: s.id, data: { done: !s.done } })}
                  aria-label={s.done ? 'Marcar como pendente' : 'Marcar como concluída'}
                  className={clsx(
                    'grid size-5 shrink-0 place-items-center rounded-md transition',
                    s.done ? 'bg-emerald-500 text-white' : 'ring-2 ring-slate-300 ring-inset hover:ring-emerald-400',
                  )}
                >
                  {s.done && <Check className="size-3.5" strokeWidth={3} />}
                </button>
                <CommitInput
                  value={s.title}
                  onCommit={(v) => v.trim() && update.mutate({ id: s.id, data: { title: v.trim() } })}
                  className={clsx('!bg-transparent !px-1 !py-1 !ring-0 focus:!ring-2', s.done && 'text-slate-400 line-through')}
                />
                {s.completedAt && s.done && <span className="shrink-0 text-[11px] text-slate-400">{formatDayShort(s.completedAt)}</span>}
                {s.responsibleName && <Avatar name={s.responsibleName} size="xs" />}
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : s.id)}
                  className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-700"
                  aria-label="Detalhes da subtarefa"
                >
                  <ChevronDown className={clsx('size-4 transition', open && 'rotate-180')} />
                </button>
              </div>

              <AnimatePresence initial={false}>
                {open && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="grid gap-3 px-3 pt-1 pb-3 sm:grid-cols-2">
                      <label className="sm:col-span-2">
                        <Label>Descrição</Label>
                        <CommitTextarea
                          rows={2}
                          value={s.description}
                          onCommit={(v) => update.mutate({ id: s.id, data: { description: v } })}
                          placeholder="Detalhes desta etapa…"
                        />
                      </label>
                      <label>
                        <Label>Responsável</Label>
                        <CommitInput value={s.responsibleName} onCommit={(v) => update.mutate({ id: s.id, data: { responsibleName: v } })} placeholder="Nome" />
                      </label>
                      <label>
                        <Label>E-mail do responsável</Label>
                        <CommitInput
                          type="email"
                          value={s.responsibleEmail}
                          onCommit={(v) => update.mutate({ id: s.id, data: { responsibleEmail: v.trim() } })}
                          placeholder="pessoa@ufs.br"
                        />
                      </label>
                      <label>
                        <Label>Prazo</Label>
                        <DateInput value={s.dueDate} onCommit={(v) => update.mutate({ id: s.id, data: { dueDate: v } })} />
                      </label>
                      <label>
                        <Label>Data de conclusão</Label>
                        <DateInput value={s.completedAt} onCommit={(v) => update.mutate({ id: s.id, data: { completedAt: v, done: !!v } })} />
                      </label>
                      <div className="sm:col-span-2">
                        <Label hint="Enter envia">Enviar esta subtarefa por e-mail</Label>
                        <EmailNotifier taskId={task.id} subtaskId={s.id} notifications={task.notifications} compact />
                      </div>
                      <div className="sm:col-span-2">
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => confirm(`Excluir a subtarefa “${s.title}”?`) && remove.mutate(s.id)}
                        >
                          <Trash2 className="size-3.5" /> Excluir subtarefa
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
              )}
            </Draggable>
          );
        })}
        {dp.placeholder}
      </ul>
          )}
        </Droppable>
      </DragDropContext>

      <form
        className="mt-1 flex items-center gap-3 rounded-xl px-2.5 py-1.5 transition focus-within:bg-slate-50"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) create.mutate(title.trim());
          setTitle('');
        }}
      >
        <Plus className="size-5 shrink-0 text-slate-400" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Adicionar subtarefa e pressionar Enter"
          className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
      </form>
    </section>
  );
}
