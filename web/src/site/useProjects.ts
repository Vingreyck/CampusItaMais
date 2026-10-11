import { useEffect, useState } from 'react';
import { request } from '@shared/http';
import type { PublicProject } from '@shared/types';

/** Projetos públicos, atualizados a cada minuto. */
export function useProjects() {
  const [projects, setProjects] = useState<PublicProject[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      request<{ projects: PublicProject[] }>('GET', '/api/public/projects')
        .then((d) => {
          if (!alive) return;
          setProjects(d.projects);
          setError(false);
        })
        .catch(() => alive && setError(true));
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return { projects, error };
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}
