import { Hourglass } from 'lucide-react';
import type { Dependency } from './types';

/**
 * "Dependência": de quem depende o andamento da ação. É diferente da prioridade
 * (que diz o quanto a ação é importante): uma ação pode ser altíssima e, ainda assim, depender da Reitoria.
 */
export const DEPENDENCIES: { key: Dependency; label: string; short: string }[] = [
  { key: 'nenhuma', label: 'Sem dependência', short: 'Sem dependência' },
  { key: 'outro_setor', label: 'Depende de outro setor do campus', short: 'Outro setor' },
  { key: 'reitoria', label: 'Depende da Reitoria / UFS', short: 'Reitoria / UFS' },
  { key: 'externo', label: 'Depende de órgão externo ou parceiro', short: 'Órgão externo' },
];

export const dependencyMeta = (d: Dependency) => DEPENDENCIES.find((x) => x.key === d) ?? DEPENDENCIES[0];

/** Etiqueta discreta (roxa, para não se confundir com as cores de situação). Some quando não há dependência. */
export function DependencyChip({ dependency, note, compact = false }: { dependency: Dependency; note?: string; compact?: boolean }) {
  if (dependency === 'nenhuma') return null;
  const meta = dependencyMeta(dependency);
  const full = note ? `${meta.label} · ${note}` : meta.label;
  return (
    <span
      title={full}
      className="inline-flex max-w-full items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-200/70"
    >
      <Hourglass className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{compact ? meta.short : full}</span>
    </span>
  );
}
