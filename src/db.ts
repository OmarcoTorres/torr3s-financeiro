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
  exemplo?: boolean;
  criadoEm: string;
}

export type TipoPessoa = "cliente" | "fornecedor" | "socio" | "funcionario" | "outro";
export interface Pessoa { id: string; nome: string; tipo: TipoPessoa; telefone?: string; observacao?: string; exemplo?: boolean }

export interface Categoria { id: string; nome: string; tipo: "receita" | "despesa"; cor: string; icone: string; paiId?: string }
export interface Conta { id: string; nome: string; saldoInicial: number; cor: string }
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

class Banco extends Dexie {
  lancamentos!: EntityTable<Lancamento, "id">;
  pessoas!: EntityTable<Pessoa, "id">;
  categorias!: EntityTable<Categoria, "id">;
  contas!: EntityTable<Conta, "id">;
  fotos!: EntityTable<Foto, "id">;
  fechamentos!: EntityTable<Fechamento, "mes">;
  relatorios!: EntityTable<RelatorioSalvo, "id">;
  config!: EntityTable<Config, "chave">;

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
    c("Vendas e serviços", "receita", "#1f8a5b", "briefcase"),
    c("Outras receitas", "receita", "#2c7da0", "plus"),
    c("Aluguel", "despesa", "#8e5ad8", "home"),
    c("Folha e pró-labore", "despesa", "#d0604a", "users"),
    c("Impostos", "despesa", "#b23a48", "landmark"),
    c("Internet e telefone", "despesa", "#3d7ea6", "wifi"),
    c("Energia e água", "despesa", "#d89a1c", "zap"),
    c("Combustível", "despesa", "#c2702b", "fuel"),
    c("Fornecedores", "despesa", "#4a5bd0", "cart"),
    c("Marketing", "despesa", "#8e5ad8", "megaphone"),
    c("Software e assinaturas", "despesa", "#2c7da0", "monitor"),
    c("Outras despesas", "despesa", "#6b7a74", "tag"),
  ],
  pessoal: [
    c("Salário", "receita", "#1f8a5b", "briefcase"),
    c("Renda extra", "receita", "#2c7da0", "plus"),
    c("Moradia", "despesa", "#8e5ad8", "home"),
    c("Mercado", "despesa", "#5e9f3e", "cart"),
    c("Restaurantes e delivery", "despesa", "#d0604a", "utensils"),
    c("Transporte", "despesa", "#c2702b", "car"),
    c("Contas da casa", "despesa", "#d89a1c", "zap"),
    c("Saúde", "despesa", "#b23a48", "heart"),
    c("Educação", "despesa", "#4a5bd0", "school"),
    c("Lazer e viagens", "despesa", "#2c7da0", "plane"),
    c("Assinaturas", "despesa", "#3d7ea6", "monitor"),
    c("Dívidas e empréstimos", "despesa", "#6b4a3a", "landmark"),
    c("Outras despesas", "despesa", "#6b7a74", "tag"),
  ],
};

/** Categorias e contas iniciais conforme o uso (pessoal ou empresa). */
export async function criarPadroes(uso: Uso = "empresa", saldoPrincipal = 0) {
  const cats = CATEGORIAS[uso].map((x) => ({ ...x, id: novoId() }));
  await db.categorias.bulkAdd(cats);
  const principal: Conta = { id: novoId(), nome: uso === "empresa" ? "Conta PJ" : "Conta corrente", saldoInicial: saldoPrincipal, cor: "#16202c" };
  const caixa: Conta = { id: novoId(), nome: uso === "empresa" ? "Caixa" : "Carteira", saldoInicial: 0, cor: "#b8681c" };
  await db.contas.bulkAdd([principal, caixa]);
  return { cats, principal, caixa };
}

/** Compatibilidade: versões antigas preenchiam o banco antes do cadastro do perfil. */
export function prepararBanco() {
  return Promise.resolve();
}

/**
 * Fim das boas-vindas. Se ainda não há lançamentos reais, monta o app do zero para o perfil
 * (categorias, contas, saldo inicial e, se pedido, exemplos). Se já há dados reais, só guarda o perfil.
 */
export async function aplicarPerfil(perfil: Perfil, opcoes: { saldoInicial: number; exemplos: boolean; tour: boolean }) {
  await db.transaction("rw", [db.categorias, db.contas, db.pessoas, db.lancamentos, db.config, db.fotos], async () => {
    const reais = await db.lancamentos.filter((l) => !l.exemplo).count();
    if (reais === 0) {
      await db.lancamentos.clear();
      await db.pessoas.filter((p) => !!p.exemplo).delete();
      await db.categorias.clear();
      await db.contas.clear();
      const base = await criarPadroes(perfil.uso, opcoes.saldoInicial);
      if (opcoes.exemplos) await criarExemplos(perfil.uso, base);
    }
    await db.config.bulkPut([
      { chave: "perfil", valor: perfil },
      { chave: "empresa", valor: perfil.uso === "empresa" && perfil.empresa ? perfil.empresa : perfil.nome },
      { chave: "preparado", valor: true },
      { chave: "tourPendente", valor: opcoes.tour },
    ]);
  });
}

