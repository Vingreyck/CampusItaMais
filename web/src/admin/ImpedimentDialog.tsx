import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Link2, Search, X } from 'lucide-react';
import { formatDateTime } from '@shared/format';
import { api, type ImpedimentPatch } from './api';
import { IMP_CATEGORIES, IMP_IMPACTS, IMP_STATUSES, ImpactBars } from './impediments';
import type { ImpCategory, ImpedimentDetail, ImpImpact, ImpStatus, TaskSummary } from './types';
import { Button, inputCls, Label, Spinner } from './ui';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Cadastro e edição de um impedimento (mesmo formulário). `id = null` cria um novo. */
export function ImpedimentDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useQuery({ queryKey: ['impediment', id], queryFn: () => api.impediment(id!), enabled: !!id });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const loading = !!id && !detail.data;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm md:pt-[4vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={id ? `Editar impedimento${detail.data ? ` IMP-${detail.data.code}` : ''}` : 'Registrar impedimento'}
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        {loading ? (
          <div className="grid h-72 place-items-center">
            {detail.isError ? <p className="text-sm text-slate-500">{(detail.error as Error).message}</p> : <Spinner className="size-7" />}
          </div>
        ) : (
          <ImpedimentForm key={id ?? 'novo'} initial={detail.data ?? null} onClose={onClose} />
        )}
      </motion.div>
    </div>
  );
}

