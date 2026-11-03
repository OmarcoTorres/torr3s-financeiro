import Anthropic from "@anthropic-ai/sdk";

export const MODELO = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// Limite simples por IP (por instância do servidor): o endereço é público e cada chamada custa.
const LIMITE_POR_MINUTO = 8;
const acessos = new Map<string, number[]>();

/** Confere método, origem, limite de uso e chave configurada. Devolve um erro pronto ou null. */
export function barrar(req: Request): Response | null {
  if (req.method !== "POST") return resposta(405, { erro: "Use POST." });
  if (req.headers.get("x-financeiro") !== "1") return resposta(403, { erro: "Chamada não permitida." });
  const origem = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origem && host && new URL(origem).host !== host) return resposta(403, { erro: "Origem não permitida." });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconhecido";
  const agora = Date.now();
  const lista = (acessos.get(ip) ?? []).filter((t) => agora - t < 60_000);
  if (lista.length >= LIMITE_POR_MINUTO) return resposta(429, { erro: "Muitas chamadas seguidas. Espere um minuto e tente de novo." });
  lista.push(agora);
  acessos.set(ip, lista);

  if (!process.env.ANTHROPIC_API_KEY) {
    return resposta(503, { erro: "A IA ainda não foi ativada: falta configurar ANTHROPIC_API_KEY na Vercel." });
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
