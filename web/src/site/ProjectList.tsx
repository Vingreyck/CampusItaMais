import { motion } from 'motion/react';
import { ChevronRight, MapPinOff } from 'lucide-react';
import { GROUPS } from '@shared/status';
import { pct } from '@shared/format';
import type { PublicGroup, PublicProject } from '@shared/types';

export function ProjectList({
  group,
  projects,
  onSelect,
}: {
  group: PublicGroup;
  projects: PublicProject[];
  onSelect: (id: string) => void;
}) {
  const meta = GROUPS[group];
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ type: 'spring', damping: 26, stiffness: 300 }}
      className="glass flex max-h-[46vh] w-full flex-col overflow-hidden rounded-3xl md:max-h-[56vh] md:w-[350px]"
    >
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] uppercase" style={{ color: meta.ink }}>
          <span className="size-2 rounded-full" style={{ background: meta.color }} />
          {meta.label}
        </div>
        <p className="mt-0.5 text-sm text-slate-500">
          {projects.length} {projects.length === 1 ? 'projeto' : 'projetos'}
        </p>
      </div>
      <ul className="scroll-thin overflow-y-auto px-2 pb-2">
        {projects.map((p, i) => {
          const done = p.subtasks.filter((s) => s.done).length;
          const total = p.subtasks.length;
          return (
            <motion.li key={p.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.03 * i }}>
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/80"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug font-semibold text-slate-800">{p.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                    {p.category && <span className="truncate">{p.category}</span>}
                    {total > 0 && (
                      <>
                        {p.category && <span aria-hidden>·</span>}
                        <span className="shrink-0">
                          {done}/{total} etapas
                        </span>
                      </>
                    )}
                    {p.posX == null && (
                      <span className="flex shrink-0 items-center gap-1 text-slate-400" title="Ainda sem local no mapa">
                        <MapPinOff className="size-3" />
                      </span>
                    )}
                  </span>
                  {total > 0 && (
                    <span className="mt-2 block h-1 overflow-hidden rounded-full bg-slate-900/8">
                      <span className="block h-full rounded-full" style={{ width: `${pct(done, total)}%`, background: meta.color }} />
                    </span>
                  )}
                </span>
                <ChevronRight className="size-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
              </button>
            </motion.li>
          );
        })}
        {!projects.length && <li className="px-4 py-6 text-center text-sm text-slate-500">Nenhum projeto nesta categoria por enquanto.</li>}
      </ul>
    </motion.div>
  );
}
