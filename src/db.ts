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

const CATEGORIAS_PADRAO: Omit<Categoria, "id">[] = [
  { nome: "Vendas e serviços", tipo: "receita", cor: "#1f8a5b", icone: "briefcase" },
  { nome: "Outras receitas", tipo: "receita", cor: "#2c7da0", icone: "plus" },
  { nome: "Aluguel", tipo: "despesa", cor: "#8e5ad8", icone: "home" },
  { nome: "Folha e pró-labore", tipo: "despesa", cor: "#d0604a", icone: "users" },
  { nome: "Impostos", tipo: "despesa", cor: "#b23a48", icone: "landmark" },
  { nome: "Internet e telefone", tipo: "despesa", cor: "#3d7ea6", icone: "wifi" },
  { nome: "Energia e água", tipo: "despesa", cor: "#d89a1c", icone: "zap" },
  { nome: "Combustível", tipo: "despesa", cor: "#c2702b", icone: "fuel" },
  { nome: "Alimentação", tipo: "despesa", cor: "#5e9f3e", icone: "utensils" },
  { nome: "Software e assinaturas", tipo: "despesa", cor: "#4a5bd0", icone: "monitor" },
  { nome: "Outras despesas", tipo: "despesa", cor: "#6b7a74", icone: "tag" },
];

/** Categorias padrão e duas contas (principal e caixa). */
export async function criarPadroes(saldoPrincipal = 0, saldoCaixa = 0) {
  const cats = CATEGORIAS_PADRAO.map((c) => ({ ...c, id: novoId() }));
  await db.categorias.bulkAdd(cats);
  const principal: Conta = { id: novoId(), nome: "Conta principal", saldoInicial: saldoPrincipal, cor: "#0f3d2e" };
  const caixa: Conta = { id: novoId(), nome: "Caixa", saldoInicial: saldoCaixa, cor: "#c2702b" };
  await db.contas.bulkAdd([principal, caixa]);
  return { cats, principal, caixa };
}

/** Primeira abertura: categorias e contas padrão, mais dados de exemplo marcados. */
let preparando: Promise<void> | null = null;
export function prepararBanco() {
  // Uma vez só por sessão (o React em modo estrito chama os efeitos duas vezes).
  preparando ??= prepararUmaVez();
  return preparando;
}

async function prepararUmaVez() {
  await db.transaction("rw", [db.categorias, db.contas, db.pessoas, db.lancamentos, db.config], async () => {
    if (await db.config.get("preparado")) return;
    const { cats, principal, caixa } = await criarPadroes(1500000, 50000);

    const p = (nome: string, tipo: TipoPessoa): Pessoa => ({ id: novoId(), nome, tipo, exemplo: true });
    const joao = p("João Almeida (exemplo)", "cliente");
    const posto = p("Posto Central (exemplo)", "cliente");
    const net = p("NetFibra (exemplo)", "fornecedor");
    await db.pessoas.bulkAdd([joao, posto, net]);

    const cat = (n: string) => cats.find((c) => c.nome === n)!.id;
    const hoje = new Date();
    const d = (diasDesloc: number) => isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + diasDesloc));
    const l = (x: Partial<Lancamento> & Pick<Lancamento, "tipo" | "descricao" | "valor" | "data" | "status">): Lancamento => ({
      id: novoId(), contaId: principal.id, criadoEm: new Date().toISOString(), exemplo: true, ...x,
    });
    await db.lancamentos.bulkAdd([
      l({ tipo: "receita", descricao: "Consultoria mensal", valor: 850000, data: d(-30), status: "pago", categoriaId: cat("Vendas e serviços"), pessoaId: posto.id }),
      l({ tipo: "despesa", descricao: "Aluguel do escritório", valor: 280000, data: d(-28), status: "pago", categoriaId: cat("Aluguel") }),
      l({ tipo: "despesa", descricao: "Internet fibra", valor: 15990, data: d(-25), status: "pago", categoriaId: cat("Internet e telefone"), pessoaId: net.id }),
      l({ tipo: "despesa", descricao: "Combustível", valor: 32000, data: d(-20), status: "pago", categoriaId: cat("Combustível"), contaId: caixa.id }),
      l({ tipo: "receita", descricao: "Projeto de integração", valor: 1200000, data: d(-3), status: "pago", categoriaId: cat("Vendas e serviços"), pessoaId: posto.id }),
      l({ tipo: "despesa", descricao: "Pró-labore", valor: 600000, data: d(-2), status: "pago", categoriaId: cat("Folha e pró-labore") }),
      l({ tipo: "despesa", descricao: "Combustível", valor: 27500, data: d(-1), status: "pago", categoriaId: cat("Combustível"), contaId: caixa.id }),
      l({ tipo: "despesa", descricao: "Internet fibra", valor: 15990, data: d(4), vencimento: d(4), status: "pendente", categoriaId: cat("Internet e telefone"), pessoaId: net.id }),
      l({ tipo: "despesa", descricao: "DAS Simples Nacional", valor: 186040, data: d(-2), vencimento: d(-2), status: "pendente", categoriaId: cat("Impostos") }),
      l({ tipo: "receita", descricao: "Treinamento da equipe", valor: 350000, data: d(6), vencimento: d(6), status: "pendente", categoriaId: cat("Vendas e serviços"), pessoaId: joao.id }),
      l({ tipo: "despesa", descricao: "Energia", valor: 41230, data: d(9), vencimento: d(9), status: "pendente", categoriaId: cat("Energia e água") }),
      l({ tipo: "despesa", descricao: "Almoço com cliente", valor: 18600, data: d(-5), status: "pago", categoriaId: cat("Alimentação"), contaId: caixa.id,
        divisao: [{ pessoaId: joao.id, valor: 9300 }] }),
    ]);
    await db.config.put({ chave: "preparado", valor: true });
  });
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
