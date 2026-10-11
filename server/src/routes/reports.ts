import { Router } from 'express';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { activities, subtasks, tasks } from '../db/schema';
import { serializeSubtask, serializeTask } from '../taskData';
import { HttpError, STATUSES } from '../util';

// Montado em /api/admin, atrás do adminApiGate.
export const reportsRouter = Router();

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');

reportsRouter.get('/reports', async (req, res) => {
  const { from, to } = z.object({ from: day, to: day }).parse(req.query);
  if (from > to) throw new HttpError(400, 'A data inicial deve ser anterior à final');

  // Limites do período no fuso de Sergipe (UTC-3, sem horário de verão).
  const fromTs = new Date(`${from}T00:00:00-03:00`);
  const toTs = new Date(`${to}T23:59:59.999-03:00`);
  const inDay = (d: string | null) => !!d && d >= from && d <= to;
  const inTs = (d: Date) => d >= fromTs && d <= toTs;

  const [allTasks, allSubs, acts] = await Promise.all([
    db.select().from(tasks).orderBy(asc(tasks.position)),
    db.select().from(subtasks).orderBy(asc(subtasks.position), asc(subtasks.createdAt)),
    db
      .select({
        id: activities.id,
        taskId: activities.taskId,
        type: activities.type,
        message: activities.message,
        userName: activities.userName,
        createdAt: activities.createdAt,
        taskTitle: tasks.title,
        taskCode: tasks.code,
      })
      .from(activities)
      .innerJoin(tasks, eq(tasks.id, activities.taskId))
      .where(and(gte(activities.createdAt, fromTs), lte(activities.createdAt, toTs)))
      .orderBy(desc(activities.createdAt))
      .limit(1000),
  ]);

  const subsByTask = new Map<string, typeof allSubs>();
  for (const s of allSubs) {
    const list = subsByTask.get(s.taskId) ?? [];
    list.push(s);
    subsByTask.set(s.taskId, list);
  }

  const withSubs = (t: (typeof allTasks)[number]) => {
    const subs = subsByTask.get(t.id) ?? [];
    return {
      ...serializeTask(t, { subtaskTotal: subs.length, subtaskDone: subs.filter((s) => s.done).length, documentCount: 0 }),
      subtasks: subs.map(serializeSubtask),
    };
  };

  const completedTasks = allTasks.filter((t) => t.status === 'concluido' && inDay(t.completedAt)).map(withSubs);
  const createdTasks = allTasks.filter((t) => inTs(t.createdAt)).map(withSubs);
  const inProgress = allTasks.filter((t) => t.status === 'em_andamento' || t.status === 'em_analise').map(withSubs);
  const planned = allTasks.filter((t) => t.status === 'ideia' || t.status === 'a_fazer').map(withSubs);

  const taskById = new Map(allTasks.map((t) => [t.id, t]));
  const completedSubtasks = allSubs
    .filter((s) => s.done && inDay(s.completedAt))
    .map((s) => ({ ...serializeSubtask(s), taskTitle: taskById.get(s.taskId)?.title ?? '', taskCode: taskById.get(s.taskId)?.code ?? 0 }))
    .sort((a, b) => (a.completedAt! < b.completedAt! ? -1 : 1));

  const statusCounts = Object.fromEntries(STATUSES.map((s) => [s, allTasks.filter((t) => t.status === s).length]));

  res.json({
    from,
    to,
    generatedAt: new Date(),
    generatedBy: req.user!.name,
    summary: {
      completedTasks: completedTasks.length,
      completedSubtasks: completedSubtasks.length,
      createdTasks: createdTasks.length,
      inProgress: inProgress.length,
      planned: planned.length,
      activities: acts.length,
      totalTasks: allTasks.length,
    },
    statusCounts,
    completedTasks,
    completedSubtasks,
    createdTasks,
    inProgress,
    planned,
    activities: acts,
  });
});
