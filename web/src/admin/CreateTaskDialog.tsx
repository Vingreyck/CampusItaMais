import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { GROUPS, STATUSES } from '@shared/status';
import type { Status } from '@shared/types';
import { api } from './api';
import { PRIORITIES } from './priority';
import type { Priority } from './types';
import { Button, inputCls, Label } from './ui';

/** Diálogo "Criar" no estilo do Jira (atalho C), com opção "Criar outro". */
export function CreateTaskDialog({ initialStatus = 'ideia', categories, onClose }: { initialStatus?: Status; categories: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<Status>(initialStatus);
  const [priority, setPriority] = useState<Priority>('media');
  const [category, setCategory] = useState('');
  const [responsibleName, setResponsibleName] = useState('');
  const [description, setDescription] = useState('');
  const [another, setAnother] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const create = useMutation({
    mutationFn: () => api.createTask({ title: title.trim(), status, priority, category: category.trim(), responsibleName: responsibleName.trim(), description }),
    onSuccess: (d) => {
      qc.setQueryData(['task', d.id], d);
      qc.invalidateQueries({ queryKey: ['tasks'] });
      const key = `ITA-${d.code}`;
      toast.success(`${key} criado`, { description: d.title, action: { label: 'Abrir', onClick: () => navigate(`/tarefa/${key}`) } });
      if (another) {
        setTitle('');
        setDescription('');
        titleRef.current?.focus();
      } else {
        onClose();
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) create.mutate();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm md:pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.form
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        onSubmit={submit}
        className="w-full max-w-xl rounded-3xl bg-white shadow-2xl"
        aria-label="Criar projeto"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Criar projeto</h2>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            <X className="size-4.5" />
          </button>
        </header>
        <div className="space-y-4 px-6 py-5">
          <label className="block">
            <Label>Título *</Label>
            <input ref={titleRef} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Reforma da Biblioteca" className={inputCls} required maxLength={200} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <Label>Coluna</Label>
              <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className={inputCls}>
                {STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label} · {GROUPS[s.group].singular.toLowerCase()} no site
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <Label>Prioridade</Label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={inputCls}>
                {PRIORITIES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <Label>Categoria</Label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} list="categorias-criar" placeholder="Ex.: Infraestrutura" className={inputCls} />
              <datalist id="categorias-criar">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <Label>Responsável</Label>
              <input value={responsibleName} onChange={(e) => setResponsibleName(e.target.value)} placeholder="Pessoa ou setor" className={inputCls} />
            </label>
          </div>
          <label className="block">
            <Label>Descrição (aparece no site)</Label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="O que é o projeto e o que muda para a comunidade." />
          </label>
        </div>
        <footer className="flex items-center gap-3 border-t border-slate-100 px-6 py-4">
          <label className="mr-auto flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={another} onChange={(e) => setAnother(e.target.checked)} className="size-4 accent-slate-900" />
            Criar outro
          </label>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!title.trim()}>
            Criar
          </Button>
        </footer>
      </motion.form>
    </div>
  );
}
