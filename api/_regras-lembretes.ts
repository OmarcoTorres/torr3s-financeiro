/**
 * Regras dos lembretes diários (sem acesso a banco: recebe os dados e devolve os avisos).
 * Para não incomodar todo dia com a mesma coisa:
 *  - conta a vencer: avisa N dias antes (preferência) e no próprio dia;
 *  - conta atrasada: avisa no dia seguinte ao vencimento e, depois, só às segundas;
 *  - fatura de cartão: avisa 3 dias antes e no dia;
 *  - meta com prazo: avisa no dia 1º quando o prazo é este mês ou o próximo;
 *  - resumo da semana: segunda-feira.
 */
import type { Aviso } from "./_push.js";

export interface Prefs { vencimentos: boolean; dias_antes: number; atrasadas: boolean; faturas: boolean; metas: boolean; resumo_semanal: boolean; lembrete_diario?: boolean }
export interface LancamentoBD { id: string; tipo: string; descricao: string; valor: number; data: string; vencimento: string | null; status: string; conta_id: string | null; conta_destino_id: string | null; categoria_id?: string | null }
export interface ContaBD { id: string; nome: string; tipo: string; saldo_inicial: number; vencimento_dia: number | null }
export interface MetaBD { nome: string; alvo: number; guardado: number; prazo: string | null }
export interface EspacoDados { nome: string; lancamentos: LancamentoBD[]; contas: ContaBD[]; metas: MetaBD[]; categorias?: { id: string; nome: string }[] }

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const r$ = (c: number) => BRL.format(c / 100);
const soma = (ls: LancamentoBD[]) => ls.reduce((a, l) => a + Number(l.valor), 0);
const venc = (l: LancamentoBD) => l.vencimento ?? l.data;

export function somarDias(iso: string, n: number) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
const diaSemana = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = domingo

function lista(ls: LancamentoBD[], max = 3) {
  const nomes = ls.slice(0, max).map((l) => l.descricao);
  return nomes.join(", ") + (ls.length > max ? ` e mais ${ls.length - max}` : "");
}

function proximoVencimento(dia: number, hoje: string) {
  const [a, m] = hoje.split("-").map(Number);
  const ultimo = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const z = (n: number) => String(n).padStart(2, "0");
  let alvo = `${a}-${z(m)}-${z(Math.min(dia, ultimo(a, m)))}`;
  if (alvo < hoje) { const nm = m === 12 ? 1 : m + 1, na = m === 12 ? a + 1 : a; alvo = `${na}-${z(nm)}-${z(Math.min(dia, ultimo(na, nm)))}`; }
  return alvo;
}

