/**
 * Leitura do CSV exportado pelo Jira ("Exportar CSV (todos os campos)").
 * Aceita cabeçalhos em português ou inglês, colunas repetidas (Comentário, Rótulos…)
 * e os formatos de data do Jira (18/out/26 2:30 PM, 2026-10-18, 18/10/2026…).
 */
import type { Priority, Status } from './util';

export interface JiraComment {
  date: string | null;
  author: string;
  body: string;
}

export interface JiraIssue {
  key: string;
  id: string;
  title: string;
  type: string;
  description: string;
  status: Status;
  rawStatus: string;
  priority: Priority;
  responsibleName: string;
  createdAt: string | null; // ISO
  startDate: string | null; // YYYY-MM-DD
  dueDate: string | null;
  completedAt: string | null;
  category: string;
  rank: string;
  comments: JiraComment[];
  parentRef: string; // id ou chave do pai (subtarefas)
  isSubtask: boolean;
}

export interface JiraParseResult {
  projects: JiraIssue[];
  subtasks: (JiraIssue & { parentKey: string | null })[];
  warnings: string[];
}

// ---------------------------------------------------------------- CSV

/** CSV RFC 4180: aspas, aspas escapadas, quebras de linha dentro de campos e BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.indexOf('\n') === -1 ? undefined : src.indexOf('\n'));
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

// ---------------------------------------------------------------- normalização

export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^custom field \((.*)\)$/, '$1')
    .replace(/^campo personalizado \((.*)\)$/, '$1')
    .replace(/[\s_]+/g, ' ')
    .trim();

const ALIASES = {
  key: ['issue key', 'chave do item', 'chave da item', 'chave da issue', 'chave do ticket', 'chave da tarefa', 'chave', 'key'],
  id: ['issue id', 'id do item', 'id da item', 'id da issue', 'id do ticket', 'id'],
  summary: ['summary', 'resumo', 'titulo'],
  type: ['issue type', 'tipo de item', 'tipo do item', 'tipo de issue', 'tipo de ticket', 'tipo da tarefa', 'tipo'],
  status: ['status', 'situacao', 'estado'],
  statusCategory: ['status category', 'categoria de status', 'categoria do status'],
  priority: ['priority', 'prioridade'],
  assignee: ['assignee', 'responsavel', 'atribuido a', 'atribuido', 'pessoa responsavel'],
  created: ['created', 'criado', 'criado em', 'data de criacao'],
  updated: ['updated', 'atualizado', 'atualizado em'],
  resolved: ['resolved', 'resolvido', 'resolvido em', 'data de resolucao'],
  statusChanged: ['status category changed', 'categoria de status alterada', 'categoria do status alterada'],
  due: ['due date', 'data limite', 'data de vencimento', 'data de entrega', 'vencimento', 'prazo'],
  start: ['start date', 'data de inicio', 'data inicial', 'inicio'],
  description: ['description', 'descricao'],
  labels: ['labels', 'rotulos', 'etiquetas'],
  components: ['component/s', 'components', 'componentes', 'componente/s'],
  parent: ['parent', 'pai', 'parent id', 'id do pai', 'id pai', 'id do item pai', 'item pai'],
  parentKey: ['parent key', 'chave do pai', 'chave pai', 'chave do item pai'],
  parentSummary: ['parent summary', 'resumo do pai', 'resumo pai', 'resumo do item pai'],
  comment: ['comment', 'comentario', 'comentarios', 'comment body'],
  project: ['project name', 'nome do projeto', 'nome do espaco', 'projeto', 'espaco'],
  rank: ['rank', 'classificacao', 'ordem'],
} satisfies Record<string, string[]>;

type Field = keyof typeof ALIASES;

function buildIndex(header: string[]) {
  const normalized = header.map(norm);
  const index = {} as Record<Field, number[]>;
  for (const field of Object.keys(ALIASES) as Field[]) {
    // Primeiro alias que existir no arquivo ganha (a ordem dos aliases define a preferência).
    let cols: number[] = [];
    for (const alias of ALIASES[field]) {
      cols = normalized.flatMap((h, i) => (h === alias ? [i] : []));
      if (cols.length) break;
    }
    index[field] = cols;
  }
  return index;
}

// ---------------------------------------------------------------- mapeamentos

export function mapStatus(raw: string, category = ''): Status {
  const s = norm(raw);
  if (/^(ideia|ideias|backlog|proposta|propostas)$/.test(s)) return 'ideia';
  if (/^(a fazer|to do|todo|tarefas pendentes|pendente|aberto|open|selecionado para desenvolvimento|planejado)$/.test(s)) return 'a_fazer';
  if (/^(em andamento|in progress|fazendo|em execucao|em progresso|doing)$/.test(s)) return 'em_andamento';
  if (/^(em analise|em revisao|in review|review|revisao|em validacao|em aprovacao|aguardando)$/.test(s)) return 'em_analise';
  if (/^(concluido|concluida|concluidos|done|feito|finalizado|resolvido|fechado|closed|completo|entregue)$/.test(s)) return 'concluido';
  const c = norm(category);
  if (/done|conclu|itens concluidos/.test(c)) return 'concluido';
  if (/progress|andamento/.test(c)) return 'em_andamento';
  return 'a_fazer';
}

export function mapPriority(raw: string): Priority {
  const p = norm(raw);
  if (/highest|mais alta|altissima|critica|critical|blocker|bloqueador|urgente/.test(p)) return 'mais_alta';
  if (/lowest|mais baixa|minima|trivial/.test(p)) return 'mais_baixa';
  if (/high|alta|major/.test(p)) return 'alta';
  if (/low|baixa|minor/.test(p)) return 'baixa';
  return 'media';
}

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7,
  ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Converte os formatos de data do Jira em { day: 'YYYY-MM-DD', iso: timestamp }. */
