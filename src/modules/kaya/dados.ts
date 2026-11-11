import Dexie, { type EntityTable } from "dexie";
import { useSyncExternalStore } from "react";
import { supabase } from "../../lib/supabase";
import { cifrar, decifrar, desembrulharBruto, embrulhar, importarChave, normalizarCodigo, novaChaveDados, novoCodigoRecuperacao, type Embrulho } from "./cripto";
import type { ComId, Item } from "./tipos";

/**
 * Kaya Life — cofre local + sincronização cifrada.
 * IndexedDB por usuário ("kaya-<user>") guarda só blocos cifrados; o que está decifrado vive só na memória
 * enquanto o cofre está aberto. "Só neste aparelho" desliga a nuvem por completo.
 */
interface Bloco { id: string; iv: string; dados: string; pendente: 0 | 1; excluido: 0 | 1 }
interface Meta { chave: string; valor: unknown }
class BancoKaya extends Dexie {
  blocos!: EntityTable<Bloco, "id">;
  meta!: EntityTable<Meta, "chave">;
  constructor(nome: string) { super(nome); this.version(1).stores({ blocos: "id, pendente", meta: "chave" }); }
}

export type EstadoCofre = "carregando" | "novo" | "recuperar" | "bloqueado" | "aberto";
type Estado = { cofre: EstadoCofre; itens: ComId<Item>[]; soLocal: boolean; sync: "ok" | "enviando" | "offline" | "erro" | "local"; erro?: string; tentativas: number; esperaAte?: number };
let estado: Estado = { cofre: "carregando", itens: [], soLocal: false, sync: "ok", tentativas: 0 };
const ouvintes = new Set<() => void>();
function mudar(p: Partial<Estado>) { estado = { ...estado, ...p }; ouvintes.forEach((f) => f()); }
export const useKaya = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => estado);

let bd: BancoKaya | null = null;
let usuario = "";
let chave: CryptoKey | null = null;
const memoria = new Map<string, ComId<Item>>();
const aad = (id: string) => `${usuario}:${id}`;
const publicar = () => mudar({ itens: [...memoria.values()] });
const meta = async <T,>(k: string) => (await bd!.meta.get(k))?.valor as T | undefined;
const gravarMeta = (k: string, v: unknown) => bd!.meta.put({ chave: k, valor: v });

/** Abre o cofre do usuário neste aparelho e descobre em que passo ele está. */
export async function abrirCofre(userId: string) {
  if (bd && usuario === userId && estado.cofre !== "carregando") return;
  bloquear(); bd?.close();
  usuario = userId; bd = new BancoKaya(`kaya-${userId}`);
  const soLocal = !!(await meta<boolean>("soLocal"));
  const tentativas = (await meta<number>("tentativas")) ?? 0;
  if (await meta<Embrulho>("pin")) { mudar({ cofre: "bloqueado", soLocal, tentativas, sync: soLocal ? "local" : "ok" }); return; }
  let naNuvem = false;
  try { const { data } = await supabase.from("kaya_chaves").select("user_id").eq("user_id", userId).maybeSingle(); naNuvem = !!data; } catch { /* offline */ }
  mudar({ cofre: naNuvem ? "recuperar" : "novo", soLocal, tentativas });
}

/** Primeiro acesso: cria a chave, embrulha com o PIN (aparelho) e com o código de recuperação (nuvem). Devolve o código. */
export async function criarCofre(pin: string, soLocal: boolean) {
  const dk = novaChaveDados();
  try {
    const codigo = novoCodigoRecuperacao();
    const [ePin, eRec] = await Promise.all([embrulhar(dk, pin), embrulhar(dk, codigo)]);
    if (!soLocal) {
      const { error } = await supabase.from("kaya_chaves").upsert({ user_id: usuario, ...eRec });
      if (error) throw new Error(/kaya_chaves/.test(error.message) ? "Falta rodar a migração 0011 no Supabase." : error.message);
    }
    await gravarMeta("pin", ePin); await gravarMeta("recuperacao", eRec); await gravarMeta("soLocal", soLocal);
    chave = await importarChave(dk);
    await supabase.from("modulos_conta").upsert({ user_id: usuario, modulo: "kaya", ativo: true }).then(() => undefined, () => undefined);
    mudar({ cofre: "aberto", soLocal, sync: soLocal ? "local" : "ok" });
    return codigo;
  } finally { dk.fill(0); }
}

