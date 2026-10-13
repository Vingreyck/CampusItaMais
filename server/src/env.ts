import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Funciona tanto em dev (src/env.ts) quanto no bundle (dist/index.js): ambos ficam um nível abaixo de server/
const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, '..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

// Os testes automatizados definem o próprio ambiente e não leem o .env local.
const envFile = path.join(REPO_ROOT, '.env');
if (!process.env.CIM_SKIP_DOTENV && fs.existsSync(envFile)) process.loadEnvFile(envFile);

const e = process.env;
const isProd = e.NODE_ENV === 'production' || !!e.RAILWAY_ENVIRONMENT;

/** Chave opcional: vazio, "false", "0", "no"/"não" ou "off" contam como desligado. */
const optional = (v: string | undefined) => {
  const value = (v ?? '').trim();
  return /^(false|0|no|n[aã]o|off|none|null)$/i.test(value) ? '' : value;
};

// Valores de exemplo do .env.example são públicos no GitHub: nunca podem ir para produção.
const PLACEHOLDER = /gere-uma|troque|exemplo|changeme|seudominio/i;

if (isProd && (!e.JWT_SECRET || e.JWT_SECRET.length < 32 || PLACEHOLDER.test(e.JWT_SECRET))) {
  throw new Error('JWT_SECRET precisa ser uma chave aleatória própria (mínimo 32 caracteres), não o valor de exemplo');
}
if (isProd && e.ADMIN_ACCESS_KEY && (e.ADMIN_ACCESS_KEY.length < 32 || PLACEHOLDER.test(e.ADMIN_ACCESS_KEY))) {
  throw new Error('ADMIN_ACCESS_KEY precisa ser uma chave aleatória própria (mínimo 32 caracteres)');
}

const dataDir = path.resolve(REPO_ROOT, e.DATA_DIR || '.data');
const port = Number(e.PORT) || 3000;

if (e.RAILWAY_ENVIRONMENT && !e.RAILWAY_VOLUME_MOUNT_PATH) {
  console.warn('[env] Nenhum volume montado: documentos enviados serão perdidos a cada deploy. Monte um volume em /data e use DATA_DIR=/data.');
} else if (e.RAILWAY_VOLUME_MOUNT_PATH && !dataDir.startsWith(path.resolve(e.RAILWAY_VOLUME_MOUNT_PATH))) {
  console.warn(`[env] DATA_DIR (${dataDir}) está fora do volume (${e.RAILWAY_VOLUME_MOUNT_PATH}): os documentos não ficam salvos. Use DATA_DIR=${e.RAILWAY_VOLUME_MOUNT_PATH}.`);
}

function defaultPublicUrl() {
  if (e.RAILWAY_PUBLIC_DOMAIN) return `https://${e.RAILWAY_PUBLIC_DOMAIN}`;
  return isProd ? `http://localhost:${port}` : 'http://localhost:5173';
}

/** PUBLIC_URL apontando para localhost em produção (valor de exemplo) quebraria os links dos e-mails. */
function publicUrl() {
  const configured = e.PUBLIC_URL?.trim();
  if (configured && !(isProd && e.RAILWAY_PUBLIC_DOMAIN && /\/\/(localhost|127\.0\.0\.1)/.test(configured))) return configured;
  if (configured) console.warn(`[env] PUBLIC_URL=${configured} ignorada em produção; usando o domínio do Railway.`);
  return defaultPublicUrl();
}

export const env = {
  isProd,
  port,
  databaseUrl: optional(e.DATABASE_URL),
  dataDir,
  uploadDir: e.UPLOAD_DIR ? path.resolve(e.UPLOAD_DIR) : path.join(dataDir, 'uploads'),
  jwtSecret: e.JWT_SECRET || 'dev-secret-nao-use-em-producao',
  publicUrl: publicUrl().replace(/\/+$/, ''),
  seedDemo: e.SEED_DEMO === 'true',
  admin: {
    name: e.ADMIN_NAME || 'Administrador',
    accessKey: (e.ADMIN_ACCESS_KEY || '').trim(),
  },
  mail: {
    from: e.MAIL_FROM || 'Campus Ita+ <nao-responda@campusitamais.local>',
    resendKey: optional(e.RESEND_API_KEY),
    brevoKey: optional(e.BREVO_API_KEY),
    smtp: {
      host: optional(e.SMTP_HOST),
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
