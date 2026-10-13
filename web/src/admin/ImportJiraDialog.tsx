import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { FileSpreadsheet, RefreshCw, TriangleAlert, UploadCloud, X } from 'lucide-react';
import { GROUPS, STATUSES, STATUS_LABEL, groupOf } from '@shared/status';
import { formatDayShort } from '@shared/format';
import { api, type JiraImport } from './api';
import { PriorityIcon } from './priority';
import { Avatar, Button, Spinner, Toggle } from './ui';

/** Importa o CSV exportado do Jira: escolhe o arquivo → confere a prévia → confirma. */
export function ImportJiraDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [visible, setVisible] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const preview = useMutation({
    mutationFn: (f: File) => api.importJira(f, false, visible),
    onError: (e: Error) => toast.error('Não foi possível ler o arquivo', { description: e.message }),
  });
  const apply = useMutation({
    mutationFn: () => api.importJira(file!, true, visible),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task'] });
      const res = r.result!;
      toast.success('Importação concluída', {
        description: `${res.created} projeto(s) novo(s), ${res.updated} atualizado(s), ${res.subtasksCreated + res.subtasksUpdated} subtarefa(s) e ${res.comments} comentário(s).`,
        action: { label: 'Posicionar no mapa', onClick: () => navigate('/mapa') },
        duration: 10_000,
      });
      onClose();
    },
    onError: (e: Error) => toast.error('A importação falhou — nada foi alterado', { description: e.message }),
  });

  const choose = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    preview.mutate(f);
  };

  const data: JiraImport | undefined = preview.data;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm md:pt-[6vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Importar do Jira"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Importar do Jira</h2>
            <p className="text-xs text-slate-500">Projetos, subtarefas, responsáveis, datas, prioridades e comentários.</p>
          </div>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            <X className="size-4.5" />
          </button>
        </header>

        <div className="scroll-thin flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <ol className="space-y-1 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <li>
              <strong>1.</strong> No Jira: <strong>Filtros → Pesquisar itens</strong>, troque para <strong>JQL</strong> e busque <code className="rounded bg-white px-1">project = KAN</code>.
            </li>
            <li>
              <strong>2.</strong> <strong>Exportar → Exportar CSV (todos os campos)</strong>.
            </li>
            <li>
              <strong>3.</strong> Envie o arquivo abaixo. Nada é gravado antes de você confirmar.
            </li>
          </ol>

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
              choose(e.dataTransfer.files[0]);
            }}
            className={clsx(
              'flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-6 text-sm transition',
              dragOver ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50',
            )}
          >
            {preview.isPending ? <Spinner /> : file ? <FileSpreadsheet className="size-5 text-emerald-600" /> : <UploadCloud className="size-5" />}
            {file ? (
              <span>
                <strong className="text-slate-800">{file.name}</strong> — clique para trocar
              </span>
            ) : (
              <span>
                <strong className="font-semibold text-slate-700">Clique ou arraste o CSV do Jira</strong>
              </span>
            )}
          </button>
          <input ref={input} type="file" accept=".csv,text/csv" hidden aria-label="Arquivo CSV do Jira" onChange={(e) => (choose(e.target.files?.[0]), (e.target.value = ''))} />

          <div className="flex items-center justify-between gap-3 rounded-2xl p-4 ring-1 ring-slate-200">
            <div>
              <p className="text-sm font-semibold text-slate-800">Mostrar os projetos novos no site</p>
              <p className="text-xs text-slate-400">Dá para ocultar um a um depois. Projetos já importados mantêm a visibilidade atual.</p>
            </div>
            <Toggle checked={visible} onChange={setVisible} label="Mostrar os projetos novos no site" />
          </div>

          {data && (
            <section className="space-y-4" aria-label="Prévia da importação">
              <div className="flex flex-wrap gap-2 text-sm">
                <Chip>
                  <strong>{data.totals.projects}</strong> {plural(data.totals.projects, 'projeto', 'projetos')}
                  {data.totals.updated > 0 && (
                    <span className="text-slate-500">
                      {' '}
                      ({data.totals.new} novos, {data.totals.updated} atualizados)
                    </span>
                  )}
                </Chip>
                <Chip>
                  <strong>{data.totals.subtasks}</strong> {plural(data.totals.subtasks, 'subtarefa', 'subtarefas')}
                </Chip>
                <Chip>
                  <strong>{data.totals.comments}</strong> {plural(data.totals.comments, 'comentário', 'comentários')}
                </Chip>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                {STATUSES.map((s) => (
                  <span key={s.key} className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: GROUPS[s.group].color }} />
                    {s.label}: <strong>{data.byStatus[s.key] ?? 0}</strong>
                  </span>
                ))}
              </div>

              {data.warnings.length > 0 && (
                <ul className="space-y-1 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
                  {data.warnings.map((w) => (
                    <li key={w} className="flex gap-2">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {w}
                    </li>
                  ))}
                </ul>
              )}

              <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Chave</th>
                      <th className="px-3 py-2 font-semibold">Projeto</th>
                      <th className="px-3 py-2 font-semibold">Coluna</th>
                      <th className="px-3 py-2 font-semibold">Subtarefas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.projects.map((p) => (
                      <tr key={p.key} className="align-top">
                        <td className="px-3 py-2 text-xs font-semibold whitespace-nowrap text-slate-500">
                          {p.key}
                          {p.exists && (
                            <span className="mt-1 flex items-center gap-1 font-medium text-sky-700" title="Já importado: será atualizado">
                              <RefreshCw className="size-3" /> atualiza
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-semibold text-slate-800">{p.title}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <PriorityIcon priority={p.priority} className="size-3.5" />
                            {p.responsibleName && (
                              <span className="flex items-center gap-1">
                                <Avatar name={p.responsibleName} size="xs" /> {p.responsibleName}
                              </span>
                            )}
                            {p.dueDate && <span>prazo {formatDayShort(p.dueDate)}</span>}
                            {p.comments > 0 && <span>{p.comments} {plural(p.comments, 'comentário', 'comentários')}</span>}
                          </p>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: GROUPS[groupOf(p.status)].ink }} title={`No Jira: ${p.rawStatus}`}>
                            <span className="size-2 rounded-full" style={{ background: GROUPS[groupOf(p.status)].color }} />
                            {STATUS_LABEL[p.status]}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap text-slate-500 tabular-nums">{p.subtasks ? `${p.subtasksDone}/${p.subtasks}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-400">Os projetos entram sem local no mapa: depois é só arrastar as bolinhas em “Mapa do campus”.</p>
            </section>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => apply.mutate()} disabled={!data || preview.isPending} loading={apply.isPending}>
            {data ? `Importar ${data.totals.projects} ${plural(data.totals.projects, 'projeto', 'projetos')}` : 'Importar'}
          </Button>
        </footer>
      </motion.div>
    </div>
  );
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{children}</span>;
}
