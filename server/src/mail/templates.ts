import { env } from '../env';
import { escapeHtml, formatDateBR, PUBLIC_GROUP, statusLabel, type Status } from '../util';
import type { loadTaskDetail } from '../taskData';

type TaskDetail = Awaited<ReturnType<typeof loadTaskDetail>>;

const GROUP_COLOR = { planejado: '#ef4444', andamento: '#f59e0b', concluido: '#22c55e' } as const;

function row(label: string, value: string) {
  if (!value) return '';
  return `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:4px 0;color:#0f172a;font-size:13px">${value}</td></tr>`;
}

function button(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 18px;border-radius:999px;background:#0f172a;color:#ffffff;border:1px solid #0f172a;font-size:14px;font-weight:600;text-decoration:none">${label}</a>`;
}

function layout(body: string, footer: string) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e2e8f0">
      <tr><td style="padding:22px 28px;background:#0f172a;color:#ffffff">
        <div style="font-size:18px;font-weight:800;letter-spacing:-.01em">Campus Ita<span style="color:#38bdf8">+</span></div>
        <div style="font-size:12px;color:#94a3b8;margin-top:2px">UFS · Campus Prof. Alberto Carvalho · Itabaiana/SE</div>
      </td></tr>
      <tr><td style="padding:28px">${body}</td></tr>
      <tr><td style="padding:16px 28px;background:#f8fafc;color:#94a3b8;font-size:12px">${footer}</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

/** E-mail com o link-chave pessoal de acesso ao painel. */
export function accessEmail(opts: { name: string; link: string; senderName: string }) {
  const body = `
    <p style="margin:0 0 14px;font-size:15px;color:#0f172a">Olá, ${escapeHtml(opts.name)}!</p>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#334155">${escapeHtml(opts.senderName)} liberou para você o acesso ao painel de gestão de projetos do campus. Não há senha: este link é a sua chave pessoal.</p>
    <div style="margin:22px 0">${button(opts.link, 'Acessar o painel')}</div>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b">Abra o link no navegador que você vai usar; ele fica autorizado por 30 dias a cada uso. <strong>Não compartilhe este e-mail</strong> — quem tiver o link entra no painel. Se ele vazar, peça para gerar um novo.</p>`;
  return {
    subject: '[Campus Ita+] Seu link de acesso ao painel',
    html: layout(body, 'Mensagem automática do Campus Ita+. Se você não esperava este acesso, ignore este e-mail.'),
    text: `Olá, ${opts.name}!\n\n${opts.senderName} liberou seu acesso ao painel de gestão do Campus Ita+. Este link é sua chave pessoal (não compartilhe):\n\n${opts.link}`,
  };
}

export function taskEmail(task: TaskDetail, opts: { subtaskId?: string | null; senderName: string }) {
  const sub = opts.subtaskId ? task.subtasks.find((s) => s.id === opts.subtaskId) : undefined;
  const color = GROUP_COLOR[PUBLIC_GROUP[task.status as Status] ?? 'planejado'];
  const code = `ITA-${task.code}`;
  // Só o link público: o endereço do painel nunca aparece em e-mails.
  const publicUrl = `${env.publicUrl}/projeto/${task.id}`;
  const showPublic = task.isPublic && task.posX != null;

  const subject = sub
    ? `[Campus Ita+] Subtarefa: ${sub.title} — ${task.title}`
    : `[Campus Ita+] ${code} · ${task.title}`;

  const intro = sub
    ? `${escapeHtml(opts.senderName)} compartilhou com você a subtarefa <strong>${escapeHtml(sub.title)}</strong> do projeto abaixo.`
    : `${escapeHtml(opts.senderName)} compartilhou com você o projeto abaixo.`;

  const checklist = task.subtasks.length
    ? `<h3 style="margin:24px 0 8px;font-size:14px;color:#0f172a">Checklist (${task.subtaskDone}/${task.subtaskTotal})</h3>
       <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">${task.subtasks
         .map((s) => {
           const highlight = s.id === sub?.id ? 'background:#fef9c3;' : '';
           const mark = s.done
             ? '<span style="color:#16a34a;font-weight:700">&#10003;</span>'
             : '<span style="color:#94a3b8">&#9675;</span>';
           const meta = [s.responsibleName, s.completedAt ? `concluída em ${formatDateBR(s.completedAt)}` : s.dueDate ? `prazo ${formatDateBR(s.dueDate)}` : '']
             .filter(Boolean)
             .join(' · ');
           return `<tr><td style="${highlight}padding:6px 8px;width:18px;vertical-align:top">${mark}</td><td style="${highlight}padding:6px 8px 6px 0;font-size:13px;color:${s.done ? '#64748b' : '#0f172a'}">${escapeHtml(s.title)}${meta ? `<div style="font-size:12px;color:#94a3b8">${escapeHtml(meta)}</div>` : ''}</td></tr>`;
         })
         .join('')}</table>`
    : '';

  const subBlock = sub
    ? `<div style="margin:20px 0;padding:16px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0">
         <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Subtarefa</div>
         <div style="font-size:16px;font-weight:700;color:#0f172a;margin-top:4px">${escapeHtml(sub.title)}</div>
         ${sub.description ? `<p style="margin:8px 0 0;font-size:14px;color:#334155;white-space:pre-wrap">${escapeHtml(sub.description)}</p>` : ''}
         <table role="presentation" style="margin-top:8px">${row('Responsável', escapeHtml(sub.responsibleName))}${row('Prazo', formatDateBR(sub.dueDate))}${row('Situação', sub.done ? 'Concluída' : 'Pendente')}</table>
       </div>`
    : '';

  const body = `
        <p style="margin:0 0 18px;font-size:14px;color:#334155">${intro}</p>
        <div style="font-size:12px;color:#64748b">${code} · <span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${color};vertical-align:middle"></span> ${escapeHtml(statusLabel(task.status))}</div>
        <h2 style="margin:6px 0 12px;font-size:22px;line-height:1.25;color:#0f172a">${escapeHtml(task.title)}</h2>
        ${task.description ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#334155;white-space:pre-wrap">${escapeHtml(task.description)}</p>` : ''}
        <table role="presentation">${row('Categoria', escapeHtml(task.category))}${row('Responsável', escapeHtml(task.responsibleName))}${row('Início', formatDateBR(task.startDate))}${row('Previsão', formatDateBR(task.dueDate))}${row('Concluído em', formatDateBR(task.completedAt))}</table>
        ${subBlock}
        ${checklist}
        ${showPublic ? `<div style="margin-top:26px">${button(publicUrl, 'Ver no campus 3D')}</div>` : ''}`;
  const html = layout(body, 'Você recebeu esta mensagem porque foi incluído(a) em uma tarefa do Campus Ita+.');

  const text = [
    sub ? `Subtarefa: ${sub.title}` : '',
    `${code} · ${task.title} (${statusLabel(task.status)})`,
    task.description,
    task.subtasks.map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title}`).join('\n'),
    showPublic ? `Ver no campus: ${publicUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return { subject, html, text };
}
