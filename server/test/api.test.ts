/**
 * Testes de integração da API: sobem o servidor real (Express + PGlite em pasta temporária)
 * e exercitam tudo o que foi combinado — painel protegido, quadro, subtarefas, documentos,
 * e-mail com Enter, mapa, relatório, site público e acessos.
 *
 *   npm test -w server
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cim-test-'));
const MASTER_KEY = 'chave-mestra-de-teste-'.padEnd(48, 'x');
Object.assign(process.env, {
  CIM_SKIP_DOTENV: '1',
  NODE_ENV: 'test',
  DATA_DIR: dataDir,
  DATABASE_URL: '',
  JWT_SECRET: 'segredo-de-teste-'.padEnd(64, 'y'),
  ADMIN_ACCESS_KEY: MASTER_KEY,
  ADMIN_NAME: 'Direção (teste)',
  SEED_DEMO: 'false',
  PUBLIC_URL: 'https://campus.teste',
  RESEND_API_KEY: '',
  BREVO_API_KEY: '',
  SMTP_HOST: '',
});
delete process.env.RAILWAY_ENVIRONMENT;
delete process.env.RAILWAY_PUBLIC_DOMAIN;

// Módulos carregados depois de configurar o ambiente.
const { initDb } = await import('../src/db');
const { ensureMasterKey, seedDemo } = await import('../src/seed');
const { createApp } = await import('../src/app');
const { env } = await import('../src/env');
const { todayLocal } = await import('../src/util');

let server: Server;
let base = '';

/** Cliente HTTP mínimo que guarda o cookie de sessão, como um navegador. */
class Browser {
  cookies = new Map<string, string>();
  lastSetCookie: string[] = [];

