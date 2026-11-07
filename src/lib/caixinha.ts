import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import { recarregarGrupos } from "./grupos";

/** Caixinha do grupo: conta bancária real do dono, onde o grupo deposita por Pix. O dinheiro nunca passa pelo app. */
export type StatusDeposito = "aguardando" | "pago" | "confirmado" | "cancelado";
export interface Deposito {
  id: string; user_id: string; nome: string; valor: number; txid: string; status: StatusDeposito;
  meta_espaco?: string | null; meta_id?: string | null; meta_nome?: string | null; confirmado_por?: "banco" | "manual" | null;
  criado_em: string; pago_em?: string | null; confirmado_em?: string | null;
}
export interface Caixinha {
  id: string; grupo_id: string; dono: string; sou_dono: boolean; nome: string; banco: string;
  chave_pix: string; recebedor: string; cidade: string; conectado: boolean; pluggy_item_id?: string | null;
  saldo?: number | null; saldo_em?: string | null; lido_em?: string | null; erro_leitura?: string | null;
  depositos: Deposito[];
}

const CACHE = "investmais:caixinhas:v1";
let estado: { caixinhas: Caixinha[]; carregado: boolean; erro?: string; lendo: boolean } = (() => {
  try { return { caixinhas: JSON.parse(localStorage.getItem(CACHE) ?? "[]") as Caixinha[], carregado: false, lendo: false }; }
  catch { return { caixinhas: [], carregado: false, lendo: false }; }
})();
const ouvintes = new Set<() => void>();
function mudar(p: Partial<typeof estado>) { estado = { ...estado, ...p }; ouvintes.forEach((f) => f()); }
export const useCaixinhasEstado = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => estado);

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw new Error(/minhas_caixinhas|salvar_caixinha|novo_deposito|schema cache|does not exist/i.test(error.message) ? "Falta atualizar o banco (migração 0009)." : error.message);
  return data as T;
}

export async function recarregarCaixinhas() {
  try {
    const lista = ((await rpc<Caixinha[]>("minhas_caixinhas")) ?? []).map((c) => ({
      ...c, saldo: c.saldo == null ? null : Number(c.saldo), depositos: (c.depositos ?? []).map((d) => ({ ...d, valor: Number(d.valor) })),
    }));
    try { localStorage.setItem(CACHE, JSON.stringify(lista)); } catch { /* ignora */ }
    mudar({ caixinhas: lista, carregado: true, erro: undefined });
  } catch (e) {
    mudar({ carregado: true, erro: navigator.onLine ? String((e as Error).message) : undefined });
  }
}

/** Pede ao servidor para ler saldo e extrato no banco (Open Finance) e confirmar os depósitos. */
export async function lerBanco(caixinhaId: string, forcar = false) {
  mudar({ lendo: true });
  try {
    const { data } = await supabase.auth.getSession();
    const r = await fetch("/api/caixinha", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      body: JSON.stringify({ caixinha: caixinhaId, forcar }),
    });
    const j = (await r.json().catch(() => ({}))) as { erro?: string; lido?: boolean; motivo?: string; confirmados?: number };
    await recarregarCaixinhas();
    if (j.confirmados) void recarregarGrupos();
    if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
    return j;
  } finally { mudar({ lendo: false }); }
}

/** Carrega ao abrir e pede uma leitura do banco (o servidor limita a 1 a cada 5 min). */
export function useCaixinhas() {
  const e = useCaixinhasEstado();
  useEffect(() => {
    void recarregarCaixinhas().then(() => {
      for (const c of estado.caixinhas) if (c.conectado) void lerBanco(c.id).catch(() => undefined);
    });
  }, []);
  return e;
}

export async function salvarCaixinha(grupoId: string, d: { nome: string; chave: string; recebedor: string; cidade: string; itemId: string }) {
  await rpc("salvar_caixinha", { p_grupo: grupoId, p_nome: d.nome, p_chave: d.chave, p_recebedor: d.recebedor, p_cidade: d.cidade, p_item: d.itemId });
  await recarregarCaixinhas();
}
export async function novoDeposito(caixinhaId: string, valorCentavos: number, meta?: { espaco: string; id: string }) {
  const r = await rpc<{ id: string; txid: string }>("novo_deposito", { p_caixinha: caixinhaId, p_valor: Math.round(valorCentavos), p_meta_espaco: meta?.espaco ?? null, p_meta_id: meta?.id ?? null });
  await recarregarCaixinhas();
  return r;
}
export async function marcarPago(id: string) { await rpc("marcar_deposito_pago", { p_id: id }); await Promise.all([recarregarCaixinhas(), recarregarGrupos()]); }
export async function confirmarDeposito(id: string) { await rpc("confirmar_deposito", { p_id: id }); await Promise.all([recarregarCaixinhas(), recarregarGrupos()]); }
export async function cancelarDeposito(id: string) { await rpc("cancelar_deposito", { p_id: id }); await Promise.all([recarregarCaixinhas(), recarregarGrupos()]); }

/** Saldo mostrado: o do banco (última leitura) + os "já paguei" que o banco ainda não mostrou. */
export function resumoCaixinha(c: Caixinha) {
  const aCaminho = c.depositos.filter((d) => d.status === "pago").reduce((a, d) => a + d.valor, 0);
  const confirmadosDepoisDaLeitura = c.saldo_em
    ? c.depositos.filter((d) => d.status === "confirmado" && d.confirmado_por === "manual" && d.confirmado_em && d.confirmado_em > c.saldo_em!).reduce((a, d) => a + d.valor, 0)
    : 0;
  const banco = c.saldo ?? null;
  return { banco, aCaminho: aCaminho + confirmadosDepoisDaLeitura, total: banco == null ? null : banco + aCaminho + confirmadosDepoisDaLeitura };
}

export function limparCaixinhasLocais() {
  try { localStorage.removeItem(CACHE); } catch { /* ignora */ }
  mudar({ caixinhas: [], carregado: false });
}
