import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ChevronRight, ExternalLink, Link2, MapPin, MapPinOff, MessageSquare, MoreHorizontal, Send, Trash2, X } from 'lucide-react';
import { GROUPS, STATUSES, groupOf } from '@shared/status';
import { formatDateTime } from '@shared/format';
import type { Status } from '@shared/types';
import { api, useTaskPatch } from './api';
import { taskKey } from './BoardPage';
import { Comments } from './Comments';
import { Documents } from './Documents';
import { EmailNotifier } from './EmailNotifier';
import { PRIORITIES, PriorityIcon } from './priority';
import { Subtasks } from './Subtasks';
import type { Priority, TaskDetail, TaskSummary } from './types';
import { Avatar, CommitInput, CommitTextarea, DateInput, Label, Menu, SectionTitle, Spinner, Toggle } from './ui';

const KEY_RE = /^ITA-(\d+)$/i;

/** Visualização do projeto em modal sobre o quadro (como o "issue view" do Jira). URL: /admin/tarefa/ITA-12 */
export function TaskModal() {
  const { taskId: param = '' } = useParams();
  const navigate = useNavigate();
  const close = () => navigate('/');
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: api.tasks });

  // Aceita a chave ITA-n (resolvida pela lista do quadro) ou o UUID.
  const keyMatch = KEY_RE.exec(param);
  const id = keyMatch ? tasks.data?.find((t) => t.code === Number(keyMatch[1]))?.id : param;
  const notFound = keyMatch && tasks.data && !id;
  const { data: task, isError, error } = useQuery({ queryKey: ['task', id], queryFn: () => api.task(id!), enabled: !!id });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (e.key === 'Escape' && !typing) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-3 backdrop-blur-sm md:p-8"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={task ? `${taskKey(task)} ${task.title}` : 'Projeto'}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        {task ? (
          <TaskEditor key={task.id} task={task} onClose={close} />
        ) : isError || notFound ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {notFound ? `O projeto ${param.toUpperCase()} não existe ou foi excluído.` : (error as Error).message}
            <div className="mt-4">
              <button type="button" onClick={close} className="font-semibold text-sky-700 hover:underline">
                Voltar ao quadro
              </button>
            </div>
          </div>
        ) : (
          <div className="grid h-80 place-items-center">
            <Spinner className="size-7" />
          </div>
        )}
      </motion.div>
    </div>
  );
}

