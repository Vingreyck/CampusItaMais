import { Router } from 'express';
import multer from 'multer';
import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { activities, comments, subtasks, tasks } from '../db/schema';
import type { SessionUser } from '../auth';
import { parseJiraExport, type JiraParseResult } from '../jira';
import { MAX_UPLOAD_MB } from '../uploads';
import { HttpError, STATUSES, todayLocal, type Status } from '../util';

// Montado em /api/admin, atrás do adminApiGate.
export const importRouter = Router();

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });

// O CSV do Jira traz o ID da conta (ex.: 712020:9f…) no lugar do nome do autor do comentário.
const isAccountId = (s: string) => /^(\d+:)?[0-9a-f-]{20,}$/i.test(s);

/**
 * POST /api/admin/import/jira  (multipart: file, apply=true|false, visible=true|false)
 * Sem apply=true devolve só a prévia. Reimportar o mesmo CSV atualiza em vez de duplicar (chave KAN-n).
 */
importRouter.post('/import/jira', csvUpload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Envie o arquivo CSV exportado do Jira');
  const opts = z
    .object({ apply: z.enum(['true', 'false']).default('false'), visible: z.enum(['true', 'false']).default('true') })
    .parse(req.body ?? {});

  let parsed: JiraParseResult;
  try {
    parsed = parseJiraExport(req.file.buffer.toString('utf8'));
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : 'Não foi possível ler o arquivo');
  }
  if (!parsed.projects.length) throw new HttpError(400, 'Nenhum item encontrado no arquivo');

  const keys = parsed.projects.map((p) => p.key);
  const existing = await db.select({ key: tasks.externalKey }).from(tasks).where(inArray(tasks.externalKey, keys));
  const existingKeys = new Set(existing.map((e) => e.key));

  const preview = {
    projects: parsed.projects.map((p) => {
      const subs = parsed.subtasks.filter((s) => s.parentKey === p.key);
      return {
        key: p.key,
        title: p.title,
        status: p.status,
        rawStatus: p.rawStatus,
        priority: p.priority,
        responsibleName: p.responsibleName,
        category: p.category,
        dueDate: p.dueDate,
        subtasks: subs.length,
        subtasksDone: subs.filter((s) => s.status === 'concluido').length,
        comments: p.comments.length,
        exists: existingKeys.has(p.key),
      };
    }),
    totals: {
      projects: parsed.projects.length,
      subtasks: parsed.subtasks.length,
      comments: parsed.projects.reduce((n, p) => n + p.comments.length, 0),
      new: parsed.projects.filter((p) => !existingKeys.has(p.key)).length,
      updated: parsed.projects.filter((p) => existingKeys.has(p.key)).length,
    },
    byStatus: Object.fromEntries(STATUSES.map((s) => [s, parsed.projects.filter((p) => p.status === s).length])),
    warnings: parsed.warnings,
  };

  if (opts.apply !== 'true') {
    res.json({ applied: false, ...preview });
    return;
  }
  const result = await applyImport(parsed, { visible: opts.visible === 'true', user: req.user! });
  res.json({ applied: true, ...preview, result });
});

