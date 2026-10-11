import { Router } from 'express';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { documents, notifications, subtasks, tasks } from '../db/schema';
import { logActivity, touchTask } from '../activity';
import { loadTaskDetail, serializeSubtask, serializeTask, taskCounts } from '../taskData';
import { isImage, removeStoredFile, serializeDocument, fixFileName, upload } from '../uploads';
import { sendMail } from '../mail';
import { taskEmail } from '../mail/templates';
import { HttpError, notFound, STATUSES, statusLabel, todayLocal } from '../util';

// Montado em /api/admin, atrás do adminApiGate.
export const tasksRouter = Router();

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
  .nullable();
const emailField = z.union([z.literal(''), z.email('E-mail inválido')]);

const taskFields = {
  title: z.string().trim().min(1, 'Informe um título').max(200),
  description: z.string().max(20000),
  status: z.enum(STATUSES),
  position: z.number(),
  category: z.string().trim().max(80),
  responsibleName: z.string().trim().max(120),
  responsibleEmail: emailField,
  startDate: dateField,
  dueDate: dateField,
  completedAt: dateField,
  isPublic: z.boolean(),
  posX: z.number().min(-500).max(500).nullable(),
  posZ: z.number().min(-500).max(500).nullable(),
  coverDocumentId: z.uuid().nullable(),
};

const createTaskSchema = z.object(taskFields).partial().required({ title: true });
const patchTaskSchema = z.object(taskFields).partial();

