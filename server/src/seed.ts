import { eq, sql } from 'drizzle-orm';
import { db } from './db';
import { accessKeys, activities, subtasks, tasks } from './db/schema';
import { hashToken } from './auth';
import { env } from './env';
import type { Status } from './util';

/** Mantém a chave mestra do banco em sincronia com ADMIN_ACCESS_KEY (trocar a variável derruba as sessões antigas). */
export async function ensureMasterKey() {
  if (!env.admin.accessKey) {
    console.warn('[acesso] ADMIN_ACCESS_KEY não definida: o painel só aceita chaves já cadastradas.');
    return;
  }
  const tokenHash = hashToken(env.admin.accessKey);
  const [master] = await db.select().from(accessKeys).where(eq(accessKeys.isMaster, true));
  if (!master) {
    await db.insert(accessKeys).values({ name: env.admin.name, tokenHash, isMaster: true });
    console.log('[acesso] Chave mestra registrada');
  } else if (master.tokenHash !== tokenHash || master.name !== env.admin.name || master.revokedAt) {
    await db
      .update(accessKeys)
      .set({ tokenHash, name: env.admin.name, revokedAt: null })
      .where(eq(accessKeys.id, master.id));
    console.log('[acesso] Chave mestra atualizada');
  }
}

type DemoSub = [title: string, done: boolean, completedAt?: string, responsible?: string];
interface DemoTask {
  title: string;
  status: Status;
  category: string;
  description: string;
  responsibleName: string;
  pos: [number, number];
  startDate?: string;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  subs: DemoSub[];
}

