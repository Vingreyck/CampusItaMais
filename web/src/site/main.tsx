import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import './site.css';
import { PublicPage } from './PublicPage';

// Sem StrictMode: o duplo-montar de efeitos em dev esvazia os rótulos <Html> do drei.
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes>
      {/* Rota única: a URL /projeto/:id só seleciona o projeto, sem remontar o 3D. */}
      <Route path="*" element={<PublicPage />} />
    </Routes>
  </BrowserRouter>,
);
