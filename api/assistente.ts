import type Anthropic from "@anthropic-ai/sdk";
import { MODELO, barrar, cliente, mensagemDeErro, resposta } from "./_lib.js";

const PROPOR: Anthropic.Tool = {
  name: "propor_lancamento",
  description:
    "Propõe um lançamento para o usuário confirmar no app. Use quando ele pedir para registrar algo (ex.: 'paguei 150 de internet hoje'). " +
    "Não salva nada: o app mostra um cartão e o usuário confirma.",
  input_schema: {
    type: "object",
    properties: {
      tipo: { type: "string", enum: ["receita", "despesa"] },
      descricao: { type: "string" },
      valor: { type: "number", description: "Em reais, ex.: 150.0" },
      data: { type: "string", description: "AAAA-MM-DD" },
      vencimento: { type: "string", description: "AAAA-MM-DD, se for conta a pagar/receber" },
      status: { type: "string", enum: ["pago", "pendente"] },
      categoria: { type: "string", description: "Nome exato de uma categoria existente" },
      conta: { type: "string", description: "Nome exato de uma conta existente" },
      pessoa: { type: "string", description: "Nome exato de uma pessoa existente, se houver" },
    },
    required: ["tipo", "descricao", "valor", "data", "status"],
  },
};

const SISTEMA = `Você é o assistente de um app de controle financeiro, em português do Brasil.
Responda curto e direto, com valores em R$ no padrão brasileiro (R$ 1.234,56) e datas dd/mm.
Baseie-se só nos dados enviados pelo app. Se a informação não estiver neles, diga isso; nunca invente números.
"situacao" atrasado = pendente com vencimento já passado.
Para registrar algo, use a ferramenta propor_lancamento (pode usar mais de uma vez) e diga em uma frase o que vai ser registrado; o usuário confirma no app.
Use somente nomes de categorias, contas e pessoas que existem nos dados. Sem markdown pesado: no máximo listas simples.`;

type Hist = { papel: "user" | "assistant"; texto: string };

export async function POST(req: Request) {
  const bloqueio = await barrar(req);
  if (bloqueio) return bloqueio;

  const corpo = await req.json().catch(() => null) as { pergunta?: string; historico?: Hist[]; dados?: unknown } | null;
  const pergunta = String(corpo?.pergunta ?? "").trim().slice(0, 2000);
  if (!pergunta) return resposta(400, { erro: "Escreva uma pergunta." });
  const dadosJson = JSON.stringify(corpo?.dados ?? {});
  if (dadosJson.length > 200_000) return resposta(413, { erro: "Dados demais para o assistente." });

  const historico = (corpo?.historico ?? []).slice(-8).filter((h) => h.texto?.trim());
  const messages: Anthropic.MessageParam[] = [
    ...historico.map((h) => ({ role: h.papel === "assistant" ? "assistant" as const : "user" as const, content: String(h.texto).slice(0, 4000) })),
    { role: "user", content: `Dados do app (JSON):\n${dadosJson}\n\nPergunta: ${pergunta}` },
  ];
  // A API exige começar pelo usuário e alternar papéis.
  while (messages.length && messages[0].role !== "user") messages.shift();

  try {
    const msg = await cliente().messages.create({
      model: MODELO,
      max_tokens: 2048,
      system: SISTEMA,
      tools: [PROPOR],
      messages,
    });
    const texto = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    const propostas = msg.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === PROPOR.name)
      .map((b) => b.input);
    return resposta(200, { texto: texto || (propostas.length ? "Preparei o lançamento abaixo. Confira e confirme." : "Não tenho uma resposta para isso."), propostas });
  } catch (e) {
    console.error("assistente", e);
    return resposta(502, { erro: mensagemDeErro(e) });
  }
}
