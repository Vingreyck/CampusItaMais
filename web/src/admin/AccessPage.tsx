import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Check, Copy, KeyRound, RefreshCw, ShieldCheck, ShieldOff, UserPlus, X } from 'lucide-react';
import { formatDateTime } from '@shared/format';
import { api } from './api';
import type { AccessKey, Me } from './types';
import { Avatar, Button, inputCls, Label, Spinner } from './ui';

export function AccessPage() {
  const qc = useQueryClient();
  const me = qc.getQueryData<Me>(['me']);
  const { data: keys, isLoading } = useQuery({ queryKey: ['keys'], queryFn: api.keys });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [result, setResult] = useState<{ name: string; link: string; emailStatus: string | null } | null>(null);

  const onKeyResult = (r: { key: AccessKey; link: string; emailStatus: string | null }) => {
    qc.invalidateQueries({ queryKey: ['keys'] });
    setResult({ name: r.key.name, link: r.link, emailStatus: r.emailStatus });
  };

  const create = useMutation({
    mutationFn: () => api.createKey({ name: name.trim(), email: email.trim(), sendEmail: sendEmail && !!email.trim() }),
    onSuccess: (r) => {
      onKeyResult(r);
      setName('');
      setEmail('');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const regenerate = useMutation({
    mutationFn: (k: AccessKey) => api.regenerateKey(k.id, !!k.email),
    onSuccess: onKeyResult,
    onError: (e: Error) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeKey(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['keys'] });
      toast.success('Acesso revogado — o link deixou de funcionar imediatamente');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Acessos ao painel</h1>
          <p className="text-sm text-slate-500">Quem pode montar e editar os projetos.</p>
        </div>

        <div className="flex gap-4 rounded-2xl bg-slate-900 p-5 text-sm text-slate-300">
          <ShieldCheck className="size-6 shrink-0 text-emerald-400" />
          <div className="space-y-1.5">
            <p className="font-semibold text-white">Sem login e sem senha: cada pessoa recebe um link-chave pessoal.</p>
            <p>
              Ao abrir o link, aquele navegador fica autorizado por 30 dias (renovados a cada uso). Para quem não tem a chave, o painel simplesmente
              não existe: o endereço, os arquivos e a API respondem como página inexistente.
            </p>
            <p>Se um link vazar, clique em “Gerar novo link” (o antigo para de funcionar na hora) ou revogue o acesso.</p>
          </div>
        </div>

        <form
          className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2) create.mutate();
          }}
        >
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-800">
            <UserPlus className="size-4 text-slate-400" /> Dar acesso a uma pessoa
          </h2>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label>
              <Label>Nome</Label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Maria — Infraestrutura" className={inputCls} required minLength={2} />
            </label>
            <label>
              <Label>E-mail (opcional)</Label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@ufs.br" className={inputCls} />
            </label>
            <Button type="submit" loading={create.isPending} disabled={name.trim().length < 2}>
              <KeyRound className="size-4" /> Gerar link
            </Button>
          </div>
          <label className={clsx('mt-3 flex items-center gap-2 text-xs text-slate-600', !email && 'opacity-50')}>
            <input type="checkbox" checked={sendEmail} disabled={!email} onChange={(e) => setSendEmail(e.target.checked)} className="size-4 accent-slate-900" />
            Enviar o link para o e-mail da pessoa
          </label>
        </form>

        <AnimatePresence>
          {result && <LinkReveal result={result} onClose={() => setResult(null)} />}
        </AnimatePresence>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          {isLoading && <Spinner className="mx-auto my-8" />}
          <ul className="divide-y divide-slate-100">
            {(keys ?? []).map((k) => (
              <li key={k.id} className={clsx('flex flex-wrap items-center gap-3 px-5 py-3.5', k.revokedAt && 'opacity-55')}>
                <Avatar name={k.name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    {k.name}
                    {k.isMaster && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 uppercase">mestra</span>}
                    {k.id === me?.id && <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 uppercase">você</span>}
                    {k.revokedAt && <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 uppercase">revogado</span>}
                  </p>
                  <p className="text-xs text-slate-400">
                    {k.email && `${k.email} · `}criado em {formatDateTime(k.createdAt)}
                    {k.lastUsedAt ? ` · último uso ${formatDateTime(k.lastUsedAt)}` : ' · nunca usado'}
                  </p>
                </div>
                {!k.isMaster && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={regenerate.isPending && regenerate.variables?.id === k.id}
                      onClick={() =>
                        confirm(`Gerar um novo link para ${k.name}? O link atual deixará de funcionar${k.email ? ' e o novo será enviado por e-mail' : ''}.`) &&
                        regenerate.mutate(k)
                      }
                    >
                      <RefreshCw className="size-3.5" /> {k.revokedAt ? 'Reativar' : 'Gerar novo link'}
                    </Button>
                    {!k.revokedAt && k.id !== me?.id && (
                      <Button size="sm" variant="danger" onClick={() => confirm(`Revogar o acesso de ${k.name}?`) && revoke.mutate(k.id)}>
                        <ShieldOff className="size-3.5" /> Revogar
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-slate-400">
          A chave mestra é definida pela variável <code className="rounded bg-slate-100 px-1">ADMIN_ACCESS_KEY</code> no servidor (Railway). Trocar o valor invalida
          todas as sessões abertas com ela.
        </p>
      </div>
    </div>
  );
}

function LinkReveal({ result, onClose }: { result: { name: string; link: string; emailStatus: string | null }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(result.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-bold text-emerald-900">Link de acesso de {result.name}</p>
          <p className="mt-0.5 text-xs text-emerald-800">
            Copie agora: por segurança ele não fica salvo e não será exibido de novo.
            {result.emailStatus === 'sent' && ' Também foi enviado por e-mail.'}
            {result.emailStatus === 'simulated' && ' (Sem provedor de e-mail configurado: o envio foi apenas simulado.)'}
            {result.emailStatus === 'failed' && ' O envio por e-mail falhou — envie o link manualmente.'}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100" aria-label="Fechar">
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <input readOnly value={result.link} onFocus={(e) => e.target.select()} className={clsx(inputCls, 'font-mono text-xs')} />
        <Button onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
    </motion.div>
  );
}
