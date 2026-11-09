import clsx from 'clsx';
import { CircleCheck, Clock, Hourglass, SearchCheck, Wrench } from 'lucide-react';
import { todayISO } from '@shared/format';
import type { ImpCategory, Impediment, ImpImpact, ImpStatus } from './types';

export const IMP_CATEGORIES: { key: ImpCategory; label: string }[] = [
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'estrutural', label: 'Estrutural' },
  { key: 'administrativo', label: 'Administrativo' },
  { key: 'operacional', label: 'Operacional' },
  { key: 'outros', label: 'Outros' },
];
export const categoryLabel = (c: ImpCategory) => IMP_CATEGORIES.find((x) => x.key === c)?.label ?? c;

/** Impacto: azul-acinzentado (baixo), âmbar (médio), vermelho (alto) — com ícone de "sinal" para não depender só da cor. */
export const IMP_IMPACTS: { key: ImpImpact; label: string; level: 1 | 2 | 3; chip: string; dot: string }[] = [
  { key: 'baixo', label: 'Baixo', level: 1, chip: 'bg-slate-100 text-slate-700 ring-slate-200', dot: '#64748b' },
  { key: 'medio', label: 'Médio', level: 2, chip: 'bg-amber-50 text-amber-800 ring-amber-200', dot: '#f59e0b' },
  { key: 'alto', label: 'Alto', level: 3, chip: 'bg-rose-50 text-rose-700 ring-rose-200', dot: '#e11d48' },
];
export const impactMeta = (i: ImpImpact) => IMP_IMPACTS.find((x) => x.key === i) ?? IMP_IMPACTS[1];
export const impactRank = (i: ImpImpact) => IMP_IMPACTS.findIndex((x) => x.key === i);

/** Situação: azul (em análise), âmbar (em resolução), verde (resolvido). */
export const IMP_STATUSES: { key: ImpStatus; label: string; icon: typeof Hourglass; chip: string; color: string }[] = [
  { key: 'em_analise', label: 'Em análise', icon: SearchCheck, chip: 'bg-sky-50 text-sky-700 ring-sky-200', color: '#0ea5e9' },
  { key: 'em_resolucao', label: 'Em resolução', icon: Wrench, chip: 'bg-amber-50 text-amber-800 ring-amber-200', color: '#f59e0b' },
  { key: 'resolvido', label: 'Resolvido', icon: CircleCheck, chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', color: '#10b981' },
];
export const statusMeta = (s: ImpStatus) => IMP_STATUSES.find((x) => x.key === s) ?? IMP_STATUSES[0];

export const isOpen = (i: Pick<Impediment, 'status'>) => i.status !== 'resolvido';
export const isOverdue = (i: Pick<Impediment, 'status' | 'dueDate'>) => isOpen(i) && !!i.dueDate && i.dueDate < todayISO();

/** Três barras (como o sinal do celular): quantas estão cheias indica o impacto. Legível mesmo sem distinguir cores. */
export function ImpactBars({ level, className = 'size-4' }: { level: 1 | 2 | 3; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden fill="currentColor">
      {[0, 1, 2].map((i) => (
        <rect key={i} x={1 + i * 5} y={15 - (5 + i * 4)} width="4" height={5 + i * 4} rx="1" opacity={i < level ? 1 : 0.22} />
      ))}
    </svg>
  );
}

export function ImpactBadge({ impact }: { impact: ImpImpact }) {
  const m = impactMeta(impact);
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ring-1', m.chip)} title={`Impacto ${m.label.toLowerCase()}`}>
      <ImpactBars level={m.level} className="size-3.5" /> Impacto {m.label.toLowerCase()}
    </span>
  );
}

export function StatusBadge({ status }: { status: ImpStatus }) {
  const m = statusMeta(status);
  const Icon = m.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ring-1', m.chip)}>
      <Icon className="size-3.5" aria-hidden /> {m.label}
    </span>
  );
}

export function OverdueBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2 py-1 text-xs font-bold text-white" title="O prazo já passou e o impedimento não foi resolvido">
      <Clock className="size-3.5" aria-hidden /> Atrasado
    </span>
  );
}
