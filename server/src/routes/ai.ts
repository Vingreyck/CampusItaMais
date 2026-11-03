import { Router } from 'express';
import multer from 'multer';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { activities, subtasks, tasks } from '../db/schema';
import { env } from '../env';
import { fileToText, MAX_AI_FILE_MB } from '../ai/extract';
import { isAiEnabled, resolveModel, transcribe } from '../ai/groq';
import { maskPii } from '../ai/mask';
import { analyze, computeChanges, MAX_ITEMS, type ExistingTask } from '../ai/plan';
import { consumeUse, usedToday } from '../ai/usage';
import { HttpError, PRIORITIES, STATUSES, todayLocal, type Status } from '../util';

// Montado em /api/admin, atrás do adminApiGate: só quem tem o link-chave chega aqui.
export const aiRouter = Router();

const mem = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AI_FILE_MB * 1024 * 1024, files: 1 } });
const MAX_TEXT = 60_000;

function requireAi() {
  if (!isAiEnabled()) {
    throw new HttpError(503, 'A IA não está ligada. No Railway, cadastre a variável GROQ_API_KEY com a chave gratuita da Groq.');
  }
}

async function loadExisting(): Promise<ExistingTask[]> {
  const [rows, subs] = await Promise.all([
    db.select().from(tasks).orderBy(asc(tasks.code)),
    db.select({ taskId: subtasks.taskId, title: subtasks.title }).from(subtasks),
  ]);
  const byTask = new Map<string, string[]>();
  for (const s of subs) byTask.set(s.taskId, [...(byTask.get(s.taskId) ?? []), s.title]);
  return rows.map((t) => ({
    id: t.id,
    code: t.code,
    title: t.title,
    status: t.status as Status,
    priority: t.priority as ExistingTask['priority'],
    category: t.category,
    description: t.description,
    responsibleName: t.responsibleName,
    dueDate: t.dueDate,
    subtaskTitles: byTask.get(t.id) ?? [],
  }));
}

aiRouter.get('/ai/status', async (_req, res) => {
  if (!isAiEnabled()) {
    res.json({ enabled: false, provider: 'groq' });
    return;
  }
  let model: string | null = null;
  let problem: string | null = null;
  try {
    model = (await resolveModel()).id;
    if (!model) problem = 'Nenhum modelo de conversa disponível na conta da Groq.';
  } catch (err) {
    problem = err instanceof Error ? err.message : 'Não foi possível consultar a Groq.';
  }
  res.json({ enabled: true, provider: 'groq', model, sttModel: env.ai.sttModel, problem, usedToday: await usedToday(), limit: env.ai.dailyLimit, maxFileMb: MAX_AI_FILE_MB });
});

// ---------- Voz → texto ----------

aiRouter.post('/ai/transcribe', mem.single('audio'), async (req, res) => {
  requireAi();
  if (!req.file?.size) throw new HttpError(400, 'Nenhum áudio recebido.');
  if (req.file.size < 1000) throw new HttpError(400, 'O áudio ficou curto demais. Grave de novo.');
  await consumeUse();
  console.log(`[ia] transcrição pedida por ${req.user!.name} (${Math.round(req.file.size / 1024)} KB)`);
  // O áudio não é guardado em lugar nenhum: vai direto para a transcrição e é descartado.
  const text = await transcribe(req.file.buffer, req.file.originalname, req.file.mimetype);
  if (!text) throw new HttpError(422, 'Não consegui entender o áudio. Fale mais perto do microfone e tente de novo.');
  res.json({ text });
});

// ---------- Texto/arquivo → prévia ----------

aiRouter.post('/ai/analyze', mem.single('file'), async (req, res) => {
  requireAi();
  const typed = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  let fileText = '';
  let source = 'texto';
  if (req.file) {
    const r = await fileToText(req.file);
    fileText = r.text;
    source = typed ? `${r.kind} + texto` : r.kind;
  }
  const input = [typed, fileText].filter(Boolean).join('\n\n');
  if (!input) throw new HttpError(400, 'Cole, dite ou envie algum conteúdo para analisar.');
  if (input.length > MAX_TEXT * 4) throw new HttpError(413, 'O conteúdo é grande demais. Divida em partes menores.');

  await consumeUse();
  const masked = maskPii(input);
  console.log(`[ia] análise pedida por ${req.user!.name} (${source}, ${input.length} caracteres, ${masked.total} dado(s) pessoal(is) ocultado(s))`);

  const existing = await loadExisting();
  const result = await analyze(masked.text, existing);
  const byCode = new Map(existing.map((t) => [t.code, t]));

  const items = result.items.map((it, index) => {
    const item = {
      ...it,
      title: masked.restore(it.title),
      description: masked.restore(it.description),
      category: masked.restore(it.category),
      responsibleName: masked.restore(it.responsibleName),
      subtasks: it.subtasks.map(masked.restore),
      reason: masked.restore(it.reason),
    };
    const cur = item.action === 'update' ? byCode.get(item.code!) : undefined;
    const changes = cur ? computeChanges(cur, item) : null;
    return {
      index,
      ...item,
      current: cur ? { title: cur.title, status: cur.status, priority: cur.priority, category: cur.category } : null,
      changes: changes?.summary ?? [],
      newSubtasks: changes ? changes.newSubtasks : item.subtasks,
      noChange: !!changes && changes.summary.length === 0,
    };
  });

  res.json({
    source,
    chars: input.length,
    items,
    warnings: result.warnings,
    masked: masked.counts,
    maskedTotal: masked.total,
    usedToday: await usedToday(),
    limit: env.ai.dailyLimit,
  });
});

