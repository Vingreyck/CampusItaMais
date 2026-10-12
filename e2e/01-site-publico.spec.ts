import { expect, test, type Page } from '@playwright/test';

/** Site público: só a planta 3D e o filtro de 3 bolinhas; clique no projeto → zoom + descrição + checklist. */

const filter = (page: Page) => page.getByRole('toolbar', { name: 'Filtrar projetos por situação' });

test.describe('site público', () => {
  test('mostra apenas a planta e o filtro, sem qualquer acesso ao painel', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect(filter(page).getByRole('button')).toHaveCount(3);
    await expect(filter(page).getByRole('button', { name: 'Ideias e planejamento: 5 projeto(s)' })).toBeVisible();
    await expect(filter(page).getByRole('button', { name: 'Em andamento: 4 projeto(s)' })).toBeVisible();
    await expect(filter(page).getByRole('button', { name: 'Concluídos: 5 projeto(s)' })).toBeVisible();

    // Nenhum link, botão ou texto que leve ao painel
    await expect(page.locator('a[href*="admin"], a[href*="acesso"]')).toHaveCount(0);
    await expect(page.getByText(/login|entrar|painel|administra/i)).toHaveCount(0);
    const scripts = await page.locator('script[src]').evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).src));
    for (const src of scripts) {
      const code = await (await page.request.get(src)).text();
      expect(code, src).not.toContain('/api/admin');
    }
  });

  test('cada bolinha filtra os projetos da sua cor', async ({ page }) => {
    await page.goto('/');
    for (const [name, count, sample] of [
      ['Ideias e planejamento: 5 projeto(s)', 5, 'Usina solar fotovoltaica'],
      ['Em andamento: 4 projeto(s)', 4, 'Reforma e ampliação da Biblioteca'],
      ['Concluídos: 5 projeto(s)', 5, 'Wi-Fi em todo o campus'],
    ] as const) {
      const dot = filter(page).getByRole('button', { name });
      await dot.click();
      await expect(dot).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByText(`${count} projetos`, { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: new RegExp(sample) })).toBeVisible();
    }
    // Clicar de novo na bolinha ativa volta a mostrar tudo
    await filter(page).getByRole('button', { name: 'Concluídos: 5 projeto(s)' }).click();
    await expect(page.getByText('5 projetos', { exact: true })).toHaveCount(0);
  });

  test('clicar num projeto em andamento dá zoom e mostra descrição e checklist', async ({ page }) => {
    await page.goto('/');
    await filter(page).getByRole('button', { name: 'Em andamento: 4 projeto(s)' }).click();
    await page.getByRole('button', { name: /Reforma e ampliação da Biblioteca/ }).click();
    await expect(page).toHaveURL(/\/projeto\/[0-9a-f-]{36}$/);

    const panel = page.getByRole('complementary', { name: 'Projeto: Reforma e ampliação da Biblioteca' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Em andamento', { exact: true })).toBeVisible();
    await expect(panel.getByText(/Ampliação do salão de leitura/)).toBeVisible();
    await expect(panel.getByText('3 de 6 etapas concluídas')).toBeVisible();
    await expect(panel.getByText('O que foi feito')).toBeVisible();
    await expect(panel.getByText('Projeto arquitetônico aprovado')).toBeVisible();
    await expect(panel.getByText('Concluída em 20 jan 2026 · Engenharia')).toBeVisible();
    await expect(panel.getByText('Pendente · Empresa contratada').first()).toBeVisible();

    // Setas navegam entre os projetos do filtro; Esc fecha
    const firstUrl = page.url();
    await page.keyboard.press('ArrowRight');
    await expect(page).not.toHaveURL(firstUrl);
    await expect(page).toHaveURL(/\/projeto\/[0-9a-f-]{36}$/);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('complementary', { name: /^Projeto: / })).toHaveCount(0);
  });

  test('link direto abre o projeto; link inválido volta para o campus', async ({ page, request }) => {
    const { projects } = await (await request.get('/api/public/projects')).json();
    const wifi = projects.find((p: { title: string }) => p.title === 'Wi-Fi em todo o campus');
    await page.goto(`/projeto/${wifi.id}`);
    await expect(page.getByRole('complementary', { name: 'Projeto: Wi-Fi em todo o campus' })).toBeVisible();
    await expect(page.getByText('Concluído em')).toBeVisible();

    await page.goto('/projeto/00000000-0000-4000-8000-000000000000');
    await expect(page).toHaveURL(/\/$/);
  });

  test('endereços do painel sem a chave mostram só o campus', async ({ page }) => {
    for (const url of ['/admin', '/admin/tarefa/ITA-1', '/admin/acessos', '/acesso', '/acesso#chave-errada-chave-errada-chave-errada-xx']) {
      await page.goto(url);
      await expect(page).toHaveURL(/\/$/);
      await expect(filter(page)).toBeVisible();
      await expect(page.getByText('Quadro de projetos')).toHaveCount(0);
    }
  });

  test('no celular o painel do projeto vira uma folha inferior', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(filter(page)).toBeInViewport();
    await filter(page).getByRole('button', { name: 'Concluídos: 5 projeto(s)' }).click();
    await page.getByRole('button', { name: /Wi-Fi em todo o campus/ }).click();
    const panel = page.getByRole('complementary', { name: 'Projeto: Wi-Fi em todo o campus' });
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.width).toBeGreaterThan(360);
    expect(box.y + box.height).toBeGreaterThan(820);
    await expect(filter(page)).toHaveCount(0); // o filtro dá lugar ao painel
  });
});
