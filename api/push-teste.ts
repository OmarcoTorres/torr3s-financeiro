import { resposta, usuarioLogado } from "./_lib.js";
import { enviarParaUsuario, supabaseAdmin } from "./_push.js";

/** Botão "Enviar notificação de teste" em Ajustes › Notificações. */
export async function POST(req: Request) {
  const usuario = await usuarioLogado(req);
  if (!usuario) return resposta(401, { erro: "Entre na sua conta." });
  try {
    const n = await enviarParaUsuario(supabaseAdmin(), usuario.id, [{
      title: "Invest+ · notificações ativas",
      body: "Você vai receber aqui os avisos de vencimentos, faturas e metas.",
      url: "/#avisos", tag: "teste",
    }]);
    if (!n) return resposta(404, { erro: "Nenhum aparelho com notificações ativas nesta conta." });
    return resposta(200, { enviados: n });
  } catch (e) {
    console.error("push-teste", e);
    return resposta(500, { erro: (e as Error).message });
  }
}
