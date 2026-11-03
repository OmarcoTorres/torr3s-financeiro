import type { Categoria, Conta, Lancamento, Pessoa } from "../db";
import { supabase } from "./supabase";
import { hoje, mesAtual, saldoPessoa, saldosContas, situacao, somarDias, totais, ultimosMeses } from "./calc";

/** Leitura de conta por foto e assistente: chamam as funções do servidor em /api. */

export interface ContaLida {
  tipo: "despesa" | "receita";
  descricao?: string;
  valor?: number; // reais
  vencimento?: string; // AAAA-MM-DD
  beneficiario?: string;
  linhaDigitavel?: string;
  categoria?: string;
}

export interface Proposta {
  tipo: "receita" | "despesa";
  descricao: string;
  valor: number; // reais
  data: string;
  vencimento?: string;
  status: "pago" | "pendente";
  categoria?: string;
  conta?: string;
  pessoa?: string;
}

async function chamar<T>(rota: string, corpo: unknown): Promise<T> {
  let r: Response;
  try {
    const { data } = await supabase.auth.getSession();
    r = await fetch(rota, { method: "POST", headers: { "Content-Type": "application/json", "X-Financeiro": "1", Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: JSON.stringify(corpo) });
  } catch {
    throw new Error("Sem conexão com o servidor. Verifique a internet.");
  }
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.erro || (r.status === 404 ? "As funções de IA só funcionam no endereço publicado na Vercel." : `Erro ${r.status}.`));
  return j as T;
}

/** Reduz a foto (máx. 1600 px, JPEG) para caber no limite do servidor e economizar. */
export async function comprimirImagem(arquivo: Blob, max = 1600): Promise<{ blob: Blob; base64: string }> {
  const bmp = await createImageBitmap(arquivo);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b!), "image/jpeg", 0.85));
  const base64 = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.readAsDataURL(blob); });
  return { blob, base64 };
}

export const lerConta = (base64: string, categorias: string[]) =>
  chamar<ContaLida>("/api/ler-conta", { imagem: base64, categorias, hoje: hoje() });

/** Resumo enxuto dos dados para o assistente: totais, pendências e lançamentos recentes, nunca o banco inteiro. */
export function resumoParaIA(d: { lanc: Lancamento[]; cats: Categoria[]; contas: Conta[]; pessoas: Pessoa[] }) {
  const h = hoje();
  const reais = (c: number) => Math.round(c) / 100;
  const cat = new Map(d.cats.map((c) => [c.id, c.nome]));
  const pes = new Map(d.pessoas.map((p) => [p.id, p.nome]));
  const con = new Map(d.contas.map((c) => [c.id, c.nome]));
  const saldos = saldosContas(d.contas, d.lanc, h);
  const meses = ultimosMeses(6).map((m) => {
    const doMes = d.lanc.filter((l) => l.data.startsWith(m));
    const t = totais(doMes);
    const porCat: Record<string, number> = {};
    for (const l of doMes) {
      if (l.tipo !== "despesa" || l.status !== "pago") continue;
      const nome = cat.get(l.categoriaId ?? "") ?? "Sem categoria";
      porCat[nome] = (porCat[nome] ?? 0) + l.valor;
    }
    const despesasPorCategoria = Object.fromEntries(Object.entries(porCat).map(([k, v]) => [k, reais(v)]));
    return { mes: m, entradas: reais(t.entradas), saidas: reais(t.saidas), despesasPorCategoria };
  });
  const linha = (l: Lancamento) =>
    [l.data, l.tipo, reais(l.valor), l.descricao, cat.get(l.categoriaId ?? "") ?? "", pes.get(l.pessoaId ?? "") ?? "", situacao(l, h), l.vencimento ?? ""].join("|");
  const pendentes = d.lanc.filter((l) => l.status === "pendente" && (l.vencimento ?? l.data) <= somarDias(h, 45))
    .sort((a, b) => (a.vencimento ?? a.data).localeCompare(b.vencimento ?? b.data)).slice(0, 60);
  const recentes = d.lanc.filter((l) => l.data >= somarDias(h, -120) && l.data <= h)
    .sort((a, b) => b.data.localeCompare(a.data)).slice(0, 200);
  return {
    hoje: h,
    mesAtual: mesAtual(),
    contas: d.contas.map((c) => ({ nome: c.nome, saldo: reais(saldos.get(c.id) ?? 0) })),
    categorias: d.cats.map((c) => `${c.nome} (${c.tipo})`),
    pessoas: d.pessoas.map((p) => { const s = saldoPessoa(p, d.lanc); return { nome: p.nome, tipo: p.tipo, aReceber: reais(s.aReceber), aPagar: reais(s.aPagar) }; }),
    ultimos6Meses: meses,
    formatoLinha: "data|tipo|valor_reais|descricao|categoria|pessoa|situacao|vencimento",
    pendentesProximos45Dias: pendentes.map(linha),
    lancamentosUltimos120Dias: recentes.map(linha),
    contasNomes: [...con.values()],
  };
}

export const perguntar = (pergunta: string, historico: { papel: "user" | "assistant"; texto: string }[], dados: unknown) =>
  chamar<{ texto: string; propostas: Proposta[] }>("/api/assistente", { pergunta, historico, dados });
