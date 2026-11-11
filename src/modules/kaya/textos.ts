import type { Perfil, PerfilUso } from "./tipos";

export const NOME = "Kaya Life";
export const DISCLAIMER = "O Kaya Life não substitui acompanhamento profissional de saúde.";
export const PRINCIPIO = "Só registro e controle pessoal. O Kaya Life não incentiva o uso, não vende, não indica produtos nem doses.";

/** O termo que a pessoa escolheu, para usar no meio da frase ("sua relação com a medicina"). */
export const termo = (p?: Pick<Perfil, "termo"> | null) => (p?.termo || "kaya").trim().toLowerCase();
export const Termo = (p?: Pick<Perfil, "termo"> | null) => { const t = termo(p); return t.charAt(0).toUpperCase() + t.slice(1); };

export const OP = {
  propositos: [["entender", "Entender meu uso"], ["gastar_menos", "Gastar menos"], ["reduzir", "Reduzir ou pausar"], ["sintomas", "Acompanhar sintomas para levar ao médico"], ["significado", "Dar mais significado ao meu uso"], ["curiosidade", "Só curiosidade"]],
  relacao: [["medicinal_prescricao", "Medicinal, com prescrição"], ["medicinal_sem", "Medicinal, sem acompanhamento"], ["recreativa", "Recreativa"], ["ritual", "Ritual / espiritual"], ["criativa", "Criativa / social"], ["entendendo", "Ainda estou entendendo"]],
  tempo: [["<6m", "Menos de 6 meses"], ["6m-2a", "6 meses a 2 anos"], ["2-5a", "2 a 5 anos"], [">5a", "Mais de 5 anos"], ["nao_uso", "Ainda não uso"]],
  frequencia: [["raro", "Raramente"], ["semanal", "Semanal"], ["quase_diario", "Quase diário"], ["diario", "Diário"], ["mais_dia", "Mais de uma vez ao dia"]],
  formas: [["fumada", "Fumada"], ["vaporizada", "Vaporizada"], ["comestivel", "Comestível"], ["oleo", "Óleo / tintura"], ["topica", "Tópica"]],
  saude: [["dor", "Dor"], ["sono", "Sono"], ["ansiedade", "Ansiedade"], ["apetite", "Apetite"], ["outro", "Outro"]],
  acompanhamento: [["sim", "Sim"], ["nao", "Não"], ["quero", "Quero ter"]],
  sentimento: [["bem", "Me faz bem"], ["equilibrado", "Está equilibrado"], ["foge", "Às vezes foge do meu controle"], ["rever", "Quero rever"]],
  arrependimentos: [["dirigir", "Antes de dirigir"], ["trabalho", "No trabalho ou estudo"], ["sozinho", "Sozinho(a) em dias difíceis"], ["excesso", "Em excesso"]],
  termos: [["kaya", "kaya"], ["medicina", "medicina"], ["cannabis", "cannabis"], ["erva", "erva"]],
  contexto: [["sozinho", "Sozinho(a)"], ["social", "Com pessoas"], ["descanso", "Para descansar"], ["sono", "Para dormir"], ["dor", "Por dor"], ["criativo", "Criativo"], ["ritual", "Ritual"], ["tedio", "Tédio"], ["estresse", "Estresse"]],
  quantidade: [["pouco", "Pouco"], ["moderado", "Moderado"], ["muito", "Muito"]],
  emocoes: ["calma", "gratidão", "ansiedade", "cansaço", "alegria", "tristeza", "irritação", "foco", "solidão", "leveza"],
} as const satisfies Record<string, readonly (readonly [string, string])[] | readonly string[]>;
export const rotulo = (lista: readonly (readonly [string, string])[], v?: string) => lista.find(([k]) => k === v)?.[1] ?? v ?? "";

export const REGRAS_SUGERIDAS = ["Não usar antes de dirigir", "Duas noites de pausa por semana", "Não usar para dormir todo dia"];

