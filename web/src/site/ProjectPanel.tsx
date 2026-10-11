import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { motion } from 'motion/react';
import { Calendar, CalendarCheck, Check, ChevronLeft, ChevronRight, FileText, Link2, MapPinOff, Play, User, X } from 'lucide-react';
import { GROUPS, groupOf, STATUS_LABEL } from '@shared/status';
import { formatBytes, formatDay, pct } from '@shared/format';
import type { PublicProject } from '@shared/types';

interface Props {
  project: PublicProject;
  desktop: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

export function ProjectPanel({ project: p, desktop, onClose, onPrev, onNext }: Props) {
  const meta = GROUPS[groupOf(p.status)];
  const done = p.subtasks.filter((s) => s.done).length;
  const total = p.subtasks.length;
  const progress = p.status === 'concluido' && total === 0 ? 100 : pct(done, total);
  const images = p.documents.filter((d) => d.isImage);
  const files = p.documents.filter((d) => !d.isImage);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && onNext) onNext();
      if (e.key === 'ArrowLeft' && onPrev) onPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNext, onPrev]);

  const share = async () => {
    const url = `${location.origin}/projeto/${p.id}`;
    try {
      if (navigator.share && !desktop) await navigator.share({ title: p.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* compartilhamento cancelado */
    }
  };

  const info = [
    { icon: User, label: 'Responsável', value: p.responsibleName },
    { icon: Play, label: 'Início', value: formatDay(p.startDate) },
    { icon: Calendar, label: 'Previsão', value: p.status !== 'concluido' ? formatDay(p.dueDate) : '' },
    { icon: CalendarCheck, label: 'Concluído em', value: formatDay(p.completedAt) },
  ].filter((i) => i.value);

  return (
    <motion.aside
      key={p.id}
      initial={desktop ? { opacity: 0, x: 48 } : { opacity: 0, y: 80 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={desktop ? { opacity: 0, x: 48 } : { opacity: 0, y: 80 }}
      transition={{ type: 'spring', damping: 28, stiffness: 260 }}
      className={clsx(
        'glass fixed z-30 flex flex-col overflow-hidden',
        desktop ? 'top-4 right-4 bottom-4 w-[440px] rounded-[30px]' : 'inset-x-2 bottom-2 max-h-[64vh] rounded-[26px]',
      )}
      aria-label={`Projeto: ${p.title}`}
    >
      {p.coverUrl ? (
        <div className="relative h-44 shrink-0 overflow-hidden">
          <motion.img
            src={p.coverUrl}
            alt=""
            initial={{ scale: 1.12 }}
            animate={{ scale: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-white/10 to-transparent" />
        </div>
      ) : (
        <div className="h-1.5 shrink-0" style={{ background: `linear-gradient(90deg, ${meta.color}, ${meta.color}00)` }} />
      )}

      <div className={clsx('flex items-center gap-2 px-5 pt-4', p.coverUrl && '-mt-14 relative')}>
        <span
          className="flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold"
          style={{ background: meta.soft, color: meta.ink }}
        >
          <span className="size-2 rounded-full" style={{ background: meta.color }} />
          {STATUS_LABEL[p.status]}
        </span>
        {p.isDemo && <span className="rounded-full bg-slate-900/6 px-2.5 py-1 text-[11px] font-semibold text-slate-500">Demonstração</span>}
        <div className="ml-auto flex items-center gap-1">
          {onPrev && (
            <IconButton label="Projeto anterior" onClick={onPrev}>
              <ChevronLeft className="size-4" />
            </IconButton>
          )}
          {onNext && (
            <IconButton label="Próximo projeto" onClick={onNext}>
              <ChevronRight className="size-4" />
            </IconButton>
          )}
          <IconButton label="Fechar" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-6 pt-3 pb-6">
        {p.category && <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{p.category}</p>}
        <h2 className="mt-1 text-[26px] leading-[1.15] font-extrabold tracking-tight text-balance text-slate-900">{p.title}</h2>

        {(total > 0 || p.status === 'concluido') && (
          <div className="mt-5 flex items-center gap-4 rounded-3xl bg-white/70 p-4 ring-1 ring-slate-900/5">
            <ProgressRing value={progress} color={meta.color} />
            <div>
              <p className="text-sm font-bold text-slate-800">
                {total > 0 ? `${done} de ${total} etapas concluídas` : 'Projeto entregue'}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {p.status === 'concluido'
                  ? `Entregue${p.completedAt ? ` em ${formatDay(p.completedAt)}` : ''}`
                  : total - done > 0
                    ? `${total - done} ${total - done === 1 ? 'etapa restante' : 'etapas restantes'}`
                    : 'Em fase final'}
              </p>
            </div>
          </div>
        )}

        {p.description && <p className="mt-5 text-[15px] leading-relaxed whitespace-pre-line text-slate-600">{p.description}</p>}

        {total > 0 && (
          <section className="mt-6">
            <h3 className="mb-2.5 text-xs font-bold tracking-[0.12em] text-slate-400 uppercase">O que foi feito</h3>
            <ul className="space-y-1.5">
              {p.subtasks.map((s, i) => (
                <motion.li
                  key={s.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.05 }}
                  className="flex gap-3 rounded-2xl bg-white/65 px-3.5 py-3 ring-1 ring-slate-900/5"
                >
                  <span
                    className={clsx(
                      'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full',
                      s.done ? 'bg-emerald-500 text-white shadow-[0_4px_10px_-3px_rgb(16_185_129)]' : 'ring-2 ring-slate-300 ring-inset',
                    )}
                  >
                    {s.done && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.35 + i * 0.05, type: 'spring' }}>
                        <Check className="size-3.5" strokeWidth={3.2} />
                      </motion.span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={clsx('text-sm leading-snug font-semibold', s.done ? 'text-slate-700' : 'text-slate-800')}>{s.title}</p>
                    {s.description && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{s.description}</p>}
                    <p className="mt-1 text-[11px] text-slate-400">
                      {[s.done ? (s.completedAt ? `Concluída em ${formatDay(s.completedAt)}` : 'Concluída') : 'Pendente', s.responsibleName]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </motion.li>
              ))}
            </ul>
          </section>
        )}

        {info.length > 0 && (
          <dl className="mt-6 grid grid-cols-2 gap-2">
            {info.map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-2xl bg-white/65 px-3.5 py-3 ring-1 ring-slate-900/5">
                <dt className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                  <Icon className="size-3.5" /> {label}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {images.length > 0 && (
          <section className="mt-6">
            <h3 className="mb-2.5 text-xs font-bold tracking-[0.12em] text-slate-400 uppercase">Fotos</h3>
            <div className="grid grid-cols-3 gap-2">
              {images.map((d) => (
                <a key={d.id} href={d.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-2xl ring-1 ring-slate-900/5">
                  <img src={d.url} alt={d.name} loading="lazy" className="aspect-square w-full object-cover transition duration-500 group-hover:scale-110" />
                </a>
              ))}
            </div>
          </section>
        )}

        {files.length > 0 && (
          <section className="mt-6">
            <h3 className="mb-2.5 text-xs font-bold tracking-[0.12em] text-slate-400 uppercase">Documentos</h3>
            <ul className="space-y-1.5">
              {files.map((d) => (
                <li key={d.id}>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-2xl bg-white/65 px-3.5 py-2.5 ring-1 ring-slate-900/5 transition hover:bg-white"
                  >
                    <FileText className="size-5 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{d.name}</span>
                    <span className="text-xs text-slate-400">{formatBytes(d.size)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={share}
            className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 active:scale-[0.98]"
          >
            {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
            {copied ? 'Link copiado' : 'Compartilhar'}
          </button>
          {p.posX == null && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <MapPinOff className="size-3.5" /> Local ainda não marcado no mapa
            </span>
          )}
        </div>
      </div>
    </motion.aside>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-full bg-white/80 text-slate-600 shadow-sm ring-1 ring-slate-900/5 transition hover:bg-white hover:text-slate-900"
    >
      {children}
    </button>
  );
}

function ProgressRing({ value, color }: { value: number; color: string }) {
  const r = 25;
  const c = 2 * Math.PI * r;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0" role="img" aria-label={`${value}% concluído`}>
      <circle cx="32" cy="32" r={r} stroke="rgb(15 23 42 / 0.08)" strokeWidth="7" fill="none" />
      <motion.circle
        cx="32"
        cy="32"
        r={r}
        stroke={color}
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - value / 100) }}
        transition={{ duration: 1.1, ease: 'easeOut', delay: 0.2 }}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="36.5" textAnchor="middle" className="fill-slate-800 text-[13px] font-extrabold">
        {value}%
      </text>
    </svg>
  );
}
