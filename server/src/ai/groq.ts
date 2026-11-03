/**
 * Cliente mínimo da Groq (API compatível com OpenAI): conversa em JSON e transcrição de voz.
 * Nada aqui é específico de um modelo: o modelo é escolhido pela variável GROQ_MODEL ou descoberto
 * na lista de modelos da própria Groq (que muda com o tempo).
 */
import { env } from '../env';
import { HttpError } from '../util';

export const isAiEnabled = () => !!env.ai.groqKey;

// Ordem de preferência quando GROQ_MODEL não é definido (o primeiro que existir na conta é usado).
const PREFERRED_MODELS = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'qwen/qwen3.6-27b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'];
const NOT_CHAT = /whisper|tts|guard|embed|orpheus|playai|distil-whisper|safeguard|compound/i;

function headers(json = true): Record<string, string> {
  return { Authorization: `Bearer ${env.ai.groqKey}`, ...(json ? { 'Content-Type': 'application/json' } : {}) };
}

async function groqFetch(path: string, init: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(env.ai.baseUrl + path, init);
  if (res.status === 429 && attempt < 2) {
    const wait = Number(res.headers.get('retry-after')) || 0;
    if (wait > 0 && wait <= 20) {
      await new Promise((r) => setTimeout(r, wait * 1000));
      return groqFetch(path, init, attempt + 1);
    }
  }
  return res;
}

async function failure(res: Response): Promise<never> {
  const body = (await res.text()).slice(0, 300);
  console.error(`[ia] Groq respondeu ${res.status}: ${body}`);
  if (res.status === 401 || res.status === 403) throw new HttpError(502, 'A chave da Groq foi recusada. Confira o GROQ_API_KEY no Railway.');
  if (res.status === 429) {
    const wait = Number(res.headers.get('retry-after'));
    throw new HttpError(429, `O limite gratuito da Groq foi atingido${wait ? `. Tente de novo em ${wait} segundos` : '. Tente de novo em alguns minutos'}.`);
  }
  if (res.status === 413) throw new HttpError(413, 'O conteúdo é grande demais para a Groq. Envie um trecho menor.');
  throw new HttpError(502, 'A Groq não conseguiu responder agora. Tente de novo em instantes.');
}

let modelCache: { at: number; id: string | null; available: string[] } | null = null;

/** Modelo de conversa em uso (GROQ_MODEL, ou o melhor disponível na lista da Groq). */
export async function resolveModel(force = false): Promise<{ id: string | null; available: string[] }> {
  if (env.ai.model) return { id: env.ai.model, available: [] };
  if (!force && modelCache && Date.now() - modelCache.at < 10 * 60 * 1000) return modelCache;
  const res = await groqFetch('/models', { headers: headers(false) });
  if (!res.ok) await failure(res);
  const data = (await res.json()) as { data?: { id: string; active?: boolean }[] };
  const available = (data.data ?? []).filter((m) => m.active !== false && !NOT_CHAT.test(m.id)).map((m) => m.id);
  const id = PREFERRED_MODELS.find((m) => available.includes(m)) ?? available[0] ?? null;
  modelCache = { at: Date.now(), id, available };
  return modelCache;
}

export const resetModelCache = () => {
  modelCache = null;
};

/** Pede uma resposta em JSON. Devolve o objeto já convertido (a validação do conteúdo é de quem chamou). */
export async function chatJson(system: string, user: string): Promise<unknown> {
  const { id } = await resolveModel();
  if (!id) throw new HttpError(502, 'Nenhum modelo de conversa está disponível na sua conta da Groq.');
  const body = {
    model: id,
    temperature: 0,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  const res = await groqFetch('/chat/completions', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) {
    // Modelo aposentado/inexistente: refaz a busca na lista e tenta uma vez com outro.
    if ((res.status === 400 || res.status === 404) && !env.ai.model) {
      const text = await res.clone().text();
      if (/model/i.test(text) && /(not found|decommission|does not exist|no longer)/i.test(text)) {
        resetModelCache();
        const next = (await resolveModel(true)).id;
        if (next && next !== id) {
          const retry = await groqFetch('/chat/completions', { method: 'POST', headers: headers(), body: JSON.stringify({ ...body, model: next }) });
          if (retry.ok) return parseChat(retry);
          return failure(retry);
        }
      }
    }
    return failure(res);
  }
  return parseChat(res);
}

async function parseChat(res: Response): Promise<unknown> {
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? '';
  // Alguns modelos embrulham o JSON em ```json … ```
  const cleaned = content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* cai no erro abaixo */
      }
    }
    throw new HttpError(502, 'A IA devolveu uma resposta fora do formato esperado. Tente de novo.');
  }
}

/** Transcreve áudio em português (Whisper). */
export async function transcribe(audio: Buffer, filename: string, mimetype: string): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: mimetype || 'audio/webm' }), filename || 'audio.webm');
  form.append('model', env.ai.sttModel);
  form.append('language', 'pt');
  form.append('response_format', 'json');
  form.append('temperature', '0');
  const res = await groqFetch('/audio/transcriptions', { method: 'POST', headers: headers(false), body: form });
  if (!res.ok) return failure(res);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? '').trim();
}
