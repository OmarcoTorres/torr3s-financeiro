import Anthropic from "@anthropic-ai/sdk";

export const MODELO = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// Limite simples por IP (por instância do servidor): o endereço é público e cada chamada custa.
const LIMITE_POR_MINUTO = 8;
const acessos = new Map<string, number[]>();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://wvbpwbhzyhfqrymftwqj.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";

/** Só usuários logados no Invest+ usam a IA: confere o token da sessão no Supabase. */
async function usuarioLogado(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !SUPABASE_KEY) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!r?.ok) return null;
  return (await r.json()) as { id: string };
}

/** Confere método, origem, login, limite de uso e chave configurada. Devolve um erro pronto ou null. */
export async function barrar(req: Request): Promise<Response | null> {
  if (req.method !== "POST") return resposta(405, { erro: "Use POST." });
  if (req.headers.get("x-financeiro") !== "1") return resposta(403, { erro: "Chamada não permitida." });
  const origem = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origem && host && new URL(origem).host !== host) return resposta(403, { erro: "Origem não permitida." });

  const usuario = await usuarioLogado(req);
  if (!usuario) return resposta(401, { erro: "Entre na sua conta para usar a leitura automática." });
  const ip = usuario.id;
  const agora = Date.now();
  const lista = (acessos.get(ip) ?? []).filter((t) => agora - t < 60_000);
  if (lista.length >= LIMITE_POR_MINUTO) return resposta(429, { erro: "Muitas chamadas seguidas. Espere um minuto e tente de novo." });
  lista.push(agora);
  acessos.set(ip, lista);

  if (!process.env.ANTHROPIC_API_KEY) {
    return resposta(503, { erro: "A leitura automática ainda não foi ativada neste endereço (falta configurar ANTHROPIC_API_KEY na Vercel)." });
  }
  return null;
}

export const cliente = () => new Anthropic();

export function mensagemDeErro(e: unknown) {
  if (e instanceof Anthropic.APIError) {
    if (e.status === 401) return "A chave da Anthropic configurada na Vercel é inválida.";
    if (e.status === 429) return "A IA está sobrecarregada ou sem crédito. Tente de novo em instantes.";
    return `A IA respondeu com erro (${e.status}).`;
  }
  return "Não foi possível falar com a IA agora.";
}
