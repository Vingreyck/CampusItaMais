import { asc, desc, eq } from 'drizzle-orm';
import { db } from './db';
import { accessKeys as users, activities, documents, notifications, subtasks, tasks, type SubtaskRow, type TaskRow } from './db/schema';
import { serializeDocument } from './uploads';
import { notFound } from './util';

export function serializeSubtask(s: SubtaskRow) {
  return {
    id: s.id,
    taskId: s.taskId,
    title: s.title,
    description: s.description,
    done: s.done,
    responsibleName: s.responsibleName,
    responsibleEmail: s.responsibleEmail,
    dueDate: s.dueDate,
    completedAt: s.completedAt,
    position: s.position,
  };
}

export function serializeTask(t: TaskRow, counts?: { subtaskTotal: number; subtaskDone: number; documentCount: number }) {
  return {
    id: t.id,
    code: t.code,
    title: t.title,
    description: t.description,
    status: t.status,
    position: t.position,
    category: t.category,
    responsibleName: t.responsibleName,
    responsibleEmail: t.responsibleEmail,
    startDate: t.startDate,
    dueDate: t.dueDate,
    completedAt: t.completedAt,
    isPublic: t.isPublic,
    isDemo: t.isDemo,
    posX: t.posX,
    posZ: t.posZ,
    coverDocumentId: t.coverDocumentId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    subtaskTotal: counts?.subtaskTotal ?? 0,
    subtaskDone: counts?.subtaskDone ?? 0,
    documentCount: counts?.documentCount ?? 0,
  };
}

/** Contagem de subtarefas/documentos por tarefa (volume pequeno: agregamos em memória). */
export async function taskCounts() {
  const [subs, docs] = await Promise.all([
    db.select({ taskId: subtasks.taskId, done: subtasks.done }).from(subtasks),
    db.select({ taskId: documents.taskId }).from(documents),
  ]);
  const map = new Map<string, { subtaskTotal: number; subtaskDone: number; documentCount: number }>();
  const get = (id: string) => {
    let c = map.get(id);
    if (!c) map.set(id, (c = { subtaskTotal: 0, subtaskDone: 0, documentCount: 0 }));
    return c;
  };
  for (const s of subs) {
    const c = get(s.taskId);
    c.subtaskTotal++;
    if (s.done) c.subtaskDone++;
  }
  for (const d of docs) get(d.taskId).documentCount++;
  return get;
}

export async function loadTaskDetail(id: string) {
  const [t] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!t) throw notFound('Tarefa');

  const [subs, docs, notes, acts, creator] = await Promise.all([
    db.select().from(subtasks).where(eq(subtasks.taskId, id)).orderBy(asc(subtasks.position), asc(subtasks.createdAt)),
    db.select().from(documents).where(eq(documents.taskId, id)).orderBy(desc(documents.createdAt)),
    db
      .select({
        id: notifications.id,
        subtaskId: notifications.subtaskId,
        email: notifications.email,
        status: notifications.status,
        error: notifications.error,
        createdAt: notifications.createdAt,
        sentByName: users.name,
      })
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.sentById))
      .where(eq(notifications.taskId, id))
      .orderBy(desc(notifications.createdAt)),
    db
      .select()
      .from(activities)
      .where(eq(activities.taskId, id))
      .orderBy(desc(activities.createdAt))
      .limit(100),
    t.createdById
      ? db.select({ name: users.name }).from(users).where(eq(users.id, t.createdById))
      : Promise.resolve([]),
  ]);

  return {
    ...serializeTask(t, {
      subtaskTotal: subs.length,
      subtaskDone: subs.filter((s) => s.done).length,
      documentCount: docs.length,
    }),
    createdByName: creator[0]?.name ?? null,
    subtasks: subs.map(serializeSubtask),
    documents: docs.map(serializeDocument),
    notifications: notes,
    activities: acts.map((a) => ({
      id: a.id,
      type: a.type,
      message: a.message,
      userName: a.userName,
      createdAt: a.createdAt,
    })),
  };
}
