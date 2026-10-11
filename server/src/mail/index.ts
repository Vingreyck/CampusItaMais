import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type MailProvider = 'resend' | 'brevo' | 'smtp' | 'console';

export function activeMailProvider(): MailProvider {
  const m = env.mail;
  if (m.resendKey) return 'resend';
  if (m.brevoKey) return 'brevo';
  if (m.smtp.host) return 'smtp';
  return 'console';
}

function parseFrom(from: string) {
  const match = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  return match ? { name: match[1].trim(), email: match[2].trim() } : { name: '', email: from.trim() };
}

let smtpTransport: Transporter | null = null;

/** Envia um e-mail pelo provedor configurado. Sem provedor, apenas registra no log (status "simulated"). */
export async function sendMail(msg: MailMessage): Promise<MailProvider> {
  const provider = activeMailProvider();
  const { mail } = env;

  if (provider === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${mail.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: mail.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) throw new Error(`Resend respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return provider;
  }

  if (provider === 'brevo') {
    const sender = parseFrom(mail.from);
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': mail.brevoKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: sender.name || 'Campus Ita+', email: sender.email },
        to: [{ email: msg.to }],
        subject: msg.subject,
        htmlContent: msg.html,
        textContent: msg.text,
      }),
    });
    if (!res.ok) throw new Error(`Brevo respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return provider;
  }

  if (provider === 'smtp') {
    smtpTransport ??= nodemailer.createTransport({
      host: mail.smtp.host,
      port: mail.smtp.port,
      secure: mail.smtp.secure,
      auth: mail.smtp.user ? { user: mail.smtp.user, pass: mail.smtp.pass } : undefined,
    });
    await smtpTransport.sendMail({ from: mail.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
    return provider;
  }

  console.log(`[mail] (simulado — nenhum provedor configurado) para=${msg.to} assunto="${msg.subject}"`);
  return provider;
}