// Projetos fictícios só para demonstrar o sistema — removíveis pelo painel ("Remover demonstração").
const DEMO: DemoTask[] = [
  {
    title: 'Reforma e ampliação da Biblioteca',
    status: 'em_andamento',
    category: 'Infraestrutura',
    description:
      'Ampliação do salão de leitura, novas cabines de estudo individual, troca do mobiliário e modernização do acervo com sistema de autoatendimento.',
    responsibleName: 'Coordenação de Infraestrutura',
    pos: [-42, 18],
    startDate: '2026-03-02',
    dueDate: '2026-12-15',
    createdAt: '2025-11-10',
    subs: [
      ['Projeto arquitetônico aprovado', true, '2026-01-20', 'Engenharia'],
      ['Licitação concluída', true, '2026-02-25', 'Setor de Compras'],
      ['Demolição das divisórias antigas', true, '2026-04-08', 'Empresa contratada'],
      ['Instalação das cabines de estudo', false, undefined, 'Empresa contratada'],
      ['Novo mobiliário do salão de leitura', false, undefined, 'Setor de Compras'],
      ['Sistema de autoatendimento do acervo', false, undefined, 'TI'],
    ],
  },
  {
    title: 'Iluminação LED nas vias do campus',
    status: 'concluido',
    category: 'Segurança',
    description: 'Substituição de toda a iluminação externa por luminárias LED, reforçando a segurança dos estudantes do noturno.',
    responsibleName: 'Prefeitura do Campus',
    pos: [-18, 70],
    startDate: '2025-08-04',
    completedAt: '2025-12-12',
    createdAt: '2025-06-18',
    subs: [
      ['Levantamento dos pontos de iluminação', true, '2025-08-20'],
      ['Compra das luminárias', true, '2025-10-02'],
      ['Instalação na via de acesso e estacionamento', true, '2025-11-14'],
      ['Instalação entre os blocos didáticos', true, '2025-12-12'],
    ],
  },
  {
    title: 'Climatização das salas da Didática I',
    status: 'concluido',
    category: 'Ensino',
    description: 'Instalação de ar-condicionado inverter em todas as salas de aula da Didática I, com adequação da rede elétrica.',
    responsibleName: 'Coordenação de Infraestrutura',
    pos: [-40, -20],
    startDate: '2026-01-12',
    completedAt: '2026-05-29',
    createdAt: '2025-10-01',
    subs: [
      ['Adequação do quadro elétrico', true, '2026-02-10'],
      ['Instalação dos aparelhos (térreo)', true, '2026-04-02'],
      ['Instalação dos aparelhos (1º andar)', true, '2026-05-20'],
      ['Vistoria e entrega', true, '2026-05-29'],
    ],
  },
  {
    title: 'Acessibilidade: rampas e piso tátil',
    status: 'em_andamento',
    category: 'Acessibilidade',
    description: 'Rotas acessíveis ligando a portaria a todos os blocos, com rampas, corrimãos e piso tátil direcional.',
    responsibleName: 'Núcleo de Acessibilidade',
    pos: [0, -20],
    startDate: '2026-06-01',
    dueDate: '2027-02-28',
    createdAt: '2026-02-14',
    subs: [
      ['Mapeamento das rotas acessíveis', true, '2026-06-20', 'Núcleo de Acessibilidade'],
      ['Rampas da Didática II', true, '2026-08-30'],
      ['Piso tátil da via principal', false],
      ['Corrimãos e sinalização em braile', false],
    ],
  },
  {
    title: 'Usina solar fotovoltaica',
    status: 'ideia',
    category: 'Sustentabilidade',
    description: 'Estudo para instalação de painéis solares capazes de suprir parte do consumo de energia do campus.',
    responsibleName: '',
    pos: [-88, 8],
    createdAt: '2026-07-22',
    subs: [['Estudo de viabilidade técnica', false], ['Buscar fontes de financiamento', false]],
  },
  {
    title: 'Revitalização da praça de convivência',
    status: 'a_fazer',
    category: 'Convivência',
    description: 'Novo paisagismo, bancos sombreados, tomadas para carregar dispositivos e Wi-Fi na praça central.',
    responsibleName: 'Prefeitura do Campus',
    pos: [0, 12],
    dueDate: '2027-03-30',
    createdAt: '2026-05-05',
    subs: [['Projeto paisagístico', false], ['Orçamento do mobiliário urbano', false], ['Execução', false]],
  },
  {
    title: 'Ampliação do Restaurante Universitário',
    status: 'em_analise',
    category: 'Assistência estudantil',
    description: 'Aumento da capacidade do salão do RU e nova linha de servimento para reduzir as filas no almoço.',
    responsibleName: 'Direção do Campus',
    pos: [-70, 52],
    startDate: '2026-04-01',
    dueDate: '2026-11-30',
    createdAt: '2026-01-08',
    subs: [
      ['Projeto executivo', true, '2026-05-15'],
      ['Execução da obra', true, '2026-09-18'],
      ['Vistoria do Corpo de Bombeiros', false],
    ],
  },
  {
    title: 'Cobertura da quadra poliesportiva',
    status: 'ideia',
    category: 'Esporte e lazer',
    description: 'Cobertura metálica e nova iluminação da quadra externa, permitindo uso em dias de chuva e à noite.',
    responsibleName: '',
    pos: [88, 40],
    createdAt: '2026-08-11',
    subs: [],
  },
  {
    title: 'Wi-Fi em todo o campus',
    status: 'concluido',
    category: 'Tecnologia',
    description: 'Nova rede sem fio com cobertura em salas, laboratórios, biblioteca e áreas de convivência.',
    responsibleName: 'TI do Campus',
    pos: [44, 18],
    startDate: '2025-09-01',
    completedAt: '2026-02-27',
    createdAt: '2025-07-03',
    subs: [
      ['Cabeamento dos blocos', true, '2025-11-20'],
      ['Instalação dos access points', true, '2026-01-30'],
      ['Testes de cobertura', true, '2026-02-27'],
    ],
  },
  {
    title: 'Laboratório Maker de inovação',
    status: 'em_andamento',
    category: 'Pesquisa e inovação',
    description: 'Espaço com impressoras 3D, cortadora a laser e bancadas de eletrônica aberto a todos os cursos.',
    responsibleName: 'Coordenação de Pesquisa',
    pos: [52, -54],
    startDate: '2026-05-10',
    dueDate: '2026-12-20',
    createdAt: '2026-03-17',
    subs: [
      ['Adequação da sala', true, '2026-07-02'],
      ['Compra dos equipamentos', true, '2026-09-05'],
      ['Treinamento dos monitores', false],
      ['Inauguração', false],
    ],
  },
  {
    title: 'Bicicletário e ciclovia interna',
    status: 'a_fazer',
    category: 'Mobilidade',
    description: 'Bicicletário coberto próximo ao estacionamento e ciclovia ligando a portaria aos blocos.',
    responsibleName: 'Prefeitura do Campus',
    pos: [-40, 84],
    createdAt: '2026-06-28',
    subs: [['Definir traçado da ciclovia', false], ['Orçamento', false]],
  },
  {
    title: 'Reforma dos banheiros da Didática III',
    status: 'concluido',
    category: 'Infraestrutura',
    description: 'Banheiros reformados, com novos revestimentos, louças econômicas e um banheiro acessível por pavimento.',
    responsibleName: 'Coordenação de Infraestrutura',
    pos: [44, -20],
    startDate: '2026-06-15',
    completedAt: '2026-09-04',
    createdAt: '2026-04-20',
    subs: [
      ['Demolição', true, '2026-06-30'],
      ['Hidráulica e revestimentos', true, '2026-08-10'],
      ['Louças e acabamento', true, '2026-09-04'],
    ],
  },
  {
    title: 'Som e projeção do Auditório',
    status: 'concluido',
    category: 'Eventos',
    description: 'Novo sistema de som, projetor laser e transmissão ao vivo para defesas, congressos e eventos.',
    responsibleName: 'TI do Campus',
    pos: [40, 52],
    startDate: '2026-02-02',
    completedAt: '2026-04-17',
    createdAt: '2025-12-01',
    subs: [
      ['Projetor laser', true, '2026-03-10'],
      ['Sistema de som', true, '2026-04-02'],
      ['Estrutura de transmissão', true, '2026-04-17'],
    ],
  },
  {
    title: 'Reuso da água da chuva',
    status: 'ideia',
    category: 'Sustentabilidade',
    description: 'Captação da água da chuva dos telhados para irrigação dos jardins e descargas.',
    responsibleName: '',
    pos: [-92, -46],
    createdAt: '2026-09-12',
    subs: [],
  },
];

