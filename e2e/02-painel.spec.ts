import { expect, test, type Page } from '@playwright/test';
import { MASTER_KEY, PORT } from './playwright.config';

/**
 * Painel de gestão (Jira simplificado). Os testes rodam em sequência sobre o mesmo banco:
 * cria o projeto "Quiosque E2E", trabalha nele e confere o reflexo no site público.
 */
test.describe.configure({ mode: 'serial' });

const BASE = `http://localhost:${PORT}`;
const TITLE = 'Quiosque E2E';
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

async function enter(page: Page) {
  page.on('dialog', (d) => d.accept());
  await page.goto(`/acesso#${MASTER_KEY}`);
  await expect(page).toHaveURL(/\/admin\/$/);
  await expect(page.getByRole('heading', { name: 'Quadro de projetos' })).toBeVisible();
}

const card = (page: Page, title: string) => page.locator('[data-rfd-draggable-id]').filter({ hasText: title });
const column = (page: Page, label: string) => page.getByRole('region', { name: `Coluna ${label}` });

async function apiTask(page: Page, title: string) {
  const tasks = await (await page.request.get('/api/admin/tasks')).json();
  return tasks.find((t: { title: string }) => t.title === title);
}

test('link-chave abre o painel e a chave some da barra de endereço', async ({ page }) => {
  await enter(page);
  expect(page.url()).not.toContain(MASTER_KEY);
  for (const [label, count] of [
    ['Ideias', '3'],
    ['A fazer', '2'],
    ['Em andamento', '3'],
    ['Em análise', '1'],
    ['Concluído', '5'],
  ]) {
    await expect(column(page, label).locator('header')).toContainText(count);
  }
  await expect(page.getByText('Direção E2E')).toBeVisible();
});

test('criar projeto pelo atalho C, como no Jira', async ({ page }) => {
  await enter(page);
  await page.keyboard.press('c');
  const form = page.getByRole('form', { name: 'Criar projeto' });
  await expect(form).toBeVisible();
  await form.getByLabel('Título *').fill(TITLE);
  await form.getByLabel('Coluna').selectOption('a_fazer');
  await form.getByLabel('Prioridade').selectOption('alta');
  await form.getByLabel('Categoria').fill('Infraestrutura');
  await form.getByLabel('Responsável').fill('Maria Souza');
  await form.getByLabel('Descrição (aparece no site)').fill('Totem com mapa do campus e agenda de eventos.');
  await form.getByRole('button', { name: 'Criar' }).click();

  await expect(page.getByText('ITA-15 criado')).toBeVisible();
  await expect(form).toHaveCount(0);
  const c = card(page, TITLE);
  await expect(column(page, 'A fazer')).toContainText(TITLE);
  await expect(c.getByLabel('Prioridade Alta')).toBeVisible();
  await expect(c).toContainText('ITA-15');
});