  async req(method: string, url: string, body?: unknown, opts: { admin?: boolean; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { ...opts.headers };
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (opts.admin !== false && method !== 'GET') headers['X-CIM-Admin'] = '1';
    let payload: FormData | string | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(base + url, { method, headers, body: payload, redirect: 'manual' });
    this.lastSetCookie = res.headers.getSetCookie();
    for (const c of this.lastSetCookie) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (!value || /Expires=Thu, 01 Jan 1970/i.test(c)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* não-JSON */
    }
    return { status: res.status, json, text, headers: res.headers };
  }
  get = (url: string) => this.req('GET', url);
  post = (url: string, body?: unknown, opts?: { admin?: boolean }) => this.req('POST', url, body ?? {}, opts);
  patch = (url: string, body: unknown) => this.req('PATCH', url, body);
  del = (url: string) => this.req('DELETE', url);

  async login(key: string) {
    const r = await this.post('/api/acesso', { key }, { admin: false });
    return r.status;
  }
}

const anon = new Browser();
const admin = new Browser();
const NOT_FOUND = { error: 'Rota não encontrada' };
const tokenOf = (link: string) => link.split('#')[1];

before(async () => {
  await initDb();
  await ensureMasterKey();
  await seedDemo();
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// ------------------------------------------------------------------ demonstração
describe('dados de demonstração', () => {
  test('são criados uma única vez e não voltam depois de removidos', async () => {
    env.seedDemo = true;
    await seedDemo();
    assert.equal(await admin.login(MASTER_KEY), 204);
    const tasks = (await admin.get('/api/admin/tasks')).json;
    assert.equal(tasks.length, 14);
    assert.ok(tasks.every((t: any) => t.isDemo));

    const removed = await admin.del('/api/admin/demo');
    assert.equal(removed.json.removed, 14);
    await seedDemo(); // reinício do servidor com SEED_DEMO=true
    assert.equal((await admin.get('/api/admin/tasks')).json.length, 0);
    env.seedDemo = false;
  });
});

// ------------------------------------------------------------------ proteção do painel
describe('painel protegido (sem login)', () => {
  test('sem sessão, a API do painel responde como rota inexistente', async () => {
    for (const url of ['/api/admin/tasks', '/api/admin/me', '/api/admin/reports?from=2026-01-01&to=2026-12-31', '/api/admin/acessos']) {
      const r = await anon.get(url);
      assert.equal(r.status, 404, url);
      assert.deepEqual(r.json, NOT_FOUND, url);
    }
    assert.deepEqual((await anon.get('/api/qualquer-coisa')).json, NOT_FOUND);
    const write = await anon.post('/api/admin/tasks', { title: 'invasão' });
    assert.equal(write.status, 404);
  });

  test('chave errada ou curta não abre sessão', async () => {
    const b = new Browser();
    assert.equal(await b.login('chave-errada-'.padEnd(43, 'z')), 404);
    assert.equal(await b.login('curta'), 404);
    assert.equal(b.cookies.size, 0);
  });

  test('chave mestra abre sessão com cookie httpOnly/Lax e mostra quem é', async () => {
    const b = new Browser();
    assert.equal(await b.login(MASTER_KEY), 204);
    const cookie = b.lastSetCookie.join(';');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    const me = await b.get('/api/admin/me');
    assert.equal(me.status, 200);
    assert.equal(me.json.name, 'Direção (teste)');
    assert.equal(me.json.isMaster, true);
  });

  test('cookie forjado ou adulterado é recusado', async () => {
    const b = new Browser();
    b.cookies.set('cim_adm', 'eyJhbGciOiJIUzI1NiJ9.eyJraWQiOiJ4Iiwia2giOiJ5In0.assinatura-falsa');
    assert.equal((await b.get('/api/admin/me')).status, 404);
  });

  test('alterações exigem o cabeçalho anti-CSRF', async () => {
    const r = await admin.post('/api/admin/tasks', { title: 'Sem cabeçalho' }, { admin: false });
    assert.equal(r.status, 404);
    assert.deepEqual(r.json, NOT_FOUND);
  });

  test('cabeçalhos de segurança presentes', async () => {
    const r = await anon.get('/api/health');
    assert.ok(r.headers.get('content-security-policy')?.includes("script-src 'self'"));
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(r.headers.get('x-frame-options'));
    assert.equal(r.headers.get('x-powered-by'), null);
  });

  test('página /acesso não carrega script externo e não vaza referer', async () => {
    const r = await anon.get('/acesso');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-security-policy') ?? '', /default-src 'none'; script-src 'sha256-/);
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });
});

// ------------------------------------------------------------------ quadro (Jira)
let taskId = '';
let taskCode = 0;

describe('quadro de projetos', () => {
  test('cria projeto em "Ideias" com chave ITA-n, prioridade média e histórico', async () => {
    const r = await admin.post('/api/admin/tasks', { title: '  Reforma da Biblioteca  ' });
    assert.equal(r.status, 201);
    assert.equal(r.json.title, 'Reforma da Biblioteca');
    assert.equal(r.json.status, 'ideia');
    assert.equal(r.json.priority, 'media');
    assert.equal(r.json.isPublic, true);
    assert.ok(r.json.code > 0);
    assert.equal(r.json.createdByName, 'Direção (teste)');
    assert.match(r.json.activities[0].message, /criou o projeto/);
    taskId = r.json.id;
    taskCode = r.json.code;
  });

  test('abre pelo ID ou pela chave ITA-n', async () => {
    assert.equal((await admin.get(`/api/admin/tasks/${taskId}`)).json.id, taskId);
    assert.equal((await admin.get(`/api/admin/tasks/ITA-${taskCode}`)).json.id, taskId);
    assert.equal((await admin.get('/api/admin/tasks/ITA-99999')).status, 404);
    assert.equal((await admin.get('/api/admin/tasks/nao-e-uuid')).status, 404);
  });

  test('valida os campos (título vazio, e-mail, status e prioridade inválidos)', async () => {
    for (const body of [{ title: '   ' }, { responsibleEmail: 'nao-e-email' }, { status: 'feito' }, { priority: 'urgente' }, { dueDate: '31/12/2026' }]) {
      const r = await admin.patch(`/api/admin/tasks/${taskId}`, body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.ok(r.json.error);
    }
  });

  test('salva os campos da ficha e normaliza e-mail', async () => {
    const r = await admin.patch(`/api/admin/tasks/${taskId}`, {
      description: 'Ampliação do salão de leitura.',
      category: 'Infraestrutura',
      priority: 'alta',
      responsibleName: 'Maria Souza',
      responsibleEmail: '  Maria@UFS.br ',
      dueDate: '2026-12-15',
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.responsibleEmail, 'maria@ufs.br');
    assert.equal(r.json.priority, 'alta');
    const msgs = r.json.activities.map((a: any) => a.message).join(' | ');
    for (const expected of ['editou a descrição', 'prioridade de Média para Alta', 'categoria “Infraestrutura”', 'Maria Souza como responsável', 'previsão de término para 15/12/2026']) {
      assert.ok(msgs.includes(expected), `histórico sem: ${expected}`);
    }
  });

  test('mover para "Em andamento" preenche o início; "Concluído" preenche a conclusão; voltar limpa', async () => {
    let r = await admin.patch(`/api/admin/tasks/${taskId}`, { status: 'em_andamento' });
    assert.equal(r.json.startDate, todayLocal());
    r = await admin.patch(`/api/admin/tasks/${taskId}`, { status: 'em_analise' });
    assert.equal(r.json.status, 'em_analise');
    r = await admin.patch(`/api/admin/tasks/${taskId}`, { status: 'concluido' });
    assert.equal(r.json.completedAt, todayLocal());
    r = await admin.patch(`/api/admin/tasks/${taskId}`, { status: 'em_andamento' });
    assert.equal(r.json.completedAt, null);
    assert.ok(r.json.activities.some((a: any) => /moveu de “Concluído” para “Em andamento”/.test(a.message)));
  });

  test('criação rápida direto numa coluna', async () => {
    const r = await admin.post('/api/admin/tasks', { title: 'Já concluído', status: 'concluido' });
    assert.equal(r.json.completedAt, todayLocal());
    const r2 = await admin.post('/api/admin/tasks', { title: 'Começando', status: 'em_andamento' });
    assert.equal(r2.json.startDate, todayLocal());
  });

  test('reordenar por arraste renumera a coluna quando os cartões ficam colados', async () => {
    const a = (await admin.post('/api/admin/tasks', { title: 'A', status: 'a_fazer' })).json;
    const b = (await admin.post('/api/admin/tasks', { title: 'B', status: 'a_fazer' })).json;
    const c = (await admin.post('/api/admin/tasks', { title: 'C', status: 'a_fazer' })).json;
    // Joga "C" entre A e B repetidamente até o espaço acabar.
    let lo = a.position;
    let hi = b.position;
    for (let i = 0; i < 25; i++) {
      const mid = (lo + hi) / 2;
      await admin.patch(`/api/admin/tasks/${c.id}`, { position: mid });
      hi = mid;
    }
    const col = (await admin.get('/api/admin/tasks')).json.filter((t: any) => t.status === 'a_fazer').sort((x: any, y: any) => x.position - y.position);
    assert.deepEqual(col.map((t: any) => t.title), ['A', 'C', 'B']);
    for (let i = 1; i < col.length; i++) assert.ok(col[i].position - col[i - 1].position >= 1, 'coluna foi renumerada');
  });
});

// ------------------------------------------------------------------ subtarefas
describe('subtarefas (checklist)', () => {
  let subId = '';
  test('adiciona subtarefa com responsável e prazo', async () => {
    const r = await admin.post(`/api/admin/tasks/${taskId}/subtasks`, { title: 'Projeto arquitetônico', responsibleName: 'Engenharia', dueDate: '2026-11-01' });
    assert.equal(r.status, 201);
    assert.equal(r.json.done, false);
    subId = r.json.id;
    await admin.post(`/api/admin/tasks/${taskId}/subtasks`, { title: 'Licitação' });
  });

  test('marcar como feita grava a data de hoje; desmarcar limpa', async () => {
    let r = await admin.patch(`/api/admin/subtasks/${subId}`, { done: true });
    assert.equal(r.json.completedAt, todayLocal());
    r = await admin.patch(`/api/admin/subtasks/${subId}`, { done: false });
    assert.equal(r.json.completedAt, null);
  });

  test('pode informar a data em que foi feita', async () => {
    const r = await admin.patch(`/api/admin/subtasks/${subId}`, { done: true, completedAt: '2026-03-10' });
    assert.equal(r.json.completedAt, '2026-03-10');
    const sem = await admin.post(`/api/admin/tasks/${taskId}/subtasks`, { title: 'Pendente' });
    const r2 = await admin.patch(`/api/admin/subtasks/${sem.json.id}`, { completedAt: '2026-03-10' });
    assert.equal(r2.json.completedAt, null, 'subtarefa pendente não guarda data de conclusão');
  });

  test('progresso aparece no quadro e a ordem pode ser alterada', async () => {
    const detail = (await admin.get(`/api/admin/tasks/${taskId}`)).json;
    assert.equal(detail.subtaskTotal, 3);
    assert.equal(detail.subtaskDone, 1);
    const last = detail.subtasks[2];
    await admin.patch(`/api/admin/subtasks/${last.id}`, { position: detail.subtasks[0].position / 2 });
    const reordered = (await admin.get(`/api/admin/tasks/${taskId}`)).json.subtasks.map((s: any) => s.title);
    assert.deepEqual(reordered, ['Pendente', 'Projeto arquitetônico', 'Licitação']);
    const board = (await admin.get('/api/admin/tasks')).json.find((t: any) => t.id === taskId);
    assert.equal(board.subtaskTotal, 3);
    assert.equal(board.subtaskDone, 1);
  });

  test('exclui subtarefa', async () => {
    const tmp = await admin.post(`/api/admin/tasks/${taskId}/subtasks`, { title: 'Temporária' });
    assert.equal((await admin.del(`/api/admin/subtasks/${tmp.json.id}`)).status, 200);
    assert.equal((await admin.del(`/api/admin/subtasks/${tmp.json.id}`)).status, 404);
  });
});

// ------------------------------------------------------------------ comentários
describe('comentários (como no Jira)', () => {
  let otherSession: Browser;
  let commentId = '';
  test('adiciona e edita o próprio comentário', async () => {
    const r = await admin.post(`/api/admin/tasks/${taskId}/comments`, { body: 'Obra liberada pela engenharia.' });
    assert.equal(r.status, 201);
    assert.equal(r.json.authorName, 'Direção (teste)');
    commentId = r.json.id;
    const e = await admin.patch(`/api/admin/comments/${commentId}`, { body: 'Obra liberada (atualizado).' });
    assert.equal(e.json.body, 'Obra liberada (atualizado).');
    assert.equal((await admin.post(`/api/admin/tasks/${taskId}/comments`, { body: '   ' })).status, 400);
  });

  test('outra pessoa não edita nem apaga; a chave mestra apaga', async () => {
    const created = await admin.post('/api/admin/acessos', { name: 'Ana Lima', email: '' });
    otherSession = new Browser();
    assert.equal(await otherSession.login(tokenOf(created.json.link)), 204);
    const mine = await otherSession.post(`/api/admin/tasks/${taskId}/comments`, { body: 'Comentário da Ana' });
    assert.equal((await otherSession.patch(`/api/admin/comments/${commentId}`, { body: 'x' })).status, 403);
    assert.equal((await otherSession.del(`/api/admin/comments/${commentId}`)).status, 403);
    assert.equal((await admin.del(`/api/admin/comments/${mine.json.id}`)).status, 200);
    const detail = (await admin.get(`/api/admin/tasks/${taskId}`)).json;
    assert.equal(detail.comments.length, 1);
    assert.ok(detail.activities.some((a: any) => /apagou um comentário de Ana Lima/.test(a.message)));
  });
});

// ------------------------------------------------------------------ documentos
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

describe('documentos', () => {
  let pdfId = '';
  let pngId = '';
  let htmlId = '';
  test('envia vários arquivos (nome com acento preservado)', async () => {
    const form = new FormData();
    form.append('files', new Blob(['%PDF-1.4 teste'], { type: 'application/pdf' }), 'Relatório técnico — obra.pdf');
    form.append('files', new Blob([PNG_1PX], { type: 'image/png' }), 'fachada.png');
    form.append('files', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'pagina.html');
    const r = await admin.req('POST', `/api/admin/tasks/${taskId}/documents`, form);
    assert.equal(r.status, 201);
    assert.equal(r.json.length, 3);
    const byName = Object.fromEntries(r.json.map((d: any) => [d.name, d]));
    assert.ok(byName['Relatório técnico — obra.pdf'], 'nome com acentos');
    pdfId = byName['Relatório técnico — obra.pdf'].id;
    pngId = byName['fachada.png'].id;
    htmlId = byName['pagina.html'].id;
    assert.ok(r.json.every((d: any) => d.isPublic === false), 'documentos nascem privados');
  });

  test('documento privado: só o painel acessa', async () => {
    assert.equal((await anon.get(`/api/files/${pdfId}`)).status, 404);
    const r = await admin.get(`/api/files/${pdfId}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/pdf');
    assert.match(r.headers.get('content-disposition') ?? '', /^inline; filename\*=UTF-8''Relat%C3%B3rio/);
    assert.equal(r.headers.get('cache-control'), 'private, no-store');
  });

  test('arquivo HTML é sempre baixado, nunca executado no navegador', async () => {
    const r = await admin.get(`/api/files/${htmlId}`);
    assert.equal(r.headers.get('content-type'), 'application/octet-stream');
    assert.match(r.headers.get('content-disposition') ?? '', /^attachment/);
  });

  test('tornar público libera no site; capa precisa ser imagem e vira pública', async () => {
    await admin.patch(`/api/admin/documents/${pdfId}`, { isPublic: true });
    assert.equal((await anon.get(`/api/files/${pdfId}`)).status, 200);
    assert.equal((await admin.patch(`/api/admin/tasks/${taskId}`, { coverDocumentId: pdfId })).status, 400);
    const r = await admin.patch(`/api/admin/tasks/${taskId}`, { coverDocumentId: pngId });
    assert.equal(r.json.coverDocumentId, pngId);
    assert.equal((await anon.get(`/api/files/${pngId}`)).status, 200);
  });

  test('tornar a capa privada remove a capa', async () => {
    await admin.patch(`/api/admin/documents/${pngId}`, { isPublic: false });
    assert.equal((await admin.get(`/api/admin/tasks/${taskId}`)).json.coverDocumentId, null);
    await admin.patch(`/api/admin/documents/${pngId}`, { isPublic: true });
    await admin.patch(`/api/admin/tasks/${taskId}`, { coverDocumentId: pngId });
  });

  test('download forçado com ?download', async () => {
    const r = await anon.get(`/api/files/${pdfId}?download`);
    assert.match(r.headers.get('content-disposition') ?? '', /^attachment/);
  });

  test('excluir documento apaga o arquivo e libera a capa', async () => {
    assert.equal((await admin.del(`/api/admin/documents/${htmlId}`)).status, 200);
    assert.equal((await admin.get(`/api/files/${htmlId}`)).status, 404);
    const stored = fs.readdirSync(path.join(dataDir, 'uploads'));
    assert.equal(stored.length, 2, 'arquivo físico removido');
  });
});

// ------------------------------------------------------------------ e-mail com Enter
describe('envio por e-mail', () => {
  test('sem provedor configurado o envio é simulado e registrado', async () => {
    const r = await admin.post(`/api/admin/tasks/${taskId}/notify`, { email: ' Pessoa@Exemplo.com ' });
    assert.equal(r.status, 201);
    assert.equal(r.json.status, 'simulated');
    assert.equal(r.json.email, 'pessoa@exemplo.com');
    const detail = (await admin.get(`/api/admin/tasks/${taskId}`)).json;
    assert.ok(detail.notifications.some((n: any) => n.email === 'pessoa@exemplo.com'));
    assert.ok(detail.activities.some((a: any) => /enviou o projeto por e-mail para pessoa@exemplo.com/.test(a.message)));
  });

  test('e-mail inválido é recusado; subtarefa de outro projeto também', async () => {
    assert.equal((await admin.post(`/api/admin/tasks/${taskId}/notify`, { email: 'sem-arroba' })).status, 400);
    const other = await admin.post('/api/admin/tasks', { title: 'Outro' });
    const otherSub = await admin.post(`/api/admin/tasks/${other.json.id}/subtasks`, { title: 'X' });
    assert.equal((await admin.post(`/api/admin/tasks/${taskId}/notify`, { email: 'a@b.com', subtaskId: otherSub.json.id })).status, 404);
  });

  describe('com provedor configurado (requisição HTTP simulada)', () => {
    const realFetch = globalThis.fetch;
    const calls: { url: string; headers: Headers; body: any }[] = [];
    let reply = { status: 200, body: '{"id":"ok"}' };
    before(() => {
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.startsWith('https://api.resend.com') || url.startsWith('https://api.brevo.com')) {
          calls.push({ url, headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
          return new Response(reply.body, { status: reply.status });
        }
        return realFetch(input, init);
      }) as typeof fetch;
    });
    after(() => {
      globalThis.fetch = realFetch;
      env.mail.resendKey = '';
      env.mail.brevoKey = '';
    });

    test('Resend: envia a subtarefa com título, checklist e só o link público', async () => {
      env.mail.resendKey = 're_teste';
      await admin.patch(`/api/admin/tasks/${taskId}`, { posX: 10, posZ: 20, title: 'Reforma <b>da</b> Biblioteca' });
      const sub = (await admin.get(`/api/admin/tasks/${taskId}`)).json.subtasks[1];
      const r = await admin.post(`/api/admin/tasks/${taskId}/notify`, { email: 'engenharia@ufs.br', subtaskId: sub.id });
      assert.equal(r.json.status, 'sent');
      const call = calls.at(-1)!;
      assert.equal(call.url, 'https://api.resend.com/emails');
      assert.equal(call.headers.get('authorization'), 'Bearer re_teste');
      assert.deepEqual(call.body.to, ['engenharia@ufs.br']);
      assert.match(call.body.subject, /Subtarefa: Projeto arquitetônico/);
      assert.ok(call.body.html.includes('Reforma &lt;b&gt;da&lt;/b&gt; Biblioteca'), 'HTML escapado');
      assert.ok(call.body.html.includes(`https://campus.teste/projeto/${taskId}`), 'link público');
      assert.ok(!/\/admin|\/acesso/.test(call.body.html + call.body.text), 'nunca expõe o painel');
      await admin.patch(`/api/admin/tasks/${taskId}`, { title: 'Reforma da Biblioteca' });
    });

    test('Brevo: usa o remetente do MAIL_FROM', async () => {
      env.mail.resendKey = '';
      env.mail.brevoKey = 'xkeysib-teste';
      env.mail.from = 'Campus Ita+ <avisos@campus.teste>';
      const r = await admin.post(`/api/admin/tasks/${taskId}/notify`, { email: 'diretor@ufs.br' });
      assert.equal(r.json.status, 'sent');
      const call = calls.at(-1)!;
      assert.equal(call.headers.get('api-key'), 'xkeysib-teste');
      assert.deepEqual(call.body.sender, { name: 'Campus Ita+', email: 'avisos@campus.teste' });
      assert.deepEqual(call.body.to, [{ email: 'diretor@ufs.br' }]);
    });

    test('falha do provedor aparece como "falhou" e não entra no histórico', async () => {
      reply = { status: 500, body: 'erro' };
      const r = await admin.post(`/api/admin/tasks/${taskId}/notify`, { email: 'falha@ufs.br' });
      assert.equal(r.status, 502);
      const detail = (await admin.get(`/api/admin/tasks/${taskId}`)).json;
      assert.equal(detail.notifications.find((n: any) => n.email === 'falha@ufs.br').status, 'failed');
      assert.ok(!detail.activities.some((a: any) => a.message.includes('falha@ufs.br')));
      reply = { status: 200, body: '{}' };
    });
  });
});

// ------------------------------------------------------------------ mapa
describe('mapa do campus', () => {
  test('posiciona, ajusta e remove do mapa (com histórico)', async () => {
    const t = (await admin.post('/api/admin/tasks', { title: 'Projeto do mapa' })).json;
    let r = await admin.patch(`/api/admin/tasks/${t.id}`, { posX: -42, posZ: 18 });
    assert.deepEqual([r.json.posX, r.json.posZ], [-42, 18]);
    r = await admin.patch(`/api/admin/tasks/${t.id}`, { posX: 5, posZ: 5 });
    r = await admin.patch(`/api/admin/tasks/${t.id}`, { posX: null, posZ: null });
    assert.equal(r.json.posX, null);
    const msgs = r.json.activities.map((a: any) => a.message);
    assert.ok(msgs.includes('posicionou o projeto no mapa do campus'));
    assert.ok(msgs.includes('ajustou a posição no mapa'));
    assert.ok(msgs.includes('removeu o projeto do mapa'));
    assert.equal((await admin.patch(`/api/admin/tasks/${t.id}`, { posX: 9999, posZ: 0 })).status, 400);
  });
});

// ------------------------------------------------------------------ site público
describe('site público', () => {
  test('mostra só projetos visíveis, sem e-mails, notificações ou documentos privados', async () => {
    const hidden = (await admin.post('/api/admin/tasks', { title: 'Projeto interno', isPublic: false })).json;
    const form = new FormData();
    form.append('files', new Blob(['segredo'], { type: 'application/pdf' }), 'interno.pdf');
    const doc = (await admin.req('POST', `/api/admin/tasks/${hidden.id}/documents`, form)).json[0];
    await admin.patch(`/api/admin/documents/${doc.id}`, { isPublic: true });

    const r = await anon.get('/api/public/projects');
    assert.equal(r.status, 200);
    const ids = r.json.projects.map((p: any) => p.id);
    assert.ok(ids.includes(taskId));
    assert.ok(!ids.includes(hidden.id), 'projeto oculto não aparece');
    assert.equal((await anon.get(`/api/files/${doc.id}`)).status, 404, 'arquivo de projeto oculto não abre no site');

    const raw = r.text;
    for (const leak of ['responsibleEmail', 'maria@ufs.br', 'notifications', 'pessoa@exemplo.com', 'activities', 'comments', 'Obra liberada']) {
      assert.ok(!raw.includes(leak), `vazou: ${leak}`);
    }
    const p = r.json.projects.find((x: any) => x.id === taskId);
    assert.equal(p.subtasks.length, 3);
    assert.ok(p.subtasks.every((s: any) => !('responsibleEmail' in s)));
    assert.ok(p.documents.every((d: any) => d.url.startsWith('/api/files/')));
    assert.ok(p.coverUrl, 'capa pública');
    assert.equal(p.documents.length, 2, 'só os documentos públicos');
  });
});

// ------------------------------------------------------------------ relatório
describe('relatório por período', () => {
  test('filtra concluídos, etapas e novos projetos pelas datas', async () => {
    const dentro = (await admin.post('/api/admin/tasks', { title: 'Concluído em março', status: 'concluido', completedAt: '2026-03-20' })).json;
    const fora = (await admin.post('/api/admin/tasks', { title: 'Concluído em 2025', status: 'concluido', completedAt: '2025-06-01' })).json;

    const r = await admin.get('/api/admin/reports?from=2026-03-01&to=2026-03-31');
    assert.equal(r.status, 200);
    const done = r.json.completedTasks.map((t: any) => t.id);
    assert.ok(done.includes(dentro.id));
    assert.ok(!done.includes(fora.id));
    // A subtarefa concluída em 10/03/2026 entra no período
    assert.ok(r.json.completedSubtasks.some((s: any) => s.title === 'Projeto arquitetônico' && s.taskTitle === 'Reforma da Biblioteca'));
    // Tudo criado hoje fica fora de março
    assert.equal(r.json.createdTasks.length, 0);
    assert.equal(r.json.generatedBy, 'Direção (teste)');

    const hoje = todayLocal();
    const r2 = await admin.get(`/api/admin/reports?from=${hoje}&to=${hoje}`);
    assert.ok(r2.json.createdTasks.length >= 5, 'projetos criados hoje');
    assert.ok(r2.json.activities.length > 0, 'histórico do dia');
    assert.ok(r2.json.inProgress.some((t: any) => t.id === taskId));
    assert.equal(Object.values(r2.json.statusCounts as Record<string, number>).reduce((a, b) => a + b, 0), r2.json.summary.totalTasks);
  });

  test('datas inválidas ou invertidas são recusadas', async () => {
    assert.equal((await admin.get('/api/admin/reports?from=2026-12-31&to=2026-01-01')).status, 400);
    assert.equal((await admin.get('/api/admin/reports?from=ontem&to=hoje')).status, 400);
  });
});

// ------------------------------------------------------------------ acessos
describe('acessos (links-chave)', () => {
  test('gera link pessoal, que abre sessão com o nome da pessoa', async () => {
    const r = await admin.post('/api/admin/acessos', { name: 'Carlos — Obras', email: 'Carlos@UFS.br', sendEmail: true });
    assert.equal(r.status, 201);
    assert.match(r.json.link, /^https:\/\/campus\.teste\/acesso#[\w-]{43}$/);
    assert.equal(r.json.emailStatus, 'simulated');
    assert.equal(r.json.key.email, 'carlos@ufs.br');
    assert.ok(!('tokenHash' in r.json.key), 'hash nunca sai do servidor');
    const carlos = new Browser();
    assert.equal(await carlos.login(tokenOf(r.json.link)), 204);
    assert.equal((await carlos.get('/api/admin/me')).json.name, 'Carlos — Obras');
    const list = (await admin.get('/api/admin/acessos')).json;
    assert.ok(list.every((k: any) => !('tokenHash' in k)));
  });

  test('gerar novo link invalida o antigo e derruba as sessões abertas', async () => {
    const created = (await admin.post('/api/admin/acessos', { name: 'Bia' })).json;
    const bia = new Browser();
    await bia.login(tokenOf(created.link));
    const regen = await admin.post(`/api/admin/acessos/${created.key.id}/regenerar`, {});
    assert.equal(regen.status, 200);
    assert.equal((await bia.get('/api/admin/me')).status, 404, 'sessão antiga caiu');
    assert.equal(await new Browser().login(tokenOf(created.link)), 404, 'link antigo não abre');
    assert.equal(await new Browser().login(tokenOf(regen.json.link)), 204, 'link novo abre');
  });

  test('revogar derruba na hora; mestra e o próprio acesso não podem ser revogados', async () => {
    const created = (await admin.post('/api/admin/acessos', { name: 'Davi' })).json;
    const davi = new Browser();
    await davi.login(tokenOf(created.link));
    assert.equal((await davi.post(`/api/admin/acessos/${created.key.id}/revogar`)).status, 400, 'não revoga a si mesmo');
    const master = (await admin.get('/api/admin/acessos')).json.find((k: any) => k.isMaster);
    assert.equal((await admin.post(`/api/admin/acessos/${master.id}/revogar`)).status, 400);
    assert.equal((await admin.post(`/api/admin/acessos/${master.id}/regenerar`)).status, 400);
    const rev = await admin.post(`/api/admin/acessos/${created.key.id}/revogar`);
    assert.ok(rev.json.revokedAt);
    assert.equal((await davi.get('/api/admin/me')).status, 404);
    assert.equal(await new Browser().login(tokenOf(created.link)), 404);
  });

  test('sair encerra a sessão deste navegador', async () => {
    const b = new Browser();
    await b.login(MASTER_KEY);
    await b.post('/api/admin/sair');
    assert.equal((await b.get('/api/admin/me')).status, 404);
  });
});

// ------------------------------------------------------------------ importação do Jira
const JIRA_PT = [
  'Resumo,Chave do item,ID do item,Tipo de item,Status,Prioridade,Responsável,Criado,Resolvido,Data limite,Descrição,Rótulos,Pai,Comentário,Campo personalizado (Rank)',
  'Viabilizar ampliação física do campus,KAN-1,10001,Tarefa,Em andamento,Alta,Vinícius Lima Santos,01/out/26 9:15 AM,,18/out/26,"Ampliação com *novo bloco*\nh2. Etapas\n* licitação, projeto",infraestrutura,,"05/out/26 10:00 AM;712020:abcdef0123456789abcdef01;Reunião com a reitoria; marcada",0|i0000b:',
  'Projeto arquitetônico,KAN-3,10003,Subtarefa,Concluído,Média,Engenharia,02/out/26 8:00 AM,10/out/26 5:30 PM,,,,10001,,0|i0000d:',
  'Orçamento,KAN-4,10004,Subtarefa,A fazer,Média,,02/out/26 8:00 AM,,,,,10001,,0|i0000e:',
  'Acompanhar reforma do auditório,KAN-10,10010,Tarefa,Concluído,Média,,15/set/26 3:00 PM,30/set/26 11:00 AM,,,,,,0|i00009:',
  'Buscar melhorias do mini-auditório,KAN-11,10011,Tarefa,A fazer,Mais baixa,,20/set/26 3:00 PM,,,,,,,0|i0000a:',
  'Subtarefa sem pai,KAN-99,10099,Subtarefa,A fazer,Média,,20/set/26 3:00 PM,,,,,99999,,0|i0000z:',
].join('\r\n');

const JIRA_EN = [
  'Summary,Issue key,Issue id,Issue Type,Status,Priority,Assignee,Created,Resolved,Due date,Description,Parent',
  'Buscar modernização do parque tecnológico,KAN-2,20002,Task,In Progress,Highest,Ana,18/Oct/26 12:00 AM,,2026-12-01,,',
  'Levantar equipamentos,KAN-5,20005,Sub-task,Done,Medium,,18/Oct/26 12:00 AM,19/Oct/26 2:30 PM,,,20002',
].join('\n');

async function importJira(csv: string, apply: boolean, visible = true) {
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'jira.csv');
  form.append('apply', String(apply));
  form.append('visible', String(visible));
  return admin.req('POST', '/api/admin/import/jira', form);
}

describe('importação do Jira (CSV)', () => {
  test('prévia não grava nada e avisa sobre subtarefa sem pai', async () => {
    const before = (await admin.get('/api/admin/tasks')).json.length;
    const r = await importJira(JIRA_PT, false);
    assert.equal(r.status, 200);
    assert.equal(r.json.applied, false);
    assert.deepEqual(r.json.totals, { projects: 3, subtasks: 2, comments: 1, new: 3, updated: 0 });
    assert.deepEqual(r.json.byStatus, { ideia: 0, a_fazer: 1, em_andamento: 1, em_analise: 0, concluido: 1 });
    assert.ok(r.json.warnings.some((w: string) => w.includes('KAN-99')));
    assert.equal((await admin.get('/api/admin/tasks')).json.length, before);
  });

  test('importa projetos, subtarefas, datas, prioridades e comentários (cabeçalho em português)', async () => {
    const r = await importJira(JIRA_PT, true);
    assert.equal(r.json.applied, true);
    assert.deepEqual(r.json.result, { created: 3, updated: 0, subtasksCreated: 2, subtasksUpdated: 0, comments: 1 });

    const all = (await admin.get('/api/admin/tasks')).json;
    const find = (title: string) => all.find((t: any) => t.title === title);
    const kan1 = (await admin.get(`/api/admin/tasks/${find('Viabilizar ampliação física do campus').id}`)).json;
    assert.equal(kan1.status, 'em_andamento');
    assert.equal(kan1.priority, 'alta');
    assert.equal(kan1.responsibleName, 'Vinícius Lima Santos');
    assert.equal(kan1.dueDate, '2026-10-18');
    assert.equal(kan1.category, 'Infraestrutura');
    assert.equal(kan1.isPublic, true);
    assert.match(kan1.createdAt, /^2026-10-01T12:15/); // 9:15 em Sergipe = 12:15 UTC
    assert.equal(kan1.description, 'Ampliação com novo bloco\nEtapas\n• licitação, projeto');
    assert.deepEqual(
      kan1.subtasks.map((s: any) => [s.title, s.done, s.completedAt, s.responsibleName]),
      [
        ['Projeto arquitetônico', true, '2026-10-10', 'Engenharia'],
        ['Orçamento', false, null, ''],
      ],
    );
    assert.deepEqual(
      kan1.comments.map((c: any) => [c.authorName, c.body]),
      [['Jira (importado)', 'Reunião com a reitoria; marcada']],
    );
    assert.ok(kan1.activities.some((a: any) => a.message === 'importou do Jira (KAN-1)'));

    const kan10 = find('Acompanhar reforma do auditório');
    assert.equal(kan10.status, 'concluido');
    assert.equal(kan10.completedAt, '2026-09-30');
    const kan11 = find('Buscar melhorias do mini-auditório');
    assert.equal(kan11.priority, 'mais_baixa');
    assert.equal(kan11.status, 'a_fazer');
    assert.equal(kan11.posX, null, 'entra sem local no mapa');

    const pub = (await anon.get('/api/public/projects')).json.projects.map((p: any) => p.title);
    assert.ok(pub.includes('Viabilizar ampliação física do campus'));
  });

  test('reimportar atualiza sem duplicar e respeita o que foi feito no painel', async () => {
    const all = (await admin.get('/api/admin/tasks')).json;
    const kan11 = all.find((t: any) => t.title === 'Buscar melhorias do mini-auditório');
    await admin.patch(`/api/admin/tasks/${kan11.id}`, { posX: 10, posZ: 10, description: 'Escrito no painel' });

    const changed = JIRA_PT.replace('Buscar melhorias do mini-auditório,KAN-11,10011,Tarefa,A fazer', 'Buscar melhorias do mini-auditório,KAN-11,10011,Tarefa,Em análise');
    const r = await importJira(changed, true);
    assert.deepEqual(r.json.result, { created: 0, updated: 3, subtasksCreated: 0, subtasksUpdated: 2, comments: 0 });
    assert.equal((await admin.get('/api/admin/tasks')).json.length, all.length, 'nenhum duplicado');

    const after = (await admin.get(`/api/admin/tasks/${kan11.id}`)).json;
    assert.equal(after.status, 'em_analise');
    assert.deepEqual([after.posX, after.posZ], [10, 10], 'posição no mapa mantida');
    assert.equal(after.description, 'Escrito no painel', 'descrição do painel mantida quando o Jira não tem');
  });

  test('cabeçalho em inglês e importação oculta do site', async () => {
    const r = await importJira(JIRA_EN, true, false);
    assert.deepEqual(r.json.result, { created: 1, updated: 0, subtasksCreated: 1, subtasksUpdated: 0, comments: 0 });
    const t = (await admin.get('/api/admin/tasks')).json.find((x: any) => x.title === 'Buscar modernização do parque tecnológico');
    assert.equal(t.status, 'em_andamento');
    assert.equal(t.priority, 'mais_alta');
    assert.equal(t.dueDate, '2026-12-01');
    assert.equal(t.isPublic, false);
    const sub = (await admin.get(`/api/admin/tasks/${t.id}`)).json.subtasks[0];
    assert.deepEqual([sub.title, sub.done, sub.completedAt], ['Levantar equipamentos', true, '2026-10-19']);
    const pub = (await anon.get('/api/public/projects')).json.projects.map((p: any) => p.title);
    assert.ok(!pub.includes('Buscar modernização do parque tecnológico'));
  });

  test('arquivo que não é do Jira é recusado com explicação', async () => {
    const r = await importJira('nome,idade\nAna,30', false);
    assert.equal(r.status, 400);
    assert.match(r.json.error, /Resumo|Chave/);
    const sem = await admin.req('POST', '/api/admin/import/jira', new FormData());
    assert.equal(sem.status, 400);
  });
});

// ------------------------------------------------------------------ exclusão
describe('exclusão de projeto', () => {
  test('apaga subtarefas, comentários e arquivos do projeto', async () => {
    const before = fs.readdirSync(path.join(dataDir, 'uploads')).length;
    assert.equal((await admin.del(`/api/admin/tasks/${taskId}`)).status, 200);
    assert.equal((await admin.get(`/api/admin/tasks/${taskId}`)).status, 404);
    assert.equal(fs.readdirSync(path.join(dataDir, 'uploads')).length, before - 2);
  });
});

// ------------------------------------------------------------------ build separado do painel
const builtSite = fs.existsSync(env.siteDist);
const builtAdmin = fs.existsSync(env.adminDist);

describe('site e painel servidos pelo backend (requer npm run build)', { skip: !(builtSite && builtAdmin) && 'build não encontrado' }, () => {
  test('sem sessão, /admin e os arquivos do painel são idênticos a uma URL qualquer', async () => {
    const reference = (await anon.get('/uma-pagina-que-nao-existe')).text;
    assert.match(reference, /<div id="root">/);
    const adminJs = fs.readdirSync(path.join(env.adminDist, 'assets')).find((f) => f.endsWith('.js'))!;
    for (const url of ['/admin', '/admin/', '/admin/tarefa/ITA-1', `/admin/assets/${adminJs}`]) {
      const r = await anon.get(url);
      assert.equal(r.status, 200, url);
      assert.equal(r.text, reference, `${url} revela o painel`);
    }
  });

  test('o código do site público não contém nada do painel', () => {
    const files = fs.readdirSync(path.join(env.siteDist, 'assets')).map((f) => fs.readFileSync(path.join(env.siteDist, 'assets', f), 'utf8'));
    const all = files.join('\n') + fs.readFileSync(path.join(env.siteDist, 'index.html'), 'utf8');
    for (const needle of ['/api/admin', 'X-CIM-Admin', '/acesso', 'Quadro de projetos', 'admin']) {
      assert.ok(!all.includes(needle), `bundle público contém "${needle}"`);
    }
  });

  test('com sessão, o painel é entregue e não fica em cache compartilhado', async () => {
    const r = await admin.get('/admin/');
    assert.match(r.text, /Painel · Campus Ita\+/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
    const adminJs = fs.readdirSync(path.join(env.adminDist, 'assets')).find((f) => f.endsWith('.js'))!;
    const js = await admin.get(`/admin/assets/${adminJs}`);
    assert.match(js.headers.get('content-type') ?? '', /javascript/);
    assert.match(js.headers.get('cache-control') ?? '', /^private/);
  });
});

// ------------------------------------------------------------------ força bruta (por último: bloqueia o IP)
describe('proteção contra força bruta', () => {
  test('após 10 tentativas erradas, nem a chave certa funciona por 15 minutos', async () => {
    const b = new Browser();
    for (let i = 0; i < 10; i++) await b.login(`tentativa-${i}-`.padEnd(43, 'q'));
    assert.equal(await b.login(MASTER_KEY), 404);
  });
});
