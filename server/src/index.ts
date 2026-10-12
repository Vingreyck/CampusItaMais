import { env } from './env';
import { closeDb, initDb } from './db';
import { ensureMasterKey, seedDemo } from './seed';
import { createApp } from './app';
import { activeMailProvider } from './mail';

await initDb();
await ensureMasterKey();
await seedDemo();

const server = createApp().listen(env.port, '0.0.0.0', () => {
  console.log(`[server] Campus Ita+ na porta ${env.port} (${env.isProd ? 'produção' : 'desenvolvimento'})`);
  console.log(`[server] URL pública: ${env.publicUrl} · e-mail: ${activeMailProvider()}`);
});

// Encerramento limpo (redeploy no Railway, Ctrl+C, reinício do modo watch): termina as requisições e fecha o banco.
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    console.log(`[server] ${signal} recebido, encerrando…`);
    const force = setTimeout(() => process.exit(1), 8000);
    server.close(() => {
      closeDb()
        .catch((err) => console.error('[db] erro ao fechar', err))
        .finally(() => {
          clearTimeout(force);
          process.exit(0);
        });
    });
    server.closeAllConnections?.();
  });
}
