import { resposta, usuarioLogado } from "./_lib.js";
import { enviarParaUsuario, supabaseAdmin } from "./_push.js";

/**
 * Avisa por push quem recebeu um convite direto (feito por e-mail em Grupo › Convidar quem já tem conta).
 * Só quem criou o convite pode pedir o aviso, e no máximo uma vez a cada 10 minutos por convite.
 * O convite também fica em "Convites para você" dentro do app, mesmo que o push não chegue.
 */
export async function POST(req: Request) {
  const usuario = await usuarioLogado(req);
  if (!usuario) return resposta(401, { erro: "Entre na sua conta." });
  const { codigo } = (await req.json().catch(() => ({}))) as { codigo?: string };
  if (!codigo || !/^[A-Z0-9]{8,16}$/.test(codigo)) return resposta(400, { erro: "Convite inválido." });
  try {
    const admin = supabaseAdmin();
    const { data: c, error } = await admin.from("convites")
      .select("codigo, criado_por, destinatario, usado_por, expira_em, notificado_em, grupo_id, grupos(nome, tipo)")
      .eq("codigo", codigo).maybeSingle();
    if (error) throw error;
    if (!c || c.criado_por !== usuario.id || !c.destinatario) return resposta(404, { erro: "Convite não encontrado." });
    if (c.usado_por || new Date(c.expira_em) < new Date()) return resposta(409, { erro: "Este convite já foi usado ou expirou." });
    if (c.notificado_em && Date.now() - new Date(c.notificado_em).getTime() < 10 * 60_000) return resposta(200, { enviados: 0, jaAvisado: true });

    const { data: perfil } = await admin.from("perfis").select("nome").eq("user_id", usuario.id).maybeSingle();
    const de = (perfil?.nome ?? "Alguém").trim().split(/\s+/)[0];
    const grupo = (c as unknown as { grupos?: { nome?: string; tipo?: string } }).grupos;
    const casal = grupo?.tipo === "casal";
    const enviados = await enviarParaUsuario(admin, c.destinatario as string, [{
      title: casal ? `${de} te convidou para o cantinho de vocês 💕` : `${de} te convidou para um grupo`,
      body: `Toque para entrar em “${grupo?.nome ?? "grupo"}” no Invest+ e acompanhar as metas juntos.`,
      url: "/#convites", tag: `convite-${codigo}`,
    }]);
    await admin.from("convites").update({ notificado_em: new Date().toISOString() }).eq("codigo", codigo);
    return resposta(200, { enviados });
  } catch (e) {
    console.error("convite-push", e);
    return resposta(500, { erro: (e as Error).message });
  }
}