function ImpedimentForm({ initial, onClose }: { initial: ImpedimentDetail | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<ImpCategory>(initial?.category ?? 'outros');
  const [impact, setImpact] = useState<ImpImpact>(initial?.impact ?? 'medio');
  const [responsibleName, setResponsibleName] = useState(initial?.responsibleName ?? '');
  const [measure, setMeasure] = useState(initial?.measure ?? '');
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [status, setStatus] = useState<ImpStatus>(initial?.status ?? 'em_analise');
  const [taskId, setTaskId] = useState<string | null>(initial?.taskId ?? null);
  const [actionText, setActionText] = useState(initial?.actionText ?? '');

  const save = useMutation({
    mutationFn: async () => {
      const values = {
        title: title.trim(),
        description: description.trim(),
        category,
        impact,
        responsibleName: responsibleName.trim(),
        measure: measure.trim(),
        dueDate: dueDate || null,
        status,
        taskId,
        actionText: taskId ? '' : actionText.trim(),
      };
      if (!initial) return api.createImpediment(values);
      // Edição: envia só o que mudou, para o histórico registrar exatamente o que foi alterado.
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) if (v !== (initial as unknown as Record<string, unknown>)[k]) patch[k] = v;
      if (!Object.keys(patch).length) return initial;
      return api.updateImpediment(initial.id, patch as ImpedimentPatch);
    },
    onSuccess: (saved) => {
      qc.setQueryData(['impediment', saved.id], saved);
      qc.invalidateQueries({ queryKey: ['impediments'] });
      toast.success(initial ? `IMP-${saved.code} atualizado` : `IMP-${saved.code} registrado`);
      onClose();
    },
    onError: (e: Error) => toast.error('Não foi possível salvar', { description: e.message }),
  });

  return (
    <form
      aria-label="Formulário de impedimento"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) save.mutate();
      }}
    >
      <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{initial ? `Editar IMP-${initial.code}` : 'Registrar impedimento'}</h2>
          <p className="text-xs text-slate-500">
            {initial ? `Registrado em ${formatDateTime(initial.createdAt)}` : 'Obstáculo que dificulta ou impede a execução de uma ação do Plano de Gestão.'}
          </p>
        </div>
        <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Fechar">
          <X className="size-4.5" />
        </button>
      </header>

      <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label hint="opcional">Ação vinculada</Label>
          <TaskPicker taskId={taskId} onChange={setTaskId} />
          {!taskId && (
            <input
              value={actionText}
              onChange={(e) => setActionText(e.target.value)}
              maxLength={120}
              aria-label="Ação ou eixo (sem vínculo)"
              placeholder="Sem ação cadastrada? Informe o eixo ou a ação. Ex.: Infraestrutura"
              className={clsx(inputCls, 'mt-2')}
            />
          )}
        </div>

        <label className="block sm:col-span-2">
          <Label>Impedimento *</Label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            placeholder="Ex.: Falta de recursos para a reforma do bloco B"
            className={inputCls}
          />
        </label>

        <label className="block sm:col-span-2">
          <Label hint="opcional">Detalhes do problema</Label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Descreva o problema identificado." className={clsx(inputCls, 'resize-y')} />
        </label>

        <label className="block">
          <Label>Categoria</Label>
          <select value={category} onChange={(e) => setCategory(e.target.value as ImpCategory)} className={inputCls}>
            {IMP_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <Label>Responsável</Label>
          <input value={responsibleName} onChange={(e) => setResponsibleName(e.target.value)} maxLength={120} placeholder="Pessoa ou setor que acompanha" className={inputCls} />
        </label>

        <fieldset>
          <Label>Impacto</Label>
          <div role="radiogroup" aria-label="Impacto" className="flex gap-1.5">
            {IMP_IMPACTS.map((i) => {
              return (
                <button
                  key={i.key}
                  type="button"
                  role="radio"
                  aria-checked={impact === i.key}
                  onClick={() => setImpact(i.key)}
                  className={clsx(
                    'flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold ring-1 transition',
                    impact === i.key ? `${i.chip} ring-2` : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50',
                  )}
                >
                  <ImpactBars level={i.level} /> {i.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="block">
          <Label hint="previsão para resolver">Prazo</Label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
        </label>

        <fieldset className="sm:col-span-2">
          <Label>Situação</Label>
          <div role="radiogroup" aria-label="Situação" className="grid grid-cols-3 gap-1.5">
            {IMP_STATUSES.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.key}
                  type="button"
                  role="radio"
                  aria-checked={status === s.key}
                  onClick={() => setStatus(s.key)}
                  className={clsx(
                    'flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold ring-1 transition',
                    status === s.key ? `${s.chip} ring-2` : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50',
                  )}
                >
                  <Icon className="size-4" aria-hidden /> {s.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="block sm:col-span-2">
          <Label hint="o que precisa ser feito">Providência necessária</Label>
          <textarea value={measure} onChange={(e) => setMeasure(e.target.value)} rows={3} placeholder="Ex.: Solicitar à PROAD a liberação do recurso até o fim do mês." className={clsx(inputCls, 'resize-y')} />
        </label>
      </div>

      {initial && (
        <section className="border-t border-slate-100 px-6 py-5" aria-label="Histórico do impedimento">
          <h3 className="mb-3 text-sm font-bold text-slate-800">Histórico</h3>
          <ol className="relative space-y-3 border-l border-slate-200 pl-5">
            {initial.events.map((ev) => (
              <li key={ev.id} className="relative text-sm">
                <span className="absolute top-1.5 -left-[24.5px] size-2 rounded-full bg-slate-300 ring-4 ring-white" />
                <span className="font-semibold text-slate-700">{ev.userName}</span> <span className="text-slate-600">{ev.message}</span>
                <span className="block text-[11px] text-slate-400">{formatDateTime(ev.createdAt)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!title.trim()}>
          {initial ? 'Salvar alterações' : 'Registrar impedimento'}
        </Button>
      </footer>
    </form>
  );
}

/** Busca uma ação do Plano de Gestão já cadastrada (por código, título ou eixo) para vincular. */
function TaskPicker({ taskId, onChange }: { taskId: string | null; onChange: (id: string | null) => void }) {
  // Sempre confere a lista atual ao abrir: uma ação criada agora por outra pessoa precisa aparecer na busca.
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: api.tasks, refetchOnMount: 'always' });
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const selected = tasks.data?.find((t) => t.id === taskId) ?? null;

  const results = useMemo(() => {
    const words = norm(query).split(/\s+/).filter(Boolean);
    return (tasks.data ?? [])
      .filter((t) => {
        const hay = norm(`ITA-${t.code} ${t.title} ${t.category}`);
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 8);
  }, [tasks.data, query]);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (t: TaskSummary) => {
    onChange(t.id);
    setQuery('');
    setOpen(false);
  };

  if (taskId) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-sky-50 px-3 py-2.5 ring-1 ring-sky-200">
        <Link2 className="size-4 shrink-0 text-sky-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{selected ? `ITA-${selected.code} · ${selected.title}` : 'Ação vinculada'}</p>
          {selected?.category && <p className="text-xs text-slate-500">{selected.category}</p>}
        </div>
        <button type="button" onClick={() => onChange(null)} className="rounded-lg px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100" aria-label="Remover vínculo com a ação">
          Remover vínculo
        </button>
      </div>
    );
  }

  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="lista-acoes"
        aria-autocomplete="list"
        aria-label="Buscar ação do Plano de Gestão"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && open && results[active]) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        placeholder="Buscar ação já cadastrada (código, título ou eixo)…"
        className={clsx(inputCls, 'pl-9')}
      />
      {open && (
        <ul id="lista-acoes" role="listbox" className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl bg-white py-1 shadow-xl ring-1 ring-slate-200">
          {tasks.isLoading && <li className="px-3 py-2 text-sm text-slate-400">Carregando ações…</li>}
          {results.map((t, i) => (
            <li key={t.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(t)}
                className={clsx('flex w-full items-start gap-2 px-3 py-2 text-left text-sm', i === active ? 'bg-sky-50' : 'hover:bg-slate-50')}
              >
                <span className="mt-0.5 shrink-0 text-xs font-bold text-slate-400">ITA-{t.code}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{t.title}</span>
                  {t.category && <span className="block text-xs text-slate-400">{t.category}</span>}
                </span>
              </button>
            </li>
          ))}
          {!tasks.isLoading && !results.length && <li className="px-3 py-2 text-sm text-slate-400">Nenhuma ação encontrada. Você pode informar o eixo no campo abaixo.</li>}
        </ul>
      )}
    </div>
  );
}
