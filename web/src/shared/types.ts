export type Status = 'ideia' | 'a_fazer' | 'em_andamento' | 'em_analise' | 'concluido';
export type PublicGroup = 'planejado' | 'andamento' | 'concluido';

export interface PublicSubtask {
  id: string;
  title: string;
  description: string;
  done: boolean;
  completedAt: string | null;
  responsibleName: string;
}

export interface PublicDocument {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  isImage: boolean;
  url: string;
}

export interface PublicProject {
  id: string;
  code: number;
  title: string;
  description: string;
  status: Status;
  category: string;
  responsibleName: string;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  isDemo: boolean;
  posX: number | null;
  posZ: number | null;
  updatedAt: string;
  coverUrl: string | null;
  subtasks: PublicSubtask[];
  documents: PublicDocument[];
}
