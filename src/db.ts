import Dexie, { type EntityTable } from "dexie";

/** Valores sempre em centavos (inteiros). Datas em AAAA-MM-DD. */
export type Tipo = "receita" | "despesa" | "transferencia";
export type Status = "pago" | "pendente";

export interface Divisao { pessoaId: string; valor: number }

export interface Lancamento {
  id: string;
  tipo: Tipo;
  descricao: string;
  valor: number;
  data: string;
  vencimento?: string;
  categoriaId?: string;
  contaId?: string;
  contaDestinoId?: string;
  pessoaId?: string;
  status: Status;
  observacao?: string;
  fotoId?: string;
  grupo?: string;
  parcela?: number;
  totalParcelas?: number;
  recorrente?: boolean;
  divisao?: Divisao[];
  /** Visível para as pessoas do grupo (só leitura para elas). */
  compartilhado?: boolean;
  exemplo?: boolean;
  criadoEm: string;
}

export type TipoPessoa = "cliente" | "fornecedor" | "socio" | "funcionario" | "outro";
export interface Pessoa { id: string; nome: string; tipo: TipoPessoa; telefone?: string; observacao?: string; exemplo?: boolean; /** Usuário do Invest+ ligado a esta pessoa (grupo). */ userId?: string }

/** Lançamento que alguém do grupo compartilhou comigo (só leitura, vem do servidor). */
export interface Compartilhado {
  id: string; autorId: string; autorNome: string; tipo: Tipo; descricao: string; valor: number; data: string; vencimento?: string;
  status: Status; categoriaNome?: string; categoriaCor?: string; contaNome?: string; observacao?: string; atualizadoEm: string;
}

export interface Categoria { id: string; nome: string; tipo: "receita" | "despesa"; cor: string; icone: string; paiId?: string }
/** Conta bancária, carteira ou cartão de crédito (tipo "cartao": o saldo negativo é a fatura em aberto). */
export interface Conta {
  id: string; nome: string; saldoInicial: number; cor: string;
  tipo?: "conta" | "cartao";
  limite?: number;        // cartão: limite em centavos
  vencimentoDia?: number; // cartão: dia do vencimento da fatura
  final?: string;         // cartão: últimos 4 dígitos
  /** O grupo vê todos os lançamentos desta conta/cartão (só leitura). */
  compartilhada?: boolean;
}
export const ehCartao = (c?: Conta) => c?.tipo === "cartao";

export interface Meta {
  id: string; nome: string; alvo: number; guardado: number; prazo?: string; // AAAA-MM
  icone: string; cor: string; aportes: { data: string; valor: number }[]; criadoEm: string;
}
export interface Foto { id: string; blob: Blob }

export interface Fechamento {
  mes: string; // AAAA-MM
  fechadoEm: string;
  resumo: { saldoInicial: number; entradas: number; saidas: number; saldoFinal: number; pendencias: number };
}

export type Agrupar = "nenhum" | "categoria" | "pessoa" | "conta" | "mes";
export type Coluna = "data" | "descricao" | "tipo" | "categoria" | "conta" | "pessoa" | "status" | "vencimento" | "valor";
export interface ConfigRelatorio {
  de: string;
  ate: string;
  tipo?: Tipo | "";
  categoriaId?: string;
  contaId?: string;
  pessoaId?: string;
  status?: "pago" | "pendente" | "atrasado" | "aberto" | "";
  agrupar: Agrupar;
  colunas: Coluna[];
}
export interface RelatorioSalvo { id: string; nome: string; config: ConfigRelatorio }

export interface Config { chave: string; valor: unknown }
/** Mudança local ainda não enviada ao servidor. */
export interface ItemFila { chave: string; tabela: string; id: string; op: "put" | "del"; quando: number; /** Último erro do servidor ao enviar este item (não trava os outros). */ erro?: string }

class Banco extends Dexie {
  lancamentos!: EntityTable<Lancamento, "id">;
  pessoas!: EntityTable<Pessoa, "id">;
  categorias!: EntityTable<Categoria, "id">;
  contas!: EntityTable<Conta, "id">;
  fotos!: EntityTable<Foto, "id">;
  fechamentos!: EntityTable<Fechamento, "mes">;
  relatorios!: EntityTable<RelatorioSalvo, "id">;
  config!: EntityTable<Config, "chave">;
  metas!: EntityTable<Meta, "id">;
  fila!: EntityTable<ItemFila, "chave">;
  compartilhados!: EntityTable<Compartilhado, "id">;

  constructor() {
    super("financeiro");
    this.version(1).stores({
      lancamentos: "id, data, vencimento, tipo, categoriaId, contaId, pessoaId, status, grupo",
      pessoas: "id, nome",
      categorias: "id, tipo, paiId",
      contas: "id",
      fotos: "id",
      fechamentos: "mes",
      relatorios: "id",
      config: "chave",
    });
    this.version(2).stores({ metas: "id" });
    this.version(3).stores({ fila: "chave, quando" });
    this.version(4).stores({ compartilhados: "id, autorId, data" });
  }
}

export const db = new Banco();
export const novoId = () => crypto.randomUUID();