/** perfil_uso a partir das respostas. A pessoa pode trocar quando quiser, sem perder histórico. */
export function calcularPerfilUso(p: Pick<Perfil, "relacao" | "saude" | "sentimento" | "propositos">): PerfilUso {
  const medicinal = p.relacao.startsWith("medicinal") || p.saude.length > 0;
  const outro = ["recreativa", "ritual", "criativa"].includes(p.relacao);
  if (p.sentimento === "foge" || p.sentimento === "rever" || p.propositos.includes("reduzir")) return "em_reavaliacao";
  if (medicinal && outro) return "misto";
  if (medicinal) return "medicinal";
  if (p.relacao === "ritual") return "ritual";
  if (p.relacao === "recreativa" || p.relacao === "criativa") return "recreativo";
  return "misto";
}
export const ROTULO_PERFIL: Record<PerfilUso, string> = { medicinal: "Medicinal", recreativo: "Recreativo", ritual: "Ritual", em_reavaliacao: "Em reavaliação", misto: "Misto" };
export const mostrarApoio = (p: Pick<Perfil, "sentimento" | "arrependimentos">) => p.sentimento === "foge" || p.sentimento === "rever" || p.arrependimentos.length > 0;

const FRASES = [
  "Antes de escolher, respire. A pausa também é uma escolha.",
  "Observar sem julgar já é cuidado.",
  "Intenção clara, escolha leve.",
  "Hoje você pode decidir com calma.",
  "Seu ritmo é seu. Compare-se só com você.",
  "Perceber a tendência é o primeiro passo para escolhê-la.",
  "Uma noite de pausa diz muito sobre o que você precisa.",
  "Cuidar do sono, da água e do corpo também é parte do caminho.",
];
export const fraseDoDia = (data = new Date()) => FRASES[Math.floor(data.getTime() / 86_400_000) % FRASES.length];

export const PROMPTS_DIARIO: Record<PerfilUso, string[]> = {
  medicinal: ["Como estiveram seus sintomas hoje?", "O que você quer contar ao seu médico na próxima consulta?", "O que ajudou além do tratamento?"],
  recreativo: ["O que você buscava hoje?", "Como foi o dia seguinte da última vez?", "Que momento de hoje foi bom sem nada?"],
  ritual: ["Qual foi a intenção do seu último ritual?", "O que você aprendeu sobre si nesta semana?", "Como você honra a pausa?"],
  em_reavaliacao: ["O que você quer que mude, e por quê?", "Qual foi um momento de escolha hoje?", "O que te ajudou a fazer uma pausa?"],
  misto: ["Como você está agora, de verdade?", "O que você percebeu sobre sua tendência esta semana?", "O que te faz bem além da {t}?"],
};

export const APRENDER: { titulo: string; texto: string }[] = [
  { titulo: "Dirigir depois do uso", texto: "O efeito reduz reflexo e atenção por horas, mesmo quando você se sente bem. A regra mais segura é não dirigir no mesmo dia." },
  { titulo: "Mito: \"natural é sempre seguro\"", texto: "Natural não quer dizer sem risco. Concentração, frequência e contexto mudam muito o efeito no corpo e na mente." },
  { titulo: "Sono", texto: "Usar para dormir todos os dias pode trazer tolerância e piorar o sono quando você para. Pausas ajudam a perceber o seu sono de verdade." },
  { titulo: "Ansiedade e paranoia", texto: "Em algumas pessoas, e principalmente em quantidades maiores, o efeito pode aumentar a ansiedade. Observe no seu registro como você fica depois." },
  { titulo: "Adolescência e saúde mental", texto: "O cérebro se desenvolve até cerca dos 25 anos. Histórico de psicose na família pede cuidado redobrado e conversa com profissional." },
  { titulo: "Misturas", texto: "Misturar com álcool ou outras substâncias aumenta os riscos de forma imprevisível." },
  { titulo: "Pausas e tolerância", texto: "Pausas de alguns dias reduzem a tolerância. Desconfortos leves nos primeiros dias são comuns e passam." },
  { titulo: "Uso medicinal", texto: "Tratamento é com profissional de saúde. O Kaya Life só ajuda a registrar e levar informação organizada para a consulta." },
];

