import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import { temaDe, type TipoGrupo } from "./tema";

/**
 * Grupos (casal, irmãos, estudo, empresa…) e metas compartilhadas.
 * Vêm do servidor por funções (sem cópia no IndexedDB); a última resposta fica em cache no aparelho
 * para a tela abrir na hora e funcionar sem internet (só leitura).
 */
export interface MembroGrupo { user_id: string; nome: string; papel: "dono" | "membro"; desde: string }
export interface Grupo { id: string; nome: string; tipo: TipoGrupo; papel: "dono" | "membro"; criado_em: string; membros: MembroGrupo[] }
export interface AporteGrupo { id: string; user_id: string; nome: string; valor: number; data: string }
export interface MetaGrupo {
  espaco_id: string; id: string; nome: string; alvo: number; guardado: number; prazo?: string | null; icone: string; cor: string;
  grupo_id: string; dono_id: string; dono_nome: string; minha: boolean; aportes: AporteGrupo[];
}

export interface ConviteRecebido { codigo: string; de: string; grupo?: string | null; tipo?: TipoGrupo | null; expira_em: string }

const CACHE = "investmais:grupos:v1";
const CHAVE_PRINCIPAL = "investmais:grupoPrincipal";
const CHAVE_VISUAL = "investmais:visualDoGrupo";

type Estado = { grupos: Grupo[]; metas: MetaGrupo[]; convites: ConviteRecebido[]; carregado: boolean; erro?: string; principalId?: string; visual: boolean };
const ler = <T,>(k: string, p: T): T => { try { const v = localStorage.getItem(k); return v === null ? p : (JSON.parse(v) as T); } catch { return p; } };
const gravar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento: segue só em memória */ } };

const inicial = ler<{ grupos: Grupo[]; metas: MetaGrupo[] }>(CACHE, { grupos: [], metas: [] });
let estado: Estado = { ...inicial, convites: [], carregado: false, principalId: ler<string | undefined>(CHAVE_PRINCIPAL, undefined), visual: ler(CHAVE_VISUAL, true) };
const ouvintes = new Set<() => void>();
function mudar(p: Partial<Estado>) { estado = { ...estado, ...p }; ouvintes.forEach((f) => f()); }
export const useGruposEstado = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => estado);

const faltaMigracao = (m: string) => /meus_grupos|metas_do_grupo|criar_grupo|aportar_meta_grupo|schema cache|does not exist/i.test(m);
const erroAmigavel = (e: { message: string }) => new Error(faltaMigracao(e.message) ? "Falta atualizar o banco (migração 0008)." : e.message);

let carregando: Promise<void> | null = null;
/** Busca grupos e metas compartilhadas. Pode ser chamada à vontade: junta chamadas simultâneas. */
export function recarregarGrupos() {
  if (carregando) return carregando;
  carregando = (async () => {
    try {
      const [g, m, c] = await Promise.all([supabase.rpc("meus_grupos"), supabase.rpc("metas_do_grupo"), supabase.rpc("convites_para_mim")]);
      if (g.error) throw erroAmigavel(g.error);
      if (m.error) throw erroAmigavel(m.error);
      const grupos = (g.data ?? []) as Grupo[];
      const metas = ((m.data ?? []) as MetaGrupo[]).map((x) => ({ ...x, alvo: Number(x.alvo), guardado: Number(x.guardado), aportes: (x.aportes ?? []).map((a) => ({ ...a, valor: Number(a.valor) })) }));
      gravar(CACHE, { grupos, metas });
      mudar({ grupos, metas, convites: c.error ? [] : ((c.data ?? []) as ConviteRecebido[]), carregado: true, erro: undefined });
    } catch (e) {
      mudar({ carregado: true, erro: navigator.onLine ? String((e as Error)?.message ?? e) : undefined });
    } finally { carregando = null; }
  })();
  return carregando;
}

/** Carrega ao montar e de novo quando o app volta ao primeiro plano (pega o que a outra pessoa guardou). */
export function useGrupos() {
  const e = useGruposEstado();
  useEffect(() => {
    void recarregarGrupos();
    const voltar = () => { if (document.visibilityState === "visible") void recarregarGrupos(); };
    document.addEventListener("visibilitychange", voltar);
    const t = window.setInterval(() => void recarregarGrupos(), 60_000);
    return () => { document.removeEventListener("visibilitychange", voltar); window.clearInterval(t); };
  }, []);
  return e;
}

