import type { Categoria, Coluna, ConfigRelatorio, Conta, Lancamento, Pessoa } from "../db";
import { dataBR, dinheiro, mesCurto } from "./format";
import { mesDe, situacao } from "./calc";

export interface Dados { lanc: Lancamento[]; cats: Categoria[]; contas: Conta[]; pessoas: Pessoa[] }
export interface Tabela { cabecalho: string[]; linhas: string[][]; numericas: number[]; total?: string[]; grafico?: { rotulo: string; valor: number; cor?: string }[] }

export const NOME_COLUNA: Record<Coluna, string> = {
  data: "Data", descricao: "Descrição", tipo: "Tipo", categoria: "Categoria", conta: "Conta",
  pessoa: "Pessoa", status: "Situação", vencimento: "Vencimento", valor: "Valor",
};
export const TODAS_COLUNAS = Object.keys(NOME_COLUNA) as Coluna[];
const TIPO: Record<string, string> = { receita: "Receita", despesa: "Despesa", transferencia: "Transferência" };
const SIT: Record<string, string> = { pago: "Pago", pendente: "Pendente", atrasado: "Atrasado" };

export function filtrar(c: ConfigRelatorio, lanc: Lancamento[]) {
  return lanc.filter((l) =>
    l.data >= c.de && l.data <= c.ate &&
    (!c.tipo || l.tipo === c.tipo) &&
    (!c.categoriaId || l.categoriaId === c.categoriaId) &&
    (!c.contaId || l.contaId === c.contaId || l.contaDestinoId === c.contaId) &&
    (!c.pessoaId || l.pessoaId === c.pessoaId) &&
    (!c.status || (c.status === "aberto" ? l.status === "pendente" : situacao(l) === c.status)),
  ).sort((a, b) => a.data.localeCompare(b.data));
}

/** Valor com sinal para somar: receita +, despesa -, transferência 0. */
const assinado = (l: Lancamento) => (l.tipo === "receita" ? l.valor : l.tipo === "despesa" ? -l.valor : 0);

export function montarTabela(c: ConfigRelatorio, d: Dados): Tabela {
  const nomes = {
    cat: new Map(d.cats.map((x) => [x.id, x])),
    conta: new Map(d.contas.map((x) => [x.id, x.nome])),
    pessoa: new Map(d.pessoas.map((x) => [x.id, x.nome])),
  };
  const lista = filtrar(c, d.lanc);

  if (c.agrupar === "nenhum") {
    const cols = c.colunas.length ? c.colunas : TODAS_COLUNAS;
    const celula = (l: Lancamento, col: Coluna): string => {
      switch (col) {
        case "data": return dataBR(l.data);
        case "descricao": return l.descricao + (l.totalParcelas ? ` (${l.parcela}/${l.totalParcelas})` : "");
        case "tipo": return TIPO[l.tipo];
        case "categoria": return nomes.cat.get(l.categoriaId ?? "")?.nome ?? "—";
        case "conta": return (nomes.conta.get(l.contaId ?? "") ?? "—") + (l.contaDestinoId ? ` → ${nomes.conta.get(l.contaDestinoId) ?? "?"}` : "");
        case "pessoa": return nomes.pessoa.get(l.pessoaId ?? "") ?? "—";
        case "status": return SIT[situacao(l)];
        case "vencimento": return dataBR(l.vencimento);
        case "valor": return (l.tipo === "despesa" ? "-" : "") + dinheiro(l.valor);
      }
    };
    const total = lista.reduce((a, l) => a + assinado(l), 0);
    const iValor = cols.indexOf("valor");
    return {
      cabecalho: cols.map((x) => NOME_COLUNA[x]),
      linhas: lista.map((l) => cols.map((col) => celula(l, col))),
      numericas: iValor >= 0 ? [iValor] : [],
      total: iValor >= 0 ? cols.map((col, i) => (i === 0 ? `${lista.length} lançamento(s)` : col === "valor" ? dinheiro(total) : "")) : undefined,
    };
  }

  const chave = (l: Lancamento): [string, string, string | undefined] => {
    switch (c.agrupar) {
      case "categoria": { const cat = nomes.cat.get(l.categoriaId ?? ""); return [l.categoriaId ?? "-", cat?.nome ?? "Sem categoria", cat?.cor]; }
      case "pessoa": return [l.pessoaId ?? "-", nomes.pessoa.get(l.pessoaId ?? "") ?? "Sem pessoa", undefined];
      case "conta": return [l.contaId ?? "-", nomes.conta.get(l.contaId ?? "") ?? "Sem conta", undefined];
      default: return [mesDe(l.data), mesCurto(mesDe(l.data)), undefined];
    }
  };
  const grupos = new Map<string, { rotulo: string; cor?: string; ent: number; sai: number; qtd: number }>();
  for (const l of lista) {
    if (l.tipo === "transferencia") continue;
    const [k, rotulo, cor] = chave(l);
    const g = grupos.get(k) ?? { rotulo, cor, ent: 0, sai: 0, qtd: 0 };
    if (l.tipo === "receita") g.ent += l.valor; else g.sai += l.valor;
    g.qtd++;
    grupos.set(k, g);
  }
  const ordenados = [...grupos.entries()].sort((a, b) =>
    c.agrupar === "mes" ? a[0].localeCompare(b[0]) : (b[1].ent + b[1].sai) - (a[1].ent + a[1].sai));
  const soma = ordenados.reduce((a, [, g]) => ({ ent: a.ent + g.ent, sai: a.sai + g.sai, qtd: a.qtd + g.qtd }), { ent: 0, sai: 0, qtd: 0 });
  const rotuloGrupo = { categoria: "Categoria", pessoa: "Pessoa", conta: "Conta", mes: "Mês" }[c.agrupar];
  const soDespesa = c.tipo === "despesa";
  return {
    cabecalho: [rotuloGrupo, "Lançamentos", "Entradas", "Saídas", "Resultado"],
    linhas: ordenados.map(([, g]) => [g.rotulo, String(g.qtd), dinheiro(g.ent), dinheiro(g.sai), dinheiro(g.ent - g.sai)]),
    numericas: [1, 2, 3, 4],
    total: ["Total", String(soma.qtd), dinheiro(soma.ent), dinheiro(soma.sai), dinheiro(soma.ent - soma.sai)],
    grafico: ordenados.map(([, g]) => ({ rotulo: g.rotulo, valor: soDespesa ? g.sai : c.tipo === "receita" ? g.ent : g.ent - g.sai, cor: g.cor })),
  };
}
