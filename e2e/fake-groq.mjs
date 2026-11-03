// Groq de mentira para os testes de navegador: responde como a API real, sem internet e sem gastar limite.
import http from 'node:http';

const PORT = Number(process.env.FAKE_GROQ_PORT || 3211);
const calls = [];

const json = (res, body, status = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

function answer(userMessage) {
  const itens = [];
  if (/Quiosque/i.test(userMessage)) {
    itens.push({ acao: 'criar', codigo: null, titulo: 'Quiosque de informações (IA)', descricao: 'Totem na entrada.', categoria: 'Infraestrutura', status: 'Fazendo', prioridade: 'Alta', subtarefas: ['Escolher o local', 'Comprar o totem'], motivo: 'citado na ata' });
  }
  const mini = /ITA-(\d+) \| \w+ \| Buscar melhorias do mini-auditório/.exec(userMessage);
  if (/mini-?audit/i.test(userMessage) && mini) {
    itens.push({ acao: 'atualizar', codigo: Number(mini[1]), titulo: 'Buscar melhorias do mini-auditório', status: 'Em análise', prioridade: 'Altíssima', subtarefas: ['Visita técnica'], motivo: 'item 2 da ata' });
  }
  if (/Horta comunit/i.test(userMessage)) {
    itens.push({ acao: 'criar', titulo: 'Horta comunitária (arquivo)', status: null, subtarefas: ['Definir o terreno'] });
  }
  return { itens };
}

http
  .createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const path = req.url.split('?')[0];
      if (path === '/health') return json(res, { ok: true });
      if (path === '/__calls') return json(res, calls);
      if (path === '/openai/v1/models') return json(res, { data: [{ id: 'openai/gpt-oss-120b', active: true }, { id: 'whisper-large-v3-turbo', active: true }] });
      if (path === '/openai/v1/chat/completions') {
        const payload = JSON.parse(body.toString());
        calls.push({ path, user: payload.messages[1].content, auth: req.headers.authorization });
        return json(res, { choices: [{ message: { content: JSON.stringify(answer(payload.messages[1].content)) } }] });
      }
      if (path === '/openai/v1/audio/transcriptions') {
        calls.push({ path, bytes: body.length, auth: req.headers.authorization });
        return json(res, { text: 'Horta comunitária: criar a ação na reunião de hoje.' });
      }
      json(res, { error: { message: 'rota desconhecida' } }, 404);
    });
  })
  .listen(PORT, () => console.log(`fake groq na porta ${PORT}`));
