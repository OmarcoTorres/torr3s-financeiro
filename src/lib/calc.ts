import { isoLocal, type Conta, type Fechamento, type Lancamento, type Pessoa } from "../db";

export const hoje = () => isoLocal(new Date());
export const mesAtual = () => hoje().slice(0, 7);
export const mesDe = (iso: string) => iso.slice(0, 7);

export function somarDias(iso: string, dias: number) {
  const [a, m, d] = iso.split("-").map(Number);
  return isoLocal(new Date(a, m - 1, d + dias));
}
export function somarMeses(iso: string, meses: number) {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(a, m - 1 + meses, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  return isoLocal(new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(d, ultimo)));
}
export const fimDoMes = (mes: string) => somarDias(somarMeses(`${mes}-01`, 1), -1);

export type Situacao = "pago" | "pendente" | "atrasado";
/** Atrasado é calculado: pendente com vencimento (ou data) antes de hoje. */
export function situacao(l: Lancamento, h = hoje()): Situacao {
  if (l.status === "pago") return "pago";
  return (l.vencimento ?? l.data) < h ? "atrasado" : "pendente";
}

/** Efeito de um lançamento pago em cada conta (transferência sai de uma e entra na outra). */
export function efeitoContas(l: Lancamento): [string, number][] {
  if (l.status !== "pago" || !l.contaId) return [];
  if (l.tipo === "receita") return [[l.contaId, l.valor]];
  if (l.tipo === "despesa") return [[l.contaId, -l.valor]];
  return l.contaDestinoId ? [[l.contaId, -l.valor], [l.contaDestinoId, l.valor]] : [[l.contaId, -l.valor]];
}

/** Saldo de cada conta considerando lançamentos pagos até a data (inclusive). */
export function saldosContas(contas: Conta[], lanc: Lancamento[], ate?: string) {
  const s = new Map(contas.map((c) => [c.id, c.saldoInicial]));
  for (const l of lanc) {
    if (ate && l.data > ate) continue;
    for (const [id, v] of efeitoContas(l)) s.set(id, (s.get(id) ?? 0) + v);
  }
  return s;
}

/** Entradas e saídas do período (só receitas/despesas pagas; transferência não conta). */
export function totais(lanc: Lancamento[]) {
  let entradas = 0, saidas = 0;
  for (const l of lanc) {
    if (l.status !== "pago") continue;
    if (l.tipo === "receita") entradas += l.valor;
    if (l.tipo === "despesa") saidas += l.valor;
  }
  return { entradas, saidas, resultado: entradas - saidas };
}

export function resumoMes(mes: string, contas: Conta[], lanc: Lancamento[]) {
  const inicio = `${mes}-01`, fim = fimDoMes(mes);
  const antes = saldosContas(contas, lanc, somarDias(inicio, -1));
  const depois = saldosContas(contas, lanc, fim);
  const doMes = lanc.filter((l) => l.data >= inicio && l.data <= fim);
  const t = totais(doMes);
  const h = hoje();
  const pendencias = lanc.filter((l) => l.status === "pendente" && (l.vencimento ?? l.data) <= fim);
  const soma = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  return {
    inicio, fim,
    saldoInicial: soma(antes),
    saldoFinal: soma(depois),
    entradas: t.entradas,
    saidas: t.saidas,
    porConta: contas.map((c) => ({ conta: c, inicial: antes.get(c.id) ?? 0, final: depois.get(c.id) ?? 0 })),
    pendencias,
    atrasadas: pendencias.filter((l) => situacao(l, h) === "atrasado"),
    lancamentos: doMes,
  };
}

export const mesFechado = (fech: Fechamento[] | undefined, data: string) => !!fech?.some((f) => f.mes === mesDe(data));

/** O que cada pessoa deve (receitas pendentes) e o que se deve a ela (despesas pendentes). */
export function saldoPessoa(p: Pessoa, lanc: Lancamento[]) {
  const dela = lanc.filter((l) => l.pessoaId === p.id);
  const aReceber = dela.filter((l) => l.tipo === "receita" && l.status === "pendente").reduce((a, l) => a + l.valor, 0);
  const aPagar = dela.filter((l) => l.tipo === "despesa" && l.status === "pendente").reduce((a, l) => a + l.valor, 0);
  const divisoes = lanc.flatMap((l) => (l.divisao ?? []).filter((d) => d.pessoaId === p.id).map((d) => ({ l, valor: d.valor })));
  const parteDividida = divisoes.reduce((a, d) => a + d.valor, 0);
  return { aReceber, aPagar, liquido: aReceber - aPagar, dela, divisoes, parteDividida };
}

export const ultimosMeses = (n: number, base = mesAtual()) =>
  Array.from({ length: n }, (_, i) => somarMeses(`${base}-01`, i - n + 1).slice(0, 7));
