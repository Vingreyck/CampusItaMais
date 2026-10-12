export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Registro') => new HttpError(404, `${what} não encontrado(a)`);

export const STATUSES = ['ideia', 'a_fazer', 'em_andamento', 'em_analise', 'concluido'] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  ideia: 'Ideias',
  a_fazer: 'A fazer',
  em_andamento: 'Em andamento',
  em_analise: 'Em análise',
  concluido: 'Concluído',
};

export type PublicGroup = 'planejado' | 'andamento' | 'concluido';

export const PUBLIC_GROUP: Record<Status, PublicGroup> = {
  ideia: 'planejado',
  a_fazer: 'planejado',
  em_andamento: 'andamento',
  em_analise: 'andamento',
  concluido: 'concluido',
};

export const statusLabel = (s: string) => STATUS_LABEL[s as Status] ?? s;

export const PRIORITIES = ['mais_alta', 'alta', 'media', 'baixa', 'mais_baixa'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = {
  mais_alta: 'Altíssima',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
  mais_baixa: 'Mínima',
};

/** Data de hoje (YYYY-MM-DD) no fuso de Sergipe. */
export function todayLocal(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Maceio',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDateBR(d: string | null | undefined) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
