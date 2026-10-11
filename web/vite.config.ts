import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Dois builds independentes:
 *  - site  → dist/site       (só o campus 3D público; nenhum código do painel entra aqui)
 *  - admin → dist/admin      (painel; o servidor só entrega esses arquivos a quem tem sessão)
 */
export default defineConfig(({ command, mode }) => {
  const shared = {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@shared': path.join(root, 'src/shared') } },
  };

  if (command === 'serve') {
    return {
      ...shared,
      plugins: [...shared.plugins, adminDevFallback()],
      server: {
        port: 5173,
        proxy: { '/api': 'http://localhost:3000', '/acesso': 'http://localhost:3000' },
      },
    };
  }

  const isAdmin = mode === 'admin';
  return {
    ...shared,
    publicDir: isAdmin ? false : 'public',
    build: {
      outDir: path.join(root, isAdmin ? 'dist/admin' : 'dist/site'),
      emptyOutDir: true,
      assetsDir: isAdmin ? 'admin/assets' : 'assets',
      chunkSizeWarningLimit: 2500,
      rollupOptions: {
        input: path.join(root, isAdmin ? 'admin/index.html' : 'index.html'),
      },
    },
  };
});

/** Em desenvolvimento, rotas profundas do painel (/admin/...) devem abrir admin/index.html. */
function adminDevFallback(): Plugin {
  return {
    name: 'admin-dev-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (url.startsWith('/admin') && req.headers.accept?.includes('text/html') && !path.extname(url)) {
          req.url = '/admin/index.html';
        }
        next();
      });
    },
  };
}
