import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import multer from 'multer';
import { ZodError } from 'zod';
import { env } from './env';
import { adminApiGate, resolveSession } from './auth';
import { accessRouter, adminAccessRouter } from './routes/access';
import { publicRouter } from './routes/public';
import { filesRouter } from './routes/files';
import { tasksRouter } from './routes/tasks';
import { reportsRouter } from './routes/reports';
import { MAX_UPLOAD_MB } from './uploads';
import { HttpError } from './util';

const apiNotFound = { error: 'Rota não encontrada' };

// ---------- Troca do link-chave por sessão ----------
// A chave vem no fragmento (#...), que nunca é enviado ao servidor, a logs ou ao Referer.
const ACCESS_SCRIPT = `(function(){var k=location.hash.slice(1);history.replaceState(null,'',location.pathname);if(!k){location.replace('/');return}fetch('/api/acesso',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:decodeURIComponent(k)})}).then(function(r){location.replace(r.ok?'/admin/':'/')},function(){location.replace('/')})})();`;
const ACCESS_SCRIPT_HASH = `'sha256-${crypto.createHash('sha256').update(ACCESS_SCRIPT).digest('base64')}'`;
const ACCESS_PAGE = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Campus Ita+</title></head><body style="margin:0;background:#eef3f7"><script>${ACCESS_SCRIPT}</script></body></html>`;

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues[0]?.message ?? 'Dados inválidos' });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? `Arquivo maior que ${MAX_UPLOAD_MB} MB` : `Falha no upload: ${err.message}`;
    res.status(413).json({ error: msg });
    return;
  }
  // 22P02 = sintaxe inválida (ex.: UUID malformado na URL). O Drizzle embrulha o erro do Postgres em `cause`.
  const pgCode = (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  if (pgCode === '22P02') {
    res.status(404).json({ error: 'Registro não encontrado' });
    return;
  }
  if ((err as { type?: string })?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'JSON inválido' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
};

/** Monta a aplicação Express (sem abrir porta) — usada pelo servidor e pelos testes. */
export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'blob:'],
          'worker-src': ["'self'", 'blob:'],
          'connect-src': ["'self'"],
          'upgrade-insecure-requests': null,
        },
      },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // ---------- API ----------
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/public', publicRouter);
  app.use('/api/files', filesRouter);
  app.use('/api', accessRouter);
  // Tudo do painel passa pelo porteiro: sem sessão válida a resposta é idêntica à de uma rota inexistente.
  app.use('/api/admin', adminApiGate, adminAccessRouter, tasksRouter, reportsRouter);
  app.use('/api', (_req, res) => {
    res.status(404).json(apiNotFound);
  });

  app.get('/acesso', (_req, res) => {
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; script-src ${ACCESS_SCRIPT_HASH}; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    );
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.type('html').send(ACCESS_PAGE);
  });

  // ---------- Painel (build separado; só é entregue a quem tem sessão) ----------
  if (fs.existsSync(env.adminDist)) {
    const adminStatic = express.static(env.adminDist, { index: false, cacheControl: false });
    app.use('/admin', async (req, res, next) => {
      const user = await resolveSession(req, res);
      // Sem sessão: segue para o fallback do site público, exatamente como qualquer URL desconhecida.
      if (!user) return next();
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.setHeader('Cache-Control', req.path.startsWith('/assets/') ? 'private, max-age=31536000, immutable' : 'no-store');
      adminStatic(req, res, () => {
        if ((req.method === 'GET' || req.method === 'HEAD') && req.accepts('html')) {
          res.setHeader('Cache-Control', 'no-store');
          res.sendFile(path.join(env.adminDist, 'index.html'));
        } else {
          res.status(404).end();
        }
      });
    });
  }

  // ---------- Site público ----------
  if (fs.existsSync(env.siteDist)) {
    app.use('/assets', express.static(path.join(env.siteDist, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
    app.use(express.static(env.siteDist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || !req.accepts('html')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(env.siteDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