export function montarAvisos(espacos: EspacoDados[], hoje: string, p: Prefs, extra: { nome?: string; semente?: string } = {}): Aviso[] {
  const avisos: (Aviso & { prioridade: number })[] = [];
  const varios = espacos.length > 1;
  const sufixo = (e: EspacoDados) => (varios ? ` · ${e.nome}` : "");
  const segunda = diaSemana(hoje) === 1;
  const alvoAntes = somarDias(hoje, p.dias_antes);

  for (const e of espacos) {
    const pend = e.lancamentos.filter((l) => l.status === "pendente");
    const pagar = (ls: LancamentoBD[]) => ls.filter((l) => l.tipo === "despesa");
    const receber = (ls: LancamentoBD[]) => ls.filter((l) => l.tipo === "receita");

    if (p.vencimentos) {
      const hojeLs = pend.filter((l) => venc(l) === hoje);
      const antesLs = p.dias_antes > 0 ? pend.filter((l) => venc(l) === alvoAntes) : [];
      if (pagar(hojeLs).length) avisos.push({ title: `Vence hoje${sufixo(e)}`, body: `${pagar(hojeLs).length === 1 ? "1 conta" : `${pagar(hojeLs).length} contas`} · ${r$(soma(pagar(hojeLs)))}: ${lista(pagar(hojeLs))}`, tag: `hoje-${e.nome}`, url: "/#avisos" , prioridade: 1 });
      if (receber(hojeLs).length) avisos.push({ title: `Para receber hoje${sufixo(e)}`, body: `${r$(soma(receber(hojeLs)))}: ${lista(receber(hojeLs))}`, tag: `receber-${e.nome}`, url: "/#avisos" , prioridade: 5 });
      if (pagar(antesLs).length) avisos.push({ title: `Vence em ${p.dias_antes} ${p.dias_antes === 1 ? "dia" : "dias"}${sufixo(e)}`, body: `${r$(soma(pagar(antesLs)))}: ${lista(pagar(antesLs))}`, tag: `antes-${e.nome}`, url: "/#avisos" , prioridade: 4 });
    }

    if (p.atrasadas) {
      const atras = pend.filter((l) => venc(l) < hoje);
      const novas = atras.filter((l) => venc(l) === somarDias(hoje, -1));
      if (novas.length || (segunda && atras.length)) {
        const ls = segunda ? atras : novas;
        avisos.push({ title: `${ls.length === 1 ? "Conta atrasada" : `${ls.length} contas atrasadas`}${sufixo(e)}`, body: `${r$(soma(ls))}: ${lista(ls)}. Se já pagou, marque como pago.`, tag: `atrasadas-${e.nome}`, url: "/#avisos" , prioridade: 3 });
      }
    }

    if (p.faturas) {
      for (const c of e.contas.filter((x) => x.tipo === "cartao" && x.vencimento_dia)) {
        const quando = proximoVencimento(c.vencimento_dia!, hoje);
        if (quando !== hoje && quando !== somarDias(hoje, 3)) continue;
        let saldo = Number(c.saldo_inicial);
        for (const l of e.lancamentos) {
          if (l.status !== "pago") continue;
          if (l.conta_id === c.id) saldo += l.tipo === "receita" ? Number(l.valor) : -Number(l.valor);
          if (l.tipo === "transferencia" && l.conta_destino_id === c.id) saldo += Number(l.valor);
        }
        const fatura = Math.max(0, -saldo);
        if (fatura > 0) avisos.push({ title: `Fatura ${c.nome} ${quando === hoje ? "vence hoje" : "vence em 3 dias"}${sufixo(e)}`, body: `${r$(fatura)} em aberto. Toque para registrar o pagamento.`, tag: `fatura-${c.id}`, url: "/#avisos" , prioridade: 2 });
      }
    }

    if (p.metas && hoje.endsWith("-01")) {
      const mes = hoje.slice(0, 7), prox = somarDias(`${mes}-28`, 7).slice(0, 7);
      for (const m of e.metas.filter((x) => x.prazo && (x.prazo === mes || x.prazo === prox) && Number(x.guardado) < Number(x.alvo))) {
        avisos.push({ title: `Meta “${m.nome}”: prazo ${m.prazo === mes ? "neste mês" : "no mês que vem"}`, body: `Faltam ${r$(Number(m.alvo) - Number(m.guardado))} para ${r$(Number(m.alvo))}.`, tag: `meta-${m.nome}`, url: "/#avisos" , prioridade: 6 });
      }
    }

    if (p.resumo_semanal && segunda) {
      const fim = somarDias(hoje, 6);
      const semana = pend.filter((l) => venc(l) >= hoje && venc(l) <= fim);
      if (semana.length) avisos.push({ title: `Sua semana${sufixo(e)}`, body: `A pagar ${r$(soma(pagar(semana)))} · a receber ${r$(soma(receber(semana)))} em ${semana.length} ${semana.length === 1 ? "conta" : "contas"}.`, tag: `semana-${e.nome}`, url: "/#avisos" , prioridade: 7 });
    }
  }
  // No máximo 4 avisos de conta por dia, o mais importante primeiro: vence hoje, fatura, atrasadas, vence em breve, a receber, metas, semana.
  const principais = avisos.sort((a, b) => a.prioridade - b.prioridade).slice(0, 4).map(({ prioridade: _p, ...a }) => a);
  if (p.lembrete_diario !== false) principais.push(lembreteDoDia(espacos, hoje, extra.nome, extra.semente ?? ""));
  return principais;
}