async function nextPosition(status: string) {
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${tasks.position}), 0)` })
    .from(tasks)
    .where(eq(tasks.status, status));
  return Number(max) + 1024;
}

// ---------- Tarefas ----------

tasksRouter.get('/tasks', async (_req, res) => {
  const [rows, counts] = await Promise.all([db.select().from(tasks).orderBy(asc(tasks.position)), taskCounts()]);
  res.json(rows.map((t) => serializeTask(t, counts(t.id))));
});

tasksRouter.post('/tasks', async (req, res) => {
  const data = createTaskSchema.parse(req.body);
  const status = data.status ?? 'ideia';
  const [created] = await db
    .insert(tasks)
    .values({
      ...data,
      status,
      position: data.position ?? (await nextPosition(status)),
      completedAt: data.completedAt ?? (status === 'concluido' ? todayLocal() : null),
      createdById: req.user!.id,
    })
    .returning();
  await logActivity({ taskId: created.id, type: 'created', message: `criou o projeto em “${statusLabel(status)}”`, user: req.user });
  res.status(201).json(await loadTaskDetail(created.id));
});

tasksRouter.get('/tasks/:id', async (req, res) => {
  res.json(await loadTaskDetail(req.params.id));
});

tasksRouter.patch('/tasks/:id', async (req, res) => {
  const id = req.params.id;
  const data = patchTaskSchema.parse(req.body);
  const [cur] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!cur) throw notFound('Tarefa');

  const update: Partial<typeof tasks.$inferInsert> = { ...data, updatedAt: new Date() };
  const logs: { type: string; message: string }[] = [];

  if (data.status && data.status !== cur.status) {
    logs.push({ type: 'status', message: `moveu de “${statusLabel(cur.status)}” para “${statusLabel(data.status)}”` });
    if (data.completedAt === undefined) {
      if (data.status === 'concluido' && !cur.completedAt) update.completedAt = todayLocal();
      if (cur.status === 'concluido' && data.status !== 'concluido') update.completedAt = null;
    }
    if (data.status === 'em_andamento' && !cur.startDate && data.startDate === undefined) {
      update.startDate = todayLocal();
    }
  }

  if (data.posX !== undefined || data.posZ !== undefined) {
    const nextX = data.posX === undefined ? cur.posX : data.posX;
    if (nextX == null) {
      update.posX = null;
      update.posZ = null;
      if (cur.posX != null) logs.push({ type: 'map', message: 'removeu o projeto do mapa' });
    } else if (cur.posX == null) {
      logs.push({ type: 'map', message: 'posicionou o projeto no mapa do campus' });
    }
  }

  if (data.title && data.title !== cur.title) {
    logs.push({ type: 'title', message: `renomeou para “${data.title}”` });
  }
  if (data.responsibleName !== undefined && data.responsibleName !== cur.responsibleName && data.responsibleName) {
    logs.push({ type: 'responsible', message: `definiu ${data.responsibleName} como responsável` });
  }
  if (data.isPublic !== undefined && data.isPublic !== cur.isPublic) {
    logs.push({ type: 'visibility', message: data.isPublic ? 'tornou o projeto visível no site' : 'ocultou o projeto do site' });
  }
  if (data.coverDocumentId) {
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, data.coverDocumentId), eq(documents.taskId, id)));
    if (!doc || !isImage(doc.mimeType)) throw new HttpError(400, 'A capa precisa ser uma imagem anexada a esta tarefa');
    // A capa aparece no site, então o arquivo passa a ser público.
    if (!doc.isPublic) await db.update(documents).set({ isPublic: true }).where(eq(documents.id, doc.id));
  }

  await db.update(tasks).set(update).where(eq(tasks.id, id));
  for (const log of logs) await logActivity({ taskId: id, ...log, user: req.user });
  res.json(await loadTaskDetail(id));
});

tasksRouter.delete('/tasks/:id', async (req, res) => {
  const docs = await db.select().from(documents).where(eq(documents.taskId, req.params.id));
  const deleted = await db.delete(tasks).where(eq(tasks.id, req.params.id)).returning({ id: tasks.id });
  if (!deleted.length) throw notFound('Tarefa');
  await Promise.all(docs.map((d) => removeStoredFile(d.storedName)));
  res.json({ ok: true });
});

tasksRouter.delete('/demo', async (_req, res) => {
  const demo = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.isDemo, true));
  for (const t of demo) {
    const docs = await db.select().from(documents).where(eq(documents.taskId, t.id));
    await db.delete(tasks).where(eq(tasks.id, t.id));
    await Promise.all(docs.map((d) => removeStoredFile(d.storedName)));
  }
  res.json({ removed: demo.length });
});

// ---------- Subtarefas ----------

const subtaskFields = {
  title: z.string().trim().min(1, 'Informe um título').max(200),
  description: z.string().max(10000),
  done: z.boolean(),
  responsibleName: z.string().trim().max(120),
  responsibleEmail: emailField,
  dueDate: dateField,
  completedAt: dateField,
  position: z.number(),
};

tasksRouter.post('/tasks/:id/subtasks', async (req, res) => {
  const taskId = req.params.id;
  const data = z.object(subtaskFields).partial().required({ title: true }).parse(req.body);
  const [task] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw notFound('Tarefa');
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${subtasks.position}), 0)` })
    .from(subtasks)
    .where(eq(subtasks.taskId, taskId));
  const [created] = await db
    .insert(subtasks)
    .values({
      ...data,
      taskId,
      position: data.position ?? Number(max) + 1024,
      completedAt: data.done ? (data.completedAt ?? todayLocal()) : null,
    })
    .returning();
  await touchTask(taskId);
  await logActivity({ taskId, subtaskId: created.id, type: 'subtask', message: `adicionou a subtarefa “${created.title}”`, user: req.user });
  res.status(201).json(serializeSubtask(created));
});

tasksRouter.patch('/subtasks/:id', async (req, res) => {
  const data = z.object(subtaskFields).partial().parse(req.body);
  const [cur] = await db.select().from(subtasks).where(eq(subtasks.id, req.params.id));
  if (!cur) throw notFound('Subtarefa');

  const update: Partial<typeof subtasks.$inferInsert> = { ...data, updatedAt: new Date() };
  if (data.done !== undefined && data.done !== cur.done) {
    if (data.done) {
      update.completedAt = data.completedAt ?? cur.completedAt ?? todayLocal();
      await logActivity({ taskId: cur.taskId, subtaskId: cur.id, type: 'subtask_done', message: `concluiu a subtarefa “${cur.title}”`, user: req.user });
    } else {
      update.completedAt = null;
      await logActivity({ taskId: cur.taskId, subtaskId: cur.id, type: 'subtask_reopen', message: `reabriu a subtarefa “${cur.title}”`, user: req.user });
    }
  }
  const [updated] = await db.update(subtasks).set(update).where(eq(subtasks.id, cur.id)).returning();
  await touchTask(cur.taskId);
  res.json(serializeSubtask(updated));
});