// ---------- Prévia confirmada → gravação ----------

const ApplyItem = z.object({
  action: z.enum(['create', 'update']),
  code: z.number().int().positive().nullable().default(null),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(''),
  category: z.string().transform((s) => s.replace(/\s+/g, ' ').trim()).pipe(z.string().max(80)).default(''),
  status: z.enum(STATUSES).nullable().default(null),
  priority: z.enum(PRIORITIES).nullable().default(null),
  responsibleName: z.string().trim().max(120).default(''),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  subtasks: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
});

aiRouter.post('/ai/apply', async (req, res) => {
  const { items, visible } = z.object({ items: z.array(ApplyItem).min(1, 'Nenhum item selecionado').max(MAX_ITEMS), visible: z.boolean().default(true) }).parse(req.body);
  const user = req.user!;
  const today = todayLocal();
  const result = { created: 0, updated: 0, subtasksCreated: 0, details: [] as { code: number; title: string; action: 'create' | 'update' }[] };

  await db.transaction(async (tx) => {
    const maxRows = await tx
      .select({ status: tasks.status, max: sql<number>`coalesce(max(${tasks.position}), 0)` })
      .from(tasks)
      .groupBy(tasks.status);
    const nextPos = new Map<string, number>(maxRows.map((r) => [r.status, Number(r.max)]));
    const takePos = (status: string) => {
      const p = (nextPos.get(status) ?? 0) + 1024;
      nextPos.set(status, p);
      return p;
    };
    const log = (taskId: string, message: string) => tx.insert(activities).values({ taskId, type: 'import', message, userId: user.id, userName: user.name });
    const addSubtasks = async (taskId: string, titles: string[]) => {
      if (!titles.length) return;
      const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${subtasks.position}), 0)` }).from(subtasks).where(eq(subtasks.taskId, taskId));
      await tx.insert(subtasks).values(titles.map((title, i) => ({ taskId, title, position: Number(max) + (i + 1) * 1024 })));
      result.subtasksCreated += titles.length;
    };

    for (const it of items) {
      if (it.action === 'update') {
        const [row] = it.code ? await tx.select().from(tasks).where(eq(tasks.code, it.code)) : [];
        if (!row) throw new HttpError(409, `A ação ITA-${it.code} não existe mais. Analise o conteúdo de novo.`);
        const subs = await tx.select({ title: subtasks.title }).from(subtasks).where(eq(subtasks.taskId, row.id));
        const cur: ExistingTask = {
          id: row.id,
          code: row.code,
          title: row.title,
          status: row.status as Status,
          priority: row.priority as ExistingTask['priority'],
          category: row.category,
          description: row.description,
          responsibleName: row.responsibleName,
          dueDate: row.dueDate,
          subtaskTitles: subs.map((s) => s.title),
        };
        const ch = computeChanges(cur, it);
        const update: Partial<typeof tasks.$inferInsert> = { ...ch.set, updatedAt: new Date() };
        if (ch.set.status) {
          update.position = takePos(ch.set.status);
          if (ch.set.status === 'concluido' && !row.completedAt) update.completedAt = today;
          if (row.status === 'concluido' && ch.set.status !== 'concluido') update.completedAt = null;
        }
        if (Object.keys(ch.set).length) await tx.update(tasks).set(update).where(eq(tasks.id, row.id));
        await addSubtasks(row.id, ch.newSubtasks);
        if (ch.summary.length) await log(row.id, `atualizou com importação por IA — ${ch.summary.join('; ')}`);
        result.updated++;
        result.details.push({ code: row.code, title: row.title, action: 'update' });
      } else {
        const status = it.status ?? 'ideia';
        const [row] = await tx
          .insert(tasks)
          .values({
            title: it.title,
            description: it.description,
            status,
            priority: it.priority ?? 'media',
            category: it.category,
            responsibleName: it.responsibleName,
            dueDate: it.dueDate,
            completedAt: status === 'concluido' ? today : null,
            position: takePos(status),
            isPublic: visible,
            createdById: user.id,
          })
          .returning();
        await addSubtasks(row.id, [...new Set(it.subtasks)]);
        await log(row.id, 'criou com importação por IA');
        result.created++;
        result.details.push({ code: row.code, title: row.title, action: 'create' });
      }
    }
  });

  console.log(`[ia] ${user.name} aplicou: ${result.created} criada(s), ${result.updated} atualizada(s), ${result.subtasksCreated} subtarefa(s)`);
  res.json(result);
});
