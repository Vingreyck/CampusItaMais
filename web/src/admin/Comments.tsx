import { forwardRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatDateTime } from '@shared/format';
import { api, useRefreshTask } from './api';
import type { CommentItem, Me, TaskDetail } from './types';
import { Avatar, Button, inputCls, Kbd } from './ui';

/** Comentários do projeto (como no Jira): cada um edita/apaga os seus; a chave mestra pode apagar qualquer um. */
export const Comments = forwardRef<HTMLTextAreaElement, { task: TaskDetail }>(function Comments({ task }, ref) {
  const qc = useQueryClient();
  const me = qc.getQueryData<Me>(['me']);
  const refresh = useRefreshTask(task.id);
  const [body, setBody] = useState('');
  const [focused, setFocused] = useState(false);

  const add = useMutation({
    mutationFn: () => api.addComment(task.id, body.trim()),
    onSuccess: () => {
      setBody('');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => body.trim() && add.mutate();

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        {me && <Avatar name={me.name} size="md" />}
        <div className="flex-1">
          <textarea
            ref={ref}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
            rows={focused || body ? 3 : 1}
            placeholder="Adicionar um comentário…"
            aria-label="Novo comentário"
            className={`${inputCls} resize-none`}
          />
          {(focused || body) && (
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" onMouseDown={(e) => e.preventDefault()} onClick={submit} loading={add.isPending} disabled={!body.trim()}>
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => setBody('')}>
                Cancelar
              </Button>
              <span className="ml-auto text-[11px] text-slate-400">
                <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> salva
              </span>
            </div>
          )}
          {!focused && !body && (
            <p className="mt-1.5 text-[11px] text-slate-400">
              Dica: pressione <Kbd>M</Kbd> para comentar
            </p>
          )}
        </div>
      </div>

      <ul className="space-y-4">
        {task.comments.map((c) => (
          <CommentRow key={c.id} comment={c} canEdit={c.authorId === me?.id} canDelete={c.authorId === me?.id || !!me?.isMaster} onChange={refresh} />
        ))}
        {!task.comments.length && <li className="pl-11 text-sm text-slate-400">Nenhum comentário ainda.</li>}
      </ul>
    </div>
  );
});

function CommentRow({ comment: c, canEdit, canDelete, onChange }: { comment: CommentItem; canEdit: boolean; canDelete: boolean; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body);
  const edit = useMutation({
    mutationFn: () => api.editComment(c.id, text.trim()),
    onSuccess: () => {
      setEditing(false);
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteComment(c.id),
    onSuccess: onChange,
    onError: (e: Error) => toast.error(e.message),
  });
  const edited = new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime() > 1000;

  return (
    <li className="flex gap-3">
      <Avatar name={c.authorName || '?'} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-semibold text-slate-800">{c.authorName}</span>{' '}
          <span className="text-xs text-slate-400">
            {formatDateTime(c.createdAt)}
            {edited && ' · editado'}
          </span>
        </p>
        {editing ? (
          <div className="mt-1.5">
            <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} className={`${inputCls} resize-none`} aria-label="Editar comentário" />
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => text.trim() && edit.mutate()} loading={edit.isPending}>
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => (setEditing(false), setText(c.body))}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-0.5 text-sm leading-relaxed whitespace-pre-wrap text-slate-700">{c.body}</p>
            {(canEdit || canDelete) && (
              <div className="mt-1 flex gap-3 text-xs font-semibold text-slate-500">
                {canEdit && (
                  <button type="button" onClick={() => setEditing(true)} className="hover:text-slate-800 hover:underline">
                    Editar
                  </button>
                )}
                {canDelete && (
                  <button type="button" onClick={() => confirm('Apagar este comentário?') && remove.mutate()} className="hover:text-rose-600 hover:underline">
                    Apagar
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}
