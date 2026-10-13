import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { request } from '@shared/http';
import type { Status } from '@shared/types';
import type { AccessKey, CommentItem, DocumentItem, Me, NotificationItem, Priority, Report, Subtask, TaskDetail, TaskSummary } from './types';

// Cabeçalho exigido pelo servidor em toda alteração (proteção contra CSRF).
const ADMIN_HEADERS = { 'X-CIM-Admin': '1' };
const call = <T>(method: string, path: string, body?: unknown) => request<T>(method, `/api/admin${path}`, body, ADMIN_HEADERS);

export type TaskPatch = Partial<
  Pick<
    TaskSummary,
    | 'title'
    | 'description'
    | 'status'
    | 'position'
    | 'priority'
    | 'category'
    | 'responsibleName'
    | 'responsibleEmail'
    | 'startDate'
    | 'dueDate'
    | 'completedAt'
    | 'isPublic'
    | 'posX'
    | 'posZ'
    | 'coverDocumentId'
  >
>;
export type SubtaskPatch = Partial<Omit<Subtask, 'id' | 'taskId'>>;
type KeyResult = { key: AccessKey; link: string; emailStatus: 'sent' | 'failed' | 'simulated' | null };

export interface JiraImport {
  applied: boolean;
  projects: {
    key: string;
    title: string;
    status: Status;
    rawStatus: string;
    priority: Priority;
    responsibleName: string;
    category: string;
    dueDate: string | null;
    subtasks: number;
    subtasksDone: number;
    comments: number;
    exists: boolean;
  }[];
  totals: { projects: number; subtasks: number; comments: number; new: number; updated: number };
  byStatus: Record<Status, number>;
  warnings: string[];
  result?: { created: number; updated: number; subtasksCreated: number; subtasksUpdated: number; comments: number };
}

export const api = {
  me: () => call<Me>('GET', '/me'),
  logout: () => call('POST', '/sair'),

  tasks: () => call<TaskSummary[]>('GET', '/tasks'),
  task: (id: string) => call<TaskDetail>('GET', `/tasks/${id}`),
  createTask: (data: TaskPatch & { title: string }) => call<TaskDetail>('POST', '/tasks', data),
  updateTask: (id: string, data: TaskPatch) => call<TaskDetail>('PATCH', `/tasks/${id}`, data),
  deleteTask: (id: string) => call('DELETE', `/tasks/${id}`),
  removeDemo: () => call<{ removed: number }>('DELETE', '/demo'),

  createSubtask: (taskId: string, data: SubtaskPatch & { title: string }) => call<Subtask>('POST', `/tasks/${taskId}/subtasks`, data),
  updateSubtask: (id: string, data: SubtaskPatch) => call<Subtask>('PATCH', `/subtasks/${id}`, data),
  deleteSubtask: (id: string) => call('DELETE', `/subtasks/${id}`),

  addComment: (taskId: string, body: string) => call<CommentItem>('POST', `/tasks/${taskId}/comments`, { body }),
  editComment: (id: string, body: string) => call<CommentItem>('PATCH', `/comments/${id}`, { body }),
  deleteComment: (id: string) => call('DELETE', `/comments/${id}`),

  uploadDocuments: (taskId: string, files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    return call<DocumentItem[]>('POST', `/tasks/${taskId}/documents`, form);
  },
  updateDocument: (id: string, data: { isPublic: boolean }) => call<DocumentItem>('PATCH', `/documents/${id}`, data),
  deleteDocument: (id: string) => call('DELETE', `/documents/${id}`),

  notify: (taskId: string, email: string, subtaskId?: string) =>
    call<NotificationItem>('POST', `/tasks/${taskId}/notify`, { email, subtaskId }),

  report: (from: string, to: string) => call<Report>('GET', `/reports?from=${from}&to=${to}`),

  importJira: (file: File, apply: boolean, visible: boolean) => {
    const form = new FormData();
    form.append('file', file);
    form.append('apply', String(apply));
    form.append('visible', String(visible));
    return call<JiraImport>('POST', '/import/jira', form);
  },

  keys: () => call<AccessKey[]>('GET', '/acessos'),
  createKey: (data: { name: string; email: string; sendEmail: boolean }) => call<KeyResult>('POST', '/acessos', data),
  regenerateKey: (id: string, sendEmail: boolean) => call<KeyResult>('POST', `/acessos/${id}/regenerar`, { sendEmail }),
  revokeKey: (id: string) => call<AccessKey>('POST', `/acessos/${id}/revogar`, {}),
};

/** Atualiza a tarefa e sincroniza os caches do quadro e do detalhe. */
export function useTaskPatch(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TaskPatch) => api.updateTask(taskId, data),
    onSuccess: (detail) => {
      qc.setQueryData(['task', taskId], detail);
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Recarrega o detalhe e o quadro depois de mexer em subtarefas, documentos, e-mails… */
export function useRefreshTask(taskId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['task', taskId] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
  };
}
