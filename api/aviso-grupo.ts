import { resposta, usuarioLogado } from "./_lib.js";
import { enviarParaUsuario, supabaseAdmin } from "./_push.js";

/** Push para as outras pessoas do grupo quando alguém guarda numa meta compartilhada. */
const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const acessos = new Map<string, number[]>();

export async function POST(req: Request) {
  const usuario = await usuarioLogado(req);
  if (!usuario) return resposta(401, { erro: "Entre na sua conta." });
  const agora = Date.now();
  const recentes = (acessos.get(usuario.id) ?? []).filter((t) => agora - t < 60_000);
  if (recentes.length >= 10) return resposta(429, { erro: "Muitos avisos seguidos." });
  acessos.set(usuario.id, [...recentes, agora]);

  const c = (await req.json().catch(() => ({}))) as { grupo?: string; meta?: string; valor?: number; falta?: number };
  if (!c.grupo || !/^[0-9a-f-]{36}$/.test(c.grupo)) return resposta(400, { erro: "Grupo inválido." });
  const valor = Math.round(Number(c.valor) || 0), falta = Math.max(0, Math.round(Number(c.falta) || 0));
  const meta = String(c.meta ?? "meta").slice(0, 60);
  if (valor <= 0) return resposta(400, { erro: "Valor inválido." });
  try {
    const admin = supabaseAdmin();
    const { data: membros, error } = await admin.from("grupo_membros").select("user_id").eq("grupo_id", c.grupo);
    if (error) throw error;
    if (!membros?.some((m) => m.user_id === usuario.id)) return resposta(403, { erro: "Você não faz parte deste grupo." });
    const [{ data: perfil }, { data: grupo }] = await Promise.all([
      admin.from("perfis").select("nome").eq("user_id", usuario.id).maybeSingle(),
      admin.from("grupos").select("tipo").eq("id", c.grupo).maybeSingle(),
    ]);
    const quem = (perfil?.nome ?? "Alguém").trim().split(/\s+/)[0];
    const casal = grupo?.tipo === "casal";
    let enviados = 0;
    for (const m of membros.filter((x) => x.user_id !== usuario.id)) {
      enviados += await enviarParaUsuario(admin, m.user_id as string, [{
        title: `${quem} guardou ${reais(valor)} para “${meta}”${casal ? " 💕" : ""}`,
        body: falta > 0 ? `Faltam ${reais(falta)}. ${casal ? "Que tal mandar um carinho de volta?" : "Bora junto!"}` : "A meta foi alcançada! 🎉",
        url: "/#metas", tag: `deposito-${c.grupo}`,
      }]);
    }
    return resposta(200, { enviados });
  } catch (e) {
    console.error("aviso-grupo", e);
    return resposta(500, { erro: (e as Error).message });
  }
}
