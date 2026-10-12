import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { documents, tasks } from '../db/schema';
import { resolveSession } from '../auth';
import { filePath } from '../uploads';
import { notFound } from '../util';

export const filesRouter = Router();

// Tipos seguros para exibir no navegador; o resto é sempre baixado (evita HTML/SVG executável).
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'application/pdf']);

filesRouter.get('/:id', async (req, res) => {
  const [row] = await db
    .select({ doc: documents, taskPublic: tasks.isPublic })
    .from(documents)
    .innerJoin(tasks, eq(tasks.id, documents.taskId))
    .where(eq(documents.id, req.params.id));
  if (!row) throw notFound('Arquivo');
  const { doc } = row;
  // Público = documento marcado como público E projeto visível no site. Fora isso, só com sessão do painel.
  const isPublic = doc.isPublic && row.taskPublic;
  if (!isPublic && !(await resolveSession(req))) throw notFound('Arquivo');

  const inline = INLINE_TYPES.has(doc.mimeType) && req.query.download === undefined;
  res.setHeader('Content-Type', INLINE_TYPES.has(doc.mimeType) ? doc.mimeType : 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`,
  );
  res.setHeader('Cache-Control', isPublic ? 'public, max-age=3600' : 'private, no-store');
  res.sendFile(filePath(doc.storedName), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Arquivo não encontrado no armazenamento' });
  });
});
