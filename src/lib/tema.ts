/**
 * Temática do app conforme o tipo do grupo principal: cor, ícone e o tom das mensagens
 * (saudação, mensagem do dia, incentivo nas metas, comemoração ao guardar e convite).
 * `{p}` = primeiro nome de quem está com você no grupo (ou "vocês"), `{eu}` = seu primeiro nome.
 */
export type TipoGrupo = "casal" | "irmaos" | "familia" | "amigos" | "estudo" | "empresa" | "outro";

export interface Tema {
  rotulo: string;
  descricao: string;
  icone: string;            // chave de ICONES (components/ui)
  cor: string;              // cor de destaque do app quando o visual do grupo está ligado
  nomeSugerido: string;
  tituloMetas: string;      // "Metas do casal"
  saudacoes: string[];      // completam "Bom dia, Marco" na segunda linha
  mensagensDoDia: string[];
  incentivos: string[];     // aparecem na meta compartilhada
  comemoracoes: string[];   // depois de guardar ({v} = valor)
  aporteDoOutro: string[];  // quando outra pessoa guardou ({quem}, {v})
  convite: string;          // primeira linha do convite pelo WhatsApp
  sugestoesMeta: string[];
}

export const TEMAS: Record<TipoGrupo, Tema> = {
  casal: {
    rotulo: "Casal",
    descricao: "Para planejar a vida a dois: sonhos, casa, viagens e o futuro de vocês.",
    icone: "heart", cor: "#d6457a", nomeSugerido: "Nós dois", tituloMetas: "Metas do casal",
    saudacoes: [
      "Hoje é mais um dia construindo o futuro de vocês dois.",
      "Que bom ter você aqui. {p} e você estão no mesmo time.",
      "Amor também é cuidar junto do que vem pela frente.",
    ],
    mensagensDoDia: [
      "Cada real guardado hoje é um pedacinho do sonho de vocês dois.",
      "Sonhar junto é lindo. Realizar junto é ainda melhor.",
      "Que tal mandar um carinho para {p} e combinar o aporte da semana?",
      "Dinheiro organizado é menos briga e mais tempo para vocês.",
      "Um jantar em casa hoje pode virar uma viagem a dois amanhã.",
      "Vocês não precisam fazer tudo de uma vez. Um passo de cada vez, de mãos dadas.",
      "Combinar os gastos também é uma forma de dizer “eu cuido de nós”.",
      "Lembre {p} do quanto vocês já conquistaram juntos.",
    ],
    incentivos: [
      "Juntos vocês chegam mais rápido. Bora guardar um pouquinho hoje?",
      "Falta pouco para esse sonho virar memória de vocês dois.",
      "Cada aporte é um “eu te amo” com data marcada.",
    ],
    comemoracoes: ["{v} guardados com amor. O sonho de vocês ficou mais perto! 💕", "Mais {v} para o futuro de vocês dois. Que time! ❤️"],
    aporteDoOutro: ["{quem} guardou {v} para vocês. Que tal agradecer com um beijo? 💕", "{quem} colocou {v} no sonho de vocês. ❤️"],
    convite: "Oi, amor! Criei o nosso cantinho no Invest+ para a gente cuidar do dinheiro e dos nossos sonhos juntos. 💕",
    sugestoesMeta: ["Viagem a dois", "Nossa casa", "Casamento", "Reserva do casal"],
  },
  irmaos: {
    rotulo: "Irmãos",
    descricao: "Para dividir contas, ajudar a família e juntar para objetivos em comum.",
    icone: "users", cor: "#2f8f83", nomeSugerido: "Irmãos", tituloMetas: "Metas dos irmãos",
    saudacoes: ["Família que se organiza junta, se ajuda melhor.", "Bora manter as contas de vocês em dia?"],
    mensagensDoDia: [
      "Combinado entre irmãos não sai caro: deixe registrado quem paga o quê.",
      "Que tal ver com {p} se as contas divididas do mês estão em dia?",
      "Juntar um pouco cada um faz a meta da família andar rápido.",
      "Ajudar em casa fica mais leve quando todo mundo sabe quanto falta.",
    ],
    incentivos: ["Cada um com um pouquinho e a meta sai do papel.", "Família unida, meta batida."],
    comemoracoes: ["{v} guardados. Os irmãos agradecem! 🙌", "Mais {v} na meta da família. Boa!"],
    aporteDoOutro: ["{quem} guardou {v} na meta de vocês. 🙌", "{quem} fez a parte dele(a): {v}."],
    convite: "Oi! Criei um grupo nosso no Invest+ para a gente organizar as contas e as metas da família juntos.",
    sugestoesMeta: ["Presente da mãe", "Reforma da casa", "Viagem da família", "Reserva da família"],
  },
  familia: {
    rotulo: "Família",
    descricao: "Para a casa toda: contas, reserva e os planos da família.",
    icone: "home", cor: "#c9771f", nomeSugerido: "Nossa família", tituloMetas: "Metas da família",
    saudacoes: ["Cuidar do dinheiro também é cuidar de quem a gente ama.", "A família de vocês está em boas mãos."],
    mensagensDoDia: [
      "Uma reserva de emergência é o abraço que a família recebe nos dias difíceis.",
      "Que tal conversar com {p} sobre os planos do próximo mês?",
      "Pequenas economias em casa viram grandes momentos em família.",
    ],
    incentivos: ["Todo mundo junto, cada um com um pouco.", "A família inteira chega lá."],
    comemoracoes: ["{v} guardados para a família. 🏡", "Mais {v} para os planos de vocês."],
    aporteDoOutro: ["{quem} guardou {v} para a família. 🏡"],
    convite: "Oi! Criei o grupo da nossa família no Invest+ para a gente organizar as contas e os planos juntos.",
    sugestoesMeta: ["Reserva de emergência", "Férias em família", "Escola", "Casa nova"],
  },
  amigos: {
    rotulo: "Amigos",
    descricao: "Para a viagem da galera, o rolê e as despesas divididas.",
    icone: "plane", cor: "#3d7be0", nomeSugerido: "A galera", tituloMetas: "Metas da galera",
    saudacoes: ["Bora fazer esse rolê acontecer?", "A galera está contando com você."],
    mensagensDoDia: [
      "A viagem dos sonhos começa com um Pix por semana.",
      "Cobra o {p}! Brincadeira... ou não. 😄",
      "Despesa dividida e anotada é amizade que dura.",
    ],
    incentivos: ["Cada um com a sua parte e o rolê sai.", "Falta pouco para a galera comemorar."],
    comemoracoes: ["{v} guardados. O rolê agradece! 🎉", "Mais {v} na meta da galera. 🎉"],
    aporteDoOutro: ["{quem} mandou {v} para a meta da galera. 🎉"],
    convite: "Fala! Criei um grupo nosso no Invest+ para a gente juntar a grana do rolê e dividir as contas.",
    sugestoesMeta: ["Viagem da galera", "Show", "Churrasco", "Presente de aniversário"],
  },
  estudo: {
    rotulo: "Estudo",
    descricao: "Para cursos, materiais, intercâmbio e a vida de estudante.",
    icone: "school", cor: "#6c4ed8", nomeSugerido: "Turma de estudo", tituloMetas: "Metas de estudo",
    saudacoes: ["Investir em conhecimento rende os melhores juros.", "Foco nos estudos e nas contas em dia."],
    mensagensDoDia: [
      "Um curso pago com dinheiro guardado é um curso sem dívida.",
      "Que tal combinar com {p} a meta do material do semestre?",
      "Conhecimento é o único investimento que ninguém tira de você.",
      "Organize os gastos do semestre antes que eles organizem você.",
    ],
    incentivos: ["Passo a passo, como em toda matéria difícil.", "Mais perto do diploma (e da formatura)."],
    comemoracoes: ["{v} guardados para os estudos. 📚", "Mais {v} investidos em conhecimento."],
    aporteDoOutro: ["{quem} guardou {v} na meta de estudo de vocês. 📚"],
    convite: "Oi! Criei um grupo no Invest+ para a gente organizar a grana dos estudos e das metas juntos.",
    sugestoesMeta: ["Curso", "Formatura", "Intercâmbio", "Material do semestre"],
  },
  empresa: {
    rotulo: "Empresa",
    descricao: "Para sócios e equipe: caixa, investimentos e metas do negócio.",
    icone: "briefcase", cor: "#0f6b52", nomeSugerido: "Sócios", tituloMetas: "Metas da empresa",
    saudacoes: ["Caixa organizado, decisão bem tomada.", "Vamos ver como está o negócio hoje."],
    mensagensDoDia: [
      "Separe o dinheiro da empresa do pessoal. Seu eu do futuro agradece.",
      "Alinhe com {p} as contas a pagar da semana.",
      "Reserva de caixa para 3 meses de custo fixo dá tranquilidade para crescer.",
      "Meta clara, prazo definido, responsável combinado.",
    ],
    incentivos: ["Cada aporte aproxima a empresa do próximo passo.", "Disciplina de caixa vira crescimento."],
    comemoracoes: ["{v} guardados para o negócio. 📈", "Mais {v} na meta da empresa."],
    aporteDoOutro: ["{quem} aportou {v} na meta da empresa. 📈"],
    convite: "Olá! Criei o grupo da empresa no Invest+ para acompanharmos juntos o caixa e as metas do negócio.",
    sugestoesMeta: ["Reserva de caixa", "Equipamento novo", "Marketing", "Expansão"],
  },
  outro: {
    rotulo: "Outro",
    descricao: "Um grupo geral, sem tema específico.",
    icone: "users", cor: "#5b5bd6", nomeSugerido: "Nosso grupo", tituloMetas: "Metas do grupo",
    saudacoes: ["Que bom ter você por aqui."],
    mensagensDoDia: ["Metas em grupo andam mais rápido: cada um com um pouco.", "Que tal combinar com {p} o aporte da semana?"],
    incentivos: ["Juntos fica mais fácil."],
    comemoracoes: ["{v} guardados. Boa!"],
    aporteDoOutro: ["{quem} guardou {v} na meta de vocês."],
    convite: "Oi! Te convidei para o meu grupo no Invest+, o app que eu uso para organizar as finanças.",
    sugestoesMeta: ["Reserva", "Viagem", "Projeto"],
  },
};

export const TIPOS: TipoGrupo[] = ["casal", "irmaos", "familia", "amigos", "estudo", "empresa", "outro"];
export const temaDe = (tipo?: string | null): Tema => TEMAS[(tipo as TipoGrupo) in TEMAS ? (tipo as TipoGrupo) : "outro"];

/** Escolhe uma frase que muda por dia (estável ao longo do dia) e preenche {p}, {eu}, {v}, {quem}. */
export function frase(lista: string[], vars: Record<string, string> = {}, semente = 0) {
  if (!lista.length) return "";
  const d = new Date();
  const dia = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
  const s = lista[(dia + semente) % lista.length];
  return s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? (k === "p" ? "vocês" : ""));
}
export const primeiroNome = (n?: string) => (n ?? "").trim().split(/\s+/)[0] ?? "";