export function parseJiraDate(raw: string): { day: string; iso: string } | null {
  const v = raw.trim();
  if (!v) return null;
  let y: number, m: number, d: number;
  let hh = 12;
  let mm = 0;

  let match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(v);
  if (match) {
    [y, m, d] = [+match[1], +match[2], +match[3]];
    if (match[4]) [hh, mm] = [+match[4], +match[5]];
  } else if ((match = /^(\d{1,2})[/\-. ](?:de )?([a-zç]{3})[a-zç]*\.?[/\-. ](?:de )?(\d{2,4})(?:,?\s+(\d{1,2}):(\d{2})\s*([ap]\.?\s?m\.?)?)?/i.exec(norm(v)))) {
    const month = MONTHS[match[2].slice(0, 3)];
    if (!month) return null;
    [d, m, y] = [+match[1], month, +match[3]];
    if (match[4]) {
      hh = +match[4] % 12;
      mm = +match[5];
      if (match[6] && /p/i.test(match[6])) hh += 12;
      if (!match[6]) hh = +match[4];
    }
  } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(v))) {
    [d, m, y] = [+match[1], +match[2], +match[3]];
    if (match[4]) [hh, mm] = [+match[4], +match[5]];
  } else return null;

  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const day = `${y}-${pad(m)}-${pad(d)}`;
  return { day, iso: new Date(`${day}T${pad(hh)}:${pad(mm)}:00-03:00`).toISOString() };
}

