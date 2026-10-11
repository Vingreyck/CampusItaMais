/**
 * PLANTA PROVISÓRIA do Campus Prof. Alberto Carvalho (UFS Itabaiana).
 *
 * ⚠ PENDENTE: substituir pelos dados da planta oficial do campus.
 * Todo o cenário 3D é gerado a partir destas listas, então trocar a planta = editar este arquivo
 * (posições em "metros" no plano XZ; X cresce para leste, Z cresce para sul/entrada).
 */

export interface BuildingDef {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number; // largura (eixo X)
  d: number; // profundidade (eixo Z)
  h: number; // altura
  rot?: number;
  accent: string; // cor da cobertura
  kind?: 'block' | 'tower';
}

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export const CAMPUS_BOUNDS = { minX: -112, maxX: 112, minZ: -82, maxZ: 104 };

export const BUILDINGS: BuildingDef[] = [
  { id: 'direcao', name: 'Direção e Administração', x: 0, z: 46, w: 36, d: 14, h: 8, accent: '#7aa7c7' },
  { id: 'biblioteca', name: 'Biblioteca', x: -42, z: 18, w: 24, d: 22, h: 10, accent: '#9b8fc9' },
  { id: 'didatica1', name: 'Didática I', x: -40, z: -20, w: 36, d: 12, h: 9, accent: '#e0a77a' },
  { id: 'didatica2', name: 'Didática II', x: 0, z: -20, w: 32, d: 12, h: 9, accent: '#e0a77a' },
  { id: 'didatica3', name: 'Didática III', x: 44, z: -20, w: 36, d: 12, h: 9, accent: '#e0a77a' },
  { id: 'laboratorios', name: 'Laboratórios', x: 44, z: 18, w: 26, d: 20, h: 7, accent: '#86b8a4' },
  { id: 'ru', name: 'Restaurante Universitário', x: -70, z: 52, w: 22, d: 16, h: 6, accent: '#d79a8a' },
  { id: 'auditorio', name: 'Auditório', x: 40, z: 52, w: 20, d: 16, h: 8, accent: '#b39ad1' },
  { id: 'ginasio', name: 'Ginásio Poliesportivo', x: 88, z: -4, w: 26, d: 36, h: 12, accent: '#8fb3d9' },
  { id: 'departamentos', name: 'Departamentos', x: -10, z: -54, w: 60, d: 12, h: 8, accent: '#c9b48a' },
  { id: 'pesquisa', name: 'Núcleo de Pesquisa e Inovação', x: 52, z: -54, w: 22, d: 14, h: 7, accent: '#86b8a4' },
  { id: 'vivencia', name: 'Centro de Vivência', x: 0, z: 12, w: 9, d: 9, h: 4, accent: '#e6c46b' },
  { id: 'portaria', name: 'Portaria', x: 7, z: 96, w: 6, d: 5, h: 3.5, accent: '#7aa7c7' },
  { id: 'caixa', name: "Caixa-d'água", x: -92, z: -46, w: 8, d: 8, h: 18, accent: '#a7b4c2', kind: 'tower' },
];

/** Vias e calçadas (faixas planas). */
export const WALKWAYS: Rect[] = [
  { x: 0, z: 79, w: 9, d: 48 }, // avenida de acesso
  { x: 0, z: 33, w: 170, d: 5 },
  { x: 0, z: 0, w: 170, d: 5 },
  { x: 0, z: -37, w: 170, d: 5 },
  { x: -64, z: -2, w: 5, d: 74 },
  { x: 66, z: -2, w: 5, d: 74 },
  { x: -36, z: 69, w: 64, d: 7 }, // acesso ao estacionamento
];

export const PLAZA = { x: 0, z: 12, r: 14 };
export const PARKING: Rect = { x: -40, z: 86, w: 52, d: 20 };
export const COURT: Rect = { x: 88, z: 40, w: 18, d: 30 };

function insideRect(x: number, z: number, r: Rect, margin: number) {
  return Math.abs(x - r.x) < r.w / 2 + margin && Math.abs(z - r.z) < r.d / 2 + margin;
}

export function isOccupied(x: number, z: number, margin = 3) {
  if (BUILDINGS.some((b) => insideRect(x, z, b, margin))) return true;
  if (WALKWAYS.some((r) => insideRect(x, z, r, margin * 0.6))) return true;
  if (insideRect(x, z, PARKING, margin) || insideRect(x, z, COURT, margin)) return true;
  return Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + margin * 0.5;
}

/** Gerador pseudoaleatório determinístico (as árvores ficam sempre no mesmo lugar). */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TREE_COLORS = ['#6fa36b', '#7db46f', '#5e9562', '#8cbf76', '#6b9f7d'];

export const TREES = (() => {
  const rand = mulberry32(42);
  const out: { x: number; z: number; s: number; r: number; c: string }[] = [];
  let attempts = 0;
  while (out.length < 170 && attempts < 6000) {
    attempts++;
    const x = CAMPUS_BOUNDS.minX + 4 + rand() * (CAMPUS_BOUNDS.maxX - CAMPUS_BOUNDS.minX - 8);
    const z = CAMPUS_BOUNDS.minZ + 4 + rand() * (CAMPUS_BOUNDS.maxZ - CAMPUS_BOUNDS.minZ - 8);
    if (isOccupied(x, z, 3.5)) continue;
    if (out.some((t) => Math.hypot(t.x - x, t.z - z) < 5.5)) continue;
    out.push({ x, z, s: 0.8 + rand() * 0.6, r: rand() * Math.PI, c: TREE_COLORS[Math.floor(rand() * TREE_COLORS.length)] });
  }
  // Fileiras ao longo da avenida de acesso
  for (let z = 60; z <= 100; z += 8) {
    out.push({ x: -7.5, z, s: 1, r: z, c: '#6fa36b' }, { x: 7.5, z: z + 4, s: 1, r: z, c: '#7db46f' });
  }
  return out;
})();

export const CARS = (() => {
  const rand = mulberry32(7);
  const colors = ['#e2e8f0', '#94a3b8', '#ef4444', '#3b82f6', '#f8fafc', '#1e293b', '#f59e0b'];
  const out: { x: number; z: number; c: string }[] = [];
  for (let i = 0; i < 9; i++) {
    for (const row of [-5, 5]) {
      if (rand() < 0.45) continue;
      out.push({ x: PARKING.x - PARKING.w / 2 + 4 + i * 5.4, z: PARKING.z + row, c: colors[Math.floor(rand() * colors.length)] });
    }
  }
  return out;
})();

export function clampToCampus(x: number, z: number) {
  return {
    x: Math.min(CAMPUS_BOUNDS.maxX, Math.max(CAMPUS_BOUNDS.minX, x)),
    z: Math.min(CAMPUS_BOUNDS.maxZ, Math.max(CAMPUS_BOUNDS.minZ, z)),
  };
}
