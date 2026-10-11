import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import { initials } from '@shared/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }
>(function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
        variant === 'primary' && 'bg-slate-900 text-white shadow-sm hover:bg-slate-800',
        variant === 'secondary' && 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-900',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        variant === 'danger' && 'text-rose-600 hover:bg-rose-50',
        className,
      )}
      {...props}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" />}
      {children}
    </button>
  );
});

export const inputCls =
  'w-full rounded-xl bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-slate-200 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-sky-400/70';

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-500">
      {children}
      {hint && <span className="font-normal text-slate-400">{hint}</span>}
    </span>
  );
}

/** Campo de texto que salva ao sair do campo (ou Enter). */
export function CommitInput({
  value,
  onCommit,
  className,
  type = 'text',
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      {...props}
      type={type}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setV(value);
          e.stopPropagation();
        }
      }}
      className={clsx(inputCls, className)}
    />
  );
}

export function CommitTextarea({
  value,
  onCommit,
  className,
  ...props
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <textarea
      {...props}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      className={clsx(inputCls, 'field-sizing-content resize-none', className)}
    />
  );
}

/** Campo de data que salva ao escolher. */
export function DateInput({ value, onCommit, className }: { value: string | null; onCommit: (v: string | null) => void; className?: string }) {
  return (
    <input
      type="date"
      value={value ?? ''}
      onChange={(e) => onCommit(e.target.value || null)}
      className={clsx(inputCls, 'py-1.5', className)}
    />
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-emerald-500' : 'bg-slate-300',
      )}
    >
      <span className={clsx('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
    </button>
  );
}

const AVATAR_COLORS = ['#0ea5e9', '#8b5cf6', '#f97316', '#10b981', '#ec4899', '#6366f1', '#14b8a6', '#eab308'];

export function Avatar({ name, size = 'sm' }: { name: string; size?: 'xs' | 'sm' | 'md' }) {
  const color = AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span
      title={name}
      className={clsx(
        'grid shrink-0 place-items-center rounded-full font-bold text-white',
        size === 'xs' && 'size-5 text-[9px]',
        size === 'sm' && 'size-6 text-[10px]',
        size === 'md' && 'size-8 text-xs',
      )}
      style={{ background: color }}
    >
      {initials(name)}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={clsx('animate-spin text-slate-400', className ?? 'size-5')} />;
}

export function SectionTitle({ icon, children, aside }: { icon?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon && <span className="text-slate-400">{icon}</span>}
      <h3 className="text-sm font-bold text-slate-800">{children}</h3>
      {aside && <div className="ml-auto">{aside}</div>}
    </div>
  );
}
