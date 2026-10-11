import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { CalendarRange, Check, Printer } from 'lucide-react';
import { GROUPS, STATUSES, STATUS_LABEL, groupOf } from '@shared/status';
import { formatDateTime, formatDayShort, pct, todayISO } from '@shared/format';
import { api } from './api';
import type { Report, TaskWithSubtasks } from './types';
import { Button, inputCls, Spinner } from './ui';

function shiftDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: 'Últimos 30 dias', range: () => [shiftDays(todayISO(), -29), todayISO()] },
  { label: 'Este mês', range: () => [`${todayISO().slice(0, 7)}-01`, todayISO()] },
  { label: 'Este ano', range: () => [`${todayISO().slice(0, 4)}-01-01`, todayISO()] },
  { label: 'Ano passado', range: () => [`${Number(todayISO().slice(0, 4)) - 1}-01-01`, `${Number(todayISO().slice(0, 4)) - 1}-12-31`] },
];

export function ReportPage() {
  const [[from, to], setRange] = useState<[string, string]>(() => [`${todayISO().slice(0, 4)}-01-01`, todayISO()]);
  const [showActivities, setShowActivities] = useState(true);
  const valid = from && to && from <= to;
  const { data, isFetching, error } = useQuery({
    queryKey: ['report', from, to],
    queryFn: () => api.report(from, to),
    enabled: !!valid,
  });

  return (
    <div className="scroll-thin h-full overflow-y-auto print:h-auto print:overflow-visible">
      <div className="mx-auto max-w-5xl p-6 print:hidden">
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Relatório de atividades</h1>
        <p className="text-sm text-slate-500">Escolha o período e imprima (ou salve em PDF) o que foi feito no campus.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">De</span>
            <input type="date" value={from} max={to} onChange={(e) => setRange([e.target.value, to])} className={clsx(inputCls, 'w-40')} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Até</span>
            <input type="date" value={to} min={from} onChange={(e) => setRange([from, e.target.value])} className={clsx(inputCls, 'w-40')} />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setRange(p.range())}
                className="rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input type="checkbox" checked={showActivities} onChange={(e) => setShowActivities(e.target.checked)} className="size-4 accent-slate-900" />
            Incluir histórico detalhado
          </label>
          <Button className="ml-auto" onClick={() => window.print()} disabled={!data}>
            <Printer className="size-4" /> Imprimir / PDF
          </Button>
        </div>
        {!valid && <p className="mt-2 text-sm text-rose-600">A data inicial deve ser anterior à final.</p>}
        {error && <p className="mt-2 text-sm text-rose-600">{(error as Error).message}</p>}
      </div>

      {isFetching && !data && <Spinner className="mx-auto my-16 size-7" />}
      {data && <ReportDocument report={data} showActivities={showActivities} />}
    </div>
  );
}

