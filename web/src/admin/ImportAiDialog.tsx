import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { FileText, Mic, Paperclip, ShieldCheck, Sparkles, Square, TriangleAlert, X } from 'lucide-react';
import { GROUPS, STATUS_LABEL, groupOf } from '@shared/status';
import { formatDayShort } from '@shared/format';
import { api, type AiAnalysis, type AiItem } from './api';
import { PriorityIcon } from './priority';
import { Avatar, Button, Spinner, Toggle } from './ui';

const MAX_RECORD_SECONDS = 300;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Importar com IA: cola/dita um texto, envia um arquivo ou grava a voz → confere a prévia → confirma. */
export function ImportAiDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const status = useQuery({ queryKey: ['ai-status'], queryFn: api.aiStatus, staleTime: 30_000 });
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [visible, setVisible] = useState(true);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !recording.current && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ---------------- gravação de voz ----------------
  const recorder = useRef<MediaRecorder | null>(null);
  const recording = useRef(false);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const transcribe = useMutation({
    mutationFn: (blob: Blob) => api.aiTranscribe(blob),
    onSuccess: ({ text: heard }) => {
      setText((t) => (t.trim() ? `${t.trim()}\n\n${heard}` : heard));
      toast.success('Voz transcrita — confira o texto antes de analisar');
    },
    onError: (e: Error) => toast.error('Não foi possível transcrever', { description: e.message }),
  });

  const stopRecording = () => {
    window.clearInterval(timer.current);
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Este navegador não grava áudio. Use o microfone do teclado do celular neste campo de texto.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recording.current = false;
        setIsRecording(false);
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        if (blob.size > 24 * 1024 * 1024) toast.error('A gravação ficou grande demais. Grave em partes menores.');
        else if (blob.size) transcribe.mutate(blob);
      };
      recorder.current = rec;
      rec.start();
      recording.current = true;
      setIsRecording(true);
      setSeconds(0);
      timer.current = window.setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_RECORD_SECONDS) stopRecording();
          return s + 1;
        });
      }, 1000);
    } catch {
      toast.error('Sem acesso ao microfone', { description: 'Permita o microfone no navegador e tente de novo.' });
    }
  };

  useEffect(
    () => () => {
      window.clearInterval(timer.current);
      if (recorder.current && recorder.current.state !== 'inactive') {
        recorder.current.onstop = null;
        recorder.current.stop();
        recorder.current.stream.getTracks().forEach((t) => t.stop());
      }
    },
    [],
  );

  // ---------------- análise e gravação ----------------
  const analyze = useMutation({
    mutationFn: () => api.aiAnalyze(text, file),
    onSuccess: (r) => {
      setAnalysis(r);
      setPicked(new Set(r.items.filter((i) => !i.noChange).map((i) => i.index)));
      qc.invalidateQueries({ queryKey: ['ai-status'] });
      if (!r.items.length) toast.info('A IA não encontrou ações neste conteúdo');
    },
    onError: (e: Error) => toast.error('Não foi possível analisar', { description: e.message }),
  });

  const chosen = analysis?.items.filter((i) => picked.has(i.index)) ?? [];
  const apply = useMutation({
    mutationFn: () => api.aiApply(chosen, visible),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task'] });
      toast.success('Importação concluída', {
        description: `${r.created} ${plural(r.created, 'ação criada', 'ações criadas')}, ${r.updated} ${plural(r.updated, 'atualizada', 'atualizadas')} e ${r.subtasksCreated} ${plural(r.subtasksCreated, 'subtarefa', 'subtarefas')}.`,
        action: r.created ? { label: 'Posicionar no mapa', onClick: () => navigate('/mapa') } : undefined,
        duration: 10_000,
      });
      onClose();
    },
    onError: (e: Error) => toast.error('A gravação falhou — nada foi alterado', { description: e.message }),
  });

  const toggle = (index: number) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(index)) n.delete(index);
      else n.add(index);
      return n;
    });

  const enabled = status.data?.enabled;
  const busy = analyze.isPending || transcribe.isPending;
  const canAnalyze = (text.trim() || file) && !busy && !isRecording && enabled;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm md:pt-[5vh]" onMouseDown={(e) => e.target === e.currentTarget && !isRecording && onClose()}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Importar com IA"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900">
              <Sparkles className="size-5 text-violet-500" /> Importar com IA
            </h2>
            <p className="text-xs text-slate-500">Texto, ata, planilha, PDF ou voz → ações e subtarefas no quadro. Nada é gravado antes de você confirmar.</p>
          </div>
          <button type="button" onClick={onClose} disabled={isRecording} className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40" aria-label="Fechar">
            <X className="size-4.5" />
          </button>
        </header>

        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {status.isLoading && <Spinner className="mx-auto my-6 size-6" />}

          {status.data && !status.data.enabled && (
            <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
              <p className="font-bold">A IA ainda não está ligada neste sistema.</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Crie uma conta gratuita em <strong>console.groq.com</strong> e gere uma chave de API.</li>
                <li>No Railway, abra o serviço → <strong>Variables</strong> e cadastre <code className="rounded bg-white px-1">GROQ_API_KEY</code> com a chave.</li>
                <li>Aguarde o novo deploy e abra esta tela de novo.</li>
              </ol>
            </div>
          )}
          {status.data?.enabled && status.data.problem && (
            <div className="flex gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {status.data.problem}
            </div>
          )}

          {!analysis && (
            <>
              <div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={9}
                  aria-label="Texto para a IA"
                  placeholder={'Cole aqui um texto (ata, e-mail, lista de ações…) ou grave a voz.\n\nEx.: "Plano de jardinagem: em andamento, prioridade alta. Etapas: reunião com a Casa Verde e comprar as mudas."'}
                  className="w-full resize-y rounded-2xl bg-white p-4 text-sm leading-relaxed text-slate-800 ring-1 ring-slate-200 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-violet-400/70"
                />
                <p className="mt-1.5 text-xs text-slate-400">No celular, o botão de microfone do teclado também funciona neste campo.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isRecording ? (
                  <Button variant="danger" className="ring-1 ring-rose-200" onClick={stopRecording} aria-label="Parar gravação">
                    <Square className="size-3.5 fill-current" /> Parar ({Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')})
                    <span className="ml-1 size-2 animate-pulse rounded-full bg-rose-500" />
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={startRecording} disabled={!enabled || transcribe.isPending} aria-label="Gravar voz">
                    {transcribe.isPending ? <Spinner className="size-4" /> : <Mic className="size-4" />} {transcribe.isPending ? 'Transcrevendo…' : 'Gravar voz'}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={!enabled || isRecording}>
                  <Paperclip className="size-4" /> Enviar arquivo
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  accept=".pdf,.docx,.xlsx,.csv,.txt,.md,application/pdf"
                  aria-label="Arquivo para a IA"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && f.size > (status.data?.maxFileMb ?? 15) * 1024 * 1024) toast.error(`O arquivo passa de ${status.data?.maxFileMb ?? 15} MB`);
                    else if (f) setFile(f);
                    e.target.value = '';
                  }}
                />
                {file && (
                  <span className="flex items-center gap-2 rounded-xl bg-slate-100 py-1.5 pr-1.5 pl-3 text-sm text-slate-700">
                    <FileText className="size-4 text-slate-400" /> {file.name}
                    <button type="button" onClick={() => setFile(null)} className="rounded-lg p-1 hover:bg-slate-200" aria-label="Remover arquivo">
                      <X className="size-3.5" />
                    </button>
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-400">PDF, Word, Excel, CSV ou texto</span>
              </div>

              <div className="flex gap-3 rounded-2xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <p>
                  <strong>E-mails, telefones, CPF e CNPJ são ocultados antes do envio.</strong> O texto é analisado pela IA gratuita da Groq (serviço nos EUA). O áudio não é guardado. Não envie conteúdo sigiloso.
                  {status.data?.enabled && status.data.limit ? ` Usos hoje: ${status.data.usedToday} de ${status.data.limit}.` : ''}
                </p>
              </div>
            </>
          )}

          {analysis && (
            <section className="space-y-4" aria-label="Prévia da IA">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                  <strong>{analysis.items.length}</strong> {plural(analysis.items.length, 'item encontrado', 'itens encontrados')} em {analysis.source}
                </span>
                {analysis.maskedTotal > 0 && (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
                    {analysis.maskedTotal} {plural(analysis.maskedTotal, 'dado pessoal ocultado', 'dados pessoais ocultados')} antes do envio
                  </span>
                )}
                {analysis.items.length > 0 && (
                  <span className="ml-auto flex gap-3 text-xs font-semibold text-sky-700">
                    <button type="button" onClick={() => setPicked(new Set(analysis.items.map((i) => i.index)))} className="hover:underline">
                      Marcar todos
                    </button>
                    <button type="button" onClick={() => setPicked(new Set())} className="hover:underline">
                      Desmarcar todos
                    </button>
                  </span>
                )}
              </div>

              <p className="flex gap-2 rounded-2xl bg-violet-50 p-3 text-xs text-violet-900 ring-1 ring-violet-100">
                <Sparkles className="mt-0.5 size-3.5 shrink-0" /> A IA pode errar. Confira cada item: o que você escreveu no painel nunca é apagado (descrição, categoria, responsável e prazo só entram se estiverem vazios).
              </p>

              {analysis.warnings.length > 0 && (
                <ul className="space-y-1 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
                  {analysis.warnings.map((w) => (
                    <li key={w} className="flex gap-2">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {w}
                    </li>
                  ))}
                </ul>
              )}

              <ul className="space-y-2">
                {analysis.items.map((it) => (
                  <ItemCard key={it.index} item={it} checked={picked.has(it.index)} onToggle={() => toggle(it.index)} />
                ))}
              </ul>
              {!analysis.items.length && <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">Nenhuma ação encontrada. Volte e confira o texto.</p>}

              <div className="flex items-center justify-between gap-3 rounded-2xl p-4 ring-1 ring-slate-200">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Mostrar as ações novas no site</p>
                  <p className="text-xs text-slate-400">Dá para ocultar uma a uma depois. Ações já existentes mantêm a visibilidade atual.</p>
                </div>
                <Toggle checked={visible} onChange={setVisible} label="Mostrar as ações novas no site" />
              </div>
            </section>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          {analysis ? (
            <>
              <Button variant="ghost" onClick={() => setAnalysis(null)}>
                Voltar ao texto
              </Button>
              <Button onClick={() => apply.mutate()} disabled={!chosen.length} loading={apply.isPending}>
                {chosen.length ? `Aplicar ${chosen.length} ${plural(chosen.length, 'item', 'itens')}` : 'Nenhum item marcado'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} disabled={isRecording}>
                Cancelar
              </Button>
              <Button onClick={() => analyze.mutate()} disabled={!canAnalyze} loading={analyze.isPending}>
                <Sparkles className="size-4" /> Analisar com IA
              </Button>
            </>
          )}
        </footer>
      </motion.div>
    </div>
  );
}

function ItemCard({ item: it, checked, onToggle }: { item: AiItem; checked: boolean; onToggle: () => void }) {
  const isNew = it.action === 'create';
  const shownStatus = it.status ?? it.current?.status ?? null;
  return (
    <li className={clsx('rounded-2xl p-3.5 ring-1 transition', checked ? 'bg-white ring-violet-300' : 'bg-slate-50/70 opacity-70 ring-slate-200')}>
      <label className="flex cursor-pointer gap-3">
        <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1 size-4 shrink-0 accent-violet-600" aria-label={`Incluir: ${it.title}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={clsx('rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase', isNew ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700')}>
              {isNew ? 'Nova' : `Atualiza ITA-${it.code}`}
            </span>
            {it.noChange && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">sem mudanças</span>}
            {shownStatus && (
              <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: GROUPS[groupOf(shownStatus)].ink }}>
                <span className="size-2 rounded-full" style={{ background: GROUPS[groupOf(shownStatus)].color }} />
                {STATUS_LABEL[shownStatus]}
              </span>
            )}
            {it.priority && <PriorityIcon priority={it.priority} className="size-3.5" />}
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-800">{it.title}</p>
          {!isNew && it.current && it.current.title !== it.title && <p className="text-xs text-slate-400">No quadro: {it.current.title}</p>}
          {isNew && (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
              {!it.status && <span>entra em Ideias</span>}
              {it.category && <span>{it.category}</span>}
              {it.responsibleName && (
                <span className="flex items-center gap-1">
                  <Avatar name={it.responsibleName} size="xs" /> {it.responsibleName}
                </span>
              )}
              {it.dueDate && <span>previsão {formatDayShort(it.dueDate)}</span>}
            </p>
          )}
          {isNew && it.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{it.description}</p>}
          {!isNew && it.changes.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600">
              {it.changes.map((c) => (
                <li key={c}>• {c}</li>
              ))}
            </ul>
          )}
          {it.newSubtasks.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600">
              {it.newSubtasks.map((s) => (
                <li key={s} className="flex gap-1.5">
                  <span className="mt-0.5 size-3.5 shrink-0 rounded-sm ring-1 ring-slate-300 ring-inset" /> {s}
                </li>
              ))}
            </ul>
          )}
          {it.reason && <p className="mt-1.5 text-[11px] text-slate-400 italic">“{it.reason}”</p>}
        </div>
      </label>
    </li>
  );
}
