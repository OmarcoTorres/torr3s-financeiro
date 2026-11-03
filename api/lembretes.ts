import { resposta } from "./_lib.js";
import { enviarParaUsuario, supabaseAdmin } from "./_push.js";
import { montarAvisos, somarDias, type EspacoDados, type Prefs } from "./_regras-lembretes.js";

/** Robô diário (Vercel Cron, 8h de Brasília): monta e envia os lembretes de cada pessoa. */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return resposta(401, { erro: "Não autorizado." });
  }
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  try {
    const admin = supabaseAdmin();
    const { data: assinaturas, error } = await admin.from("push_assinaturas").select("user_id");
    if (error) throw error;
    const usuarios = [...new Set((assinaturas ?? []).map((a) => a.user_id as string))];
    const relatorio: { usuario: string; avisos: number; enviados: number }[] = [];

    for (const userId of usuarios) {
      const { data: prefsRow } = await admin.from("notificacoes_prefs").select("*").eq("user_id", userId).maybeSingle();
      if (prefsRow && !prefsRow.ativo) continue;
      const prefs: Prefs = { vencimentos: true, dias_antes: 2, atrasadas: true, faturas: true, metas: true, resumo_semanal: true, ...(prefsRow ?? {}) };
      const { data: membros } = await admin.from("membros").select("espaco_id, espacos(nome)").eq("user_id", userId);
      const espacos: EspacoDados[] = [];
      for (const m of membros ?? []) {
        const esp = m.espaco_id as string;
        const limite = somarDias(hoje, 45);
        const [lanc, contas, metas] = await Promise.all([
          admin.from("lancamentos").select("id,tipo,descricao,valor,data,vencimento,status,conta_id,conta_destino_id").eq("espaco_id", esp).eq("excluido", false).lte("data", limite).limit(5000),
          admin.from("contas").select("id,nome,tipo,saldo_inicial,vencimento_dia").eq("espaco_id", esp).eq("excluido", false),
          admin.from("metas").select("nome,alvo,guardado,prazo").eq("espaco_id", esp).eq("excluido", false),
        ]);
        const nome = (m as unknown as { espacos?: { nome?: string } }).espacos?.nome ?? "Espaço";
        espacos.push({ nome, lancamentos: lanc.data ?? [], contas: contas.data ?? [], metas: metas.data ?? [] });
      }
      const avisos = montarAvisos(espacos, hoje, prefs);
      const enviados = avisos.length ? await enviarParaUsuario(admin, userId, avisos) : 0;
      relatorio.push({ usuario: userId.slice(0, 8), avisos: avisos.length, enviados });
    }
    return resposta(200, { hoje, usuarios: usuarios.length, relatorio });
  } catch (e) {
    console.error("lembretes", e);
    return resposta(500, { erro: (e as Error).message });
  }
}
