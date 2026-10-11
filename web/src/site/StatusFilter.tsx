import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { GROUP_ORDER, GROUPS } from '@shared/status';
import type { PublicGroup } from '@shared/types';

const DOT_TEXT: Record<PublicGroup, string> = { planejado: '#ffffff', andamento: '#422006', concluido: '#ffffff' };

/** As três bolinhas: vermelho (ideias/planejamento), amarelo (em andamento), verde (concluídos). */
export function StatusFilter({
  value,
  onChange,
  counts,
}: {
  value: PublicGroup | null;
  onChange: (g: PublicGroup | null) => void;
  counts: Record<PublicGroup, number>;
}) {
  return (
    <div role="toolbar" aria-label="Filtrar projetos por situação" className="glass flex items-center gap-1 rounded-full p-1.5">
      {GROUP_ORDER.map((g) => {
        const meta = GROUPS[g];
        const active = value === g;
        const faded = value !== null && !active;
        return (
          <button
            key={g}
            type="button"
            onClick={() => onChange(active ? null : g)}
            aria-pressed={active}
            aria-label={`${meta.label}: ${counts[g]} projeto(s)`}
            className={clsx(
              'group relative flex items-center rounded-full transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30',
              active ? 'bg-white shadow-md' : 'hover:bg-white/60',
              faded && 'opacity-40 hover:opacity-100',
            )}
          >
            <span
              className="relative grid size-11 place-items-center rounded-full text-[13px] font-extrabold transition-transform duration-300 group-hover:scale-105"
              style={{
                background: `radial-gradient(circle at 35% 30%, ${meta.color}cc, ${meta.color})`,
                color: DOT_TEXT[g],
                boxShadow: active ? `0 0 0 4px ${meta.color}33, 0 8px 22px -6px ${meta.color}` : `0 6px 16px -8px ${meta.color}`,
              }}
            >
              {active && (
                <span
                  className="absolute inset-0 rounded-full"
                  style={{ background: meta.color, animation: 'pulse-ring 1.8s ease-out infinite' }}
                />
              )}
              <span className="relative">{counts[g]}</span>
            </span>
            <AnimatePresence initial={false}>
              {active && (
                <motion.span
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden text-sm font-semibold whitespace-nowrap text-slate-800"
                >
                  <span className="block pr-4 pl-2.5">{meta.label}</span>
                </motion.span>
              )}
            </AnimatePresence>
            {!active && (
              <span className="pointer-events-none absolute bottom-full left-1/2 mb-2.5 -translate-x-1/2 translate-y-1 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                {meta.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
