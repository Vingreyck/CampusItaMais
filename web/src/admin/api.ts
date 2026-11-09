import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { request } from '@shared/http';
import type { Status } from '@shared/types';
import type { AccessKey, CommentItem, DocumentItem, Impediment, ImpedimentDetail, Me, NotificationItem, Priority, Report, Subtask, TaskDetail, TaskSummary } from './types';

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
    | 'dependency'
    | 'dependencyNote'
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
export type ImpedimentPatch = Partial<
  Pick<Impediment, 'title' | 'description' | 'category' | 'impact' | 'responsibleName' | 'measure' | 'dueDate' | 'status' | 'taskId' | 'actionText'>
>;
export type SubtaskPatch = Partial<Omit<Subtask, 'id' | 'taskId'>>;
type KeyResult = { key: AccessKey; link: string; emailStatus: 'sent' | 'failed' | 'simulated' | null };

export interface AiStatus {
  enabled: boolean;
  provider: string;
  model?: string | null;
  sttModel?: string;
  problem?: string | null;
  usedToday?: number;
  limit?: number;
  maxFileMb?: number;
}

export interface AiItem {
  index: number;
  action: 'create' | 'update';
  code: number | null;
  title: string;
  description: string;
  category: string;
  status: Status | null;
  priority: Priority | null;
  responsibleName: string;
  dueDate: string | null;
  subtasks: string[];
  reason: string;
  current: { title: string; status: Status; priority: Priority; category: string } | null;
  changes: string[];
  newSubtasks: string[];
  noChange: boolean;
}

export interface AiAnalysis {
  source: string;
  chars: number;
  items: AiItem[];
  warnings: string[];
  masked: Record<string, number>;
  maskedTotal: number;
  usedToday: number;
  limit: number;
}

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

  aiStatus: () => call<AiStatus>('GET', '/ai/status'),
  aiTranscribe: (audio: Blob) => {
    const form = new FormData();
    form.append('audio', audio, `gravacao.${audio.type.includes('mp4') ? 'm4a' : 'webm'}`);
    return call<{ text: string }>('POST', '/ai/transcribe', form);
  },
  aiAnalyze: (text: string, file: File | null) => {
    const form = new FormData();
    form.append('text', text);
    if (file) form.append('file', file);
    return call<AiAnalysis>('POST', '/ai/analyze', form);
  },
  aiApply: (items: AiItem[], visible: boolean) =>
    call<{ created: number; updated: number; subtasksCreated: number; details: { code: number; title: string; action: string }[] }>('POST', '/ai/apply', {
      visible,
      items: items.map((i) => ({
        action: i.action,
        code: i.code,
        title: i.title,
        description: i.description,
        category: i.category,
        status: i.status,
        priority: i.priority,
        responsibleName: i.responsibleName,
        dueDate: i.dueDate,
        subtasks: i.subtasks,
      })),
    }),

  impediments: () => call<Impediment[]>('GET', '/impediments'),
  impediment: (id: string) => call<ImpedimentDetail>('GET', `/impediments/${id}`),
  createImpediment: (data: ImpedimentPatch & { title: string }) => call<ImpedimentDetail>('POST', '/impediments', data),
  updateImpediment: (id: string, data: ImpedimentPatch) => call<ImpedimentDetail>('PATCH', `/impediments/${id}`, data),

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
