import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Funciona tanto em dev (src/env.ts) quanto no bundle (dist/index.js): ambos ficam um nível abaixo de server/
const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, '..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

const envFile = path.join(REPO_ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const e = process.env;
const isProd = e.NODE_ENV === 'production' || !!e.RAILWAY_ENVIRONMENT;

if (isProd && (!e.JWT_SECRET || e.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET (mínimo 32 caracteres) é obrigatório em produção');
}
if (isProd && e.ADMIN_ACCESS_KEY && e.ADMIN_ACCESS_KEY.length < 32) {
  throw new Error('ADMIN_ACCESS_KEY precisa ter pelo menos 32 caracteres');
}

const dataDir = path.resolve(REPO_ROOT, e.DATA_DIR || '.data');
const port = Number(e.PORT) || 3000;

function defaultPublicUrl() {
  if (e.RAILWAY_PUBLIC_DOMAIN) return `https://${e.RAILWAY_PUBLIC_DOMAIN}`;
  return isProd ? `http://localhost:${port}` : 'http://localhost:5173';
}

export const env = {
  isProd,
  port,
  databaseUrl: e.DATABASE_URL || '',
  dataDir,
  uploadDir: e.UPLOAD_DIR ? path.resolve(e.UPLOAD_DIR) : path.join(dataDir, 'uploads'),
  jwtSecret: e.JWT_SECRET || 'dev-secret-nao-use-em-producao',
  publicUrl: (e.PUBLIC_URL || defaultPublicUrl()).replace(/\/+$/, ''),
  seedDemo: e.SEED_DEMO === 'true',
  admin: {
    name: e.ADMIN_NAME || 'Administrador',
    accessKey: (e.ADMIN_ACCESS_KEY || '').trim(),
  },
  mail: {
    from: e.MAIL_FROM || 'Campus Ita+ <nao-responda@campusitamais.local>',
    resendKey: e.RESEND_API_KEY || '',
    brevoKey: e.BREVO_API_KEY || '',
    smtp: {
      host: e.SMTP_HOST || '',
      port: Number(e.SMTP_PORT) || 587,
      user: e.SMTP_USER || '',
      pass: e.SMTP_PASS || '',
      secure: e.SMTP_SECURE === 'true',
    },
  },
  siteDist: path.join(REPO_ROOT, 'web', 'dist', 'site'),
  adminDist: path.join(REPO_ROOT, 'web', 'dist', 'admin', 'admin'),
  migrationsDir: path.join(SERVER_ROOT, 'drizzle'),
};