function ReportDocument({ report: r, showActivities }: { report: Report; showActivities: boolean }) {
  const cards = [
    { label: 'Projetos concluídos', value: r.summary.completedTasks, color: GROUPS.concluido.color },
    { label: 'Etapas concluídas', value: r.summary.completedSubtasks, color: '#0ea5e9' },
    { label: 'Em andamento hoje', value: r.summary.inProgress, color: GROUPS.andamento.color },
    { label: 'Novos projetos e ideias', value: r.summary.createdTasks, color: GROUPS.planejado.color },
  ];
  const subsByTask = new Map<number, Report['completedSubtasks']>();
  for (const s of r.completedSubtasks) subsByTask.set(s.taskCode, [...(subsByTask.get(s.taskCode) ?? []), s]);

  return (
    <article className="mx-auto mb-10 max-w-5xl rounded-3xl bg-white p-10 shadow-sm ring-1 ring-slate-200 print:m-0 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0">
      <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-5">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-slate-500 uppercase">Universidade Federal de Sergipe · Campus Prof. Alberto Carvalho</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Relatório de atividades</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
            <CalendarRange className="size-4" /> Período: <strong>{formatDayShort(r.from)}</strong> a <strong>{formatDayShort(r.to)}</strong>
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-extrabold text-slate-900">
            Campus Ita<span className="text-sky-500">+</span>
          </p>
          <p className="text-xs text-slate-500">Itabaiana/SE</p>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 print:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="print-avoid-break rounded-2xl p-4 ring-1 ring-slate-200">
            <span className="block h-1 w-8 rounded-full" style={{ background: c.color }} />
            <p className="mt-3 text-3xl font-extrabold text-slate-900 tabular-nums">{c.value}</p>
            <p className="text-xs font-semibold text-slate-500">{c.label}</p>
          </div>
        ))}
      </section>

      <section className="print-avoid-break mt-5 rounded-2xl bg-slate-50 p-4 print:bg-white print:ring-1 print:ring-slate-200">
        <p className="mb-2 text-xs font-bold tracking-wider text-slate-500 uppercase">Situação atual de todos os projetos ({r.summary.totalTasks})</p>
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-200">
          {STATUSES.map((s) => {
            const n = r.statusCounts[s.key] ?? 0;
            return n ? <div key={s.key} title={`${s.label}: ${n}`} style={{ width: `${(n / r.summary.totalTasks) * 100}%`, background: GROUPS[s.group].color, opacity: s.key === 'a_fazer' || s.key === 'em_analise' ? 0.7 : 1 }} /> : null;
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          {STATUSES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: GROUPS[s.group].color }} /> {s.label}: <strong>{r.statusCounts[s.key] ?? 0}</strong>
            </span>
          ))}
        </div>
      </section>

      <ReportSection title="Projetos concluídos no período" empty="Nenhum projeto concluído neste período." count={r.completedTasks.length}>
        {r.completedTasks.map((t) => (
          <TaskBlock key={t.id} task={t} meta={`Concluído em ${formatDayShort(t.completedAt)}`} />
        ))}
      </ReportSection>

      <ReportSection title="Etapas (subtarefas) concluídas no período" empty="Nenhuma etapa concluída neste período." count={r.completedSubtasks.length}>
        {[...subsByTask.entries()].map(([code, subs]) => (
          <div key={code} className="print-avoid-break">
            <p className="text-sm font-bold text-slate-800">
              <span className="font-semibold text-slate-400">ITA-{code}</span> {subs[0].taskTitle}
            </p>
            <ul className="mt-1.5 space-y-1">
              {subs.map((s) => (
                <li key={s.id} className="flex gap-2 text-sm text-slate-700">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span className="flex-1">
                    {s.title}
                    {s.responsibleName && <span className="text-slate-400"> · {s.responsibleName}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500 tabular-nums">{formatDayShort(s.completedAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </ReportSection>

      <ReportSection title="Projetos em andamento" empty="Nenhum projeto em andamento." count={r.inProgress.length}>
        {r.inProgress.map((t) => (
          <TaskBlock key={t.id} task={t} meta={[STATUS_LABEL[t.status], t.dueDate && `previsão ${formatDayShort(t.dueDate)}`].filter(Boolean).join(' · ')} />
        ))}
      </ReportSection>

      <ReportSection title="Novos projetos e ideias registrados no período" empty="Nenhum projeto registrado neste período." count={r.createdTasks.length}>
        <ul className="space-y-1.5">
          {r.createdTasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <span className="size-2 shrink-0 rounded-full" style={{ background: GROUPS[groupOf(t.status)].color }} />
              <span className="font-semibold text-slate-400">ITA-{t.code}</span>
              <span className="flex-1 text-slate-800">{t.title}</span>
              <span className="text-xs text-slate-500">{STATUS_LABEL[t.status]}</span>
            </li>
          ))}
        </ul>
      </ReportSection>

      {showActivities && (
        <ReportSection title={`Histórico de ações (${r.activities.length})`} empty="Nenhuma ação registrada no período." count={r.activities.length}>
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-1.5 pr-3 font-semibold">Data</th>
                <th className="py-1.5 pr-3 font-semibold">Quem</th>
                <th className="py-1.5 pr-3 font-semibold">Projeto</th>
                <th className="py-1.5 font-semibold">Ação</th>
              </tr>
            </thead>
            <tbody>
              {r.activities.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 align-top">
                  <td className="py-1.5 pr-3 whitespace-nowrap text-slate-500 tabular-nums">{formatDateTime(a.createdAt)}</td>
                  <td className="py-1.5 pr-3 font-medium text-slate-700">{a.userName}</td>
                  <td className="py-1.5 pr-3 text-slate-700">{a.taskTitle}</td>
                  <td className="py-1.5 text-slate-600">{a.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportSection>
      )}

      <footer className="mt-10 border-t border-slate-200 pt-3 text-[11px] text-slate-400">
        Gerado em {formatDateTime(r.generatedAt)} por {r.generatedBy} · Campus Ita+
      </footer>
    </article>
  );
}

function ReportSection({ title, empty, count, children }: { title: string; empty: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 border-b border-slate-200 pb-1.5 text-base font-extrabold text-slate-900">{title}</h2>
      {count === 0 ? <p className="text-sm text-slate-400">{empty}</p> : <div className="space-y-4">{children}</div>}
    </section>
  );
}

function TaskBlock({ task: t, meta }: { task: TaskWithSubtasks; meta: string }) {
  const done = t.subtasks.filter((s) => s.done).length;
  return (
    <div className="print-avoid-break rounded-2xl p-4 ring-1 ring-slate-200">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: GROUPS[groupOf(t.status)].color }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">
            <span className="font-semibold text-slate-400">ITA-{t.code}</span> {t.title}
          </p>
          <p className="text-xs text-slate-500">{[t.category, t.responsibleName, meta].filter(Boolean).join(' · ')}</p>
        </div>
        {t.subtasks.length > 0 && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 tabular-nums">
            {done}/{t.subtasks.length} · {pct(done, t.subtasks.length)}%
          </span>
        )}
      </div>
      {t.description && <p className="mt-2 pl-5.5 text-xs leading-relaxed text-slate-600">{t.description}</p>}
      {t.subtasks.length > 0 && (
        <ul className="mt-2 grid gap-x-6 gap-y-1 pl-5.5 sm:grid-cols-2 print:grid-cols-2">
          {t.subtasks.map((s) => (
            <li key={s.id} className={clsx('flex items-start gap-1.5 text-xs', s.done ? 'text-slate-700' : 'text-slate-400')}>
              <span className={clsx('mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-sm', s.done ? 'bg-emerald-500 text-white' : 'ring-1 ring-slate-300')}>
                {s.done && <Check className="size-2.5" strokeWidth={3.5} />}
              </span>
              <span>
                {s.title}
                {s.done && s.completedAt && <span className="text-slate-400"> ({formatDayShort(s.completedAt)})</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
