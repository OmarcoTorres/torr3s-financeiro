import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "./supabase";

/**
 * Pix de cada conta: a chave para onde vão os depósitos de quem está logado (cada pessoa tem a sua).
 * Fica nos dados do usuário no login (user_metadata), então vale em qualquer aparelho; cópia local para abrir sem internet.
 */
export type ChavePix = { chave: string; recebedor: string; cidade: string };

const CACHE = "investmais:chavePix:v1";
type Estado = { userId?: string; chave: ChavePix | null; carregado: boolean };
let estado: Estado = { chave: null, carregado: false };
const ouvintes = new Set<() => void>();
function mudar(p: Partial<Estado>) { estado = { ...estado, ...p }; ouvintes.forEach((f) => f()); }

const valida = (c: unknown): c is ChavePix => !!c && typeof (c as ChavePix).chave === "string" && (c as ChavePix).chave.trim().length >= 3;

async function carregar() {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) { mudar({ userId: undefined, chave: null, carregado: true }); return; }
  let local: ChavePix | null = null;
  try { const c = JSON.parse(localStorage.getItem(`${CACHE}:${user.id}`) ?? "null"); if (valida(c)) local = c; } catch { /* sem cache */ }
  const doLogin = user.user_metadata?.pix_deposito;
  mudar({ userId: user.id, chave: valida(doLogin) ? doLogin : local, carregado: true });
  // Busca a versão mais nova do servidor (outro aparelho pode ter trocado a chave).
  try {
    const { data: u } = await supabase.auth.getUser();
    const atual = u.user?.user_metadata?.pix_deposito;
    if (valida(atual)) { mudar({ chave: atual }); localStorage.setItem(`${CACHE}:${user.id}`, JSON.stringify(atual)); }
  } catch { /* offline: fica com a cópia local */ }
}

/** [chave da conta (ou null se ainda não cadastrou), salvar, carregado] */
export function useChavePix(): [ChavePix | null, (c: ChavePix) => Promise<void>, boolean] {
  const e = useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => estado);
  useEffect(() => { if (!estado.carregado) void carregar(); }, []);
  return [e.chave, salvarChavePix, e.carregado];
}

export async function salvarChavePix(c: ChavePix) {
  const limpa = { chave: c.chave.trim(), recebedor: c.recebedor.trim(), cidade: (c.cidade || "SAO PAULO").trim() };
  if (limpa.chave.length < 3) throw new Error("Informe a chave Pix.");
  if (!limpa.recebedor) throw new Error("Informe o nome do titular da conta.");
  const { error } = await supabase.auth.updateUser({ data: { pix_deposito: limpa } });
  if (error) throw new Error(navigator.onLine ? error.message : "Sem internet: conecte-se para salvar o seu Pix.");
  try { if (estado.userId) localStorage.setItem(`${CACHE}:${estado.userId}`, JSON.stringify(limpa)); } catch { /* ignora */ }
  mudar({ chave: limpa });
}

/** Ao sair da conta: esquece a chave em memória (a próxima pessoa carrega a dela). */
export function limparChavePixLocal() { mudar({ userId: undefined, chave: null, carregado: false }); }
