import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { toast } from 'sonner';
import { CalendarClock, Link2, OctagonAlert, Plus, Search, UserRound } from 'lucide-react';
import { formatDayShort } from '@shared/format';
import { api } from './api';
import { ImpedimentDialog } from './ImpedimentDialog';
import { categoryLabel, IMP_CATEGORIES, IMP_IMPACTS, IMP_STATUSES, ImpactBadge, impactRank, isOpen, isOverdue, OverdueBadge, statusMeta } from './impediments';
import type { ImpCategory, Impediment, ImpImpact, ImpStatus } from './types';
import { Button, inputCls, Spinner } from './ui';

type View = 'all' | ImpStatus | 'alto' | 'atrasados';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function matches(i: Impediment, query: string) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm([`IMP-${i.code}`, i.title, i.description, i.measure, i.responsibleName, i.actionText, i.task ? `ITA-${i.task.code} ${i.task.title}` : ''].join(' '));
  return words.every((w) => hay.includes(w));
}

/** Abertos primeiro: atrasados, depois maior impacto, depois prazo mais próximo. Resolvidos por último, do mais recente. */
function sortItems(items: Impediment[]) {
  return [...items].sort((a, b) => {
    if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1;
    if (!isOpen(a)) return (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? '') || b.code - a.code;
    return (
      Number(isOverdue(b)) - Number(isOverdue(a)) ||
      impactRank(b.impact) - impactRank(a.impact) ||
      (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
      a.code - b.code
    );
  });
}

export function ImpedimentsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['impediments'], queryFn: api.impediments });
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('all');
  const [impact, setImpact] = useState<ImpImpact | ''>('');
  const [category, setCategory] = useState<ImpCategory | ''>('');
  const [editing, setEditing] = useState<string | 'novo' | null>(null);

  const all = useMemo(() => data ?? [], [data]);
  const counts = useMemo(
    () => ({
      total: all.length,
      em_analise: all.filter((i) => i.status === 'em_analise').length,
      em_resolucao: all.filter((i) => i.status === 'em_resolucao').length,
      resolvido: all.filter((i) => i.status === 'resolvido').length,
      alto: all.filter((i) => isOpen(i) && i.impact === 'alto').length,
      atrasados: all.filter(isOverdue).length,
    }),
    [all],
  );

  const filtering = !!(query.trim() || view !== 'all' || impact || category);
  const items = useMemo(() => {
    const list = all.filter(
      (i) =>
        matches(i, query) &&
        (!impact || i.impact === impact) &&
        (!category || i.category === category) &&
        (view === 'all' || (view === 'alto' ? isOpen(i) && i.impact === 'alto' : view === 'atrasados' ? isOverdue(i) : i.status === view)),
    );
    return sortItems(list);
  }, [all, query, view, impact, category]);

  const quickStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ImpStatus }) => api.updateImpediment(id, { status }),
    onSuccess: (saved) => {
      qc.setQueryData(['impediment', saved.id], saved);
      qc.invalidateQueries({ queryKey: ['impediments'] });
      toast.success(`IMP-${saved.code}: ${statusMeta(saved.status).label.toLowerCase()}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clear = () => {
    setQuery('');
    setView('all');
    setImpact('');
    setCategory('');
  };

  const kpis: { key: View; label: string; value: number; tone: string; accent: string }[] = [
    { key: 'all', label: 'Impedimentos registrados', value: counts.total, tone: 'text-slate-900', accent: '#0f172a' },
    { key: 'em_analise', label: 'Em análise', value: counts.em_analise, tone: 'text-sky-700', accent: '#0ea5e9' },
    { key: 'em_resolucao', label: 'Em resolução', value: counts.em_resolucao, tone: 'text-amber-700', accent: '#f59e0b' },
    { key: 'resolvido', label: 'Resolvidos', value: counts.resolvido, tone: 'text-emerald-700', accent: '#10b981' },
    { key: 'alto', label: 'Impacto alto em aberto', value: counts.alto, tone: 'text-rose-700', accent: '#e11d48' },
    { key: 'atrasados', label: 'Prazo vencido', value: counts.atrasados, tone: 'text-rose-700', accent: '#be123c' },
  ];

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 p-6">
        <header className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-slate-900">
              <OctagonAlert className="size-5 text-rose-500" aria-hidden /> Mapeamento de impedimentos
            </h1>
            <p className="text-sm text-slate-500">Obstáculos que dificultam ou impedem a execução das ações do Plano de Gestão.</p>
          </div>
          <Button onClick={() => setEditing('novo')}>
            <Plus className="size-4" /> Registrar impedimento
          </Button>
        </header>

        {/* Painel de indicadores (clicar em um indicador filtra a lista) */}
        <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((k) => {
            const active = view === k.key;
            return (
              <button
                key={k.key}
                type="button"
                aria-pressed={k.key !== 'all' ? active : undefined}
                onClick={() => setView(k.key === 'all' || active ? 'all' : k.key)}
                className={clsx(
                  'rounded-2xl bg-white p-4 text-left shadow-sm ring-1 transition hover:shadow-md',
                  active ? 'ring-2' : 'ring-slate-200',
                  k.key === 'all' && 'md:col-span-1',
                )}
                style={active ? { borderColor: k.accent, boxShadow: `0 0 0 2px ${k.accent}55` } : undefined}
              >
                <span className="block h-1 w-8 rounded-full" style={{ background: k.accent }} />
                <span className={clsx('mt-3 block text-3xl font-extrabold tabular-nums', k.tone)}>{k.value}</span>
                <span className="mt-0.5 block text-xs font-semibold text-slate-500">{k.label}</span>
              </button>
            );
          })}
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-60 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Pesquisar impedimentos"
              placeholder="Pesquisar por nome ou descrição…"
              className={clsx(inputCls, 'h-10 pl-9')}
            />
          </label>
          <select value={impact} onChange={(e) => setImpact(e.target.value as ImpImpact | '')} aria-label="Filtrar por impacto" className={clsx(inputCls, 'h-10 !w-auto')}>
            <option value="">Todos os impactos</option>
            {IMP_IMPACTS.map((i) => (
              <option key={i.key} value={i.key}>
                Impacto {i.label.toLowerCase()}
              </option>
            ))}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value as ImpCategory | '')} aria-label="Filtrar por categoria" className={clsx(inputCls, 'h-10 !w-auto')}>
            <option value="">Todas as categorias</option>
            {IMP_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          {filtering && (
            <button type="button" onClick={clear} className="text-sm font-semibold text-sky-700 hover:underline">
              Limpar filtros
            </button>
          )}
          <span className="ml-auto text-xs text-slate-400" aria-live="polite">
            {filtering ? `${items.length} de ${all.length}` : `${all.length} no total`}
          </span>
        </div>

        {isLoading && <Spinner className="mx-auto my-10 size-7" />}
        {isError && <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{(error as Error).message}</p>}

        {!isLoading && !all.length && (
          <div className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-200">
            <OctagonAlert className="mx-auto size-10 text-slate-300" aria-hidden />
            <p className="mt-3 font-bold text-slate-800">Nenhum impedimento registrado ainda</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Registre o que está travando uma ação do Plano de Gestão, defina a providência e acompanhe até a solução. Tudo fica guardado como histórico.</p>
            <Button className="mt-4" onClick={() => setEditing('novo')}>
              <Plus className="size-4" /> Registrar o primeiro impedimento
            </Button>
          </div>
        )}
        {!!all.length && !items.length && <p className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">Nenhum impedimento corresponde a estes filtros.</p>}

        <ul className="space-y-2.5" aria-label="Lista de impedimentos">
          {items.map((i) => (
            <Row key={i.id} item={i} onOpen={() => setEditing(i.id)} onStatus={(status) => quickStatus.mutate({ id: i.id, status })} />
          ))}
        </ul>
      </div>

      {editing && <ImpedimentDialog id={editing === 'novo' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Row({ item: i, onOpen, onStatus }: { item: Impediment; onOpen: () => void; onStatus: (s: ImpStatus) => void }) {
  const st = statusMeta(i.status);
  const overdue = isOverdue(i);
  const link = i.task ? `ITA-${i.task.code} · ${i.task.title}` : i.actionText;
  return (
    <li
      className={clsx('flex flex-wrap items-stretch gap-x-4 gap-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 transition hover:shadow-md', i.status === 'resolvido' ? 'opacity-75 ring-slate-200' : 'ring-slate-200')}
      style={{ borderLeft: `5px solid ${st.color}` }}
    >
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 basis-80 text-left" aria-label={`Abrir IMP-${i.code}: ${i.title}`}>
        <span className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-slate-400">IMP-{i.code}</span>
          {link && (
            <span className="flex max-w-full items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600" title={i.task ? 'Ação vinculada do Plano de Gestão' : 'Eixo / ação informada'}>
              <Link2 className="size-3 shrink-0" aria-hidden /> <span className="truncate">{link}</span>
            </span>
          )}
          <span className="rounded-md bg-slate-50 px-1.5 py-0.5 font-medium text-slate-500 ring-1 ring-slate-200">{categoryLabel(i.category)}</span>
        </span>
        <span className={clsx('mt-1.5 block text-[15px] leading-snug font-semibold text-slate-900', i.status === 'resolvido' && 'text-slate-600')}>{i.title}</span>
        {i.description && <span className="mt-1 line-clamp-2 block text-sm text-slate-500">{i.description}</span>}
        {i.measure && (
          <span className="mt-1.5 line-clamp-2 block text-sm text-slate-600">
            <strong className="font-semibold text-slate-700">Providência:</strong> {i.measure}
          </span>
        )}
        <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          {i.responsibleName && (
            <span className="flex items-center gap-1">
              <UserRound className="size-3.5" aria-hidden /> {i.responsibleName}
            </span>
          )}
          {i.status === 'resolvido' && i.resolvedAt ? (
            <span className="font-medium text-emerald-700">Resolvido em {formatDayShort(i.resolvedAt)}</span>
          ) : (
            i.dueDate && (
              <span className={clsx('flex items-center gap-1', overdue && 'font-bold text-rose-600')}>
                <CalendarClock className="size-3.5" aria-hidden /> Prazo {formatDayShort(i.dueDate)}
              </span>
            )
          )}
        </span>
      </button>

      <div className="flex flex-col items-start gap-2 sm:items-end">
        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          {overdue && <OverdueBadge />}
          <ImpactBadge impact={i.impact} />
        </div>
        <select
          value={i.status}
          onChange={(e) => onStatus(e.target.value as ImpStatus)}
          aria-label={`Situação de IMP-${i.code}`}
          className={clsx('h-8 cursor-pointer rounded-lg px-2.5 text-xs font-bold ring-1 outline-none focus:ring-2', st.chip)}
        >
          {IMP_STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}
