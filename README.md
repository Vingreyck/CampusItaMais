# Campus Ita+

Campus 3D da **UFS – Campus Prof. Alberto Carvalho (Itabaiana/SE)** mostrando os projetos da gestão, com um painel de gestão separado (estilo Jira simplificado).

## O que tem

### Site público (`/`)
Só a planta 3D e o filtro, como pedido:

- **Filtro de 3 bolinhas** (canto inferior esquerdo): 🔴 ideias e planejamento · 🟡 em andamento · 🟢 concluídos. Clicar numa bolinha mostra no campus só os projetos daquela cor e abre a lista deles.
- **Clique num projeto**: a câmera voa até o local, um feixe de luz marca o ponto e abre o painel com descrição, progresso, **checklist das subtarefas** (com datas), fotos e documentos públicos.
- Link direto por projeto: `/projeto/<id>` (botão “Compartilhar”).

### Painel de gestão (`/admin`) — aplicativo separado, sem login, no estilo do Jira
- **Quadro** com as colunas *Ideias → A fazer → Em andamento → Em análise → Concluído*. Os cartões se movem arrastando com o mouse ou pelo teclado (Espaço, setas, Espaço). Cada coluna aparece no site com a cor do seu grupo: Ideias e A fazer em 🔴, Em andamento e Em análise em 🟡, Concluído em 🟢.
- **Cartões** com chave `ITA-n`, prioridade, progresso das subtarefas, anexos, prazo (vermelho se atrasado), responsável e se está no mapa. O menu “…” do cartão traz: abrir, copiar link do site, posicionar no mapa, mover para o topo/fim e excluir.
- **Criar**: diálogo completo (atalho `C`, opção “Criar outro”) ou criação rápida no pé de cada coluna.
- **Filtros rápidos**: busca (atalho `/`), responsável (avatares), categoria, “Sem local no mapa”, “Ocultos do site”.
- **Projeto** (abre em `/admin/tarefa/ITA-n`):
  - Título e descrição (a descrição aparece no site).
  - **Subtarefas**: checklist reordenável por arraste, com descrição, responsável, e-mail, prazo e data em que foi feita.
  - **Documentos**: PDF, fotos e planilhas, cada um público ou privado; uma foto pode ser a capa.
  - **Detalhes**: responsável, prioridade, categoria e relator.
  - **Datas**: início, previsão e conclusão (preenchidas sozinhas ao mover o cartão).
  - **Atividade** com abas **Comentários** (atalho `M`; `Ctrl+Enter` salva) e **Histórico** (cada alteração registrada).
- **E-mail com Enter**: em projetos e subtarefas, digite um e-mail e pressione Enter. A pessoa recebe a tarefa na hora.
- **Mapa do campus**: arraste a bolinha de um projeto da lista até o ponto do campus; no mapa, arraste as bolinhas para ajustar (vista “Planta” ou “3D”).
- **Relatório** por período (com atalhos) pronto para **imprimir/salvar em PDF**: projetos e etapas concluídos, em andamento, novas ideias e histórico de ações.
- **Acessos**: gera, regenera e revoga os links-chave das pessoas.
- **Importar do Jira** (botão no quadro): recebe o CSV exportado do Jira (“Exportar CSV (todos os campos)”), mostra a prévia e importa projetos, subtarefas, responsáveis, prioridades, datas e comentários. Aceita cabeçalhos em português ou inglês. Reimportar o mesmo arquivo **atualiza** os itens (pela chave `KAN-n`) sem duplicar e sem apagar o que foi feito no painel, como a posição no mapa.

## Segurança do painel (sem login)

- Cada pessoa recebe um **link-chave pessoal**: `https://<site>/acesso#<chave>`. A chave vai no `#`, que o navegador nunca envia a servidores, logs ou ao `Referer`.
- Ao abrir o link, o navegador recebe um cookie de sessão **httpOnly / Secure / `__Host-`** assinado, válido por 30 dias e renovado a cada uso.
- **Sem sessão, o painel não existe**: `/admin`, os arquivos JS/CSS do painel e toda a API `/api/admin/*` respondem **exatamente** como uma URL inexistente. Não há botão, link ou tela de login no site.
- O site público é um **build separado**, sem nenhuma linha do código do painel (`web/dist/site` não contém nem a palavra “admin”).
- Alterações exigem o cabeçalho `X-CIM-Admin` (anti-CSRF). A troca de chave tem limite de tentativas, e as chaves são guardadas apenas como hash SHA-256.
- Gerar novo link ou revogar derruba **na hora** as sessões daquela pessoa. A chave mestra (`ADMIN_ACCESS_KEY`) só muda no servidor.
- Os e-mails enviados **nunca** contêm o endereço do painel.

## Arquitetura

```
web/            React + Vite + Tailwind
  src/site/     site público (build → web/dist/site)
  src/admin/    painel (build → web/dist/admin, servido só com sessão)
  src/shared/   campus 3D (Three.js / React Three Fiber), status, utilitários
server/         Node + Express 5 + Drizzle ORM
  drizzle/      migrações SQL (aplicadas automaticamente ao iniciar)
```

- Banco: **PostgreSQL** em produção; em desenvolvimento, **PGlite** (Postgres embutido, sem instalar nada).
- Uploads: pasta `DATA_DIR/uploads`, um volume persistente no Railway.
- E-mail: Resend ou Brevo (API HTTPS). Também aceita SMTP, mas **o Railway bloqueia SMTP fora do plano Pro**. Sem provedor configurado, os envios são simulados e registrados.

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencha JWT_SECRET e ADMIN_ACCESS_KEY
npm run dev            # API em :3000 e site em http://localhost:5173
```

Painel local: `http://localhost:5173/acesso#<ADMIN_ACCESS_KEY>`.

Para gerar chaves aleatórias:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Testes

```bash
npm test            # API: 52 cenários (porteiro do painel, quadro, subtarefas, documentos, e-mail, mapa, relatório, acessos, importação do Jira)
npm run test:e2e    # navegador: 19 cenários no build de produção (site público e painel, como uma pessoa usaria)
```

No GitHub, os dois rodam sozinhos a cada push (`.github/workflows/ci.yml`).

## Deploy no Railway

1. **Um único serviço** a partir deste repositório, com **Root Directory vazio**: ele usa o `Dockerfile` e o `railway.json` da raiz. Não divida em serviços `web` e `server`. Com o repositório conectado, cada push no `main` faz deploy, e as migrações do banco rodam sozinhas.
2. Adicione um **PostgreSQL** e defina `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
3. Adicione um **volume** montado em `/data` e defina `DATA_DIR=/data`.
4. Variáveis: `JWT_SECRET`, `ADMIN_ACCESS_KEY`, `ADMIN_NAME`, `MAIL_FROM` e a chave do provedor de e-mail (`RESEND_API_KEY` ou `BREVO_API_KEY`). Opcional: `SEED_DEMO=true` para criar projetos de demonstração.
5. Gere um domínio público. `PUBLIC_URL` é preenchida automaticamente pelo domínio do Railway; defina-a se usar domínio próprio.

## Pendências

- **Planta oficial do campus**: o 3D atual é uma planta **provisória**. Quando a planta chegar, basta atualizar `web/src/shared/campus/layout.ts` (prédios, vias, praça, estacionamento etc.) e reposicionar os projetos no mapa do painel.
- Configurar o provedor de e-mail (domínio verificado no Resend, ou remetente verificado no Brevo).
