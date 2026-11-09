import { Router } from 'express';
import { asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { impedimentEvents, impediments, tasks } from '../db/schema';
import { formatDateBR, HttpError, IMPEDIMENT_CATEGORIES, IMPEDIMENT_IMPACTS, IMPEDIMENT_LABEL, IMPEDIMENT_STATUSES, notFound, todayLocal } from '../util';

// Montado em /api/admin, atrás do adminApiGate: impedimentos são internos e nunca aparecem no site público.
export const impedimentsRouter = Router();

const clean = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/[ \t]+/g, ' ').trim())
    .pipe(z.string().max(max));

const fields = {
  title: clean(200).pipe(z.string().min(1, 'Descreva o impedimento')),
  description: clean(4000),
  category: z.enum(IMPEDIMENT_CATEGORIES),
  impact: z.enum(IMPEDIMENT_IMPACTS),
  responsibleName: clean(120),
  measure: clean(4000),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
    .nullable(),
  status: z.enum(IMPEDIMENT_STATUSES),
  taskId: z.uuid().nullable(),
  actionText: clean(120),
};
const createSchema = z.object(fields).partial().required({ title: true });
const patchSchema = z.object(fields).partial();

type Row = typeof impediments.$inferSelect;
type TaskInfo = { id: string; code: number; title: string; category: string };

const serialize = (r: Row, task: TaskInfo | null) => ({
  id: r.id,
  code: r.code,
  title: r.title,
  description: r.description,
  category: r.category,
  impact: r.impact,
  responsibleName: r.responsibleName,
  measure: r.measure,
  dueDate: r.dueDate,
  status: r.status,
  resolvedAt: r.resolvedAt,
  taskId: r.taskId,
  actionText: r.actionText,
  task,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

async function taskInfo(id: string | null): Promise<TaskInfo | null> {
  if (!id) return null;
  const [t] = await db.select({ id: tasks.id, code: tasks.code, title: tasks.title, category: tasks.category }).from(tasks).where(eq(tasks.id, id));
  return t ?? null;
}

async function event(impedimentId: string, message: string, userName: string) {
  await db.insert(impedimentEvents).values({ impedimentId, message, userName });
}

async function detail(id: string) {
  const [row] = await db.select().from(impediments).where(eq(impediments.id, id));
  if (!row) throw notFound('Impedimento');
  const [task, events] = await Promise.all([
    taskInfo(row.taskId),
    db.select().from(impedimentEvents).where(eq(impedimentEvents.impedimentId, id)).orderBy(desc(impedimentEvents.createdAt)).limit(300),
  ]);
  return { ...serialize(row, task), events: events.map((e) => ({ id: e.id, message: e.message, userName: e.userName, createdAt: e.createdAt })) };
}

impedimentsRouter.get('/impediments', async (_req, res) => {
  const rows = await db
    .select({ imp: impediments, task: { id: tasks.id, code: tasks.code, title: tasks.title, category: tasks.category } })
    .from(impediments)
    .leftJoin(tasks, eq(tasks.id, impediments.taskId))
    .orderBy(asc(impediments.code));
  res.json(rows.map((r) => serialize(r.imp, r.task?.id ? r.task : null)));
});

impedimentsRouter.get('/impediments/:id', async (req, res) => {
  res.json(await detail(req.params.id));
});

impedimentsRouter.post('/impediments', async (req, res) => {
  const data = createSchema.parse(req.body);
  const linked = await taskInfo(data.taskId ?? null);
  if (data.taskId && !linked) throw new HttpError(400, 'A ação vinculada não foi encontrada');
  const status = data.status ?? 'em_analise';
  const [row] = await db
    .insert(impediments)
    .values({
      ...data,
      status,
      // Vinculado a uma ação cadastrada: o texto livre seria informação duplicada.
      actionText: linked ? '' : (data.actionText ?? ''),
      resolvedAt: status === 'resolvido' ? todayLocal() : null,
      createdById: req.user!.id,
    })
    .returning();
  await event(row.id, `registrou o impedimento (${IMPEDIMENT_LABEL[status].toLowerCase()})`, req.user!.name);
  res.status(201).json(await detail(row.id));
});

impedimentsRouter.patch('/impediments/:id', async (req, res) => {
  const data = patchSchema.parse(req.body);
  const [cur] = await db.select().from(impediments).where(eq(impediments.id, req.params.id));
  if (!cur) throw notFound('Impedimento');
  const who = req.user!.name;
  const notes: string[] = [];
  const update: Partial<typeof impediments.$inferInsert> = { ...data, updatedAt: new Date() };

  if (data.taskId !== undefined && data.taskId !== cur.taskId) {
    const linked = await taskInfo(data.taskId);
    if (data.taskId && !linked) throw new HttpError(400, 'A ação vinculada não foi encontrada');
    if (linked) update.actionText = '';
    notes.push(linked ? `vinculou à ação ITA-${linked.code}` : 'removeu o vínculo com a ação');
  } else if (data.actionText !== undefined && data.taskId === undefined && cur.taskId) {
    // Já está vinculado a uma ação: ignora texto livre para não duplicar a informação.
    delete update.actionText;
  }

  if (data.status && data.status !== cur.status) {
    notes.push(`mudou a situação de “${IMPEDIMENT_LABEL[cur.status]}” para “${IMPEDIMENT_LABEL[data.status]}”`);
    if (data.status === 'resolvido') update.resolvedAt = cur.resolvedAt ?? todayLocal();
    else update.resolvedAt = null;
  }
  if (data.impact && data.impact !== cur.impact) notes.push(`alterou o impacto de ${IMPEDIMENT_LABEL[cur.impact].toLowerCase()} para ${IMPEDIMENT_LABEL[data.impact].toLowerCase()}`);
  if (data.category && data.category !== cur.category) notes.push(`alterou a categoria para ${IMPEDIMENT_LABEL[data.category].toLowerCase()}`);
  if (data.title && data.title !== cur.title) notes.push('editou o título');
  if (data.description !== undefined && data.description !== cur.description) notes.push('editou a descrição');
  if (data.measure !== undefined && data.measure !== cur.measure) notes.push('editou a providência necessária');
  if (data.responsibleName !== undefined && data.responsibleName !== cur.responsibleName) {
    notes.push(data.responsibleName ? `definiu ${data.responsibleName} como responsável` : 'removeu o responsável');
  }
  if (data.dueDate !== undefined && data.dueDate !== cur.dueDate) notes.push(`alterou o prazo para ${data.dueDate ? formatDateBR(data.dueDate) : 'vazio'}`);

  await db.update(impediments).set(update).where(eq(impediments.id, cur.id));
  for (const n of notes) await event(cur.id, n, who);
  res.json(await detail(cur.id));
});