// ---------- Lembrete diário ----------
/** Frases curtas e próprias (sem atribuir autoria), sorteadas por dia e por pessoa. */
export const FRASES = [
  "Cada real anotado é um real que trabalha a seu favor.",
  "Quem acompanha o dinheiro de perto decide, em vez de só reagir.",
  "Pequenos ajustes todo dia valem mais que uma grande promessa no ano novo.",
  "Seu futuro agradece o cafezinho que você anotou hoje.",
  "Organização financeira não é sobre ter muito, é sobre saber para onde vai.",
  "Uma meta sem prazo é um desejo; com prazo, vira plano.",
  "Gastar com intenção é melhor do que economizar com culpa.",
  "O melhor dia para começar a reserva foi ontem. O segundo melhor é hoje.",
  "Constância vence intensidade: dez segundos por dia já bastam.",
  "Dinheiro guardado é tranquilidade com data marcada.",
  "Você não precisa cortar tudo, só o que não faz sentido para você.",
  "Conhecer seus números é o primeiro passo para mudá-los.",
  "Cada conta paga em dia é uma preocupação a menos.",
  "Investir começa quando sobra, e sobra quando se acompanha.",
  "Liberdade financeira se constrói em lançamentos pequenos e repetidos.",
  "Revise, ajuste, siga. Simples assim.",
  "Hoje é um bom dia para dar um passo pela sua meta.",
  "O controle que você tem hoje é a escolha que você terá amanhã.",
  "Não é sobre o quanto você ganha, é sobre o quanto você mantém.",
  "Um orçamento é um mapa: mostra o caminho, não te prende nele.",
];

function hash(t: string) { let h = 2166136261; for (const c of t) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function lembreteDoDia(espacos: EspacoDados[], hoje: string, nome: string | undefined, semente: string): Aviso {
  const todos = espacos.flatMap((e) => e.lancamentos);
  const ontem = somarDias(hoje, -1);
  const mes = hoje.slice(0, 7);
  const lancouOntem = todos.some((l) => l.data === ontem);
  const despesasMes = todos.filter((l) => l.tipo === "despesa" && l.status === "pago" && l.data.startsWith(mes) && l.data <= hoje);
  const gastoMes = soma(despesasMes);
  const cats = new Map(espacos.flatMap((e) => (e.categorias ?? []).map((c) => [c.id, c.nome] as const)));
  const porCat = new Map<string, number>();
  for (const l of despesasMes) porCat.set(l.categoria_id ?? "", (porCat.get(l.categoria_id ?? "") ?? 0) + Number(l.valor));
  const maior = [...porCat.entries()].sort((a, b) => b[1] - a[1])[0];
  const metas = espacos.flatMap((e) => e.metas).filter((m) => Number(m.guardado) < Number(m.alvo));

  const h = hash(`${semente}|${hoje}`);
  const frase = FRASES[h % FRASES.length];
  const primeiro = (nome ?? "").trim().split(/\s+/)[0];
  const ola = `Bom dia${primeiro ? `, ${primeiro}` : ""}`;

  // Ação do dia: se nada foi lançado ontem, isso vem primeiro; senão, alterna revisar gastos e metas.
  let acao: string;
  if (!lancouOntem && diaSemana(hoje) !== 1) acao = "Nada lançado ontem. Registre os gastos de ontem: leva 10 segundos.";
  else {
    const opcoes: string[] = [];
    if (gastoMes > 0) opcoes.push(`Revise seus gastos: ${r$(gastoMes)} neste mês${maior && cats.get(maior[0]) ? `, mais em ${cats.get(maior[0])} (${r$(maior[1])})` : ""}.`);
    if (metas.length) { const m = metas[h % metas.length]; opcoes.push(`Que tal guardar um pouco para “${m.nome}”? Faltam ${r$(Number(m.alvo) - Number(m.guardado))}.`); }
    opcoes.push("Lance o que gastou hoje assim que puder: com tudo anotado, o mês fecha certo.");
    acao = opcoes[Math.floor(h / 7) % opcoes.length];
  }
  return { title: ola, body: `${acao}\n“${frase}”`, tag: "lembrete-diario", url: "/#avisos" };
}