export type Uso = "pessoal" | "empresa";
export type Objetivo = "organizar" | "economizar" | "dividas" | "gastos" | "crescer";
export interface Perfil {
  nome: string;
  idade?: number;
  uso: Uso;
  empresa?: string;
  objetivo: Objetivo;
  /** Centavos. Meta de economia (economizar) ou limite de gastos (dividas) por mês. */
  meta?: number;
  criadoEm: string;
}

type CatBase = Omit<Categoria, "id">;
const c = (nome: string, tipo: "receita" | "despesa", cor: string, icone: string): CatBase => ({ nome, tipo, cor, icone });

const CATEGORIAS: Record<Uso, CatBase[]> = {
  empresa: [
    c("Vendas e serviços", "receita", "#1f9d63", "briefcase"),
    c("Outras receitas", "receita", "#4cb3e6", "plus"),
    c("Aluguel", "despesa", "#8b7cf6", "home"),
    c("Folha e pró-labore", "despesa", "#f08a4b", "users"),
    c("Impostos", "despesa", "#e5604d", "landmark"),
    c("Internet e telefone", "despesa", "#4cb3e6", "wifi"),
    c("Energia e água", "despesa", "#f2b84b", "zap"),
    c("Combustível", "despesa", "#f08a4b", "fuel"),
    c("Fornecedores", "despesa", "#5b5bd6", "cart"),
    c("Marketing", "despesa", "#8b7cf6", "megaphone"),
    c("Software e assinaturas", "despesa", "#4cb3e6", "monitor"),
    c("Outras despesas", "despesa", "#6b7090", "tag"),
  ],
  pessoal: [
    c("Salário", "receita", "#1f9d63", "briefcase"),
    c("Renda extra", "receita", "#4cb3e6", "plus"),
    c("Moradia", "despesa", "#8b7cf6", "home"),
    c("Mercado", "despesa", "#a3c93a", "cart"),
    c("Restaurantes e delivery", "despesa", "#f08a4b", "utensils"),
    c("Transporte", "despesa", "#f08a4b", "car"),
    c("Contas da casa", "despesa", "#f2b84b", "zap"),
    c("Saúde", "despesa", "#e5604d", "heart"),
    c("Educação", "despesa", "#5b5bd6", "school"),
    c("Lazer e viagens", "despesa", "#4cb3e6", "plane"),
    c("Assinaturas", "despesa", "#4cb3e6", "monitor"),
    c("Dívidas e empréstimos", "despesa", "#c06bd8", "landmark"),
    c("Outras despesas", "despesa", "#6b7090", "tag"),
  ],
};

/** Categorias e contas iniciais conforme o uso (pessoal ou empresa). */
export async function criarPadroes(uso: Uso = "empresa", saldoPrincipal = 0) {
  const cats = CATEGORIAS[uso].map((x) => ({ ...x, id: novoId() }));
  await db.categorias.bulkAdd(cats);
  const principal: Conta = { id: novoId(), nome: uso === "empresa" ? "Conta PJ" : "Conta corrente", saldoInicial: saldoPrincipal, cor: "#5b5bd6", tipo: "conta" };
  const caixa: Conta = { id: novoId(), nome: uso === "empresa" ? "Caixa" : "Carteira", saldoInicial: 0, cor: "#f08a4b", tipo: "conta" };
  await db.contas.bulkAdd([principal, caixa]);
  return { cats, principal, caixa };
}

/** Compatibilidade: versões antigas preenchiam o banco antes do cadastro do perfil. */
export function prepararBanco() {
  return Promise.resolve();
}

/**
 * Fim das boas-vindas. Se ainda não há lançamentos reais, monta o app do zero para o perfil
 * (categorias, contas e saldo inicial), sem nenhum lançamento. Se já há dados reais, só guarda o perfil.
 */
export async function aplicarPerfil(perfil: Perfil, opcoes: { saldoInicial: number; tour: boolean }) {
  await db.transaction("rw", [db.categorias, db.contas, db.pessoas, db.lancamentos, db.config, db.fotos], async () => {
    const reais = await db.lancamentos.filter((l) => !l.exemplo).count();
    if (reais === 0) {
      await db.lancamentos.clear();
      await db.pessoas.filter((p) => !!p.exemplo).delete();
      await db.categorias.clear();
      await db.contas.clear();
      await criarPadroes(perfil.uso, opcoes.saldoInicial);
    }
    await db.config.bulkPut([
      { chave: "perfil", valor: perfil },
      { chave: "empresa", valor: perfil.uso === "empresa" && perfil.empresa ? perfil.empresa : perfil.nome },
      { chave: "preparado", valor: true },
      { chave: "tourPendente", valor: opcoes.tour },
    ]);
  });
}

/** Remove lançamentos e pessoas de exemplo criados por versões antigas do app. */
export async function removerExemplos() {
  await db.transaction("rw", db.lancamentos, db.pessoas, async () => {
    const ex = await db.lancamentos.filter((l) => l.exemplo === true).primaryKeys();
    await db.lancamentos.bulkDelete(ex);
    const pex = await db.pessoas.filter((p) => p.exemplo === true).primaryKeys();
    await db.pessoas.bulkDelete(pex);
  });
}

export function isoLocal(d: Date) {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
