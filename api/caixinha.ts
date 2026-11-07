import { resposta, usuarioLogado } from "./_lib.js";
import { supabaseAdmin } from "./_push.js";

/**
 * Lê saldo e extrato da conta da caixinha (Open Finance via Meu Pluggy) e confirma os depósitos
 * cujo Pix apareceu no extrato. Credenciais da Pluggy só no servidor (PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET).
 * Meu Pluggy atualiza a conexão 1x a cada 24 h; por isso a leitura aqui é limitada a 1 a cada 5 min.
 */
const API = "https://api.pluggy.ai";
const INTERVALO_MS = 5 * 60_000;

type Conta = { id: string; type: string; subtype?: string; balance: number; number?: string; name?: string };
type Transacao = { id: string; date: string; amount: number; type: "CREDIT" | "DEBIT"; status?: string; description?: string; paymentData?: { payer?: { name?: string } } | null };

async function pluggy<T>(chave: string, caminho: string): Promise<T> {
  const r = await fetch(`${API}${caminho}`, { headers: { "X-API-KEY": chave } });
  if (!r.ok) throw new Error(`Pluggy ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

const sem = (s?: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

export async function POST(req: Request) {
  const usuario = await usuarioLogado(req);
  if (!usuario) return resposta(401, { erro: "Entre na sua conta." });
  const { caixinha: id, forcar } = (await req.json().catch(() => ({}))) as { caixinha?: string; forcar?: boolean };
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return resposta(400, { erro: "Caixinha inválida." });

  const admin = supabaseAdmin();
  const { data: cx, error } = await admin.from("caixinhas").select("*").eq("id", id).maybeSingle();
  if (error) return resposta(500, { erro: error.message });
  if (!cx) return resposta(404, { erro: "Caixinha não encontrada." });
  const { data: membro } = await admin.from("grupo_membros").select("user_id").eq("grupo_id", cx.grupo_id).eq("user_id", usuario.id).maybeSingle();
  if (!membro) return resposta(403, { erro: "Você não faz parte deste grupo." });
  if (!cx.pluggy_item_id) return resposta(200, { lido: false, motivo: "Conta ainda não conectada (falta o itemId do Meu Pluggy)." });
  if (!process.env.PLUGGY_CLIENT_ID || !process.env.PLUGGY_CLIENT_SECRET) return resposta(503, { erro: "Falta configurar PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET na Vercel." });
  const recente = cx.lido_em && Date.now() - new Date(cx.lido_em).getTime() < INTERVALO_MS;
  if (recente && !(forcar && cx.dono === usuario.id)) return resposta(200, { lido: false, motivo: "Lido há poucos minutos." });

  try {
    const auth = await fetch(`${API}/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET }) });
    if (!auth.ok) throw new Error(`Pluggy auth ${auth.status}`);
    const { apiKey } = (await auth.json()) as { apiKey: string };

    // Conta: a guardada, ou a conta corrente do item.
    let contaId: string = cx.pluggy_account_id;
    let saldo: number | undefined;
    if (!contaId) {
      const { results } = await pluggy<{ results: Conta[] }>(apiKey, `/accounts?itemId=${encodeURIComponent(cx.pluggy_item_id)}&type=BANK`);
      const conta = results.find((c) => c.subtype === "CHECKING_ACCOUNT") ?? results[0];
      if (!conta) throw new Error("Nenhuma conta bancária nessa conexão do Meu Pluggy.");
      contaId = conta.id; saldo = conta.balance;
    }
    const conta = await pluggy<Conta & { updatedAt?: string }>(apiKey, `/accounts/${contaId}`);
    saldo = conta.balance;
    const { data: item } = await fetch(`${API}/items/${cx.pluggy_item_id}`, { headers: { "X-API-KEY": apiKey } }).then(async (r) => ({ data: r.ok ? ((await r.json()) as { lastUpdatedAt?: string; status?: string }) : null }));

    // Depósitos ainda não confirmados: procura o Pix no extrato (mesmo valor, a partir do dia do depósito).
    const { data: pendentes } = await admin.from("caixinha_depositos").select("id, user_id, valor, criado_em, status")
      .eq("caixinha_id", id).in("status", ["aguardando", "pago"]).order("criado_em");
    const confirmados: string[] = [];
    if (pendentes?.length) {
      const desde = new Date(new Date(pendentes[0].criado_em).getTime() - 86_400_000);
      const creditos: Transacao[] = [];
      let caminho: string | null = `?accountId=${contaId}`;
      for (let pag = 0; caminho && pag < 6; pag++) {
        const r: { results: Transacao[]; next: string | null } = await pluggy(apiKey, `/v2/transactions${caminho}`);
        creditos.push(...r.results.filter((t) => t.type === "CREDIT" && new Date(t.date) >= desde));
        caminho = r.next; // a documentação não garante a ordem das páginas: lê até 6 (3.000 lançamentos) e filtra por data
      }
      const { data: usados } = await admin.from("caixinha_depositos").select("transacao_id").eq("caixinha_id", id).not("transacao_id", "is", null);
      const ocupadas = new Set((usados ?? []).map((u) => u.transacao_id as string));
      const ids = [...new Set(pendentes.map((p) => p.user_id as string))];
      const { data: perfis } = await admin.from("perfis").select("user_id, nome").in("user_id", ids);
      const nomeDe = new Map((perfis ?? []).map((p) => [p.user_id as string, sem(p.nome as string).split(/\s+/)[0]]));

      for (const d of pendentes) {
        const diaDep = new Date(new Date(d.criado_em).getTime() - 86_400_000);
        const candidatos = creditos.filter((t) => !ocupadas.has(t.id) && Math.round(t.amount * 100) === Number(d.valor) && new Date(t.date) >= diaDep);
        if (!candidatos.length) continue;
        // Prefere o Pix em que o pagador tem o nome de quem fez o depósito.
        const nome = nomeDe.get(d.user_id as string) ?? "";
        const t = candidatos.find((c) => nome && (sem(c.paymentData?.payer?.name).includes(nome) || sem(c.description).includes(nome))) ?? candidatos[0];
        const { error: e } = await admin.rpc("confirmar_deposito_banco", { p_id: d.id, p_transacao: t.id });
        if (e) throw e;
        ocupadas.add(t.id); confirmados.push(d.id as string);
      }
    }

    await admin.from("caixinhas").update({
      pluggy_account_id: contaId, saldo: Math.round((saldo ?? 0) * 100),
      saldo_em: item?.lastUpdatedAt ?? conta.updatedAt ?? new Date().toISOString(), lido_em: new Date().toISOString(), erro_leitura: null,
    }).eq("id", id);
    return resposta(200, { lido: true, saldo: Math.round((saldo ?? 0) * 100), confirmados: confirmados.length, atualizadoEm: item?.lastUpdatedAt });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("caixinha", msg);
    await admin.from("caixinhas").update({ lido_em: new Date().toISOString(), erro_leitura: msg.slice(0, 300) }).eq("id", id);
    return resposta(502, { erro: "Não deu para ler a conta agora. Tente mais tarde." });
  }
}
