import { Router } from 'express';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { comments, documents, notifications, subtasks, tasks } from '../db/schema';
import { logActivity, touchTask } from '../activity';
import { loadTaskDetail, serializeComment, serializeSubtask, serializeTask, taskCounts } from '../taskData';
import { isImage, removeStoredFile, serializeDocument, fixFileName, upload } from '../uploads';
import { sendMail } from '../mail';
import { taskEmail } from '../mail/templates';
import { formatDateBR, HttpError, notFound, PRIORITIES, PRIORITY_LABEL, STATUSES, statusLabel, todayLocal } from '../util';

// Montado em /api/admin, atrás do adminApiGate.
export const tasksRouter = Router();

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
  .nullable();
// Normaliza (trim + minúsculas) ANTES de validar o formato.
const emailRequired = z.string().trim().toLowerCase().pipe(z.email('E-mail inválido'));
const emailOptional = z.string().trim().toLowerCase().pipe(z.union([z.literal(''), z.email('E-mail inválido')]));

const taskFields = {
  title: z.string().trim().min(1, 'Informe um título').max(200),
  description: z.string().max(20000),
  status: z.enum(STATUSES),
  position: z.number(),
  priority: z.enum(PRIORITIES),
  category: z.string().trim().max(80),
  responsibleName: z.string().trim().max(120),
  responsibleEmail: emailOptional,
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

/**
 * Reordenar por "ponto médio" divide o espaço entre cartões a cada arraste.
 * Quando dois vizinhos ficam colados demais, renumeramos a coluna (mantendo a ordem).
 */
async function rebalanceColumn(status: string) {
  const rows = await db.select({ id: tasks.id, position: tasks.position }).from(tasks).where(eq(tasks.status, status)).orderBy(asc(tasks.position));
  const tight = rows.some((r, i) => i > 0 && r.position - rows[i - 1].position < 1e-3);
  if (!tight) return;
  for (const [i, r] of rows.entries()) {
    await db.update(tasks).set({ position: (i + 1) * 1024 }).where(eq(tasks.id, r.id));
  }
}

/** Aceita o UUID ou a chave no estilo Jira (ITA-12). */
async function resolveTaskId(param: string) {
  const key = /^ITA-(\d+)$/i.exec(param);
  if (!key) return param;
  const [row] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.code, Number(key[1])));
  if (!row) throw notFound('Tarefa');
  return row.id;
}

const dateLabel = (d: string | null) => (d ? formatDateBR(d) : 'vazio');

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
      startDate: data.startDate ?? (status === 'em_andamento' ? todayLocal() : null),
      completedAt: data.completedAt ?? (status === 'concluido' ? todayLocal() : null),
      createdById: req.user!.id,
    })
    .returning();
  await logActivity({ taskId: created.id, type: 'created', message: `criou o projeto em “${statusLabel(status)}”`, user: req.user });
  res.status(201).json(await loadTaskDetail(created.id));
});

tasksRouter.get('/tasks/:id', async (req, res) => {
  res.json(await loadTaskDetail(await resolveTaskId(req.params.id)));
});

