import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, FileText, Globe, Image as ImageIcon, Lock, Paperclip, Star, Trash2, UploadCloud } from 'lucide-react';
import { formatBytes, formatDateTime } from '@shared/format';
import { api, useRefreshTask, useTaskPatch } from './api';
import type { DocumentItem, TaskDetail } from './types';
import { SectionTitle, Spinner } from './ui';

function fileIcon(d: DocumentItem) {
  if (d.isImage) return ImageIcon;
  if (/sheet|excel|csv/.test(d.mimeType)) return FileSpreadsheet;
  return FileText;
}

export function Documents({ task }: { task: TaskDetail }) {
  const refresh = useRefreshTask(task.id);
  const patch = useTaskPatch(task.id);
  const input = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const upload = useMutation({
    mutationFn: (files: File[]) => api.uploadDocuments(task.id, files),
    onSuccess: (docs) => toast.success(docs.length === 1 ? 'Documento anexado' : `${docs.length} documentos anexados`),
    onError: (e: Error) => toast.error(e.message),
    onSettled: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) => api.updateDocument(id, { isPublic }),
    onError: (e: Error) => toast.error(e.message),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteDocument(id),
    onError: (e: Error) => toast.error(e.message),
    onSettled: refresh,
  });

  const send = (list: FileList | null) => {
    const files = list ? [...list] : [];
    if (files.length) upload.mutate(files);
  };

  return (
    <section>
      <SectionTitle icon={<Paperclip className="size-4" />}>
        Documentos {task.documents.length > 0 && <span className="font-medium text-slate-400">· {task.documents.length}</span>}
      </SectionTitle>

      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          send(e.dataTransfer.files);
        }}
        className={clsx(
          'flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-5 text-sm transition',
          dragOver ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50',
        )}
      >
        {upload.isPending ? <Spinner /> : <UploadCloud className="size-5" />}
        <span>
          <strong className="font-semibold text-slate-700">Clique ou arraste arquivos</strong> — PDFs, fotos, planilhas (até 30 MB)
        </span>
      </button>
      <input ref={input} type="file" multiple hidden onChange={(e) => (send(e.target.files), (e.target.value = ''))} />

      {task.documents.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200">
          {task.documents.map((d) => {
            const Icon = fileIcon(d);
            const isCover = task.coverDocumentId === d.id;
            return (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                {d.isImage ? (
                  <img src={d.url} alt="" className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />
                ) : (
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                    <Icon className="size-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <a href={d.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-semibold text-slate-800 hover:underline">
                    {d.name}
                  </a>
                  <p className="text-[11px] text-slate-400">
                    {formatBytes(d.size)} · {formatDateTime(d.createdAt)}
                    {isCover && <span className="ml-1.5 font-semibold text-amber-600">· capa no site</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => update.mutate({ id: d.id, isPublic: !d.isPublic })}
                  title={d.isPublic ? 'Visível no site público (clique para tornar privado)' : 'Privado (clique para mostrar no site)'}
                  className={clsx(
                    'flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition',
                    d.isPublic ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                  )}
                >
                  {d.isPublic ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}
                  {d.isPublic ? 'Público' : 'Privado'}
                </button>
                {d.isImage && (
                  <button
                    type="button"
                    onClick={() => patch.mutate({ coverDocumentId: isCover ? null : d.id })}
                    title={isCover ? 'Remover como capa' : 'Usar como capa do projeto no site'}
                    className={clsx('rounded-lg p-1.5 transition', isCover ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700')}
                  >
                    <Star className={clsx('size-4', isCover && 'fill-current')} />
                  </button>
                )}
                <a href={`${d.url}?download`} title="Baixar" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                  <Download className="size-4" />
                </a>
                <button
                  type="button"
                  onClick={() => confirm(`Excluir “${d.name}”?`) && remove.mutate(d.id)}
                  title="Excluir"
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
