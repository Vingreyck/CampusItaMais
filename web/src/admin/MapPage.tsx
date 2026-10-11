import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Eye, Hand, MapPin, MapPinOff, Rotate3d, Search, SquareArrowOutUpRight, View } from 'lucide-react';
import { CampusScene, type CameraFocus, type Projector, type SceneMarker } from '@shared/campus/CampusScene';
import { clampToCampus } from '@shared/campus/layout';
import { GROUPS, STATUS_LABEL, groupOf } from '@shared/status';
import { api } from './api';
import type { TaskSummary } from './types';
import { Button, Spinner, inputCls } from './ui';

const DRAG_TYPE = 'application/x-campus-task';

export function MapPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: tasks, isLoading } = useQuery({ queryKey: ['tasks'], queryFn: api.tasks });
  const [selectedId, setSelectedId] = useState<string | null>(params.get('tarefa'));
  const [focus, setFocus] = useState<CameraFocus | null>(null);
  const [view, setView] = useState<'orbit' | 'top'>('top');
  const [search, setSearch] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const projector = useRef<Projector | null>(null);

  const all = useMemo(() => tasks ?? [], [tasks]);
  const selected = all.find((t) => t.id === selectedId) ?? null;

  const place = useMutation({
    mutationFn: (v: { id: string; x: number | null; z: number | null }) => api.updateTask(v.id, { posX: v.x, posZ: v.z }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const prev = qc.getQueryData<TaskSummary[]>(['tasks']);
      qc.setQueryData<TaskSummary[]>(['tasks'], (old) => old?.map((t) => (t.id === v.id ? { ...t, posX: v.x, posZ: v.z } : t)));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tasks'], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: (detail, v) => {
      qc.setQueryData(['task', detail.id], detail);
      if (v.x == null) toast.success('Removido do mapa');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const markers: SceneMarker[] = useMemo(
    () =>
      all
        .filter((t) => t.posX != null && t.posZ != null)
        .map((t) => ({
          id: t.id,
          x: t.posX!,
          z: t.posZ!,
          color: GROUPS[groupOf(t.status)].color,
          title: t.title,
          subtitle: STATUS_LABEL[t.status],
          visible: true,
        })),
    [all],
  );

  const q = search.trim().toLowerCase();
  const filtered = all.filter((t) => !q || `${t.title} ${t.category}`.toLowerCase().includes(q));
  const unmapped = filtered.filter((t) => t.posX == null);
  const mapped = filtered.filter((t) => t.posX != null);

  const selectFromList = (t: TaskSummary) => {
    setSelectedId(t.id);
    if (t.posX != null && t.posZ != null) setFocus({ x: t.posX, z: t.posZ, key: `${t.id}-${Date.now()}` });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const id = e.dataTransfer.getData(DRAG_TYPE) || e.dataTransfer.getData('text/plain');
    const point = projector.current?.(e.clientX, e.clientY);
    if (!id || !point || !all.some((t) => t.id === id)) return;
    const { x, z } = clampToCampus(point.x, point.z);
    place.mutate({ id, x, z });
    setSelectedId(id);
    toast.success('Projeto posicionado no campus');
  };

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex max-h-[42vh] w-full shrink-0 flex-col border-b border-slate-200 bg-white md:max-h-none md:w-[330px] md:border-r md:border-b-0">
        <div className="space-y-3 p-5 pb-3">
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-900">Mapa do campus</h1>
            <p className="mt-0.5 text-sm text-slate-500">Arraste a bolinha de um projeto até o ponto do campus. No mapa, arraste as bolinhas para ajustar.</p>
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar projeto…" className={clsx(inputCls, 'pl-9')} />
          </label>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-3 pb-4">
          {isLoading && <Spinner className="mx-auto my-6 size-6" />}
          <TaskGroup title="Sem local no mapa" icon={<MapPinOff className="size-3.5" />} tasks={unmapped} selectedId={selectedId} onClick={selectFromList} />
          <TaskGroup title="No mapa" icon={<MapPin className="size-3.5" />} tasks={mapped} selectedId={selectedId} onClick={selectFromList} />
        </div>
      </aside>

      <div
        className="relative min-h-0 flex-1 bg-[radial-gradient(130%_90%_at_50%_0%,#f9fbfd_0%,#e8eff3_55%,#dde6eb_100%)]"
        onDragOver={(e) => {
          if (![...e.dataTransfer.types].includes(DRAG_TYPE)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDragOver(true);
        }}
        onDragLeave={(e) => e.currentTarget === e.target && setDragOver(false)}
        onDrop={onDrop}
      >
        <CampusScene
          className="!absolute inset-0"
          markers={markers}
          selectedId={selectedId}
          focus={focus}
          onSelect={(id) => setSelectedId(id)}
          editable
          onMarkerMove={(id, x, z) => place.mutate({ id, x, z })}
          projectorRef={projector}
          view={view}
          dimOthers={false}
          effects={false}
        />

        <div className={clsx('pointer-events-none absolute inset-3 rounded-3xl border-2 border-dashed transition', dragOver ? 'border-sky-400 bg-sky-400/5' : 'border-transparent')} />

        <div className="absolute top-4 right-4 flex gap-1 rounded-2xl bg-white/90 p-1 shadow-lg ring-1 ring-slate-200 backdrop-blur">
          <ViewButton active={view === 'top'} onClick={() => (setView('top'), setFocus(null))} icon={<View className="size-4" />} label="Planta" />
          <ViewButton active={view === 'orbit'} onClick={() => (setView('orbit'), setFocus(null))} icon={<Rotate3d className="size-4" />} label="3D" />
        </div>

        <div className="pointer-events-none absolute top-4 left-4 hidden max-w-[calc(100%-200px)] items-center gap-2 rounded-2xl xl:flex bg-slate-900/80 px-3.5 py-2 text-xs font-medium text-white shadow-lg backdrop-blur">
          <Hand className="size-3.5" /> Arraste as bolinhas para posicionar · {view === 'top' ? 'arraste o mapa para mover' : 'botão direito move o mapa'} · roda do mouse dá zoom
        </div>

        <AnimatePresence>
          {selected && (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="absolute bottom-4 left-1/2 flex w-[min(560px,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl bg-white/95 p-3 pl-4 shadow-xl ring-1 ring-slate-200 backdrop-blur"
            >
              <span className="size-3 shrink-0 rounded-full" style={{ background: GROUPS[groupOf(selected.status)].color }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">{selected.title}</p>
                <p className="text-xs text-slate-500">
                  {STATUS_LABEL[selected.status]} · {selected.posX != null ? 'no mapa' : 'arraste a bolinha da lista para o campus'}
                </p>
              </div>
              {selected.posX != null && (
                <Button size="sm" variant="ghost" onClick={() => place.mutate({ id: selected.id, x: null, z: null })} title="Remover do mapa">
                  <MapPinOff className="size-3.5" />
                </Button>
              )}
              {selected.isPublic && selected.posX != null && (
                <a href={`/projeto/${selected.id}`} target="_blank" rel="noreferrer" title="Ver no site" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                  <Eye className="size-4" />
                </a>
              )}
              <Button size="sm" variant="secondary" onClick={() => navigate(`/tarefa/${selected.id}`)}>
                <SquareArrowOutUpRight className="size-3.5" /> Abrir
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TaskGroup({
  title,
  icon,
  tasks,
  selectedId,
  onClick,
}: {
  title: string;
  icon: React.ReactNode;
  tasks: TaskSummary[];
  selectedId: string | null;
  onClick: (t: TaskSummary) => void;
}) {
  if (!tasks.length) return null;
  return (
    <div className="mb-3">
      <p className="flex items-center gap-1.5 px-2 py-2 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
        {icon} {title} · {tasks.length}
      </p>
      <ul className="space-y-0.5">
        {tasks.map((t) => {
          const color = GROUPS[groupOf(t.status)].color;
          return (
            <li key={t.id}>
              <div
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_TYPE, t.id);
                  e.dataTransfer.setData('text/plain', t.id);
                  e.dataTransfer.effectAllowed = 'move';
                  const dot = e.currentTarget.querySelector('[data-dot]');
                  if (dot) e.dataTransfer.setDragImage(dot, 14, 14);
                }}
                onClick={() => onClick(t)}
                className={clsx(
                  'group flex cursor-grab items-center gap-3 rounded-xl px-2 py-2 transition active:cursor-grabbing',
                  selectedId === t.id ? 'bg-sky-50 ring-1 ring-sky-200' : 'hover:bg-slate-50',
                )}
              >
                <span
                  data-dot
                  className="grid size-7 shrink-0 place-items-center rounded-full ring-4 ring-white transition group-hover:scale-110"
                  style={{ background: color, boxShadow: `0 4px 12px -2px ${color}` }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{t.title}</span>
                  <span className="block truncate text-xs text-slate-400">{STATUS_LABEL[t.status]}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ViewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx('flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition', active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}
    >
      {icon} {label}
    </button>
  );
}
