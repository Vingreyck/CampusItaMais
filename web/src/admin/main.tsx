import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import './admin.css';
import { ApiError } from '@shared/http';
import { Layout } from './Layout';
import { BoardPage } from './BoardPage';
import { TaskModal } from './TaskModal';
import { MapPage } from './MapPage';
import { ReportPage } from './ReportPage';
import { AccessPage } from './AccessPage';

// Sessão expirada/revogada: a API passa a responder 404 e o painel some — volta para o site público.
const onApiError = (error: unknown) => {
  if (error instanceof ApiError && error.status === 404 && error.message === 'Rota não encontrada') {
    window.location.replace('/');
  }
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: false } },
  mutationCache: new MutationCache({ onError: onApiError }),
});
queryClient.getQueryCache().subscribe((e) => {
  if (e.type === 'updated' && e.action.type === 'error') onApiError(e.action.error);
});

// Sem StrictMode: o duplo-montar de efeitos em dev esvazia os rótulos <Html> do drei.
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter basename="/admin">
      <Routes>
        <Route element={<Layout />}>
          <Route element={<BoardPage />}>
            <Route index element={null} />
            <Route path="tarefa/:taskId" element={<TaskModal />} />
          </Route>
          <Route path="mapa" element={<MapPage />} />
          <Route path="relatorio" element={<ReportPage />} />
          <Route path="acessos" element={<AccessPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
    <Toaster position="bottom-right" richColors closeButton />
  </QueryClientProvider>,
);
