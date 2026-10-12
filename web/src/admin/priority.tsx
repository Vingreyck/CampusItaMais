import { ChevronDown, ChevronsDown, ChevronsUp, ChevronUp, Equal } from 'lucide-react';
import type { Priority } from './types';

/** Mesma escala de prioridade do Jira (Highest → Lowest). */
export const PRIORITIES: { key: Priority; label: string; color: string; icon: typeof ChevronUp }[] = [
  { key: 'mais_alta', label: 'Altíssima', color: '#dc2626', icon: ChevronsUp },
  { key: 'alta', label: 'Alta', color: '#f97316', icon: ChevronUp },
  { key: 'media', label: 'Média', color: '#eab308', icon: Equal },
  { key: 'baixa', label: 'Baixa', color: '#3b82f6', icon: ChevronDown },
  { key: 'mais_baixa', label: 'Mínima', color: '#64748b', icon: ChevronsDown },
];

export const priorityMeta = (p: Priority) => PRIORITIES.find((x) => x.key === p) ?? PRIORITIES[2];
export const priorityRank = (p: Priority) => PRIORITIES.findIndex((x) => x.key === p);

export function PriorityIcon({ priority, className = 'size-4' }: { priority: Priority; className?: string }) {
  const meta = priorityMeta(priority);
  const Icon = meta.icon;
  return (
    <span title={`Prioridade ${meta.label.toLowerCase()}`} className="inline-flex" aria-label={`Prioridade ${meta.label}`}>
      <Icon className={className} style={{ color: meta.color }} strokeWidth={2.6} />
    </span>
  );
}
