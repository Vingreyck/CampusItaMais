/**
 * Extrai texto simples de arquivos enviados (PDF, Word .docx, Excel .xlsx, CSV, TXT, MD) SEM usar IA.
 * Só o texto resultante (já mascarado) segue para o modelo.
 */
import { strFromU8, unzipSync } from 'fflate';
import { extractText, getDocumentProxy } from 'unpdf';
import { HttpError } from '../util';

export const MAX_AI_FILE_MB = 15;

const xmlText = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

const tidy = (s: string) =>
  s
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

function unzip(buf: Buffer, what: string) {
  try {
    return unzipSync(new Uint8Array(buf));
  } catch {
    throw new HttpError(400, `Não consegui abrir o arquivo ${what}: ele parece corrompido ou protegido por senha.`);
  }
}

export function docxToText(buf: Buffer): string {
  const files = unzip(buf, 'Word');
  const doc = files['word/document.xml'];
  if (!doc) throw new HttpError(400, 'Este arquivo não é um documento Word (.docx) válido.');
  const xml = strFromU8(doc);
  // Percorre o XML em ordem: parágrafos viram linhas; numa tabela, cada linha vira uma só linha com " | " entre as células.
  let out = '';
  let inTable = 0;
  const tokens = /<w:tbl>|<\/w:tbl>|<\/w:tc>|<\/w:tr>|<\/w:p>|<w:tab\/>|<w:br\/>|<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  for (const m of xml.matchAll(tokens)) {
    const tag = m[0];
    if (m[1] !== undefined) out += xmlText(m[1]);
    else if (tag === '<w:tab/>' || tag === '<w:br/>') out += ' ';
    else if (tag === '<w:tbl>') inTable++;
    else if (tag === '</w:tbl>') inTable = Math.max(0, inTable - 1);
    else if (tag === '</w:tc>') out = out.replace(/\s+$/, '') + ' | ';
    else if (tag === '</w:tr>') out = out.replace(/\s*\|\s*$/, '') + '\n';
    else if (tag === '</w:p>') out += inTable ? ' ' : '\n';
  }
  return tidy(out);
}

function colIndex(ref: string) {
  let n = 0;
  for (const ch of ref.replace(/[^A-Z]/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function xlsxToText(buf: Buffer): string {
  const files = unzip(buf, 'Excel');
  if (!files['xl/workbook.xml']) throw new HttpError(400, 'Este arquivo não é uma planilha Excel (.xlsx) válida.');
  const shared = files['xl/sharedStrings.xml']
    ? [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        xmlText([...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
      )
    : [];
  const names = [...strFromU8(files['xl/workbook.xml']).matchAll(/<sheet\s[^>]*name="([^"]*)"/g)].map((m) => xmlText(m[1]));
  const sheetPaths = Object.keys(files)
    .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));

  const out: string[] = [];
  sheetPaths.forEach((path, i) => {
    const rows: string[] = [];
    for (const row of strFromU8(files[path]).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /r="([A-Z]+)\d+"/.exec(c[1])?.[1];
        const inner = c[2] ?? '';
        let value = '';
        if (/t="s"/.test(c[1])) value = shared[Number(/<v>(\d+)<\/v>/.exec(inner)?.[1])] ?? '';
        else if (/t="inlineStr"/.test(c[1])) value = xmlText([...inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
        else value = xmlText(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '');
        if (ref && value.trim()) cells[colIndex(ref)] = value.replace(/\s+/g, ' ').trim();
      }
      if (cells.some(Boolean)) rows.push(Array.from(cells, (v) => v ?? '').join(' | '));
    }
    if (rows.length) out.push(`## ${names[i] ?? `Planilha ${i + 1}`}\n${rows.join('\n')}`);
  });
  return tidy(out.join('\n\n'));
}

export async function pdfToText(buf: Buffer): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return tidy(text);
  } catch {
    throw new HttpError(400, 'Não consegui ler este PDF: ele pode estar protegido por senha ou corrompido.');
  }
}

/** Identifica o tipo pelo nome e pelo conteúdo (assinatura do arquivo), sem confiar só na extensão. */
export async function fileToText(file: { buffer: Buffer; originalname: string; mimetype?: string }): Promise<{ text: string; kind: string }> {
  const name = file.originalname.toLowerCase();
  const head = file.buffer.subarray(0, 4).toString('latin1');
  let kind: string;
  let text: string;

  if (head === '%PDF') {
    kind = 'PDF';
    text = await pdfToText(file.buffer);
  } else if (head.startsWith('PK')) {
    if (name.endsWith('.docx')) {
      kind = 'Word';
      text = docxToText(file.buffer);
    } else if (name.endsWith('.xlsx')) {
      kind = 'Excel';
      text = xlsxToText(file.buffer);
    } else {
      throw new HttpError(400, 'Formato de arquivo não suportado. Use PDF, Word (.docx), Excel (.xlsx), CSV ou texto.');
    }
  } else if (/\.(txt|md|csv|tsv|json)$/.test(name) || file.mimetype?.startsWith('text/')) {
    kind = 'texto';
    text = tidy(file.buffer.toString('utf8').replace(/^﻿/, ''));
  } else if (/\.(doc|xls|ppt|pptx)$/.test(name)) {
    throw new HttpError(400, 'Este formato antigo não é suportado. Salve o arquivo como .docx, .xlsx ou PDF e envie de novo.');
  } else if (/^image\//.test(file.mimetype ?? '') || /\.(png|jpe?g|webp|gif)$/.test(name)) {
    throw new HttpError(400, 'Imagens e PDFs escaneados (só foto, sem texto) ainda não são lidos. Envie um PDF com texto ou copie o texto.');
  } else {
    throw new HttpError(400, 'Formato de arquivo não suportado. Use PDF, Word (.docx), Excel (.xlsx), CSV ou texto.');
  }

  if (!text) {
    throw new HttpError(400, kind === 'PDF' ? 'Este PDF não tem texto (parece escaneado). Copie o texto ou envie outro arquivo.' : 'O arquivo não tem texto.');
  }
  return { text, kind };
}