function TaskEditor({ task, onClose }: { task: TaskDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const patch = useTaskPatch(task.id);
  const group = GROUPS[groupOf(task.status)];
  const categories = [...new Set((qc.getQueryData<TaskSummary[]>(['tasks']) ?? []).map((t) => t.category).filter(Boolean))];
  const [tab, setTab] = useState<'comments' | 'history'>('comments');
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const mapped = task.posX != null;
  const publicUrl = `${location.origin}/projeto/${task.id}`;

  // "M" comenta, como no Jira.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setTab('comments');
        setTimeout(() => commentRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const remove = useMutation({
    mutationFn: () => api.deleteTask(task.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.removeQueries({ queryKey: ['task', task.id] });
      toast.success(`${taskKey(task)} excluído`);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col md:max-h-[calc(100dvh-4rem)]">
      {/* Cabeçalho: trilha + ações */}
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
        <nav className="flex items-center gap-1 text-sm text-slate-500" aria-label="Trilha">
          <button type="button" onClick={onClose} className="rounded-md px-1 hover:bg-slate-100 hover:text-slate-800">
            Projetos
          </button>
          <ChevronRight className="size-3.5" />
          <button
            type="button"
            title="Copiar a chave"
            onClick={() => navigator.clipboard.writeText(taskKey(task)).then(() => toast.success(`${taskKey(task)} copiado`))}
            className="rounded-md px-1 font-semibold text-slate-700 hover:bg-slate-100"
          >
            {taskKey(task)}
          </button>
        </nav>
        {task.isDemo && <span className="rounded-lg bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">demonstração</span>}
        {patch.isPending && <Spinner className="size-4" />}
        <div className="ml-auto flex items-center gap-1">
          <Menu
            label="Mais ações"
            trigger={<MoreHorizontal className="size-4.5" />}
            items={[
              {
                label: 'Copiar link do site',
                icon: <Link2 />,
                hidden: !task.isPublic || !mapped,
                onSelect: () => navigator.clipboard.writeText(publicUrl).then(() => toast.success('Link do projeto copiado')),
              },
              { label: 'Ver no site', icon: <ExternalLink />, hidden: !task.isPublic || !mapped, onSelect: () => window.open(publicUrl, '_blank', 'noopener') },
              { label: mapped ? 'Ajustar no mapa' : 'Posicionar no mapa', icon: <MapPin />, onSelect: () => navigate(`/mapa?tarefa=${task.id}`) },
              { label: 'Excluir projeto', icon: <Trash2 />, danger: true, onSelect: () => confirm(`Excluir ${taskKey(task)} “${task.title}” e todos os anexos?`) && remove.mutate() },
            ]}
          />
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100" aria-label="Fechar">
            <X className="size-4.5" />
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_340px] md:overflow-hidden">
        {/* Coluna principal */}
        <div className="scroll-thin space-y-8 p-6 md:overflow-y-auto md:p-8">
          <div>
            <CommitTextarea
              rows={1}
              value={task.title}
              aria-label="Título"
              onCommit={(v) => (v.trim() ? patch.mutate({ title: v.trim() }) : toast.error('O título não pode ficar vazio'))}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), (e.target as HTMLTextAreaElement).blur())}
              className="!px-2 !py-1 !text-2xl !leading-tight font-extrabold tracking-tight !text-slate-900 !ring-0 hover:!bg-slate-50 focus:!ring-2"
              placeholder="Título do projeto"
            />
            <div className="mt-4">
              <Label>Descrição (aparece no site)</Label>
              <CommitTextarea
                rows={4}
                value={task.description}
                aria-label="Descrição"
                onCommit={(v) => patch.mutate({ description: v })}
                placeholder="Explique o projeto: o que é, por que importa e o que muda para a comunidade."
                className="min-h-28 leading-relaxed"
              />
            </div>
          </div>

          <Subtasks task={task} />
          <Documents task={task} />

          <section>
            <SectionTitle icon={<Send className="size-4" />}>Enviar projeto por e-mail</SectionTitle>
            <EmailNotifier taskId={task.id} notifications={task.notifications} />
            <p className="mt-1.5 text-xs text-slate-400">A pessoa recebe o título, a descrição, o checklist e o link do projeto no site.</p>
          </section>

          {/* Atividade (Comentários | Histórico), como no Jira */}
          <section>
            <SectionTitle icon={<MessageSquare className="size-4" />}>Atividade</SectionTitle>
            <div role="tablist" className="mb-4 flex gap-1 border-b border-slate-200">
              {(
                [
                  ['comments', `Comentários (${task.comments.length})`],
                  ['history', 'Histórico'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={clsx(
                    '-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition',
                    tab === key ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === 'comments' ? (
              <Comments ref={commentRef} task={task} />
            ) : (
              <ol className="relative space-y-3 border-l border-slate-200 pl-5">
                {task.activities.map((a) => (
                  <li key={a.id} className="relative text-sm">
                    <span className="absolute top-1.5 -left-[24.5px] size-2 rounded-full bg-slate-300 ring-4 ring-white" />
                    <span className="font-semibold text-slate-700">{a.userName}</span> <span className="text-slate-600">{a.message}</span>
                    <span className="block text-[11px] text-slate-400">{formatDateTime(a.createdAt)}</span>
                  </li>
                ))}
                {!task.activities.length && <li className="text-sm text-slate-400">Sem registros ainda.</li>}
              </ol>
            )}
          </section>
        </div>

        {/* Coluna lateral: situação + detalhes */}
        <aside className="scroll-thin space-y-4 border-t border-slate-100 bg-slate-50/70 p-6 md:overflow-y-auto md:border-t-0 md:border-l">
          <label className="block">
            <span className="sr-only">Situação</span>
            <span className="relative flex items-center">
              <span className="pointer-events-none absolute left-3.5 size-2.5 rounded-full" style={{ background: group.color }} />
              <select
                value={task.status}
                onChange={(e) => patch.mutate({ status: e.target.value as Status })}
                aria-label="Situação"
                className="h-10 w-full appearance-none rounded-xl pr-8 pl-8 text-sm font-bold ring-1 outline-none transition"
                style={{ background: group.soft, color: group.ink, borderColor: group.color }}
              >
                {STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronRight className="pointer-events-none absolute right-3 size-4 rotate-90" style={{ color: group.ink }} />
            </span>
            <span className="mt-1 block text-[11px] text-slate-400">No site: {group.singular.toLowerCase()}</span>
          </label>

          <div className="rounded-2xl bg-white ring-1 ring-slate-200">
            <p className="border-b border-slate-100 px-4 py-2.5 text-xs font-bold tracking-wider text-slate-500 uppercase">Detalhes</p>
            <dl className="space-y-3.5 p-4">
              <Field label="Responsável">
                <div className="flex items-center gap-2">
                  {task.responsibleName && <Avatar name={task.responsibleName} size="sm" />}
                  <CommitInput value={task.responsibleName} onCommit={(v) => patch.mutate({ responsibleName: v.trim() })} placeholder="Pessoa ou setor" aria-label="Responsável" />
                </div>
              </Field>
              <Field label="E-mail do responsável">
                <CommitInput type="email" value={task.responsibleEmail} onCommit={(v) => patch.mutate({ responsibleEmail: v.trim() })} placeholder="pessoa@ufs.br" aria-label="E-mail do responsável" />
              </Field>
              <Field label="Prioridade">
                <span className="relative flex items-center">
                  <span className="pointer-events-none absolute left-3">
                    <PriorityIcon priority={task.priority} />
                  </span>
                  <select
                    value={task.priority}
                    onChange={(e) => patch.mutate({ priority: e.target.value as Priority })}
                    aria-label="Prioridade"
                    className="h-9 w-full appearance-none rounded-xl bg-white pr-3 pl-9 text-sm text-slate-800 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-sky-400/70"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </span>
              </Field>
              <Field label="Categoria">
                <CommitInput value={task.category} onCommit={(v) => patch.mutate({ category: v.trim() })} list="categorias" placeholder="Ex.: Infraestrutura" aria-label="Categoria" />
                <datalist id="categorias">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <Field label="Relator">
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  {task.createdByName ? (
                    <>
                      <Avatar name={task.createdByName} size="sm" /> {task.createdByName}
                    </>
                  ) : (
                    <span className="text-slate-400">Sistema</span>
                  )}
                </span>
              </Field>
            </dl>
          </div>

          <div className="rounded-2xl bg-white ring-1 ring-slate-200">
            <p className="border-b border-slate-100 px-4 py-2.5 text-xs font-bold tracking-wider text-slate-500 uppercase">Datas</p>
            <div className="grid grid-cols-2 gap-3 p-4">
              <label className="block">
                <Label>Início</Label>
                <DateInput value={task.startDate} onCommit={(v) => patch.mutate({ startDate: v })} />
              </label>
              <label className="block">
                <Label>Previsão</Label>
                <DateInput value={task.dueDate} onCommit={(v) => patch.mutate({ dueDate: v })} />
              </label>
              <label className="col-span-2 block">
                <Label hint={task.status !== 'concluido' ? 'preenchida ao concluir' : undefined}>Data de conclusão</Label>
                <DateInput value={task.completedAt} onCommit={(v) => patch.mutate({ completedAt: v })} />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div>
              <p className="text-sm font-semibold text-slate-800">Visível no site</p>
              <p className="text-xs text-slate-400">{task.isPublic ? 'Aparece para os visitantes' : 'Só no painel'}</p>
            </div>
            <Toggle checked={task.isPublic} onChange={(v) => patch.mutate({ isPublic: v })} label="Visível no site" />
          </div>

          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="flex items-center gap-3">
              <span className={mapped ? 'text-emerald-500' : 'text-slate-300'}>{mapped ? <MapPin className="size-5" /> : <MapPinOff className="size-5" />}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">{mapped ? 'Marcado no mapa' : 'Sem local no mapa'}</p>
                <p className="text-xs text-slate-400">{mapped ? 'Arraste a bolinha para ajustar' : 'Sem local, aparece só na lista do site'}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => navigate(`/mapa?tarefa=${task.id}`)}
                className="h-8 flex-1 rounded-lg bg-white text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                {mapped ? 'Ajustar no mapa' : 'Posicionar no mapa'}
              </button>
              {mapped && (
                <button
                  type="button"
                  onClick={() => patch.mutate({ posX: null, posZ: null })}
                  title="Remover do mapa"
                  className="grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100"
                >
                  <MapPinOff className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          <p className="space-y-1 px-1 text-xs text-slate-400">
            Criado em {formatDateTime(task.createdAt)}
            <br />
            Atualizado em {formatDateTime(task.updatedAt)}
          </p>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-xs font-semibold text-slate-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