/** Abre com o PIN. 5 erros seguidos → espera crescente (30 s, 1 min, 2 min…). */
export async function desbloquear(pin: string) {
  if (estado.esperaAte && Date.now() < estado.esperaAte) throw new Error("Aguarde um pouco antes de tentar de novo.");
  const e = await meta<Embrulho>("pin");
  if (!e) throw new Error("Cofre não encontrado neste aparelho.");
  let dk: Uint8Array;
  try { dk = await desembrulharBruto(e, pin); }
  catch {
    const t = estado.tentativas + 1; await gravarMeta("tentativas", t);
    mudar({ tentativas: t, esperaAte: t >= 5 ? Date.now() + 30_000 * 2 ** Math.min(t - 5, 6) : undefined });
    throw new Error(t >= 5 ? "PIN incorreto. Aguarde para tentar de novo." : "PIN incorreto.");
  }
  try { chave = await importarChave(dk); } finally { dk.fill(0); }
  await gravarMeta("tentativas", 0);
  mudar({ tentativas: 0, esperaAte: undefined });
  await carregarTudo();
  mudar({ cofre: "aberto" });
  void sincronizar();
}

/** Aparelho novo ou PIN esquecido: o código de recuperação abre o cofre e um PIN novo é definido. */
export async function recuperar(codigo: string, novoPin: string) {
  let e = await meta<Embrulho>("recuperacao");
  if (!e) {
    const { data, error } = await supabase.from("kaya_chaves").select("*").eq("user_id", usuario).maybeSingle();
    if (error || !data) throw new Error("Não achei o cofre desta conta. Verifique a internet.");
    e = data as Embrulho;
  }
  const dk = await desembrulharBruto(e, normalizarCodigo(codigo)).catch(() => { throw new Error("Código de recuperação não confere."); });
  try {
    await gravarMeta("pin", await embrulhar(dk, novoPin)); await gravarMeta("recuperacao", e); await gravarMeta("tentativas", 0);
    chave = await importarChave(dk);
  } finally { dk.fill(0); }
  mudar({ cofre: "aberto", tentativas: 0, esperaAte: undefined });
  await carregarTudo();
  void sincronizar();
}

export async function trocarPin(atual: string, novo: string) {
  const e = await meta<Embrulho>("pin");
  const dk = await desembrulharBruto(e!, atual).catch(() => { throw new Error("PIN atual incorreto."); });
  try { await gravarMeta("pin", await embrulhar(dk, novo)); } finally { dk.fill(0); }
}

/** Esquece a chave e tudo que estava decifrado. */
export function bloquear() {
  chave = null; memoria.clear();
  if (estado.cofre === "aberto") mudar({ cofre: "bloqueado", itens: [] });
}

async function carregarTudo() {
  memoria.clear();
  for (const b of await bd!.blocos.toArray()) {
    if (b.excluido) continue;
    try { memoria.set(b.id, { ...(await decifrar<Item>(chave!, aad(b.id), b.iv, b.dados)), id: b.id }); } catch { console.warn("bloco ilegível", b.id); }
  }
  publicar();
}

export const ID_PERFIL = "perfil-kaya";
export async function salvar<T extends Item>(item: T, id: string = crypto.randomUUID()) {
  if (!chave) throw new Error("Cofre bloqueado.");
  const c = await cifrar(chave, aad(id), item);
  await bd!.blocos.put({ id, ...c, pendente: 1, excluido: 0 });
  memoria.set(id, { ...item, id } as ComId<Item>); publicar(); agendar();
  return id;
}
export async function excluir(id: string) {
  await bd!.blocos.update(id, { pendente: 1, excluido: 1, dados: "", iv: "AAAAAAAAAAAAAAAA" });
  memoria.delete(id); publicar(); agendar();
}

