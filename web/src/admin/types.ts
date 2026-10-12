import type { Status } from '@shared/types';

export type Priority = 'mais_alta' | 'alta' | 'media' | 'baixa' | 'mais_baixa';

export interface Me {
  id: string;
  name: string;
  email: string;
  isMaster: boolean;
}

export interface TaskSummary {
  id: string;
  code: number;
  title: string;
  description: string;
  status: Status;
  position: number;
  priority: Priority;
  category: string;
  responsibleName: string;
  responsibleEmail: string;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  isPublic: boolean;
  isDemo: boolean;
  posX: number | null;
  posZ: number | null;
  coverDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
  subtaskTotal: number;
  subtaskDone: number;
  documentCount: number;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  description: string;
  done: boolean;
  responsibleName: string;
  responsibleEmail: string;
  dueDate: string | null;
  completedAt: string | null;
  position: number;
}

export interface DocumentItem {
  id: string;
  taskId: string;
  name: string;
  mimeType: string;
  size: number;
  isPublic: boolean;
  isImage: boolean;
  url: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  subtaskId: string | null;
  email: string;
  status: 'sent' | 'failed' | 'simulated';
  error: string | null;
  createdAt: string;
  sentByName: string | null;
}

export interface CommentItem {
  id: string;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  type: string;
  message: string;
  userName: string;
  createdAt: string;
}

export interface TaskDetail extends TaskSummary {
  createdByName: string | null;
  subtasks: Subtask[];
  documents: DocumentItem[];
  notifications: NotificationItem[];
  comments: CommentItem[];
  activities: Activity[];
}

export interface AccessKey {
  id: string;
  name: string;
  email: string;
  isMaster: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export type TaskWithSubtasks = TaskSummary & { subtasks: Subtask[] };

export interface Report {
  from: string;
  to: string;
  generatedAt: string;
  generatedBy: string;
  summary: {
    completedTasks: number;
    completedSubtasks: number;
    createdTasks: number;
    inProgress: number;
    planned: number;
    activities: number;
    totalTasks: number;
  };
  statusCounts: Record<Status, number>;
  completedTasks: TaskWithSubtasks[];
  completedSubtasks: (Subtask & { taskTitle: string; taskCode: number })[];
  createdTasks: TaskWithSubtasks[];
  inProgress: TaskWithSubtasks[];
  planned: TaskWithSubtasks[];
  activities: (Activity & { taskId: string; taskTitle: string; taskCode: number })[];
}