export async function seedDemo() {
  if (!env.seedDemo) return;
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(tasks);
  if (Number(count) > 0) return;

  let position = 0;
  for (const d of DEMO) {
    position += 1024;
    const createdAt = new Date(`${d.createdAt}T12:00:00-03:00`);
    const [task] = await db
      .insert(tasks)
      .values({
        title: d.title,
        status: d.status,
        category: d.category,
        description: d.description,
        responsibleName: d.responsibleName,
        posX: d.pos[0],
        posZ: d.pos[1],
        startDate: d.startDate ?? null,
        dueDate: d.dueDate ?? null,
        completedAt: d.completedAt ?? null,
        isDemo: true,
        position,
        createdAt,
        updatedAt: createdAt,
      })
      .returning();
    if (d.subs.length) {
      await db.insert(subtasks).values(
        d.subs.map(([title, done, completedAt, responsible], i) => ({
          taskId: task.id,
          title,
          done,
          completedAt: completedAt ?? null,
          responsibleName: responsible ?? '',
          position: (i + 1) * 1024,
        })),
      );
    }
    await db.insert(activities).values({
      taskId: task.id,
      type: 'created',
      message: 'criou o projeto (demonstração)',
      userName: 'Sistema',
      createdAt,
    });
  }
  console.log(`[seed] ${DEMO.length} projetos de demonstração criados`);
}