export const FAQ: { p: string; r: string }[] = [
  { p: "O Kaya Life incentiva o uso?", r: "Não. O Kaya Life é só registro e controle pessoal. Não incentiva, não glamouriza e não sugere usar. Ele existe para você enxergar a sua própria relação com a {t} e decidir com mais consciência, inclusive para reduzir ou pausar." },
  { p: "O app vende, indica produtos, marcas, lojas ou doses?", r: "Nunca. Não há venda, indicação de produto, marca, local de compra, nem sugestão de dose ou de forma de uso. Não temos anúncios nem comissão de ninguém." },
  { p: "Para que serve, então?", r: "Para registrar com honestidade (quando, como, por quê, quanto custou, como você ficou) e acompanhar tendências, gastos, pausas e regras que você mesmo(a) definiu. É um espelho, não um conselheiro." },
  { p: "O Kaya Life substitui médico ou terapia?", r: "Não. O Kaya Life não substitui acompanhamento profissional de saúde. No uso medicinal, ele só organiza seus registros e gera um relatório para você levar ao profissional que te acompanha." },
  { p: "Quem consegue ver os meus dados?", r: "Só você. Tudo é cifrado no seu aparelho antes de ser salvo (AES-256). Na nuvem fica apenas um bloco ilegível; nem a equipe do app consegue abrir. Nada do Kaya Life é compartilhado com grupos, com o Invest+ ou com o Vida+." },
  { p: "E se eu esquecer o PIN?", r: "Use o código de recuperação que aparece uma única vez quando você cria o cofre. Sem o PIN e sem o código, ninguém consegue abrir os dados, nem nós. Guarde o código em lugar seguro." },
  { p: "Posso guardar só no meu celular?", r: "Sim. Em Privacidade, ligue \"Só neste aparelho\": os blocos e o cofre são apagados da nuvem e nada mais sobe. Atenção: se o aparelho for perdido, os dados vão junto." },
  { p: "Como apago tudo?", r: "Em Privacidade › Excluir tudo. Apaga na hora, na nuvem e neste aparelho, sem volta. Antes, se quiser, exporte uma cópia." },
  { p: "As notificações revelam alguma coisa?", r: "Não. Quando houver lembretes, eles serão neutros (por exemplo, \"Hora do seu check-in\") e nunca citam o módulo nem a planta." },
  { p: "Usa inteligência artificial?", r: "Não nesta versão. Os insights são calculados no seu próprio aparelho, comparando você só com você." },
  { p: "Por que preciso ter 18 anos ou mais?", r: "O Kaya Life é destinado exclusivamente a maiores de 18 anos." },
  { p: "Estou passando por um momento difícil. Onde busco ajuda?", r: "CVV: ligue 188 (24 h, gratuito) ou cvv.org.br. CAPS AD: atendimento gratuito do SUS para questões com álcool e outras drogas; procure o mais perto de você. Em emergência, SAMU 192." },
];

export const APOIO = [
  { nome: "CVV — Centro de Valorização da Vida", detalhe: "Ligue 188, 24 horas, gratuito. Também por chat em cvv.org.br", link: "tel:188" },
  { nome: "CAPS AD (SUS)", detalhe: "Atendimento gratuito para quem quer cuidar da relação com álcool e outras drogas. Procure a unidade mais próxima pela prefeitura ou UBS.", link: "https://www.google.com/maps/search/CAPS+AD" },
  { nome: "SAMU", detalhe: "Emergência médica: 192", link: "tel:192" },
];