async function applyImport(parsed: JiraParseResult, opts: { visible: boolean; user: SessionUser }) {
  const today = todayLocal();
  const result = { created: 0, updated: 0, subtasksCreated: 0, subtasksUpdated: 0, comments: 0 };

  await db.transaction(async (tx) => {
    // Próxima posição livre em cada coluna (novos itens entram no fim, na ordem do Jira).
    const maxRows = await tx
      .select({ status: tasks.status, max: sql<number>`coalesce(max(${tasks.position}), 0)` })
      .from(tasks)
      .groupBy(tasks.status);
    const nextPos = new Map<string, number>(maxRows.map((r) => [r.status, Number(r.max)]));
    const takePos = (status: Status) => {
      const p = (nextPos.get(status) ?? 0) + 1024;
      nextPos.set(status, p);
      return p;
    };
    const log = (taskId: string, message: string) =>
      tx.insert(activities).values({ taskId, type: 'import', message, userId: opts.user.id, userName: opts.user.name });

    const idByKey = new Map<string, string>();

    for (const p of parsed.projects) {
      const [cur] = await tx.select().from(tasks).where(eq(tasks.externalKey, p.key));
      const completedAt = p.status === 'concluido' ? (p.completedAt ?? cur?.completedAt ?? today) : null;
      if (cur) {
        // Atualiza com o que veio do Jira sem apagar o que o painel já tinha preenchido.
        await tx
          .update(tasks)
          .set({
            title: p.title,
            description: p.description || cur.description,
            status: p.status,
            priority: p.priority,
            category: p.category || cur.category,
            responsibleName: p.responsibleName || cur.responsibleName,
            startDate: p.startDate ?? cur.startDate,
            dueDate: p.dueDate ?? cur.dueDate,
            completedAt,
            position: p.status !== cur.status ? takePos(p.status) : cur.position,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, cur.id));
        await log(cur.id, `atualizou a partir do Jira (${p.key})`);
        idByKey.set(p.key, cur.id);
        result.updated++;
      } else {
        const createdAt = p.createdAt ? new Date(p.createdAt) : new Date();
        const [row] = await tx
          .insert(tasks)
          .values({
            title: p.title,
            description: p.description,
            status: p.status,
            priority: p.priority,
            category: p.category,
            responsibleName: p.responsibleName,
            startDate: p.startDate,
            dueDate: p.dueDate,
            completedAt,
            position: takePos(p.status),
            isPublic: opts.visible,
            externalKey: p.key,
            createdById: opts.user.id,
            createdAt,
            updatedAt: new Date(),
          })
          .returning({ id: tasks.id });
        await log(row.id, `importou do Jira (${p.key})`);
        idByKey.set(p.key, row.id);
        result.created++;
      }

      for (const [i, c] of p.comments.entries()) {
        const inserted = await tx
          .insert(comments)
          .values({
            taskId: idByKey.get(p.key)!,
            body: c.body,
            authorName: c.author && !isAccountId(c.author) ? c.author : 'Jira (importado)',
            externalKey: `${p.key}#c${i + 1}`,
            createdAt: c.date ? new Date(c.date) : new Date(),
          })
          .onConflictDoNothing({ target: comments.externalKey })
          .returning({ id: comments.id });
        result.comments += inserted.length;
      }
    }

    // Subtarefas, na ordem do Jira, ao fim do checklist de cada projeto.
    const subPos = new Map<string, number>();
    for (const s of parsed.subtasks) {
      const taskId = idByKey.get(s.parentKey!);
      if (!taskId) continue;
      if (!subPos.has(taskId)) {
        const [{ max }] = await tx
          .select({ max: sql<number>`coalesce(max(${subtasks.position}), 0)` })
          .from(subtasks)
          .where(eq(subtasks.taskId, taskId));
        subPos.set(taskId, Number(max));
      }
      const done = s.status === 'concluido';
      const [cur] = await tx.select().from(subtasks).where(eq(subtasks.externalKey, s.key));
      const fields = {
        title: s.title,
        done,
        completedAt: done ? (s.completedAt ?? cur?.completedAt ?? today) : null,
        dueDate: s.dueDate ?? cur?.dueDate ?? null,
        updatedAt: new Date(),
      };
      if (cur) {
        await tx
          .update(subtasks)
          .set({ ...fields, taskId, description: s.description || cur.description, responsibleName: s.responsibleName || cur.responsibleName })
          .where(eq(subtasks.id, cur.id));
        result.subtasksUpdated++;
      } else {
        const position = subPos.get(taskId)! + 1024;
        subPos.set(taskId, position);
        await tx.insert(subtasks).values({
          ...fields,
          taskId,
          description: s.description,
          responsibleName: s.responsibleName,
          position,
          externalKey: s.key,
          createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
        });
        result.subtasksCreated++;
      }
    }
  });

  return result;
}
