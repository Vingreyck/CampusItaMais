import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { accessKeys } from '../db/schema';
import { accessLink, clearSession, generateToken, hashToken, issueSession } from '../auth';
import { sendMail } from '../mail';
import { accessEmail } from '../mail/templates';
import { HttpError, notFound } from '../util';

/** Troca de chave por sessão (rota pública, mas indistinguível de um 404 quando a chave é inválida). */
export const accessRouter = Router();

const notFoundJson = { error: 'Rota não encontrada' };

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: false,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(404).json(notFoundJson);
  },
});

accessRouter.post('/acesso', limiter, async (req, res) => {
  const key = typeof req.body?.key === 'string' ? req.body.key.trim() : '';
  if (key.length >= 32 && key.length <= 256) {
    const [row] = await db.select().from(accessKeys).where(eq(accessKeys.tokenHash, hashToken(key)));
    if (row && !row.revokedAt) {
      issueSession(res, row);
      await db.update(accessKeys).set({ lastUsedAt: new Date() }).where(eq(accessKeys.id, row.id));
      res.status(204).end();
      return;
    }
  }
  console.warn(`[acesso] chave inválida recebida de ${req.ip}`);
  res.status(404).json(notFoundJson);
});

/** Rotas do painel (montadas atrás do adminApiGate). */
export const adminAccessRouter = Router();

adminAccessRouter.get('/me', (req, res) => {
  res.json(req.user);
});

adminAccessRouter.post('/sair', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

const keyColumns = {
  id: accessKeys.id,
  name: accessKeys.name,
  email: accessKeys.email,
  isMaster: accessKeys.isMaster,
  createdAt: accessKeys.createdAt,
  lastUsedAt: accessKeys.lastUsedAt,
  revokedAt: accessKeys.revokedAt,
};

adminAccessRouter.get('/acessos', async (_req, res) => {
  res.json(await db.select(keyColumns).from(accessKeys).orderBy(asc(accessKeys.createdAt)));
});

async function deliver(link: string, name: string, email: string, senderName: string) {
  if (!email) return null;
  try {
    const provider = await sendMail({ to: email, ...accessEmail({ name, link, senderName }) });
    return provider === 'console' ? 'simulated' : 'sent';
  } catch (err) {
    console.error('[mail] falha ao enviar link de acesso', err);
    return 'failed';
  }
}

adminAccessRouter.post('/acessos', async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2, 'Informe o nome da pessoa').max(120),
      email: z.string().trim().toLowerCase().pipe(z.union([z.literal(''), z.email('E-mail inválido')])).default(''),
      sendEmail: z.boolean().default(false),
    })
    .parse(req.body);
  const token = generateToken();
  const [created] = await db
    .insert(accessKeys)
    .values({ name: data.name, email: data.email, tokenHash: hashToken(token) })
    .returning(keyColumns);
  const link = accessLink(token);
  const emailStatus = data.sendEmail ? await deliver(link, data.name, data.email, req.user!.name) : null;
  // O link só é mostrado agora: guardamos apenas o hash.
  res.status(201).json({ key: created, link, emailStatus });
});

adminAccessRouter.post('/acessos/:id/regenerar', async (req, res) => {
  const { sendEmail } = z.object({ sendEmail: z.boolean().default(false) }).parse(req.body ?? {});
  const [cur] = await db.select().from(accessKeys).where(eq(accessKeys.id, req.params.id));
  if (!cur) throw notFound('Acesso');
  if (cur.isMaster) throw new HttpError(400, 'A chave mestra é definida pela variável ADMIN_ACCESS_KEY no servidor');
  const token = generateToken();
  const [updated] = await db
    .update(accessKeys)
    .set({ tokenHash: hashToken(token), revokedAt: null })
    .where(eq(accessKeys.id, cur.id))
    .returning(keyColumns);
  const link = accessLink(token);
  const emailStatus = sendEmail ? await deliver(link, cur.name, cur.email, req.user!.name) : null;
  res.json({ key: updated, link, emailStatus });
});

adminAccessRouter.post('/acessos/:id/revogar', async (req, res) => {
  const [cur] = await db.select().from(accessKeys).where(eq(accessKeys.id, req.params.id));
  if (!cur) throw notFound('Acesso');
  if (cur.isMaster) throw new HttpError(400, 'A chave mestra só pode ser trocada pela variável ADMIN_ACCESS_KEY no servidor');
  if (cur.id === req.user!.id) throw new HttpError(400, 'Você não pode revogar o próprio acesso');
  await db
    .update(accessKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(accessKeys.id, cur.id), isNull(accessKeys.revokedAt)));
  const [updated] = await db.select(keyColumns).from(accessKeys).where(eq(accessKeys.id, cur.id));
  res.json(updated);
});