/** Grupo que define a temática: o escolhido, ou o primeiro com tipo definido, ou o primeiro. */
export function grupoPrincipal(e: Estado = estado): Grupo | undefined {
  return e.grupos.find((g) => g.id === e.principalId) ?? e.grupos.find((g) => g.tipo !== "outro") ?? e.grupos[0];
}
export function usarComoPrincipal(id: string) { gravar(CHAVE_PRINCIPAL, id); mudar({ principalId: id }); }
export function definirVisualDoGrupo(v: boolean) { gravar(CHAVE_VISUAL, v); mudar({ visual: v }); }

/** Tema ativo (do grupo principal) e os nomes de quem está com você nele. */
export function useTemaAtivo(meuId?: string) {
  const e = useGruposEstado();
  const g = grupoPrincipal(e);
  const outros = (g?.membros ?? []).filter((m) => m.user_id !== meuId).map((m) => m.nome.trim().split(/\s+/)[0]).filter(Boolean);
  const p = outros.length === 0 ? "vocês" : outros.length === 1 ? outros[0] : `${outros.slice(0, -1).join(", ")} e ${outros[outros.length - 1]}`;
  return { grupo: g, tema: g ? temaDe(g.tipo) : undefined, parceiros: p, visual: e.visual };
}

// ---------- Ações ----------
async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw erroAmigavel(error);
  return data as T;
}
export async function criarGrupo(nome: string, tipo: TipoGrupo) {
  const id = await rpc<string>("criar_grupo", { p_nome: nome, p_tipo: tipo });
  if (!estado.grupos.length) usarComoPrincipal(id);
  await recarregarGrupos();
  return id;
}
export async function atualizarGrupo(id: string, nome: string, tipo: TipoGrupo) { await rpc("atualizar_grupo", { p_grupo: id, p_nome: nome, p_tipo: tipo }); await recarregarGrupos(); }
export async function sairDoGrupo(id: string) { await rpc("sair_do_grupo", { p_grupo: id }); await recarregarGrupos(); }
export const gerarConviteDoGrupo = (id: string) => rpc<string>("gerar_convite_grupo", { p_grupo: id });
export async function guardarNaMetaDoGrupo(m: MetaGrupo, valor: number) { await rpc("aportar_meta_grupo", { p_espaco: m.espaco_id, p_meta: m.id, p_valor: Math.round(valor) }); await recarregarGrupos(); }
export async function removerAporteDoGrupo(id: string) { await rpc("remover_aporte_grupo", { p_id: id }); await recarregarGrupos(); }

/** Quanto os outros do grupo guardaram numa meta minha (somado ao meu "guardado" local). */
export function extrasDaMinhaMeta(metaId: string, metas: MetaGrupo[] = estado.metas) {
  const m = metas.find((x) => x.minha && x.id === metaId);
  return m ? m.aportes.reduce((a, x) => a + x.valor, 0) : 0;
}

// ---------- Convite para quem já tem conta ----------
/** Convida pelo e-mail da conta e avisa a pessoa por push. Devolve o nome e se o push chegou a algum aparelho. */
export async function convidarPorEmail(grupoId: string, email: string) {
  const r = await rpc<{ codigo: string; nome: string }>("convidar_por_email", { p_email: email.trim(), p_grupo: grupoId });
  let enviados = 0;
  try {
    const { data } = await supabase.auth.getSession();
    const resp = await fetch("/api/convite-push", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      body: JSON.stringify({ codigo: r.codigo }),
    });
    const j = (await resp.json().catch(() => ({}))) as { enviados?: number; jaAvisado?: boolean };
    enviados = j.jaAvisado ? -1 : (j.enviados ?? 0);
  } catch { /* sem push: o convite continua dentro do app dela */ }
  return { nome: r.nome, codigo: r.codigo, enviados };
}
export async function recusarConvite(codigo: string) { await rpc("recusar_convite", { p_codigo: codigo }); await recarregarGrupos(); }

/** Ao sair da conta: some com o cache (outra pessoa pode entrar neste aparelho). */
export function limparGruposLocais() {
  try { localStorage.removeItem(CACHE); localStorage.removeItem(CHAVE_PRINCIPAL); } catch { /* ignora */ }
  mudar({ grupos: [], metas: [], convites: [], carregado: false, principalId: undefined });
}
