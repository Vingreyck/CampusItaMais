import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { appMeta } from '../db/schema';
import { env } from '../env';
import { HttpError, todayLocal } from '../util';

const key = () => `ai_usage:${todayLocal()}`;

export async function usedToday(): Promise<number> {
  const [row] = await db.select().from(appMeta).where(eq(appMeta.key, key()));
  return row ? Number(row.value) || 0 : 0;
}

/** Conta um uso de IA no dia (teto diário para o custo/limite gratuito não estourar). */
export async function consumeUse(): Promise<number> {
  const limit = env.ai.dailyLimit;
  if ((await usedToday()) >= limit) {
    throw new HttpError(429, `O limite diário de ${limit} usos da IA foi atingido. Ele zera amanhã (ou aumente AI_DAILY_LIMIT no Railway).`);
  }
  const [row] = await db
    .insert(appMeta)
    .values({ key: key(), value: '1' })
    .onConflictDoUpdate({ target: appMeta.key, set: { value: sql`(${appMeta.value}::int + 1)::text` } })
    .returning({ value: appMeta.value });
  return Number(row.value);
}
