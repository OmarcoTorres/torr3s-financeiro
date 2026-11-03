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

export interface Prefs { vencimentos: boolean; dias_antes: number; atrasadas: boolean; faturas: boolean; metas: boolean; resumo_semanal: boolean }
export interface LancamentoBD { id: string; tipo: string; descricao: string; valor: number; data: string; vencimento: string | null; status: string; conta_id: string | null; conta_destino_id: string | null }
export interface ContaBD { id: string; nome: string; tipo: string; saldo_inicial: number; vencimento_dia: number | null }
export interface MetaBD { nome: string; alvo: number; guardado: number; prazo: string | null }
export interface EspacoDados { nome: string; lancamentos: LancamentoBD[]; contas: ContaBD[]; metas: MetaBD[] }

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

export function montarAvisos(espacos: EspacoDados[], hoje: string, p: Prefs): Aviso[] {
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
      if (pagar(hojeLs).length) avisos.push({ title: `Vence hoje${sufixo(e)}`, body: `${pagar(hojeLs).length === 1 ? "1 conta" : `${pagar(hojeLs).length} contas`} · ${r$(soma(pagar(hojeLs)))}: ${lista(pagar(hojeLs))}`, tag: `hoje-${e.nome}`, url: "/#inicio" , prioridade: 1 });
      if (receber(hojeLs).length) avisos.push({ title: `Para receber hoje${sufixo(e)}`, body: `${r$(soma(receber(hojeLs)))}: ${lista(receber(hojeLs))}`, tag: `receber-${e.nome}`, url: "/#inicio" , prioridade: 5 });
      if (pagar(antesLs).length) avisos.push({ title: `Vence em ${p.dias_antes} ${p.dias_antes === 1 ? "dia" : "dias"}${sufixo(e)}`, body: `${r$(soma(pagar(antesLs)))}: ${lista(pagar(antesLs))}`, tag: `antes-${e.nome}`, url: "/#inicio" , prioridade: 4 });
    }

    if (p.atrasadas) {
      const atras = pend.filter((l) => venc(l) < hoje);
      const novas = atras.filter((l) => venc(l) === somarDias(hoje, -1));
      if (novas.length || (segunda && atras.length)) {
        const ls = segunda ? atras : novas;
        avisos.push({ title: `${ls.length === 1 ? "Conta atrasada" : `${ls.length} contas atrasadas`}${sufixo(e)}`, body: `${r$(soma(ls))}: ${lista(ls)}. Se já pagou, marque como pago.`, tag: `atrasadas-${e.nome}`, url: "/#transacoes" , prioridade: 3 });
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
        if (fatura > 0) avisos.push({ title: `Fatura ${c.nome} ${quando === hoje ? "vence hoje" : "vence em 3 dias"}${sufixo(e)}`, body: `${r$(fatura)} em aberto. Toque para registrar o pagamento.`, tag: `fatura-${c.id}`, url: "/#cartoes" , prioridade: 2 });
      }
    }

    if (p.metas && hoje.endsWith("-01")) {
      const mes = hoje.slice(0, 7), prox = somarDias(`${mes}-28`, 7).slice(0, 7);
      for (const m of e.metas.filter((x) => x.prazo && (x.prazo === mes || x.prazo === prox) && Number(x.guardado) < Number(x.alvo))) {
        avisos.push({ title: `Meta “${m.nome}”: prazo ${m.prazo === mes ? "neste mês" : "no mês que vem"}`, body: `Faltam ${r$(Number(m.alvo) - Number(m.guardado))} para ${r$(Number(m.alvo))}.`, tag: `meta-${m.nome}`, url: "/#metas" , prioridade: 6 });
      }
    }

    if (p.resumo_semanal && segunda) {
      const fim = somarDias(hoje, 6);
      const semana = pend.filter((l) => venc(l) >= hoje && venc(l) <= fim);
      if (semana.length) avisos.push({ title: `Sua semana${sufixo(e)}`, body: `A pagar ${r$(soma(pagar(semana)))} · a receber ${r$(soma(receber(semana)))} em ${semana.length} ${semana.length === 1 ? "conta" : "contas"}.`, tag: `semana-${e.nome}`, url: "/#inicio" , prioridade: 7 });
    }
  }
  // No máximo 4 por dia, o mais importante primeiro: vence hoje, fatura, atrasadas, vence em breve, a receber, metas, semana.
  return avisos.sort((a, b) => a.prioridade - b.prioridade).slice(0, 4).map(({ prioridade: _p, ...a }) => a);
}
