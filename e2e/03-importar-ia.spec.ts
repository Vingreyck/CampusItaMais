import { expect, test, type Page } from '@playwright/test';
import { FAKE_GROQ_PORT, MASTER_KEY } from './playwright.config';

/**
 * "Importar com IA": texto → prévia → confirmação; arquivo; voz (microfone de mentira do Chromium).
 * Roda depois do painel (02-*) sobre o mesmo banco; a Groq é simulada por e2e/fake-groq.mjs.
 */
test.describe.configure({ mode: 'serial' });
test.use({
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

const GROQ_CALLS = `http://localhost:${FAKE_GROQ_PORT}/__calls`;
const card = (page: Page, title: string) => page.locator('[data-rfd-draggable-id]').filter({ hasText: title });
const column = (page: Page, label: string) => page.getByRole('region', { name: `Coluna ${label}` });

async function enter(page: Page) {
  page.on('dialog', (d) => d.accept());
  await page.goto(`/acesso#${MASTER_KEY}`);
  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.getByRole('heading', { name: 'Quadro de projetos' })).toBeVisible();
}

/** Garante, sem depender de outros arquivos de teste, a ação que a Groq falsa vai "atualizar". */
async function ensureMiniAuditorio(page: Page) {
  const tasks = await (await page.request.get('/api/admin/tasks')).json();
  if (tasks.some((t: { title: string }) => t.title === 'Buscar melhorias do mini-auditório')) return;
  const r = await page.request.post('/api/admin/tasks', { data: { title: 'Buscar melhorias do mini-auditório', status: 'a_fazer' }, headers: { 'X-CIM-Admin': '1' } });
  expect(r.ok()).toBe(true);
}

async function openAi(page: Page) {
  await page.getByRole('button', { name: 'Importar com IA' }).click();
  const dialog = page.getByRole('dialog', { name: 'Importar com IA' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('texto: a IA propõe, o painel mostra a prévia e só grava ao confirmar (dados pessoais ocultos)', async ({ page, request }) => {
  await enter(page);
  await ensureMiniAuditorio(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Quadro de projetos' })).toBeVisible();
  const dialog = await openAi(page);
  await expect(dialog.getByRole('button', { name: 'Analisar com IA' })).toBeDisabled();
  await expect(dialog.getByText(/Usos hoje: \d+ de 50/)).toBeVisible();

  await dialog.getByLabel('Texto para a IA').fill('ATA: Quiosque de informações na entrada (Fazendo, prioridade alta). Ajustar o mini-auditório. Contato: ana@ufs.br, (79) 99999-1234.');
  await dialog.getByRole('button', { name: 'Analisar com IA' }).click();

  const preview = dialog.getByRole('region', { name: 'Prévia da IA' });
  await expect(preview.getByText('Quiosque de informações (IA)')).toBeVisible();
  await expect(preview.getByText('Nova', { exact: true })).toBeVisible();
  await expect(preview.getByText(/Atualiza ITA-\d+/)).toBeVisible();
  await expect(preview.getByText('Situação: A fazer → Em análise')).toBeVisible();
  await expect(preview.getByText('Prioridade: Média → Altíssima')).toBeVisible();
  await expect(preview.getByText('2 dados pessoais ocultados antes do envio')).toBeVisible();
  await expect(preview.getByText('Escolher o local')).toBeVisible();
  await expect(preview.getByText(/A IA pode errar/)).toBeVisible();

  // Nada foi gravado ainda
  const tasksBefore = await (await page.request.get('/api/admin/tasks')).json();
  expect(tasksBefore.some((t: { title: string }) => t.title.startsWith('Quiosque de informações (IA)'))).toBe(false);

  // O que foi para a "Groq" não tinha e-mail nem telefone
  const sent = (await (await request.get(GROQ_CALLS)).json()).filter((c: { user?: string }) => c.user);
  const last = sent.at(-1).user as string;
  expect(last).not.toMatch(/ana@ufs\.br|99999-1234/);
  expect(last).toMatch(/\[EMAIL_1\]/);

  // Desmarcar um item muda o botão de aplicar
  await preview.getByLabel('Incluir: Buscar melhorias do mini-auditório').uncheck();
  await expect(dialog.getByRole('button', { name: 'Aplicar 1 item' })).toBeVisible();
  await preview.getByLabel('Incluir: Buscar melhorias do mini-auditório').check();
  await dialog.getByRole('button', { name: 'Aplicar 2 itens' }).click();

  await expect(page.getByText('Importação concluída')).toBeVisible();
  await expect(column(page, 'Em andamento')).toContainText('Quiosque de informações (IA)');
  await expect(column(page, 'Em análise')).toContainText('Buscar melhorias do mini-auditório');

  const created = (await (await page.request.get('/api/admin/tasks')).json()).find((t: { title: string }) => t.title === 'Quiosque de informações (IA)');
  const detail = await (await page.request.get(`/api/admin/tasks/${created.id}`)).json();
  expect(detail.priority).toBe('alta');
  expect(detail.subtasks.map((s: { title: string }) => s.title)).toEqual(['Escolher o local', 'Comprar o totem']);
  expect(detail.activities.some((a: { message: string }) => a.message === 'criou com importação por IA')).toBe(true);
  expect(detail.isPublic).toBe(true);
});

test('arquivo: envia um CSV e a IA lê o conteúdo', async ({ page }) => {
  await enter(page);
  const dialog = await openAi(page);
  await dialog.getByLabel('Arquivo para a IA').setInputFiles({ name: 'acoes.csv', mimeType: 'text/csv', buffer: Buffer.from('Ação;Status\nHorta comunitária;Em andamento\n') });
  await expect(dialog.getByText('acoes.csv')).toBeVisible();
  await dialog.getByRole('button', { name: 'Analisar com IA' }).click();
  const preview = dialog.getByRole('region', { name: 'Prévia da IA' });
  await expect(preview.getByText('Horta comunitária (arquivo)')).toBeVisible();
  await expect(preview.getByText('entra em Ideias')).toBeVisible();
  await expect(preview.getByText('em texto')).toBeVisible();

  // "Voltar ao texto" não perde nada; remover o arquivo desliga o botão
  await dialog.getByRole('button', { name: 'Voltar ao texto' }).click();
  await expect(dialog.getByText('acoes.csv')).toBeVisible();
  await dialog.getByRole('button', { name: 'Remover arquivo' }).click();
  await expect(dialog.getByRole('button', { name: 'Analisar com IA' })).toBeDisabled();

  // Formato não suportado: erro claro, nada quebra
  await dialog.getByLabel('Arquivo para a IA').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from('xxxx') });
  await dialog.getByRole('button', { name: 'Analisar com IA' }).click();
  await expect(page.getByText('Não foi possível analisar')).toBeVisible();
  await expect(page.getByText(/Imagens e PDFs escaneados/)).toBeVisible();
});

test('voz: grava, transcreve e coloca o texto no campo para conferir', async ({ page, request }) => {
  await enter(page);
  const dialog = await openAi(page);
  await dialog.getByRole('button', { name: 'Gravar voz' }).click();
  const stop = dialog.getByRole('button', { name: 'Parar gravação' });
  await expect(stop).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Analisar com IA' })).toBeDisabled(); // não analisa enquanto grava
  await page.waitForTimeout(2500);
  await stop.click();

  await expect(dialog.getByLabel('Texto para a IA')).toHaveValue('Horta comunitária: criar a ação na reunião de hoje.');
  await expect(page.getByText('Voz transcrita')).toBeVisible();
  const audio = (await (await request.get(GROQ_CALLS)).json()).filter((c: { bytes?: number }) => c.bytes);
  expect(audio.at(-1).bytes).toBeGreaterThan(1000);

  // O texto transcrito segue o mesmo caminho: analisar → prévia
  await dialog.getByRole('button', { name: 'Analisar com IA' }).click();
  await expect(dialog.getByRole('region', { name: 'Prévia da IA' }).getByText('Horta comunitária (arquivo)')).toBeVisible();
});

test('cancelar fecha sem gravar nada, e a IA só aparece para quem tem o link do painel', async ({ page, browser }) => {
  await enter(page);
  const before = (await (await page.request.get('/api/admin/tasks')).json()).length;
  const dialog = await openAi(page);
  await dialog.getByLabel('Texto para a IA').fill('Horta comunitária');
  await dialog.getByRole('button', { name: 'Analisar com IA' }).click();
  await expect(dialog.getByRole('region', { name: 'Prévia da IA' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect((await (await page.request.get('/api/admin/tasks')).json()).length).toBe(before);

  const visitor = await browser.newContext();
  const status = await visitor.request.get('/api/admin/ai/status', { baseURL: `http://localhost:3210` });
  expect(status.status()).toBe(404);
  const analyze = await visitor.request.post('/api/admin/ai/analyze', { baseURL: `http://localhost:3210`, multipart: { text: 'x' }, headers: { 'X-CIM-Admin': '1' } });
  expect(analyze.status()).toBe(404);
  await visitor.close();
});