// ---------- Nuvem (só blocos cifrados) ----------
let relogio: number | undefined;
function agendar() { window.clearTimeout(relogio); relogio = window.setTimeout(() => void sincronizar(), 1500); }
let rodando = false;
export async function sincronizar() {
  if (!bd || !chave || rodando) return;
  if (estado.soLocal) { mudar({ sync: "local" }); return; }
  if (!navigator.onLine) { mudar({ sync: "offline" }); return; }
  rodando = true; mudar({ sync: "enviando" });
  try {
    const pend = await bd.blocos.where("pendente").equals(1).toArray();
    for (let i = 0; i < pend.length; i += 200) {
      const lote = pend.slice(i, i + 200).map((b) => ({ user_id: usuario, id: b.id, iv: b.iv, dados: b.dados, excluido: !!b.excluido }));
      const { error } = await supabase.from("kaya_itens").upsert(lote, { onConflict: "user_id,id" });
      if (error) throw error;
      await bd.transaction("rw", bd.blocos, async () => {
        for (const b of pend.slice(i, i + 200)) {
          const atual = await bd!.blocos.get(b.id);
          if (atual && atual.dados === b.dados && atual.excluido === b.excluido) {
            if (atual.excluido) await bd!.blocos.delete(b.id); else await bd!.blocos.update(b.id, { pendente: 0 });
          }
        }
      });
    }
    const desde = (await meta<string>("cursor")) ?? "1970-01-01T00:00:00Z";
    const margem = new Date(new Date(desde).getTime() - 5000).toISOString();
    const { data, error } = await supabase.from("kaya_itens").select("id,iv,dados,excluido,atualizado_em").eq("user_id", usuario).gt("atualizado_em", margem).order("atualizado_em").limit(5000);
    if (error) throw error;
    let mudou = false;
    for (const r of data ?? []) {
      const local = await bd.blocos.get(r.id);
      if (local?.pendente) continue;
      if (r.excluido) { if (local) { await bd.blocos.delete(r.id); memoria.delete(r.id); mudou = true; } continue; }
      if (local && local.dados === r.dados) continue;
      await bd.blocos.put({ id: r.id, iv: r.iv, dados: r.dados, pendente: 0, excluido: 0 });
      try { memoria.set(r.id, { ...(await decifrar<Item>(chave, aad(r.id), r.iv, r.dados)), id: r.id }); mudou = true; } catch { /* outra chave? ignora */ }
    }
    if (data?.length) await gravarMeta("cursor", data[data.length - 1].atualizado_em);
    if (mudou) publicar();
    mudar({ sync: "ok", erro: undefined });
  } catch (e) {
    mudar({ sync: navigator.onLine ? "erro" : "offline", erro: String((e as Error)?.message ?? e).slice(0, 160) });
  } finally { rodando = false; }
}

/** Liga/desliga a nuvem. Ao desligar, apaga da nuvem os blocos e o cofre desta conta. */
export async function definirSoLocal(v: boolean) {
  if (v) {
    const { error } = await supabase.rpc("kaya_excluir_tudo");
    if (error) throw new Error(error.message);
    await bd!.blocos.toCollection().modify({ pendente: 1 });
    await bd!.meta.delete("cursor");
  } else {
    const e = await meta<Embrulho>("recuperacao");
    if (e) { const { error } = await supabase.from("kaya_chaves").upsert({ user_id: usuario, ...e }); if (error) throw new Error(error.message); }
    await bd!.blocos.toCollection().modify({ pendente: 1 });
  }
  await gravarMeta("soLocal", v); mudar({ soLocal: v, sync: v ? "local" : "ok" });
  if (!v) void sincronizar();
}

/** Exclui TUDO do Kaya Life: nuvem e este aparelho. Sem volta. */
export async function excluirTudo() {
  const { error } = await supabase.rpc("kaya_excluir_tudo");
  if (error && navigator.onLine) throw new Error(error.message);
  const nome = bd!.name; bloquear(); bd!.close(); await Dexie.delete(nome); bd = null;
  mudar({ cofre: "novo", itens: [], soLocal: false });
  if (usuario) await abrirCofre(usuario);
}

/** Cópia legível (JSON) — a pessoa leva os próprios dados. Avisar que o arquivo NÃO é cifrado. */
export function exportar() {
  const blob = new Blob([JSON.stringify({ app: "kaya-life", geradoEm: new Date().toISOString(), itens: [...memoria.values()] }, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `kaya-life-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Bloqueio automático: 2 min em segundo plano ou 10 min sem toque. */
let saiuEm = 0, ultimoToque = Date.now();
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saiuEm = Date.now();
    else if (saiuEm && Date.now() - saiuEm > 120_000) bloquear();
    else void sincronizar();
  });
  for (const ev of ["pointerdown", "keydown"]) document.addEventListener(ev, () => { ultimoToque = Date.now(); }, { passive: true });
  setInterval(() => { if (estado.cofre === "aberto" && Date.now() - ultimoToque > 600_000) bloquear(); }, 30_000);
  window.addEventListener("online", () => void sincronizar());
}
