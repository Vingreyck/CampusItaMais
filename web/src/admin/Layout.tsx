import { NavLink, Outlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ExternalLink, FileBarChart, KeyRound, LogOut, Map, SquareKanban } from 'lucide-react';
import { api } from './api';
import { Avatar, Spinner } from './ui';

const NAV = [
  { to: '/', label: 'Quadro', icon: SquareKanban, end: true },
  { to: '/mapa', label: 'Mapa do campus', icon: Map },
  { to: '/relatorio', label: 'Relatório', icon: FileBarChart },
  { to: '/acessos', label: 'Acessos', icon: KeyRound },
];

export function Layout() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });

  if (!me.data) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="size-7" />
      </div>
    );
  }

  const logout = async () => {
    if (!confirm('Sair do painel neste navegador? Para voltar será preciso abrir o seu link de acesso novamente.')) return;
    await api.logout().catch(() => undefined);
    window.location.replace('/');
  };

  return (
    <div className="flex h-full flex-col md:flex-row print:block">
      <aside className="flex shrink-0 flex-col bg-slate-950 text-slate-300 md:w-[236px] print:hidden">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="grid size-9 place-items-center rounded-xl bg-white/10 text-lg font-black text-sky-400">+</div>
          <div className="leading-tight">
            <p className="text-sm font-extrabold text-white">
              Campus Ita<span className="text-sky-400">+</span>
            </p>
            <p className="text-[11px] text-slate-500">Painel de gestão</p>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium whitespace-nowrap transition',
                  isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white',
                )
              }
            >
              <Icon className="size-4.5" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto hidden space-y-1 border-t border-white/5 p-3 md:block">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <ExternalLink className="size-4" /> Ver site público
          </a>
          <div className="flex items-center gap-3 rounded-xl px-3 py-2">
            <Avatar name={me.data.name} size="md" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold text-white">{me.data.name}</p>
              <p className="text-[11px] text-slate-500">{me.data.isMaster ? 'Chave mestra' : 'Acesso pessoal'}</p>
            </div>
            <button type="button" onClick={logout} title="Sair deste navegador" className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-white">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden print:overflow-visible">
        <Outlet />
      </main>
    </div>
  );
}
