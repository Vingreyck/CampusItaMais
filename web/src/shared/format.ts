/** Converte 'YYYY-MM-DD' em Date local (sem o deslocamento de fuso do parse ISO). */
export function parseDay(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}

const dayFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Maceio' });

export const formatDay = (d: string | null | undefined) => (d ? dayFmt.format(parseDay(d)).replace(/ de /g, ' ').replace('.', '') : '');
export const formatDayShort = (d: string | null | undefined) => (d ? shortFmt.format(parseDay(d)) : '');
export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : '');

export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio' }).format(new Date());
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function initials(name: string) {
  const parts = name
    .replace(/[^\p{L}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^\p{Lu}/u.test(p));
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);
