import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useMatch, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { CampusScene, type SceneMarker } from '@shared/campus/CampusScene';
import { GROUP_ORDER, GROUPS, groupOf, STATUS_LABEL } from '@shared/status';
import type { PublicGroup } from '@shared/types';
import { StatusFilter } from './StatusFilter';
import { ProjectList } from './ProjectList';
import { ProjectPanel } from './ProjectPanel';
import { useMediaQuery, useProjects } from './useProjects';

export function PublicPage() {
  const { pathname } = useLocation();
  const match = useMatch('/projeto/:id');
  const navigate = useNavigate();
  const desktop = useMediaQuery('(min-width: 768px)');
  const highQuality = useMediaQuery('(min-width: 900px)');
  const { projects, error } = useProjects();
  const [filter, setFilter] = useState<PublicGroup | null>(null);

  const list = useMemo(() => projects ?? [], [projects]);
  const selectedId = match?.params.id ?? null;
  const selected = list.find((p) => p.id === selectedId) ?? null;

  const counts = useMemo(() => {
    const c: Record<PublicGroup, number> = { planejado: 0, andamento: 0, concluido: 0 };
    for (const p of list) c[groupOf(p.status)]++;
    return c;
  }, [list]);

  // Lista navegável (setas ‹ ›): o filtro ativo ou todos os projetos.
  const navList = useMemo(() => (filter ? list.filter((p) => groupOf(p.status) === filter) : list), [list, filter]);

  const markers: SceneMarker[] = useMemo(
    () =>
      list
        .filter((p) => p.posX != null && p.posZ != null)
        .map((p) => ({
          id: p.id,
          x: p.posX!,
          z: p.posZ!,
          color: GROUPS[groupOf(p.status)].color,
          title: p.title,
          subtitle: STATUS_LABEL[p.status],
          visible: !filter || groupOf(p.status) === filter || p.id === selectedId,
        })),
    [list, filter, selectedId],
  );

  const select = useCallback(
    (id: string | null) => {
      if (id === selectedId) return;
      navigate(id ? `/projeto/${id}` : '/', { replace: !!selectedId && !!id });
    },
    [navigate, selectedId],
  );

  const step = (dir: 1 | -1) => {
    if (!selected || navList.length < 2) return undefined;
    return () => {
      const i = navList.findIndex((p) => p.id === selected.id);
      const next = navList[(i + dir + navList.length) % navList.length];
      select(next.id);
    };
  };

  const focus =
    selected && selected.posX != null && selected.posZ != null ? { x: selected.posX, z: selected.posZ, key: selected.id } : null;

  // Link para projeto removido/oculto: volta para a visão geral.
  useEffect(() => {
    if (projects && selectedId && !selected) navigate('/', { replace: true });
  }, [projects, selectedId, selected, navigate]);

  // Qualquer outra URL volta para o campus.
  if (pathname !== '/' && !match) return <Navigate to="/" replace />;

  return (
    <div className="fixed inset-0 bg-[radial-gradient(130%_90%_at_50%_0%,#f9fbfd_0%,#e8eff3_55%,#dde6eb_100%)]">
      <CampusScene
        className="!absolute inset-0"
        markers={markers}
        selectedId={selected?.id ?? null}
        focus={focus}
        onSelect={select}
        panelSide={selected ? (desktop ? 'right' : 'bottom') : null}
        autoRotate
        intro
        effects={highQuality}
      />

      {/* Identificação discreta */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass pointer-events-none fixed top-4 left-4 flex items-center gap-3 rounded-2xl py-2 pr-4 pl-2"
      >
        <div className="grid size-9 place-items-center rounded-xl bg-slate-900 text-lg leading-none font-black text-sky-400">+</div>
        <div className="leading-tight">
          <p className="text-sm font-extrabold tracking-tight text-slate-900">
            Campus Ita<span className="text-sky-500">+</span>
          </p>
          <p className="text-[11px] font-medium text-slate-500">UFS · Campus Itabaiana</p>
        </div>
      </motion.div>

      {/* Filtro + lista do filtro */}
      <div
        className={
          desktop
            ? 'fixed bottom-5 left-5 z-20 flex flex-col items-start gap-3'
            : 'fixed inset-x-2 bottom-3 z-20 flex flex-col items-center gap-2'
        }
      >
        <AnimatePresence>
          {filter && !selected && <ProjectList key={filter} group={filter} projects={navList} onSelect={select} />}
        </AnimatePresence>
        {!(selected && !desktop) && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, type: 'spring' }}>
            <StatusFilter
              value={filter}
              onChange={(g) => {
                setFilter(g);
                if (selected && g && groupOf(selected.status) !== g) select(null);
              }}
              counts={counts}
            />
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <ProjectPanel
            key={selected.id}
            project={selected}
            desktop={desktop}
            onClose={() => select(null)}
            onPrev={step(-1)}
            onNext={step(1)}
          />
        )}
      </AnimatePresence>

      {projects && !list.length && (
        <div className="glass fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-3xl px-6 py-4 text-center text-sm text-slate-600">
          Os projetos do campus aparecerão aqui em breve.
        </div>
      )}
      {error && !projects && (
        <div className="glass fixed top-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-xs font-medium text-slate-600">
          Não foi possível carregar os projetos. Tentando novamente…
        </div>
      )}
      <span className="sr-only">
        Legenda: {GROUP_ORDER.map((g) => `${GROUPS[g].label}: ${counts[g]}`).join(', ')}
      </span>
    </div>
  );
}
