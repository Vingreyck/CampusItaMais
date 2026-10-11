import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AtSign, CircleAlert, CircleCheck, Clock, RotateCw, Send } from 'lucide-react';
import { formatDateTime } from '@shared/format';
import { api, useRefreshTask } from './api';
import type { NotificationItem } from './types';
import { Spinner } from './ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Digite um e-mail e pressione Enter: a tarefa (ou subtarefa) é enviada na hora para a pessoa.
 * Mostra o histórico de envios como "chips".
 */
export function EmailNotifier({
  taskId,
  subtaskId,
  notifications,
  compact,
}: {
  taskId: string;
  subtaskId?: string;
  notifications: NotificationItem[];
  compact?: boolean;
}) {
  const [value, setValue] = useState('');
  const refresh = useRefreshTask(taskId);
  const send = useMutation({
    mutationFn: (email: string) => api.notify(taskId, email, subtaskId),
    onSuccess: (n) => {
      if (n.status === 'simulated') {
        toast.info(`Envio para ${n.email} registrado`, {
          description: 'Nenhum provedor de e-mail configurado no servidor: o envio foi apenas simulado.',
        });
      } else {
        toast.success(`Enviado para ${n.email}`);
      }
    },
    onError: (e: Error) => toast.error('Não foi possível enviar o e-mail', { description: e.message }),
    onSettled: refresh,
  });

  // Último envio de cada endereço
  const latest = new Map<string, NotificationItem>();
  for (const n of notifications.filter((n) => (subtaskId ? n.subtaskId === subtaskId : !n.subtaskId))) {
    if (!latest.has(n.email)) latest.set(n.email, n);
  }

  const submit = () => {
    const email = value.trim().replace(/[,;]$/, '');
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      toast.error('E-mail inválido');
      return;
    }
    send.mutate(email);
    setValue('');
  };

  return (
    <div>
      <div
        className={clsx(
          'flex flex-wrap items-center gap-1.5 rounded-xl bg-white px-2 py-1.5 ring-1 ring-slate-200 transition focus-within:ring-2 focus-within:ring-sky-400/70',
        )}
      >
        {[...latest.values()].map((n) => (
          <span
            key={n.email}
            title={
              n.status === 'failed'
                ? `Falhou: ${n.error ?? ''}`
                : `${n.status === 'simulated' ? 'Simulado' : 'Enviado'} em ${formatDateTime(n.createdAt)}${n.sentByName ? ` por ${n.sentByName}` : ''}`
            }
            className={clsx(
              'group flex items-center gap-1 rounded-lg py-0.5 pr-1 pl-1.5 text-xs font-medium',
              n.status === 'failed' ? 'bg-rose-50 text-rose-700' : n.status === 'simulated' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800',
            )}
          >
            {n.status === 'failed' ? <CircleAlert className="size-3.5" /> : n.status === 'simulated' ? <Clock className="size-3.5" /> : <CircleCheck className="size-3.5" />}
            {n.email}
            <button
              type="button"
              onClick={() => send.mutate(n.email)}
              title="Reenviar"
              className="rounded p-0.5 opacity-50 transition hover:bg-black/5 hover:opacity-100"
            >
              <RotateCw className="size-3" />
            </button>
          </span>
        ))}
        <span className="flex min-w-[180px] flex-1 items-center gap-1.5 px-1">
          {send.isPending ? <Spinner className="size-3.5" /> : <AtSign className="size-3.5 text-slate-400" />}
          <input
            type="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={compact ? 'e-mail + Enter para enviar' : 'Digite um e-mail e pressione Enter para enviar'}
            className="h-7 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          {value && (
            <button type="button" onClick={submit} className="rounded-md p-1 text-sky-600 hover:bg-sky-50" title="Enviar">
              <Send className="size-3.5" />
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
