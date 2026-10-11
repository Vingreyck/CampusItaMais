import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { env } from './env';
import type { DocumentRow } from './db/schema';

fs.mkdirSync(env.uploadDir, { recursive: true });

export const MAX_UPLOAD_MB = 30;

/** O busboy entrega nomes UTF-8 decodificados como latin1; corrige quando for o caso. */
export function fixFileName(name: string) {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

export const upload = multer({
  storage: multer.diskStorage({
    destination: env.uploadDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(fixFileName(file.originalname)).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 10 },
});

export const filePath = (storedName: string) => path.join(env.uploadDir, path.basename(storedName));

export async function removeStoredFile(storedName: string) {
  await fs.promises.rm(filePath(storedName), { force: true });
}

export const isImage = (mime: string) => /^image\/(png|jpe?g|webp|gif|avif)$/.test(mime);

export function serializeDocument(d: DocumentRow) {
  return {
    id: d.id,
    taskId: d.taskId,
    name: d.originalName,
    mimeType: d.mimeType,
    size: d.size,
    isPublic: d.isPublic,
    isImage: isImage(d.mimeType),
    url: `/api/files/${d.id}`,
    createdAt: d.createdAt,
  };
}
