import { resposta, usuarioLogado } from "./_lib.js";
import { enviarParaUsuario, supabaseAdmin } from "./_push.js";

/**
 * Push do pedido de Pix:
 * - quem pediu chama logo após criar → avisa quem vai pagar;
 * - quem paga chama logo após responder → avisa quem pediu (feito ou recusado).
 * Cada aviso sai uma vez só (marcado no pedido).
 */
const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const primeiro = (n?: string | null) => (n ?? "Alguém").trim().split(/\s+/)[0];

export async function POST(req: Request) {
  const usuario = await usuarioLogado(req);
  if (!usuario) return resposta(401, { erro: "Entre na sua conta." });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return resposta(400, { erro: "Pedido inválido." });
  try {
    const admin = supabaseAdmin();
    const { data: p, error } = await admin.from("pedidos_pix").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!p) return resposta(404, { erro: "Pedido não encontrado." });
    const ids = [p.solicitante, p.responsavel];
    const { data: perfis } = await admin.from("perfis").select("user_id, nome").in("user_id", ids);
    const nome = (u: string) => primeiro(perfis?.find((x) => x.user_id === u)?.nome);
    const { data: grupo } = await admin.from("grupos").select("tipo").eq("id", p.grupo_id).maybeSingle();
    const casal = grupo?.tipo === "casal";

    // Novo pedido → quem paga.
    if (p.status === "pendente" && usuario.id === p.solicitante && !p.notificado_em) {
      const enviados = await enviarParaUsuario(admin, p.responsavel, [{
        title: `${nome(p.solicitante)} pediu um Pix de ${reais(Number(p.valor))}${casal ? " 💕" : ""}`,
        body: `Para ${p.favorecido}${p.motivo ? ` · ${p.motivo}` : ""}. Toque para copiar o Pix e pagar.`,
        url: "/#pix", tag: `pedido-${p.id}`,
      }]);
      await admin.from("pedidos_pix").update({ notificado_em: new Date().toISOString() }).eq("id", id);
      return resposta(200, { enviados });
    }
    // Resposta → quem pediu.
    if ((p.status === "feito" || p.status === "recusado") && usuario.id === p.responsavel && !p.notificado_resposta_em) {
      const feito = p.status === "feito";
      const enviados = await enviarParaUsuario(admin, p.solicitante, [{
        title: feito ? `${nome(p.responsavel)} fez o Pix de ${reais(Number(p.valor))} ✅` : `${nome(p.responsavel)} não fez o Pix de ${reais(Number(p.valor))}`,
        body: `${feito ? "Enviado" : "Pedido"} para ${p.favorecido}${p.resposta ? ` · “${p.resposta}”` : ""}${feito && casal ? " 💕" : ""}`,
        url: "/#pix", tag: `pedido-${p.id}`,
      }]);
      await admin.from("pedidos_pix").update({ notificado_resposta_em: new Date().toISOString() }).eq("id", id);
      return resposta(200, { enviados });
    }
    return resposta(200, { enviados: 0 });
  } catch (e) {
    console.error("pedido-pix", e);
    return resposta(500, { erro: (e as Error).message });
  }
}
