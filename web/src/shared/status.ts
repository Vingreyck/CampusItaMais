import type { PublicGroup, Status } from './types';

/** As 5 colunas do quadro e a cor (grupo) com que cada uma aparece no site. */
export const STATUSES: { key: Status; label: string; group: PublicGroup }[] = [
  { key: 'ideia', label: 'Ideias', group: 'planejado' },
  { key: 'a_fazer', label: 'A fazer', group: 'planejado' },
  { key: 'em_andamento', label: 'Em andamento', group: 'andamento' },
  { key: 'em_analise', label: 'Em análise', group: 'andamento' },
  { key: 'concluido', label: 'Concluído', group: 'concluido' },
];

export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.key, s.label])) as Record<Status, string>;

export const GROUPS: Record<PublicGroup, { label: string; singular: string; color: string; ink: string; soft: string }> = {
  planejado: { label: 'Ideias e planejamento', singular: 'Planejado', color: '#ef4444', ink: '#b91c1c', soft: '#fee2e2' },
  andamento: { label: 'Em andamento', singular: 'Em andamento', color: '#f5b301', ink: '#a16207', soft: '#fef3c7' },
  concluido: { label: 'Concluídos', singular: 'Concluído', color: '#22c55e', ink: '#15803d', soft: '#dcfce7' },
};

export const GROUP_ORDER: PublicGroup[] = ['planejado', 'andamento', 'concluido'];

export const groupOf = (s: Status): PublicGroup => STATUSES.find((x) => x.key === s)?.group ?? 'planejado';
export const groupColor = (s: Status) => GROUPS[groupOf(s)].color;
