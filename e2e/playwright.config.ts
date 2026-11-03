import { defineConfig, devices } from '@playwright/test';

/**
 * Testes de ponta a ponta: sobem o build de produção (server/dist + web/dist) com um banco
 * novo em .data-e2e e usam o navegador como uma pessoa usaria.
 *
 *   npm run test:e2e
 */
export const PORT = 3210;
export const FAKE_GROQ_PORT = 3211;
export const MASTER_KEY = 'chave-mestra-e2e-'.padEnd(48, 'k');

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'pt-BR',
    timezoneId: 'America/Maceio',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'node fake-groq.mjs',
      url: `http://localhost:${FAKE_GROQ_PORT}/health`,
      reuseExistingServer: false,
      stdout: 'ignore',
      env: { FAKE_GROQ_PORT: String(FAKE_GROQ_PORT) },
    },
    {
    command: 'node ../server/dist/index.js',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 90_000,
    stdout: 'ignore',
    env: {
      CIM_SKIP_DOTENV: '1',
      NODE_ENV: 'production',
      PORT: String(PORT),
      DATA_DIR: '.data-e2e',
      DATABASE_URL: '',
      JWT_SECRET: 'segredo-e2e-'.padEnd(64, 's'),
      ADMIN_ACCESS_KEY: MASTER_KEY,
      ADMIN_NAME: 'Direção E2E',
      SEED_DEMO: 'true',
      PUBLIC_URL: `http://localhost:${PORT}`,
      RESEND_API_KEY: '',
      BREVO_API_KEY: '',
      SMTP_HOST: '',
      GROQ_API_KEY: 'gsk_e2e_teste',
      GROQ_BASE_URL: `http://localhost:${FAKE_GROQ_PORT}/openai/v1`,
      AI_DAILY_LIMIT: '50',
    },
  },
  ],
});