tasksRouter.delete('/subtasks/:id', async (req, res) => {
  const [deleted] = await db.delete(subtasks).where(eq(subtasks.id, req.params.id)).returning();
  if (!deleted) throw notFound('Subtarefa');
  await touchTask(deleted.taskId);
  await logActivity({ taskId: deleted.taskId, type: 'subtask', message: `removeu a subtarefa “${deleted.title}”`, user: req.user });
  res.json({ ok: true });
});

// ---------- Documentos ----------

tasksRouter.post('/tasks/:id/documents', upload.array('files', 10), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const taskId = String(req.params.id);
  const [task] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId));
  if (!task) {
    await Promise.all(files.map((f) => removeStoredFile(f.filename)));
    throw notFound('Tarefa');
  }
  if (!files.length) throw new HttpError(400, 'Nenhum arquivo enviado');

  const rows = await db
    .insert(documents)
    .values(
      files.map((f) => ({
        taskId,
        originalName: fixFileName(f.originalname),
        storedName: f.filename,
        mimeType: f.mimetype || 'application/octet-stream',
        size: f.size,
        uploadedById: req.user!.id,
      })),
    )
    .returning();
  await touchTask(taskId);
  await logActivity({
    taskId,
    type: 'document',
    message: rows.length === 1 ? `anexou o documento “${rows[0].originalName}”` : `anexou ${rows.length} documentos`,
    user: req.user,
  });
  res.status(201).json(rows.map(serializeDocument));
});

tasksRouter.patch('/documents/:id', async (req, res) => {
  const data = z.object({ isPublic: z.boolean() }).parse(req.body);
  const [updated] = await db.update(documents).set(data).where(eq(documents.id, req.params.id)).returning();
  if (!updated) throw notFound('Documento');
  if (!data.isPublic) {
    // Documento privado não pode continuar como capa pública.
    await db.update(tasks).set({ coverDocumentId: null }).where(and(eq(tasks.id, updated.taskId), eq(tasks.coverDocumentId, updated.id)));
  }
  res.json(serializeDocument(updated));
});

tasksRouter.delete('/documents/:id', async (req, res) => {
  const [deleted] = await db.delete(documents).where(eq(documents.id, req.params.id)).returning();
  if (!deleted) throw notFound('Documento');
  await db.update(tasks).set({ coverDocumentId: null }).where(and(eq(tasks.id, deleted.taskId), eq(tasks.coverDocumentId, deleted.id)));
  await removeStoredFile(deleted.storedName);
  await logActivity({ taskId: deleted.taskId, type: 'document', message: `removeu o documento “${deleted.originalName}”`, user: req.user });
  res.json({ ok: true });
});

// ---------- Envio por e-mail ----------

tasksRouter.post('/tasks/:id/notify', async (req, res) => {
  const taskId = req.params.id;
  const { email, subtaskId } = z
    .object({ email: z.email('E-mail inválido').trim().toLowerCase(), subtaskId: z.uuid().nullish() })
    .parse(req.body);
  const detail = await loadTaskDetail(taskId);
  const sub = subtaskId ? detail.subtasks.find((s) => s.id === subtaskId) : undefined;
  if (subtaskId && !sub) throw notFound('Subtarefa');

  const message = taskEmail(detail, { subtaskId, senderName: req.user!.name });
  let status: 'sent' | 'failed' | 'simulated' = 'sent';
  let error: string | null = null;
  try {
    const provider = await sendMail({ to: email, ...message });
    if (provider === 'console') status = 'simulated';
  } catch (err) {
    status = 'failed';
    error = err instanceof Error ? err.message : String(err);
    console.error('[mail] falha ao enviar', error);
  }

  const [note] = await db
    .insert(notifications)
    .values({ taskId, subtaskId: subtaskId ?? null, email, status, error, sentById: req.user!.id })
    .returning();
  if (status !== 'failed') {
    await logActivity({
      taskId,
      subtaskId,
      type: 'email',
      message: sub ? `enviou a subtarefa “${sub.title}” para ${email}` : `enviou o projeto por e-mail para ${email}`,
      user: req.user,
    });
  }
  res.status(status === 'failed' ? 502 : 201).json({ ...note, sentByName: req.user!.name });
});