test('criação rápida no pé da coluna e busca com /', async ({ page }) => {
  await enter(page);
  await column(page, 'Ideias').getByRole('button', { name: 'Criar' }).click();
  await page.getByLabel('Novo projeto em Ideias').fill('Ideia rápida E2E');
  await page.keyboard.press('Enter');
  await expect(column(page, 'Ideias')).toContainText('Ideia rápida E2E');

  await page.keyboard.press('Escape');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('/');
  await expect(page.getByLabel('Buscar no quadro')).toBeFocused();
  await page.keyboard.type('quiosque');
  await expect(page.locator('[data-rfd-draggable-id]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page.locator('[data-rfd-draggable-id]')).toHaveCount(16);
});

test('filtros rápidos por responsável e "sem local no mapa"', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: 'Responsável: Maria Souza' }).click();
  await expect(page.locator('[data-rfd-draggable-id]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await page.getByRole('button', { name: 'Sem local no mapa' }).click();
  await expect(page.locator('[data-rfd-draggable-id]')).toHaveCount(2); // os dois criados agora
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
});

test('arrastar o cartão para outra coluna muda a situação (arraste por teclado)', async ({ page }) => {
  await enter(page);
  const c = card(page, TITLE);
  await c.focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await expect(page.getByText('Movido para “Em andamento”')).toBeVisible();
  await expect(column(page, 'Em andamento')).toContainText(TITLE);
  await expect.poll(async () => (await apiTask(page, TITLE)).status).toBe('em_andamento');
});

test('ficha do projeto: subtarefas, data feita, responsável, e-mail com Enter, documentos e comentários', async ({ page }) => {
  await enter(page);
  await card(page, TITLE).click();
  await expect(page).toHaveURL(/\/admin\/tarefa\/ITA-15$/);
  const dialog = page.getByRole('dialog', { name: /ITA-15/ });
  await expect(dialog.getByLabel('Título')).toHaveValue(TITLE);

  // Subtarefas com Enter
  const addSub = dialog.getByPlaceholder('Adicionar subtarefa e pressionar Enter');
  const rows = dialog.locator('li').filter({ has: page.getByLabel('Arrastar para reordenar') });
  const names = ['Escolher o local', 'Comprar o totem', 'Instalar e testar'];
  for (const [i, t] of names.entries()) {
    await addSub.fill(t);
    await addSub.press('Enter');
    await expect(rows).toHaveCount(i + 1);
    await expect(rows.nth(i).locator('input')).toHaveValue(t);
  }

  // Marcar como feita grava a data
  await rows.nth(0).getByLabel('Marcar como concluída').click();
  await expect(dialog.getByText('Subtarefas · 1/3')).toBeVisible();
  await expect(rows.nth(0)).toContainText(new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Maceio' }));

  // Detalhes da subtarefa: responsável e envio por e-mail com Enter
  await rows.nth(1).getByLabel('Detalhes da subtarefa').click();
  await rows.nth(1).getByPlaceholder('Nome').fill('Setor de Compras');
  await rows.nth(1).getByPlaceholder('Nome').press('Enter');
  const subMail = rows.nth(1).getByPlaceholder('e-mail + Enter para enviar');
  await subMail.fill('compras@exemplo.com');
  await subMail.press('Enter');
  await expect(page.getByText('Envio para compras@exemplo.com registrado')).toBeVisible();
  await expect(rows.nth(1).getByText('compras@exemplo.com')).toBeVisible();

  // Projeto inteiro por e-mail
  const mail = dialog.getByPlaceholder('Digite um e-mail e pressione Enter para enviar');
  await mail.fill('diretor@exemplo.com');
  await mail.press('Enter');
  await expect(dialog.getByText('diretor@exemplo.com')).toBeVisible();

  // Detalhes (coluna lateral)
  const side = dialog.locator('aside');
  await side.getByLabel('E-mail do responsável').fill('maria@ufs.br');
  await side.getByLabel('E-mail do responsável').press('Enter');
  await side.getByLabel('Prioridade', { exact: true }).selectOption('mais_alta');
  await side.getByLabel('Situação').selectOption('em_analise');
  await expect(side.getByText('No site: em andamento')).toBeVisible();

  // Documentos: foto pública como capa
  await dialog.locator('input[type=file]').setInputFiles({ name: 'fachada do quiosque.png', mimeType: 'image/png', buffer: PNG_1PX });
  await expect(dialog.getByRole('link', { name: 'fachada do quiosque.png' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Privado' }).click();
  await expect(dialog.getByRole('button', { name: 'Público' })).toBeVisible();
  await dialog.getByTitle('Usar como capa do projeto no site').click();
  await expect(dialog.getByText('· capa no site')).toBeVisible();

  // Comentário com o atalho M + Ctrl+Enter
  await dialog.getByText('Atividade').click();
  await page.keyboard.press('m');
  await expect(dialog.getByLabel('Novo comentário')).toBeFocused();
  await page.keyboard.type('Local aprovado pela prefeitura do campus.');
  await page.keyboard.press('Control+Enter');
  await expect(dialog.getByText('Local aprovado pela prefeitura do campus.')).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Comentários (1)' })).toBeVisible();

  // Histórico registra tudo
  await dialog.getByRole('tab', { name: 'Histórico' }).click();
  for (const msg of [
    'criou o projeto em “A fazer”',
    'moveu de “A fazer” para “Em andamento”',
    'concluiu a subtarefa “Escolher o local”',
    'enviou a subtarefa “Comprar o totem” para compras@exemplo.com',
    'enviou o projeto por e-mail para diretor@exemplo.com',
    'alterou a prioridade de Alta para Altíssima',
    'anexou o documento “fachada do quiosque.png”',
  ]) {
    await expect(dialog.getByText(msg)).toBeVisible();
  }

  await dialog.getByText('Atividade').click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(column(page, 'Em análise')).toContainText(TITLE);
});

test('mapa: arrastar a bolinha do projeto até o ponto do campus', async ({ page }) => {
  await enter(page);
  await page.getByRole('link', { name: 'Mapa do campus' }).click();
  await expect(page.getByRole('heading', { name: 'Mapa do campus' })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  const item = page.locator('[draggable="true"]').filter({ hasText: TITLE });
  await expect(item).toBeVisible();
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible(); // cena 3D pronta para receber a bolinha

  // Arraste nativo (HTML5) da lista até o centro do campus
  await page.evaluate((title) => {
    const source = [...document.querySelectorAll<HTMLElement>('[draggable="true"]')].find((el) => el.textContent?.includes(title))!;
    const target = document.querySelector('canvas')!.closest('.relative')!;
    const r = target.getBoundingClientRect();
    const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    const dt = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, ...at }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, ...at }));
  }, TITLE);
  await expect(page.getByText('Projeto posicionado no campus')).toBeVisible();
  await expect.poll(async () => (await apiTask(page, TITLE)).posX).not.toBeNull();
  await expect(page.getByText(/No mapa · 15/)).toBeVisible();
});

test('o site público mostra o projeto novo na cor amarela, com checklist e capa', async ({ browser }) => {
  const visitor = await browser.newContext();
  const page = await visitor.newPage();
  await page.goto(`${BASE}/`);
  const yellow = page.getByRole('button', { name: 'Em andamento: 5 projeto(s)' });
  await expect(yellow).toBeVisible();
  await yellow.click();
  await page.getByRole('button', { name: new RegExp(TITLE) }).click();
  const panel = page.getByRole('complementary', { name: `Projeto: ${TITLE}` });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Em análise')).toBeVisible();
  await expect(panel.getByText('1 de 3 etapas concluídas')).toBeVisible();
  await expect(panel.getByText('Escolher o local')).toBeVisible();
  await expect(panel.locator('img').first()).toBeVisible(); // capa
  await expect(panel.getByText('Maria Souza')).toBeVisible();
  // Nada interno vaza para o visitante
  await expect(page.getByText('maria@ufs.br')).toHaveCount(0);
  await expect(page.getByText('diretor@exemplo.com')).toHaveCount(0);
  await expect(page.getByText('Local aprovado pela prefeitura')).toHaveCount(0);
  await visitor.close();
});

test('relatório do período, pronto para imprimir', async ({ page }) => {
  await enter(page);
  await page.getByRole('link', { name: 'Relatório' }).click();
  await page.getByRole('button', { name: 'Este ano' }).click();
  const doc = page.locator('article');
  await expect(doc.getByRole('heading', { name: 'Relatório de atividades' })).toBeVisible();
  await expect(doc.getByText('Projetos concluídos no período')).toBeVisible();
  await expect(doc.getByText('Wi-Fi em todo o campus').first()).toBeVisible(); // concluído em 2026
  await expect(doc.getByText(TITLE).first()).toBeVisible(); // novo e em andamento
  await expect(doc.getByText('Escolher o local').first()).toBeVisible(); // etapa concluída hoje

  // Período sem nada
  await page.getByLabel('De', { exact: true }).fill('2020-01-01');
  await page.getByLabel('Até', { exact: true }).fill('2020-12-31');
  await expect(doc.getByText('Nenhum projeto concluído neste período.')).toBeVisible();

  // Imprimir: chama a impressão do navegador e esconde o menu lateral no papel
  await page.evaluate(() => {
    (window as unknown as { printed: boolean }).printed = false;
    window.print = () => ((window as unknown as { printed: boolean }).printed = true);
  });
  await page.getByRole('button', { name: 'Imprimir / PDF' }).click();
  expect(await page.evaluate(() => (window as unknown as { printed: boolean }).printed)).toBe(true);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('aside').first()).toBeHidden();
  await expect(page.getByRole('button', { name: 'Imprimir / PDF' })).toBeHidden();
  await expect(doc.getByRole('heading', { name: 'Relatório de atividades' })).toBeVisible();
});

test('acessos: link pessoal entra no painel e revogar derruba na hora', async ({ page, browser }) => {
  await enter(page);
  await page.getByRole('link', { name: 'Acessos' }).click();
  await page.getByPlaceholder('Ex.: Maria — Infraestrutura').fill('Pessoa E2E');
  await page.getByRole('button', { name: 'Gerar link' }).click();
  const link = await page.locator('input[readonly]').inputValue();
  expect(link).toMatch(new RegExp(`^${BASE}/acesso#[\\w-]{43}$`));

  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto(link);
  await expect(p2).toHaveURL(`${BASE}/admin/`);
  await expect(p2.getByText('Pessoa E2E')).toBeVisible();

  await page.locator('li').filter({ hasText: 'Pessoa E2E' }).getByRole('button', { name: 'Revogar' }).click();
  await expect(page.getByText('Acesso revogado')).toBeVisible();
  await p2.goto(`${BASE}/admin/`);
  await expect(p2).toHaveURL(`${BASE}/`);
  await expect(p2.getByText('Quadro de projetos')).toHaveCount(0);
  await other.close();
});

const JIRA_CSV = [
  'Resumo,Chave do item,ID do item,Tipo de item,Status,Prioridade,Responsável,Criado,Resolvido,Data limite,Descrição,Pai',
  'Viabilizar ampliação física do campus,KAN-1,10001,Tarefa,Em andamento,Alta,Vinícius Lima Santos,01/out/26 9:15 AM,,18/out/26,Ampliação com novo bloco,',
  'Projeto arquitetônico,KAN-3,10003,Subtarefa,Concluído,Média,,02/out/26 8:00 AM,10/out/26 5:30 PM,,,10001',
  'Acompanhar reforma do auditório,KAN-10,10010,Tarefa,Concluído,Média,,15/set/26 3:00 PM,30/set/26 11:00 AM,,,',
  'Buscar melhorias do mini-auditório,KAN-11,10011,Tarefa,A fazer,Média,,20/set/26 3:00 PM,,,,',
].join('\n');

test('importar do Jira: prévia, confirmação e reimportação sem duplicar', async ({ page }) => {
  await enter(page);
  const file = { name: 'jira.csv', mimeType: 'text/csv', buffer: Buffer.from(JIRA_CSV) };

  await page.getByRole('button', { name: 'Importar do Jira' }).click();
  const dialog = page.getByRole('dialog', { name: 'Importar do Jira' });
  await dialog.getByLabel('Arquivo CSV do Jira').setInputFiles(file);
  const preview = dialog.getByRole('region', { name: 'Prévia da importação' });
  await expect(preview.getByText('KAN-1', { exact: true })).toBeVisible();
  await expect(preview.getByText('Viabilizar ampliação física do campus')).toBeVisible();
  await expect(preview.getByText('1/1')).toBeVisible(); // subtarefa concluída do KAN-1
  await expect(dialog.getByRole('button', { name: 'Importar 3 projetos' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Importar 3 projetos' }).click();

  await expect(page.getByText('Importação concluída')).toBeVisible();
  await expect(column(page, 'Em andamento')).toContainText('Viabilizar ampliação física do campus');
  await expect(column(page, 'Concluído')).toContainText('Acompanhar reforma do auditório');
  await expect(column(page, 'A fazer')).toContainText('Buscar melhorias do mini-auditório');

  // Reimportar o mesmo arquivo: a prévia marca "atualiza" e nada é duplicado
  await page.getByRole('button', { name: 'Importar do Jira' }).click();
  await dialog.getByLabel('Arquivo CSV do Jira').setInputFiles(file);
  await expect(dialog.getByText('atualiza', { exact: true })).toHaveCount(3);
  await expect(dialog.getByText('(0 novos, 3 atualizados)')).toBeVisible();
  await dialog.getByRole('button', { name: 'Importar 3 projetos' }).click();
  await expect(page.getByText('Importação concluída')).toBeVisible();
  await expect(card(page, 'Viabilizar ampliação física do campus')).toHaveCount(1);
});

test('remover a demonstração deixa só os projetos reais', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: 'Remover demonstração' }).click();
  await expect(page.getByText('14 projetos de demonstração removidos')).toBeVisible();
  await expect(page.locator('[data-rfd-draggable-id]')).toHaveCount(5); // 2 criados no painel + 3 importados do Jira
});

test('sair encerra a sessão deste navegador', async ({ page }) => {
  await enter(page);
  await page.getByTitle('Sair deste navegador').click();
  await expect(page).toHaveURL(`${BASE}/`);
  await page.goto('/admin/');
  await expect(page).toHaveURL(`${BASE}/`);
});