tasksRouter.patch('/tasks/:id', async (req, res) => {
  const id = req.params.id;
  const data = patchTaskSchema.parse(req.body);
  const [cur] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!cur) throw notFound('Tarefa');

  const update: Partial<typeof tasks.$inferInsert> = { ...data, updatedAt: new Date() };
  const logs: { type: string; message: string }[] = [];
  const log = (type: string, message: string) => logs.push({ type, message });

  if (data.status && data.status !== cur.status) {
    log('status', `moveu de “${statusLabel(cur.status)}” para “${statusLabel(data.status)}”`);
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
    const nextZ = data.posZ === undefined ? cur.posZ : data.posZ;
    if (nextX == null || nextZ == null) {
      update.posX = null;
      update.posZ = null;
      if (cur.posX != null) log('map', 'removeu o projeto do mapa');
    } else if (cur.posX == null) {
      log('map', 'posicionou o projeto no mapa do campus');
    } else if (Math.hypot(nextX - cur.posX, nextZ - (cur.posZ ?? 0)) > 1) {
      log('map', 'ajustou a posição no mapa');
    }
  }

  if (data.title && data.title !== cur.title) log('title', `renomeou para “${data.title}”`);
  if (data.description !== undefined && data.description !== cur.description) log('description', 'editou a descrição');
  if (data.priority && data.priority !== cur.priority) {
    log('priority', `alterou a prioridade de ${PRIORITY_LABEL[cur.priority as keyof typeof PRIORITY_LABEL] ?? cur.priority} para ${PRIORITY_LABEL[data.priority]}`);
  }
  if (data.category !== undefined && data.category !== cur.category) {
    log('category', data.category ? `definiu a categoria “${data.category}”` : 'removeu a categoria');
  }
  if (data.responsibleName !== undefined && data.responsibleName !== cur.responsibleName) {
    log('responsible', data.responsibleName ? `definiu ${data.responsibleName} como responsável` : 'removeu o responsável');
  }
  if (data.responsibleEmail !== undefined && data.responsibleEmail !== cur.responsibleEmail && data.responsibleEmail) {
    log('responsible', `definiu o e-mail do responsável (${data.responsibleEmail})`);
  }
  for (const [field, label] of [
    ['startDate', 'a data de início'],
    ['dueDate', 'a previsão de término'],
    ['completedAt', 'a data de conclusão'],
  ] as const) {
    if (data[field] !== undefined && data[field] !== cur[field]) log('date', `alterou ${label} para ${dateLabel(data[field])}`);
  }
  if (data.isPublic !== undefined && data.isPublic !== cur.isPublic) {
    log('visibility', data.isPublic ? 'tornou o projeto visível no site' : 'ocultou o projeto do site');
  }
  if (data.coverDocumentId) {
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, data.coverDocumentId), eq(documents.taskId, id)));
    if (!doc || !isImage(doc.mimeType)) throw new HttpError(400, 'A capa precisa ser uma imagem anexada a esta tarefa');
    // A capa aparece no site, então o arquivo passa a ser público.
    if (!doc.isPublic) await db.update(documents).set({ isPublic: true }).where(eq(documents.id, doc.id));
    if (doc.id !== cur.coverDocumentId) log('document', `definiu “${doc.originalName}” como capa`);
  }

  await db.update(tasks).set(update).where(eq(tasks.id, id));
  if (data.position !== undefined) await rebalanceColumn(data.status ?? cur.status);
  for (const l of logs) await logActivity({ taskId: id, ...l, user: req.user });
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
  responsibleEmail: emailOptional,
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
  } else if (data.completedAt !== undefined && !(data.done ?? cur.done)) {
    // Data de conclusão só faz sentido em subtarefa concluída.
    update.completedAt = null;
  }
  if (data.title && data.title !== cur.title) {
    await logActivity({ taskId: cur.taskId, subtaskId: cur.id, type: 'subtask', message: `renomeou a subtarefa “${cur.title}” para “${data.title}”`, user: req.user });
  }
  let [updated] = await db.update(subtasks).set(update).where(eq(subtasks.id, cur.id)).returning();
  if (data.position !== undefined) {
    // Mesmo cuidado do quadro: renumera o checklist quando as posições ficam coladas.
    const rows = await db.select({ id: subtasks.id, position: subtasks.position }).from(subtasks).where(eq(subtasks.taskId, cur.taskId)).orderBy(asc(subtasks.position));
    if (rows.some((r, i) => i > 0 && r.position - rows[i - 1].position < 1e-3)) {
      for (const [i, r] of rows.entries()) await db.update(subtasks).set({ position: (i + 1) * 1024 }).where(eq(subtasks.id, r.id));
      [updated] = await db.select().from(subtasks).where(eq(subtasks.id, cur.id));
    }
  }
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

// ---------- Comentários ----------

const commentBody = z.object({ body: z.string().trim().min(1, 'Escreva um comentário').max(10000) });

tasksRouter.post('/tasks/:id/comments', async (req, res) => {
  const taskId = req.params.id;
  const { body } = commentBody.parse(req.body);
  const [task] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw notFound('Tarefa');
  const [created] = await db.insert(comments).values({ taskId, body, authorId: req.user!.id, authorName: req.user!.name }).returning();
  await touchTask(taskId);
  res.status(201).json(serializeComment(created));
});

async function ownComment(id: string, user: Express.Request['user']) {
  const [cur] = await db.select().from(comments).where(eq(comments.id, id));
  if (!cur) throw notFound('Comentário');
  // Como no Jira: cada um edita/apaga o próprio comentário; a chave mestra pode apagar qualquer um.
  return { cur, isOwner: cur.authorId === user!.id, isMaster: user!.isMaster };
}

tasksRouter.patch('/comments/:id', async (req, res) => {
  const { body } = commentBody.parse(req.body);
  const { cur, isOwner } = await ownComment(req.params.id, req.user);
  if (!isOwner) throw new HttpError(403, 'Só o autor pode editar este comentário');
  const [updated] = await db.update(comments).set({ body, updatedAt: new Date() }).where(eq(comments.id, cur.id)).returning();
  res.json(serializeComment(updated));
});

tasksRouter.delete('/comments/:id', async (req, res) => {
  const { cur, isOwner, isMaster } = await ownComment(req.params.id, req.user);
  if (!isOwner && !isMaster) throw new HttpError(403, 'Só o autor pode apagar este comentário');
  await db.delete(comments).where(eq(comments.id, cur.id));
  await logActivity({ taskId: cur.taskId, type: 'comment', message: `apagou um comentário de ${cur.authorName}`, user: req.user });
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
  await logActivity({
    taskId: updated.taskId,
    type: 'document',
    message: data.isPublic ? `tornou público o documento “${updated.originalName}”` : `tornou privado o documento “${updated.originalName}”`,
    user: req.user,
  });
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
  const { email, subtaskId } = z.object({ email: emailRequired, subtaskId: z.uuid().nullish() }).parse(req.body);
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
