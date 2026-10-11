import crypto from 'node:crypto';
import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { accessKeys } from './db/schema';
import { env } from './env';

/**
 * Acesso ao painel sem login: cada pessoa tem um link-chave pessoal
 * (https://site/acesso#<chave>). Ao abrir o link, o navegador recebe um cookie de sessão
 * httpOnly assinado. Sem esse cookie, tudo do painel responde como rota inexistente (404).
 */

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  isMaster: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
export const generateToken = () => crypto.randomBytes(32).toString('base64url');
export const accessLink = (token: string) => `${env.publicUrl}/acesso#${token}`;

// Prefixo __Host- exige HTTPS, Path=/ e nenhum Domain: o cookie não vaza para subdomínios.
export const SESSION_COOKIE = env.isProd ? '__Host-cim_adm' : 'cim_adm';
const SESSION_DAYS = 30;
const RENEW_AFTER_S = 24 * 60 * 60;

export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  // Lax permite abrir o painel a partir de um link externo; mutações exigem o cabeçalho abaixo (anti-CSRF).
  sameSite: 'lax',
  secure: env.isProd,
  path: '/',
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
};

/** Cabeçalho obrigatório em requisições que alteram dados (formulários de outros sites não conseguem enviá-lo). */
export const ADMIN_HEADER = 'x-cim-admin';

interface SessionPayload {
  kid: string;
  // Prefixo do hash da chave: trocar/regenerar a chave invalida as sessões antigas.
  kh: string;
  iat?: number;
}

export function issueSession(res: Response, key: { id: string; tokenHash: string }) {
  const token = jwt.sign({ kid: key.id, kh: key.tokenHash.slice(0, 16) } satisfies SessionPayload, env.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: `${SESSION_DAYS}d`,
  });
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions);
}

export function clearSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions, maxAge: undefined });
}

export async function resolveSession(req: Request, res?: Response): Promise<SessionUser | null> {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw) return null;
  let payload: SessionPayload;
  try {
    payload = jwt.verify(raw, env.jwtSecret, { algorithms: ['HS256'] }) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload.kid !== 'string' || typeof payload.kh !== 'string') return null;

  const [key] = await db.select().from(accessKeys).where(eq(accessKeys.id, payload.kid));
  if (!key || key.revokedAt || !key.tokenHash.startsWith(payload.kh)) return null;

  const now = Date.now();
  if (!key.lastUsedAt || now - key.lastUsedAt.getTime() > 10 * 60 * 1000) {
    await db.update(accessKeys).set({ lastUsedAt: new Date(now) }).where(eq(accessKeys.id, key.id));
  }
  if (res && payload.iat && now / 1000 - payload.iat > RENEW_AFTER_S) issueSession(res, key);

  return { id: key.id, name: key.name, email: key.email, isMaster: key.isMaster };
}

const notFoundJson = { error: 'Rota não encontrada' };

/** Porteiro da API do painel: sem sessão válida, responde exatamente como uma rota que não existe. */
export const adminApiGate: RequestHandler = async (req, res, next) => {
  const user = await resolveSession(req, res);
  const isSafe = req.method === 'GET' || req.method === 'HEAD';
  if (!user || (!isSafe && req.get(ADMIN_HEADER) !== '1')) {
    res.status(404).json(notFoundJson);
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  req.user = user;
  next();
};