async function criarExemplos(uso: Uso, base: Awaited<ReturnType<typeof criarPadroes>>) {
  const { cats, principal, caixa } = base;
  const cat = (n: string) => cats.find((x) => x.nome === n)?.id;
  const hoje = new Date();
  const d = (dias: number) => isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + dias));
  const dia1 = isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const p = (nome: string, tipo: TipoPessoa): Pessoa => ({ id: novoId(), nome: `${nome} (exemplo)`, tipo, exemplo: true });
  const l = (x: Partial<Lancamento> & Pick<Lancamento, "tipo" | "descricao" | "valor" | "data" | "status">): Lancamento => ({
    id: novoId(), contaId: principal.id, criadoEm: new Date().toISOString(), exemplo: true, ...x,
  });
  if (uso === "empresa") {
    const cliente = p("Posto Central", "cliente"), joao = p("João Almeida", "cliente"), net = p("NetFibra", "fornecedor");
    await db.pessoas.bulkAdd([cliente, joao, net]);
    await db.lancamentos.bulkAdd([
      l({ tipo: "receita", descricao: "Consultoria mensal", valor: 850000, data: d(-30), status: "pago", categoriaId: cat("Vendas e serviços"), pessoaId: cliente.id }),
      l({ tipo: "despesa", descricao: "Aluguel do escritório", valor: 280000, data: d(-28), status: "pago", categoriaId: cat("Aluguel") }),
      l({ tipo: "despesa", descricao: "Internet fibra", valor: 15990, data: d(-25), status: "pago", categoriaId: cat("Internet e telefone"), pessoaId: net.id }),
      l({ tipo: "receita", descricao: "Projeto de integração", valor: 1200000, data: dia1, status: "pago", categoriaId: cat("Vendas e serviços"), pessoaId: cliente.id }),
      l({ tipo: "despesa", descricao: "Pró-labore", valor: 600000, data: dia1, status: "pago", categoriaId: cat("Folha e pró-labore") }),
      l({ tipo: "despesa", descricao: "Combustível", valor: 27500, data: d(-1), status: "pago", categoriaId: cat("Combustível"), contaId: caixa.id }),
      l({ tipo: "despesa", descricao: "DAS Simples Nacional", valor: 186040, data: d(-2), vencimento: d(-2), status: "pendente", categoriaId: cat("Impostos") }),
      l({ tipo: "despesa", descricao: "Internet fibra", valor: 15990, data: d(4), vencimento: d(4), status: "pendente", categoriaId: cat("Internet e telefone"), pessoaId: net.id }),
      l({ tipo: "receita", descricao: "Treinamento da equipe", valor: 350000, data: d(6), vencimento: d(6), status: "pendente", categoriaId: cat("Vendas e serviços"), pessoaId: joao.id }),
    ]);
  } else {
    const ana = p("Ana", "outro");
    await db.pessoas.bulkAdd([ana]);
    await db.lancamentos.bulkAdd([
      l({ tipo: "receita", descricao: "Salário", valor: 620000, data: dia1, status: "pago", categoriaId: cat("Salário") }),
      l({ tipo: "despesa", descricao: "Aluguel", valor: 180000, data: dia1, status: "pago", categoriaId: cat("Moradia") }),
      l({ tipo: "despesa", descricao: "Mercado do mês", valor: 74250, data: d(-20), status: "pago", categoriaId: cat("Mercado") }),
      l({ tipo: "despesa", descricao: "Jantar com amigos", valor: 21800, data: d(-6), status: "pago", categoriaId: cat("Restaurantes e delivery"),
        divisao: [{ pessoaId: ana.id, valor: 10900 }] }),
      l({ tipo: "despesa", descricao: "Combustível", valor: 25000, data: d(-3), status: "pago", categoriaId: cat("Transporte"), contaId: caixa.id }),
      l({ tipo: "despesa", descricao: "Streaming", valor: 5590, data: d(-2), status: "pago", categoriaId: cat("Assinaturas") }),
      l({ tipo: "despesa", descricao: "Cartão de crédito", valor: 143720, data: d(-1), vencimento: d(-1), status: "pendente", categoriaId: cat("Dívidas e empréstimos") }),
      l({ tipo: "despesa", descricao: "Conta de luz", valor: 18940, data: d(5), vencimento: d(5), status: "pendente", categoriaId: cat("Contas da casa") }),
      l({ tipo: "receita", descricao: "Ana me devolve o jantar", valor: 10900, data: d(3), vencimento: d(3), status: "pendente", categoriaId: cat("Renda extra"), pessoaId: ana.id }),
    ]);
  }
}

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
