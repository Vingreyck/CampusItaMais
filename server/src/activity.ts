import { db } from './db';
import { activities, tasks } from './db/schema';
import { eq } from 'drizzle-orm';
import type { SessionUser } from './auth';

export async function logActivity(entry: {
  taskId: string;
  subtaskId?: string | null;
  type: string;
  message: string;
  user?: SessionUser | null;
}) {
  await db.insert(activities).values({
    taskId: entry.taskId,
    subtaskId: entry.subtaskId ?? null,
    type: entry.type,
    message: entry.message,
    userId: entry.user?.id ?? null,
    userName: entry.user?.name ?? 'Sistema',
  });
}

export async function touchTask(taskId: string) {
  await db.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, taskId));
}
