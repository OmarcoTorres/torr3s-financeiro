import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "./supabase";

/** Pedidos de Pix entre pessoas do grupo: o app registra e avisa; o Pix é feito no app do banco. */
export type StatusPedido = "pendente" | "feito" | "recusado" | "cancelado";
export interface PedidoPix {
  id: string; grupo_id: string; solicitante: string; solicitante_nome: string; responsavel: string; responsavel_nome: string;
  valor: number; chave: string; favorecido: string; motivo?: string | null; status: StatusPedido; resposta?: string | null;
  criado_em: string; respondido_em?: string | null; para_mim: boolean; meu: boolean;
}

let estado: { pedidos: PedidoPix[]; carregado: boolean; erro?: string } = { pedidos: [], carregado: false };
const ouvintes = new Set<() => void>();
function mudar(p: Partial<typeof estado>) { estado = { ...estado, ...p }; ouvintes.forEach((f) => f()); }
export const usePedidosEstado = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => estado);

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw new Error(/pedir_pix|pedidos_pix_meus|responder_pedido_pix|schema cache|does not exist/i.test(error.message) ? "Falta atualizar o banco (migração 0010)." : error.message);
  return data as T;
}

export async function recarregarPedidos() {
  try {
    const lista = ((await rpc<PedidoPix[]>("pedidos_pix_meus")) ?? []).map((p) => ({ ...p, valor: Number(p.valor) }));
    mudar({ pedidos: lista, carregado: true, erro: undefined });
  } catch (e) { mudar({ carregado: true, erro: navigator.onLine ? String((e as Error).message) : undefined }); }
}

/** Carrega ao abrir, ao voltar ao app e a cada minuto (pega pedido novo mesmo sem push). */
export function usePedidos() {
  const e = usePedidosEstado();
  useEffect(() => {
    void recarregarPedidos();
    const voltar = () => { if (document.visibilityState === "visible") void recarregarPedidos(); };
    document.addEventListener("visibilitychange", voltar);
    const t = window.setInterval(() => void recarregarPedidos(), 60_000);
    return () => { document.removeEventListener("visibilitychange", voltar); window.clearInterval(t); };
  }, []);
  return e;
}

/** Pede ao servidor o push deste pedido (novo → quem paga; resposta → quem pediu). Nunca trava a ação. */
async function avisar(id: string) {
  try {
    const { data } = await supabase.auth.getSession();
    const r = await fetch("/api/pedido-pix", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      body: JSON.stringify({ id }),
    });
    const j = (await r.json().catch(() => ({}))) as { enviados?: number };
    return j.enviados ?? 0;
  } catch { return 0; }
}

export async function pedirPix(d: { grupo: string; responsavel: string; valor: number; chave: string; favorecido: string; motivo: string }) {
  const id = await rpc<string>("pedir_pix", { p_grupo: d.grupo, p_responsavel: d.responsavel, p_valor: Math.round(d.valor), p_chave: d.chave, p_favorecido: d.favorecido, p_motivo: d.motivo });
  const enviados = await avisar(id);
  await recarregarPedidos();
  return enviados;
}
export async function responderPedido(id: string, status: "feito" | "recusado", resposta = "") {
  await rpc("responder_pedido_pix", { p_id: id, p_status: status, p_resposta: resposta });
  const enviados = await avisar(id);
  await recarregarPedidos();
  return enviados;
}
export async function cancelarPedido(id: string) { await rpc("cancelar_pedido_pix", { p_id: id }); await recarregarPedidos(); }

export function limparPedidosLocais() { mudar({ pedidos: [], carregado: false }); }
