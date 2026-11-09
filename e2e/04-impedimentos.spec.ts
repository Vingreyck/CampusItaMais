import { expect, test, type Page } from '@playwright/test';
import { MASTER_KEY } from './playwright.config';

/** Mapeamento de Impedimentos: cadastro, vínculo com ação, indicadores, busca, edição, histórico e persistência. */
test.describe.configure({ mode: 'serial' });

const ACTION = 'Reforma elétrica E2E';

async function enter(page: Page) {
  await page.goto(`/acesso#${MASTER_KEY}`);
  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.getByRole('heading', { name: 'Quadro de projetos' })).toBeVisible();
}

const rows = (page: Page) => page.getByRole('list', { name: 'Lista de impedimentos' }).getByRole('listitem');
const kpi = (page: Page, label: RegExp) => page.getByRole('region', { name: 'Indicadores' }).getByRole('button', { name: label });

test('tela vazia, depois cadastro completo vinculado a uma ação do plano', async ({ page }) => {
  await enter(page);
  await page.request.post('/api/admin/tasks', { data: { title: ACTION, category: 'Infraestrutura' }, headers: { 'X-CIM-Admin': '1' } });

  await page.getByRole('link', { name: 'Impedimentos' }).click();
  await expect(page).toHaveURL(/\/admin\/impedimentos$/);
  await expect(page.getByRole('heading', { name: 'Mapeamento de impedimentos' })).toBeVisible();
  await expect(page.getByText('Nenhum impedimento registrado ainda')).toBeVisible();
  await expect(kpi(page, /Impedimentos registrados/)).toContainText('0');

  await page.getByRole('button', { name: 'Registrar impedimento' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Registrar impedimento' });
  await expect(dialog.getByRole('button', { name: 'Registrar impedimento' })).toBeDisabled(); // título é obrigatório

  // 1. Ação vinculada: busca entre as ações cadastradas
  const picker = dialog.getByRole('combobox', { name: 'Buscar ação do Plano de Gestão' });
  await picker.fill('eletrica');
  await dialog.getByRole('option', { name: new RegExp(ACTION) }).click();
  await expect(dialog.getByText(new RegExp(`ITA-\\d+ · ${ACTION}`))).toBeVisible();
  await expect(dialog.getByLabel('Ação ou eixo (sem vínculo)')).toHaveCount(0); // sem duplicar a informação

  await dialog.getByLabel('Impedimento *').fill('Orçamento da obra não aprovado');
  await dialog.getByLabel('Detalhes do problema').fill('A reitoria ainda não liberou o recurso para a reforma.');
  await dialog.getByLabel('Categoria').selectOption('financeiro');
  await dialog.getByRole('radio', { name: 'Alto' }).click();
  await dialog.getByLabel('Responsável').fill('Coordenação de Infraestrutura');
  await dialog.getByLabel('Providência necessária').fill('Reunião com a PROAD para priorizar o empenho.');
  await dialog.getByLabel('Prazo').fill('2020-01-15'); // já vencido
  await dialog.getByRole('radio', { name: 'Em resolução' }).click();
  await dialog.getByRole('button', { name: 'Registrar impedimento' }).click();

  await expect(page.getByText('IMP-1 registrado')).toBeVisible();
  await expect(dialog).toHaveCount(0);
  const row = rows(page).filter({ hasText: 'Orçamento da obra não aprovado' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(`ITA-`);
  await expect(row).toContainText(ACTION);
  await expect(row).toContainText('Financeiro');
  await expect(row).toContainText('Impacto alto');
  await expect(row).toContainText('Atrasado');
  await expect(row).toContainText('Prazo 15/01/2020');
  await expect(row).toContainText('Coordenação de Infraestrutura');
  await expect(row).toContainText('Providência: Reunião com a PROAD');
  await expect(row.getByLabel('Situação de IMP-1')).toHaveValue('em_resolucao');
});

test('sem ação cadastrada: informa o eixo em texto livre', async ({ page }) => {
  await enter(page);
  await page.goto('/admin/impedimentos');
  await page.getByRole('button', { name: 'Registrar impedimento' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Registrar impedimento' });
  await dialog.getByLabel('Impedimento *').fill('Internet instável no bloco A');
  await dialog.getByLabel('Ação ou eixo (sem vínculo)').fill('Infraestrutura');
  await dialog.getByLabel('Categoria').selectOption('operacional');
  await dialog.getByRole('radio', { name: 'Baixo' }).click();
  await dialog.getByRole('button', { name: 'Registrar impedimento' }).click();
  await expect(page.getByText('IMP-2 registrado')).toBeVisible();
  const row = rows(page).filter({ hasText: 'Internet instável' });
  await expect(row).toContainText('Infraestrutura');
  await expect(row).toContainText('Operacional');
  await expect(row).toContainText('Impacto baixo');
  await expect(row).not.toContainText('Atrasado');
  await expect(row.getByLabel('Situação de IMP-2')).toHaveValue('em_analise'); // padrão
});

test('painel de indicadores, filtros e busca por nome ou descrição', async ({ page }) => {
  await enter(page);
  await page.goto('/admin/impedimentos');
  await expect(rows(page)).toHaveCount(2);
  await expect(kpi(page, /Impedimentos registrados/)).toContainText('2');
  await expect(kpi(page, /Em análise/)).toContainText('1');
  await expect(kpi(page, /Em resolução/)).toContainText('1');
  await expect(kpi(page, /Resolvidos/)).toContainText('0');
  await expect(kpi(page, /Impacto alto em aberto/)).toContainText('1');
  await expect(kpi(page, /Prazo vencido/)).toContainText('1');

  // Mais crítico primeiro: o atrasado e de impacto alto vem antes
  await expect(rows(page).first()).toContainText('Orçamento da obra');

  // Clicar no indicador filtra a lista; clicar de novo limpa
  await kpi(page, /Prazo vencido/).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Orçamento da obra');
  await kpi(page, /Prazo vencido/).click();
  await expect(rows(page)).toHaveCount(2);
  await kpi(page, /Em análise/).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Internet instável');
  await page.getByRole('button', { name: 'Limpar filtros' }).click();

  // Busca por nome e por descrição (sem diferenciar acento nem maiúscula)
  const search = page.getByLabel('Pesquisar impedimentos');
  await search.fill('INTERNET');
  await expect(rows(page)).toHaveCount(1);
  await search.fill('reitoria liberou');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Orçamento da obra');
  await search.fill('orcamento');
  await expect(rows(page)).toHaveCount(1);
  await search.fill('nada disso existe');
  await expect(page.getByText('Nenhum impedimento corresponde a estes filtros.')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros' }).click();

  // Filtros por impacto e categoria
  await page.getByLabel('Filtrar por impacto').selectOption('baixo');
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel('Filtrar por impacto').selectOption('');
  await page.getByLabel('Filtrar por categoria').selectOption('financeiro');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Orçamento da obra');
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(rows(page)).toHaveCount(2);
});

test('editar: resolver o impedimento, ver o histórico e a mudança nos indicadores', async ({ page }) => {
  await enter(page);
  await page.goto('/admin/impedimentos');
  await page.getByRole('button', { name: /Abrir IMP-1/ }).click();
  const dialog = page.getByRole('dialog', { name: /Editar impedimento IMP-1/ });
  await expect(dialog.getByLabel('Impedimento *')).toHaveValue('Orçamento da obra não aprovado');
  await expect(dialog.getByRole('radio', { name: 'Em resolução' })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByRole('radio', { name: 'Alto' })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByText(new RegExp(`ITA-\\d+ · ${ACTION}`))).toBeVisible();

  await dialog.getByRole('radio', { name: 'Resolvido' }).click();
  await dialog.getByLabel('Providência necessária').fill('Recurso liberado pela PROAD; obra autorizada.');
  await dialog.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('IMP-1 atualizado')).toBeVisible();

  const row = rows(page).filter({ hasText: 'Orçamento da obra' });
  await expect(row.getByLabel('Situação de IMP-1')).toHaveValue('resolvido');
  await expect(row).toContainText(/Resolvido em \d{2}\/\d{2}\/\d{4}/);
  await expect(row).not.toContainText('Atrasado'); // resolvido não é atrasado
  await expect(row).toContainText('Recurso liberado pela PROAD');
  await expect(rows(page).last()).toContainText('Orçamento da obra'); // resolvidos vão para o fim
  await expect(kpi(page, /Resolvidos/)).toContainText('1');
  await expect(kpi(page, /Prazo vencido/)).toContainText('0');
  await expect(kpi(page, /Impacto alto em aberto/)).toContainText('0');

  // Histórico guardado
  await page.getByRole('button', { name: /Abrir IMP-1/ }).click();
  const again = page.getByRole('dialog', { name: /Editar impedimento IMP-1/ });
  const history = again.getByRole('region', { name: 'Histórico do impedimento' });
  await expect(history.getByText('registrou o impedimento (em resolução)')).toBeVisible();
  await expect(history.getByText('mudou a situação de “Em resolução” para “Resolvido”')).toBeVisible();
  await expect(history.getByText('editou a providência necessária')).toBeVisible();
  await again.getByRole('button', { name: 'Cancelar' }).click();

  // Troca rápida de situação direto na lista
  await rows(page).filter({ hasText: 'Internet instável' }).getByLabel('Situação de IMP-2').selectOption('em_resolucao');
  await expect(page.getByText('IMP-2: em resolução')).toBeVisible();
  await expect(kpi(page, /Em resolução/)).toContainText('1');
  await expect(kpi(page, /Em análise/)).toContainText('0');
});

test('os registros permanecem salvos e não existem para quem não tem o link do painel', async ({ page, browser }) => {
  await enter(page);
  await page.goto('/admin/impedimentos');
  await page.reload();
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).filter({ hasText: 'Orçamento da obra' }).getByLabel('Situação de IMP-1')).toHaveValue('resolvido');

  // Não existe exclusão: o registro vira histórico institucional
  await expect(page.getByRole('button', { name: /excluir|apagar/i })).toHaveCount(0);

  const visitor = await browser.newContext();
  const api = await visitor.request.get('/api/admin/impediments', { baseURL: 'http://localhost:3210' });
  expect(api.status()).toBe(404);
  const v = await visitor.newPage();
  await v.goto('http://localhost:3210/admin/impedimentos');
  await expect(v).toHaveURL('http://localhost:3210/');
  await expect(v.getByText('Mapeamento de impedimentos')).toHaveCount(0);
  await expect(v.getByText('Orçamento da obra')).toHaveCount(0);
  await visitor.close();
});

test('no celular a lista e o formulário cabem na tela', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.goto('/admin/impedimentos');
  await expect(rows(page).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Registrar impedimento' }).first().click();
  const box = (await page.getByRole('dialog', { name: 'Registrar impedimento' }).boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(390);
  expect(box.x).toBeGreaterThanOrEqual(0);
});
