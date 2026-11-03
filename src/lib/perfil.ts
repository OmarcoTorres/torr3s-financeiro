import type { Lancamento, Objetivo, Perfil, Uso } from "../db";
import { hoje, mesAtual, somarDias, totais, ultimosMeses } from "./calc";
import { dinheiro } from "./format";

export const OBJETIVOS: Record<Objetivo, { titulo: string; descricao: Record<Uso, string>; foco: string; meta?: { rotulo: string; ajuda: string } }> = {
  organizar: {
    titulo: "Organizar as contas",
    descricao: { pessoal: "Saber o que vence e não pagar nada atrasado.", empresa: "Ter as contas a pagar e a receber em dia." },
    foco: "Vencimentos sob controle",
  },
  gastos: {
    titulo: "Entender para onde vai o dinheiro",
    descricao: { pessoal: "Ver quanto vai para mercado, lazer, transporte…", empresa: "Ver quais custos pesam mais no mês." },
    foco: "Onde o dinheiro está indo",
  },
  economizar: {
    titulo: "Guardar dinheiro",
    descricao: { pessoal: "Fechar todo mês com sobra e montar uma reserva.", empresa: "Fechar o mês com caixa sobrando." },
    foco: "Meta de sobra do mês",
    meta: { rotulo: "Quanto quer guardar por mês?", ajuda: "É a sobra (entradas menos saídas) que você quer ver no fim do mês." },
  },
  dividas: {
    titulo: "Sair das dívidas",
    descricao: { pessoal: "Pôr limite nos gastos e quitar o que está atrasado.", empresa: "Reduzir custos e regularizar pendências." },
    foco: "Limite de gastos do mês",
    meta: { rotulo: "Qual o limite de gastos por mês?", ajuda: "Vamos avisar quando as saídas do mês chegarem perto desse valor." },
  },
  crescer: {
    titulo: "Aumentar as entradas",
    descricao: { pessoal: "Acompanhar a renda e ver ela subir mês a mês.", empresa: "Acompanhar faturamento, recebimentos e resultado." },
    foco: "Entradas e resultado",
  },
};

export function saudacao(nome: string) {
  const h = new Date().getHours();
  const primeiro = nome.trim().split(/\s+/)[0] || "";
  return `${h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"}${primeiro ? `, ${primeiro}` : ""}`;
}

/** Uma dica concreta, calculada com os próprios números do usuário. */
export function dicaDoDia(p: Perfil, lanc: Lancamento[]): string {
  const meses = ultimosMeses(3).slice(0, 2); // os dois meses anteriores ao atual
  const media = meses.map((m) => totais(lanc.filter((l) => l.data.startsWith(m))).saidas).reduce((a, b) => a + b, 0) / meses.length;
  const doMes = totais(lanc.filter((l) => l.data.startsWith(mesAtual())));
  const em30 = somarDias(hoje(), 30);
  const aPagar = lanc.filter((l) => l.tipo === "despesa" && l.status === "pendente" && (l.vencimento ?? l.data) <= em30).reduce((a, l) => a + l.valor, 0);

  switch (p.objetivo) {
    case "economizar":
      if (media > 0) {
        const qtd = p.idade && p.idade < 30 ? 3 : 6;
        return `Uma reserva de emergência costuma cobrir ${qtd} meses de gastos. Pela sua média recente, isso dá ${dinheiro(media * qtd)}.`;
      }
      return "Lance o salário e as contas fixas do mês: com isso já dá para ver quanto sobra e ajustar a meta.";
    case "dividas":
      return aPagar > 0
        ? `Você tem ${dinheiro(aPagar)} a pagar nos próximos 30 dias. Comece pelas contas com juros maiores, como cartão e cheque especial.`
        : "Cadastre as dívidas como lançamentos pendentes com vencimento: assim elas aparecem no início e no fechamento.";
    case "gastos":
      return doMes.saidas > 0
        ? "Abra Relatórios › Despesas por categoria para ver o que mais pesou neste mês."
        : "Use categorias em todos os gastos: é isso que monta o gráfico de para onde vai o dinheiro.";
    case "crescer":
      return doMes.entradas > 0
        ? `Entraram ${dinheiro(doMes.entradas)} neste mês. Compare com os anteriores em Relatórios › Fluxo de caixa.`
        : "Registre cada recebimento com a pessoa (cliente) vinculada para saber quem mais traz receita.";
    default:
      return aPagar > 0
        ? `Nos próximos 30 dias vencem ${dinheiro(aPagar)} em contas. Marque como pago assim que pagar, para o saldo ficar certo.`
        : "Ao lançar uma conta futura, coloque o vencimento: ela aparece no início alguns dias antes.";
  }
}
