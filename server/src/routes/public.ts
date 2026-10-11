import { Router } from 'express';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { documents, subtasks, tasks } from '../db/schema';
import { isImage } from '../uploads';

export const publicRouter = Router();

publicRouter.get('/projects', async (_req, res) => {
  const rows = await db.select().from(tasks).where(eq(tasks.isPublic, true)).orderBy(asc(tasks.position));
  const ids = rows.map((r) => r.id);
  const [subs, docs] = ids.length
    ? await Promise.all([
        db.select().from(subtasks).where(inArray(subtasks.taskId, ids)).orderBy(asc(subtasks.position), asc(subtasks.createdAt)),
        db
          .select()
          .from(documents)
          .where(and(inArray(documents.taskId, ids), eq(documents.isPublic, true)))
          .orderBy(asc(documents.createdAt)),
      ])
    : [[], []];

  const projects = rows.map((t) => {
    const taskSubs = subs.filter((s) => s.taskId === t.id);
    const taskDocs = docs.filter((d) => d.taskId === t.id);
    const cover = taskDocs.find((d) => d.id === t.coverDocumentId) ?? taskDocs.find((d) => isImage(d.mimeType));
    return {
      id: t.id,
      code: t.code,
      title: t.title,
      description: t.description,
      status: t.status,
      category: t.category,
      responsibleName: t.responsibleName,
      startDate: t.startDate,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      isDemo: t.isDemo,
      posX: t.posX,
      posZ: t.posZ,
      updatedAt: t.updatedAt,
      coverUrl: cover && isImage(cover.mimeType) ? `/api/files/${cover.id}` : null,
      subtasks: taskSubs.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        done: s.done,
        completedAt: s.completedAt,
        responsibleName: s.responsibleName,
      })),
      documents: taskDocs.map((d) => ({
        id: d.id,
        name: d.originalName,
        mimeType: d.mimeType,
        size: d.size,
        isImage: isImage(d.mimeType),
        url: `/api/files/${d.id}`,
      })),
    };
  });

  res.setHeader('Cache-Control', 'no-cache');
  res.json({ projects });
});