/** Remove a marcação wiki do Jira, deixando texto legível no site. */
export function cleanJiraText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\{(?:noformat|code(?::[^}]*)?|quote|panel(?::[^}]*)?)\}/g, '')
    .replace(/\{color(?::[^}]*)?\}/g, '')
    .replace(/!(?:[^!\n|]+)(?:\|[^!\n]*)?!/g, '') // imagens embutidas
    .replace(/\[([^|\]\n]+)\|([^\]\n]+)\]/g, '$1 ($2)') // [texto|link]
    .replace(/\[~accountid:[^\]]+\]/g, '')
    .replace(/^h[1-6]\.\s*/gm, '')
    .replace(/^bq\.\s*/gm, '')
    .replace(/^\s*[#*]+\s+/gm, '• ')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1$2')
    .replace(/\{\{([^}]+)\}\}/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const SUBTASK_TYPE = /subtarefa|sub-tarefa|sub-task|subtask/;

/** Rótulos do Jira costumam vir em minúsculas ("infraestrutura"). */
const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);

// ---------------------------------------------------------------- leitura principal

export function parseJiraExport(text: string): JiraParseResult {
  const rows = parseCsv(text);
  const warnings: string[] = [];
  if (rows.length < 2) throw new Error('O arquivo está vazio ou não é um CSV exportado do Jira.');
  const [header, ...data] = rows;
  const idx = buildIndex(header);
  if (!idx.summary.length || (!idx.key.length && !idx.id.length)) {
    throw new Error('Não encontrei as colunas "Resumo" e "Chave" — exporte pelo Jira em "Exportar CSV (todos os campos)".');
  }
  if (!idx.status.length) warnings.push('O arquivo não tem a coluna "Status": tudo entrará em "A fazer".');

  const get = (row: string[], f: Field) => (idx[f].length ? (row[idx[f][0]] ?? '').trim() : '');
  const all = (row: string[], f: Field) => idx[f].map((i) => (row[i] ?? '').trim()).filter(Boolean);

  const issues: JiraIssue[] = data.map((row, n) => {
    const rawStatus = get(row, 'status');
    const status = mapStatus(rawStatus, get(row, 'statusCategory'));
    const resolved = parseJiraDate(get(row, 'resolved')) ?? (status === 'concluido' ? parseJiraDate(get(row, 'statusChanged')) ?? parseJiraDate(get(row, 'updated')) : null);
    const labels = [...all(row, 'components'), ...all(row, 'labels')];
    const comments = all(row, 'comment').map((c): JiraComment => {
      // Formato do Jira: "data;autor;texto" (o texto pode conter ponto e vírgula)
      const parts = c.split(';');
      const date = parts.length >= 3 ? parseJiraDate(parts[0]) : null;
      if (date) return { date: date.iso, author: parts[1].trim(), body: cleanJiraText(parts.slice(2).join(';')) };
      return { date: null, author: '', body: cleanJiraText(c) };
    });
    const type = get(row, 'type');
    return {
      key: get(row, 'key') || `JIRA-${get(row, 'id') || n + 1}`,
      id: get(row, 'id'),
      title: get(row, 'summary').slice(0, 200),
      type,
      description: cleanJiraText(get(row, 'description')),
      status,
      rawStatus,
      priority: mapPriority(get(row, 'priority')),
      responsibleName: get(row, 'assignee').slice(0, 120),
      createdAt: parseJiraDate(get(row, 'created'))?.iso ?? null,
      startDate: parseJiraDate(get(row, 'start'))?.day ?? null,
      dueDate: parseJiraDate(get(row, 'due'))?.day ?? null,
      completedAt: status === 'concluido' ? (resolved?.day ?? null) : null,
      category: capitalize((labels[0] ?? get(row, 'project')).replace(/[-_]+/g, ' ')).slice(0, 80),
      rank: get(row, 'rank'),
      comments: comments.filter((c) => c.body),
      parentRef: get(row, 'parentKey') || get(row, 'parent'),
      isSubtask: SUBTASK_TYPE.test(norm(type)),
    };
  });

  const byId = new Map(issues.filter((i) => i.id).map((i) => [i.id, i]));
  const byKey = new Map(issues.map((i) => [i.key, i]));
  const projects: JiraIssue[] = [];
  const subtasks: JiraParseResult['subtasks'] = [];

  for (const issue of issues) {
    if (!issue.title) {
      warnings.push(`Linha sem resumo (${issue.key}) foi ignorada.`);
      continue;
    }
    if (!issue.isSubtask) {
      projects.push(issue);
      continue;
    }
    const parent = byId.get(issue.parentRef) ?? byKey.get(issue.parentRef);
    if (!parent || parent.isSubtask) {
      warnings.push(`A subtarefa ${issue.key} (“${issue.title}”) não tem o projeto pai no arquivo e foi ignorada.`);
      continue;
    }
    subtasks.push({ ...issue, parentKey: parent.key });
  }

  // Ordem do quadro: pelo "Rank" do Jira quando existe; senão pela chave.
  const keyNum = (k: string) => Number(/(\d+)$/.exec(k)?.[1] ?? 0);
  const byRank = (a: JiraIssue, b: JiraIssue) => (a.rank && b.rank ? (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0) : keyNum(a.key) - keyNum(b.key));
  projects.sort(byRank);
  subtasks.sort(byRank);
  const epics = projects.filter((p) => /^(epic|epico)$/.test(norm(p.type)));
  if (epics.length) warnings.push(`${epics.length} épico(s) serão importados como projetos.`);

  return { projects, subtasks, warnings };
}
