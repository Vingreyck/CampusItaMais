import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { ExternalLink, History, MapPin, MapPinOff, Send, Trash2, X } from 'lucide-react';
import { GROUPS, STATUSES, groupOf } from '@shared/status';
import { formatDateTime } from '@shared/format';
import type { Status } from '@shared/types';
import { api, useTaskPatch } from './api';
import { Documents } from './Documents';
import { EmailNotifier } from './EmailNotifier';
import { Subtasks } from './Subtasks';
import type { TaskDetail, TaskSummary } from './types';
import { Button, CommitInput, CommitTextarea, DateInput, Label, SectionTitle, Spinner, Toggle } from './ui';

export function TaskModal() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const close = () => navigate('/');
  const { data: task, isError, error } = useQuery({ queryKey: ['task', taskId], queryFn: () => api.task(taskId!), enabled: !!taskId });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-3 backdrop-blur-sm md:p-8"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        {task ? (
          <TaskEditor key={task.id} task={task} onClose={close} />
        ) : isError ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {(error as Error).message}
            <div className="mt-4">
              <Button variant="secondary" onClick={close}>
                Voltar ao quadro
              </Button>
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

  const remove = useMutation({
    mutationFn: () => api.deleteTask(task.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.removeQueries({ queryKey: ['task', task.id] });
      toast.success('Projeto excluído');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mapped = task.posX != null;

  return (
    <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col md:max-h-[calc(100dvh-4rem)]">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
        <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">ITA-{task.code}</span>
        <label className="relative flex items-center">
          <span className="pointer-events-none absolute left-3 size-2.5 rounded-full" style={{ background: group.color }} />
          <select
            value={task.status}
            onChange={(e) => patch.mutate({ status: e.target.value as Status })}
            className="h-8 appearance-none rounded-lg bg-slate-50 pr-3 pl-7 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 outline-none hover:bg-slate-100"
          >
            {STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {task.isDemo && <span className="rounded-lg bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">demonstração</span>}
        {patch.isPending && <Spinner className="size-4" />}
        <div className="ml-auto flex items-center gap-1">
          {task.isPublic && mapped && (
            <a
              href={`/projeto/${task.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              <ExternalLink className="size-3.5" /> Ver no site
            </a>
          )}
          <Button size="sm" variant="danger" onClick={() => confirm(`Excluir o projeto “${task.title}” e todos os seus anexos?`) && remove.mutate()}>
            <Trash2 className="size-3.5" />
          </Button>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100" aria-label="Fechar">
            <X className="size-4.5" />
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_330px] md:overflow-hidden">
        {/* Coluna principal */}
        <div className="scroll-thin space-y-8 p-6 md:overflow-y-auto md:p-8">
          <div>
            <CommitTextarea
              rows={1}
              value={task.title}
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

          <section>
            <SectionTitle icon={<History className="size-4" />}>Histórico</SectionTitle>
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
          </section>
        </div>

        {/* Coluna lateral */}
        <aside className="scroll-thin space-y-5 border-t border-slate-100 bg-slate-50/70 p-6 md:overflow-y-auto md:border-t-0 md:border-l">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-slate-200">
            <div>
              <p className="text-sm font-semibold text-slate-800">Visível no site</p>
              <p className="text-xs text-slate-400">{task.isPublic ? 'Aparece para os visitantes' : 'Só no painel'}</p>
            </div>
            <Toggle checked={task.isPublic} onChange={(v) => patch.mutate({ isPublic: v })} label="Visível no site" />
          </div>

          <div className="rounded-2xl bg-white p-3.5 ring-1 ring-slate-200">
            <div className="flex items-center gap-3">
              <span className={mapped ? 'text-emerald-500' : 'text-slate-300'}>{mapped ? <MapPin className="size-5" /> : <MapPinOff className="size-5" />}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">{mapped ? 'Marcado no mapa' : 'Sem local no mapa'}</p>
                <p className="text-xs text-slate-400">{mapped ? 'Arraste a bolinha para ajustar' : 'Arraste a bolinha até o ponto do campus'}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => navigate(`/mapa?tarefa=${task.id}`)}>
                {mapped ? 'Ajustar no mapa' : 'Posicionar no mapa'}
              </Button>
              {mapped && (
                <Button size="sm" variant="ghost" onClick={() => patch.mutate({ posX: null, posZ: null })} title="Remover do mapa">
                  <MapPinOff className="size-3.5" />
                </Button>
              )}
            </div>
          </div>

          <label className="block">
            <Label>Categoria</Label>
            <CommitInput value={task.category} onCommit={(v) => patch.mutate({ category: v.trim() })} list="categorias" placeholder="Ex.: Infraestrutura" />
            <datalist id="categorias">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>

          <label className="block">
            <Label>Responsável</Label>
            <CommitInput value={task.responsibleName} onCommit={(v) => patch.mutate({ responsibleName: v.trim() })} placeholder="Nome da pessoa ou setor" />
          </label>
          <label className="block">
            <Label>E-mail do responsável</Label>
            <CommitInput
              type="email"
              value={task.responsibleEmail}
              onCommit={(v) => patch.mutate({ responsibleEmail: v.trim() })}
              placeholder="pessoa@ufs.br"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
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

          <dl className="space-y-1 border-t border-slate-200 pt-4 text-xs text-slate-400">
            <div>
              Criado {task.createdByName ? `por ${task.createdByName} ` : ''}em {formatDateTime(task.createdAt)}
            </div>
            <div>Atualizado em {formatDateTime(task.updatedAt)}</div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
