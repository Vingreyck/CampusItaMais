import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/**
 * Chaves de acesso ao painel (não existe login com senha).
 * Cada pessoa recebe um link-chave pessoal; guardamos só o hash SHA-256 do token.
 * A chave mestra vem da variável ADMIN_ACCESS_KEY e é sincronizada na inicialização.
 */
export const accessKeys = pgTable('access_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().default(''),
  tokenHash: text('token_hash').notNull().unique(),
  isMaster: boolean('is_master').notNull().default(false),
  createdAt: createdAt(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

// Alias para manter as FKs legíveis: "quem fez" = dono da chave de acesso.
const users = accessKeys;

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: serial('code').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    // ideia | a_fazer | em_andamento | em_analise | concluido
    status: text('status').notNull().default('ideia'),
    position: doublePrecision('position').notNull().default(0),
    // mais_alta | alta | media | baixa | mais_baixa (mesma escala do Jira)
    priority: text('priority').notNull().default('media'),
    category: text('category').notNull().default(''),
    responsibleName: text('responsible_name').notNull().default(''),
    responsibleEmail: text('responsible_email').notNull().default(''),
    startDate: date('start_date'),
    dueDate: date('due_date'),
    completedAt: date('completed_at'),
    isPublic: boolean('is_public').notNull().default(true),
    isDemo: boolean('is_demo').notNull().default(false),
    // Posição no campus 3D (coordenadas do mundo, plano XZ)
    posX: doublePrecision('pos_x'),
    posZ: doublePrecision('pos_z'),
    coverDocumentId: uuid('cover_document_id'),
    // Chave de origem quando importado (ex.: KAN-11 do Jira) — permite reimportar sem duplicar.
    externalKey: text('external_key').unique(),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('tasks_status_idx').on(t.status)],
);

export const subtasks = pgTable(
  'subtasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    done: boolean('done').notNull().default(false),
    responsibleName: text('responsible_name').notNull().default(''),
    responsibleEmail: text('responsible_email').notNull().default(''),
    dueDate: date('due_date'),
    completedAt: date('completed_at'),
    position: doublePrecision('position').notNull().default(0),
    externalKey: text('external_key').unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('subtasks_task_idx').on(t.taskId)],
);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    originalName: text('original_name').notNull(),
    storedName: text('stored_name').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    isPublic: boolean('is_public').notNull().default(false),
    uploadedById: uuid('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('documents_task_idx').on(t.taskId)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    subtaskId: uuid('subtask_id').references(() => subtasks.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    // sent | failed | simulated
    status: text('status').notNull(),
    error: text('error'),
    sentById: uuid('sent_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_task_idx').on(t.taskId)],
);

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    subtaskId: uuid('subtask_id'),
    type: text('type').notNull(),
    message: text('message').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    userName: text('user_name').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('activities_task_idx').on(t.taskId), index('activities_created_idx').on(t.createdAt)],
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    authorName: text('author_name').notNull().default(''),
    externalKey: text('external_key').unique(),
    body: text('body').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('comments_task_idx').on(t.taskId)],
);

/** Pares chave/valor internos (ex.: se a demonstração já foi criada uma vez). */
export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type TaskRow = typeof tasks.$inferSelect;
export type SubtaskRow = typeof subtasks.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
